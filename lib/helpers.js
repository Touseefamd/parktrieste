'use strict';
const { db } = require('./db');
const config = require('./env');

function esc(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function pad2(n) { return String(n).padStart(2, '0'); }

function fmtDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function minutes(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  const as = minutes(aStart), ae = minutes(aEnd), bs = minutes(bStart), be = minutes(bEnd);
  if (as < 0 || ae <= as || bs < 0 || be <= bs) return true;
  return as < be && bs < ae;
}

function hoursBetween(start, end) {
  const d = minutes(end) - minutes(start);
  return d > 0 ? d / 60 : 0;
}

function slotAvailable(listingId, date, start, end, ignoreBookingId) {
  const wd = weekdayOf(date);
  const row = db.prepare('SELECT "start" AS start_time, "end" AS end_time, blocked_dates FROM availability WHERE listing_id = ? AND weekday = ?').get(listingId, wd);
  if (!row) return false;
  if (minutes(start) < minutes(row.start_time) || minutes(end) > minutes(row.end_time)) return false;
  let blocked = [];
  try { blocked = JSON.parse(row.blocked_dates || '[]'); } catch { blocked = []; }
  if (blocked.includes(date)) return false;
  const active = db.prepare(`SELECT id, "start" AS start_time, "end" AS end_time FROM bookings
                             WHERE listing_id = ? AND date = ? AND status IN ('requested','confirmed')`).all(listingId, date);
  for (const b of active) {
    if (b.id === ignoreBookingId) continue;
    if (overlaps(start, end, b.start_time, b.end_time)) return false;
  }
  return true;
}

function digitsPhone(phone) { return String(phone || '').replace(/\D/g, ''); }

function whatsappLink(number, text) {
  return `https://wa.me/${digitsPhone(number)}?text=${encodeURIComponent(text || '')}`;
}

function operatorWaLink(text) { return whatsappLink(config.whatsappOperator, text); }

function bookingMessage(t, booking, listing) {
  return [
    `ParkTrieste — ${t('booking_code')}: ${booking.code}`,
    `${t('form_space')}: ${listing.name} (${listing.area})`,
    `${t('date_label')}: ${fmtDate(booking.date)}  ${booking.start}–${booking.end}`,
    `${t('your_name')}: ${booking.driver_name}`,
    `${t('whatsapp_phone')}: ${booking.driver_phone}`
  ].join('\n');
}

function ownerRequestMessage(t, booking, listing) {
  return [
    `ParkTrieste — Nuova richiesta / New request ${booking.code}`,
    `${listing.name} — ${fmtDate(booking.date)} ${booking.start}-${booking.end}`,
    `${booking.driver_name} — ${booking.driver_phone}`,
    `${t('total')}: €${Number(booking.price).toFixed(2)}`
  ].join('\n');
}

function parsePhotos(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string' && x.trim()) : [];
  } catch { return []; }
}

function safeUrl(url) {
  return /^(https?:\/\/|\/)/i.test(String(url || '')) ? String(url) : '';
}

module.exports = {
  esc, pad2, fmtDate, weekdayOf, minutes, overlaps, hoursBetween,
  slotAvailable, digitsPhone, whatsappLink, operatorWaLink,
  bookingMessage, ownerRequestMessage, parsePhotos, safeUrl
};
