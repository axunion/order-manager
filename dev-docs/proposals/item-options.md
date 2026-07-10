# Item Options / Modifiers

**Status:** ready for implementation, review the schema before starting —
drafted 2026-07-11 (roadmap Phase 3, item 2). The largest schema change
in the roadmap.

Size/topping choices with price deltas, plus a free-text note per line
item ("no onions").

## Schema

Option groups are **store-level and reusable** across items (a "Size"
group attaches to every drink; per-item groups would force duplication):

```
option_groups        id, store_id, name, min_select (default 0),
                     max_select (default 1), sort_order
options              id, store_id, group_id, name, price_delta (int JPY,
                     may be negative, CHECK: unit price + deltas > 0
                     enforced in code), sort_order
menu_item_option_groups   menu_item_id, group_id, sort_order   (join)
order_item_options   id, store_id, order_item_id,
                     name_snapshot, group_name_snapshot,
                     price_delta_snapshot
```

- `order_items` gains `note` (text, nullable, ≤ 200 chars).
- Snapshot semantics extend to options: the bill never changes when the
  owner edits option definitions. Line total =
  `(unit_price_snapshot + Σ price_delta_snapshot) × quantity` — this
  changes `sumOrderItems`'s contract; it must now receive items *with*
  their option deltas. Update the helper + all four call sites together.
- `min_select`/`max_select` express "choose exactly one size" (1/1) and
  "up to 3 toppings" (0/3). Server validates on order submission.

## API

- Admin CRUD under `/api/menu/option-groups` (+ nested options), plus
  attach/detach on the item form
  (`PATCH /api/menu/items/:id` gains `option_group_ids`).
- Customer bootstrap (`GET /api/order/:seatToken`) embeds each item's
  groups + options (only what's attached — payload stays small).
- `POST /api/order/:seatToken/items` input items gain
  `option_ids: string[]` and `note`. Validation per item: every option
  belongs to a group attached to that menu item; per-group selection
  count within min/max; 400 with a specific message otherwise.
- Order payloads everywhere (customer, board, pending, sales) include
  options and note per line — the kitchen must see them.

## UI

- Admin: option-group manager (likely a section within MenuPage);
  attach groups on the item form.
- Customer: item detail sheet replacing the current one-tap add when an
  item has groups or when note-taking is enabled; one-tap add stays for
  plain items.
- OrderBoard/Checkout: render option lines + note under each item.

## Sequencing note

Ship **after** menu-photos (independent, but the customer item card and
admin item form are both rewritten here — doing photos first avoids
rebasing that UI twice). Receipts (Phase 4) will need option deltas in
the tax breakdown; the snapshot table already carries what's needed.

## Testing

- Core tests: new `sumOrderItems` with deltas, negative deltas,
  quantity interaction.
- Worker tests: group CRUD + isolation; submission validation matrix
  (unattached option, over max, under min, foreign store's option);
  snapshots survive option edits; totals correct at checkout.
- Frontend tests: detail-sheet selection rules, note entry, board
  rendering.
