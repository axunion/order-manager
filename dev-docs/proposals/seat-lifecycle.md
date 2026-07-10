# Seat Lifecycle (Rename, Soft-Delete, QR Rotation)

**Status:** ready for implementation — drafted 2026-07-11 (roadmap Phase 2, item 5)

Seats today can only be created, and can never be deleted once they have
any order history (FK constraint). Fix the full lifecycle.

## Schema

`seats` gains `is_active` (`integer` boolean, NOT NULL, default `true`).
Additive migration, no table rebuild. Historical queries (sales, old
orders) keep working because the row — and its name — survives forever.
The hard-`DELETE` endpoint is **removed**; soft-delete replaces it
entirely (a seat that was never used could be hard-deleted, but two code
paths for one concept isn't worth it).

## API (requireStore)

| Endpoint | Behavior |
| --- | --- |
| `PATCH /api/seats/:id` | Body `{ name }` (same 1–100 rule as create). Rename only. |
| `DELETE /api/seats/:id` | Soft-delete: sets `is_active = false`. 409 if the seat has an active (`open`/`payment_requested`) order. Idempotent on already-inactive seats. |
| `POST /api/seats/:id/rotate-qr` | Generates a fresh `qr_token` (UUID). Old printed QR 404s immediately. 409 while an order is active on the seat (rotating mid-meal would strand the customer). Returns the updated seat. |
| `GET /api/seats` | Returns **active seats only** by default; `?include_inactive=true` includes retired ones (admin history views). |

`requireSeat` (customer middleware) must reject inactive seats with the
same 404 as unknown tokens — a retired table's QR is dead.

## Admin UI — SeatManager

- Per-seat actions: rename (inline edit), "retire" (confirm dialog,
  replaces delete), "reissue QR" (confirm dialog warning that printed
  codes stop working, then re-show the QR for printing).
- Retired seats hidden by default; a "show retired" toggle lists them
  (no un-retire in v1 — create a new seat instead; revisit if pilot
  asks).

## Testing

- Worker tests: rename validation/isolation; soft-delete blocks on
  active order and is idempotent; rotated token — old 404s, new works;
  inactive seat rejected by `requireSeat`; list filtering with and
  without `include_inactive`.
- Update the existing seat-deletion test (409-on-referenced-orders) to
  the new soft-delete semantics.
- Frontend tests: retire/reissue confirm flows, retired-seat toggle.
