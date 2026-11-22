'use strict';
const config = require('./env');

let client = null;

// Stripe is optional: the app still runs in pilot mode without keys.
function enabled() {
  return Boolean(config.stripeSecretKey && /^sk_(test|live)_/.test(config.stripeSecretKey));
}

function get() {
  if (!enabled()) return null;
  if (!client) client = new (require('stripe'))(config.stripeSecretKey);
  return client;
}

function cents(value) {
  return Math.max(0, Math.round(Number(value) * 100));
}

function ownedAccountOptions(accountId) {
  return accountId ? { stripeAccount: accountId } : undefined;
}

// Onboard a parking owner as an Express connected account (direct charges).
async function createExpressAccount(owner) {
  const s = get();
  if (!s) throw new Error('Stripe non configurato / Stripe not configured');
  return s.accounts.create({
    type: 'express',
    country: 'IT',
    email: owner.email || undefined,
    metadata: { parktrieste_owner_id: String(owner.id) },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true }
    }
  });
}

async function createOnboardingLink(accountId, baseUrl) {
  const s = get();
  if (!s) throw new Error('Stripe non configurato / Stripe not configured');
  return s.accountLinks.create({
    account: accountId,
    refresh_url: `${baseUrl}/owner/connect`,
    return_url: `${baseUrl}/owner/connect/return`,
    type: 'account_onboarding'
  });
}

async function accountStatus(accountId) {
  const s = get();
  if (!s || !accountId) return { chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false };
  const acc = await s.accounts.retrieve(accountId);
  return {
    chargesEnabled: Boolean(acc.charges_enabled),
    payoutsEnabled: Boolean(acc.payouts_enabled),
    detailsSubmitted: Boolean(acc.details_submitted)
  };
}

/**
 * Create a Checkout Session as a DIRECT CHARGE on the owner's connected account.
 * ParkTrieste collects a fixed EUR 1 application fee (Stripe requires it to be
 * smaller than the charge, so it is skipped on bookings of EUR 1 or less).
 */
async function createBookingCheckout({ booking, listing, owner, baseUrl }) {
  const s = get();
  if (!s) throw new Error('Stripe non configurato / Stripe not configured');
  if (!owner.stripe_account_id) throw new Error('Il proprietario non è collegato a Stripe');

  const amountCents = cents(booking.price);
  if (amountCents < 50) throw new Error('Importo troppo basso per Stripe');
  const feeCents = amountCents > 100 ? 100 : 0;
  const meta = {
    booking_code: String(booking.code),
    listing_id: String(listing.id),
    owner_id: String(owner.id)
  };
  const code = encodeURIComponent(booking.code);
  return s.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: {
          name: `ParkTrieste — ${listing.name}`,
          description: `${booking.date} ${booking.start}-${booking.end}`
        },
        unit_amount: amountCents
      },
      quantity: 1
    }],
    ...(feeCents ? { payment_intent_data: { application_fee_amount: feeCents, metadata: meta } } : {}),
    client_reference_id: String(booking.code),
    metadata: meta,
    success_url: `${baseUrl}/booking/${code}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/booking/${code}?canceled=1`
  }, ownedAccountOptions(owner.stripe_account_id));
}

async function retrieveSession(sessionId, accountId) {
  const s = get();
  if (!s) return null;
  return s.checkout.sessions.retrieve(sessionId, ownedAccountOptions(accountId));
}

function constructEvent(payload, signature) {
  const s = get();
  if (!s || !config.stripeWebhookSecret) throw new Error('Webhook Stripe non configurato');
  return s.webhooks.constructEvent(payload, signature, config.stripeWebhookSecret);
}

module.exports = {
  enabled, get, cents, createExpressAccount, createOnboardingLink, accountStatus,
  createBookingCheckout, retrieveSession, constructEvent
};
