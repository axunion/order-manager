# Product Overview

Mobile order and point-of-sale SaaS for small restaurants in Japan.
Customers scan a QR code at their table to browse the menu and order from
their own phone; staff manage orders, serving, and checkout from a browser.

## Target users

| Actor | Description | App |
| --- | --- | --- |
| Owner | Restaurant owner-operator. Signs up, configures the menu and seats, and is currently the only admin account. | `apps/signup`, `apps/admin` |
| Staff | Floor/kitchen staff using the owner's logged-in session on a shared device. No individual accounts yet. | `apps/admin` |
| Customer | Diner seated at a table. Anonymous — identified only by the seat QR token. No account, no app install. | `apps/order` |

Primary segment: small independent restaurants (1 location, a handful of
staff) that want to reduce order-taking labor without POS hardware. One
store = one tenant = one owner email.

## Core value proposition

1. **Zero-hardware setup** — sign up, print QR codes, done. Runs entirely
   on Cloudflare Workers; no tablets or POS terminals required.
2. **Self-service ordering** — customers order and request the bill from
   their phone; staff only deliver food and take payment.
3. **Single source of truth** — orders, serving status, and payments live
   in one place with per-store isolation.

## Current scope (Phase 1 — shipped)

The full business cycle works end to end, verified by
`apps/api/src/routes/business-cycle.test.ts`:

Store registration → Magic Link email verification → menu setup →
seat/QR issuance → customer orders → admin order board (5s polling) →
serve items → customer requests payment → cash checkout → paid.

## Out of scope (deliberate non-goals for now)

- **POS hardware integration** — no receipt printers, cash drawers, or
  kitchen printers.
- **Reservations / waitlist** — ordering starts at the table.
- **Inventory management** — `is_available` is a manual toggle, not stock
  tracking.
- **Multi-location chains** — one store per account.
- **Native mobile apps** — all three frontends are SPAs.
- **Takeout / delivery** — dine-in only.

These are non-goals to keep the product simple; revisit only with real
user demand. Everything else that is missing is *planned* work — see
[roadmap.md](../roadmap.md).

## Pricing / business model

Undecided. Nothing in the codebase depends on a billing model yet; the
`stores.status = 'suspended'` state is the intended hook for future
subscription enforcement.

## Related documents

- [Domain model](./domain-model.md) — entities, state machines, invariants
- [Feature specs](./features/) — per-feature behavior, current and planned
- [Roadmap](../roadmap.md) — phased plan toward a production-ready product
- [Auth design](../reference/auth.md) — technical auth architecture
