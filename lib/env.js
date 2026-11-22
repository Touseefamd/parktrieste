'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ENV_PATH = path.join(__dirname, '..', '.env');

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  const text = fs.readFileSync(ENV_PATH, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv();

const config = {
  port: Number(process.env.PORT || 3000),
  baseUrl: (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me',
  adminEmail: (process.env.ADMIN_EMAIL || 'admin@parktrieste.it').toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  whatsappOperator: process.env.WHATSAPP_OPERATOR || '+390401234567',
  googleSiteVerification: process.env.GOOGLE_SITE_VERIFICATION || '',
  stripePaymentLink: process.env.STRIPE_PAYMENT_LINK || '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'ParkTrieste <noreply@parktrieste.it>'
  }
};

module.exports = config;
