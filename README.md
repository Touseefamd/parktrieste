# ParkTrieste

Mobile-first parking marketplace for Trieste, Italy. Owners list empty spaces, drivers request them, the operator confirms, and the driver pays the owner directly. ParkTrieste charges a fixed €1 booking fee via Stripe Connect (Express accounts, direct charges) with a Payment Link fallback for pilot mode.

## Live deployment

- Site: **https://parktrieste-production.up.railway.app**
- Source: **https://github.com/Touseefamd/parktrieste**
- Host: Railway Free (GitHub repo connected, auto-deploy on push to `main`)
- Database: SQLite on a persistent Railway volume `parktrieste-volume`, mounted at `/app/data`
- Operator login: `admin@parktrieste.it` (password is in the Railway service variables; change it before real use)
- WhatsApp number and Stripe Payment Link are placeholders until you add your own values in Railway → service → Variables.

## Run locally

```bash
cd parktrieste
npm install
cp .env.example .env      # then edit .env
npm start
```

Open http://localhost:3000. On first run the database is created at `data/parktrieste.sqlite` and seeded with 7 example listings.

Node 22.5+ is required for the built-in `node:sqlite` module. No database server is needed.

## Settings you must fill in (all in `.env`)

| Setting | What it is | Where to get it |
|---|---|---|
| `PORT` | Local port. Keep `3000` unless your host requires another. | Your choice |
| `BASE_URL` | Public URL used in links. Use the real HTTPS URL when deployed. | Your host |
| `SESSION_SECRET` | Long random string used to sign sessions. Generate with `openssl rand -hex 32`. Never share it. | Generate locally |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Login for the operator panel at `/admin`. Change both before going public. | Your choice |
| `WHATSAPP_OPERATOR` | Your business WhatsApp in E.164 (e.g. `+390401234567`). Receives booking messages and owner-request links. | Your WhatsApp Business number |
| `GOOGLE_SITE_VERIFICATION` | Optional. The `content` value of Google's HTML verification tag. Adds `<meta name="google-site-verification">` to every page. | Google Search Console → Add property → HTML tag |
| `STRIPE_SECRET_KEY` | Server-only key. Enables Stripe Connect: owners onboard as Express accounts, drivers pay by card/wallet, ParkTrieste keeps €1 as an application fee. Leave blank in pilot mode. Never expose in front-end code. | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Optional. Verifies and auto-marks payments/refunds/account status via `POST /webhook/stripe`. | Stripe Dashboard → Webhooks → Add endpoint |
| `STRIPE_PAYMENT_LINK` | Pilot fallback for the €1 fee when Connect is off. ParkTrieste appends `?client_reference_id=PT-0000`. | Stripe Dashboard → Payment Links → Create link |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Optional. Sends owner notification emails. Leave blank to use WhatsApp only. | Your email provider |

### Stripe setup (important)

**Recommended — Stripe Connect (marketplace):**

1. Set `STRIPE_SECRET_KEY` to a Stripe **test** key (`sk_test_...`) inside Railway Variables. The app stays in pilot mode until this is set.
2. Enable **Connect** in Stripe and use **Express accounts** with **direct charges** (the charge is created on the owner's connected account; ParkTrieste collects a €1 `application_fee_amount`).
3. Each verified owner taps **"Connect your Stripe account"** on their dashboard (`/owner`), completes Stripe's hosted onboarding, and receives parking payments directly in their own Stripe account.
4. When a confirmed booking's driver taps **"Pay by card or wallet"**, the app creates a Stripe-hosted Checkout Session on the owner's account with the booking code in metadata. Stripe's hosted page is mobile-first and supports Italian wallets (Satispay, cards).
5. Add a webhook endpoint `https://YOUR-DOMAIN/webhook/stripe` and set `STRIPE_WEBHOOK_SECRET`. Subscribe to: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `account.updated`. Events are idempotent (deduplicated in the DB).
6. Refunds (24h cancellation rule) are handled on the owner's connected account; the `charge.refunded` webhook flips the local payment state back.

**Pilot fallback (no keys):** create a **Payment Link** for a one-time **€1.00** payment, set `STRIPE_PAYMENT_LINK`, and the driver is sent there with `?client_reference_id=<booking code>`. The operator can also mark the fee paid manually in `/admin`.

Owners handle their own taxes and collect parking payments directly from Stripe — ParkTrieste only takes its €1 platform fee. This is stated in the footer, terms and confirmation flow. **Before taking real payments**, confirm EU marketplace VAT / deemed-supplier rules with an Italian tax advisor and complete Stripe's live-mode onboarding (identity, bank, etc.).

## Main routes

- `/` — driver home + search (area, date, from, until)
- `/parcheggi/:slug` — crawlable neighbourhood landing pages (`centro`, `stazione`, `cattinara`, `barcola`, `porto-vecchio`, `stadio`, `silos`)
- `/robots.txt`, `/sitemap.xml` — SEO discovery files
- `/results` — schematic price-pin map + list (intentionally `noindex,follow`)
- `/space/:id` — details + request form + report button
- `/booking/:code` — confirmation, WhatsApp message, Step 2 Stripe payment
- `/booking/:code/pay` — starts Stripe Checkout (Connect) or redirects to the Payment Link fallback
- `/owner` — owner login / register / phone verification / dashboard (with Stripe Connect onboarding)
- `/owner/connect`, `/owner/connect/return` — Express account onboarding start / return
- `/owner/new` — free listing form
- `/admin` — approve listings, accept view, mark €1 paid, CSV, monthly totals, remove examples
- `/legal/terms`, `/legal/privacy`, `/legal/cancellation` — legal pages
- `/admin/export.csv` — CSV export
- `/webhook/stripe` — optional Stripe webhook

## Google SEO (free organic traffic)

The app is built to be indexable: every public page has a unique localized `<title>` and meta description, a keywords meta tag with the full target phrase list, a self-referencing canonical URL, Italian/English (`it`, `en`, `x-default`) hreflang links, Open Graph/Twitter tags and JSON-LD structured data (including FAQ schema on the home page). `/robots.txt` blocks private and action URLs and points to `/sitemap.xml`, which lists the home page, seven neighbourhood landing pages (including Silos), the legal pages and every real (non-example) approved listing.

To get Google to show it:

1. Open [Google Search Console](https://search.google.com/search-console) and add the property using the URL prefix of your live site.
2. Verify ownership with the **HTML tag** method: copy only the `content="..."` value into the Railway variable `GOOGLE_SITE_VERIFICATION`, redeploy, then click Verify. (Alternatively upload the HTML file to `public/`.)
3. Submit `https://<your-domain>/sitemap.xml` under **Sitemaps** in Search Console.
4. Add real listings and internal links from social/business profiles. Indexing and ranking take weeks to months; no one can guarantee a #1 position.

`?lang=en` renders the English version and is the URL used by the `en` hreflang tag; the clean URL is the Italian default (`x-default`).

## Seed data

Seven listings tagged **Example** are inserted on a fresh database. The operator can remove all of them with the "Remove example listings" button in `/admin` once real owners join.

## Deployment (free, permanent — Railway)

1. Sign up at https://railway.com with GitHub (no credit card needed on the Free plan).
2. New Project → Deploy from GitHub repo → choose this repository.
3. In the service settings, add a **Volume** mounted at `/app/data` (command palette → New Service → Volume → choose the service → mount path `/app/data`).
4. Add these variables in the service's Variables tab:
   - `DB_PATH=/app/data/parktrieste.sqlite`
   - `PORT` — leave Railway's generated value (currently 8080); the app listens on whatever `PORT` says
   - `BASE_URL=https://<your-service>.up.railway.app`
   - `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
   - `WHATSAPP_OPERATOR`, `STRIPE_PAYMENT_LINK` (add later)
5. Generate a public domain: Settings → Networking → Generate Domain.
6. Redeploy. The SQLite database now lives on the persistent volume and survives restarts.

Free-plan notes: $0/month with $1/month usage credit, 0.5 GB RAM, 500 MB volume, 1 project. Services sleep after 5–10 minutes without traffic and wake on the next request (a short cold start). No custom domains on Free. Good enough for a pilot; upgrade to Hobby ($5/mo) for always-on and custom domains.

## Other deployment options

Any Node host with a persistent disk works (Oracle Cloud Always Free, Fly.io, a small VPS).

Example for a VPS with systemd:

```ini
[Service]
WorkingDirectory=/srv/parktrieste
ExecStart=/usr/bin/node server.js
Restart=always
EnvironmentFile=/srv/parktrieste/.env
```

Put a reverse proxy (nginx/Caddy) with TLS in front and set `BASE_URL=https://your-domain`.

GitHub Pages / Netlify static hosting will **not** work — this app needs Node for the database, sessions and admin panel.

## Credits

Hero image: [Panorama of Trieste from Monte Grisa in the sunset light](https://commons.wikimedia.org/wiki/File:Trieste,_panorama_della_citt%C3%A0_nella_luce_del_tramonto_(dicembre_2020)_1.jpg) by Giuseppe Basile, via Wikimedia Commons, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). It is cropped for the banner and credited in the site footer.
