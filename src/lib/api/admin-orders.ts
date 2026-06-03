import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, schema } from "../../db/client";
import { errorResponse } from "../http";
import { sumOrderItems } from "../order";
import { type AuthEnv, requireStore } from "./middleware";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OrderItemPayload = {
  id: string;
  name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  status: string;
  created_at: number;
};

type AdminOrderPayload = {
  id: string;
  seat_name: string;
  status: string;
  items: OrderItemPayload[];
  total: number;
  created_at: number;
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const adminOrdersRouter = new Hono<AuthEnv>()
  .use(requireStore)

  /**
   * GET /api/admin/orders
   * Returns all active orders (status 'open' or 'payment_requested') for the
   * authenticated store, including their line items and running total.
   *
   * Optional query parameter:
   *   ?since=<unix_ms>  — when provided, returns only orders whose created_at
   *                       is strictly greater than the given timestamp.
   *
   * Response: 200 { data: AdminOrderPayload[] }
   */
  .get("/", async (c) => {
    const { id: storeId } = c.var.store;
    const db = createDb(c.env.DB);

    // Parse optional ?since= query parameter
    const sinceRaw = c.req.query("since");
    const sinceMs = sinceRaw ? Number(sinceRaw) : Number.NaN;
    const hasSince = !Number.isNaN(sinceMs);

    // Fetch active orders for the store, optionally filtered by created_at
    const ordersRows = await db
      .select({
        id: schema.orders.id,
        seat_id: schema.orders.seat_id,
        status: schema.orders.status,
        created_at: schema.orders.created_at,
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.store_id, storeId),
          inArray(schema.orders.status, ["open", "payment_requested"]),
          hasSince ? gt(schema.orders.created_at, sinceMs) : undefined,
        ),
      )
      .orderBy(asc(schema.orders.created_at));

    if (ordersRows.length === 0) {
      return c.json({ data: [] });
    }

    // Fetch seat names and order items in parallel — both depend only on ordersRows
    const seatIds = [...new Set(ordersRows.map((o) => o.seat_id))];
    const orderIds = ordersRows.map((o) => o.id);

    const [seatsRows, itemsRows] = await Promise.all([
      db
        .select({ id: schema.seats.id, name: schema.seats.name })
        .from(schema.seats)
        .where(
          and(
            eq(schema.seats.store_id, storeId),
            inArray(schema.seats.id, seatIds),
          ),
        ),
      db
        .select()
        .from(schema.orderItems)
        .where(
          and(
            eq(schema.orderItems.store_id, storeId),
            inArray(schema.orderItems.order_id, orderIds),
          ),
        )
        .orderBy(asc(schema.orderItems.created_at)),
    ]);
    const seatNameById = new Map(seatsRows.map((s) => [s.id, s.name]));

    // Group items by order_id
    const itemsByOrderId = new Map<string, typeof itemsRows>();
    for (const item of itemsRows) {
      const list = itemsByOrderId.get(item.order_id) ?? [];
      list.push(item);
      itemsByOrderId.set(item.order_id, list);
    }

    // Assemble the response payload
    const data: AdminOrderPayload[] = ordersRows.map((order) => {
      const items = itemsByOrderId.get(order.id) ?? [];
      return {
        id: order.id,
        seat_name: seatNameById.get(order.seat_id) ?? "",
        status: order.status,
        items: items.map((item) => ({
          id: item.id,
          name_snapshot: item.name_snapshot,
          unit_price_snapshot: item.unit_price_snapshot,
          quantity: item.quantity,
          status: item.status,
          created_at: item.created_at,
        })),
        total: sumOrderItems(items),
        created_at: order.created_at,
      };
    });

    return c.json({ data });
  })

  /**
   * PATCH /api/admin/orders/items/:id/serve
   * Marks a single order item as 'served'.
   *
   * Idempotent: if the item is already 'served', returns 200 with the current
   * state without re-updating the DB.
   *
   * Multi-tenant safe: the store_id filter prevents cross-tenant access.
   * Returns 404 (not 403) for items that don't belong to the store to avoid
   * enumeration leaks, consistent with the NOT_FOUND convention.
   *
   * Response: 200 { data: { id, status, ... } }
   */
  .patch("/items/:id/serve", async (c) => {
    const { id: storeId } = c.var.store;
    const itemId = c.req.param("id");
    const db = createDb(c.env.DB);

    // Single UPDATE + RETURNING handles 404, idempotency, and transition in one round-trip.
    // Returns 0 rows when item not found or belongs to another store → 404.
    // Returns the row regardless of prior status, so already-served items return 200 idempotently.
    const updated = await db
      .update(schema.orderItems)
      .set({ status: "served" })
      .where(
        and(
          eq(schema.orderItems.id, itemId),
          eq(schema.orderItems.store_id, storeId),
        ),
      )
      .returning();

    if (updated.length === 0) {
      return errorResponse("NOT_FOUND", "注文明細が見つかりません。", 404);
    }

    const result = updated[0];
    return c.json({
      data: {
        id: result.id,
        order_id: result.order_id,
        name_snapshot: result.name_snapshot,
        unit_price_snapshot: result.unit_price_snapshot,
        quantity: result.quantity,
        status: result.status,
        created_at: result.created_at,
      },
    });
  });
