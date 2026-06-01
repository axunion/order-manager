/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, schema } from "../../db/client";
import { app } from "./index";

describe("POST /api/stores", () => {
  it("creates a store and returns 201 with data envelope", async () => {
    const res = await app.request(
      "/api/stores",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My Test Cafe" }),
      },
      env,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { id: string; name: string; slug: string };
    };
    expect(body.data.name).toBe("My Test Cafe");
    expect(body.data.id).toBeTruthy();
    expect(body.data.slug).toMatch(/^my-test-cafe-[a-z0-9]{5}$/);
  });

  it("sets the access_token cookie on success", async () => {
    const res = await app.request(
      "/api/stores",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Cookie Shop" }),
      },
      env,
    );

    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("access_token=");
    expect(setCookie?.toLowerCase()).toContain("httponly");
  });

  it("persists the store to D1", async () => {
    const storeName = `Persist Test ${crypto.randomUUID()}`;
    const res = await app.request(
      "/api/stores",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: storeName }),
      },
      env,
    );
    const body = (await res.json()) as { data: { id: string } };

    const db = createDb(env.DB);
    const rows = await db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.id, body.data.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe(storeName);
  });

  it("returns 400 when name is missing", async () => {
    const res = await app.request(
      "/api/stores",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when name is empty string", async () => {
    const res = await app.request(
      "/api/stores",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "   " }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when name exceeds 100 characters", async () => {
    const res = await app.request(
      "/api/stores",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "a".repeat(101) }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });
});
