import {
  CreatePaymentInput,
  errorResponse,
  newId,
  now,
  sumOrderItems,
} from "@order/core";
import { createDb, schema } from "@order/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { type AuthEnv, requireStore } from "../middleware";
import { mapOrderItem, type OrderItemPayload } from "../order-item";
import { bodyValidator } from "../validator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Pending checkout order returned by GET /api/payments/pending. */
type PendingCheckPayload = {
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

export const paymentsRouter = new Hono<AuthEnv>()
  .use(requireStore)

  /**
   * GET /api/payments/pending
   * Returns all orders in 'payment_requested' status for the authenticated store,
   * including their line items and running total.
   *
   * Used by the checkout screen to display bills awaiting payment.
   *
   * Response: 200 { data: PendingCheckPayload[] }
   */
  .get("/pending", async (c) => {
    const { id: storeId } = c.var.store;
    const db = createDb(c.env.DB);

    // Fetch only payment_requested orders for this store
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
          eq(schema.orders.status, "payment_requested"),
        ),
      )
      .orderBy(asc(schema.orders.created_at));

    if (ordersRows.length === 0) {
      return c.json({ data: [] });
    }

    // Fetch seat names and order items in parallel
    // The partial UNIQUE index on seat_id (for active orders) guarantees one
    // payment_requested order per seat, so deduplication is unnecessary.
    const seatIds = ordersRows.map((o) => o.seat_id);
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
    const data: PendingCheckPayload[] = ordersRows.map((order) => {
      const items = itemsByOrderId.get(order.id) ?? [];
      return {
        id: order.id,
        seat_name: seatNameById.get(order.seat_id) ?? "",
        status: order.status,
        items: items.map(mapOrderItem),
        total: sumOrderItems(items),
        created_at: order.created_at,
      };
    });

    return c.json({ data });
  })

  /**
   * POST /api/payments
   * Completes payment for a 'payment_requested' order.
   *
   * Steps:
   *  1. Fetch the order by order_id + store_id (404 if not found).
   *  2. Reject with 409 if order is not in 'payment_requested' status.
   *  3. Fetch order items; reject with 409 if there are none.
   *  4. INSERT payment + UPDATE order atomically via db.batch().
   *
   * Atomicity: db.batch() wraps both writes in an implicit D1 transaction.
   * If either statement fails the entire batch is rolled back, preventing
   * orphaned payment records when the order UPDATE would have failed.
   *
   * Duplicate payment detection: the UNIQUE constraint on payments.order_id
   * blocks concurrent payments for the same order. The error message is checked
   * to distinguish UNIQUE violations (409) from other DB failures (500).
   *
   * Response: 201 { data: { id, order_id, total_amount, method, paid_at } }
   */
  .post("/", bodyValidator(CreatePaymentInput), async (c) => {
    const { id: storeId } = c.var.store;
    const { order_id: orderId } = c.req.valid("json");
    const db = createDb(c.env.DB);

    // --- Step 1: Fetch the order, verifying store ownership ---
    // Always filter by store_id to prevent cross-tenant access.
    // Return 404 (not 403) to avoid enumeration leaks.
    const orderRows = await db
      .select()
      .from(schema.orders)
      .where(
        and(eq(schema.orders.id, orderId), eq(schema.orders.store_id, storeId)),
      )
      .limit(1);

    const order = orderRows[0];
    if (!order) {
      return errorResponse("NOT_FOUND", "注文が見つかりません。", 404);
    }

    // --- Step 2: Validate status transition ---
    // Only 'payment_requested' orders can be checked out.
    if (order.status !== "payment_requested") {
      return errorResponse(
        "CONFLICT",
        order.status === "paid"
          ? "この注文は既に会計済みです。"
          : "会計要求がされていない注文です。",
        409,
      );
    }

    // --- Step 3: Fetch items and calculate total ---
    const items = await db
      .select()
      .from(schema.orderItems)
      .where(
        and(
          eq(schema.orderItems.order_id, orderId),
          eq(schema.orderItems.store_id, storeId),
        ),
      );

    // Guard: an order with no items should not be billed.
    if (items.length === 0) {
      return errorResponse(
        "CONFLICT",
        "注文明細がありません。会計できません。",
        409,
      );
    }

    const totalAmount = sumOrderItems(items);
    const paidAt = now();
    const paymentId = newId();

    // --- Steps 4 & 5: Atomically INSERT payment and UPDATE order ---
    // db.batch() wraps both statements in an implicit D1 transaction: if either
    // fails the entire batch is rolled back, preventing an orphaned payment row
    // when the order UPDATE would have failed.
    //
    // UNIQUE constraint violation (concurrent duplicate payment) is identified
    // by the error message so we can return 409 instead of 500. Any other DB
    // failure (connection error, disk full, etc.) is surfaced as 500 so the
    // client can distinguish a real infrastructure problem from a duplicate.
    try {
      await db.batch([
        db.insert(schema.payments).values({
          id: paymentId,
          store_id: storeId,
          order_id: orderId,
          total_amount: totalAmount,
          method: "cash",
          paid_at: paidAt,
        }),
        db
          .update(schema.orders)
          .set({ status: "paid", closed_at: paidAt })
          .where(
            and(
              eq(schema.orders.id, orderId),
              eq(schema.orders.store_id, storeId),
            ),
          ),
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("UNIQUE constraint failed")) {
        return errorResponse("CONFLICT", "この注文は既に会計済みです。", 409);
      }
      return errorResponse(
        "INTERNAL_ERROR",
        "会計処理中にエラーが発生しました。再度お試しください。",
        500,
      );
    }

    return c.json(
      {
        data: {
          id: paymentId,
          order_id: orderId,
          total_amount: totalAmount,
          method: "cash",
          paid_at: paidAt,
        },
      },
      201,
    );
  });
