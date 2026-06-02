/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, schema } from "../../db/client";
import { newId } from "../id";
import { app } from "./index";

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
  opts: {
    name: string;
    price: number;
    isAvailable?: boolean;
    categoryId?: string | null;
    sortOrder?: number;
  },
): Promise<string> {
  const db = createDb(env.DB);
  const id = newId();
  await db.insert(schema.menuItems).values({
    id,
    store_id: storeId,
    name: opts.name,
    price: opts.price,
    is_available: opts.isAvailable ?? true,
    category_id: opts.categoryId ?? null,
    sort_order: opts.sortOrder ?? 0,
  });
  return id;
}

async function seedCategory(storeId: string, name: string): Promise<string> {
  const db = createDb(env.DB);
  const id = newId();
  await db.insert(schema.menuCategories).values({
    id,
    store_id: storeId,
    name,
    sort_order: 0,
  });
  return id;
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
// GET /api/order/:seatToken  (bootstrap)
// ---------------------------------------------------------------------------

describe("GET /api/order/:seatToken", () => {
  it("returns 404 for an invalid seatToken", async () => {
    const res = await app.request(`/api/order/${newId()}`, {}, env);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns seat name, empty menu, and null order when no menu or order exists", async () => {
    const store = await seedStore("Bootstrap Empty");
    const seat = await seedSeat(store.id, "Table 1");

    const res = await app.request(`/api/order/${seat.qr_token}`, {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        seat: { name: string };
        menu: { categories: unknown[]; items: unknown[] };
        order: unknown;
      };
    };
    expect(body.data.seat.name).toBe("Table 1");
    expect(body.data.menu.categories).toEqual([]);
    expect(body.data.menu.items).toEqual([]);
    expect(body.data.order).toBeNull();
  });

  it("returns available menu items and categories", async () => {
    const store = await seedStore("Bootstrap Menu");
    const seat = await seedSeat(store.id, "Table 2");
    const catId = await seedCategory(store.id, "ドリンク");
    await seedMenuItem(store.id, {
      name: "コーヒー",
      price: 500,
      categoryId: catId,
    });
    await seedMenuItem(store.id, {
      name: "紅茶",
      price: 450,
      isAvailable: false,
    });

    const res = await app.request(`/api/order/${seat.qr_token}`, {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        menu: {
          categories: { name: string }[];
          items: { name: string; price: number }[];
        };
        order: unknown;
      };
    };
    // 品切れ中の商品 (紅茶) は含まれない
    expect(body.data.menu.items).toHaveLength(1);
    expect(body.data.menu.items[0].name).toBe("コーヒー");
    expect(body.data.menu.items[0].price).toBe(500);
    expect(body.data.menu.categories).toHaveLength(1);
    expect(body.data.menu.categories[0].name).toBe("ドリンク");
    expect(body.data.order).toBeNull();
  });

  it("returns the active order if one exists", async () => {
    const store = await seedStore("Bootstrap With Order");
    const seat = await seedSeat(store.id, "Table 3");
    const itemId = await seedMenuItem(store.id, {
      name: "ラーメン",
      price: 800,
    });

    // Create order and item directly in DB
    const db = createDb(env.DB);
    const orderId = newId();
    await db.insert(schema.orders).values({
      id: orderId,
      store_id: store.id,
      seat_id: seat.id,
      status: "open",
    });
    await db.insert(schema.orderItems).values({
      id: newId(),
      store_id: store.id,
      order_id: orderId,
      menu_item_id: itemId,
      name_snapshot: "ラーメン",
      unit_price_snapshot: 800,
      quantity: 2,
      status: "ordered",
    });

    const res = await app.request(`/api/order/${seat.qr_token}`, {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        order: {
          id: string;
          status: string;
          items: { name_snapshot: string; quantity: number }[];
          total: number;
        };
      };
    };
    expect(body.data.order).not.toBeNull();
    expect(body.data.order.id).toBe(orderId);
    expect(body.data.order.status).toBe("open");
    expect(body.data.order.items).toHaveLength(1);
    expect(body.data.order.items[0].name_snapshot).toBe("ラーメン");
    expect(body.data.order.items[0].quantity).toBe(2);
    expect(body.data.order.total).toBe(1600);
  });

  it("does not expose another store's menu items (tenant isolation)", async () => {
    const storeA = await seedStore("Bootstrap ISO A");
    const storeB = await seedStore("Bootstrap ISO B");
    const seat = await seedSeat(storeA.id, "Seat ISO");
    await seedMenuItem(storeB.id, { name: "Store B Item", price: 999 });

    const res = await app.request(`/api/order/${seat.qr_token}`, {}, env);
    const body = (await res.json()) as { data: { menu: { items: unknown[] } } };
    expect(body.data.menu.items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// POST /api/order/:seatToken/items
// ---------------------------------------------------------------------------

describe("POST /api/order/:seatToken/items", () => {
  it("returns 404 for an invalid seatToken", async () => {
    const res = await app.request(
      `/api/order/${newId()}/items`,
      jsonInit("POST", { items: [{ menu_item_id: newId(), quantity: 1 }] }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("lazily creates an order and adds the item on first call", async () => {
    const store = await seedStore("Items Create Order");
    const seat = await seedSeat(store.id, "Seat C1");
    const itemId = await seedMenuItem(store.id, { name: "カレー", price: 700 });

    const res = await app.request(
      `/api/order/${seat.qr_token}/items`,
      jsonInit("POST", { items: [{ menu_item_id: itemId, quantity: 1 }] }),
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: {
        order: {
          id: string;
          status: string;
          items: {
            name_snapshot: string;
            unit_price_snapshot: number;
            quantity: number;
            status: string;
          }[];
          total: number;
        };
      };
    };
    expect(body.data.order).not.toBeNull();
    expect(body.data.order.status).toBe("open");
    expect(body.data.order.items).toHaveLength(1);
    expect(body.data.order.items[0].name_snapshot).toBe("カレー");
    expect(body.data.order.items[0].unit_price_snapshot).toBe(700);
    expect(body.data.order.items[0].quantity).toBe(1);
    expect(body.data.order.items[0].status).toBe("ordered");
    expect(body.data.order.total).toBe(700);

    // Verify order was created in DB
    const db = createDb(env.DB);
    const orders = await db
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.seat_id, seat.id),
          eq(schema.orders.store_id, store.id),
        ),
      );
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe("open");
  });

  it("adds items to an existing open order", async () => {
    const store = await seedStore("Items Add To Existing");
    const seat = await seedSeat(store.id, "Seat A2");
    const itemId1 = await seedMenuItem(store.id, { name: "寿司", price: 1200 });
    const itemId2 = await seedMenuItem(store.id, { name: "刺身", price: 900 });

    const db = createDb(env.DB);
    const orderId = newId();
    await db.insert(schema.orders).values({
      id: orderId,
      store_id: store.id,
      seat_id: seat.id,
      status: "open",
    });
    await db.insert(schema.orderItems).values({
      id: newId(),
      store_id: store.id,
      order_id: orderId,
      menu_item_id: itemId1,
      name_snapshot: "寿司",
      unit_price_snapshot: 1200,
      quantity: 1,
      status: "ordered",
    });

    const res = await app.request(
      `/api/order/${seat.qr_token}/items`,
      jsonInit("POST", { items: [{ menu_item_id: itemId2, quantity: 2 }] }),
      env,
    );
    // 200 because the order already existed (items appended, no new order created)
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { order: { id: string; items: unknown[]; total: number } };
    };
    // Both items should be in the order now
    expect(body.data.order.id).toBe(orderId);
    expect(body.data.order.items).toHaveLength(2);
    expect(body.data.order.total).toBe(1200 + 900 * 2); // 3000
  });

  it("snapshots menu item name and price at order time", async () => {
    const store = await seedStore("Items Snapshot");
    const seat = await seedSeat(store.id, "Seat SN");
    const itemId = await seedMenuItem(store.id, { name: "スープ", price: 400 });

    await app.request(
      `/api/order/${seat.qr_token}/items`,
      jsonInit("POST", { items: [{ menu_item_id: itemId, quantity: 1 }] }),
      env,
    );

    // Now update the menu item (simulating a price change)
    const db = createDb(env.DB);
    await db
      .update(schema.menuItems)
      .set({ name: "スープ改", price: 600 })
      .where(eq(schema.menuItems.id, itemId));

    // The order item should still have the original snapshot values
    const orderItems = await db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.menu_item_id, itemId));
    expect(orderItems[0].name_snapshot).toBe("スープ");
    expect(orderItems[0].unit_price_snapshot).toBe(400);
  });

  it("returns 404 when a menu_item_id does not exist in the store", async () => {
    const store = await seedStore("Items 404 Item");
    const seat = await seedSeat(store.id, "Seat 404");

    const res = await app.request(
      `/api/order/${seat.qr_token}/items`,
      jsonInit("POST", { items: [{ menu_item_id: newId(), quantity: 1 }] }),
      env,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 for another store's menu item (tenant isolation)", async () => {
    const storeA = await seedStore("Items ISO A");
    const storeB = await seedStore("Items ISO B");
    const seat = await seedSeat(storeA.id, "Seat ISO");
    // Item belongs to storeB, not storeA
    const itemIdB = await seedMenuItem(storeB.id, {
      name: "Store B Item",
      price: 500,
    });

    const res = await app.request(
      `/api/order/${seat.qr_token}/items`,
      jsonInit("POST", { items: [{ menu_item_id: itemIdB, quantity: 1 }] }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when a menu item is not available", async () => {
    const store = await seedStore("Items Unavailable");
    const seat = await seedSeat(store.id, "Seat UV");
    const itemId = await seedMenuItem(store.id, {
      name: "品切れ商品",
      price: 300,
      isAvailable: false,
    });

    const res = await app.request(
      `/api/order/${seat.qr_token}/items`,
      jsonInit("POST", { items: [{ menu_item_id: itemId, quantity: 1 }] }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CONFLICT");
  });

  it("returns 409 when the order is already payment_requested", async () => {
    const store = await seedStore("Items PayReq");
    const seat = await seedSeat(store.id, "Seat PR");
    const itemId = await seedMenuItem(store.id, { name: "Pizza", price: 1000 });

    const db = createDb(env.DB);
    await db.insert(schema.orders).values({
      id: newId(),
      store_id: store.id,
      seat_id: seat.id,
      status: "payment_requested",
    });

    const res = await app.request(
      `/api/order/${seat.qr_token}/items`,
      jsonInit("POST", { items: [{ menu_item_id: itemId, quantity: 1 }] }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CONFLICT");
  });

  it("returns 400 for missing items array", async () => {
    const store = await seedStore("Items Val 400");
    const seat = await seedSeat(store.id, "Seat V400");

    const res = await app.request(
      `/api/order/${seat.qr_token}/items`,
      jsonInit("POST", {}),
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for empty items array", async () => {
    const store = await seedStore("Items Val Empty");
    const seat = await seedSeat(store.id, "Seat VE");

    const res = await app.request(
      `/api/order/${seat.qr_token}/items`,
      jsonInit("POST", { items: [] }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for quantity less than 1", async () => {
    const store = await seedStore("Items Val Qty");
    const seat = await seedSeat(store.id, "Seat VQ");
    const itemId = await seedMenuItem(store.id, {
      name: "Qty Test",
      price: 100,
    });

    const res = await app.request(
      `/api/order/${seat.qr_token}/items`,
      jsonInit("POST", {
        items: [{ menu_item_id: itemId, quantity: 0 }],
      }),
      env,
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/order/:seatToken/request-payment
// ---------------------------------------------------------------------------

describe("PATCH /api/order/:seatToken/request-payment", () => {
  it("returns 404 for an invalid seatToken", async () => {
    const res = await app.request(
      `/api/order/${newId()}/request-payment`,
      { method: "PATCH" },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("transitions open order to payment_requested", async () => {
    const store = await seedStore("PayReq Open");
    const seat = await seedSeat(store.id, "Seat PR1");

    const db = createDb(env.DB);
    const orderId = newId();
    await db.insert(schema.orders).values({
      id: orderId,
      store_id: store.id,
      seat_id: seat.id,
      status: "open",
    });

    const res = await app.request(
      `/api/order/${seat.qr_token}/request-payment`,
      { method: "PATCH" },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { id: string; status: string };
    };
    expect(body.data.id).toBe(orderId);
    expect(body.data.status).toBe("payment_requested");

    // Verify the DB was updated
    const orders = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId));
    expect(orders[0].status).toBe("payment_requested");
  });

  it("is idempotent when order is already payment_requested", async () => {
    const store = await seedStore("PayReq Idem");
    const seat = await seedSeat(store.id, "Seat PR2");

    const db = createDb(env.DB);
    const orderId = newId();
    await db.insert(schema.orders).values({
      id: orderId,
      store_id: store.id,
      seat_id: seat.id,
      status: "payment_requested",
    });

    const res = await app.request(
      `/api/order/${seat.qr_token}/request-payment`,
      { method: "PATCH" },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { status: string };
    };
    expect(body.data.status).toBe("payment_requested");
  });

  it("returns 409 when there is no active order", async () => {
    const store = await seedStore("PayReq No Order");
    const seat = await seedSeat(store.id, "Seat PR3");

    const res = await app.request(
      `/api/order/${seat.qr_token}/request-payment`,
      { method: "PATCH" },
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CONFLICT");
  });

  it("returns 409 when all orders are paid (no active order)", async () => {
    const store = await seedStore("PayReq Paid");
    const seat = await seedSeat(store.id, "Seat PR4");

    const db = createDb(env.DB);
    await db.insert(schema.orders).values({
      id: newId(),
      store_id: store.id,
      seat_id: seat.id,
      status: "paid",
      closed_at: Date.now(),
    });

    const res = await app.request(
      `/api/order/${seat.qr_token}/request-payment`,
      { method: "PATCH" },
      env,
    );
    expect(res.status).toBe(409);
  });
});
