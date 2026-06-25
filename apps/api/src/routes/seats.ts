import { CreateSeatInput, errorResponse, newId } from "@order/core";
import { createDb, schema } from "@order/db";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { type AuthEnv, requireStore } from "../middleware";
import { bodyValidator } from "../validator";

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const seatsRouter = new Hono<AuthEnv>()
  .use(requireStore)

  /**
   * GET /api/seats
   * Returns all seats for the authenticated store, ordered by created_at.
   */
  .get("/", async (c) => {
    const { id: storeId } = c.var.store;
    const db = createDb(c.env.DB);
    const rows = await db
      .select()
      .from(schema.seats)
      .where(eq(schema.seats.store_id, storeId))
      .orderBy(asc(schema.seats.created_at));
    return c.json({ data: rows });
  })

  /**
   * POST /api/seats
   * Creates a new seat for the authenticated store.
   * Generates a unique qr_token (UUID v4) embedded in /order/:qr_token URLs.
   * Response: 201 { data: { id, store_id, name, qr_token, created_at } }
   */
  .post("/", bodyValidator(CreateSeatInput), async (c) => {
    const { id: storeId } = c.var.store;
    const { name } = c.req.valid("json");
    const id = newId();
    const qr_token = newId();
    const db = createDb(c.env.DB);
    let returning: (typeof schema.seats.$inferSelect)[];
    try {
      returning = await db
        .insert(schema.seats)
        .values({ id, store_id: storeId, name, qr_token })
        .returning();
    } catch {
      return errorResponse(
        "INTERNAL_ERROR",
        "座席の作成に失敗しました。再度お試しください。",
        500,
      );
    }
    return c.json({ data: returning[0] }, 201);
  })

  /**
   * DELETE /api/seats/:id
   * Deletes a seat owned by the authenticated store.
   * Returns 409 if any orders reference this seat. Because orders.seat_id is
   * NOT NULL, deleting a seat with historical paid orders would violate the FK
   * constraint. Making seat_id nullable (a future schema migration) is required
   * to allow deletion of seats that only have closed orders.
   * Returns 404 if not found or owned by a different store.
   */
  .delete("/:id", async (c) => {
    const { id: storeId } = c.var.store;
    const seatId = c.req.param("id");
    const db = createDb(c.env.DB);

    // Verify ownership before checking references.
    const existing = await db
      .select({ id: schema.seats.id })
      .from(schema.seats)
      .where(
        and(eq(schema.seats.id, seatId), eq(schema.seats.store_id, storeId)),
      )
      .limit(1);
    if (existing.length === 0) {
      return errorResponse("NOT_FOUND", "Seat not found", 404);
    }

    // Block deletion if any orders reference this seat. The orders.seat_id FK
    // is NOT NULL, so the DB would reject the delete regardless. This check
    // returns a clean 409 before hitting the constraint.
    const refs = await db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.seat_id, seatId),
          eq(schema.orders.store_id, storeId),
        ),
      )
      .limit(1);
    if (refs.length > 0) {
      return errorResponse(
        "CONFLICT",
        "この座席には注文が紐づいているため削除できません。",
        409,
      );
    }

    await db
      .delete(schema.seats)
      .where(
        and(eq(schema.seats.id, seatId), eq(schema.seats.store_id, storeId)),
      );
    return c.json({ data: { id: seatId } });
  });
