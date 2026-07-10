# Menu Item Descriptions & Photos

**Status:** ready for implementation — drafted 2026-07-11 (roadmap Phase 3, item 1)

Items are name + price only. Add descriptions and photos — the largest
customer-UX gap. First feature to touch R2.

## Schema

`menu_items` gains (additive migration):
- `description` — text, nullable, ≤ 500 chars (Zod).
- `image_key` — text, nullable. R2 object key, not a URL, so the serving
  origin can change without touching data.

## Storage & serving

- New R2 bucket bound as `IMAGES` in `apps/api/wrangler.jsonc` (+ local
  Miniflare binding for tests; document creation in
  `reference/deploy.md`).
- Serve through the API Worker: `GET /api/menu/images/:key` streams from
  R2 with `Cache-Control: public, max-age=31536000, immutable` (keys are
  content-unique, see below) and correct Content-Type. No auth — menu
  images are public by nature. Rationale vs. a public r2.dev domain: one
  origin to configure, CORS-free, and the edge cache absorbs the load.
- Key format: `menu/{store_id}/{item_id}/{random}.{ext}` — the random
  segment makes each upload a new immutable URL (no stale-cache
  problem on replacement).

## Upload flow

- `PUT /api/menu/items/:id/image` (requireStore): raw binary body,
  `Content-Type` must be `image/jpeg | image/png | image/webp`, size cap
  **1 MB** (413 otherwise). Writes to R2, updates `image_key`, deletes
  the previous object (best-effort, `waitUntil`). Returns the updated
  item.
- `DELETE /api/menu/items/:id/image`: clears `image_key`, deletes the
  object.
- **Resizing happens client-side** (canvas downscale to max 1200 px long
  edge, JPEG ~0.8 quality) before upload. Workers cannot resize natively
  and Cloudflare Images is a paid product — revisit only if uploads in
  the wild look bad.
- Item `DELETE` also best-effort-deletes its image object.

## UI

- Admin MenuPage: description textarea on the item form; image picker
  with client-side downscale + preview; remove-image button.
- Customer order screen: photo (with fixed aspect placeholder to avoid
  layout shift) and description on each item card; items without images
  keep a compact layout — photos must not become mandatory.

## Deferred (tracked, not designed here)

- Allergen/dietary labels — schema slot fits alongside `description`;
  decide the label taxonomy with pilot feedback.
- Category images, multiple photos per item.

## Testing

- Worker tests (Miniflare provides R2): upload → served bytes round-trip,
  content-type/size rejection, replacement deletes old object, tenant
  isolation on all three endpoints, cache headers.
- Frontend tests: form with/without image, downscale helper (stub
  canvas), customer card rendering with and without photo.
