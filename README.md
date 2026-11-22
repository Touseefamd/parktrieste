# ParkTrieste

Mobile-first parking marketplace for Trieste, Italy. Owners list empty spaces, drivers request them, the operator confirms, and the driver pays the owner directly. ParkTrieste charges a fixed €1 booking fee through a Stripe Payment Link.

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
| `STRIPE_PAYMENT_LINK` | The Payment Link for the €1 fee. ParkTrieste appends `?client_reference_id=PT-0000` so the booking code travels with the payment. | Stripe Dashboard → Payment Links → Create link |
| `STRIPE_SECRET_KEY` | Server-only key. Used only if you add server-side Stripe calls; never put it in front-end code. Leave blank in pilot mode. | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Optional. Lets Stripe auto-mark the fee paid via `POST /webhook/stripe`. | Stripe Dashboard → Webhooks → Add endpoint |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Optional. Sends owner notification emails. Leave blank to use WhatsApp only. | Your email provider |

### Stripe setup (important)

1. In Stripe, create a **Payment Link** for a one-time **€1.00** payment.
2. Paste its URL into `STRIPE_PAYMENT_LINK`.
3. The app adds `client_reference_id=<booking code>` to the link when the driver clicks "Pay €1". In Stripe you will see the code on the payment.
4. In pilot mode the operator can mark the fee paid manually in `/admin`. For automatic marking, add a webhook endpoint pointing to `https://YOUR-DOMAIN/webhook/stripe`, subscribe to `checkout.session.completed`, and set `STRIPE_WEBHOOK_SECRET`.

The driver pays the **owner** directly (cash, bank transfer or Satispay). ParkTrieste never holds the owner's money. Owners handle their own taxes — this is stated in the footer, terms and confirmation flow.

## Main routes

- `/` — driver home + search (area, date, from, until)
- `/results` — schematic price-pin map + list
- `/space/:id` — details + request form + report button
- `/booking/:code` — confirmation, WhatsApp message, Step 2 Stripe payment
- `/owner` — owner login / register / phone verification / dashboard
- `/owner/new` — free listing form
- `/admin` — approve listings, accept view, mark €1 paid, CSV, monthly totals, remove examples
- `/legal/terms`, `/legal/privacy`, `/legal/cancellation` — legal pages
- `/admin/export.csv` — CSV export
- `/webhook/stripe` — optional Stripe webhook

## Seed data

Seven listings tagged **Example** are inserted on a fresh database. The operator can remove all of them with the "Remove example listings" button in `/admin` once real owners join.

## Deployment (free, permanent — Railway)

1. Sign up at https://railway.com with GitHub (no credit card needed on the Free plan).
2. New Project → Deploy from GitHub repo → choose this repository.
3. In the service settings, add a **Volume** mounted at `/data`.
4. Add these variables in the service's Variables tab:
   - `DB_PATH=/data/parktrieste.sqlite`
   - `PORT=3000` (Railway may set this itself — leave its value if present)
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
