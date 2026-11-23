'use strict';
const crypto = require('node:crypto');
const express = require('express');
const nodemailer = require('nodemailer');
const config = require('./lib/env');
const { db, init, hashPassword, verifyPassword, nextBookingCode, removeExamples } = require('./lib/db');
const { translator, areas } = require('./lib/i18n');
const {
  esc, fmtDate, minutes, slotAvailable, hoursBetween, digitsPhone,
  operatorWaLink, ownerRequestMessage, parsePhotos, safeUrl
} = require('./lib/helpers');
const V = require('./lib/views');
const O = require('./lib/views-owner');
const SEO = require('./lib/seo');
const STRIPE = require('./lib/stripe');

init();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

// Basic hardening headers for every response, including static files.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// ---------- helpers ----------
function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      const k = part.slice(0, i).trim();
      const v = part.slice(i + 1).trim();
      try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
    }
  }
  return out;
}
function setCookie(res, name, value, opts = {}) {
  let s = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
  if (opts.httpOnly) s += '; HttpOnly';
  if (opts.maxAge) s += `; Max-Age=${opts.maxAge}`;
  if (opts.secure) s += '; Secure';
  const prev = res.getHeader('Set-Cookie');
  const list = prev ? (Array.isArray(prev) ? prev : [prev]) : [];
  res.setHeader('Set-Cookie', [...list, s]);
}
function clearCookie(res, name, secure) {
  const prev = res.getHeader('Set-Cookie');
  const list = prev ? (Array.isArray(prev) ? prev : [prev]) : [];
  res.setHeader('Set-Cookie', [...list, `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure ? '; Secure' : ''}`]);
}
function userFor(req) {
  const token = req.cookies.pt_session;
  if (!token) return null;
  return db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token) || null;
}
function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token, user_id) VALUES(?, ?)').run(token, userId);
  setCookie(res, 'pt_session', token, { httpOnly: true, secure: !!req.secure, maxAge: 60 * 60 * 24 * 30 });
}

// Stop password guessing on a single account without locking out other users.
// In-memory only, so attempts clear on restart — enough for a pilot service.
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
function loginThrottleKey(req, identity) { return `${req.ip || '?'}|${identity}`; }
function isLoginThrottled(key) {
  const now = Date.now();
  const rec = loginAttempts.get(key);
  if (!rec || now - rec.start > LOGIN_WINDOW_MS) return false;
  return rec.count >= LOGIN_MAX_FAILURES;
}
function noteLoginFailure(key) {
  const now = Date.now();
  const rec = loginAttempts.get(key);
  if (!rec || now - rec.start > LOGIN_WINDOW_MS) loginAttempts.set(key, { start: now, count: 1 });
  else rec.count += 1;
}
function clearLoginFailures(key) { loginAttempts.delete(key); }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function validTime(s) { return minutes(s) >= 0; }
function safeNext(next) { return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'; }
function cleanQuery(q) {
  return {
    area: areas.includes(q.area) ? q.area : '',
    date: validDate(q.date) ? q.date : todayStr(),
    from: validTime(q.from) ? q.from : '09:00',
    until: validTime(q.until) ? q.until : '18:00'
  };
}
function render(req, res, body, title, section, seoOpts = {}) {
  const seo = SEO.meta({
    lang: req.lang,
    title: seoOpts.title || `${title || 'ParkTrieste'} · ParkTrieste`,
    description: seoOpts.description || req.t('brand_tag'),
    path: seoOpts.path || req.path,
    image: seoOpts.image || '',
    type: seoOpts.type || 'website',
    noindex: seoOpts.noindex !== undefined ? seoOpts.noindex : section === 'own',
    robots: seoOpts.robots || '',
    jsonLd: seoOpts.jsonLd || null,
    baseUrl: SEO.requestBaseUrl(req)
  });
  res.type('html').send(V.layout({
    t: req.t, lang: req.lang, title: title || 'ParkTrieste', body,
    user: req.user, section: section || 'need',
    nextUrl: req.originalUrl, seo
  }));
}
function err(req, res, message, status = 400) {
  res.status(status);
  render(req, res, V.errorPage({ t: req.t, message }), 'Errore', 'need', { noindex: true });
}
function requireUser(req, res, role) {
  if (!req.user) { res.redirect(role === 'admin' ? '/owner' : '/owner'); return false; }
  if (role && req.user.role !== role) { err(req, res, 'Non autorizzato / Not allowed', 403); return false; }
  return true;
}
const listingSelect = `
  SELECT l.*, u.name AS owner_name, u.phone AS owner_phone,
    (SELECT AVG(r.rating) FROM reviews r JOIN bookings rb ON rb.id = r.booking_id WHERE rb.listing_id = l.id) AS rating,
    (SELECT COUNT(*) FROM reviews r2 JOIN bookings rb2 ON rb2.id = r2.booking_id WHERE rb2.listing_id = l.id) AS review_count
  FROM listings l JOIN users u ON u.id = l.owner_id`;

async function sendOwnerEmail(owner, subject, text) {
  if (!config.smtp.host || !owner || !owner.email) return;
  try {
    const transport = nodemailer.createTransport({
      host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined
    });
    await transport.sendMail({ from: config.smtp.from, to: owner.email, subject, text });
  } catch (e) { console.error('Email notification failed:', e.message); }
}

// ---------- Stripe webhook (raw body, before json parser) ----------
function markBookingPayment(ref, obj, status) {
  const code = ref || (obj && obj.metadata && obj.metadata.booking_code);
  if (!code) return false;
  const b = db.prepare('SELECT id FROM bookings WHERE code = ?').get(String(code));
  if (!b) return false;
  const paid = status === 'paid' ? 1 : 0;
  const pi = obj && obj.payment_intent ? String(obj.payment_intent) : null;
  db.prepare(`INSERT INTO payments(booking_id, fee_paid, stripe_reference, payment_intent_id, status, updated_at)
              VALUES(?, ?, ?, ?, ?, datetime('now'))
              ON CONFLICT(booking_id) DO UPDATE SET
                fee_paid = excluded.fee_paid,
                stripe_reference = COALESCE(excluded.stripe_reference, payments.stripe_reference),
                payment_intent_id = COALESCE(excluded.payment_intent_id, payments.payment_intent_id),
                status = excluded.status,
                updated_at = datetime('now')`)
    .run(b.id, paid, pi || 'stripe_webhook', pi, status);
  return true;
}

app.post('/webhook/stripe', express.raw({ type: '*/*' }), (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const sig = String(req.headers['stripe-signature'] || '');
  let event;

  if (STRIPE.enabled() && config.stripeWebhookSecret) {
    try {
      event = STRIPE.constructEvent(raw, sig);
    } catch (e) {
      console.error('Stripe webhook signature failed:', e.message);
      return res.status(400).send('invalid signature');
    }
  } else {
    // Pilot mode: only a shared secret is available; keep the legacy HMAC check.
    if (config.stripeWebhookSecret) {
      const parts = Object.fromEntries(sig.split(',').map(p => p.split('=')).filter(p => p.length === 2));
      const expected = crypto.createHmac('sha256', config.stripeWebhookSecret).update(parts.t + '.' + raw.toString('utf8')).digest('hex');
      const given = parts.v1 || '';
      if (expected.length !== given.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) {
        return res.status(400).send('invalid signature');
      }
    }
    try { event = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).send('bad json'); }
  }

  // Idempotency: Stripe retries events; never apply the same one twice.
  try {
    db.prepare('INSERT OR IGNORE INTO stripe_events(id, type) VALUES(?, ?)').run(String(event.id || ''), String(event.type || ''));
  } catch { return res.sendStatus(200); }

  const obj = (event.data && event.data.object) || {};
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    if (obj.payment_status === 'paid' || event.type === 'checkout.session.async_payment_succeeded') {
      markBookingPayment(obj.client_reference_id, obj, 'paid');
    }
  } else if (event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired') {
    markBookingPayment(obj.client_reference_id, obj, 'unpaid');
  } else if (event.type === 'charge.refunded') {
    const pi = obj.payment_intent;
    const row = pi ? db.prepare('SELECT booking_id FROM payments WHERE payment_intent_id = ?').get(String(pi)) : null;
    if (row) db.prepare("UPDATE payments SET fee_paid = 0, status = 'refunded', updated_at = datetime('now') WHERE booking_id = ?").run(row.booking_id);
  } else if (event.type === 'account.updated' && event.account) {
    db.prepare('UPDATE users SET stripe_payouts_enabled = ? WHERE stripe_account_id = ?')
      .run(obj.payouts_enabled ? 1 : 0, String(event.account));
  }
  res.sendStatus(200);
});

// ---------- global middleware ----------
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static('public', { maxAge: '1h' }));
app.use((req, res, next) => {
  req.cookies = parseCookies(req.headers.cookie);
  const langParam = req.query.lang === 'en' || req.query.lang === 'it' ? req.query.lang : null;
  req.lang = langParam || (req.cookies.pt_lang === 'en' ? 'en' : 'it');
  req.t = translator(req.lang);
  req.user = userFor(req);
  next();
});

// ---------- SEO discovery ----------
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /set-lang',
    'Disallow: /owner',
    'Disallow: /admin',
    'Disallow: /booking/',
    'Disallow: /spaces/',
    'Disallow: /webhook/',
    'Disallow: /logout',
    `Sitemap: ${SEO.absolute('/sitemap.xml', SEO.requestBaseUrl(req))}`,
    ''
  ].join('\n'));
});

app.get('/sitemap.xml', (req, res) => {
  const xmlEsc = s => String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const lastmod = value => {
    const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(String(value || ''));
    return m ? `${m[1]}T${m[2]}:00Z` : '';
  };
  const base = SEO.requestBaseUrl(req);
  const entry = (path, priority, changefreq, modified = '') =>
    `  <url>\n    <loc>${xmlEsc(SEO.absolute(path, base))}</loc>${modified ? `\n    <lastmod>${modified}</lastmod>` : ''}\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  const urls = [
    entry('/', '1.0', 'daily'),
    ...SEO.AREAS.map(a => entry(`/parcheggi/${a.slug}`, '0.8', 'weekly')),
    entry('/legal/terms', '0.3', 'yearly'),
    entry('/legal/privacy', '0.3', 'yearly'),
    entry('/legal/cancellation', '0.3', 'yearly')
  ];
  const listings = db.prepare("SELECT id, created_at FROM listings WHERE status = 'approved' AND is_example = 0 ORDER BY id").all();
  for (const l of listings) urls.push(entry(`/space/${l.id}`, '0.6', 'weekly', lastmod(l.created_at)));
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
});

// ---------- driver ----------
app.get('/', (req, res) => {
  const q = cleanQuery(req.query);
  const desc = req.lang === 'en'
    ? 'Trieste parking app: find and book parking in Trieste. Search by area, check availability and send a free request to the owner — no account needed.'
    : 'Parcheggio a Trieste: trova e prenota il tuo posto auto. Cerca per zona, controlla la disponibilità e invia una richiesta gratuita al proprietario, senza account.';
  const baseUrl = SEO.requestBaseUrl(req);
  render(req, res, V.home({ t: req.t, q }), 'ParkTrieste', 'need', {
    title: req.lang === 'en' ? 'Parking in Trieste — Book in a minute | ParkTrieste' : 'Parcheggi a Trieste — Prenota in un minuto | ParkTrieste',
    description: desc,
    path: '/',
    image: '/hero-trieste.jpg',
    jsonLd: [
      SEO.websiteSchema(desc, baseUrl),
      SEO.faqSchema([
        { q: req.t('seo_faq_q1'), a: req.t('seo_faq_a1') },
        { q: req.t('seo_faq_q2'), a: req.t('seo_faq_a2') }
      ])
    ]
  });
});

// Crawlable neighbourhood landing pages.
app.get('/parcheggi/:slug', (req, res) => {
  const info = SEO.areaBySlug(req.params.slug);
  if (!info) return err(req, res, '404', 404);
  const q = cleanQuery(req.query);
  const listings = db.prepare(listingSelect + " WHERE l.status = 'approved' AND l.area = ? ORDER BY l.id").all(info.area);
  const text = info[req.lang === 'en' ? 'en' : 'it'];
  render(req, res, V.areaPage({ t: req.t, lang: req.lang, info, listings, q }), text.title, 'need', {
    title: `${text.title} | ParkTrieste`,
    description: text.description,
    path: `/parcheggi/${info.slug}`,
    jsonLd: SEO.breadcrumbSchema([
      { name: 'ParkTrieste', path: '/' },
      { name: text.title, path: `/parcheggi/${info.slug}` }
    ], SEO.requestBaseUrl(req))
  });
});

app.get('/set-lang', (req, res) => {
  const lang = req.query.lang === 'en' ? 'en' : 'it';
  setCookie(res, 'pt_lang', lang, { maxAge: 60 * 60 * 24 * 365 });
  res.redirect(safeNext(req.query.next));
});

app.get('/results', (req, res) => {
  const q = cleanQuery(req.query);
  const rows = db.prepare(listingSelect + " WHERE l.status = 'approved'").all();
  const listings = rows.filter(l => {
    if (q.area && l.area !== q.area) return false;
    const av = db.prepare('SELECT "start" AS start_time, "end" AS end_time FROM availability WHERE listing_id = ? AND weekday = ?').get(l.id, require('./lib/helpers').weekdayOf(q.date));
    if (!av) return false;
    if (minutes(q.from) < minutes(av.start_time) || minutes(q.until) > minutes(av.end_time)) return false;
    return slotAvailable(l.id, q.date, q.from, q.until);
  });
  listings.forEach(l => { l.date = q.date; l.from = q.from; l.until = q.until; });
  // Search results depend on date/time, so keep them out of the index but let crawlers follow the links.
  render(req, res, V.results({ t: req.t, listings, q }), req.t('results_title'), 'need', {
    robots: 'noindex,follow',
    path: '/results'
  });
});

app.get('/space/:id', (req, res) => {
  const row = db.prepare(listingSelect + ' WHERE l.id = ?').get(req.params.id);
  if (!row || row.status !== 'approved') return err(req, res, 'Annuncio non disponibile / Listing not available', 404);
  const reviews = db.prepare(`SELECT r.* FROM reviews r JOIN bookings b ON b.id = r.booking_id WHERE b.listing_id = ? ORDER BY r.id DESC`).all(row.id);
  const q = cleanQuery(req.query);
  const photos = parsePhotos(row.photos).map(safeUrl).filter(Boolean);
  const description = (row.notes || (req.lang === 'en'
    ? `Parking space in ${row.area}, Trieste, available to book on ParkTrieste.`
    : `Posto auto prenotabile a ${row.area}, Trieste, su ParkTrieste.`)).slice(0, 300);
  render(req, res, V.spacePage({ t: req.t, listing: row, q, rating: row.rating || 0, reviews }), row.name, 'need', {
    noindex: !!row.is_example,
    title: `${row.name} — ${req.lang === 'en' ? 'Parking in' : 'Parcheggio a'} ${row.area}, Trieste | ParkTrieste`,
    description,
    path: `/space/${row.id}`,
    image: photos[0] || '',
    jsonLd: [
      SEO.listingSchema(row, photos[0] || '', SEO.requestBaseUrl(req)),
      SEO.breadcrumbSchema([
        { name: 'ParkTrieste', path: '/' },
        { name: row.area, path: `/parcheggi/${(SEO.AREAS.find(a => a.area === row.area) || {}).slug || 'centro'}` },
        { name: row.name, path: `/space/${row.id}` }
      ], SEO.requestBaseUrl(req))
    ]
  });
});

app.post('/spaces/:id/request', (req, res) => {
  const listing = db.prepare("SELECT * FROM listings WHERE id = ? AND status = 'approved'").get(req.params.id);
  if (!listing) return err(req, res, 'Annuncio non disponibile / Listing not available', 404);
  const { date, from, until } = req.body;
  const driverName = String(req.body.driver_name || '').trim();
  const driverPhone = String(req.body.driver_phone || '').trim();
  if (!validDate(date) || !validTime(from) || !validTime(until) || minutes(until) <= minutes(from) || !driverName || digitsPhone(driverPhone).length < 6) {
    return err(req, res, req.t('required'));
  }
  if (!slotAvailable(listing.id, date, from, until)) {
    return err(req, res, req.lang === 'it' ? 'Questo orario non è più disponibile.' : 'This time slot is no longer available.');
  }
  const code = nextBookingCode();
  const price = Number(listing.price_hour) * hoursBetween(from, until);
  const result = db.prepare(`INSERT INTO bookings(code, listing_id, driver_name, driver_phone, date, "start", "end", price, fee, status)
                             VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, 'requested')`)
    .run(code, listing.id, driverName, driverPhone, date, from, until, price);
  const bookingId = Number(result.lastInsertRowid);
  db.prepare('INSERT INTO payments(booking_id, fee_paid) VALUES(?, 0)').run(bookingId);
  const booking = { code, id: bookingId, date, start: from, end: until, driver_name: driverName, driver_phone: driverPhone, price };
  const msg = ownerRequestMessage(req.t, booking, listing);
  const owner = db.prepare('SELECT * FROM users WHERE id = ?').get(listing.owner_id);
  const wa = operatorWaLink(msg);
  db.prepare('INSERT INTO notifications(owner_id, booking_id, channel, message) VALUES(?, ?, ?, ?)')
    .run(listing.owner_id, bookingId, 'whatsapp', msg + '\n' + wa);
  sendOwnerEmail(owner, `ParkTrieste ${code} — ${req.t('requests')}`, msg + '\n' + wa);
  res.redirect('/booking/' + encodeURIComponent(code));
});

app.get('/booking/:code', (req, res) => {
  const b = db.prepare('SELECT * FROM bookings WHERE code = ?').get(req.params.code);
  if (!b) return err(req, res, 'Prenotazione non trovata / Booking not found', 404);
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(b.listing_id);
  const owner = db.prepare('SELECT stripe_account_id FROM users WHERE id = ?').get(listing.owner_id);
  const payment = db.prepare('SELECT fee_paid, status FROM payments WHERE booking_id = ?').get(b.id);
  render(req, res, V.confirmation({
    t: req.t,
    booking: b,
    listing,
    paid: !!payment?.fee_paid,
    canCheckout: STRIPE.enabled() && !!owner?.stripe_account_id && b.status === 'confirmed',
    payError: req.query.payerror === '1'
  }), b.code, 'need', {
    noindex: true,
    path: `/booking/${b.code}`
  });
});

// Driver pays the parking fee through the owner's connected account.
// ParkTrieste takes a fixed EUR 1 application fee on the payment.
app.post('/booking/:code/pay', async (req, res) => {
  const b = db.prepare('SELECT * FROM bookings WHERE code = ?').get(req.params.code);
  if (!b) return err(req, res, 'Prenotazione non trovata / Booking not found', 404);
  if (b.status !== 'confirmed') return res.redirect(`/booking/${encodeURIComponent(b.code)}`);

  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(b.listing_id);
  const owner = db.prepare('SELECT * FROM users WHERE id = ?').get(listing.owner_id);

  if (STRIPE.enabled() && owner?.stripe_account_id) {
    try {
      const session = await STRIPE.createBookingCheckout({
        booking: b, listing, owner, baseUrl: SEO.requestBaseUrl(req)
      });
      db.prepare(`INSERT INTO payments(booking_id, fee_paid, checkout_session_id, status)
                  VALUES(?, 0, ?, 'pending')
                  ON CONFLICT(booking_id) DO UPDATE SET checkout_session_id = excluded.checkout_session_id,
                    status = 'pending', updated_at = datetime('now')`)
        .run(b.id, session.id);
      return res.redirect(session.url);
    } catch (e) {
      console.error('Stripe checkout failed:', e.message);
    }
  }

  // Pilot fallback: existing Payment Link, or manual marking in /admin.
  if (config.stripePaymentLink) {
    const sep = config.stripePaymentLink.includes('?') ? '&' : '?';
    return res.redirect(`${config.stripePaymentLink}${sep}client_reference_id=${encodeURIComponent(b.code)}`);
  }
  return res.redirect(`/booking/${encodeURIComponent(b.code)}?payerror=1`);
});

app.post('/spaces/:id/report', (req, res) => {
  const reason = String(req.body.reason || '').slice(0, 120);
  const detail = String(req.body.detail || '').slice(0, 1000);
  db.prepare('INSERT INTO reports(listing_id, reason, detail) VALUES(?, ?, ?)').run(req.params.id, reason, detail);
  res.redirect('/space/' + req.params.id + '?reported=1');
});

// ---------- legal ----------
app.get('/legal/:page', (req, res) => {
  if (!['terms', 'privacy', 'cancellation'].includes(req.params.page)) return err(req, res, 'Not found', 404);
  const key = req.params.page;
  const label = req.t(key === 'terms' ? 'terms' : key === 'privacy' ? 'privacy' : 'cancellation');
  const bodyText = String(req.t(key + '_body') || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  render(req, res, V.legal({ t: req.t, page: key }), label, 'need', {
    title: `${label} | ParkTrieste`,
    description: bodyText,
    path: `/legal/${key}`
  });
});

// ---------- owner ----------
app.get('/owner', (req, res) => {
  if (!req.user) return render(req, res, O.ownerAuth({ t: req.t, lang: req.lang, mode: req.query.mode === 'register' ? 'register' : 'login', values: {} }), req.t('login'), 'own');
  if (req.user.role === 'admin') return res.redirect('/admin');
  if (!req.user.phone_verified) return render(req, res, O.ownerAuth({ t: req.t, lang: req.lang, mode: 'verify', demoCode: req.user.verify_code }), req.t('verify_title'), 'own');

  const spaces = db.prepare('SELECT * FROM listings WHERE owner_id = ? ORDER BY id DESC').all(req.user.id);
  const requests = db.prepare(`SELECT b.*, l.name AS listing_name FROM bookings b JOIN listings l ON l.id = b.listing_id
                               WHERE l.owner_id = ? ORDER BY b.id DESC`).all(req.user.id);
  const earnings = db.prepare(`SELECT COALESCE(SUM(price),0) AS total, COUNT(*) AS count FROM bookings
                               WHERE status = 'confirmed' AND listing_id IN (SELECT id FROM listings WHERE owner_id = ?)`).get(req.user.id);
  const blockedMap = {};
  for (const s of spaces) {
    const row = db.prepare("SELECT blocked_dates FROM availability WHERE listing_id = ? LIMIT 1").get(s.id);
    try { blockedMap[s.id] = JSON.parse(row?.blocked_dates || '[]'); } catch { blockedMap[s.id] = []; }
  }
  render(req, res, O.ownerDashboard({
    t: req.t, user: req.user, spaces, requests, earnings, blockedMap,
    stripeEnabled: STRIPE.enabled(), stripeNotice: req.query.stripe || ''
  }), req.t('dash_title'), 'own');
});

// ---------- Stripe Connect: owner onboarding (Express, direct charges) ----------
app.post('/owner/connect', async (req, res) => {
  if (!requireUser(req, res, 'owner')) return;
  if (!req.user.phone_verified) return res.redirect('/owner');
  if (!STRIPE.enabled()) return res.redirect('/owner?stripe=unavailable');

  try {
    let accountId = req.user.stripe_account_id;
    if (!accountId) {
      const account = await STRIPE.createExpressAccount(req.user);
      accountId = account.id;
      db.prepare('UPDATE users SET stripe_account_id = ? WHERE id = ?').run(accountId, req.user.id);
    }
    const link = await STRIPE.createOnboardingLink(accountId, SEO.requestBaseUrl(req));
    return res.redirect(link.url);
  } catch (e) {
    console.error('Stripe Connect onboarding failed:', e.message);
    return res.redirect('/owner?stripe=error');
  }
});

app.get('/owner/connect/return', async (req, res) => {
  if (!requireUser(req, res, 'owner')) return;
  if (req.user.stripe_account_id) {
    try {
      const st = await STRIPE.accountStatus(req.user.stripe_account_id);
      db.prepare('UPDATE users SET stripe_payouts_enabled = ? WHERE id = ?')
        .run(st.payoutsEnabled ? 1 : 0, req.user.id);
    } catch (e) { console.error('Stripe account status failed:', e.message); }
  }
  res.redirect('/owner?stripe=returned');
});

app.post('/owner/register', (req, res) => {
  const identity = String(req.body.identity || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').trim();
  const name = String(req.body.name || '').trim();
  const password = String(req.body.password || '');
  const isEmail = identity.includes('@');
  if (!name || !identity || digitsPhone(phone).length < 6 || password.length < 6) {
    return render(req, res, O.ownerAuth({ t: req.t, lang: req.lang, mode: 'register', values: req.body, error: req.t('required') }), req.t('register'), 'own');
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR phone = ?').get(isEmail ? identity : null, isEmail ? null : identity);
  if (existing) {
    return render(req, res, O.ownerAuth({ t: req.t, lang: req.lang, mode: 'register', values: req.body, error: req.lang === 'it' ? 'Account già esistente.' : 'Account already exists.' }), req.t('register'), 'own');
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const result = db.prepare(`INSERT INTO users(role, name, phone, email, password_hash, phone_verified, verify_code)
                             VALUES('owner', ?, ?, ?, ?, 0, ?)`)
    .run(name, phone, isEmail ? identity : null, hashPassword(password), code);
  startSession(req, res, Number(result.lastInsertRowid));
  res.redirect('/owner');
});

app.post('/owner/login', (req, res) => {
  const identity = String(req.body.identity || '').trim().toLowerCase();
  const throttleKey = loginThrottleKey(req, identity);
  if (isLoginThrottled(throttleKey)) {
    return err(req, res, req.t('login_throttled'), 429);
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ? OR phone = ?').get(identity, identity);
  if (!user || !verifyPassword(req.body.password || '', user.password_hash)) {
    noteLoginFailure(throttleKey);
    return render(req, res, O.ownerAuth({ t: req.t, lang: req.lang, mode: 'login', values: req.body, error: req.lang === 'it' ? 'Credenziali non valide.' : 'Invalid credentials.' }), req.t('login'), 'own');
  }
  clearLoginFailures(throttleKey);
  startSession(req, res, user.id);
  res.redirect(user.role === 'admin' ? '/admin' : '/owner');
});

app.post('/owner/verify', (req, res) => {
  if (!req.user || req.user.role !== 'owner') return res.redirect('/owner');
  if (String(req.body.code || '').trim() === String(req.user.verify_code || '')) {
    db.prepare('UPDATE users SET phone_verified = 1, verify_code = NULL WHERE id = ?').run(req.user.id);
    res.redirect('/owner');
  } else {
    render(req, res, O.ownerAuth({ t: req.t, lang: req.lang, mode: 'verify', demoCode: req.user.verify_code, error: req.lang === 'it' ? 'Codice non corretto.' : 'Wrong code.' }), req.t('verify_title'), 'own');
  }
});

app.get('/owner/new', (req, res) => {
  if (!requireUser(req, res, 'owner')) return;
  if (!req.user.phone_verified) return res.redirect('/owner');
  render(req, res, O.listingForm({ t: req.t, lang: req.lang, values: {} }), req.t('form_submit'), 'own');
});

app.post('/owner/listings', (req, res) => {
  if (!requireUser(req, res, 'owner')) return;
  if (!req.user.phone_verified) return res.redirect('/owner');
  const b = req.body;
  const days = (Array.isArray(b.days) ? b.days : b.days ? [b.days] : []).map(Number).filter(n => n >= 0 && n <= 6);
  if (!b.name || !b.area || !areas.includes(b.area) || !(Number(b.price_hour) > 0) || !validTime(b.open_time) || !validTime(b.close_time) || minutes(b.close_time) <= minutes(b.open_time)) {
    return render(req, res, O.listingForm({ t: req.t, lang: req.lang, values: b, error: req.t('required') }), req.t('form_submit'), 'own');
  }
  const photos = String(b.photos || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 8);
  const lat = { 'Centro': 45.6505, 'Stazione': 45.6570, 'Cattinara': 45.6675, 'Barcola': 45.6650, 'Porto Vecchio': 45.6480, 'Stadio': 45.6420 }[b.area] || 45.6505;
  const lng = { 'Centro': 13.7735, 'Stazione': 13.7660, 'Cattinara': 13.7905, 'Barcola': 13.7560, 'Porto Vecchio': 13.7640, 'Stadio': 13.8000 }[b.area] || 13.7735;
  const result = db.prepare(`INSERT INTO listings(owner_id, name, address, area, lat, lng, price_hour, covered, notes, photos, status)
                             VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`)
    .run(req.user.id, String(b.name).slice(0, 100), String(b.address || '').slice(0, 160), b.area, lat, lng,
      Number(b.price_hour), b.covered === '1' ? 1 : 0, String(b.notes || '').slice(0, 1000), JSON.stringify(photos));
  const listingId = Number(result.lastInsertRowid);
  const ins = db.prepare('INSERT INTO availability(listing_id, weekday, "start", "end", blocked_dates) VALUES(?, ?, ?, ?, \'[]\')');
  (days.length ? days : [0,1,2,3,4,5,6]).forEach(wd => ins.run(listingId, wd, b.open_time, b.close_time));
  render(req, res, `<section class="page-head center"><div class="success-mark">✓</div><h1>${esc(req.t('form_submit'))}</h1><p class="notice">${esc(req.t('form_pending'))}</p><p><a class="btn" href="/owner">${esc(req.t('back'))}</a></p></section>`, req.t('form_submit'), 'own');
});

app.post('/owner/bookings/:id/accept', (req, res) => {
  if (!requireUser(req, res, 'owner')) return;
  const b = db.prepare(`SELECT b.* FROM bookings b JOIN listings l ON l.id = b.listing_id WHERE b.id = ? AND l.owner_id = ? AND b.status = 'requested'`).get(req.params.id, req.user.id);
  if (!b) return err(req, res, 'Non trovato / Not found', 404);
  db.prepare("UPDATE bookings SET status = 'confirmed' WHERE id = ?").run(b.id);
  db.prepare('UPDATE payments SET fee_paid = 0 WHERE booking_id = ?').run(b.id);
  res.redirect('/owner');
});

app.post('/owner/bookings/:id/decline', (req, res) => {
  if (!requireUser(req, res, 'owner')) return;
  const b = db.prepare(`SELECT b.* FROM bookings b JOIN listings l ON l.id = b.listing_id WHERE b.id = ? AND l.owner_id = ? AND b.status = 'requested'`).get(req.params.id, req.user.id);
  if (!b) return err(req, res, 'Non trovato / Not found', 404);
  db.prepare("UPDATE bookings SET status = 'declined' WHERE id = ?").run(b.id);
  res.redirect('/owner');
});

app.post('/owner/listings/:id/block', (req, res) => {
  if (!requireUser(req, res, 'owner')) return;
  const listing = db.prepare('SELECT * FROM listings WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!listing || !validDate(req.body.block_date)) return err(req, res, req.t('required'));
  const rows = db.prepare('SELECT id, blocked_dates FROM availability WHERE listing_id = ?').all(listing.id);
  for (const row of rows) {
    let arr = [];
    try { arr = JSON.parse(row.blocked_dates || '[]'); } catch { arr = []; }
    if (!arr.includes(req.body.block_date)) arr.push(req.body.block_date);
    db.prepare('UPDATE availability SET blocked_dates = ? WHERE id = ?').run(JSON.stringify(arr), row.id);
  }
  res.redirect('/owner');
});

// ---------- admin ----------
app.get('/admin', (req, res) => {
  if (!requireUser(req, res, 'admin')) return;
  const pending = db.prepare(`SELECT l.*, u.name AS owner_name, u.phone AS owner_phone FROM listings l JOIN users u ON u.id = l.owner_id WHERE l.status = 'pending' ORDER BY l.id DESC`).all();
  const bookings = db.prepare(`SELECT b.*, l.name AS listing_name, p.fee_paid FROM bookings b LEFT JOIN payments p ON p.booking_id = b.id JOIN listings l ON l.id = b.listing_id ORDER BY b.id DESC`).all();
  const totals = db.prepare(`SELECT substr(b.date,1,7) AS month, COUNT(*) AS bookings,
      SUM(CASE WHEN b.status='confirmed' THEN 1 ELSE 0 END) AS confirmed,
      SUM(CASE WHEN p.fee_paid=1 THEN 1 ELSE 0 END) AS fees_paid,
      COALESCE(SUM(CASE WHEN p.fee_paid=1 THEN b.fee ELSE 0 END),0) AS total_fees,
      COALESCE(SUM(CASE WHEN b.status='confirmed' THEN b.price ELSE 0 END),0) AS owner_payouts
    FROM bookings b LEFT JOIN payments p ON p.booking_id=b.id GROUP BY substr(b.date,1,7) ORDER BY month DESC`).all();
  const exampleCount = db.prepare('SELECT COUNT(*) AS n FROM listings WHERE is_example = 1').get().n;
  render(req, res, O.adminPanel({ t: req.t, pending, bookings, totals, exampleCount }), req.t('admin_title'), 'own');
});

app.post('/admin/listings/:id/approve', (req, res) => {
  if (!requireUser(req, res, 'admin')) return;
  db.prepare("UPDATE listings SET status = 'approved' WHERE id = ?").run(req.params.id);
  res.redirect('/admin');
});
app.post('/admin/listings/:id/reject', (req, res) => {
  if (!requireUser(req, res, 'admin')) return;
  db.prepare("UPDATE listings SET status = 'rejected' WHERE id = ?").run(req.params.id);
  res.redirect('/admin');
});
app.post('/admin/bookings/:id/paid', (req, res) => {
  if (!requireUser(req, res, 'admin')) return;
  db.prepare(`INSERT INTO payments(booking_id, fee_paid, stripe_reference) VALUES(?, 1, 'manual')
              ON CONFLICT(booking_id) DO UPDATE SET fee_paid = 1, stripe_reference = 'manual'`).run(req.params.id);
  res.redirect('/admin');
});
app.post('/admin/remove-examples', (req, res) => {
  if (!requireUser(req, res, 'admin')) return;
  removeExamples();
  res.redirect('/admin');
});

function csvCell(v) {
  const s = String(v === undefined || v === null ? '' : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
app.get('/admin/export.csv', (req, res) => {
  if (!requireUser(req, res, 'admin')) return;
  const bookings = db.prepare(`SELECT b.code, l.name AS listing, l.area, b.driver_name, b.driver_phone, b.date, b."start", b."end", b.price, b.fee, b.status, COALESCE(p.fee_paid,0) AS fee_paid, COALESCE(p.stripe_reference,'') AS stripe_reference
    FROM bookings b JOIN listings l ON l.id = b.listing_id LEFT JOIN payments p ON p.booking_id = b.id ORDER BY b.id`).all();
  const head = ['code', 'listing', 'area', 'driver_name', 'driver_phone', 'date', 'start', 'end', 'price', 'fee', 'status', 'fee_paid', 'stripe_reference'];
  const lines = [head.join(','), ...bookings.map(b => head.map(k => csvCell(b[k])).join(','))];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="parktrieste-bookings.csv"');
  res.send('\uFEFF' + lines.join('\r\n') + '\r\n');
});

app.post('/logout', (req, res) => {
  const token = req.cookies.pt_session;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  clearCookie(res, 'pt_session', !!req.secure);
  res.redirect('/');
});

// ---------- error + start ----------
app.use((req, res) => { res.status(404); render(req, res, V.errorPage({ t: req.t, message: '404' }), '404', 'need', { noindex: true }); });
app.use((e, req, res, next) => {
  console.error(e);
  if (res.headersSent) return next(e);
  res.status(500);
  render(req, res, V.errorPage({ t: req.t }), 'Errore', 'need', { noindex: true });
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`ParkTrieste running at ${config.baseUrl} (port ${config.port})`);
  console.log(`Admin: ${config.adminEmail}`);
  console.log(`WhatsApp operator: ${config.whatsappOperator}`);
});
