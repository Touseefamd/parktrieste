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
  // Single inbox for all operator/site notifications. Change in Railway Variables.
  notificationEmail: (process.env.NOTIFICATION_EMAIL || 'triesteparking@gmail.com').toLowerCase(),
  reportToken: process.env.REPORT_TOKEN || '',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  whatsappOperator: process.env.WHATSAPP_OPERATOR || '+390401234567',
  // Public ownership token shown in page source for Google Search Console.
  googleSiteVerification: process.env.GOOGLE_SITE_VERIFICATION || '5NJq95Tvz6iDZLPIKQAJ9hM7nduzpguMV6-jeiX-Wh4',
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

// Never boot on a public host with the well-known development credentials.
// Railway sets RAILWAY_ENVIRONMENT; local runs normally use the .env file.
const inProduction = Boolean(process.env.RAILWAY_ENVIRONMENT) || process.env.NODE_ENV === 'production';
if (inProduction) {
  const required = [
    ['SESSION_SECRET', config.sessionSecret, 'dev-only-insecure-secret-change-me'],
    ['ADMIN_PASSWORD', config.adminPassword, 'admin123']
  ];
  for (const [name, value, insecureDefault] of required) {
    if (!value || value === insecureDefault) {
      throw new Error(`${name} must be set to a unique value in production`);
    }
  }
}

module.exports = config;
