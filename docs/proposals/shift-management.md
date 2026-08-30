# Shift Management (New Product)

**Status:** draft — feature scope agreed 2026-08-31; domain model and API
design still open. Promote to implementation-ready before starting work.

A second product alongside order management: staff shift scheduling for
the same restaurants. Sold independently — a store may subscribe to
either product or both.

## Architecture decisions (agreed)

- **Same monorepo, same platform.** New SPA `apps/shift`; routes added to
  the existing API Worker; tables in the shared D1 schema. `stores` and
  `members` are the roster shifts schedule against — this is the main
  reason a separate app was rejected (D1 has no cross-database queries,
  so "separate app with shared auth" would mean sharing the DB anyway or
  building an identity service).
- **Product gating via entitlements, not deployment.** A `subscriptions`
  table (store_id, product, plan, status) records what each store has;
  a `requireEntitlement("shift")` middleware layered on `requireStore`
  gates shift routes. Pricing plans attach here later.
- **Auth stays shared.** Existing sessions/members/Magic Link auth is
  reused as-is. No separate identity service — the extraction seam
  already exists in `@order/core` `domain/auth` if the suite ever needs
  one.

## Scope — the core loop

Every surveyed product (Airシフト, らくしふ, 7shifts) is built around
this loop; without all four steps it is not usable in a real store.

1. **Availability collection** — staff submit availability and day-off
   requests from their phone, against a submission deadline, with
   reminders for non-submitters.
2. **Schedule building** — manager view that shows submitted
   availability and, per time slot **and position**, required headcount
   vs. assigned headcount (shortage/surplus visibility). Named shift
   patterns (early/mid/late) to assign quickly.
3. **Publish** — staff see their own confirmed shifts; whole-schedule
   print / CSV export for the back office wall.
4. **Post-publish changes** — the part real operation lives on: absence
   reporting, staff-to-staff shift swap with manager approval, and an
   open-shift board where a vacated slot is offered to eligible staff.

## What makes it practical (also in scope)

- **Positions** per store (kitchen, hall, …); members hold position
  assignments. Required headcount is per position, not just per hour.
- **Per-member work constraints** — available weekdays/time bands and a
  weekly hour cap, since restaurant staffing is students/part-timers
  with individually different patterns.
- **Labor-law warnings at build time** (warn, never block — matching
  surveyed products): 8h/day and 40h/week limits, statutory breaks
  (45 min over 6h, 60 min over 8h), one rest day per week, late-night
  band 22:00–05:00, minors' late-night/hours restrictions.
- **Estimated labor cost** — per-day/per-staff rough total from hourly
  wage × scheduled hours.

## Non-goals

- **Time clock / attendance (勤怠打刻) and payroll** — schedules are
  plans, not actuals. Same boundary order-manager drew for payments
  (record the payment, no processor integration). The data model should
  merely not preclude an actuals table later.
- **AI auto-scheduling** — shortage/surplus visibility makes manual
  building workable; auto-fill is a differentiator, not a requirement.
- **LINE / external messaging integration** — in-app views and the
  existing polling-based alert pattern suffice at first.
- **Cross-store help coordination / multi-store views** — single-store
  scoping, like the rest of the platform.

## Open decisions (resolve to become implementation-ready)

- Domain model: positions, availability requests, schedule periods
  (weekly? half-month? monthly?), shift/slot granularity, and the state
  machines for swap and open-shift workflows.
- Whether managers and staff share one `apps/shift` SPA gated by the
  existing owner/staff roles (likely, mirroring `apps/admin`), or staff
  get a separate lightweight surface.
- Notification mechanism for reminders/approvals — reuse the order
  board's polling + alert watermark pattern, or defer reminders to v2.
- `subscriptions` bootstrap: how existing stores are grandfathered into
  the order product when the table is introduced.
- Plan/pricing shape — out of scope for v1 design, but the
  `subscriptions` schema should not preclude per-plan limits.
