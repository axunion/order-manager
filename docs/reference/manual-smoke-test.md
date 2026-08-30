# Manual Smoke Test (Local)

A simple checklist for walking the full business cycle by hand across the
three SPAs before/after making changes locally. Mirrors the flow already
covered by `apps/api/src/routes/business-cycle.test.ts`, but exercised
through the actual UIs instead of raw API calls.

## Setup

1. Copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` (gitignored).
   `ENVIRONMENT=development` enables the `[DEV]` Magic Link shortcuts below
   — without it you'd need to read the link from the Worker console log
   instead.
2. `pnpm db:reset` — start from a clean local D1.
3. Start all four dev servers (separate terminals, or `pnpm dev` to run
   them in parallel):
   - `pnpm dev:api` — Worker API, `http://localhost:8787`
   - `pnpm dev:signup` — `http://localhost:5175`
   - `pnpm dev:admin` — `http://localhost:5173`
   - `pnpm dev:order` — `http://localhost:5174`

## Walkthrough

1. **Sign up** (`localhost:5175`) — register a store with a name and
   email. On the "check your email" screen, click the `[DEV]` link to
   verify instead of checking an inbox.
2. **Log in to admin** (`localhost:5173`) — you should already be
   redirected in as the new owner after verification; if not, use the
   login form (again via its `[DEV]` link).
3. **Menu setup** (admin → Menu) — add at least one category-free menu
   item with a price. Optionally add a description/photo and an option
   group to touch Phase 3 behavior.
4. **Seat/QR issuance** (admin → Seats) — create a seat and open its QR
   / order link.
5. **Customer order** (`localhost:5174`, using the seat link from step 4)
   — browse the menu, add the item to the cart, submit the order.
6. **Order board** (admin → Board) — confirm the new order appears
   (within the 5s poll) with a new-order alert, then mark item(s) served.
7. **Customer requests payment** (order app) — request the bill from the
   customer screen.
8. **Checkout** (admin → Board or the order's detail view) — complete a
   cash payment for the order; confirm it moves to paid/settled.
9. **Sales report** (admin → `/reports`) — confirm the completed order's
   total shows up in today's numbers.

## What to watch for

This is a manual check, not a substitute for automated tests — use it to
catch what tests don't: layout/UI regressions, console errors/warnings in
the browser devtools, and the 5s polling actually reflecting cross-app
state changes (order board picking up the customer's order, customer
screen picking up served status).

## Resetting between runs

`pnpm db:reset` wipes local D1 and re-applies migrations, so you can
repeat the walkthrough from a clean slate.
