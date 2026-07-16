# Staff Call

**Status:** ready for implementation — drafted 2026-07-11 (roadmap Phase 3, item 3)

A "call staff" button on the customer order screen, surfacing on the
admin order board with the Phase 2 alert mechanism.

## Schema

```
staff_calls   id, store_id, seat_id, status ('open' | 'resolved'),
              created_at, resolved_at (nullable)
```

Index on `(store_id, status)`. CHECK on status; CHECK
`status != 'resolved' OR resolved_at IS NOT NULL`.

## API

- `POST /api/order/:seatToken/call` (requireSeat) — creates an `open`
  call. **Idempotent per seat**: if an open call already exists for the
  seat, return it with 200 instead of stacking duplicates (this is also
  the abuse throttle — one open call per table, resolved by staff).
  Response `{ data: { id, status, created_at } }`, 201 when new.
- `GET /api/admin/calls?status=open` (requireStore) — list, oldest
  first, joined with seat name. Default `open`; `all` for history.
- `PATCH /api/admin/calls/:id/resolve` (requireStore) — idempotent,
  sets `resolved_at`.

## UI

- Customer: a persistent but unobtrusive "呼び出し" button; after
  tapping, it shows "スタッフを呼んでいます" until the call is resolved
  (state comes from re-fetch/polling of a lightweight call-status probe —
  simplest: include the seat's open call in the order bootstrap payload
  and poll it with the existing order refresh).
- Admin: OrderBoard gains a banner strip of open calls (seat name +
  elapsed time + resolve button). Reuses the new-order alert sound/
  highlight helpers (`playAlertBeep` and the highlight-timer logic in
  `apps/admin/src/components/OrderBoard.tsx`, documented in
  [order-fulfillment.md](../specs/features/order-fulfillment.md)) —
  calls beep too; this is the second consumer that justifies extracting
  the alert helpers into a shared module within `apps/admin`.

## Testing

- Worker tests: create/idempotent-duplicate/resolve/isolation; resolved
  call allows a fresh one; bootstrap embeds the open call.
- Frontend tests: button state transitions; banner rendering, resolve
  flow, alert firing on a new call.
