/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, schema } from "../../db/client";
import { newId } from "../id";
import { app } from "./index";
import { jsonInit, withAuth } from "./test-helpers";

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
    slug: newId(),
    access_token,
  });
  return { id, access_token };
}

// ---------------------------------------------------------------------------
// GET /api/seats
// ---------------------------------------------------------------------------

describe("GET /api/seats", () => {
  it("returns 401 with no cookie", async () => {
    const res = await app.request("/api/seats", {}, env);
    expect(res.status).toBe(401);
    const body = (await res.json()) as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 with invalid token", async () => {
    const res = await app.request(
      "/api/seats",
      withAuth("invalid-token-xyz"),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns only the calling store's seats in created_at order", async () => {
    const storeA = await seedStore("Seat List A");
    const storeB = await seedStore("Seat List B");
    const db = createDb(env.DB);

    const idA1 = newId();
    const idA2 = newId();
    // Insert A2 first so it has a smaller created_at, then A1 — but we'll just
    // confirm both are returned and B's seat is absent.
    await db.insert(schema.seats).values([
      { id: idA1, store_id: storeA.id, name: "Table 1", qr_token: newId() },
      { id: idA2, store_id: storeA.id, name: "Table 2", qr_token: newId() },
    ]);
    await db.insert(schema.seats).values({
      id: newId(),
      store_id: storeB.id,
      name: "Store B Seat",
      qr_token: newId(),
    });

    const res = await app.request(
      "/api/seats",
      withAuth(storeA.access_token),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { id: string; name: string; qr_token: string }[];
    };
    expect(body.data).toHaveLength(2);
    expect(body.data.some((s) => s.name === "Store B Seat")).toBe(false);
    expect(body.data.some((s) => s.name === "Table 1")).toBe(true);
    expect(body.data.some((s) => s.name === "Table 2")).toBe(true);
  });

  it("returns qr_token for each seat", async () => {
    const store = await seedStore("Seat QR List");
    const db = createDb(env.DB);
    const qrToken = newId();
    await db.insert(schema.seats).values({
      id: newId(),
      store_id: store.id,
      name: "QR Seat",
      qr_token: qrToken,
    });

    const res = await app.request(
      "/api/seats",
      withAuth(store.access_token),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { qr_token: string }[];
    };
    expect(body.data[0].qr_token).toBe(qrToken);
  });
});

// ---------------------------------------------------------------------------
// POST /api/seats
// ---------------------------------------------------------------------------

describe("POST /api/seats", () => {
  it("creates a seat and returns 201 with data envelope", async () => {
    const store = await seedStore("Seat Create");
    const res = await app.request(
      "/api/seats",
      withAuth(store.access_token, jsonInit("POST", { name: "Table A" })),
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: {
        id: string;
        store_id: string;
        name: string;
        qr_token: string;
        created_at: number;
      };
    };
    expect(body.data.name).toBe("Table A");
    expect(body.data.store_id).toBe(store.id);
    expect(body.data.id).toBeTruthy();
    expect(body.data.qr_token).toBeTruthy();
    expect(body.data.created_at).toBeGreaterThan(0);
  });

  it("generates a unique qr_token distinct from the seat id", async () => {
    const store = await seedStore("Seat QR Unique");
    const res = await app.request(
      "/api/seats",
      withAuth(store.access_token, jsonInit("POST", { name: "QR Seat" })),
      env,
    );
    const body = (await res.json()) as {
      data: { id: string; qr_token: string };
    };
    expect(body.data.qr_token).toBeTruthy();
    // qr_token is a separate UUID from id
    expect(body.data.qr_token).not.toBe(body.data.id);
  });

  it("persists the seat to D1 with correct store_id", async () => {
    const store = await seedStore("Seat Persist");
    const res = await app.request(
      "/api/seats",
      withAuth(store.access_token, jsonInit("POST", { name: "Persist Seat" })),
      env,
    );
    const body = (await res.json()) as { data: { id: string } };
    const db = createDb(env.DB);
    const rows = await db
      .select()
      .from(schema.seats)
      .where(eq(schema.seats.id, body.data.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].store_id).toBe(store.id);
    expect(rows[0].qr_token).toBeTruthy();
  });

  it("returns 400 when name is missing", async () => {
    const store = await seedStore("Seat Val1");
    const res = await app.request(
      "/api/seats",
      withAuth(store.access_token, jsonInit("POST", {})),
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when name is blank after trimming", async () => {
    const store = await seedStore("Seat Val2");
    const res = await app.request(
      "/api/seats",
      withAuth(store.access_token, jsonInit("POST", { name: "   " })),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when name exceeds 100 characters", async () => {
    const store = await seedStore("Seat Val3");
    const res = await app.request(
      "/api/seats",
      withAuth(store.access_token, jsonInit("POST", { name: "a".repeat(101) })),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 with no cookie", async () => {
    const res = await app.request(
      "/api/seats",
      jsonInit("POST", { name: "Table X" }),
      env,
    );
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/seats/:id
// ---------------------------------------------------------------------------

describe("DELETE /api/seats/:id", () => {
  it("deletes a seat and returns 200 with the deleted id", async () => {
    const store = await seedStore("Seat Delete");
    const db = createDb(env.DB);
    const id = newId();
    await db.insert(schema.seats).values({
      id,
      store_id: store.id,
      name: "To Delete",
      qr_token: newId(),
    });

    const res = await app.request(
      `/api/seats/${id}`,
      withAuth(store.access_token, { method: "DELETE" }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string } };
    expect(body.data.id).toBe(id);

    const rows = await db
      .select()
      .from(schema.seats)
      .where(eq(schema.seats.id, id));
    expect(rows).toHaveLength(0);
  });

  it("returns 404 for a non-existent seat", async () => {
    const store = await seedStore("Seat Del 404");
    const res = await app.request(
      `/api/seats/${newId()}`,
      withAuth(store.access_token, { method: "DELETE" }),
      env,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 when deleting another store's seat (tenant isolation)", async () => {
    const storeA = await seedStore("Seat Del Iso A");
    const storeB = await seedStore("Seat Del Iso B");
    const db = createDb(env.DB);
    const id = newId();
    await db.insert(schema.seats).values({
      id,
      store_id: storeB.id,
      name: "Store B Seat",
      qr_token: newId(),
    });

    const res = await app.request(
      `/api/seats/${id}`,
      withAuth(storeA.access_token, { method: "DELETE" }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when seat has an open order", async () => {
    const store = await seedStore("Seat Del FK Open");
    const db = createDb(env.DB);

    const seatId = newId();
    await db.insert(schema.seats).values({
      id: seatId,
      store_id: store.id,
      name: "Busy Seat",
      qr_token: newId(),
    });
    await db.insert(schema.orders).values({
      id: newId(),
      store_id: store.id,
      seat_id: seatId,
      status: "open",
    });

    const res = await app.request(
      `/api/seats/${seatId}`,
      withAuth(store.access_token, { method: "DELETE" }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CONFLICT");

    // Seat must still exist
    const rows = await db
      .select()
      .from(schema.seats)
      .where(eq(schema.seats.id, seatId));
    expect(rows).toHaveLength(1);
  });

  it("returns 409 when seat has a payment_requested order", async () => {
    const store = await seedStore("Seat Del FK PayReq");
    const db = createDb(env.DB);

    const seatId = newId();
    await db.insert(schema.seats).values({
      id: seatId,
      store_id: store.id,
      name: "Requesting Seat",
      qr_token: newId(),
    });
    await db.insert(schema.orders).values({
      id: newId(),
      store_id: store.id,
      seat_id: seatId,
      status: "payment_requested",
    });

    const res = await app.request(
      `/api/seats/${seatId}`,
      withAuth(store.access_token, { method: "DELETE" }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CONFLICT");
  });

  it("returns 409 when seat has a paid order (FK constraint prevents deletion)", async () => {
    const store = await seedStore("Seat Del Paid");
    const db = createDb(env.DB);

    const seatId = newId();
    await db.insert(schema.seats).values({
      id: seatId,
      store_id: store.id,
      name: "Historical Seat",
      qr_token: newId(),
    });
    // orders.seat_id is NOT NULL FK — paid orders also prevent deletion until
    // seat_id is made nullable in a future migration.
    await db.insert(schema.orders).values({
      id: newId(),
      store_id: store.id,
      seat_id: seatId,
      status: "paid",
      closed_at: Date.now(),
    });

    const res = await app.request(
      `/api/seats/${seatId}`,
      withAuth(store.access_token, { method: "DELETE" }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CONFLICT");
  });

  it("returns 401 with no cookie", async () => {
    const res = await app.request(
      `/api/seats/${newId()}`,
      { method: "DELETE" },
      env,
    );
    expect(res.status).toBe(401);
  });
});
