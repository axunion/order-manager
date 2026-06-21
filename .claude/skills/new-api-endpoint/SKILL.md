---
name: new-api-endpoint
description: Generates a secure Hono router endpoint following this project's established patterns — store_id filter, zValidator, errorResponse envelope, 404 cross-tenant convention, and matching test stubs. Use when adding a new API route under src/lib/api/.
---

# New API Endpoint Generator

## Required inputs

To generate a new endpoint, gather the following before writing any code:

1. **Route path** (e.g., `GET /api/widgets`, `POST /api/widgets`, `DELETE /api/widgets/:id`)
2. **Auth type**: `requireStore` (admin session cookie) or `requireSeat` (customer QR token)
3. **Request body fields** (for POST/PATCH): field name, type, constraints
4. **Response shape**: what the `data` envelope contains

Produce:
- Router file following the secure pattern below
- Zod schema for the request body (if applicable)
- Test file in the workers project with cross-tenant isolation cases

---

## Canonical secure pattern

Every handler in this codebase follows this structure. Deviating from it is a security issue.

### Router setup (admin session)

```ts
import { type AuthEnv, requireStore } from "./middleware";

export const widgetsRouter = new Hono<AuthEnv>()
  .use(requireStore)   // ← required: session validation + store_id extraction

  .get("/", async (c) => {
    const { id: storeId } = c.var.store;   // ← always destructure storeId first
    const db = createDb(c.env.DB);

    const rows = await db
      .select()
      .from(schema.widgets)
      .where(eq(schema.widgets.store_id, storeId))  // ← store_id filter mandatory
      .orderBy(asc(schema.widgets.created_at));

    return c.json({ data: rows });
  })
```

### Router setup (customer QR token)

```ts
import { requireSeat, type SeatEnv } from "./middleware";

export const widgetsRouter = new Hono<SeatEnv>()
  // requireSeat used as inline per-route middleware (not .use()) because :seatToken
  // must be resolved before the middleware can look up the seat.
  .get("/:seatToken/widgets", requireSeat, async (c) => {
    const { id: seatId, store_id: storeId } = c.var.seat;
    // ...
  })
```

### Input validation

```ts
const createWidgetSchema = z.object({
  name: z
    .string()
    .transform((s) => s.trim())    // ← always trim strings
    .pipe(z.string().min(1).max(100)),
  sort_order: z.number().int().min(0).default(0),
});

.post(
  "/",
  zValidator("json", createWidgetSchema, (result, _c) => {
    if (!result.success) return validationError(result.error.issues);
  }),
  async (c) => { ... }
)
```

### Ownership verification before mutation

```ts
// For DELETE / PATCH by :id — verify ownership first, return 404 on miss
const existing = await db
  .select({ id: schema.widgets.id })
  .from(schema.widgets)
  .where(
    and(
      eq(schema.widgets.id, widgetId),
      eq(schema.widgets.store_id, storeId),   // ← both id AND store_id
    ),
  )
  .limit(1);

if (existing.length === 0) {
  return errorResponse("NOT_FOUND", "Widget not found", 404);
  // ↑ always 404, never 403 — 403 leaks resource existence
}
```

### Response envelope

```ts
// Success — use c.json({ data: ... }) or jsonResponse()
return c.json({ data: rows });           // 200
return c.json({ data: newRow }, 201);    // 201 Created

// Error — always use errorResponse() from src/lib/http.ts
return errorResponse("NOT_FOUND", "Widget not found", 404);
return errorResponse("CONFLICT", "...", 409);
return errorResponse("VALIDATION_ERROR", "...", 400);
return errorResponse("INTERNAL_ERROR", "...", 500);
```

### Mount in src/lib/api/index.ts

```ts
import { widgetsRouter } from "./widgets";
// Admin-authenticated endpoints
app.route("/api/widgets", widgetsRouter);
```

---

## Test stub (workers project)

Place at `src/lib/api/widgets.test.ts` — mirrors the workers vitest project pattern.

```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "./index";
import { seedStore, withAuth, jsonInit } from "./test-helpers";

describe("GET /api/widgets", () => {
  it("returns widgets for the authenticated store", async () => {
    const store = await seedStore("Test Store");
    // ... seed a widget ...
    const res = await app.request(
      "/api/widgets",
      withAuth(store.session_token),
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });

  it("does not return another store's widgets", async () => {
    const storeA = await seedStore("Store A");
    const storeB = await seedStore("Store B");
    // seed widget under storeA
    const res = await app.request(
      "/api/widgets",
      withAuth(storeB.session_token),
      env,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toHaveLength(0);  // ← cross-tenant isolation
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/widgets");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/widgets", () => {
  it("creates a widget", async () => {
    const store = await seedStore("Test Store");
    const res = await app.request(
      "/api/widgets",
      { ...withAuth(store.session_token), ...jsonInit("POST", { name: "Widget A" }) },
      env,
    );
    expect(res.status).toBe(201);
  });

  it("rejects empty name", async () => {
    const store = await seedStore("Test Store");
    const res = await app.request(
      "/api/widgets",
      { ...withAuth(store.session_token), ...jsonInit("POST", { name: "  " }) },
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/widgets/:id", () => {
  it("returns 404 for another store's widget", async () => {
    const storeA = await seedStore("Store A");
    const storeB = await seedStore("Store B");
    // create widget under storeA, then delete as storeB
    // expect 404
  });
});
```

---

## Checklist before finishing

- [ ] `store_id` filter on **every** SELECT / UPDATE / DELETE
- [ ] Ownership verified with `and(eq(table.id, id), eq(table.store_id, storeId))` before mutation
- [ ] Cross-tenant access returns 404, not 403
- [ ] Input strings use `.transform(trim).pipe(min(1))` pattern
- [ ] All responses use `{ data: ... }` / `errorResponse(...)` envelope
- [ ] Router mounted in `src/lib/api/index.ts`
- [ ] Test includes cross-tenant isolation case
- [ ] `pnpm check && pnpm test` pass (needs `dangerouslyDisableSandbox: true`)
