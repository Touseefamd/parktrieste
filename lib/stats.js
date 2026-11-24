'use strict';
const { db } = require('./db');

// All traffic data stays in our own SQLite database. We never store IP
// addresses or user agents — only the page path, language and referrer host.
function trafficStats(days = 7) {
  const n = Math.max(1, Math.min(90, Number(days) || 7));
  const since = `datetime('now', '-${n} days')`;
  const total = db.prepare(`SELECT COUNT(*) AS n FROM page_views WHERE created_at >= ${since}`).get().n;
  const daily = db.prepare(`SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS views
    FROM page_views WHERE created_at >= ${since} GROUP BY day ORDER BY day`).all();
  const topPaths = db.prepare(`SELECT path, COUNT(*) AS views FROM page_views
    WHERE created_at >= ${since} GROUP BY path ORDER BY views DESC LIMIT 8`).all();
  const topReferrers = db.prepare(`SELECT referrer, COUNT(*) AS views FROM page_views
    WHERE created_at >= ${since} GROUP BY referrer ORDER BY views DESC LIMIT 6`).all();
  const bookings = db.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed
    FROM bookings WHERE created_at >= ${since}`).get();
  const listings = db.prepare(`SELECT COUNT(*) AS n FROM listings
    WHERE created_at >= ${since} AND is_example = 0`).get().n;
  const owners = db.prepare(`SELECT COUNT(*) AS n FROM users
    WHERE role = 'owner' AND created_at >= ${since}`).get().n;
  return {
    days: n, total,
    daily, topPaths, topReferrers,
    bookings: bookings.total || 0,
    confirmed: bookings.confirmed || 0,
    listings, owners
  };
}

function reportText(s) {
  return [
    `ParkTrieste weekly report — last ${s.days} days`,
    '',
    `Page views: ${s.total}`,
    `Booking requests: ${s.bookings} (confirmed: ${s.confirmed})`,
    `New parking listings: ${s.listings}`,
    `New owners: ${s.owners}`,
    '',
    'Views by day:',
    ...(s.daily.length ? s.daily.map(d => `  ${d.day}: ${d.views}`) : ['  none']),
    '',
    'Top pages:',
    ...(s.topPaths.length ? s.topPaths.map(p => `  ${p.path}: ${p.views}`) : ['  none']),
    '',
    'Top referrers:',
    ...(s.topReferrers.length ? s.topReferrers.map(r => `  ${r.referrer}: ${r.views}`) : ['  none'])
  ].join('\n');
}

module.exports = { trafficStats, reportText };
