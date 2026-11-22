'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const config = require('./env');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'parktrieste.sqlite');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, salt, hash] = String(stored).split(':');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const calc = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return calc.length === expected.length && crypto.timingSafeEqual(calc, expected);
  } catch { return false; }
}

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL DEFAULT 'owner',
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      password_hash TEXT NOT NULL,
      phone_verified INTEGER NOT NULL DEFAULT 0,
      verify_code TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users(email) WHERE email IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS users_phone_uq ON users(phone) WHERE phone IS NOT NULL;

    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      address TEXT,
      area TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      price_hour REAL NOT NULL,
      covered INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      photos TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      is_example INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      weekday INTEGER NOT NULL,
      "start" TEXT NOT NULL,
      "end" TEXT NOT NULL,
      blocked_dates TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      driver_name TEXT NOT NULL,
      driver_phone TEXT NOT NULL,
      date TEXT NOT NULL,
      "start" TEXT NOT NULL,
      "end" TEXT NOT NULL,
      price REAL NOT NULL,
      fee REAL NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'requested',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      fee_paid INTEGER NOT NULL DEFAULT 0,
      stripe_reference TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL,
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER,
      reason TEXT,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER,
      booking_id INTEGER,
      channel TEXT,
      message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Admin account from config (created once, password updated on restart for convenience in pilot).
  const admin = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (!admin) {
    db.prepare(`INSERT INTO users(role, name, phone, email, password_hash, phone_verified)
                VALUES('admin', ?, ?, ?, ?, 1)`)
      .run('ParkTrieste Admin', '+390000000000', config.adminEmail, hashPassword(config.adminPassword));
  } else {
    db.prepare('UPDATE users SET email = ?, password_hash = ? WHERE id = ?')
      .run(config.adminEmail, hashPassword(config.adminPassword), admin.id);
  }

  // Seed demo spaces on a fresh database.
  const count = db.prepare('SELECT COUNT(*) AS n FROM listings').get().n;
  if (count === 0) seedDemo();
}

const EXAMPLES = [
  { name: 'Piazza Unità d’Italia', area: 'Centro', lat: 45.6498, lng: 13.7768, price: 3.0, covered: 0, notes: 'Parcheggio coperto nel cuore della città, a due passi da Piazza Unità. Ingresso dal portone laterale, citofono 4B.', rating: 5, review: 'Comodissimo, precedenza garantita.' },
  { name: 'Stazione Centrale', area: 'Stazione', lat: 45.6570, lng: 13.7660, price: 2.5, covered: 1, notes: 'Box coperto a 3 minuti dalla stazione. Accesso con telecomando, consegna chiavi in loco.', rating: 4, review: 'Puntuale e facile da trovare.' },
  { name: 'Ospedale Cattinara', area: 'Cattinara', lat: 45.6675, lng: 13.7905, price: 1.8, covered: 0, notes: 'Posto scoperto vicino all’ingresso principale dell’ospedale, ideale per visite brevi.', rating: 4, review: 'Ottimo per l’ospedale.' },
  { name: 'Barcola – Lungomare', area: 'Barcola', lat: 45.6650, lng: 13.7560, price: 2.0, covered: 0, notes: 'Posto all’aperto sul lungomare, ombra parziale nel pomeriggio. Attenzione al mercato domenicale.', rating: 5, review: 'Vista mare, consigliato.' },
  { name: 'Porto Vecchio', area: 'Porto Vecchio', lat: 45.6480, lng: 13.7640, price: 1.5, covered: 1, notes: 'Parcheggio coperto in zona Porto Vecchio, ingresso da Via Armando Diaz. Sorveglianza 24h.', rating: 4, review: 'Sicuro e tranquillo.' },
  { name: 'Via Carducci', area: 'Centro', lat: 45.6515, lng: 13.7705, price: 2.2, covered: 0, notes: 'Cortile interno scoperto in Via Carducci, ingresso stretto: preferire auto compatte.', rating: 5, review: 'Silenzioso e centrale.' },
  { name: 'Stadio Nereo Rocco', area: 'Stadio', lat: 45.6420, lng: 13.8000, price: 2.0, covered: 0, notes: 'Posto scoperto accanto allo stadio. Nei giorni di partita il prezzo può variare: concordare con il proprietario.', rating: 4, review: 'Perfetto per la partita.' }
];

function seedDemo() {
  let owner = db.prepare('SELECT id FROM users WHERE phone = ?').get('+390000000001');
  if (!owner) {
    const r = db.prepare(`INSERT INTO users(role, name, phone, email, password_hash, phone_verified)
                          VALUES('owner', ?, ?, ?, ?, 1)`)
      .run('Example Owner', '+390000000001', 'examples@parktrieste.local', hashPassword(crypto.randomBytes(16).toString('hex')));
    owner = { id: Number(r.lastInsertRowid) };
  }

  const pastDates = ['2026-10-02', '2026-10-11', '2026-10-18', '2026-10-25', '2026-11-01', '2026-11-08', '2026-11-12'];
  const insListing = db.prepare(`INSERT INTO listings(owner_id, name, address, area, lat, lng, price_hour, covered, notes, photos, status, is_example)
                                 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'approved', 1)`);
  const insAvail = db.prepare(`INSERT INTO availability(listing_id, weekday, "start", "end", blocked_dates) VALUES(?, ?, ?, ?, '[]')`);
  const insBooking = db.prepare(`INSERT INTO bookings(code, listing_id, driver_name, driver_phone, date, "start", "end", price, fee, status)
                                 VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, 'confirmed')`);
  const insReview = db.prepare('INSERT INTO reviews(booking_id, rating, comment) VALUES(?, ?, ?)');
  const insPay = db.prepare('INSERT INTO payments(booking_id, fee_paid, stripe_reference) VALUES(?, 1, ?)');

  EXAMPLES.forEach((ex, i) => {
    const r = insListing.run(owner.id, ex.name, ex.area + ', Trieste', ex.area, ex.lat, ex.lng, ex.price, ex.covered, ex.notes);
    const listingId = Number(r.lastInsertRowid);
    for (let wd = 0; wd < 7; wd++) insAvail.run(listingId, wd, '08:00', '20:00');
    const code = `PT-9${String(i + 1).padStart(3, '0')}`;
    const b = insBooking.run(code, listingId, 'Example Driver', '+390333000000' + i, pastDates[i], '10:00', '12:00', ex.price * 2);
    const bookingId = Number(b.lastInsertRowid);
    insReview.run(bookingId, ex.rating, ex.review);
    insPay.run(bookingId, 'example_' + code);
  });
}

function removeExamples() {
  const ids = db.prepare('SELECT id FROM listings WHERE is_example = 1').all().map(r => r.id);
  if (!ids.length) return 0;
  const ph = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM reports WHERE listing_id IN (${ph})`).run(...ids);
  db.prepare(`DELETE FROM listings WHERE id IN (${ph})`).run(...ids);
  // Remove the demo owner if it has no other listings.
  const owner = db.prepare('SELECT id FROM users WHERE phone = ?').get('+390000000001');
  if (owner && !db.prepare('SELECT 1 FROM listings WHERE owner_id = ? LIMIT 1').get(owner.id)) {
    db.prepare('DELETE FROM users WHERE id = ?').run(owner.id);
  }
  return ids.length;
}

function nextBookingCode() {
  const row = db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(code, 4) AS INTEGER)), 0) AS n FROM bookings WHERE code LIKE 'PT-0%'").get();
  return 'PT-' + String((row.n || 0) + 1).padStart(4, '0');
}

module.exports = { db, init, seedDemo, removeExamples, hashPassword, verifyPassword, nextBookingCode, DB_PATH };
