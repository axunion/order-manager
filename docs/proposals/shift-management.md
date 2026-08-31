# Shift Management (New Product)

**Status:** ready for implementation — promoted 2026-08-31 from the design
sketch after resolving its open decisions with the user: v1 stops at
*publish* (post-publish changes deferred), half-month periods with
arbitrary shift times, one `apps/shift` SPA gated by the existing
owner/staff roles, no reminder notifications in v1, and existing stores
grandfathered into `subscriptions` by a backfill in the same migration.
Roadmap: "Next product".

A second product alongside order management: staff shift scheduling for
the same restaurants. Sold independently — a store may subscribe to
either product or both.

## Architecture decisions (agreed, unchanged from the sketch)

- **Same monorepo, same platform.** New SPA `apps/shift`; routes added to
  the existing API Worker; tables in the shared D1 schema. `stores` and
  `members` are the roster shifts schedule against.
- **Product gating via entitlements, not deployment.** A `subscriptions`
  table records what each store has; `requireEntitlement("shift")`
  layered on `requireStore` gates the shift routes.
- **Auth stays shared.** Existing sessions/members/Magic Link auth is
  reused; the only change is where the verify link lands (§ 7).

## v1 scope and what is deferred

In scope — steps 1–3 of the core loop:

1. **Availability collection** — staff submit availability and day-off
   requests for a period, against a submission deadline.
2. **Schedule building** — a manager grid showing submitted
   availability and, per time slot and position, required vs. assigned
   headcount, with named shift patterns as input templates.
3. **Publish** — staff see their own confirmed shifts; CSV export of the
   whole schedule for the back office.

Also in scope: positions, per-member work constraints (hourly wage,
weekly cap, minor flag), labor-law warnings at build time (warn, never
block), and estimated labor cost.

**Deferred to v2** (do not build, do not test):

- Post-publish changes: absence reporting, staff-to-staff swap with
  manager approval, the open-shift board. These need two more state
  machines and a notification channel; publishing is the smallest thing
  a real store can pilot.
- Submission reminders for non-submitters. v1 shows the manager a
  **non-submitter list** instead; sending reminder mail would mean a
  second outbound mail path beyond Magic Link.
- Standing per-member availability rules (weekday/time bands). The
  per-period submission carries the same information, and "copy the
  previous period" covers the typing. A table that only pre-fills a form
  is not worth its migration yet.
- Per-date overrides of `staffing_requirements` (holidays). v1 keeps the
  weekday template only.
- Plan/pricing enforcement. `subscriptions.plan` exists as a nullable
  column and is unused.

Non-goals stay as in the sketch: no time clock/attendance or payroll, no
AI auto-scheduling, no LINE/external messaging, no cross-store views.

## 1. Schema — entitlements (`packages/db/src/schema.ts`, migration A)

```
subscriptions
  id            text PK, uuid
  store_id      text NOT NULL → stores.id
  plan          text NULL              -- reserved; unused in v1
  product       text NOT NULL          -- enum: order | shift
  status        text NOT NULL 'active' -- enum: active | suspended
  created_at    integer NOT NULL       -- Unix ms
  uniqueIndex idx_subscriptions_store_product (store_id, product)
  check subscriptions_product_chk, subscriptions_status_chk
```

**Grandfathering existing stores.** Append to the generated migration
file, by hand, a backfill giving every existing store the `order`
product:

```sql
INSERT INTO subscriptions (id, store_id, product, status, created_at)
SELECT
  lower(substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-4' || substr(h, 14, 3)
        || '-a' || substr(h, 18, 3) || '-' || substr(h, 21, 12)),
  store_id, 'order', 'active', CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM (
  SELECT id AS store_id, hex(randomblob(16)) AS h
  FROM stores
  WHERE NOT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.store_id = stores.id AND s.product = 'order'
  )
);
```

This is the only place in the repo where a timestamp comes from SQL
rather than `Date.now()` in the Worker — a backfill has no request
context; `strftime` gives second precision, which is enough for one.
The `NOT EXISTS` guard makes the statement replayable, so a partially
applied migration can be re-run instead of aborting on the
`(store_id, product)` unique index. New stores get their `order` row
inside the existing registration write in
`apps/api/src/routes/stores.ts`, and the same file's registration
rollback must delete the subscription before the store it references.

**Existing order-product routes are not gated.** Every store holds
`order`, so a gate there would only add a D1 read per request and put
all 21 existing suites at risk. `requireEntitlement` guards the shift
routes only; `stores.status = 'suspended'` remains the account-level
kill switch, and `subscriptions.status` is the per-product one.

## 2. Schema — shift domain (`packages/db/src/schema.ts`, migration B)

**Date and time representation** — a deliberate, documented departure
from the Unix-ms convention. A shift is stored as a JST *business date*
plus minute offsets:

- `work_date` — `text` `'YYYY-MM-DD'`, the JST business date.
- `start_minutes` / `end_minutes` — `integer`, minutes from that date's
  00:00 JST. An overnight shift ends past midnight as `end_minutes >
  1440` (25:00 → `1500`).

Rationale: D1/SQLite has no date type; the existing code already treats
JST day boundaries as a client-side concern (`jstDayRange`,
`toJstDateString`). Minute integers make duration, the 22:00–05:00
late-night band, weekly totals, and overlap detection plain integer
arithmetic with no timezone math in the Worker, and they keep an
overnight shift attached to the business day it belongs to.

Every table below carries `store_id` (`notNull().references(stores.id)`)
and an index leading with it, per the tenant-isolation rule.

| Table | Columns beyond `id`/`store_id`/`created_at` | Constraints |
| --- | --- | --- |
| `positions` | `name`, `sort_order` (default 0), `is_active` (bool, default true) | `idx_positions_store (store_id, sort_order)` |
| `member_positions` | `member_id` → members, `position_id` → positions | `uniqueIndex idx_member_positions_pair (member_id, position_id)`, `idx_member_positions_store` |
| `member_work_profiles` | `member_id` → members, `hourly_wage` (int JPY, null), `weekly_cap_minutes` (int, null), `is_minor` (bool, default false) | `uniqueIndex idx_member_work_profiles_member (member_id)`, `idx_member_work_profiles_store` |
| `shift_patterns` | `name`, `start_minutes`, `end_minutes`, `sort_order`, `is_active` | `check shift_patterns_time_chk (end > start ≥ 0)`, `idx_shift_patterns_store` |
| `staffing_requirements` | `weekday` (0=Sun…6=Sat), `position_id` → positions, `start_minutes`, `end_minutes`, `required_headcount` | `check` weekday 0–6, headcount ≥ 0, end > start; `idx_staffing_requirements_store_weekday (store_id, weekday)` |
| `schedule_periods` | `start_date`, `end_date`, `status` (enum), `submission_deadline` (Unix ms), `published_at` (Unix ms, null) | `uniqueIndex idx_schedule_periods_store_start (store_id, start_date)`; status check; `schedule_periods_published_chk`: `status != 'published' OR published_at IS NOT NULL` |
| `availability_submissions` | `period_id`, `member_id`, `status` (`draft`\|`submitted`), `submitted_at` (null), `note` (null) | `uniqueIndex idx_availability_submissions_pair (period_id, member_id)`; `status != 'submitted' OR submitted_at IS NOT NULL`; `idx_availability_submissions_store` |
| `availability_entries` | `submission_id`, `work_date`, `kind` (`available`\|`day_off`), `start_minutes` (null), `end_minutes` (null) | `kind != 'available' OR (start_minutes IS NOT NULL AND end_minutes IS NOT NULL)`; `kind != 'day_off' OR (start_minutes IS NULL AND end_minutes IS NULL)`; `idx_availability_entries_submission (submission_id, work_date)`, `idx_availability_entries_store` |
| `shifts` | `period_id`, `member_id`, `position_id` (null), `work_date`, `start_minutes`, `end_minutes`, `break_minutes` (default 0), `note` (null) | `check` end > start, `0 <= break_minutes < end - start`; `idx_shifts_store_date (store_id, work_date)`, `idx_shifts_period (period_id)`, `idx_shifts_member_date (member_id, work_date)` |

`availability_entries` allows several rows per `(submission, work_date)`
so a member can offer two bands in one day; `day_off` is a whole-day row
with null times.

**`schedule_periods.status` state machine:**

```
collecting ──(POST /:id/close-submissions)──► building ──(POST /:id/publish)──► published
```

`published` is terminal. Edits to shifts after publishing take effect
immediately and are visible to staff on their next poll — there is no
versioning and no republish notification; that belongs with the deferred
post-publish flows.

**API-enforced invariants (not DB constraints).** SQLite cannot express
any of these, so each is a check-then-act guard in the route, in the same
category as "a store always has at least one owner". Record them in
`docs/specs/domain-model.md § Invariants (API-enforced)` when folding.

- A member has no two overlapping shifts (compare on `absoluteRange`, so
  an overnight shift is checked against the next morning correctly).
- One `(submission, work_date)` never mixes a `day_off` row with an
  `available` row, and its `available` bands never overlap each other —
  otherwise the schedule builder reads contradictory input.
- **Every FK id that arrives in a request body** (`period_id`,
  `member_id`, `position_id`, `submission_id`) belongs to the caller's
  store. The denormalized `store_id` is the only tenant filter these
  tables have; a mismatched write would be invisible to every
  `store_id`-filtered read, and could later abort another store's account
  deletion. Use the verify-then-operate pattern from
  `apps/api/src/routes/seats.ts` on body ids, not just path ids.

## 3. Core (`packages/core`)

- `src/types/index.ts` — Zod input schemas and response interfaces for
  everything below, following the existing `export const X = z.object(…)`
  + same-named `z.infer` convention. New shared primitives at the top:
  `workDate` (`/^\d{4}-\d{2}-\d{2}$/` plus a real-calendar check, done by
  running the date through `jstDayRange`, which already rejects
  `2024-02-30` instead of rolling it over), `headcount` (`int, 0…999`),
  and a deliberate split for times: `timeOfDay` (`0…1439`) for a start,
  `endOfBand` for an end that may cross midnight. One `minutesOfDay`
  covering both would have let a start time of 1500 through, which the
  DB's canonical-encoding CHECK then rejects as a 500.

  Shipped as `packages/core/src/types/shift.ts` rather than appended to
  `types/index.ts`, which re-exports it: that file is already ~500 lines,
  and this is a separate product.
- **New `src/domain/shift.ts` + `shift.test.ts`** — pure functions, no
  I/O, used by both the SPA and the API:
  - `halfMonthPeriod(dateStr)` → `{ start_date, end_date }` for the
    containing half-month (1–15, 16–end); `periodDates(start, end)` →
    the `YYYY-MM-DD` list.
  - `workedMinutes(shift)` = `end - start - break`;
    `absoluteRange(shift)` → minutes since epoch-day, so overnight
    shifts compare correctly; `overlaps(a, b)`.
  - `lateNightMinutes(shift)` — overlap with 22:00–05:00, i.e. the
    minute bands `[0, 300]` and `[1320, 1740]`.
  - `laborWarnings(shifts, profiles)` → `{ code, member_id, work_date? }[]`
    with codes `DAILY_OVER_8H`, `WEEKLY_OVER_40H`, `BREAK_REQUIRED_45`
    (worked > 6h, break < 45), `BREAK_REQUIRED_60` (worked > 8h, break <
    60), `NO_REST_DAY`, `OVER_WEEKLY_CAP`, `MINOR_LATE_NIGHT`. Weeks are
    JST Monday–Sunday, matching the existing `jstWeekRange` convention.
    **Warnings never block a write.**
  - `coverage(shifts, requirements, dates)` → per date, position and
    band: required vs. assigned, i.e. the shortage/surplus the manager
    grid renders.
  - `estimatedLaborCost(shifts, profiles)` → per-day and per-member JPY
    totals from `hourly_wage × workedMinutes`.

Warnings, coverage and cost are **computed, never persisted**. The API
returns rows; `apps/shift` calls these functions. That keeps the
judgement logic in one unit-tested place and the routes thin.

## 4. Entitlement middleware (`apps/api/src/middleware.ts`)

```ts
export function requireEntitlement(product: "order" | "shift") {
  return createMiddleware<AuthEnv>(async (c, next) => { … });
}
```

A middleware-returning factory — the same shape as `bodyValidator`, the
only existing precedent — layered after `requireStore`. It reads
`c.var.store.id`, does one indexed lookup on
`(store_id, product, status = 'active')`, and on a miss returns
**403 `FORBIDDEN`** ("Shift management is not enabled for this store").
403, not 404: the store and the route both exist and the caller is
authenticated; this is the same category as `requireOwner`'s role
failure, and no new error code is invented. `getStoreBySession` is left
alone so the session shape stays unchanged for every other route.

## 5. API — routes (`apps/api/src/routes/`, mounted in `app.ts`)

All routers are `new Hono<AuthEnv>().use(requireStore).use(requireEntitlement("shift"))`,
with `requireOwner` added router-wide or per-route as noted. Bodies go
through `bodyValidator`; success is `c.json({ data })` (201 on create);
errors use `errorResponse` with the established codes only.

| File | Base path | Endpoints | Roles |
| --- | --- | --- | --- |
| `shift-positions.ts` | `/api/shift/positions` | `GET`, `POST`, `PATCH /:id`, `DELETE /:id` (soft: `is_active = false`) | owner |
| `shift-members.ts` | `/api/shift/members` | `GET` (members + positions + work profile), `PUT /:memberId/positions`, `PUT /:memberId/work-profile` | owner |

`shift-members.ts` is owner-only for a reason worth stating: `hourly_wage`
and `is_minor` are the most sensitive per-person fields in the database, and
the rest of the platform assumes any valid session may read its store's
data. A staff session must never read a colleague's wage or minor status;
if a staff member ever needs their own profile, add a self-only read rather
than widening this route to `requireStore`.
| `shift-templates.ts` | `/api/shift/templates` | `GET/POST/PATCH/DELETE /patterns[/:id]`, `GET/POST/PATCH/DELETE /requirements[/:id]` | owner |
| `shift-periods.ts` | `/api/shift/periods` | `GET`, `GET /:id` (both roles), `POST`, `POST /:id/close-submissions`, `POST /:id/publish` (owner) | mixed |
| `shift-availability.ts` | `/api/shift/availability` | `GET /:periodId/me`, `PUT /:periodId/me` (own submission, both roles), `GET /:periodId` (all members incl. non-submitters) — owner | mixed |
| `shift-schedule.ts` | `/api/shift/schedule`, `/api/shift/shifts` | `GET /schedule/:periodId`; `POST /shifts`, `PATCH /shifts/:id`, `DELETE /shifts/:id` (owner) | mixed |

Behavioral rules the routes must implement:

- **`POST /periods`** — body `{ start_date, end_date, submission_deadline }`.
  Rejects 400 unless the range is a whole half-month (`start_date` day 1
  with `end_date` day 15, or day 16 with the month's last day); a second
  period with the same `start_date` is 409.
- **Transitions** — `close-submissions` requires `collecting`,
  `publish` requires `building`; any other current status is 409,
  including publishing an already-published period. `publish` sets
  `published_at`.
- **`PUT /availability/:periodId/me`** — replaces the caller's entries
  for that period in one `db.batch` (delete-then-insert), and sets
  `status = 'submitted'` + `submitted_at` when the body says so. Allowed
  only while the period is `collecting` → otherwise 409. The
  `submission_deadline` is advisory in v1: the manager closing
  submissions is the enforcement, so a late save is not rejected by
  clock comparison.
- **`GET /schedule/:periodId`** — owner gets every shift plus the
  submissions and requirements the grid needs. Staff get only their own
  shifts, and only once the period is `published`; for an unpublished
  period they get `200` with an empty list and `published: false` (no
  error semantics needed — the period's existence is not a secret from
  its own store's staff).
- **`POST /shifts` / `PATCH /shifts/:id`** — the period, member and
  position must belong to the caller's store (404 on any miss);
  `work_date` must fall inside the period (400); overlapping another
  shift of the same member is 409, compared on `absoluteRange` so
  overnight shifts are handled.
- CSV export is built in the SPA from the schedule response, reusing
  `apps/admin/src/lib/download.ts`'s approach (that helper stays in
  `apps/admin` — see *Interactions to respect*).

## 6. Registration (`apps/api/src/routes/stores.ts`)

Store registration writes the `order` subscription row alongside the
store and owner member, in the existing `db.batch`. No response change.

## 7. Magic Link landing for a second SPA (`apps/api/src/routes/auth.ts`)

`GET /api/auth/verify` currently always redirects to `c.env.ADMIN_ORIGIN`
(`routes/auth.ts:161`, and `:295`/`:319` for failures). Staff logging in
from `apps/shift` must land back there.

- `POST /api/auth/login` accepts an optional `app` field, enum
  `"admin" | "shift"`, and carries it into the verify URL as a query
  parameter (`…/api/auth/verify?token=…&app=shift`).
- `verify` maps that value to an origin from `c.env` —
  `shift` → `SHIFT_ORIGIN`, anything else (missing, unknown) →
  `ADMIN_ORIGIN`. **A fixed env-backed allowlist, never a caller-supplied
  URL**, so there is no open-redirect surface. Failure redirects map the
  same way.
- New env var `SHIFT_ORIGIN` in `apps/api/src/env.d.ts` (both `Env` and
  the `Cloudflare.Env` augmentation), `wrangler.jsonc`,
  `wrangler.test.jsonc`, and the CORS allowlist in `app.ts`.

This is the only change to shipped auth behavior; existing callers that
omit `app` keep landing on admin.

## 8. Frontend (new `apps/shift`)

Scaffolded from the existing SPA template (`package.json`, `vite.config.ts`
with `devServerConfig(5176)`, `vitest.config.ts`, `wrangler.jsonc` with
`assets.directory`, `tsconfig.json`, `index.html`, `src/env.d.ts`,
`src/setup.ts`, `main.tsx`, `App.tsx`) — dev port **5176**.

- `src/layouts/ShiftGuard.tsx` — mirrors `AdminGuard`: `GET /api/auth/me`
  on mount, redirect to `/login` on failure, `StoreContext` +
  `useStoreInfo()` for role. Additionally, a 403 from the first shift
  API call renders a **"shift management is not enabled"** screen rather
  than an error alert — the entitlement landing.
- Owner pages: `/` period list + create, `/periods/:id` the builder grid
  (availability, coverage shortage/surplus per position and band,
  pattern buttons, warnings panel, cost summary, CSV export),
  `/settings` (positions, patterns, requirements, member work profiles).
- Staff pages: `/` my published shifts, `/periods/:id/availability` the
  submission form (with "copy the previous period").
- Role branching follows admin's `<Show when={store.role === "owner"}>`;
  the API is the actual guard, the UI split is UX only.
- `apps/shift/src/styles/shift-tokens.css` imported only from
  `main.tsx`, plus `apps/shift/DESIGN.md` in the same 10-section shape as
  the admin and order design docs.
- No polling in v1 — schedules change on the scale of days, and a
  manual reload is enough. (The order board's 5 s interval + watermark
  pattern is the model to reuse in v2 when swap approvals need it.)

Cross-cutting edits a fourth SPA forces: `apps/api/wrangler.jsonc` +
`wrangler.test.jsonc` vars and the CORS allowlist, `apps/e2e/origins.ts`,
the package table and forbidden-import list in
`docs/reference/monorepo.md`, and the build/deploy block in
`docs/reference/deploy.md`.

## 9. Slices

Following `docs/reference/implementation-loop.md`; one slice = one commit.

1. `subscriptions` + backfill + registration write + `requireEntitlement`
   (schema and its single consumer are too small to split).
2. Shift-domain migration (the nine tables above).
3. `packages/core`: types + `domain/shift.ts`.
4. API: positions, members, templates. Carries an obligation from slice
   1: `requireEntitlement`'s tests mount it on a router built in the test
   file (no shift route existed yet), so this slice owes at least one 403
   asserted through a real endpoint — that is what catches a router that
   forgets the gate.
5. API: periods, availability.
6. API: schedule and shifts, plus the `SHIFT_ORIGIN` / verify-redirect
   change.
7. `apps/shift` scaffold + staff surface (my shifts, submission form).
8. `apps/shift` owner surface (builder grid, settings, CSV) **and** the
   doc fold (Definition of Done items 3–4) in the same commit.

## Testing

**`packages/core` (vitest)**

- `halfMonthPeriod` for the 1st, 15th, 16th, and month end, including
  February in a leap year; `periodDates` returns 15/16 dates.
- `workedMinutes` subtracts the break; `absoluteRange` and `overlaps`
  treat an overnight shift (`end_minutes > 1440`) as adjacent, not
  overlapping, with the next day's morning shift.
- `lateNightMinutes` for a shift wholly outside the band (0), one
  crossing 22:00, one crossing 05:00, and an overnight shift spanning
  both bands.
- `laborWarnings` boundary cases per code: exactly 8h vs. 8h01m daily,
  40h vs. 40h01m weekly (Mon–Sun), 6h00 with a 44-minute break, 8h00
  with a 59-minute break, seven consecutive days worked, a minor
  scheduled into the late-night band, and a member at vs. over
  `weekly_cap_minutes`. Warnings are returned, never thrown.
- `coverage` reports shortage, exact match, and surplus for a band, and
  counts only shifts of the matching position.
- `estimatedLaborCost` totals per day and per member, and treats a null
  `hourly_wage` as excluded rather than zero-cost.
- Zod: `workDate` rejects `2026-02-30` and `2026-2-3`; `minutesOfDay`
  rejects negatives and > 2880.

**Schema constraints (slice 2, inserted through Drizzle — no route exists yet)**

- Every CHECK, unique index and FK in § 2 rejects the shape it exists to
  stop, matched on the constraint's own name, and both boundaries of each
  time check are covered (`>` vs `>=`, and the 1440 / +1440 bounds that
  keep one wall-clock band to one encoding).
- Accepted shapes are asserted too, so an over-broad constraint fails: an
  overnight shift (`end_minutes > 1440`), two availability bands on one
  day, one member holding two positions, one member submitting for two
  periods, two stores holding periods with the same `start_date`, and a
  `required_headcount` of 0.
- The DB defaults later slices lean on: a new period is `collecting`, a
  new position is active with sort order 0, a shift's break defaults to 0.
- The account hard-delete clears all nine tables before the `stores` and
  `members` rows they reference, and leaves a second store's rows intact;
  removing a member (`DELETE /api/staff/:id`) clears that member's shift
  rows and leaves the store's positions alone.
- The three enum CHECKs are unreachable through Drizzle's typed enums, so
  they are covered by the TypeScript types rather than by tests —
  a decision, not an oversight.

**`apps/api` (Workers runtime, `app.request(path, init, env)`)**

- `requireEntitlement`: a store with no `shift` subscription gets 403
  `FORBIDDEN` on a shift route; with one, 200. A `suspended` shift
  subscription is also 403.
- Registration writes exactly one `order` subscription (`active`) for the
  new store; the account hard-delete removes it before the store, and
  leaves another store's subscription alone.
- Every shift resource: happy path, 400 on invalid body, 401 with no
  cookie, **403 for a staff session on an owner-only route**, and
  **404 for another store's row** (positions, patterns, requirements,
  periods, submissions, shifts).
- `POST /periods` rejects a non-half-month range (400) and a duplicate
  `start_date` (409).
- Transitions: `close-submissions` from `building` → 409; `publish` from
  `collecting` → 409; `publish` twice → 409; a successful publish sets
  `published_at`.
- `PUT /availability/:periodId/me` replaces prior entries rather than
  appending; rejects a period that is not `collecting` (409); a staff
  member cannot read another member's submission, and the owner's
  `GET /availability/:periodId` lists non-submitters.
- `POST /shifts`: `work_date` outside the period → 400; an overlapping
  shift for the same member → 409, including the overnight case; a
  `member_id` or `position_id` from another store → 404.
- `GET /schedule/:periodId`: owner sees all shifts; staff see only their
  own; staff on an unpublished period get 200 with an empty list and
  `published: false`.
- `GET /api/auth/verify?app=shift` redirects to `SHIFT_ORIGIN`; an
  unknown or missing `app` still redirects to `ADMIN_ORIGIN`.

**`apps/shift` (vitest + happy-dom)**

- The submission form renders the period's dates, saves a draft, and
  re-opens with the saved values; "copy the previous period" prefills.
- A 403 from the first shift request renders the "not enabled" screen,
  not a generic error alert.
- Owner sees the builder grid; a staff session on the same route sees
  the own-shifts view (role branching).
- The grid shows a shortage badge when assigned < required and a
  surplus badge when assigned > required.
- The warnings panel lists a daily-over-8h warning and still allows the
  save button (warn, never block).
- The non-submitter list names members with no `submitted` submission.
- CSV export produces the expected header and one row per shift
  (`vi.spyOn(URL, "createObjectURL"/"revokeObjectURL")` plus a stubbed
  `HTMLAnchorElement.prototype.click`, as in the sales-report tests).

**Deliberately untested:**

- The overlap guard's check-then-act race (two concurrent `POST /shifts`
  for the same member and slot). Like the last-owner guard in staff
  accounts, it is defense in depth verified by review — a concurrency
  test here would be flaky and D1 gives no range-exclusion constraint to
  lean on.
- The grandfathering backfill. The Workers harness applies migrations to
  an empty database, so the `INSERT … SELECT` selects no rows there and
  any assertion would pass vacuously. Verified instead against local D1
  by seeding two pre-migration stores (one `active`, one `pending`) and
  running the statement from the migration file: one row per store,
  ids 36-char UUID-shaped and distinct, `created_at` 13 digits (ms), and
  a second run inserting nothing.
- The registration rollback path (`issueMagicLink` returning null), which
  now also deletes the subscription. Reaching it needs the hourly cap to
  trip on a brand-new `member_id`; it was already untested before this
  item.

**Not needed:** no `apps/e2e` spec in v1. The Playwright suite is not in
CI yet and its golden path is the order product; add a shift path when
the suite is wired into CI (engineering track).

## Interactions to respect

- `.claude/rules/api-routes.md`, `.claude/rules/testing.md`,
  `.claude/rules/frontend.md`, and the `/db-migrate` and `/new-route`
  skills apply unchanged. Use only the established error codes.
- Tenant isolation: `store_id` on every query, cross-tenant → 404, new
  tables carry `store_id` + an index even when reachable through a
  parent.
- `@order/ui` is not a shared component library: `apps/shift` owns its
  domain components; promote to `@order/ui` only when a third app needs
  the identical thing. In particular `apps/admin/src/lib/download.ts`
  stays where it is — copy the few lines into `apps/shift` or promote it
  only if a third call site appears.
- Existing order-product behavior must not change. The only shipped
  code touched outside new files is `middleware.ts` (added factory),
  `app.ts` (mounts + CORS origin), `routes/stores.ts` (subscription row
  on registration), `routes/auth.ts` (`app` → origin mapping), and the
  env/wrangler files.
- `stores.status = 'suspended'` (account disabled) and
  `subscriptions.status` (product not purchased) are different switches;
  document both in `docs/specs/domain-model.md` when folding.
- Every new table references `stores` or `members`, so the account
  hard-delete in `apps/api/src/routes/stores.ts` must clear them before the
  rows they point at — children first, `availability_entries` through
  `positions`. They are deleted but **not** in the returned export; decide
  whether a published schedule belongs in a store's data export when the
  product ships, and record the answer in
  `docs/specs/features/authentication.md` alongside the existing export
  contract.
- When this ships, fold it per `docs/README.md`: a new
  `docs/specs/features/shift-management.md`, the state machine and the
  API-enforced overlap invariant into `docs/specs/domain-model.md`, the
  new app into `docs/reference/monorepo.md` and `deploy.md`, then delete
  this proposal and mark the roadmap item shipped.
