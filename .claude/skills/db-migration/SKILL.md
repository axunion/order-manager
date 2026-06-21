---
name: db-migration
description: Safe Drizzle ORM migration workflow with multi-tenant isolation checklist. Use this skill whenever a database schema change is needed — adding a table, adding a column, changing indexes or constraints in src/db/schema.ts. Invoke it before touching the schema to ensure the tenant isolation checklist is followed and the migration commands run in the right order.
disable-model-invocation: true
---

# DB Migration Workflow

## Overview

This skill guides a safe Drizzle + Cloudflare D1 migration.
Every new tenant-scoped table **must** pass the isolation checklist below before generating SQL.

---

## Step 1 — Edit the schema

File: `src/db/schema.ts`

Reference patterns (copy these, don't reinvent):
- Table with `store_id`: see `menuItems`, `seats`, `orders`
- Denormalized `store_id` for join-free filtering: see `orderItems`, `payments`
- Enum column with CHECK constraint: see `orders.status`
- Partial UNIQUE index: see `idx_one_active_order_per_seat`

### Tenant isolation checklist (complete before Step 2)

- [ ] New table has `store_id text("store_id").notNull().references(() => stores.id)`
- [ ] An index on `store_id` is defined: `index("idx_<table>_store").on(table.store_id)`
- [ ] If the table can be queried without going through `orders` (like `order_items` does),
      `store_id` is **denormalized** onto it (not just inherited via FK)
- [ ] Enum / status columns have a `check()` constraint enforcing allowed values
- [ ] If a partial UNIQUE constraint is needed (e.g., one-active-per-seat), it uses
      a `sql` template literal in the `.where()` clause — see `idx_one_active_order_per_seat` in `src/db/schema.ts`
- [ ] No existing column removed without a migration plan for data already in production

---

## Step 2 — Generate migration SQL

```bash
pnpm db:generate
```

Review the generated file in `drizzle/` before applying.
Check that:
- The correct columns are present
- No unexpected DROP statements appear
- FKs reference the correct parent table

---

## Step 3 — Apply to local D1

For a clean apply (first-time or safe re-run):
```bash
pnpm db:migrate
```

For a full reset (destructive — local only):
```bash
pnpm db:reset    # wipes .wrangler/state/v3/d1, then re-applies all migrations
```

For a complete rebuild (regenerate SQL + reset):
```bash
pnpm db:rebuild  # removes drizzle/*.sql + meta, regenerates, resets
```

> **Sandbox note**: `pnpm test` and `pnpm check` require `dangerouslyDisableSandbox: true`
> in the Claude Code tool call because Vitest and Wrangler need filesystem and network access
> beyond the default sandbox limits.

---

## Step 4 — Add cross-tenant isolation tests

Before considering the migration complete, add a workers test that verifies:

1. A record created by Store A is **not** returned when Store B queries it
2. Updating a record by ID without matching `store_id` returns 404

Pattern (see `src/lib/api/seats.test.ts` for a full example):

```ts
it("does not return another store's <resource>", async () => {
  const storeA = await seedStore("Store A");
  const storeB = await seedStore("Store B");
  // create resource under storeA
  // query as storeB
  // expect 404 or empty array
});
```

---

## Step 5 — Verify

```bash
pnpm check   # biome lint + astro type check  (needs dangerouslyDisableSandbox: true)
pnpm test    # runs node + workers vitest projects (needs dangerouslyDisableSandbox: true)
```

Both must pass before committing.
