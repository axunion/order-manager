import {
  AddOrderItemsInput,
  errorResponse,
  newId,
  now,
  sumOrderItems,
} from "@order/core";
import { createDb, schema } from "@order/db";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { Hono } from "hono";
import { requireSeat, type SeatEnv } from "../middleware";
import { mapOrderItem, type OrderItemPayload } from "../order-item";
import { bodyValidator } from "../validator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Full order response shape (embedded in data envelope). */
type OrderPayload = {
  id: string;
  status: string;
  items: OrderItemPayload[];
  total: number;
};

/**
 * Returns the single active order (status 'open' or 'payment_requested')
 * for a seat, or null if none exists.
 *
 * Extracted as a helper because the same WHERE clause is used in the GET
 * bootstrap, POST /items, and PATCH /request-payment handlers.
 */
async function findActiveOrder(
  db: ReturnType<typeof createDb>,
  seatId: string,
  storeId: string,
) {
  const rows = await db
    .select()
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.seat_id, seatId),
        eq(schema.orders.store_id, storeId),
        or(
          eq(schema.orders.status, "open"),
          eq(schema.orders.status, "payment_requested"),
        ),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Fetches the active order with its items, or returns null if none exists.
 * Uses findActiveOrder internally so the query is not duplicated.
 */
async function getActiveOrderWithItems(
  db: ReturnType<typeof createDb>,
  seatId: string,
  storeId: string,
): Promise<OrderPayload | null> {
  const order = await findActiveOrder(db, seatId, storeId);
  if (!order) return null;

  const items = await db
    .select()
    .from(schema.orderItems)
    .where(
      and(
        eq(schema.orderItems.order_id, order.id),
        eq(schema.orderItems.store_id, storeId),
      ),
    )
    .orderBy(asc(schema.orderItems.created_at));

  return {
    id: order.id,
    status: order.status,
    items: items.map(mapOrderItem),
    total: sumOrderItems(items),
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const orderRouter = new Hono<SeatEnv>()
  /**
   * GET /api/order/:seatToken
   * Bootstrap endpoint: returns seat info, available menu, and the active order
   * (if any) for the given seat.
   *
   * Used by the customer order screen on initial load.
   */
  .get("/:seatToken", requireSeat, async (c) => {
    const { id: seatId, store_id: storeId, name: seatName } = c.var.seat;
    const db = createDb(c.env.DB);

    // Fetch menu categories and available items in parallel with active order
    const [categories, items, order] = await Promise.all([
      db
        .select({
          id: schema.menuCategories.id,
          name: schema.menuCategories.name,
          sort_order: schema.menuCategories.sort_order,
        })
        .from(schema.menuCategories)
        .where(eq(schema.menuCategories.store_id, storeId))
        .orderBy(asc(schema.menuCategories.sort_order)),
      db
        .select({
          id: schema.menuItems.id,
          category_id: schema.menuItems.category_id,
          name: schema.menuItems.name,
          price: schema.menuItems.price,
          sort_order: schema.menuItems.sort_order,
          description: schema.menuItems.description,
          image_key: schema.menuItems.image_key,
        })
        .from(schema.menuItems)
        .where(
          and(
            eq(schema.menuItems.store_id, storeId),
            eq(schema.menuItems.is_available, true),
          ),
        )
        .orderBy(asc(schema.menuItems.sort_order)),
      getActiveOrderWithItems(db, seatId, storeId),
    ]);

    return c.json({
      data: {
        seat: { name: seatName },
        menu: { categories, items },
        order,
      },
    });
  })

  /**
   * POST /api/order/:seatToken/items
   * Adds one or more items to the active order for the seat.
   * Creates a new order (status 'open') on the first call (lazy creation).
   *
   * Returns 409 if the order is already in 'payment_requested' state.
   * Returns 404 if any menu_item_id does not exist for the store.
   * Returns 409 if any menu item is not available (is_available = false).
   *
   * Response: 201 (new order created) or 200 (items added to existing order),
   * both with { data: { order } } containing the updated full order state.
   */
  .post(
    "/:seatToken/items",
    requireSeat,
    bodyValidator(AddOrderItemsInput),
    async (c) => {
      const { id: seatId, store_id: storeId } = c.var.seat;
      const { items: inputItems } = c.req.valid("json");
      const db = createDb(c.env.DB);

      // --- Step 1: Check for existing active order ---
      const activeOrder = await findActiveOrder(db, seatId, storeId);
      if (activeOrder?.status === "payment_requested") {
        return errorResponse(
          "CONFLICT",
          "会計要求中のため新たな注文を追加できません。",
          409,
        );
      }

      // --- Step 2: Validate ALL items up-front (single WHERE IN query) ---
      // This prevents orphaned orders: if any item is invalid the whole request
      // is rejected before touching the orders table.
      const menuItemRows = await db
        .select({
          id: schema.menuItems.id,
          name: schema.menuItems.name,
          price: schema.menuItems.price,
          is_available: schema.menuItems.is_available,
        })
        .from(schema.menuItems)
        .where(
          and(
            inArray(
              schema.menuItems.id,
              inputItems.map((i) => i.menu_item_id),
            ),
            eq(schema.menuItems.store_id, storeId),
          ),
        );

      const menuItemMap = new Map(menuItemRows.map((r) => [r.id, r]));

      const resolvedItems: {
        menu_item_id: string;
        name: string;
        price: number;
        quantity: number;
      }[] = [];

      for (const input of inputItems) {
        const menuItem = menuItemMap.get(input.menu_item_id);
        if (!menuItem) {
          return errorResponse(
            "NOT_FOUND",
            `メニュー商品が見つかりません。`,
            404,
          );
        }
        if (!menuItem.is_available) {
          return errorResponse(
            "CONFLICT",
            `${menuItem.name} は現在ご注文いただけません。`,
            409,
          );
        }
        resolvedItems.push({
          menu_item_id: input.menu_item_id,
          name: menuItem.name,
          price: menuItem.price,
          quantity: input.quantity,
        });
      }

      // --- Step 3: Create order (if needed) AFTER validation passes ---
      // The partial unique index idx_one_active_order_per_seat on (seat_id)
      // WHERE status IN ('open','payment_requested') prevents two concurrent
      // Workers from creating duplicate active orders for the same seat.
      // A constraint violation means a concurrent request already created the
      // order; re-fetch and use that one.
      let orderCreated = false;
      let orderId: string;

      if (!activeOrder) {
        orderId = newId();
        try {
          await db.insert(schema.orders).values({
            id: orderId,
            store_id: storeId,
            seat_id: seatId,
            status: "open",
          });
          orderCreated = true;
        } catch {
          // A concurrent request may have created the order first (unique
          // constraint on the partial index). Re-fetch to distinguish that from
          // a real error.
          const concurrent = await findActiveOrder(db, seatId, storeId);
          if (!concurrent) {
            // No concurrent order either — a genuine DB error occurred.
            return errorResponse(
              "INTERNAL_ERROR",
              "注文の処理中にエラーが発生しました。再度お試しください。",
              500,
            );
          }
          if (concurrent.status === "payment_requested") {
            return errorResponse(
              "CONFLICT",
              "会計要求中のため新たな注文を追加できません。",
              409,
            );
          }
          orderId = concurrent.id;
        }
      } else {
        orderId = activeOrder.id;
      }

      // --- Step 4: Insert order items ---
      // Per-item timestamp offset ensures ORDER BY created_at gives a stable,
      // submission-order sequence even when all items share the same base time.
      // All items are inserted in a single round-trip to avoid N sequential
      // D1 calls.
      const ts = now();
      await db.insert(schema.orderItems).values(
        resolvedItems.map((item, i) => ({
          id: newId(),
          store_id: storeId,
          order_id: orderId,
          menu_item_id: item.menu_item_id,
          name_snapshot: item.name,
          unit_price_snapshot: item.price,
          quantity: item.quantity,
          status: "ordered" as const,
          created_at: ts + i,
        })),
      );

      // --- Step 5: Return the updated order ---
      // Guard against the unlikely concurrent close between inserts and re-fetch.
      const order = await getActiveOrderWithItems(db, seatId, storeId);
      if (!order) {
        return errorResponse(
          "INTERNAL_ERROR",
          "注文の処理中にエラーが発生しました。再度お試しください。",
          500,
        );
      }

      // 201 when a new order record was created; 200 when items were appended to
      // an existing order, so clients can distinguish the two cases.
      return c.json({ data: { order } }, orderCreated ? 201 : 200);
    },
  )

  /**
   * PATCH /api/order/:seatToken/request-payment
   * Transitions the active order from 'open' to 'payment_requested'.
   *
   * Idempotent: returns 200 if the order is already 'payment_requested'.
   * Returns 409 if there is no active order to request payment for.
   */
  .patch("/:seatToken/request-payment", requireSeat, async (c) => {
    const { id: seatId, store_id: storeId } = c.var.seat;
    const db = createDb(c.env.DB);

    const order = await findActiveOrder(db, seatId, storeId);

    if (!order) {
      return errorResponse(
        "CONFLICT",
        "会計要求できるアクティブな注文がありません。",
        409,
      );
    }

    // Already payment_requested — idempotent 200
    if (order.status === "payment_requested") {
      return c.json({ data: { id: order.id, status: order.status } });
    }

    // Transition open → payment_requested
    await db
      .update(schema.orders)
      .set({ status: "payment_requested" })
      .where(
        and(
          eq(schema.orders.id, order.id),
          eq(schema.orders.store_id, storeId),
        ),
      );

    return c.json({ data: { id: order.id, status: "payment_requested" } });
  });
