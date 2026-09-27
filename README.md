# GlossGo Mobile Detailing — Anambra

A real, working booking system for GlossGo, a mobile car detailing business serving Awka, Onitsha, Nnewi, Ekwulobia and surrounding areas in Anambra State, Nigeria. Owner-operated by Matt (solo owner). Every booking persists in the database and appears on the owner dashboard immediately — time slots are genuinely computed, never hardcoded.

**Live site:** https://gloss-go-auto-book.lovable.app

## What it does

### Customer side
- **Landing page** — premium detailing brand first, dark surfaces with an electric-blue accent. Hero video, About section, three package cards with "Book This", live customer reviews, footer.
- **Multi-step booking** (`/book`) — one decision per screen with back navigation: vehicle type → package → address (town picker) → available slots → price summary → contact info → 30% deposit via Flutterwave → confirmation.
- **Real availability** — candidate slots in 15-minute increments across 8:00 AM – 6:00 PM (Africa/Lagos), 7 days a week. A slot is valid only if `start + travel buffer + duration ≤ close` and the range doesn't overlap any existing appointment's `[start − buffer, end)`. Filtering happens server-side; the database also enforces no-overlap with an exclusion constraint as the final race-condition guard.
- **Real payments** — the deposit step opens Flutterwave's hosted checkout (card, bank transfer, USSD) in test or live mode. A booking is created only after Flutterwave verifies the payment, with one final availability re-check immediately before insert. A webhook catches payments where the customer closed the tab before returning.
- **My Booking** (`/my-booking`) — customers look up their booking with a 6-character confirmation code (phone as fallback), then reschedule (availability re-checked, same code preserved) or cancel.
- **Reviews** — visitors post real reviews with a 1–5 star rating; the average shows once genuine reviews exist.

### Owner side
- **Dashboard** (`/dashboard`) — PIN-locked. Live metrics (bookings, deposits collected, admin time saved at 8 min/booking), upcoming appointments, activity feed, abandoned leads with follow-up action, and cancel controls. Polls every 5 seconds.

## Business rules

| | |
|---|---|
| Hours | 8:00 AM – 6:00 PM, 7 days (Africa/Lagos) |
| Currency | Nigerian Naira, e.g. ₦25,000 |
| Deposit | 30% of total price, due today |
| Vehicles | Sedan, SUV, Truck, Van, Coupe |
| Travel buffer | Awka & environs 15 min · Onitsha 35 · Nnewi 40 · Ekwulobia 30 · default 25 |
| Service area | Anambra State towns only — enforced server-side |

**Packages** (SUV/Truck/Van add +20 min and +₦5,000 to Full and Premium only):

| Package | Duration | Price |
|---|---|---|
| Express Wash | 30 min | ₦8,000 |
| Full Detail | 90 min | ₦25,000 |
| Premium Detail | 150 min | ₦40,000 |

## Tech

- **TanStack Start** (React 19, Vite 7) with server functions; Tailwind CSS v4, no extra UI libraries.
- **Lovable Cloud (Postgres)** — tables: `appointments` (with `block_start` and a no-overlap exclusion constraint), `activity_log`, `leads`, `reviews`, `pending_payments`. RLS enabled with no public policies; all access goes through server functions using the admin client.
- **Flutterwave** integration via server-side secret keys; payment completion is idempotent by `appointments.payment_tx_ref` so the webhook and browser return can safely race.
- Scheduling rules live in one pure shared module (`src/lib/glossgo.ts`) used by both client and server; leads become "abandoned" 3 minutes after creation if not converted.
- Owner PIN is verified server-side with a constant-time comparison.

## Development

```bash
bun install
bun run dev
```

Set `OWNER_PIN`, `FLW_SECRET_KEY` and `FLW_WEBHOOK_SECRET` as project secrets (managed in Lovable) — see Lovable Cloud → Secrets.

Deployed on Lovable; the `main` branch syncs with the Lovable project.
