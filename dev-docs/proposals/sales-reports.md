# Sales Reports (Item Ranking, Weekday/Time Breakdown, CSV Export)

**Status:** ready for implementation — drafted 2026-07-20 (roadmap Phase 5,
item 3). Promoted from `team-and-scale.md § 3` after resolving open
decisions with the user.

**Scope decision:** client-side aggregation, not new server endpoints.
`GET /api/payments?from&to` (shipped, Phase 2 item 2) already returns
every payment in range with full line items (including voided payments
and cancelled items, snapshotted). No pilot has launched (no real D1
latency data exists), so there's no signal yet that client-side
aggregation needs a server-side rewrite — `team-and-scale.md`'s own
sketch says the cutover point is "when windows exceed a day or two" of
real pain, which hasn't happened. This item is purely additive: a new
page computing more views over data the API already returns, no schema
or endpoint changes.

**Access:** open to both roles (owner and staff), matching the existing
`/sales` page and `payments.ts`'s router-wide access — not
`requireOwner`-gated. Reports are an operational/business-insight tool,
not a settings action.

## New page: `/reports` (`apps/admin`)

Separate from `/sales` (today's day-by-day running total), since this
page's date-range model is different (multi-day analysis, not
"today"/prev/next-day navigation) and it would clutter `/sales` to bolt
on. Dashboard nav gains a "レポート" link (both roles, alongside 売上履歴).

- **Date range**: reuses `GET /api/payments`'s existing `from`/`to`
  validation (≤ 62 days). Quick presets — 今週 (this week, JST,
  Mon-based via `jstDayRange`-style logic in `@order/core`), 今月 (this
  month, JST) — plus a custom `from`/`to` date picker pair. Defaults to
  今週 on load.
- **Fetch**: one `GET /api/payments?from=&to=` call per range change,
  same as `/sales` does today. All aggregation below runs client-side
  over the returned payments (excluding voided payments from every
  aggregate, same exclusion rule `/sales` already applies) and their
  `order_items` (excluding `cancelled` lines, same rule the board/receipt
  already apply).
- **Item ranking**: aggregates `order_items` by `name_snapshot` across
  all in-range, non-voided payments — sums `quantity` and revenue
  (`(unit_price_snapshot + Σ price_delta_snapshot) × quantity` per line,
  same formula as `sumOrderItems`/receipts, just aggregated across lines
  instead of within one order). Table columns: 商品名, 数量, 売上金額;
  default sort by 売上金額 descending, columns individually clickable to
  re-sort. No pagination — same "small-restaurant volume stays under
  response limits" assumption `/sales` already makes for the 62-day cap.
- **Weekday / time-of-day breakdown**: buckets non-voided payments by
  `paid_at`'s JST weekday (7 buckets) and JST hour-of-day (24 buckets),
  summing `total_amount` and a check count per bucket. Two small
  tables/bar-chart-style bars (reusing existing CSS tokens, no new
  charting dependency — simple `<div>` bars sized by `%` of the bucket
  max, matching the project's "no new dependency for a simple visual"
  bias).
- **CSV export**: one "CSVダウンロード" button per table (item ranking;
  weekday breakdown) — generates a CSV client-side from the already-
  computed aggregate (no server round-trip) and downloads it via the
  same `Blob` + `URL.createObjectURL` + attached-anchor pattern
  `StoreSettings.tsx`'s account-export already established (including
  its append-before-click and revoke-on-a-delay fixes — reuse that
  exact download helper, don't reinvent it inline).

## Testing

- Frontend (`apps/admin`, vitest + happy-dom):
  - Item ranking aggregates quantity/revenue correctly across multiple
    payments and multiple lines of the same item name; excludes voided
    payments and cancelled lines from the totals; sorts by revenue
    descending by default; re-sorts on column click.
  - Weekday/time-of-day buckets sum `total_amount` correctly per bucket
    and exclude voided payments.
  - Date-range presets (今週/今月) compute the expected `from`/`to` query
    params; custom range respects the existing 62-day validation (shows
    the API's error message on 400, doesn't crash).
  - CSV download button triggers the shared download helper with the
    expected filename/content shape (same mocking pattern as
    `StoreSettings.test.tsx`'s delete-export test: `vi.spyOn(URL,
    "createObjectURL"/"revokeObjectURL")` + stubbed
    `HTMLAnchorElement.prototype.click`, not a full `URL` global
    replacement).
  - Empty state (no payments in range) renders without error.
- No worker/API tests needed — no `apps/api` changes in this item.

## Interactions to respect

- Reuses `GET /api/payments` as-is; no schema or endpoint changes.
- The voided-payment and cancelled-line exclusion rules must match
  `/sales`'s existing behavior exactly — don't silently redefine what
  counts as revenue.
- Extract the download helper (`Blob`/`createObjectURL`/anchor pattern)
  from `StoreSettings.tsx` into a shared location (e.g.
  `apps/admin/src/lib/download.ts`) rather than duplicating it, since
  this item is the second call site.
