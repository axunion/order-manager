# Receipts & Tax Breakdown

**Status:** ready — open decisions resolved 2026-07-19 (roadmap Phase 4,
item 2). Ships after payments-expansion.md's adjustments (item 3), so
the receipt view renders discounts from the start — see that doc's
"Interactions to respect". 領収書 (formal receipt) stays out of scope,
per its own section below.

## Tax model

Prices are tax-inclusive JPY. For a dine-in-only product every sale is
standard-rate 10% (the 8% reduced rate applies to takeout, which is a
product non-goal). But receipts must still show the breakdown, and the
schema shouldn't assume 10% forever:

- `menu_items` gains `tax_rate` (integer percent, default 10). The
  admin UI does **not** expose it in v1 — it exists so historical data
  is correct if takeout or rate changes ever arrive.
- `order_items` gains `tax_rate_snapshot` (same snapshot rule as price).
- Breakdown math (inclusive): `tax = total − round(total / 1.10)` per
  rate bucket, computed in `@order/core` with unit tests (rounding rule:
  round half down per item-bucket — verify against National Tax Agency
  guidance during implementation; this is the doc's main open point).

## Digital receipt (レシート — no paper printing, per product non-goals)

- After checkout, the customer's order screen (their `qr_token` is still
  valid) shows a "レシートを表示" link for the just-paid order: seat,
  line items with options, totals, tax breakdown, store name, paid_at,
  payment method.
- API sketch: `GET /api/order/:seatToken/receipt/:orderId` — seat-scoped
  (only orders belonging to that seat), so the URL is not guessable
  beyond what the QR already grants. Available only for `paid` orders.
- Admin side: SalesPage order detail doubles as the staff-facing receipt
  view (reprint questions → show the screen).

## 領収書 (formal receipt with addressee)

**Resolved: out of scope for this pass.** A formal 領収書 needs the
store's registered name/address and an addressee line, and often paper
— none of which exists yet. Not building speculatively; sketch (a
printable HTML view with an addressee input, generated from the same
data) stays here for if it's ever demanded.

## Sequencing

1. Tax metadata columns (cheap, additive) ship first — schema is
   already settled by Phase 3's menu work.
2. Digital receipt view ships after payments-expansion.md's
   adjustments (item 3), so it renders discounts from day one instead
   of needing a revisit.
