'use strict';
const { esc, fmtDate } = require('./helpers');
const { areas } = require('./i18n');

const DAYS_IT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ownerAuth({ t, lang, mode, values, error, verify, demoCode }) {
  const days = lang === 'it' ? DAYS_IT : DAYS_EN;
  const v = values || {};
  let inner = '';

  if (mode === 'verify') {
    inner = `
      <h1>${esc(t('verify_title'))}</h1>
      <p class="muted">${esc(t('verify_sub'))}</p>
      <p class="notice">${esc(t('verify_demo'))} <b>${esc(demoCode)}</b></p>
      ${error ? `<p class="err">${esc(error)}</p>` : ''}
      <form method="post" action="/owner/verify" class="form">
        <label>${esc(t('verify_code'))}<input name="code" inputmode="numeric" maxlength="6" required placeholder="------"></label>
        <button class="btn btn-primary btn-block btn-lg" type="submit">${esc(t('verify_btn'))}</button>
      </form>`;
  } else if (mode === 'register') {
    inner = `
      <h1>${esc(t('owner_register_title'))}</h1>
      ${error ? `<p class="err">${esc(error)}</p>` : ''}
      <form method="post" action="/owner/register" class="form">
        <label>${esc(t('form_name'))}<input name="name" required maxlength="80" value="${esc(v.name)}"></label>
        <label>${esc(t('email_or_phone'))}<input name="identity" required value="${esc(v.identity)}" autocomplete="username"></label>
        <label>${esc(t('form_phone'))}<input name="phone" type="tel" required value="${esc(v.phone)}" placeholder="+39 333 1234567"></label>
        <label>${esc(t('password'))}<input name="password" type="password" required minlength="6" autocomplete="new-password"></label>
        <button class="btn btn-primary btn-block btn-lg" type="submit">${esc(t('register_btn'))}</button>
      </form>
      <p class="center muted">${esc(t('have_account'))} <a href="/owner?mode=login">${esc(t('login'))}</a></p>`;
  } else {
    inner = `
      <h1>${esc(t('owner_login_title'))}</h1>
      ${error ? `<p class="err">${esc(error)}</p>` : ''}
      <form method="post" action="/owner/login" class="form">
        <label>${esc(t('email_or_phone'))}<input name="identity" required value="${esc(v.identity)}" autocomplete="username"></label>
        <label>${esc(t('password'))}<input name="password" type="password" required autocomplete="current-password"></label>
        <button class="btn btn-primary btn-block btn-lg" type="submit">${esc(t('login_btn'))}</button>
      </form>
      <p class="center muted">${esc(t('no_account'))} <a href="/owner?mode=register">${esc(t('register'))}</a></p>`;
  }
  return `<section class="auth-wrap card">${inner}</section>`;
}

function listingForm({ t, lang, values, error }) {
  const v = values || {};
  const selectedDays = Array.isArray(v.days) ? v.days.map(Number) : [0,1,2,3,4,5,6];
  const dayNames = lang === 'it' ? DAYS_IT : DAYS_EN;
  const dayBoxes = dayNames.map((name, i) => `
    <label class="check"><input type="checkbox" name="days" value="${i}" ${selectedDays.includes(i) ? 'checked' : ''}><span>${name}</span></label>`).join('');
  return `
<section class="page-head"><h1>${esc(t('owner_title'))}</h1><p class="muted">${esc(t('owner_sub'))}</p></section>
<section class="card">
  ${error ? `<p class="err">${esc(error)}</p>` : ''}
  ${v.notice ? `<p class="notice">${esc(v.notice)}</p>` : ''}
  <form method="post" action="/owner/listings" class="form">
    <div class="row">
      <label>${esc(t('form_name'))}<input name="owner_name" required value="${esc(v.owner_name)}"></label>
      <label>${esc(t('form_phone'))}<input name="phone" type="tel" required value="${esc(v.phone)}" placeholder="+39 333 1234567"></label>
    </div>
    <label>${esc(t('form_space'))}<input name="name" required maxlength="100" value="${esc(v.name)}"></label>
    <label>${esc(t('form_address'))}<input name="address" value="${esc(v.address)}"></label>
    <label>${esc(t('form_area'))}<select name="area" required>
      ${areas.map(a => `<option value="${esc(a)}" ${v.area === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}
    </select></label>
    <div class="row">
      <label>${esc(t('form_price'))}<input name="price_hour" type="number" min="0.5" step="0.1" required value="${esc(v.price_hour || '2')}"></label>
      <label>${esc(t('form_covered'))}<select name="covered">
        <option value="0" ${String(v.covered) === '0' ? 'selected' : ''}>${esc(t('open_air'))}</option>
        <option value="1" ${String(v.covered) === '1' ? 'selected' : ''}>${esc(t('covered'))}</option>
      </select></label>
    </div>
    <fieldset><legend>${esc(t('form_days'))}</legend><div class="checks">${dayBoxes}</div></fieldset>
    <div class="row">
      <label>${esc(t('form_open'))}<input name="open_time" type="time" required value="${esc(v.open_time || '08:00')}"></label>
      <label>${esc(t('form_close'))}<input name="close_time" type="time" required value="${esc(v.close_time || '20:00')}"></label>
    </div>
    <label>${esc(t('form_notes'))}<textarea name="notes" rows="3">${esc(v.notes)}</textarea></label>
    <label>${esc(t('form_photos'))}<textarea name="photos" rows="3" placeholder="https://…"></textarea></label>
    <button class="btn btn-primary btn-block btn-lg" type="submit">${esc(t('form_submit'))}</button>
  </form>
</section>`;
}

function statusBadge(t, status) {
  const cls = { pending: 'badge-pending', approved: 'badge-ok', rejected: 'badge-bad', requested: 'badge-pending', confirmed: 'badge-ok', declined: 'badge-bad', cancelled: 'badge-bad' }[status] || '';
  return `<span class="badge ${cls}">${esc(t(status) || status)}</span>`;
}

function ownerDashboard({ t, user, spaces, requests, earnings, blockedMap, stripeEnabled, stripeNotice }) {
  const spaceCards = spaces.map(s => {
    const blocks = blockedMap[s.id] || [];
    return `<article class="card compact">
      <div class="listing-top"><b>${esc(s.name)}</b>${statusBadge(t, s.status)}</div>
      <p class="muted small">${esc(s.area)} · €${Number(s.price_hour).toFixed(2).replace('.', ',')} ${esc(t('price_hour'))}</p>
      ${blocks.length ? `<p class="muted small">${esc(t('block_dates'))}: ${blocks.map(fmtDate).join(', ')}</p>` : ''}
      <form method="post" action="/owner/listings/${s.id}/block" class="inline-form">
        <input type="date" name="block_date" required aria-label="${esc(t('date_label'))}">
        <button class="btn btn-small" type="submit">${esc(t('block_btn'))}</button>
      </form>
    </article>`;
  }).join('') || `<p class="muted">${esc(t('no_spaces'))}</p>`;

  const requestRows = requests.map(b => `
    <article class="card compact request-row">
      <div class="listing-top"><b>${esc(b.code)}</b>${statusBadge(t, b.status)}</div>
      <p class="muted small">${esc(b.listing_name)} · ${esc(fmtDate(b.date))} ${esc(b.start)}–${esc(b.end)}</p>
      <p class="small">${esc(b.driver_name)} · ${esc(b.driver_phone)} · €${Number(b.price).toFixed(2).replace('.', ',')}</p>
      ${b.status === 'requested' ? `<div class="row">
        <form method="post" action="/owner/bookings/${b.id}/accept"><button class="btn btn-green btn-small" type="submit">✔ ${esc(t('accept'))}</button></form>
        <form method="post" action="/owner/bookings/${b.id}/decline"><button class="btn btn-outline btn-small" type="submit">✖ ${esc(t('decline'))}</button></form>
      </div>` : ''}
    </article>`).join('') || `<p class="muted">${esc(t('no_requests'))}</p>`;

  const stripeSection = stripeEnabled ? `<section class="card compact">
  <h2>${esc(t('stripe_connect_title'))}</h2>
  ${stripeNotice === 'error' ? `<p class="notice">${esc(t('stripe_error'))}</p>` : ''}
  ${user.stripe_account_id
    ? `<p class="ok">✔ ${esc(t('stripe_connected'))}</p>
       ${user.stripe_payouts_enabled ? '' : `<p class="muted small">${esc(t('stripe_pending'))}</p>`}
       <p><a class="btn btn-outline btn-small" href="https://dashboard.stripe.com/" target="_blank" rel="noopener">${esc(t('stripe_dashboard'))}</a></p>`
    : `<p class="muted small">${esc(t('stripe_connect_sub'))}</p>
       <form method="post" action="/owner/connect"><button class="btn btn-primary btn-small" type="submit">${esc(t('stripe_connect_btn'))}</button></form>`}
</section>` : '';

  return `
<section class="page-head"><h1>${esc(t('dash_title'))}</h1><p class="muted">${esc(user.name)}${user.phone_verified ? ' · ✔ ' + esc(t('verify_btn')) : ''}</p></section>
<section class="card earnings">
  <h2>${esc(t('earnings'))}</h2>
  <p class="big-number">€${Number(earnings.total || 0).toFixed(2).replace('.', ',')}</p>
  <p class="muted small">${earnings.count || 0} ${esc(t('confirmed_count')).toLowerCase()}</p>
</section>
${stripeSection}
<h2 class="section-title">${esc(t('my_spaces'))}</h2>
<section class="stack">${spaceCards}</section>
<p><a class="btn btn-primary" href="/owner/new">+ ${esc(t('form_submit'))}</a></p>
<h2 class="section-title">${esc(t('requests'))}</h2>
<section class="stack">${requestRows}</section>`;
}

function adminPanel({ t, pending, bookings, totals, exampleCount, traffic }) {
  const pendingHtml = pending.map(l => `
    <article class="card compact">
      <div class="listing-top"><b>${esc(l.name)}</b>${statusBadge(t, l.status)}</div>
      <p class="muted small">${esc(l.area)} · ${esc(l.owner_name)} · ${esc(l.owner_phone)}</p>
      <p class="small">${esc(l.notes || '')}</p>
      <div class="row">
        <form method="post" action="/admin/listings/${l.id}/approve"><button class="btn btn-green btn-small" type="submit">✔ ${esc(t('approve'))}</button></form>
        <form method="post" action="/admin/listings/${l.id}/reject"><button class="btn btn-outline btn-small" type="submit">✖ ${esc(t('reject'))}</button></form>
      </div>
    </article>`).join('') || `<p class="muted">${esc(t('no_new'))}</p>`;

  const rows = bookings.map(b => `
    <tr>
      <td><b>${esc(b.code)}</b></td>
      <td>${esc(b.listing_name)}</td>
      <td>${esc(fmtDate(b.date))} ${esc(b.start)}–${esc(b.end)}</td>
      <td>${esc(b.driver_name)}<br><span class="muted small">${esc(b.driver_phone)}</span></td>
      <td>€${Number(b.price).toFixed(2).replace('.', ',')}</td>
      <td>${statusBadge(t, b.status)}</td>
      <td>${b.fee_paid ? '✔ €1' : '—'}</td>
      <td>${b.fee_paid ? '' : `<form method="post" action="/admin/bookings/${b.id}/paid"><button class="btn btn-yellow btn-small" type="submit">${esc(t('mark_paid'))}</button></form>`}</td>
    </tr>`).join('');

  const totalsHtml = totals.map(m => `
    <tr><td>${esc(m.month)}</td><td>${m.bookings}</td><td>${m.confirmed}</td><td>${m.fees_paid}</td><td>€${Number(m.total_fees).toFixed(2).replace('.', ',')}</td><td>€${Number(m.owner_payouts).toFixed(2).replace('.', ',')}</td></tr>`).join('') || `<tr><td colspan="6" class="muted">—</td></tr>`;

  const trafficHtml = traffic ? `
<h2 class="section-title">${esc(t('traffic_title'))}</h2>
<section class="card">
  <p><b>${esc(t('traffic_views'))}:</b> ${traffic.total}</p>
  <p class="small">${traffic.daily.length ? traffic.daily.map(d => `${esc(d.day)}: ${d.views}`).join(' · ') : esc(t('traffic_none'))}</p>
  <h3>${esc(t('traffic_top_pages'))}</h3>
  <p class="small">${traffic.topPaths.length ? traffic.topPaths.map(p => `${esc(p.path)}: ${p.views}`).join(' · ') : esc(t('traffic_none'))}</p>
  <h3>${esc(t('traffic_referrers'))}</h3>
  <p class="small">${traffic.topReferrers.length ? traffic.topReferrers.map(r => `${esc(r.referrer)}: ${r.views}`).join(' · ') : esc(t('traffic_none'))}</p>
</section>` : '';

  return `
<section class="page-head"><h1>${esc(t('admin_title'))}</h1></section>
<section class="card">
  <div class="row wrap"><a class="btn btn-small" href="/admin/export.csv">⬇ ${esc(t('export_csv'))}</a>
  ${exampleCount ? `<form method="post" action="/admin/remove-examples"><button class="btn btn-outline btn-small" type="submit">${esc(t('remove_examples'))} (${exampleCount})</button></form>` : ''}</div>
</section>
<h2 class="section-title">${esc(t('new_listings'))}</h2>
<section class="stack">${pendingHtml}</section>
<h2 class="section-title">${esc(t('all_requests'))}</h2>
<section class="card table-wrap"><table>
  <thead><tr><th>${esc(t('booking_code'))}</th><th>${esc(t('form_space'))}</th><th>${esc(t('date_label'))}</th><th>${esc(t('your_name'))}</th><th>${esc(t('total'))}</th><th>${esc(t('status'))}</th><th>€1</th><th></th></tr></thead>
  <tbody>${rows}</tbody>
</table></section>
<h2 class="section-title">${esc(t('monthly_totals'))}</h2>
<section class="card table-wrap"><table>
  <thead><tr><th>${esc(t('month'))}</th><th>${esc(t('bookings_count'))}</th><th>${esc(t('confirmed_count'))}</th><th>${esc(t('fees_paid'))}</th><th>${esc(t('total_fees'))}</th><th>${esc(t('owner_payouts'))}</th></tr></thead>
  <tbody>${totalsHtml}</tbody>
</table></section>
${trafficHtml}`;
}

module.exports = { ownerAuth, listingForm, ownerDashboard, adminPanel, statusBadge };
