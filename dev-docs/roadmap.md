# Roadmap

Phased plan from the current MVP to a production-ready product. Phases
are ordered by "what blocks a real restaurant from running a full day on
this", not by implementation convenience. Within a phase, items are
roughly priority-ordered.

Conventions:

- Each item links to the feature spec describing the gap and to its
  design doc in `proposals/`. **Design docs are pre-written for every
  item**: Phase 2–3 proposals are implementation-ready; Phase 4–5 are
  sketches whose open decisions must be resolved (and the doc promoted
  to "ready") before starting.
- Items are implemented one at a time following
  [reference/implementation-loop.md](reference/implementation-loop.md)
  (tests → implementation → review → commit, per slice) — invoked via
  the `/implement-item` skill.
- When an item ships: mark it **✅ Shipped** here, fold its proposal
  into the relevant spec, delete the proposal, and repoint the item's
  link to that spec (see `dev-docs/README.md`). This makes "the next
  unshipped item" mechanically findable across sessions.
- Phase numbering continues from Phase 1 ("core business cycle",
  shipped). The `payments.method` schema comment already reserves
  Phase 4 for payment methods; numbering here keeps that promise.

## Status summary

| Phase | Theme | Status |
| --- | --- | --- |
| 1 | Core business cycle | ✅ Shipped |
| 2 | Operate a real day | ✅ Shipped |
| 3 | Customer experience | ✅ Shipped |
| 4 | Money: payments, receipts, adjustments | ✅ Shipped (item 4 deferred, backlog) |
| 5 | Team, scale, and account lifecycle | 🔜 Next |
| — | Engineering track (parallel) | Ongoing |

---

## Phase 2 — Operate a real day

**Goal:** a single pilot restaurant can run open-to-close without anyone
touching the database. Exit criterion: one real (or realistically
simulated) full service day with zero manual DB intervention.

1. **✅ Shipped — Order cancellation & correction**
   → [order-fulfillment](specs/features/order-fulfillment.md),
   [checkout](specs/features/checkout.md),
   [customer-ordering](specs/features/customer-ordering.md),
   [domain-model](specs/domain-model.md)
   The largest operational gap: today no mistake is recoverable. Staff
   can void items, un-serve, reopen a requested bill, and cancel a whole
   order; customer self-cancel is deferred (decision in
   customer-ordering.md's Known limitations).
2. **✅ Shipped — Sales history & daily summary**
   → [checkout](specs/features/checkout.md), [domain-model](specs/domain-model.md)
   Payments were write-only. A date-ranged payments API and an admin
   sales page answering "today: ¥X across N checks".
3. **✅ Shipped — New-order alert on the order board**
   → [order-fulfillment](specs/features/order-fulfillment.md)
   Sound + visual badge when polling picks up new orders or appended
   items.
4. **✅ Shipped — Store settings**
   → [authentication](specs/features/authentication.md), [domain-model](specs/domain-model.md)
   Edit store name; change owner email with re-verification via Magic
   Link to the new address.
5. **✅ Shipped — Seat lifecycle fixes**
   → [seats-and-qr](specs/features/seats-and-qr.md), [domain-model](specs/domain-model.md)
   Rename, retire seats that have order history, and rotate QR tokens
   for leaked codes.
6. **✅ Shipped — Auth rate limiting** *(deploy-blocking, see engineering track)*
   → [authentication](specs/features/authentication.md), [reference/auth.md](reference/auth.md), [reference/deploy.md](reference/deploy.md)
   Throttle signup/login/email-change per store (Worker-enforced) and
   per IP (Cloudflare WAF, deploy config) to protect the Resend quota
   and victims' inboxes.

## Phase 3 — Customer experience

**Goal:** the customer-facing menu competes with a laminated menu +
photos, and customers stop needing to flag down staff.

1. **✅ Shipped — Menu item descriptions & photos**
   → [menu-management](specs/features/menu-management.md#item-photos-apimenuitemsidimage-apimenuimageskey),
   [customer-ordering](specs/features/customer-ordering.md),
   [domain-model](specs/domain-model.md)
   Largest customer-UX gap; first feature to touch R2 storage.
   Descriptions rode along as a plain schema addition.
2. **✅ Shipped — Item options / modifiers**
   → [menu-management](specs/features/menu-management.md#item-options--modifiers-apimenuoption-groups),
   [customer-ordering](specs/features/customer-ordering.md),
   [domain-model](specs/domain-model.md)
   Option groups (size, toppings) with price deltas, plus a free-text
   note per item. The biggest schema change in the roadmap.
3. **✅ Shipped — Staff call**
   → [customer-ordering](specs/features/customer-ordering.md#calling-staff-post-apiorderseattokencall),
   [order-fulfillment](specs/features/order-fulfillment.md#staff-calls-apiadmincalls),
   [domain-model](specs/domain-model.md)
   A "call staff" button on the order screen surfacing on the order
   board with the same alert mechanism as new orders.
4. **✅ Shipped — Order progress for customers**
   → [customer-ordering](specs/features/customer-ordering.md#order-progress)
   Show per-item ordered/served status on the customer screen (data
   already exists).
5. **✅ Shipped — Order board aging indicators**
   → [order-fulfillment](specs/features/order-fulfillment.md#aging-indicators-client-side-only-no-api-change)
   Visual escalation for orders waiting too long.

## Phase 4 — Money: payments, receipts, adjustments

**Goal:** checkout handles real-world Japanese payment flows, not just
exact cash.

Implementation order deviated from the priority order below: item 1 →
item 3 → item 2 → item 5, so the receipt view (item 2) could render
discounts (item 3) from the start instead of needing a revisit.

1. **✅ Shipped — Cashless payments**
   → [checkout](specs/features/checkout.md#completing-payment-post-apipayments)
   `payments.method` extended to `'card' | 'qr'`; recorded at a
   staff-operated terminal, no processor integration.
2. **✅ Shipped — Receipts (レシート)**
   → [customer-ordering](specs/features/customer-ordering.md#digital-receipt-get-apiorderseattokenreceiptorderid),
   [checkout](specs/features/checkout.md#tax-breakdown),
   [domain-model](specs/domain-model.md)
   Digital receipt with a per-rate tax breakdown. Formal 領収書
   (addressee receipt) stayed out of scope.
3. **✅ Shipped — Adjustments**
   → [checkout](specs/features/checkout.md#completing-payment-post-apipayments)
   Whole-check discounts, bounded and recomputed server-side; per-item
   comps deferred to Phase 2's item-void.
4. **Split billing — deferred (backlog).** No pilot demand signal yet;
   the proposal itself scoped this to ship last and "only on real
   demand." Revisit if/when a real store asks for it. Design sketch:
   [payments-expansion](proposals/payments-expansion.md).
5. **✅ Shipped — Payment void/refund**
   → [checkout](specs/features/checkout.md#voiding-a-payment-patch-apipaymentsidvoid),
   [domain-model](specs/domain-model.md)
   All-or-nothing void with an audit trail (`void_reason`, row kept, not
   deleted); reopens the order for correction and re-settlement.

## Phase 5 — Team, scale, and account lifecycle

**Goal:** more than one person per store; more than a handful of stores
on the platform.

Design sketch: [team-and-scale](proposals/team-and-scale.md) — covers
all items below, including constraints earlier phases must not violate.

1. **Staff accounts & roles** → [staff-accounts-roles](proposals/staff-accounts-roles.md)
   Owner invites staff by email; roles (owner / staff) gate settings vs.
   daily operations. Sessions become per-person; "log out everywhere" and
   sliding expiry (`sessions.last_used_at`) land here.
2. **Account lifecycle tooling** — set/unset `suspended` (the intended
   billing-enforcement hook), account deletion with data export.
3. **Analytics** — item-ranking and time-of-day sales reports on top of
   Phase 2 sales data; CSV export.
4. **Real-time push** — replace 5s polling with SSE or Durable Objects
   if pilot feedback shows polling latency/cost actually hurts.
5. **Platform admin** — a minimal internal view of stores/health once
   store count makes SQL-by-hand impractical.

## Engineering track (parallel, not a phase)

Sequenced against product needs rather than after them:

- **Production deployment** — *before or with Phase 2's pilot*: real D1
  `database_id`, production origins/cookie domain, Resend secrets, and a
  smoke checklist (`dev-docs/reference/deploy.md` has the runbook).
  Auth rate limiting (Phase 2 item 6) is shipped; the WAF per-IP config
  step in that runbook is still a required manual action before public
  exposure. Phase 3 item 1 (menu photos) added a real R2 bucket
  creation step to the same runbook.
- **CI deploy** — manual `wrangler deploy` is fine until the pilot;
  automate on `main` once deploys become routine.
- **Browser E2E** — API-level cycle coverage exists
  (`business-cycle.test.ts`); add a Playwright smoke of the three SPAs
  around the Phase 2 pilot.
- **Observability** — Workers analytics/log tail is enough now; add
  error alerting before the pilot goes unattended.
- **Backups** — D1 time-travel/export procedure documented before real
  sales data exists (i.e., before the pilot).

## Explicitly not planned (non-goals)

See [product-overview.md](specs/product-overview.md): POS hardware,
reservations, inventory, multi-location, native apps, takeout/delivery.
Revisit only with concrete user demand.
