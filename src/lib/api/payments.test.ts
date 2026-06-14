/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, schema } from "../../db/client";
import { newId } from "../id";
import { app } from "./index";
import { jsonInit, seedStore, withAuth } from "./test-helpers";

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

type SeedSeat = { id: string };

async function seedSeat(storeId: string, name: string): Promise<SeedSeat> {
  const db = createDb(env.DB);
  const id = newId();
  await db
    .insert(schema.seats)
    .values({ id, store_id: storeId, name, qr_token: newId() });
  return { id };
}

async function seedMenuItem(
  storeId: string,
  name: string,
  price: number,
): Promise<string> {
  const db = createDb(env.DB);
  const id = newId();
  await db.insert(schema.menuItems).values({
    id,
    store_id: storeId,
    name,
    price,
    is_available: true,
    category_id: null,
    sort_order: 0,
  });
  return id;
}

async function seedOrder(
  storeId: string,
  seatId: string,
  status: "open" | "payment_requested" | "paid",
): Promise<string> {
  const db = createDb(env.DB);
  const id = newId();
  await db.insert(schema.orders).values({
    id,
    store_id: storeId,
    seat_id: seatId,
    status,
    closed_at: status === "paid" ? Date.now() : undefined,
  });
  return id;
}

async function seedOrderItem(
  storeId: string,
  orderId: string,
  menuItemId: string,
  opts: { name: string; price: number; quantity: number },
): Promise<string> {
  const db = createDb(env.DB);
  const id = newId();
  await db.insert(schema.orderItems).values({
    id,
    store_id: storeId,
    order_id: orderId,
    menu_item_id: menuItemId,
    name_snapshot: opts.name,
    unit_price_snapshot: opts.price,
    quantity: opts.quantity,
    status: "ordered",
  });
  return id;
}

// ---------------------------------------------------------------------------
// GET /api/payments/pending
// ---------------------------------------------------------------------------

describe("GET /api/payments/pending", () => {
  it("returns 401 without auth cookie", async () => {
    const res = await app.request("/api/payments/pending", {}, env);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 with an invalid token", async () => {
    const res = await app.request(
      "/api/payments/pending",
      withAuth("bad-token"),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns an empty array when there are no payment_requested orders", async () => {
    const store = await seedStore("Payments Pending Empty");
    const res = await app.request(
      "/api/payments/pending",
      withAuth(store.session_token),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toEqual([]);
  });

  it("returns payment_requested orders with seat_name, items, and total", async () => {
    const store = await seedStore("Payments Pending Active");
    const seat = await seedSeat(store.id, "テーブルA");
    const menuItemId = await seedMenuItem(store.id, "唐揚げ", 500);
    const orderId = await seedOrder(store.id, seat.id, "payment_requested");
    await seedOrderItem(store.id, orderId, menuItemId, {
      name: "唐揚げ",
      price: 500,
      quantity: 3,
    });

    const res = await app.request(
      "/api/payments/pending",
      withAuth(store.session_token),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        id: string;
        seat_name: string;
        status: string;
        items: {
          name_snapshot: string;
          unit_price_snapshot: number;
          quantity: number;
          status: string;
        }[];
        total: number;
        created_at: number;
      }[];
    };
    expect(body.data).toHaveLength(1);
    const order = body.data[0];
    expect(order.id).toBe(orderId);
    expect(order.seat_name).toBe("テーブルA");
    expect(order.status).toBe("payment_requested");
    expect(order.items).toHaveLength(1);
    expect(order.items[0].name_snapshot).toBe("唐揚げ");
    expect(order.items[0].unit_price_snapshot).toBe(500);
    expect(order.items[0].quantity).toBe(3);
    expect(order.total).toBe(1500); // 500 * 3
    expect(typeof order.created_at).toBe("number");
  });

  it("excludes open orders (only payment_requested appears)", async () => {
    const store = await seedStore("Payments Pending ExcludeOpen");
    const seat = await seedSeat(store.id, "テーブルB");
    await seedOrder(store.id, seat.id, "open");

    const res = await app.request(
      "/api/payments/pending",
      withAuth(store.session_token),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(0);
  });

  it("excludes paid orders", async () => {
    const store = await seedStore("Payments Pending ExcludePaid");
    const seat = await seedSeat(store.id, "テーブルC");
    await seedOrder(store.id, seat.id, "paid");

    const res = await app.request(
      "/api/payments/pending",
      withAuth(store.session_token),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(0);
  });

  it("does not expose another store's orders (tenant isolation)", async () => {
    const storeA = await seedStore("Payments Pending ISO A");
    const storeB = await seedStore("Payments Pending ISO B");
    const seatB = await seedSeat(storeB.id, "Seat B");
    await seedOrder(storeB.id, seatB.id, "payment_requested");

    const res = await app.request(
      "/api/payments/pending",
      withAuth(storeA.session_token),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// POST /api/payments
// ---------------------------------------------------------------------------

describe("POST /api/payments", () => {
  it("returns 401 without auth cookie", async () => {
    const res = await app.request(
      "/api/payments",
      jsonInit("POST", { order_id: newId() }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when order_id is missing", async () => {
    const store = await seedStore("Payments Post Validation");
    const res = await app.request(
      "/api/payments",
      withAuth(store.session_token, jsonInit("POST", {})),
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 for a non-existent order_id", async () => {
    const store = await seedStore("Payments Post 404");
    const res = await app.request(
      "/api/payments",
      withAuth(store.session_token, jsonInit("POST", { order_id: newId() })),
      env,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 for another store's order (tenant isolation)", async () => {
    const storeA = await seedStore("Payments Post ISO A");
    const storeB = await seedStore("Payments Post ISO B");
    const seatB = await seedSeat(storeB.id, "Seat ISO B");
    const orderIdB = await seedOrder(storeB.id, seatB.id, "payment_requested");

    const res = await app.request(
      "/api/payments",
      withAuth(storeA.session_token, jsonInit("POST", { order_id: orderIdB })),
      env,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 409 when the order has no items", async () => {
    const store = await seedStore("Payments Post ZeroItems");
    const seat = await seedSeat(store.id, "Seat Zero");
    // Seed payment_requested order with no items (skipping seedOrderItem)
    const orderId = await seedOrder(store.id, seat.id, "payment_requested");

    const res = await app.request(
      "/api/payments",
      withAuth(store.session_token, jsonInit("POST", { order_id: orderId })),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CONFLICT");
  });

  it("returns 409 when the order is still open (not yet payment_requested)", async () => {
    const store = await seedStore("Payments Post OpenOrder");
    const seat = await seedSeat(store.id, "Seat Open");
    const orderId = await seedOrder(store.id, seat.id, "open");

    const res = await app.request(
      "/api/payments",
      withAuth(store.session_token, jsonInit("POST", { order_id: orderId })),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CONFLICT");
  });

  it("creates a payment record and transitions order to paid", async () => {
    const store = await seedStore("Payments Post Success");
    const seat = await seedSeat(store.id, "テーブルX");
    const menuItemId = await seedMenuItem(store.id, "ビール", 600);
    const orderId = await seedOrder(store.id, seat.id, "payment_requested");
    await seedOrderItem(store.id, orderId, menuItemId, {
      name: "ビール",
      price: 600,
      quantity: 2,
    });

    const res = await app.request(
      "/api/payments",
      withAuth(store.session_token, jsonInit("POST", { order_id: orderId })),
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: {
        id: string;
        order_id: string;
        total_amount: number;
        method: string;
        paid_at: number;
      };
    };
    expect(body.data.order_id).toBe(orderId);
    expect(body.data.total_amount).toBe(1200); // 600 * 2
    expect(body.data.method).toBe("cash");
    expect(typeof body.data.paid_at).toBe("number");
    expect(typeof body.data.id).toBe("string");

    // Verify DB: payments record created
    const db = createDb(env.DB);
    const payments = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.order_id, orderId));
    expect(payments).toHaveLength(1);
    expect(payments[0].total_amount).toBe(1200);
    expect(payments[0].method).toBe("cash");

    // Verify DB: order transitioned to paid with closed_at
    const orders = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId));
    expect(orders[0].status).toBe("paid");
    expect(orders[0].closed_at).not.toBeNull();
  });

  it("calculates total_amount correctly using unit_price_snapshot × quantity", async () => {
    const store = await seedStore("Payments Post TotalCalc");
    const seat = await seedSeat(store.id, "Seat Calc");
    const menuItemId1 = await seedMenuItem(store.id, "餃子", 400);
    const menuItemId2 = await seedMenuItem(store.id, "ラーメン", 800);
    const orderId = await seedOrder(store.id, seat.id, "payment_requested");
    await seedOrderItem(store.id, orderId, menuItemId1, {
      name: "餃子",
      price: 400,
      quantity: 2,
    });
    await seedOrderItem(store.id, orderId, menuItemId2, {
      name: "ラーメン",
      price: 800,
      quantity: 1,
    });
    // Expected: 400*2 + 800*1 = 1600

    const res = await app.request(
      "/api/payments",
      withAuth(store.session_token, jsonInit("POST", { order_id: orderId })),
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { total_amount: number } };
    expect(body.data.total_amount).toBe(1600);
  });

  it("returns 409 when the order is already paid (duplicate payment prevention)", async () => {
    const store = await seedStore("Payments Post Duplicate");
    const seat = await seedSeat(store.id, "Seat Dup");
    const menuItemId = await seedMenuItem(store.id, "お茶", 200);
    const orderId = await seedOrder(store.id, seat.id, "payment_requested");
    await seedOrderItem(store.id, orderId, menuItemId, {
      name: "お茶",
      price: 200,
      quantity: 1,
    });

    // First payment — should succeed
    const res1 = await app.request(
      "/api/payments",
      withAuth(store.session_token, jsonInit("POST", { order_id: orderId })),
      env,
    );
    expect(res1.status).toBe(201);

    // Second payment — should be rejected
    const res2 = await app.request(
      "/api/payments",
      withAuth(store.session_token, jsonInit("POST", { order_id: orderId })),
      env,
    );
    expect(res2.status).toBe(409);
    const body = (await res2.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CONFLICT");
  });
});
