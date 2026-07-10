# UX Refinements: Order Progress & Board Aging

**Status:** ready for implementation — drafted 2026-07-11 (roadmap Phase 3, items 4–5)

Two small, purely presentational items bundled into one proposal — no
API or schema changes.

## 1. Order progress for customers

The customer bootstrap already returns per-item `status`
(`ordered`/`served`, plus `cancelled` once Phase 2 ships) — the order
SPA just doesn't show it.

- On the current-order summary, tag each line:
  `注文済み` (ordered) / `提供済み` (served); cancelled lines struck
  through per the cancellation design.
- Refresh strategy: the order screen currently loads state on mount and
  after mutations. Add gentle polling (~10 s) **only while an active
  order exists**, so a seated customer sees "served" ticks appear without
  reloading. No polling on the empty/menu-only state.

## 2. Order board aging indicators

Orders should visually escalate as they wait.

- Age = oldest **unserved** item's `created_at` (an order whose items are
  all served is "done waiting" regardless of when it opened).
- Thresholds: ≥ 10 min → warning style; ≥ 20 min → alert style. Constants
  in the component; token-based colors from `@order/ui`
  (no hardcoded hex, per DESIGN.md).
- Show elapsed time ("12分") on each card, ticking with the existing 5 s
  poll — no extra timers.

## Testing

- Order SPA: line status labels render per status; polling starts/stops
  with active-order presence (fake timers).
- Admin: threshold styling at boundary values; age computed from oldest
  unserved item, ignoring served/cancelled ones.
