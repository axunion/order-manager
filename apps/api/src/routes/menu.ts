import {
  CreateCategoryInput,
  CreateItemInput,
  errorResponse,
  newId,
  UpdateCategoryInput,
  UpdateItemInput,
} from "@order/core";
import { createDb, type Database, schema } from "@order/db";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { type AuthEnv, requireStore } from "../middleware";
import { bodyValidator } from "../validator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Verifies that categoryId belongs to storeId.
 * Returns an error Response if the category is invalid; undefined otherwise.
 * Call when categoryId is a non-null string received from client input.
 */
async function validateCategoryOwnership(
  db: Database,
  categoryId: string,
  storeId: string,
): Promise<Response | undefined> {
  const cat = await db
    .select({ id: schema.menuCategories.id })
    .from(schema.menuCategories)
    .where(
      and(
        eq(schema.menuCategories.id, categoryId),
        eq(schema.menuCategories.store_id, storeId),
      ),
    )
    .limit(1);
  if (cat.length === 0) {
    return errorResponse("VALIDATION_ERROR", "category_id is invalid", 400);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const menuRouter = new Hono<AuthEnv>()
  .use(requireStore)

  // ──────────────────── Categories ────────────────────

  /**
   * GET /api/menu/categories
   * Returns all categories for the authenticated store, ordered by sort_order.
   */
  .get("/categories", async (c) => {
    const { id: storeId } = c.var.store;
    const db = createDb(c.env.DB);
    const rows = await db
      .select()
      .from(schema.menuCategories)
      .where(eq(schema.menuCategories.store_id, storeId))
      .orderBy(asc(schema.menuCategories.sort_order));
    return c.json({ data: rows });
  })

  /**
   * POST /api/menu/categories
   * Creates a new category for the authenticated store.
   * Response: 201 { data: { id, store_id, name, sort_order } }
   */
  .post("/categories", bodyValidator(CreateCategoryInput), async (c) => {
    const { id: storeId } = c.var.store;
    const { name, sort_order } = c.req.valid("json");
    const id = newId();
    const db = createDb(c.env.DB);
    await db
      .insert(schema.menuCategories)
      .values({ id, store_id: storeId, name, sort_order });
    return c.json({ data: { id, store_id: storeId, name, sort_order } }, 201);
  })

  /**
   * PATCH /api/menu/categories/:id
   * Updates name and sort_order of a category owned by the authenticated store.
   * Returns 404 if not found or owned by a different store.
   */
  .patch("/categories/:id", bodyValidator(UpdateCategoryInput), async (c) => {
    const { id: storeId } = c.var.store;
    const catId = c.req.param("id");
    const { name, sort_order } = c.req.valid("json");
    const db = createDb(c.env.DB);
    const updated = await db
      .update(schema.menuCategories)
      .set({ name, sort_order })
      .where(
        and(
          eq(schema.menuCategories.id, catId),
          eq(schema.menuCategories.store_id, storeId),
        ),
      )
      .returning();
    const result = updated[0];
    if (!result) {
      return errorResponse("NOT_FOUND", "Category not found", 404);
    }
    return c.json({ data: result });
  })

  /**
   * DELETE /api/menu/categories/:id
   * Deletes a category owned by the authenticated store.
   * First nullifies category_id on all child items (schema allows nullable).
   * Returns 404 if not found or owned by a different store.
   */
  .delete("/categories/:id", async (c) => {
    const { id: storeId } = c.var.store;
    const catId = c.req.param("id");
    const db = createDb(c.env.DB);

    // Verify ownership before touching child records.
    const existing = await db
      .select({ id: schema.menuCategories.id })
      .from(schema.menuCategories)
      .where(
        and(
          eq(schema.menuCategories.id, catId),
          eq(schema.menuCategories.store_id, storeId),
        ),
      )
      .limit(1);
    if (existing.length === 0) {
      return errorResponse("NOT_FOUND", "Category not found", 404);
    }

    // Nullify category_id on child items, then delete the category atomically.
    await db.batch([
      db
        .update(schema.menuItems)
        .set({ category_id: null })
        .where(
          and(
            eq(schema.menuItems.category_id, catId),
            eq(schema.menuItems.store_id, storeId),
          ),
        ),
      db
        .delete(schema.menuCategories)
        .where(
          and(
            eq(schema.menuCategories.id, catId),
            eq(schema.menuCategories.store_id, storeId),
          ),
        ),
    ]);

    return c.json({ data: { id: catId } });
  })

  // ──────────────────── Items ────────────────────

  /**
   * GET /api/menu/items
   * Returns all menu items for the authenticated store, ordered by sort_order.
   */
  .get("/items", async (c) => {
    const { id: storeId } = c.var.store;
    const db = createDb(c.env.DB);
    const rows = await db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.store_id, storeId))
      .orderBy(asc(schema.menuItems.sort_order));
    return c.json({ data: rows });
  })

  /**
   * POST /api/menu/items
   * Creates a new menu item for the authenticated store.
   * If category_id is provided it must belong to the same store.
   * Response: 201 { data: { ... } }
   */
  .post("/items", bodyValidator(CreateItemInput), async (c) => {
    const { id: storeId } = c.var.store;
    const input = c.req.valid("json");
    const db = createDb(c.env.DB);

    if (input.category_id != null) {
      const err = await validateCategoryOwnership(
        db,
        input.category_id,
        storeId,
      );
      if (err) return err;
    }

    const id = newId();
    const { name, price, is_available, category_id, sort_order } = input;
    await db.insert(schema.menuItems).values({
      id,
      store_id: storeId,
      name,
      price,
      is_available,
      category_id,
      sort_order,
    });
    return c.json(
      {
        data: {
          id,
          store_id: storeId,
          name,
          price,
          is_available,
          category_id,
          sort_order,
        },
      },
      201,
    );
  })

  /**
   * PATCH /api/menu/items/:id
   * Updates a menu item owned by the authenticated store.
   * If category_id is provided it must belong to the same store.
   * Omitting category_id preserves the current value; passing null clears it.
   * Returns 404 if not found or owned by a different store.
   */
  .patch("/items/:id", bodyValidator(UpdateItemInput), async (c) => {
    const { id: storeId } = c.var.store;
    const itemId = c.req.param("id");
    const input = c.req.valid("json");
    const db = createDb(c.env.DB);

    // category_id is undefined when omitted → preserve existing DB value.
    // Validate only when explicitly provided (string, not null/undefined).
    if (input.category_id != null) {
      const err = await validateCategoryOwnership(
        db,
        input.category_id,
        storeId,
      );
      if (err) return err;
    }

    const { name, price, is_available, category_id, sort_order } = input;
    // Drizzle skips undefined fields in .set(), so omitting category_id
    // in the request body leaves the column unchanged in the DB.
    const updated = await db
      .update(schema.menuItems)
      .set({ name, price, is_available, category_id, sort_order })
      .where(
        and(
          eq(schema.menuItems.id, itemId),
          eq(schema.menuItems.store_id, storeId),
        ),
      )
      .returning();
    const result = updated[0];
    if (!result) {
      return errorResponse("NOT_FOUND", "Menu item not found", 404);
    }
    return c.json({ data: result });
  })

  /**
   * DELETE /api/menu/items/:id
   * Deletes a menu item owned by the authenticated store.
   * Returns 409 if the item is referenced by an existing order_item (FK constraint).
   * Returns 404 if not found or owned by a different store.
   */
  .delete("/items/:id", async (c) => {
    const { id: storeId } = c.var.store;
    const itemId = c.req.param("id");
    const db = createDb(c.env.DB);

    // Verify ownership first.
    const existing = await db
      .select({ id: schema.menuItems.id })
      .from(schema.menuItems)
      .where(
        and(
          eq(schema.menuItems.id, itemId),
          eq(schema.menuItems.store_id, storeId),
        ),
      )
      .limit(1);
    if (existing.length === 0) {
      return errorResponse("NOT_FOUND", "Menu item not found", 404);
    }

    // Check whether any order_items from this store reference this item.
    // Filter by store_id to prevent cross-tenant order_items (e.g. bad seed data)
    // from blocking a legitimate deletion.
    const refs = await db
      .select({ id: schema.orderItems.id })
      .from(schema.orderItems)
      .where(
        and(
          eq(schema.orderItems.menu_item_id, itemId),
          eq(schema.orderItems.store_id, storeId),
        ),
      )
      .limit(1);
    if (refs.length > 0) {
      return errorResponse(
        "CONFLICT",
        "この商品は過去の注文で使用されているため削除できません。提供停止にしてください。",
        409,
      );
    }

    await db
      .delete(schema.menuItems)
      .where(
        and(
          eq(schema.menuItems.id, itemId),
          eq(schema.menuItems.store_id, storeId),
        ),
      );
    return c.json({ data: { id: itemId } });
  });
