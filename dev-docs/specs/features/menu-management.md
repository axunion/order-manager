# Feature: Menu Management

Owner-managed catalog of categories and items, edited in `apps/admin`
(MenuPage), consumed read-only by the customer order screen.

## Current behavior

All endpoints require the `session_token` cookie (`requireStore`).

### Categories (`/api/menu/categories`)

- `GET` — list, ordered by `sort_order`.
- `POST` / `PATCH /:id` — name (1–100 chars) and `sort_order` (int ≥ 0).
- `DELETE /:id` — items in the category are **not** deleted; their
  `category_id` becomes null (uncategorized).

### Items (`/api/menu/items`)

- `GET` — list, ordered by `sort_order`. Admin sees all items including
  unavailable ones.
- `POST` / `PATCH /:id` — fields: name (1–100 chars), price (positive
  integer, tax-inclusive JPY), optional `category_id`, `sort_order`,
  `is_available` (default true).
- `DELETE /:id` — permanent. Historical order items are unaffected
  because they carry name/price snapshots.

### Availability toggle

`is_available = false` (sold out / hidden) removes the item from the
customer menu and blocks ordering it (409 with the item name), but keeps
it visible in admin for re-enabling.

## Known limitations (→ roadmap)

- **No description or photo** — items are name + price only. Photos need
  an R2 bucket and upload flow. (Phase 3, the single biggest customer-UX
  gap)
- **No options/modifiers** — no size, toppings, doneness, or free-text
  requests. (Phase 3)
- **No allergen / dietary info.** (Phase 3, alongside descriptions)
- **No tax-rate metadata** — needed for 8%/10% receipt breakdown.
  (Phase 4)
- **No menu scheduling** — no lunch/dinner menus or time-limited items.
  (Backlog)
- Deleting an item that sits in an *active* order is allowed; the order
  keeps its snapshot but the kitchen may be surprised. Acceptable for
  now; revisit with cancellation work. (Phase 2, note only)
