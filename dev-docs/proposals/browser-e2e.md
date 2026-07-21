# Browser E2E (Playwright)

**Status:** draft — under discussion as of 2026-07-22. Not scheduled;
roadmap's Engineering track lists this as "around the Phase 2 pilot,"
but the app-level work is done, so it can start earlier if judged
worthwhile. This doc lays out the decisions to resolve before promoting
it to "ready" and starting implementation.

## Why this exists

`business-cycle.test.ts` covers the full order-to-payment cycle at the
API level, and [manual-smoke-test.md](../reference/manual-smoke-test.md)
covers it by hand through the three SPAs. Neither catches
integration/UI regressions automatically: broken client-side routing, a
form that doesn't submit, cross-app polling silently failing. Browser
E2E closes that gap, at the cost of the slowest and most maintenance-
heavy tier of the test pyramid.

## Open decisions

### 1. Scope: how much of the manual smoke test to automate

Automating the full 9-step golden path (signup → menu → seat → order →
serve → checkout → report) is the obvious first target since it's
already enumerated and known to matter. Options:

- **One end-to-end spec** mirroring the full manual walkthrough.
  Simplest to write; a failure only says "something in the cycle broke,"
  not where.
- **Per-app specs** (signup flow, admin flow, order flow) sharing
  fixtures/helpers. More diagnostic value per failure, more setup.

Recommendation: start with one full-cycle spec (matches
`business-cycle.test.ts`'s own scope choice), split later only if
failures become hard to localize.

### 2. Where it lives in the monorepo

Playwright tests need all four dev servers running together, so they
don't belong inside a single app's workspace. Options:

- A new `apps/e2e` (or top-level `e2e/`) workspace with its own
  `package.json`, holding only Playwright config + specs.
- Folded into one existing app (e.g. `apps/admin`) — cheaper to set up,
  but semantically wrong (the tests aren't about the admin app alone)
  and it'd own devDependencies (`@playwright/test`) three other apps
  don't need.

Recommendation: a dedicated workspace, consistent with `packages/*`
being single-purpose.

### 3. Orchestrating four processes

Playwright's `webServer` config can start one process and wait on a
port before running tests, but this project needs four (API Worker +
3 Vite dev servers) up simultaneously, plus a clean D1 state.
Needs a decision on:

- Multiple `webServer` entries (Playwright supports an array) vs. a
  wrapper script that starts everything and waits on all four ports.
- Whether to `pnpm db:reset` automatically before the run, or require
  it as a documented precondition (mirrors the manual checklist).
- Fixed dev ports (5173/5174/5175/8787) already exist for local CORS,
  so no new port-allocation work is needed here.

### 4. Auth without email

The dev-only `verify_url` convenience (`ENVIRONMENT=development`,
see [auth.md](./../reference/auth.md#local-dev-skipping-email-delivery))
that the manual checklist relies on for the `[DEV]` link works the same
way for Playwright — no email service needed in the test run. Confirm
`.dev.vars` gets set for the E2E run the same way local dev does.

### 5. CI integration timing

Roadmap ties this to "around the Phase 2 pilot"; running it in CI on
every push/PR is the more valuable end state but adds real wall-clock
time (browser install, four servers booting, 5s-poll waits) to every
CI run. Options:

- Run locally only at first (a `pnpm --filter e2e test` a developer runs
  before a risky change), add to CI once stable.
- Add to CI immediately, accept the slower pipeline.

Recommendation: local-only first — get the suite reliable before paying
its cost on every push.

### 6. Flakiness from polling

The order board and customer screens rely on 5s polling (see
[order-fulfillment.md](../specs/features/order-fulfillment.md#known-limitations--roadmap)).
Tests asserting on polled state need explicit waits/retries
(Playwright's `expect(...).toPass()` or polling assertions), not fixed
sleeps, to avoid flaky failures tied to the exact 5s interval.

## Non-goals for a first version

- Cross-browser matrix (Chromium only is enough for internal use).
- Visual regression / screenshot diffing.
- Load/performance testing.

## Next step

Once scope (§1), workspace location (§2), and orchestration (§3) are
picked, promote this doc's status to "ready" and follow the standard
`/implement-item`-style flow to land it as its own slice.
