/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, schema } from "../../db/client";
import { newId } from "../id";
import { app } from "./index";

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

type SeedStore = { id: string; access_token: string };

/** Creates a store directly in D1 and returns id + access_token. */
async function seedStore(name: string): Promise<SeedStore> {
  const db = createDb(env.DB);
  const id = newId();
  const access_token = newId();
  await db.insert(schema.stores).values({
    id,
    name,
    slug: newId(), // unique slug (UUID is fine for tests)
    access_token,
  });
  return { id, access_token };
}

/** Returns request init with Cookie header set to the given access_token. */
function withAuth(access_token: string, extra: RequestInit = {}): RequestInit {
  return {
    ...extra,
    headers: {
      ...(extra.headers as Record<string, string> | undefined),
      Cookie: `access_token=${access_token}`,
    },
  };
}

/** Sends a JSON request. */
function jsonInit(
  method: string,
  body: unknown,
  extra: RequestInit = {},
): RequestInit {
  return {
    ...extra,
    method,
    headers: {
      "Content-Type": "application/json",
      ...(extra.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify(body),
  };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

describe("GET /api/menu/categories", () => {
  it("returns 401 with no cookie", async () => {
    const res = await app.request("/api/menu/categories", {}, env);
    expect(res.status).toBe(401);
    const body = (await res.json()) as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 with invalid token", async () => {
    const res = await app.request(
      "/api/menu/categories",
      withAuth("invalid-token-xyz"),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns only the calling store's categories in sort_order order", async () => {
    const storeA = await seedStore("CatList A");
    const storeB = await seedStore("CatList B");
    const db = createDb(env.DB);

    // Insert categories for store A (out of sort order)
    const idA1 = newId();
    const idA2 = newId();
    await db.insert(schema.menuCategories).values([
      { id: idA2, store_id: storeA.id, name: "Second", sort_order: 2 },
      { id: idA1, store_id: storeA.id, name: "First", sort_order: 1 },
    ]);
    // Insert a category for store B (must not appear in A's response)
    await db.insert(schema.menuCategories).values({
      id: newId(),
      store_id: storeB.id,
      name: "Store B Cat",
      sort_order: 0,
    });

    const res = await app.request(
      "/api/menu/categories",
      withAuth(storeA.access_token),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { id: string; name: string; sort_order: number }[];
    };
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe("First");
    expect(body.data[1].name).toBe("Second");
    expect(body.data.some((c) => c.name === "Store B Cat")).toBe(false);
  });
});

describe("POST /api/menu/categories", () => {
  it("creates a category and returns 201 with data envelope", async () => {
    const store = await seedStore("Cat Create");
    const res = await app.request(
      "/api/menu/categories",
      withAuth(store.access_token, jsonInit("POST", { name: "Drinks" })),
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { id: string; name: string; sort_order: number; store_id: string };
    };
    expect(body.data.name).toBe("Drinks");
    expect(body.data.sort_order).toBe(0);
    expect(body.data.store_id).toBe(store.id);
    expect(body.data.id).toBeTruthy();
  });

  it("persists the category to D1", async () => {
    const store = await seedStore("Cat Persist");
    const res = await app.request(
      "/api/menu/categories",
      withAuth(store.access_token, jsonInit("POST", { name: "Persist Cat" })),
      env,
    );
    const body = (await res.json()) as { data: { id: string } };
    const db = createDb(env.DB);
    const rows = await db
      .select()
      .from(schema.menuCategories)
      .where(eq(schema.menuCategories.id, body.data.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].store_id).toBe(store.id);
  });

  it("returns 400 when name is missing", async () => {
    const store = await seedStore("Cat Val1");
    const res = await app.request(
      "/api/menu/categories",
      withAuth(store.access_token, jsonInit("POST", {})),
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when name is blank after trimming", async () => {
    const store = await seedStore("Cat Val2");
    const res = await app.request(
      "/api/menu/categories",
      withAuth(store.access_token, jsonInit("POST", { name: "   " })),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when name exceeds 100 characters", async () => {
    const store = await seedStore("Cat Val3");
    const res = await app.request(
      "/api/menu/categories",
      withAuth(store.access_token, jsonInit("POST", { name: "a".repeat(101) })),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 with no cookie", async () => {
    const res = await app.request(
      "/api/menu/categories",
      jsonInit("POST", { name: "Drinks" }),
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/menu/categories/:id", () => {
  it("updates name and sort_order and returns 200", async () => {
    const store = await seedStore("Cat Update");
    const db = createDb(env.DB);
    const id = newId();
    await db.insert(schema.menuCategories).values({
      id,
      store_id: store.id,
      name: "Old Name",
      sort_order: 0,
    });

    const res = await app.request(
      `/api/menu/categories/${id}`,
      withAuth(
        store.access_token,
        jsonInit("PATCH", { name: "New Name", sort_order: 5 }),
      ),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { id: string; name: string; sort_order: number };
    };
    expect(body.data.name).toBe("New Name");
    expect(body.data.sort_order).toBe(5);
  });

  it("returns 404 for a non-existent category", async () => {
    const store = await seedStore("Cat 404");
    const res = await app.request(
      `/api/menu/categories/${newId()}`,
      withAuth(
        store.access_token,
        jsonInit("PATCH", { name: "X", sort_order: 0 }),
      ),
      env,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 when updating another store's category (tenant isolation)", async () => {
    const storeA = await seedStore("Cat Iso A");
    const storeB = await seedStore("Cat Iso B");
    const db = createDb(env.DB);
    const id = newId();
    await db.insert(schema.menuCategories).values({
      id,
      store_id: storeB.id,
      name: "Store B Cat",
      sort_order: 0,
    });

    const res = await app.request(
      `/api/menu/categories/${id}`,
      withAuth(
        storeA.access_token,
        jsonInit("PATCH", { name: "Hijack", sort_order: 0 }),
      ),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 with no cookie", async () => {
    const res = await app.request(
      `/api/menu/categories/${newId()}`,
      jsonInit("PATCH", { name: "X", sort_order: 0 }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 when sort_order is omitted from PATCH body (defaults to 0)", async () => {
    const store = await seedStore("Cat No SortOrder");
    const db = createDb(env.DB);
    const id = newId();
    await db.insert(schema.menuCategories).values({
      id,
      store_id: store.id,
      name: "Old Cat",
      sort_order: 3,
    });

    const res = await app.request(
      `/api/menu/categories/${id}`,
      withAuth(store.access_token, jsonInit("PATCH", { name: "Renamed Cat" })),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { sort_order: number } };
    expect(body.data.sort_order).toBe(0);
  });
});

describe("DELETE /api/menu/categories/:id", () => {
  it("deletes a category and returns 200", async () => {
    const store = await seedStore("Cat Delete");
    const db = createDb(env.DB);
    const id = newId();
    await db.insert(schema.menuCategories).values({
      id,
      store_id: store.id,
      name: "To Delete",
      sort_order: 0,
    });

    const res = await app.request(
      `/api/menu/categories/${id}`,
      withAuth(store.access_token, { method: "DELETE" }),
      env,
    );
    expect(res.status).toBe(200);
    const rows = await db
      .select()
      .from(schema.menuCategories)
      .where(eq(schema.menuCategories.id, id));
    expect(rows).toHaveLength(0);
  });

  it("nullifies category_id on child items before deleting the category", async () => {
    const store = await seedStore("Cat Del Nullify");
    const db = createDb(env.DB);
    const catId = newId();
    const itemId = newId();
    await db.insert(schema.menuCategories).values({
      id: catId,
      store_id: store.id,
      name: "Cat With Items",
      sort_order: 0,
    });
    await db.insert(schema.menuItems).values({
      id: itemId,
      store_id: store.id,
      category_id: catId,
      name: "Child Item",
      price: 500,
    });

    const res = await app.request(
      `/api/menu/categories/${catId}`,
      withAuth(store.access_token, { method: "DELETE" }),
      env,
    );
    expect(res.status).toBe(200);

    // category deleted
    const cats = await db
      .select()
      .from(schema.menuCategories)
      .where(eq(schema.menuCategories.id, catId));
    expect(cats).toHaveLength(0);

    // child item still exists but category_id is NULL
    const items = await db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.id, itemId));
    expect(items).toHaveLength(1);
    expect(items[0].category_id).toBeNull();
  });

  it("returns 404 for a non-existent category", async () => {
    const store = await seedStore("Cat Del 404");
    const res = await app.request(
      `/api/menu/categories/${newId()}`,
      withAuth(store.access_token, { method: "DELETE" }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when deleting another store's category (tenant isolation)", async () => {
    const storeA = await seedStore("Cat Del Iso A");
    const storeB = await seedStore("Cat Del Iso B");
    const db = createDb(env.DB);
    const id = newId();
    await db.insert(schema.menuCategories).values({
      id,
      store_id: storeB.id,
      name: "Store B Cat",
      sort_order: 0,
    });

    const res = await app.request(
      `/api/menu/categories/${id}`,
      withAuth(storeA.access_token, { method: "DELETE" }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 with no cookie", async () => {
    const res = await app.request(
      `/api/menu/categories/${newId()}`,
      { method: "DELETE" },
      env,
    );
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

describe("GET /api/menu/items", () => {
  it("returns 401 with no cookie", async () => {
    const res = await app.request("/api/menu/items", {}, env);
    expect(res.status).toBe(401);
  });

  it("returns only the calling store's items in sort_order order", async () => {
    const storeA = await seedStore("Item List A");
    const storeB = await seedStore("Item List B");
    const db = createDb(env.DB);

    const idA1 = newId();
    const idA2 = newId();
    await db.insert(schema.menuItems).values([
      {
        id: idA2,
        store_id: storeA.id,
        name: "Beta",
        price: 400,
        sort_order: 2,
      },
      {
        id: idA1,
        store_id: storeA.id,
        name: "Alpha",
        price: 300,
        sort_order: 1,
      },
    ]);
    await db.insert(schema.menuItems).values({
      id: newId(),
      store_id: storeB.id,
      name: "Store B Item",
      price: 500,
      sort_order: 0,
    });

    const res = await app.request(
      "/api/menu/items",
      withAuth(storeA.access_token),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { id: string; name: string; sort_order: number }[];
    };
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe("Alpha");
    expect(body.data[1].name).toBe("Beta");
    expect(body.data.some((i) => i.name === "Store B Item")).toBe(false);
  });
});

describe("POST /api/menu/items", () => {
  it("creates an item without category and returns 201", async () => {
    const store = await seedStore("Item Create");
    const res = await app.request(
      "/api/menu/items",
      withAuth(
        store.access_token,
        jsonInit("POST", { name: "Latte", price: 500 }),
      ),
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: {
        id: string;
        name: string;
        price: number;
        is_available: boolean;
        category_id: string | null;
        sort_order: number;
        store_id: string;
      };
    };
    expect(body.data.name).toBe("Latte");
    expect(body.data.price).toBe(500);
    expect(body.data.is_available).toBe(true);
    expect(body.data.category_id).toBeNull();
    expect(body.data.store_id).toBe(store.id);
  });

  it("creates an item with a valid category", async () => {
    const store = await seedStore("Item Create Cat");
    const db = createDb(env.DB);
    const catId = newId();
    await db.insert(schema.menuCategories).values({
      id: catId,
      store_id: store.id,
      name: "Food",
      sort_order: 0,
    });

    const res = await app.request(
      "/api/menu/items",
      withAuth(
        store.access_token,
        jsonInit("POST", { name: "Sandwich", price: 800, category_id: catId }),
      ),
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { category_id: string | null } };
    expect(body.data.category_id).toBe(catId);
  });

  it("returns 400 when category_id belongs to another store", async () => {
    const storeA = await seedStore("Item Cross Cat A");
    const storeB = await seedStore("Item Cross Cat B");
    const db = createDb(env.DB);
    const catId = newId();
    await db.insert(schema.menuCategories).values({
      id: catId,
      store_id: storeB.id,
      name: "Store B Cat",
      sort_order: 0,
    });

    const res = await app.request(
      "/api/menu/items",
      withAuth(
        storeA.access_token,
        jsonInit("POST", { name: "X", price: 100, category_id: catId }),
      ),
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when price is zero", async () => {
    const store = await seedStore("Item Price0");
    const res = await app.request(
      "/api/menu/items",
      withAuth(
        store.access_token,
        jsonInit("POST", { name: "Free", price: 0 }),
      ),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when price is negative", async () => {
    const store = await seedStore("Item PriceNeg");
    const res = await app.request(
      "/api/menu/items",
      withAuth(store.access_token, jsonInit("POST", { name: "X", price: -1 })),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when name is empty", async () => {
    const store = await seedStore("Item NameEmpty");
    const res = await app.request(
      "/api/menu/items",
      withAuth(
        store.access_token,
        jsonInit("POST", { name: "   ", price: 100 }),
      ),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 with no cookie", async () => {
    const res = await app.request(
      "/api/menu/items",
      jsonInit("POST", { name: "X", price: 100 }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("persists the item to D1", async () => {
    const store = await seedStore("Item Persist");
    const res = await app.request(
      "/api/menu/items",
      withAuth(
        store.access_token,
        jsonInit("POST", { name: "Espresso", price: 350 }),
      ),
      env,
    );
    const body = (await res.json()) as { data: { id: string } };
    const db = createDb(env.DB);
    const rows = await db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.id, body.data.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].store_id).toBe(store.id);
  });
});

describe("PATCH /api/menu/items/:id", () => {
  it("updates item fields and returns 200", async () => {
    const store = await seedStore("Item Update");
    const db = createDb(env.DB);
    const id = newId();
    await db.insert(schema.menuItems).values({
      id,
      store_id: store.id,
      name: "Old",
      price: 100,
      is_available: true,
    });

    const res = await app.request(
      `/api/menu/items/${id}`,
      withAuth(
        store.access_token,
        jsonInit("PATCH", {
          name: "New",
          price: 200,
          is_available: false,
          sort_order: 3,
        }),
      ),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        name: string;
        price: number;
        is_available: boolean;
        sort_order: number;
      };
    };
    expect(body.data.name).toBe("New");
    expect(body.data.price).toBe(200);
    expect(body.data.is_available).toBe(false);
    expect(body.data.sort_order).toBe(3);
  });

  it("can toggle is_available from true to false", async () => {
    const store = await seedStore("Item Toggle");
    const db = createDb(env.DB);
    const id = newId();
    await db.insert(schema.menuItems).values({
      id,
      store_id: store.id,
      name: "Toggleable",
      price: 300,
      is_available: true,
    });

    const res = await app.request(
      `/api/menu/items/${id}`,
      withAuth(
        store.access_token,
        jsonInit("PATCH", {
          name: "Toggleable",
          price: 300,
          is_available: false,
          sort_order: 0,
        }),
      ),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { is_available: boolean } };
    expect(body.data.is_available).toBe(false);
  });

  it("returns 400 when category_id belongs to another store", async () => {
    const storeA = await seedStore("Item Upd Cross A");
    const storeB = await seedStore("Item Upd Cross B");
    const db = createDb(env.DB);
    const itemId = newId();
    const catBId = newId();
    await db.insert(schema.menuItems).values({
      id: itemId,
      store_id: storeA.id,
      name: "My Item",
      price: 200,
    });
    await db.insert(schema.menuCategories).values({
      id: catBId,
      store_id: storeB.id,
      name: "B Cat",
      sort_order: 0,
    });

    const res = await app.request(
      `/api/menu/items/${itemId}`,
      withAuth(
        storeA.access_token,
        jsonInit("PATCH", {
          name: "My Item",
          price: 200,
          is_available: true,
          sort_order: 0,
          category_id: catBId,
        }),
      ),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for a non-existent item", async () => {
    const store = await seedStore("Item 404");
    const res = await app.request(
      `/api/menu/items/${newId()}`,
      withAuth(
        store.access_token,
        jsonInit("PATCH", {
          name: "X",
          price: 100,
          is_available: true,
          sort_order: 0,
        }),
      ),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when updating another store's item (tenant isolation)", async () => {
    const storeA = await seedStore("Item Iso A");
    const storeB = await seedStore("Item Iso B");
    const db = createDb(env.DB);
    const id = newId();
    await db.insert(schema.menuItems).values({
      id,
      store_id: storeB.id,
      name: "Store B Item",
      price: 500,
    });

    const res = await app.request(
      `/api/menu/items/${id}`,
      withAuth(
        storeA.access_token,
        jsonInit("PATCH", {
          name: "Hijack",
          price: 100,
          is_available: true,
          sort_order: 0,
        }),
      ),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 with no cookie", async () => {
    const res = await app.request(
      `/api/menu/items/${newId()}`,
      jsonInit("PATCH", {
        name: "X",
        price: 100,
        is_available: true,
        sort_order: 0,
      }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("preserves existing category_id when omitted from PATCH body", async () => {
    const store = await seedStore("Item Preserve Cat");
    const db = createDb(env.DB);
    const catId = newId();
    const itemId = newId();
    await db.insert(schema.menuCategories).values({
      id: catId,
      store_id: store.id,
      name: "Food",
      sort_order: 0,
    });
    await db.insert(schema.menuItems).values({
      id: itemId,
      store_id: store.id,
      name: "Sandwich",
      price: 800,
      category_id: catId,
    });

    // PATCH without category_id — should preserve the existing association
    const res = await app.request(
      `/api/menu/items/${itemId}`,
      withAuth(
        store.access_token,
        jsonInit("PATCH", {
          name: "New Sandwich",
          price: 900,
          is_available: true,
        }),
      ),
      env,
    );
    expect(res.status).toBe(200);

    const rows = await db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.id, itemId));
    expect(rows[0].category_id).toBe(catId);
  });

  it("clears category_id when explicitly set to null in PATCH body", async () => {
    const store = await seedStore("Item Clear Cat");
    const db = createDb(env.DB);
    const catId = newId();
    const itemId = newId();
    await db.insert(schema.menuCategories).values({
      id: catId,
      store_id: store.id,
      name: "Drinks",
      sort_order: 0,
    });
    await db.insert(schema.menuItems).values({
      id: itemId,
      store_id: store.id,
      name: "Latte",
      price: 500,
      category_id: catId,
    });

    // PATCH with explicit null — should clear the category
    const res = await app.request(
      `/api/menu/items/${itemId}`,
      withAuth(
        store.access_token,
        jsonInit("PATCH", {
          name: "Latte",
          price: 500,
          is_available: true,
          category_id: null,
        }),
      ),
      env,
    );
    expect(res.status).toBe(200);

    const rows = await db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.id, itemId));
    expect(rows[0].category_id).toBeNull();
  });

  it("returns 200 when sort_order is omitted from PATCH body (defaults to 0)", async () => {
    const store = await seedStore("Item No SortOrder");
    const db = createDb(env.DB);
    const id = newId();
    await db.insert(schema.menuItems).values({
      id,
      store_id: store.id,
      name: "Espresso",
      price: 350,
      sort_order: 5,
    });

    const res = await app.request(
      `/api/menu/items/${id}`,
      withAuth(
        store.access_token,
        jsonInit("PATCH", {
          name: "Double Espresso",
          price: 400,
          is_available: true,
        }),
      ),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { sort_order: number } };
    expect(body.data.sort_order).toBe(0);
  });
});

describe("DELETE /api/menu/items/:id", () => {
  it("deletes an unreferenced item and returns 200", async () => {
    const store = await seedStore("Item Delete");
    const db = createDb(env.DB);
    const id = newId();
    await db.insert(schema.menuItems).values({
      id,
      store_id: store.id,
      name: "To Delete",
      price: 200,
    });

    const res = await app.request(
      `/api/menu/items/${id}`,
      withAuth(store.access_token, { method: "DELETE" }),
      env,
    );
    expect(res.status).toBe(200);
    const rows = await db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.id, id));
    expect(rows).toHaveLength(0);
  });

  it("returns 409 when item is referenced by an order_item", async () => {
    const store = await seedStore("Item Del FK");
    const db = createDb(env.DB);

    // Seed: seat → order → order_item → menu_item
    const itemId = newId();
    const seatId = newId();
    const orderId = newId();
    await db.insert(schema.menuItems).values({
      id: itemId,
      store_id: store.id,
      name: "Referenced Item",
      price: 300,
    });
    await db.insert(schema.seats).values({
      id: seatId,
      store_id: store.id,
      name: "Table 1",
      qr_token: newId(),
    });
    await db.insert(schema.orders).values({
      id: orderId,
      store_id: store.id,
      seat_id: seatId,
      status: "open",
    });
    await db.insert(schema.orderItems).values({
      id: newId(),
      store_id: store.id,
      order_id: orderId,
      menu_item_id: itemId,
      name_snapshot: "Referenced Item",
      unit_price_snapshot: 300,
      quantity: 1,
      status: "ordered",
    });

    const res = await app.request(
      `/api/menu/items/${itemId}`,
      withAuth(store.access_token, { method: "DELETE" }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CONFLICT");

    // Item must still exist in DB
    const rows = await db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.id, itemId));
    expect(rows).toHaveLength(1);
  });

  it("returns 404 for a non-existent item", async () => {
    const store = await seedStore("Item Del 404");
    const res = await app.request(
      `/api/menu/items/${newId()}`,
      withAuth(store.access_token, { method: "DELETE" }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when deleting another store's item (tenant isolation)", async () => {
    const storeA = await seedStore("Item Del Iso A");
    const storeB = await seedStore("Item Del Iso B");
    const db = createDb(env.DB);
    const id = newId();
    await db.insert(schema.menuItems).values({
      id,
      store_id: storeB.id,
      name: "Store B Item",
      price: 500,
    });

    const res = await app.request(
      `/api/menu/items/${id}`,
      withAuth(storeA.access_token, { method: "DELETE" }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 with no cookie", async () => {
    const res = await app.request(
      `/api/menu/items/${newId()}`,
      { method: "DELETE" },
      env,
    );
    expect(res.status).toBe(401);
  });
});
