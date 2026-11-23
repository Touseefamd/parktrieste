'use strict';
const config = require('./env');
const { esc, fmtDate, parsePhotos, safeUrl, operatorWaLink, hoursBetween } = require('./helpers');
const { areas } = require('./i18n');
const { AREAS } = require('./seo');

function qstr(q) {
  const parts = [];
  if (q.area) parts.push('area=' + encodeURIComponent(q.area));
  if (q.date) parts.push('date=' + encodeURIComponent(q.date));
  if (q.from) parts.push('from=' + encodeURIComponent(q.from));
  if (q.until) parts.push('until=' + encodeURIComponent(q.until));
  return parts.join('&');
}

function photoHtml(listing, cls) {
  const photos = parsePhotos(listing.photos);
  const first = photos.length ? safeUrl(photos[0]) : '';
  if (first) return `<img class="${cls}" src="${esc(first)}" alt="${esc(listing.name)}" loading="lazy">`;
  const glyph = { 'Centro': '🏛️', 'Stazione': '🚉', 'Cattinara': '🏥', 'Barcola': '🌊', 'Porto Vecchio': '⚓', 'Stadio': '⚽' }[listing.area] || '🅿️';
  return `<div class="${cls} photo-placeholder" aria-hidden="true"><span>${glyph}</span></div>`;
}

function ratingHtml(rating, count, t) {
  if (!count) return `<span class="muted">—</span>`;
  const full = Math.round(rating);
  const stars = '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
  return `<span class="stars" title="${esc(t('rating'))}: ${rating.toFixed(1)}">${stars}</span> <span class="muted">(${rating.toFixed(1)})</span>`;
}

function stripLangParam(url) {
  try {
    const u = new URL(url || '/', 'http://localhost');
    u.searchParams.delete('lang');
    return u.pathname + u.search + u.hash;
  } catch { return '/'; }
}

function layout({ t, lang, title, body, user, section, nextUrl, seo = {} }) {
  const wa = operatorWaLink(t('contact') + ' ParkTrieste');
  const pageTitle = seo.title ? esc(seo.title) : `${esc(title)} · ParkTrieste`;
  const description = esc(seo.description || t('brand_tag'));
  const keywords = esc(seo.keywords || '');
  const canonical = seo.canonical ? esc(seo.canonical) : '';
  const robots = esc(seo.robots || 'index,follow');
  const ogType = esc(seo.type || 'website');
  const ogLocale = esc(seo.ogLocale || (lang === 'en' ? 'en_US' : 'it_IT'));
  const localeAlt = lang === 'en'
    ? '<meta property="og:locale:alternate" content="it_IT">'
    : '<meta property="og:locale:alternate" content="en_US">';
  const imageTags = seo.image
    ? `<meta property="og:image" content="${esc(seo.image)}">\n  <meta name="twitter:image" content="${esc(seo.image)}">`
    : '';
  const canonicalTag = canonical ? `<link rel="canonical" href="${canonical}">` : '';
  const alternates = (seo.alternates || []).map(a => `<link rel="alternate" hreflang="${esc(a.hreflang)}" href="${esc(a.href)}">`).join('\n  ');
  const verification = seo.verification ? `<meta name="google-site-verification" content="${esc(seo.verification)}">` : '';
  const jsonLd = seo.jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(seo.jsonLd).replace(/</g, '\\u003c')}</script>`
    : '';
  return `<!doctype html>
<html lang="${lang}" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0a4a8a">
  <title>${pageTitle}</title>
  <meta name="description" content="${description}">
  <meta name="keywords" content="${keywords}">
  <meta name="robots" content="${robots}">
  ${verification}
  ${canonicalTag}
  ${alternates}
  <meta property="og:type" content="${ogType}">
  <meta property="og:site_name" content="ParkTrieste">
  <meta property="og:title" content="${pageTitle}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:locale" content="${ogLocale}">
  ${localeAlt}
  ${imageTags}
  <meta name="twitter:card" content="${seo.image ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${pageTitle}">
  <meta name="twitter:description" content="${description}">
  ${jsonLd}
  <link rel="stylesheet" href="/style.css">
  <script>
    try { document.documentElement.dataset.theme = localStorage.getItem('pt-theme') || 'light'; } catch(e) {}
  </script>
</head>
<body>
<header class="site-header">
  <div class="header-inner">
    <a class="brand" href="/"><span class="brand-mark">P</span><span>Park<b>Trieste</b></span></a>
    <nav class="tabs" aria-label="Main">
      <a href="/" class="tab ${section === 'need' ? 'active' : ''}">${esc(t('nav_need'))}</a>
      <a href="/owner" class="tab ${section === 'own' ? 'active' : ''}">${esc(t('nav_own'))}</a>
    </nav>
    <div class="header-actions">
      <a class="icon-btn lang-btn" href="/set-lang?lang=${lang === 'it' ? 'en' : 'it'}&next=${encodeURIComponent(stripLangParam(nextUrl || '/'))}" title="${esc(t('lang_label'))}" aria-label="${esc(t('lang_label'))}">${lang === 'it' ? 'EN' : 'IT'}</a>
      <button class="icon-btn" id="themeToggle" title="${esc(t('theme_label'))}" aria-label="${esc(t('theme_label'))}">🌙</button>
      ${user ? `<a class="icon-btn" href="${user.role === 'admin' ? '/admin' : '/owner'}">${esc(user.name.split(' ')[0])}</a><a class="icon-btn" href="/logout" title="${esc(t('logout'))}">↪</a>` : `<a class="icon-btn" href="/owner">${esc(t('login'))}</a>`}
    </div>
  </div>
</header>
<main class="main">${body}</main>
<footer class="footer">
  <p class="pilot-note">${esc(t('pilot_note'))}</p>
  <p class="owner-note">${esc(t('operator_note'))}</p>
  <nav class="footer-links">
    <a href="/legal/terms">${esc(t('terms'))}</a>
    <a href="/legal/privacy">${esc(t('privacy'))}</a>
    <a href="/legal/cancellation">${esc(t('cancellation'))}</a>
    <a href="${wa}" target="_blank" rel="noopener">${esc(t('contact'))} WhatsApp</a>
  </nav>
  <p class="muted small">${esc(t('footer_rights'))}</p>
  <p class="muted small photo-credit">${esc(t('photo_credit'))} <a href="https://commons.wikimedia.org/wiki/File:Trieste,_panorama_della_citt%C3%A0_nella_luce_del_tramonto_(dicembre_2020)_1.jpg" target="_blank" rel="noopener">Giuseppe Basile / Wikimedia Commons</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a> · ${esc(t('photo_cropped'))}</p>
</footer>
<div class="cookie-banner" id="cookieBanner" hidden>
  <p>${esc(t('cookie_notice'))}</p>
  <button class="btn btn-small" id="cookieAccept">${esc(t('accept_cookies'))}</button>
</div>
<script src="/app.js" defer></script>
</body>
</html>`;
}

function home({ t, q }) {
  const chips = AREAS.map(a => `<a class="chip ${q.area === a.area ? 'active' : ''}" href="/parcheggi/${a.slug}">${esc(a.area)}</a>`).join('');
  return `
<section class="hero">
  <span class="eyebrow">Trieste · Italia</span>
  <h1>${esc(t('home_title'))}</h1>
  <p class="lead">${esc(t('home_sub'))}</p>
</section>
<form class="card search-card" method="get" action="/results">
  <label>${esc(t('area'))}
    <select name="area">
      <option value="">${esc(t('all_areas'))}</option>
      ${areas.map(a => `<option value="${esc(a)}" ${q.area === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}
    </select>
  </label>
  <label>${esc(t('date'))}
    <input type="date" name="date" value="${esc(q.date)}" required>
  </label>
  <div class="row">
    <label>${esc(t('from'))}<input type="time" name="from" value="${esc(q.from || '09:00')}" required></label>
    <label>${esc(t('until'))}<input type="time" name="until" value="${esc(q.until || '18:00')}" required></label>
  </div>
  <button class="btn btn-primary btn-block" type="submit">🔎 ${esc(t('search'))}</button>
</form>
<section class="trust-strip">
  <div><span class="trust-icon">✔</span><p>${esc(t('trust_verified'))}</p></div>
  <div><span class="trust-icon">📷</span><p>${esc(t('trust_photos'))}</p></div>
  <div><span class="trust-icon">🕒</span><p>${esc(t('trust_cancel'))}</p></div>
</section>
<section class="areas">
  <h2>${esc(t('all_areas'))}</h2>
  <div class="chips">${chips}</div>
</section>
<section class="seo-copy">
  <h2>${esc(t('seo_home_h2'))}</h2>
  <p>${esc(t('seo_home_p1'))}</p>
  <p>${esc(t('seo_home_p2'))}</p>
  <p>${esc(t('seo_home_p3'))}</p>
</section>
<section class="seo-copy">
  <h2>${esc(t('seo_faq_h2'))}</h2>
  <details><summary>${esc(t('seo_faq_q1'))}</summary><p>${esc(t('seo_faq_a1'))}</p></details>
  <details><summary>${esc(t('seo_faq_q2'))}</summary><p>${esc(t('seo_faq_a2'))}</p></details>
</section>`;
}

function pinPositions(listings) {
  if (!listings.length) return '';
  const lats = listings.map(l => l.lat), lngs = listings.map(l => l.lng);
  const minLat = Math.min(...lats) - 0.003, maxLat = Math.max(...lats) + 0.003;
  const minLng = Math.min(...lngs) - 0.004, maxLng = Math.max(...lngs) + 0.004;
  return listings.map(l => {
    const x = ((l.lng - minLng) / (maxLng - minLng)) * 88 + 6;
    const y = ((maxLat - l.lat) / (maxLat - minLat)) * 78 + 11;
    return `<a class="price-pin" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%" href="/space/${l.id}?${qstr({ area: l.area, date: l.date, from: l.from, until: l.until })}" title="${esc(l.name)}">€${Number(l.price_hour).toFixed(2).replace('.', ',')}</a>`;
  }).join('');
}

function results({ t, listings, q }) {
  const cards = listings.map(l => {
    const price = (Number(l.price_hour) * hoursBetween(q.from, q.until)).toFixed(2);
    return `<article class="card listing-card">
      <a class="listing-photo" href="/space/${l.id}?${qstr(q)}">${photoHtml(l, 'listing-img')}${l.is_example ? `<span class="badge badge-example">${esc(t('example'))}</span>` : ''}</a>
      <div class="listing-body">
        <div class="listing-top"><a class="listing-title" href="/space/${l.id}?${qstr(q)}">${esc(l.name)}</a>${ratingHtml(l.rating, l.review_count, t)}</div>
        <p class="muted">📍 ${esc(l.area)} · ${l.covered ? '☂ ' + esc(t('covered')) : '☀ ' + esc(t('open_air'))}</p>
        <p class="muted">${esc(t('available'))}: ${esc(fmtDate(q.date))} · ${esc(q.from)}–${esc(q.until)}</p>
        <div class="listing-bottom">
          <span class="price"><b>€${Number(l.price_hour).toFixed(2).replace('.', ',')}</b> ${esc(t('price_hour'))}<br><small>${esc(t('total'))}: €${price.replace('.', ',')}</small></span>
          <a class="btn btn-small" href="/space/${l.id}?${qstr(q)}">${esc(t('view'))} →</a>
        </div>
      </div>
    </article>`;
  }).join('');

  return `
<section class="page-head">
  <a class="back" href="/?${qstr(q)}">← ${esc(t('back'))}</a>
  <h1>${esc(t('results_title'))}</h1>
  <p class="muted">${esc(q.area || t('all_areas'))} · ${esc(fmtDate(q.date))} · ${esc(q.from)}–${esc(q.until)}</p>
</section>
<section class="map-wrap">
  <div class="map" role="img" aria-label="${esc(t('map'))}">
    <span class="map-label">TRIESTE</span>
    <div class="map-grid"></div>
    ${pinPositions(listings)}
  </div>
  <p class="map-caption muted small">${esc(t('map'))} · ${esc(t('results_sub'))}</p>
</section>
<section class="results-list">
  ${cards || `<div class="card empty">${esc(t('no_results'))}</div>`}
</section>`;
}

function areaPage({ t, lang, info, listings, q }) {
  const text = info[lang === 'en' ? 'en' : 'it'];
  const cards = listings.map(l => `<article class="card listing-card">
      <a class="listing-photo" href="/space/${l.id}?area=${encodeURIComponent(info.area)}">${photoHtml(l, 'listing-img')}</a>
      <div class="listing-body">
        <div class="listing-top"><a class="listing-title" href="/space/${l.id}?area=${encodeURIComponent(info.area)}">${esc(l.name)}</a>${ratingHtml(l.rating, l.review_count, t)}</div>
        <p class="muted">📍 ${esc(l.area)}${l.address ? ' · ' + esc(l.address) : ''}</p>
        <p class="muted">€${Number(l.price_hour).toFixed(2).replace('.', ',')} ${esc(t('price_hour'))}</p>
        <a class="btn btn-small" href="/space/${l.id}?area=${encodeURIComponent(info.area)}">${esc(t('view'))} →</a>
      </div>
    </article>`).join('');
  return `
<section class="page-head">
  <a class="back" href="/">← ${esc(t('back'))}</a>
  <h1>${esc(text.title)}</h1>
  <p class="lead">${esc(text.intro)}</p>
</section>
<section class="card">
  <h2>${esc(t('search'))}</h2>
  <form class="search-card" method="get" action="/results" style="box-shadow:none;padding:0">
    <input type="hidden" name="area" value="${esc(info.area)}">
    <label>${esc(t('date'))}<input type="date" name="date" value="${esc(q.date)}" required></label>
    <div class="row">
      <label>${esc(t('from'))}<input type="time" name="from" value="${esc(q.from || '09:00')}" required></label>
      <label>${esc(t('until'))}<input type="time" name="until" value="${esc(q.until || '18:00')}" required></label>
    </div>
    <button class="btn btn-primary btn-block" type="submit">🔎 ${esc(t('search'))}</button>
  </form>
</section>
<section class="trust-strip">
  ${text.highlights.map(h => `<div><span class="trust-icon">✔</span><p>${esc(h)}</p></div>`).join('')}
</section>
<section class="results-list">
  <h2>${esc(t('results_title'))} — ${esc(info.area)}</h2>
  ${cards || `<div class="card empty">${esc(t('no_results'))}</div>`}
</section>`;
}

function spacePage({ t, listing, q, rating, reviews }) {
  const price = (Number(listing.price_hour) * hoursBetween(q.from, q.until)).toFixed(2);
  const photos = parsePhotos(listing.photos);
  const gallery = photos.length
    ? `<div class="gallery">${photos.map(p => safeUrl(p) ? `<img src="${esc(p)}" alt="${esc(listing.name)}" loading="lazy">` : '').join('')}</div>`
    : photoHtml(listing, 'hero-photo');
  const reviewHtml = reviews.length
    ? `<div class="reviews">${reviews.map(r => `<blockquote>“${esc(r.comment || '')}” <span class="muted small">— ${'★'.repeat(r.rating)}</span></blockquote>`).join('')}</div>`
    : '';

  return `
<section class="page-head">
  <a class="back" href="/results?${qstr(q)}">← ${esc(t('back'))}</a>
</section>
<article class="card space-detail">
  ${gallery}
  <div class="space-head">
    <h1>${esc(listing.name)}</h1>
    ${listing.is_example ? `<span class="badge badge-example">${esc(t('example'))}</span>` : ''}
    <p class="muted">📍 ${esc(listing.area)}${listing.address ? ' · ' + esc(listing.address) : ''}</p>
    <p>${ratingHtml(rating, reviews.length, t)} · ${listing.covered ? '☂ ' + esc(t('covered')) : '☀ ' + esc(t('open_air'))}</p>
  </div>
  ${listing.is_example ? `<p class="notice">${esc(t('example_note'))}</p>` : ''}
  <h2>${esc(t('description'))}</h2>
  <p>${esc(listing.notes || '—')}</p>
  <h2>${esc(t('access_notes'))}</h2>
  <p>${esc(listing.access_notes || listing.notes || '—')}</p>
  ${reviewHtml}
  <div class="price-box">
    <span class="muted">${esc(t('price_calc'))} · ${esc(fmtDate(q.date))} ${esc(q.from)}–${esc(q.until)}</span>
    <strong>€${price.replace('.', ',')}</strong>
    <small>${hoursBetween(q.from, q.until).toFixed(1).replace('.', ',')} ${esc(t('hours'))} × €${Number(listing.price_hour).toFixed(2).replace('.', ',')} ${esc(t('price_hour'))}</small>
    <small class="muted">${esc(t('total'))}</small>
  </div>
  <form method="post" action="/spaces/${listing.id}/request" class="request-form">
    <input type="hidden" name="date" value="${esc(q.date)}">
    <input type="hidden" name="from" value="${esc(q.from)}">
    <input type="hidden" name="until" value="${esc(q.until)}">
    <label>${esc(t('your_name'))}<input name="driver_name" required maxlength="80" autocomplete="name"></label>
    <label>${esc(t('whatsapp_phone'))}<input name="driver_phone" type="tel" required placeholder="+39 333 1234567" autocomplete="tel"></label>
    <button class="btn btn-primary btn-block btn-lg" type="submit">${esc(t('request_btn'))} →</button>
    <p class="muted small">${esc(t('request_note'))}</p>
  </form>
</article>
<details class="card report-box">
  <summary>⚑ ${esc(t('report_btn'))}</summary>
  <form method="post" action="/spaces/${listing.id}/report" class="report-form">
    <label>${esc(t('report_reason'))}
      <select name="reason"><option>${esc(t('report_title'))}</option><option>Photo non corretta / wrong photo</option><option>Prezzo non corretto / wrong price</option><option>Altro / Other</option></select>
    </label>
    <label>${esc(t('report_detail'))}<textarea name="detail" rows="3"></textarea></label>
    <button class="btn btn-small" type="submit">${esc(t('report_send'))}</button>
  </form>
</details>`;
}

function stripeLink(booking) {
  if (!config.stripePaymentLink) return '';
  const sep = config.stripePaymentLink.includes('?') ? '&' : '?';
  return `${config.stripePaymentLink}${sep}client_reference_id=${encodeURIComponent(booking.code)}`;
}

function confirmation({ t, booking, listing, paid, canCheckout, payError }) {
  const waUrl = operatorWaLink([
    `ParkTrieste — ${t('booking_code')}: ${booking.code}`,
    `${listing.name} (${listing.area})`,
    `${fmtDate(booking.date)} ${booking.start}-${booking.end}`,
    `${booking.driver_name} — ${booking.driver_phone}`
  ].join('\n'));
  const link = stripeLink(booking);
  return `
<section class="page-head center">
  <div class="success-mark">✓</div>
  <h1>${esc(t('conf_title'))}</h1>
  <p class="muted">${esc(booking.status === 'confirmed' ? t('conf_confirmed') : t('conf_pending'))}</p>
</section>
<div class="card code-card">
  <span class="muted small">${esc(t('booking_code'))}</span>
  <strong id="bookingCode">${esc(booking.code)}</strong>
  <button class="btn btn-small" type="button" data-copy="${esc(booking.code)}">${esc(t('copy_code'))}</button>
</div>
<section class="card step">
  <h2>${esc(t('step1'))}</h2>
  <p class="muted">${esc(fmtDate(booking.date))} · ${esc(booking.start)}–${esc(booking.end)} · ${esc(listing.name)}</p>
  <a class="btn btn-green btn-block btn-lg" href="${esc(waUrl)}" target="_blank" rel="noopener">💬 ${esc(t('whatsapp_operator'))}</a>
  <p class="muted small">${booking.driver_name} · ${esc(booking.driver_phone)}</p>
</section>
<section class="card step ${booking.status === 'confirmed' ? '' : 'locked'}">
  <h2>${esc(t('step2'))}</h2>
  ${booking.status === 'confirmed'
    ? (paid
      ? `<p class="ok">✔ ${esc(t('paid_note'))}</p>`
      : `${payError ? `<p class="notice">${esc(t('pay_error'))}</p>` : ''}
         ${canCheckout
           ? `<form method="post" action="/booking/${encodeURIComponent(booking.code)}/pay"><button class="btn btn-yellow btn-block btn-lg" type="submit">💳 ${esc(t('pay_online'))}</button></form>`
           : (link
             ? `<a class="btn btn-yellow btn-block btn-lg" href="${esc(link)}" target="_blank" rel="noopener">💳 ${esc(t('pay_fee'))}</a>`
             : `<p class="notice">Stripe Payment Link non configurato — ${esc(t('mark_paid'))}.</p>`)}
         <p class="muted small">${esc(t('pay_note'))}</p>`)
    : `<p class="muted">${esc(t('conf_pending'))}</p>`}
</section>
<p class="center"><a href="/">← ${esc(t('back'))}</a></p>`;
}

function legal({ t, page }) {
  const map = {
    terms: [t('terms_title'), t('terms_body')],
    privacy: [t('privacy_title'), t('privacy_body')],
    cancellation: [t('cancellation_title'), t('cancellation_body')]
  };
  const [title, body] = map[page] || map.terms;
  return `<section class="page-head"><h1>${esc(title)}</h1></section><article class="card prose">${body}</article>`;
}

function errorPage({ t, message }) {
  return `<section class="page-head center"><h1>⚠️</h1><p>${esc(message || t('error_generic'))}</p><p><a class="btn" href="/">← ${esc(t('back'))}</a></p></section>`;
}

module.exports = { layout, home, areaPage, results, spacePage, confirmation, legal, errorPage, photoHtml, ratingHtml, qstr };
