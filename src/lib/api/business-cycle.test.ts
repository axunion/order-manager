/// <reference types="@cloudflare/vitest-pool-workers/types" />
/**
 * Business cycle integration tests (Step 8)
 *
 * These tests drive the full workflow exclusively via HTTP API calls — no direct
 * DB seeding — to verify that all steps are connected end-to-end:
 *
 *   Store registration → Magic Link verification → Menu setup →
 *   Seat/QR issuance → Customer orders → Admin polling → Serve items →
 *   Payment request → Checkout → Post-payment state
 *
 * Also verifies multi-tenant data isolation between two stores running
 * the same cycle concurrently.
 */
import { env } from "cloudflare:workers";
import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, schema } from "../../db/client";
import { app } from "./index";
import { extractSessionToken, jsonInit, withAuth } from "./test-helpers";

// ---------------------------------------------------------------------------
// Shared setup helper
// ---------------------------------------------------------------------------

/**
 * Registers a store via HTTP, then follows the Magic Link verification flow
 * to obtain an active session_token.
 *
 * The magic link token is read directly from D1 because in tests the
 * RESEND_API_KEY is absent and email delivery falls back to console.log only.
 */
async function registerAndVerify(
  storeName: string,
  email: string,
): Promise<string> {
  const storeRes = await app.request(
    "/api/stores",
    jsonInit("POST", { name: storeName, email }),
    env,
  );
  if (storeRes.status !== 201)
    throw new Error(`Store registration failed: ${storeRes.status}`);

  // The store body is consumed above; read the store id from D1
  const body = (await storeRes.json()) as { data: { id: string } };
  const storeId = body.data.id;

  // Retrieve the signup magic link token from D1
  const db = createDb(env.DB);
  const tokenRow = await db
    .select()
    .from(schema.magicLinkTokens)
    .where(
      and(
        eq(schema.magicLinkTokens.store_id, storeId),
        eq(schema.magicLinkTokens.purpose, "signup"),
        isNull(schema.magicLinkTokens.used_at),
      ),
    )
    .then((rows) => rows[0]);

  if (!tokenRow) throw new Error("Signup magic_link_token not found");

  // Verify the token to activate the store and create a session
  const verifyRes = await app.request(
    `/api/auth/verify?token=${tokenRow.token}`,
    {},
    env,
  );
  if (verifyRes.status !== 302)
    throw new Error(`Verify failed: ${verifyRes.status}`);

  return extractSessionToken(verifyRes);
}

// ---------------------------------------------------------------------------
// Scenario 1: Full business cycle — happy path
// ---------------------------------------------------------------------------

describe("Business cycle: full happy path (申込み → 会計完了)", () => {
  it("completes a full order-to-payment cycle end-to-end", async () => {
    // ── Step 1: Store registration + Magic Link verification ────────────────
    const token = await registerAndVerify(
      "結合テスト食堂",
      `cycle-${crypto.randomUUID()}@test.internal`,
    );
    expect(token).toBeTruthy();

    // ── Step 2: Create a menu category ─────────────────────────────────────
    const catRes = await app.request(
      "/api/menu/categories",
      withAuth(token, jsonInit("POST", { name: "フード" })),
      env,
    );
    expect(catRes.status).toBe(201);
    const catBody = (await catRes.json()) as { data: { id: string } };
    const categoryId = catBody.data.id;

    // ── Step 3: Create 2 menu items ─────────────────────────────────────────
    // 唐揚げ: 500円 × 2 = 1000円
    // ビール:  600円 × 1 =  600円
    // Expected total: 1600円
    const item1Res = await app.request(
      "/api/menu/items",
      withAuth(
        token,
        jsonInit("POST", {
          name: "唐揚げ",
          price: 500,
          category_id: categoryId,
        }),
      ),
      env,
    );
    expect(item1Res.status).toBe(201);
    const item1Body = (await item1Res.json()) as { data: { id: string } };
    const menuItemId1 = item1Body.data.id;

    const item2Res = await app.request(
      "/api/menu/items",
      withAuth(token, jsonInit("POST", { name: "ビール", price: 600 })),
      env,
    );
    expect(item2Res.status).toBe(201);
    const item2Body = (await item2Res.json()) as { data: { id: string } };
    const menuItemId2 = item2Body.data.id;

    // ── Step 4: Create a seat (QR issuance) ─────────────────────────────────
    const seatRes = await app.request(
      "/api/seats",
      withAuth(token, jsonInit("POST", { name: "テーブル1" })),
      env,
    );
    expect(seatRes.status).toBe(201);
    const seatBody = (await seatRes.json()) as {
      data: { qr_token: string };
    };
    const qrToken = seatBody.data.qr_token;
    expect(qrToken).toBeTruthy();

    // ── Step 5: Customer views the menu via QR token ─────────────────────────
    const bootstrapRes = await app.request(`/api/order/${qrToken}`, {}, env);
    expect(bootstrapRes.status).toBe(200);
    const bootstrapBody = (await bootstrapRes.json()) as {
      data: {
        seat: { name: string };
        menu: {
          categories: { name: string }[];
          items: { id: string; name: string; price: number }[];
        };
        order: null;
      };
    };
    expect(bootstrapBody.data.seat.name).toBe("テーブル1");
    const menuItemNames = bootstrapBody.data.menu.items.map((i) => i.name);
    expect(menuItemNames).toContain("唐揚げ");
    expect(menuItemNames).toContain("ビール");
    expect(bootstrapBody.data.menu.categories[0].name).toBe("フード");
    expect(bootstrapBody.data.order).toBeNull();

    // ── Step 6: Customer places an order ────────────────────────────────────
    const orderRes = await app.request(
      `/api/order/${qrToken}/items`,
      jsonInit("POST", {
        items: [
          { menu_item_id: menuItemId1, quantity: 2 },
          { menu_item_id: menuItemId2, quantity: 1 },
        ],
      }),
      env,
    );
    expect(orderRes.status).toBe(201);
    const orderBody = (await orderRes.json()) as {
      data: {
        order: {
          id: string;
          status: string;
          items: {
            id: string;
            name_snapshot: string;
            quantity: number;
            status: string;
          }[];
          total: number;
        };
      };
    };
    expect(orderBody.data.order.status).toBe("open");
    expect(orderBody.data.order.items).toHaveLength(2);
    expect(orderBody.data.order.total).toBe(1600);
    const orderId = orderBody.data.order.id;

    // ── Step 7: Admin polls for new orders ──────────────────────────────────
    const adminOrdersRes = await app.request(
      "/api/admin/orders",
      withAuth(token),
      env,
    );
    expect(adminOrdersRes.status).toBe(200);
    const adminOrdersBody = (await adminOrdersRes.json()) as {
      data: {
        id: string;
        seat_name: string;
        status: string;
        items: {
          id: string;
          name_snapshot: string;
          quantity: number;
          status: string;
        }[];
        total: number;
        created_at: number;
      }[];
    };
    const adminOrder = adminOrdersBody.data.find((o) => o.id === orderId);
    expect(adminOrder).toBeDefined();
    expect(adminOrder?.seat_name).toBe("テーブル1");
    expect(adminOrder?.status).toBe("open");
    expect(adminOrder?.total).toBe(1600);
    expect(adminOrder?.items).toHaveLength(2);
    for (const item of adminOrder?.items ?? []) {
      expect(item.status).toBe("ordered");
    }

    // ── Step 7b: Verify ?since= polling filter ────────────────────────────
    const orderCreatedAt = adminOrder?.created_at ?? 0;
    const sinceBeforeRes = await app.request(
      `/api/admin/orders?since=${orderCreatedAt - 1}`,
      withAuth(token),
      env,
    );
    expect(sinceBeforeRes.status).toBe(200);
    const sinceBeforeBody = (await sinceBeforeRes.json()) as {
      data: { id: string }[];
    };
    expect(sinceBeforeBody.data.map((o) => o.id)).toContain(orderId);

    const sinceEqualRes = await app.request(
      `/api/admin/orders?since=${orderCreatedAt}`,
      withAuth(token),
      env,
    );
    expect(sinceEqualRes.status).toBe(200);
    const sinceEqualBody = (await sinceEqualRes.json()) as {
      data: { id: string }[];
    };
    expect(sinceEqualBody.data.map((o) => o.id)).not.toContain(orderId);

    // ── Step 8: Admin marks each item as served ──────────────────────────────
    const adminItemIds = (adminOrder?.items ?? []).map((i) => i.id);
    for (const itemId of adminItemIds) {
      const serveRes = await app.request(
        `/api/admin/orders/items/${itemId}/serve`,
        withAuth(token, { method: "PATCH" }),
        env,
      );
      expect(serveRes.status).toBe(200);
      const serveBody = (await serveRes.json()) as { data: { status: string } };
      expect(serveBody.data.status).toBe("served");
    }

    // ── Step 9: Customer requests payment ────────────────────────────────────
    const payReqRes = await app.request(
      `/api/order/${qrToken}/request-payment`,
      { method: "PATCH" },
      env,
    );
    expect(payReqRes.status).toBe(200);
    const payReqBody = (await payReqRes.json()) as {
      data: { id: string; status: string };
    };
    expect(payReqBody.data.id).toBe(orderId);
    expect(payReqBody.data.status).toBe("payment_requested");

    // ── Step 10: Admin views the checkout queue ──────────────────────────────
    const pendingRes = await app.request(
      "/api/payments/pending",
      withAuth(token),
      env,
    );
    expect(pendingRes.status).toBe(200);
    const pendingBody = (await pendingRes.json()) as {
      data: { id: string; seat_name: string; status: string; total: number }[];
    };
    const pendingOrder = pendingBody.data.find((o) => o.id === orderId);
    expect(pendingOrder).toBeDefined();
    expect(pendingOrder?.seat_name).toBe("テーブル1");
    expect(pendingOrder?.status).toBe("payment_requested");
    expect(pendingOrder?.total).toBe(1600);

    // ── Step 11: Admin completes the payment ─────────────────────────────────
    const payRes = await app.request(
      "/api/payments",
      withAuth(token, jsonInit("POST", { order_id: orderId })),
      env,
    );
    expect(payRes.status).toBe(201);
    const payBody = (await payRes.json()) as {
      data: {
        id: string;
        order_id: string;
        total_amount: number;
        method: string;
        paid_at: number;
      };
    };
    expect(payBody.data.order_id).toBe(orderId);
    expect(payBody.data.total_amount).toBe(1600);
    expect(payBody.data.method).toBe("cash");
    expect(typeof payBody.data.paid_at).toBe("number");

    // ── Step 12: Post-payment state verification ──────────────────────────────
    const adminOrdersAfterRes = await app.request(
      "/api/admin/orders",
      withAuth(token),
      env,
    );
    expect(adminOrdersAfterRes.status).toBe(200);
    const adminOrdersAfterBody = (await adminOrdersAfterRes.json()) as {
      data: { id: string }[];
    };
    expect(
      adminOrdersAfterBody.data.find((o) => o.id === orderId),
    ).toBeUndefined();

    const bootstrapAfterRes = await app.request(
      `/api/order/${qrToken}`,
      {},
      env,
    );
    expect(bootstrapAfterRes.status).toBe(200);
    const bootstrapAfterBody = (await bootstrapAfterRes.json()) as {
      data: { order: null };
    };
    expect(bootstrapAfterBody.data.order).toBeNull();

    // ── Step 13: New order on the same seat after payment ────────────────────
    const reorderRes = await app.request(
      `/api/order/${qrToken}/items`,
      jsonInit("POST", { items: [{ menu_item_id: menuItemId1, quantity: 1 }] }),
      env,
    );
    expect(reorderRes.status).toBe(201);
    const reorderBody = (await reorderRes.json()) as {
      data: { order: { id: string; status: string } };
    };
    expect(reorderBody.data.order.id).not.toBe(orderId);
    expect(reorderBody.data.order.status).toBe("open");
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Multi-tenant isolation — two stores running concurrently
// ---------------------------------------------------------------------------

/**
 * Registers a store via HTTP (with Magic Link verification), then sets up
 * a menu item, a seat, and a payment_requested order using only HTTP API calls.
 */
async function setupStoreWithOrder(storeName: string): Promise<{
  token: string;
  menuItemId: string;
  qrToken: string;
  orderId: string;
  orderItemId: string;
}> {
  const email = `store-${crypto.randomUUID()}@test.internal`;
  const token = await registerAndVerify(storeName, email);

  const itemRes = await app.request(
    "/api/menu/items",
    withAuth(token, jsonInit("POST", { name: `${storeName}商品`, price: 300 })),
    env,
  );
  if (itemRes.status !== 201)
    throw new Error(`Menu item creation failed: ${itemRes.status}`);
  const itemBody = (await itemRes.json()) as { data: { id: string } };
  const menuItemId = itemBody.data.id;

  const seatRes = await app.request(
    "/api/seats",
    withAuth(token, jsonInit("POST", { name: "テーブル1" })),
    env,
  );
  if (seatRes.status !== 201)
    throw new Error(`Seat creation failed: ${seatRes.status}`);
  const seatBody = (await seatRes.json()) as { data: { qr_token: string } };
  const qrToken = seatBody.data.qr_token;

  const orderRes = await app.request(
    `/api/order/${qrToken}/items`,
    jsonInit("POST", { items: [{ menu_item_id: menuItemId, quantity: 1 }] }),
    env,
  );
  if (orderRes.status !== 201)
    throw new Error(`Order placement failed: ${orderRes.status}`);
  const orderBody = (await orderRes.json()) as {
    data: { order: { id: string; items: { id: string }[] } };
  };
  const orderId = orderBody.data.order.id;
  const firstItem = orderBody.data.order.items[0];
  if (!firstItem)
    throw new Error("Order response contained no items — unexpected API state");
  const orderItemId = firstItem.id;

  const payReqRes = await app.request(
    `/api/order/${qrToken}/request-payment`,
    { method: "PATCH" },
    env,
  );
  if (payReqRes.status !== 200)
    throw new Error(`Payment request failed: ${payReqRes.status}`);

  return { token, menuItemId, qrToken, orderId, orderItemId };
}

describe("Business cycle: multi-tenant isolation (2店舗データ分離)", () => {
  it("does not expose store B's data to store A and vice versa", async () => {
    const [storeA, storeB] = await Promise.all([
      setupStoreWithOrder("テナント分離テストA"),
      setupStoreWithOrder("テナント分離テストB"),
    ]);

    // ── Admin order board isolation ──────────────────────────────────────────
    const adminARes = await app.request(
      "/api/admin/orders",
      withAuth(storeA.token),
      env,
    );
    expect(adminARes.status).toBe(200);
    const adminABody = (await adminARes.json()) as { data: { id: string }[] };
    const adminAIds = adminABody.data.map((o) => o.id);
    expect(adminAIds).toContain(storeA.orderId);
    expect(adminAIds).not.toContain(storeB.orderId);

    const adminBRes = await app.request(
      "/api/admin/orders",
      withAuth(storeB.token),
      env,
    );
    expect(adminBRes.status).toBe(200);
    const adminBBody = (await adminBRes.json()) as { data: { id: string }[] };
    const adminBIds = adminBBody.data.map((o) => o.id);
    expect(adminBIds).toContain(storeB.orderId);
    expect(adminBIds).not.toContain(storeA.orderId);

    // ── Payment pending isolation ─────────────────────────────────────────────
    const pendingARes = await app.request(
      "/api/payments/pending",
      withAuth(storeA.token),
      env,
    );
    expect(pendingARes.status).toBe(200);
    const pendingABody = (await pendingARes.json()) as {
      data: { id: string }[];
    };
    expect(pendingABody.data.map((o) => o.id)).not.toContain(storeB.orderId);

    const pendingBRes = await app.request(
      "/api/payments/pending",
      withAuth(storeB.token),
      env,
    );
    expect(pendingBRes.status).toBe(200);
    const pendingBBody = (await pendingBRes.json()) as {
      data: { id: string }[];
    };
    expect(pendingBBody.data.map((o) => o.id)).not.toContain(storeA.orderId);

    // ── Cross-tenant payment attempt → 404 ───────────────────────────────────
    const crossPayRes = await app.request(
      "/api/payments",
      withAuth(storeA.token, jsonInit("POST", { order_id: storeB.orderId })),
      env,
    );
    expect(crossPayRes.status).toBe(404);
    const crossPayBody = (await crossPayRes.json()) as {
      error: { code: string };
    };
    expect(crossPayBody.error.code).toBe("NOT_FOUND");

    // ── Cross-tenant serve attempt → 404 ─────────────────────────────────────
    const crossServeRes = await app.request(
      `/api/admin/orders/items/${storeB.orderItemId}/serve`,
      withAuth(storeA.token, { method: "PATCH" }),
      env,
    );
    expect(crossServeRes.status).toBe(404);

    // ── Customer order screen isolation ──────────────────────────────────────
    const bootstrapARes = await app.request(
      `/api/order/${storeA.qrToken}`,
      {},
      env,
    );
    expect(bootstrapARes.status).toBe(200);
    const bootstrapABody = (await bootstrapARes.json()) as {
      data: { menu: { items: { id: string }[] } };
    };
    const aMenuIds = bootstrapABody.data.menu.items.map((i) => i.id);
    expect(aMenuIds).toContain(storeA.menuItemId);
    expect(aMenuIds).not.toContain(storeB.menuItemId);

    const bootstrapBRes = await app.request(
      `/api/order/${storeB.qrToken}`,
      {},
      env,
    );
    expect(bootstrapBRes.status).toBe(200);
    const bootstrapBBody = (await bootstrapBRes.json()) as {
      data: { menu: { items: { id: string }[] } };
    };
    const bMenuIds = bootstrapBBody.data.menu.items.map((i) => i.id);
    expect(bMenuIds).toContain(storeB.menuItemId);
    expect(bMenuIds).not.toContain(storeA.menuItemId);
  });
});
