# Feature: Seats & QR Codes

Physical tables registered in `apps/admin` (SeatsPage / SeatManager).
Each seat's QR code is the customer's only credential.

## Current behavior

All endpoints require the `session_token` cookie (`requireStore`).

- `GET /api/seats` — list, ordered by creation time.
- `POST /api/seats` — creates a seat with a fresh `qr_token` (UUID v4).
  The admin UI renders the QR code client-side (`qrcode` package) linking
  to `{ORDER_ORIGIN}/order/{qr_token}` for printing.
- `DELETE /api/seats/:id` — blocked with 409 if **any** order (including
  historical paid ones) references the seat, because `orders.seat_id` is
  NOT NULL. In practice a seat that has ever been used cannot be deleted.

The `qr_token` is the security boundary for customers: possession of the
URL grants ordering rights for that seat. Tokens are unguessable UUIDs
and never expire.

## Known limitations (→ roadmap)

- **No seat rename** — no PATCH endpoint; fixing a typo means delete +
  recreate, which is impossible once the seat has orders. (Phase 2,
  small)
- **Seats with history can never be deleted** — `orders.seat_id` is
  NOT NULL, so any order history blocks the FK delete. (Phase 2)
- **No QR token rotation** — if a printed QR leaks (photo posted online,
  reused after the table moved), the only fix is deleting the seat, which
  the above makes impossible. Rotation regenerates `qr_token` and
  invalidates old printouts. (Phase 2)
- **No occupancy view** — admin cannot see "which tables are currently
  active" at a glance outside the order board. (Backlog, likely falls
  out of a table-status dashboard)
