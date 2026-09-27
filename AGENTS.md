<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Architecture rules
- All DB access goes through server functions in src/lib/booking.functions.ts using the admin client; tables have RLS on with no public policies — keeps customer data off the public API.
- Scheduling rules live in src/lib/glossgo.ts (pure, shared) — one source of truth for pricing, buffers, and slot math on client and server.
- Occupied range = [block_start, end_time) where block_start = start_time - travel buffer; a Postgres exclusion constraint enforces no overlap — final race-condition guard behind the server re-check.
- All business times are Africa/Lagos; slot times shown to customers are arrival times.
- Abandoned leads = leads not converted and older than 3 minutes (derived at read time, no cron).
- Payment completion is idempotent by appointments.payment_tx_ref so the Flutterwave webhook and browser return can safely race.
- Owner dashboard server fns require OWNER_PIN (checked server-side, constant-time); PIN kept in sessionStorage client-side — solo owner, no accounts needed.
- Service area is enforced server-side: availability throws unless the address matches a known Anambra town keyword; customers pick a town from TOWNS.
