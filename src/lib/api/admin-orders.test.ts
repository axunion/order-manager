/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createDb, schema } from "../../db/client";
import { newId } from "../id";
import { app } from "./index";
import { withAuth } from "./test-helpers";

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

type SeedStore = { id: string; access_token: string };
type SeedSeat = { id: string; qr_token: string };

async function seedStore(name: string): Promise<SeedStore> {
  const db = createDb(env.DB);
  const id = newId();
  const access_token = newId();
  await db.insert(schema.stores).values({
    id,
    name,
    slug: newId(),
    access_token,
  });
  return { id, access_token };
}

async function seedSeat(storeId: string, name: string): Promise<SeedSeat> {
  const db = createDb(env.DB);
  const id = newId();
  const qr_token = newId();
  await db
    .insert(schema.seats)
    .values({ id, store_id: storeId, name, qr_token });
  return { id, qr_token };
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

// ---------------------------------------------------------------------------
// Helpers that seed a full order with items directly in DB
// ---------------------------------------------------------------------------

async function seedOrder(
  storeId: string,
  seatId: string,
  status: "open" | "payment_requested",
  createdAt?: number,
): Promise<string> {
  const db = createDb(env.DB);
  const id = newId();
  await db.insert(schema.orders).values({
    id,
    store_id: storeId,
    seat_id: seatId,
    status,
    created_at: createdAt,
  });
  return id;
}

async function seedOrderItem(
  storeId: string,
  orderId: string,
  menuItemId: string,
  opts: {
    name: string;
    price: number;
    quantity: number;
    status?: "ordered" | "served";
  },
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
    status: opts.status ?? "ordered",
  });
  return id;
}

// ---------------------------------------------------------------------------
// GET /api/admin/orders
// ---------------------------------------------------------------------------

describe("GET /api/admin/orders", () => {
  it("returns 401 without auth cookie", async () => {
    const res = await app.request("/api/admin/orders", {}, env);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 with an invalid token", async () => {
    const res = await app.request(
      "/api/admin/orders",
      withAuth("bad-token"),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns an empty array when there are no active orders", async () => {
    const store = await seedStore("AdminOrders Empty");
    const res = await app.request(
      "/api/admin/orders",
      withAuth(store.access_token),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toEqual([]);
  });

  it("returns active orders (open + payment_requested) with seat_name, items, and total", async () => {
    const store = await seedStore("AdminOrders Active");
    const seat = await seedSeat(store.id, "テーブル1");
    const menuItemId = await seedMenuItem(store.id, "ラーメン", 800);
    const orderId = await seedOrder(store.id, seat.id, "open");
    await seedOrderItem(store.id, orderId, menuItemId, {
      name: "ラーメン",
      price: 800,
      quantity: 2,
    });

    const res = await app.request(
      "/api/admin/orders",
      withAuth(store.access_token),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        id: string;
        seat_name: string;
        status: string;
        items: { name_snapshot: string; quantity: number; status: string }[];
        total: number;
        created_at: number;
      }[];
    };
    expect(body.data).toHaveLength(1);
    const order = body.data[0];
    expect(order.id).toBe(orderId);
    expect(order.seat_name).toBe("テーブル1");
    expect(order.status).toBe("open");
    expect(order.items).toHaveLength(1);
    expect(order.items[0].name_snapshot).toBe("ラーメン");
    expect(order.items[0].quantity).toBe(2);
    expect(order.items[0].status).toBe("ordered");
    expect(order.total).toBe(1600); // 800 * 2
    expect(typeof order.created_at).toBe("number");
  });

  it("includes payment_requested orders", async () => {
    const store = await seedStore("AdminOrders PayReq");
    const seat = await seedSeat(store.id, "テーブル2");
    await seedOrder(store.id, seat.id, "payment_requested");

    const res = await app.request(
      "/api/admin/orders",
      withAuth(store.access_token),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { status: string }[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].status).toBe("payment_requested");
  });

  it("excludes paid orders", async () => {
    const store = await seedStore("AdminOrders ExcludePaid");
    const seat = await seedSeat(store.id, "テーブル3");

    // Insert paid order directly (closed_at required by DB check)
    const db = createDb(env.DB);
    await db.insert(schema.orders).values({
      id: newId(),
      store_id: store.id,
      seat_id: seat.id,
      status: "paid",
      closed_at: Date.now(),
    });

    const res = await app.request(
      "/api/admin/orders",
      withAuth(store.access_token),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(0);
  });

  it("filters by ?since= (returns only orders created after the timestamp)", async () => {
    const store = await seedStore("AdminOrders Since");
    const seat = await seedSeat(store.id, "テーブル4");
    const now = Date.now();
    const oldOrderId = await seedOrder(store.id, seat.id, "open", now - 10_000);
    // A second seat is needed because the unique index prevents two active orders per seat
    const seat2 = await seedSeat(store.id, "テーブル5");
    const newOrderId = await seedOrder(store.id, seat2.id, "open", now + 1_000);

    const res = await app.request(
      `/api/admin/orders?since=${now}`,
      withAuth(store.access_token),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string }[] };
    const ids = body.data.map((o) => o.id);
    expect(ids).toContain(newOrderId);
    expect(ids).not.toContain(oldOrderId);
  });

  it("does not expose another store's orders (tenant isolation)", async () => {
    const storeA = await seedStore("AdminOrders ISO A");
    const storeB = await seedStore("AdminOrders ISO B");
    const seatB = await seedSeat(storeB.id, "Seat B");
    await seedOrder(storeB.id, seatB.id, "open");

    const res = await app.request(
      "/api/admin/orders",
      withAuth(storeA.access_token),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(0);
  });

  it("returns orders sorted by created_at ascending", async () => {
    const store = await seedStore("AdminOrders Sort");
    const seat1 = await seedSeat(store.id, "Seat Sort1");
    const seat2 = await seedSeat(store.id, "Seat Sort2");
    const now = Date.now();
    const order1Id = await seedOrder(store.id, seat1.id, "open", now - 5_000);
    const order2Id = await seedOrder(store.id, seat2.id, "open", now);

    const res = await app.request(
      "/api/admin/orders",
      withAuth(store.access_token),
      env,
    );
    const body = (await res.json()) as { data: { id: string }[] };
    expect(body.data[0].id).toBe(order1Id);
    expect(body.data[1].id).toBe(order2Id);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/orders/items/:id/serve
// ---------------------------------------------------------------------------

describe("PATCH /api/admin/orders/items/:id/serve", () => {
  it("returns 401 without auth cookie", async () => {
    const res = await app.request(
      `/api/admin/orders/items/${newId()}/serve`,
      { method: "PATCH" },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("transitions ordered → served and returns the updated item", async () => {
    const store = await seedStore("Serve Transition");
    const seat = await seedSeat(store.id, "Seat SV1");
    const menuItemId = await seedMenuItem(store.id, "カレー", 700);
    const orderId = await seedOrder(store.id, seat.id, "open");
    const itemId = await seedOrderItem(store.id, orderId, menuItemId, {
      name: "カレー",
      price: 700,
      quantity: 1,
    });

    const res = await app.request(
      `/api/admin/orders/items/${itemId}/serve`,
      withAuth(store.access_token, { method: "PATCH" }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { id: string; status: string };
    };
    expect(body.data.id).toBe(itemId);
    expect(body.data.status).toBe("served");

    // Verify DB was updated
    const db = createDb(env.DB);
    const allItems = await db.select().from(schema.orderItems);
    const target = allItems.find((i) => i.id === itemId);
    expect(target?.status).toBe("served");
  });

  it("is idempotent when item is already served", async () => {
    const store = await seedStore("Serve Idem");
    const seat = await seedSeat(store.id, "Seat SV2");
    const menuItemId = await seedMenuItem(store.id, "茶", 300);
    const orderId = await seedOrder(store.id, seat.id, "open");
    const itemId = await seedOrderItem(store.id, orderId, menuItemId, {
      name: "茶",
      price: 300,
      quantity: 1,
      status: "served",
    });

    const res = await app.request(
      `/api/admin/orders/items/${itemId}/serve`,
      withAuth(store.access_token, { method: "PATCH" }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { status: string } };
    expect(body.data.status).toBe("served");
  });

  it("returns 404 for a non-existent item id", async () => {
    const store = await seedStore("Serve 404");

    const res = await app.request(
      `/api/admin/orders/items/${newId()}/serve`,
      withAuth(store.access_token, { method: "PATCH" }),
      env,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 for another store's item (tenant isolation)", async () => {
    const storeA = await seedStore("Serve ISO A");
    const storeB = await seedStore("Serve ISO B");
    const seatB = await seedSeat(storeB.id, "Seat ISO B");
    const menuItemId = await seedMenuItem(storeB.id, "隠し商品", 999);
    const orderIdB = await seedOrder(storeB.id, seatB.id, "open");
    const itemIdB = await seedOrderItem(storeB.id, orderIdB, menuItemId, {
      name: "隠し商品",
      price: 999,
      quantity: 1,
    });

    // storeA tries to serve storeB's item
    const res = await app.request(
      `/api/admin/orders/items/${itemIdB}/serve`,
      withAuth(storeA.access_token, { method: "PATCH" }),
      env,
    );
    expect(res.status).toBe(404);
  });
});
