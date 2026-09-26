# GlossGo Scheduler

Build "GlossGo Mobile Detailing" — a fully functional booking system for a mobile car detailing business in Austin, TX, owned by Marcus Reed (solo owner + one assistant). This must be a REAL working application, not a static prototype. Every booking created by a customer must persist in actual data storage and immediately reflect on the owner dashboard. Time slots must be genuinely computed, not hardcoded to look plausible.

TECH REQUIREMENT
Use Supabase (via Lovable's native integration) as the backend. Create an `appointments` table with fields: id, confirmation_code, customer_name, phone, email, vehicle_type, package, duration_minutes, address, travel_buffer_minutes, start_time, end_time, price, deposit_amount, deposit_status (pending/paid/refunded), status (confirmed/rescheduled/cancelled/no_show), created_at, source (booked/rescheduled). All booking creation, rescheduling, and dashboard reads must go through this table — no mock arrays that fake the same view.

confirmation_code should be a short human-readable code (e.g. 6 characters, alphanumeric, uppercase) generated at booking creation, shown to the customer on the confirmation screen, and used as the lookup key on the "My Booking" reschedule page (alongside phone number as a fallback lookup).

===========================================
DATA & SCHEDULING ENGINE (build this first — it's the core of the whole app)
===========================================

Business rules:
- Business hours: 8:00 AM – 6:00 PM, 7 days a week
- Vehicle types: Sedan, SUV, Truck, Van, Coupe
- Packages and BASE duration/price:
  - Express Wash — 30 min — $59
  - Full Detail — 90 min — $189
  - Premium Detail — 150 min — $299
- Vehicle surcharge: SUV/Truck/Van add +20 min and +$20 to Full Detail and Premium Detail only (not Express Wash)
- Travel buffer: maintain a lookup table of Austin neighborhoods/zip codes → buffer minutes (e.g. Downtown/78701: 15 min, South Austin/78745: 25 min, East Austin/78702: 20 min, Domain/North Austin/78758: 30 min, default if unmatched: 20 min). Match the customer's entered address text against this table (simple keyword match on neighborhood name is fine).

Availability calculation (must be REAL, not simulated):
- For a given day, fetch all existing appointments (status != cancelled) from Supabase
- Generate candidate slots across business hours in 15-minute increments
- For each candidate start time, compute required block = travel_buffer + service_duration (including vehicle surcharge)
- A slot is only valid if:
  a) start + required block does not exceed 6:00 PM
  b) the resulting time range does not overlap any existing appointment's [start_time - travel_buffer, end_time] range (i.e. leave room for the buffer before the NEXT appointment too, not just after the previous one)
- Only return genuinely valid slots to the frontend — filtering happens server-side/in the query logic, not just visually greyed out in the UI
- Seed the database with 4-5 existing appointments spread across the next 7 days (different vehicle types/packages/times) so the conflict logic has something real to work around during the demo

===========================================
CUSTOMER BOOKING FLOW
===========================================
Multi-step flow, one decision per screen, progress indicator, back navigation allowed.

1. Vehicle Type — visual cards (Sedan/SUV/Truck/Van/Coupe)
2. Package Selection — three cards showing base price/duration, adjusted live if vehicle surcharge applies (show the math: "Full Detail — SUV: 110 min, $209")
3. Address — text input, matched against the travel-buffer lookup table
4. Available Slots — calls the real scheduling engine described above. Calendar/day picker for next 7 days, then only genuinely valid times for the selected day. Label clearly: "Includes [X] min travel buffer." If a day has zero valid slots, show that day as unavailable rather than empty.
5. Price Summary — full line-item breakdown (base price, surcharge, total)
6. Contact Info + Deposit:
   - Collect name, phone, email FIRST, before showing the payment step. As soon as contact info is submitted, this is the point where an abandoned-lead record becomes eligible to be created (see Leads section below) — do not create a lead before contact info exists.
   - Then show the simulated $25 deposit payment ("Pay $25 Deposit" button, resolves after ~1s, doesn't need live Stripe)
   - On payment submission, BEFORE inserting the appointment: re-run the availability check for the selected slot against current Supabase data (someone else may have booked it in the meantime). If the slot is no longer available, do NOT insert — instead show the customer a "That time was just booked — please choose another" message and send them back to Step 4 with availability recalculated. Only if the slot is still genuinely open, generate the confirmation_code, insert the appointment row (status "confirmed," source "booked," deposit_status "paid"), and only THEN transition to the confirmation screen.
7. Confirmation — "You're booked!" shown only after successful insertion is confirmed by the database write. Display the confirmation_code prominently along with the full booking summary. Also write an activity_log entry here (see Automation Activity feed below).

Immediately after confirmation, that time block must be unavailable to any other customer starting a new booking — verify this is enforced by the query, not just assumed.

===========================================
RESCHEDULE FLOW (must be functional, not decorative)
===========================================
- "My Booking" page/route where a customer looks up their booking by confirmation_code (primary) or phone number (fallback)
- Shows current appointment details
- "Reschedule" button re-runs the real slot-availability engine:
  1. On confirm, UPDATE the existing Supabase row: release the old start_time/end_time (so it stops blocking other slots — do this by either deleting and re-inserting, or updating start_time/end_time/status directly)
  2. Recalculate availability including this release
  3. Customer picks a new valid slot from the real (recalculated) list
  4. Before committing: re-check that the newly selected slot is still available (same race-condition guard as the initial booking)
  5. UPDATE the row with new start_time/end_time, set source to "rescheduled"
  6. Show new confirmation screen with the same confirmation_code (unchanged)
- The dashboard must reflect this change immediately on next load/refresh — old slot open again, new slot occupied

===========================================
OWNER DASHBOARD
===========================================
Read live from the Supabase `appointments` table — no hardcoded display data.

Top metrics strip (computed from real data, not fixed numbers):
- Bookings handled automatically (count of status=confirmed or rescheduled)
- Owner actions required (hardcode this display to 0, since the whole point is zero manual intervention — but frame it as a real metric)
- Deposits collected (sum of deposit_amount where deposit_status = paid)
- Estimated admin time saved (a simple formula: e.g. 8 minutes saved per automated booking × count — display the calculation, doesn't need to be scientifically rigorous, just consistent and clearly derived)

Bookings list:
- Today's/upcoming appointments as cards, sorted by start_time, pulled live from Supabase
- Each card: time, vehicle + package, customer name, address, price, deposit_status, confirmation_code, a "Booked automatically" or "Rescheduled automatically" tag depending on source
- Cards must update when you create/reschedule a booking in another tab/session (poll or use Supabase realtime subscription if straightforward; at minimum, refetch on dashboard mount/focus)

Automation Activity feed:
- A running log of events, most recent first, written whenever a real action happens in the app (booking created, deposit recorded, confirmation sent, reschedule happened, travel buffer applied). Insert a log row to a simple `activity_log` table (timestamp, message) at each of these real trigger points — e.g. when the confirmation screen fires, actually write "Booking confirmed automatically," "$25 deposit recorded," "Confirmation sent," "[X]-minute travel buffer added" as real log entries, not decorative hardcoded text
- Abandoned booking follow-up: a lead record in a `leads` table (name, phone, email, last_step_reached, timestamp) is created ONLY once the customer has submitted contact info in Step 6 and then fails to complete payment (drops off, closes tab, or the flow times out without a successful appointment insert). Do not create lead records for customers who only got as far as Steps 1-5. On the dashboard, show these leads with a "Send Follow-up" button — clicking it updates status to "Follow-up scheduled" and writes an activity log entry. This can be manually triggered for demo purposes but should read/write real data, not be purely cosmetic.

===========================================
LANDING PAGE — DESIGN & INTERACTION SPEC
===========================================
Build using React, TypeScript, Tailwind CSS. This must look like a premium automotive detailing brand first, booking software second.

FONTS
- Heading font: a bold, confident sans-serif (e.g. a Helvetica Now Display-style face, or Inter/Neue Haas as a safe substitute) loaded via Google Fonts or a webfont link in index.html
- Body font: a clean, readable sans-serif companion
- Define as CSS variables in index.css:
```css
:root {
  --font-heading: 'YourHeadingFont', 'Helvetica Neue', Arial, sans-serif;
  --font-body: 'YourBodyFont', 'Helvetica Neue', Arial, sans-serif;
}
body { font-family: var(--font-body); }
```
- Logo wordmark and all major headings use var(--font-heading); everything else uses var(--font-body)

HERO BACKGROUND
- Full-screen background video or high-quality looping video/photo of a car being detailed (glossy paint, water beading, microfiber cloth motion) — position: fixed, inset: 0, z-index: 0, object-fit: cover
- Muted, playsInline, autoplay loop (this should autoplay — the goal is instant premium impression, not an interaction to discover)
- Apply a subtle dark gradient overlay (10-20% black, stronger at top/bottom where text sits) to guarantee text contrast regardless of video brightness
- OPTIONAL, lower priority: on desktop only, add a subtle parallax/scrub effect tied to scroll position (not mouse movement) — scrubbing a few seconds of video as the user scrolls the hero into view. This is a nice-to-have; do not let it delay or complicate the primary booking flow. Skip entirely if it adds meaningful build risk.

NAVBAR (fixed, z-index: 10)
- Fixed to top, full width, px-5 sm:px-8 py-4 sm:py-5, flex row, justify-between, items-center
- Logo (left): "GlossGo" in var(--font-heading), text-[21px] sm:text-[26px], tracking-tight, white
- Desktop nav links (center, hidden below md): "Services", "How It Works", "Reviews" — text-[18px], white, hover:opacity-60 transition-opacity
- Desktop CTA (right, hidden below md): a solid electric-blue button "Book Now" — this is the ONE visually dominant action on the entire page, rounded-full, px-6 py-2.5, font-medium, hover:brightness-110 transition
- Mobile hamburger (visible below md): 3-bar icon, polished open/close animation (top bar rotates 45deg + translates, middle fades, bottom rotates -45deg + translates, duration-300)
- Mobile overlay: fixed inset-0 bg-black/90 backdrop-blur-md, centered nav links at text-[28px], plus a full-width "Book Now" button at the bottom

HERO CONTENT (z-index: 1, over the video)
- Full h-screen, flex column, justify-center on md+, justify-end pb-12 on mobile
- Max-width content container, left-aligned

1. Small blurred/muted intro label (decorative, sets tone, doesn't block anything):
   - font-size clamp(16px, 3vw, 20px), color rgba(255,255,255,0.7), mb-4
   - Text: "Austin's mobile detailing crew"

2. Typewriter headline — THE hook, but keep it short and confident:
   - Text: "Book your detail in 60 seconds. We come to you."
   - Custom useTypewriter hook: text, speed (36ms/char), startDelay (500ms), returns { displayed, done }
   - Rendered large and bold: clamp(32px, 6vw, 56px), var(--font-heading), white, line-height 1.1
   - Blinking cursor while typing (inline-block w-[3px] h-[1em] bg-blue-400, CSS blink animation), disappears when done

3. ONE dominant CTA button, appears via fade-in + slide-up 400ms after page load (independent of typewriter — do not make the user wait for text to finish typing before they can act):
   - Large solid electric-blue pill button: "Book Your Detail →"
   - text-lg sm:text-xl, px-8 py-4, rounded-full, font-semibold, hover:brightness-110 hover:scale-[1.02] transition-all
   - This directly opens Step 1 (Vehicle Type) of the booking flow — no intermediate page
   - Below it, small secondary text link (not a competing button): "See pricing" — text-sm, underline, opacity-70, hover:opacity-100 — scrolls down to a pricing section rather than opening another flow

BELOW THE FOLD (kept minimal per build priority — this is polish, not core function)
- Compact services/pricing section: 3 package cards (Express, Full, Premium) with price + duration, each with a "Book This" button that jumps straight into the flow with that package pre-selected
- A short trust strip: star rating, "500+ Austin cars detailed," 2-3 short testimonial snippets
- Footer: contact info, service area note, socials

INTERACTION PRINCIPLE — DO NOT DILUTE THE PRIMARY ACTION
GlossGo's landing page must have exactly ONE visually dominant action at all times: booking. Every other link (nav items, "See pricing," testimonials) is visually secondary — smaller, unfilled, or text-only. The whole point of this challenge is reducing friction from inquiry to booking; a page with competing pill buttons of equal visual weight works against that goal.

Beyond the landing page, keep this same visual identity consistent throughout: dark, premium surfaces (charcoal/black base), restrained electric-blue accent color, large confident typography, subtle gloss/reflection details, generous spacing, no cramped forms, strong mobile interactions throughout the booking flow. The owner dashboard can be more utilitarian/functional in styling but should retain the same color system and typography for brand consistency.

DEPENDENCIES
React, TypeScript, Tailwind CSS, Vite only for the frontend. No additional UI libraries beyond what's needed for the Supabase integration.

===========================================
BUILD PRIORITY (follow this order strictly — do not sacrifice earlier items for later polish)
===========================================
1. Supabase schema + real scheduling/conflict engine
2. Working customer booking flow using that real engine (including re-check-before-insert on payment)
3. Booking → dashboard live sync
4. Functional reschedule (release/recalculate/reserve, with re-check-before-commit)
5. Deposit + confirmation experience
6. Owner automation/activity feed (real log writes)
7. Landing page visual polish (per the spec above)
8. Abandoned lead follow-up simulation (contact-info-gated)
9. Do NOT build: waitlists, AI agents, route optimization, or messaging/SMS integrations. Keep this version scoped strictly to the core flow above.

===========================================
ACCEPTANCE TEST — must pass before considering this build complete
===========================================
Run this exact sequence and verify each checkpoint:
1. Open the customer booking flow. Select SUV → Full Detail → enter a South Austin address.
2. Confirm the available slots shown exclude any time that would conflict with a seeded existing appointment or run past 6:00 PM once travel buffer + duration + surcharge are applied.
3. Pick a valid slot, enter contact info, pay the simulated deposit.
4. Verify: the system re-checks availability for that slot immediately before insertion, the insert succeeds, and the confirmation screen (with confirmation_code) appears only after the Supabase row exists.
5. Open the owner dashboard (fresh load or refetch, not the same in-memory state). Confirm the new booking appears with status "confirmed," source "Booked automatically," correct price, and correct deposit_status.
6. Confirm matching "Booking confirmed automatically" (and related) entries exist in the Automation Activity feed.
7. Go to "My Booking," look up the appointment via its confirmation_code, and reschedule it to a different valid slot.
8. Confirm: the reschedule re-checks availability on the new slot before committing, the update succeeds, and a new confirmation is shown with the same confirmation_code.
9. Reload the owner dashboard. Confirm: the appointment now shows the NEW time with source "Rescheduled automatically," and the ORIGINAL time slot is available again if you start a new booking flow and check that day.
10. Confirm the owner performed zero manual actions anywhere in this sequence (no manual calendar edit, no manual confirmation, no manual slot assignment).

If any checkpoint fails, fix it before moving on — do not proceed to polish or additional features while the core loop is broken.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/cb5c853c-e2ed-4f82-8aa7-5348ab3b7cb4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
