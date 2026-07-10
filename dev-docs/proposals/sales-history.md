# Sales History & Daily Summary

**Status:** ready for implementation — drafted 2026-07-11 (roadmap Phase 2, item 2)

Payments are currently write-only. Add read access and an admin sales
page answering "how much did we make today, across which checks?".

## API

### `GET /api/payments?from=<unix_ms>&to=<unix_ms>` (requireStore)

- Returns payments with `paid_at >= from AND paid_at < to`, newest first,
  each joined with its order's seat name and line items (reusing the
  existing seat-name + items-by-order assembly pattern from
  `payments.ts` / `admin-orders.ts`).
- Validation: both params required, integers, `from < to`, range ≤ 62
  days (400 otherwise). No pagination — a two-month window at small-
  restaurant volume stays well under response limits; revisit with
  Phase 5 analytics.
- Response item: `{ id, order_id, seat_name, total_amount, method,
  paid_at, items }` where `items` includes cancelled lines flagged by
  status (they explain the bill, but their amounts are already excluded
  from `total_amount`).

No summary endpoint: the client computes count/total from the list. Add
one only when analytics (Phase 5) needs server-side aggregation.

## Day boundaries (JST)

Timestamps are Unix ms (UTC-based); business days are JST. The **client**
converts: a "day" is `[00:00 JST, 24:00 JST)` computed via
`Date` with `Asia/Tokyo` — put the helper in `@order/core`
(`domain/time.ts`) with unit tests covering the UTC+9 offset and
year/month edges. The API stays timezone-agnostic (pure ms range).

## Admin UI — SalesPage

- New nav entry + route `/sales`.
- Date picker (default: today, JST), prev/next day arrows.
- Header stats: total revenue, check count, average per check.
- List of checks: time, seat name, total, expandable line items
  (cancelled lines struck through).
- No polling — manual refresh on date change is enough for a
  retrospective view.

## Testing

- Worker tests: range filtering (inclusive/exclusive bounds), validation
  errors, tenant isolation (two stores, same window), cancelled items
  flagged but excluded from totals.
- Core tests: JST day-boundary helper.
- Frontend tests: stats computation, empty day, date navigation.

## Out of scope (later phases)

- CSV export, item-ranking, time-of-day charts → Phase 5 analytics.
- Refund display → Phase 4 (no refunds exist yet).
