/// <reference types="@cloudflare/vitest-pool-workers/types" />
/**
 * Auth rate limiting (roadmap Phase 2 item 6, production-deploy gate):
 * per-store hourly cap on Magic Link issuance, and the supersede-not-delete
 * prerequisite that makes the cap countable.
 */
import { env } from "cloudflare:workers";
import { createDb, schema } from "@order/db";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { app } from "../app";
import { jsonInit, seedStore, withAuth } from "../test-helpers";

const devEnv = { ...env, ENVIRONMENT: "development" };
const HOUR_MS = 60 * 60 * 1000;

/** Directly seeds `count` magic_link_tokens rows for a store, `ageMs` old. */
async function seedRecentTokens(storeId: string, count: number, ageMs: number) {
  const db = createDb(env.DB);
  const createdAt = Date.now() - ageMs;
  await db.insert(schema.magicLinkTokens).values(
    Array.from({ length: count }, (_, i) => ({
      id: crypto.randomUUID(),
      store_id: storeId,
      token: crypto.randomUUID(),
      purpose: "login" as const,
      expires_at: createdAt + 15 * 60 * 1000,
      created_at: createdAt + i, // stable ordering, all still "recent"
    })),
  );
}

describe("issueMagicLink token supersession (UPDATE, not DELETE)", () => {
  it("fails a superseded login token at verify exactly like a consumed one", async () => {
    const { id: storeId } = await seedStore(
      `Supersede Login Test ${crypto.randomUUID()}`,
    );
    const db = createDb(env.DB);
    const storeRows = await db
      .select({ email: schema.stores.email })
      .from(schema.stores)
      .where(eq(schema.stores.id, storeId));
    const email = storeRows[0]?.email;
    if (!email) throw new Error("seedStore did not set an email");

    const firstRes = await app.request(
      "/api/auth/login",
      jsonInit("POST", { email }),
      devEnv,
    );
    const firstBody = (await firstRes.json()) as {
      data: { verify_url?: string };
    };
    const firstToken = new URL(
      firstBody.data.verify_url ?? "",
    ).searchParams.get("token");
    if (!firstToken) throw new Error("verify_url missing a token");

    // Re-request supersedes the first token.
    await app.request("/api/auth/login", jsonInit("POST", { email }), devEnv);

    const firstVerifyRes = await app.request(
      `/api/auth/verify?token=${firstToken}`,
      {},
      env,
    );
    expect(firstVerifyRes.status).toBe(400);

    // The row still exists (UPDATE, not DELETE) and is marked used.
    const rows = await db
      .select({ used_at: schema.magicLinkTokens.used_at })
      .from(schema.magicLinkTokens)
      .where(eq(schema.magicLinkTokens.token, firstToken));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.used_at).not.toBeNull();
  });
});

describe("POST /api/auth/login rate limiting", () => {
  it("issues no token on the 6th request within an hour, yet still returns sent:true", async () => {
    const { id: storeId } = await seedStore(`Cap Test ${crypto.randomUUID()}`);
    const db = createDb(env.DB);
    const storeRows = await db
      .select({ email: schema.stores.email })
      .from(schema.stores)
      .where(eq(schema.stores.id, storeId));
    const email = storeRows[0]?.email;
    if (!email) throw new Error("seedStore did not set an email");

    await seedRecentTokens(storeId, 5, 5 * 60 * 1000); // 5 tokens, 5 min old

    const res = await app.request(
      "/api/auth/login",
      jsonInit("POST", { email }),
      devEnv,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { sent: true; verify_url?: string };
    };
    expect(body.data.sent).toBe(true);
    expect(body.data.verify_url).toBeUndefined();

    // No 6th row was inserted.
    const rows = await db
      .select({ id: schema.magicLinkTokens.id })
      .from(schema.magicLinkTokens)
      .where(eq(schema.magicLinkTokens.store_id, storeId));
    expect(rows).toHaveLength(5);
  });

  it("still issues a token at 4 recent requests (boundary below the cap)", async () => {
    const { id: storeId } = await seedStore(
      `Below Cap Test ${crypto.randomUUID()}`,
    );
    const db = createDb(env.DB);
    const storeRows = await db
      .select({ email: schema.stores.email })
      .from(schema.stores)
      .where(eq(schema.stores.id, storeId));
    const email = storeRows[0]?.email;
    if (!email) throw new Error("seedStore did not set an email");

    await seedRecentTokens(storeId, 4, 5 * 60 * 1000);

    const res = await app.request(
      "/api/auth/login",
      jsonInit("POST", { email }),
      devEnv,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { sent: true; verify_url?: string };
    };
    expect(body.data.verify_url).toBeTruthy();

    const rows = await db
      .select({ id: schema.magicLinkTokens.id })
      .from(schema.magicLinkTokens)
      .where(eq(schema.magicLinkTokens.store_id, storeId));
    expect(rows).toHaveLength(5);
  });

  it("caps only the affected store — a different store is unaffected", async () => {
    const capped = await seedStore(`Capped Store ${crypto.randomUUID()}`);
    const other = await seedStore(`Other Store ${crypto.randomUUID()}`);
    const db = createDb(env.DB);
    const [cappedRow, otherRow] = await Promise.all([
      db
        .select({ email: schema.stores.email })
        .from(schema.stores)
        .where(eq(schema.stores.id, capped.id)),
      db
        .select({ email: schema.stores.email })
        .from(schema.stores)
        .where(eq(schema.stores.id, other.id)),
    ]);
    const cappedEmail = cappedRow[0]?.email;
    const otherEmail = otherRow[0]?.email;
    if (!cappedEmail || !otherEmail) {
      throw new Error("seedStore did not set an email");
    }

    await seedRecentTokens(capped.id, 5, 5 * 60 * 1000);

    const cappedRes = await app.request(
      "/api/auth/login",
      jsonInit("POST", { email: cappedEmail }),
      devEnv,
    );
    const cappedBody = (await cappedRes.json()) as {
      data: { verify_url?: string };
    };
    expect(cappedBody.data.verify_url).toBeUndefined();

    const otherRes = await app.request(
      "/api/auth/login",
      jsonInit("POST", { email: otherEmail }),
      devEnv,
    );
    const otherBody = (await otherRes.json()) as {
      data: { verify_url?: string };
    };
    expect(otherBody.data.verify_url).toBeTruthy();
  });

  it("resets outside the rolling hour window", async () => {
    const { id: storeId } = await seedStore(
      `Cap Reset Test ${crypto.randomUUID()}`,
    );
    const db = createDb(env.DB);
    const storeRows = await db
      .select({ email: schema.stores.email })
      .from(schema.stores)
      .where(eq(schema.stores.id, storeId));
    const email = storeRows[0]?.email;
    if (!email) throw new Error("seedStore did not set an email");

    // 5 tokens, all older than the 1-hour window.
    await seedRecentTokens(storeId, 5, HOUR_MS + 5 * 60 * 1000);

    const res = await app.request(
      "/api/auth/login",
      jsonInit("POST", { email }),
      devEnv,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { sent: true; verify_url?: string };
    };
    expect(body.data.verify_url).toBeTruthy();

    const rows = await db
      .select({ id: schema.magicLinkTokens.id })
      .from(schema.magicLinkTokens)
      .where(eq(schema.magicLinkTokens.store_id, storeId));
    expect(rows).toHaveLength(6);
  });

  it("does not leak registration status via the response shape when rate-limited", async () => {
    // Anti-enumeration: a rate-limited existing store and an unregistered
    // email must be indistinguishable in production mode (no verify_url
    // either way, identical status/body shape).
    const { id: storeId } = await seedStore(
      `Anti Enum Test ${crypto.randomUUID()}`,
    );
    const db = createDb(env.DB);
    const storeRows = await db
      .select({ email: schema.stores.email })
      .from(schema.stores)
      .where(eq(schema.stores.id, storeId));
    const email = storeRows[0]?.email;
    if (!email) throw new Error("seedStore did not set an email");
    await seedRecentTokens(storeId, 5, 5 * 60 * 1000);

    const rateLimitedRes = await app.request(
      "/api/auth/login",
      jsonInit("POST", { email }),
      env, // production mode: no dev bypass
    );
    const unknownRes = await app.request(
      "/api/auth/login",
      jsonInit("POST", {
        email: `unknown-${crypto.randomUUID()}@test.internal`,
      }),
      env,
    );

    expect(rateLimitedRes.status).toBe(unknownRes.status);
    const rateLimitedBody = await rateLimitedRes.json();
    const unknownBody = await unknownRes.json();
    expect(rateLimitedBody).toEqual(unknownBody);
  });
});

describe("POST /api/stores/me/email-change rate limiting", () => {
  it("shares the same per-store cap as login", async () => {
    const { id: storeId, session_token: token } = await seedStore(
      `Email Change Cap Test ${crypto.randomUUID()}`,
    );
    await seedRecentTokens(storeId, 5, 5 * 60 * 1000);

    const res = await app.request(
      "/api/stores/me/email-change",
      withAuth(
        token,
        jsonInit("POST", {
          new_email: `new-${crypto.randomUUID()}@test.internal`,
        }),
      ),
      devEnv,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { sent: true; verify_url?: string };
    };
    expect(body.data.sent).toBe(true);
    expect(body.data.verify_url).toBeUndefined();

    // The store's email is unchanged — no token was ever issued to verify.
    const db = createDb(env.DB);
    const rows = await db
      .select({ email: schema.stores.email })
      .from(schema.stores)
      .where(eq(schema.stores.id, storeId));
    const emailChangeTokens = await db
      .select()
      .from(schema.magicLinkTokens)
      .where(
        and(
          eq(schema.magicLinkTokens.store_id, storeId),
          eq(schema.magicLinkTokens.purpose, "email_change"),
        ),
      );
    expect(emailChangeTokens).toHaveLength(0);
    expect(rows[0]?.email).toBeTruthy();
  });
});
