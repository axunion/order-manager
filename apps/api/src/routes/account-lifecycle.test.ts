/// <reference types="@cloudflare/vitest-pool-workers/types" />
/**
 * Account lifecycle (roadmap Phase 5 item 2): owner self-service
 * suspend/reactivate. Delete + export land in a later slice.
 */
import { env } from "cloudflare:workers";
import { createDb, schema } from "@order/db";
import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { app } from "../app";
import { jsonInit, seedStore, withAuth } from "../test-helpers";

const devEnv = { ...env, ENVIRONMENT: "development" };

/** Directly seeds `count` magic_link_tokens rows for a member, `ageMs` old. */
async function seedRecentTokens(
  storeId: string,
  memberId: string,
  count: number,
  ageMs: number,
) {
  const db = createDb(env.DB);
  const createdAt = Date.now() - ageMs;
  await db.insert(schema.magicLinkTokens).values(
    Array.from({ length: count }, (_, i) => ({
      id: crypto.randomUUID(),
      store_id: storeId,
      member_id: memberId,
      token: crypto.randomUUID(),
      purpose: "login" as const,
      expires_at: createdAt + 15 * 60 * 1000,
      created_at: createdAt + i,
    })),
  );
}

describe("POST /api/stores/me/suspend", () => {
  it("returns 401 without a session", async () => {
    const res = await app.request(
      "/api/stores/me/suspend",
      { method: "POST" },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for a staff-role session", async () => {
    const { session_token: token } = await seedStore(
      `Suspend Forbidden Test ${crypto.randomUUID()}`,
      "staff",
    );
    const res = await app.request(
      "/api/stores/me/suspend",
      { method: "POST", ...withAuth(token) },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("sets stores.status to suspended", async () => {
    const { id: storeId, session_token: token } = await seedStore(
      `Suspend OK Test ${crypto.randomUUID()}`,
    );
    const res = await app.request(
      "/api/stores/me/suspend",
      { method: "POST", ...withAuth(token) },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { status: string } };
    expect(body.data.status).toBe("suspended");

    const db = createDb(env.DB);
    const storeRows = await db
      .select({ status: schema.stores.status })
      .from(schema.stores)
      .where(eq(schema.stores.id, storeId));
    expect(storeRows[0]?.status).toBe("suspended");
  });

  it("locks out the same session on the next request", async () => {
    const { session_token: token } = await seedStore(
      `Suspend Lockout Test ${crypto.randomUUID()}`,
    );
    await app.request(
      "/api/stores/me/suspend",
      { method: "POST", ...withAuth(token) },
      env,
    );

    const res = await app.request("/api/auth/me", withAuth(token), env);
    expect(res.status).toBe(401);
  });

  it("only suspends the caller's own store, leaving other stores active", async () => {
    const storeA = await seedStore(
      `Suspend Isolation A ${crypto.randomUUID()}`,
    );
    const storeB = await seedStore(
      `Suspend Isolation B ${crypto.randomUUID()}`,
    );

    await app.request(
      "/api/stores/me/suspend",
      { method: "POST", ...withAuth(storeA.session_token) },
      env,
    );

    const db = createDb(env.DB);
    const storeBRows = await db
      .select({ status: schema.stores.status })
      .from(schema.stores)
      .where(eq(schema.stores.id, storeB.id));
    expect(storeBRows[0]?.status).toBe("active");

    // Store B's session still authenticates.
    const res = await app.request(
      "/api/auth/me",
      withAuth(storeB.session_token),
      env,
    );
    expect(res.status).toBe(200);
  });

  it("deletes every session for the store, not just the caller's own", async () => {
    const { id: storeId, session_token: ownerToken } = await seedStore(
      `Suspend Session Wipe Test ${crypto.randomUUID()}`,
    );
    const db = createDb(env.DB);

    const staffMemberId = crypto.randomUUID();
    await db.insert(schema.members).values({
      id: staffMemberId,
      store_id: storeId,
      email: `staff-${crypto.randomUUID()}@test.internal`,
      role: "staff",
      status: "active",
      activated_at: Date.now(),
    });
    const staffSessionToken = crypto.randomUUID();
    await db.insert(schema.sessions).values({
      id: crypto.randomUUID(),
      store_id: storeId,
      member_id: staffMemberId,
      session_token: staffSessionToken,
      expires_at: Date.now() + 60_000,
    });

    await app.request(
      "/api/stores/me/suspend",
      { method: "POST", ...withAuth(ownerToken) },
      env,
    );

    const remaining = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.store_id, storeId));
    expect(remaining).toHaveLength(0);

    const staffRes = await app.request(
      "/api/auth/me",
      withAuth(staffSessionToken),
      env,
    );
    expect(staffRes.status).toBe(401);
  });
});

describe("POST /api/auth/login on a suspended store", () => {
  it("issues a reactivate-purpose token for an owner-role member", async () => {
    const {
      id: storeId,
      member_id: ownerMemberId,
      session_token: ownerToken,
    } = await seedStore(`Reactivate Login Test ${crypto.randomUUID()}`);
    const db = createDb(env.DB);
    const ownerEmailRows = await db
      .select({ email: schema.members.email })
      .from(schema.members)
      .where(eq(schema.members.id, ownerMemberId));
    const ownerEmail = ownerEmailRows[0]?.email;
    if (!ownerEmail) throw new Error("seedStore did not set a member email");

    await app.request(
      "/api/stores/me/suspend",
      { method: "POST", ...withAuth(ownerToken) },
      env,
    );

    const res = await app.request(
      "/api/auth/login",
      jsonInit("POST", { email: ownerEmail }),
      devEnv,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { verify_url?: string } };
    expect(body.data.verify_url).toBeTruthy();

    const tokens = await db
      .select({ purpose: schema.magicLinkTokens.purpose })
      .from(schema.magicLinkTokens)
      .where(
        and(
          eq(schema.magicLinkTokens.store_id, storeId),
          eq(schema.magicLinkTokens.member_id, ownerMemberId),
          isNull(schema.magicLinkTokens.used_at),
        ),
      );
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.purpose).toBe("reactivate");
  });

  it("stays silent for a staff-role member on a suspended store", async () => {
    const { id: storeId, session_token: ownerToken } = await seedStore(
      `Reactivate Staff Silent Test ${crypto.randomUUID()}`,
    );
    const db = createDb(env.DB);

    const staffMemberId = crypto.randomUUID();
    const staffEmail = `staff-${crypto.randomUUID()}@test.internal`;
    await db.insert(schema.members).values({
      id: staffMemberId,
      store_id: storeId,
      email: staffEmail,
      role: "staff",
      status: "active",
      activated_at: Date.now(),
    });

    await app.request(
      "/api/stores/me/suspend",
      { method: "POST", ...withAuth(ownerToken) },
      env,
    );

    const res = await app.request(
      "/api/auth/login",
      jsonInit("POST", { email: staffEmail }),
      devEnv,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { verify_url?: string } };
    expect(body.data.verify_url).toBeUndefined();

    const tokens = await db
      .select()
      .from(schema.magicLinkTokens)
      .where(eq(schema.magicLinkTokens.member_id, staffMemberId));
    expect(tokens).toHaveLength(0);
  });

  it("resends invite (not reactivate) for a still-pending owner-role invite", async () => {
    // A second owner who was invited but hasn't verified yet must keep
    // completing their own onboarding, not accidentally reactivate the
    // store — reactivate only applies to an already-active owner.
    const { id: storeId, session_token: ownerToken } = await seedStore(
      `Reactivate Pending Owner Test ${crypto.randomUUID()}`,
    );
    const db = createDb(env.DB);

    const pendingOwnerId = crypto.randomUUID();
    const pendingOwnerEmail = `pending-owner-${crypto.randomUUID()}@test.internal`;
    await db.insert(schema.members).values({
      id: pendingOwnerId,
      store_id: storeId,
      email: pendingOwnerEmail,
      role: "owner",
      status: "pending",
    });

    await app.request(
      "/api/stores/me/suspend",
      { method: "POST", ...withAuth(ownerToken) },
      env,
    );

    const res = await app.request(
      "/api/auth/login",
      jsonInit("POST", { email: pendingOwnerEmail }),
      devEnv,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { verify_url?: string } };
    expect(body.data.verify_url).toBeTruthy();

    const tokens = await db
      .select({ purpose: schema.magicLinkTokens.purpose })
      .from(schema.magicLinkTokens)
      .where(
        and(
          eq(schema.magicLinkTokens.member_id, pendingOwnerId),
          isNull(schema.magicLinkTokens.used_at),
        ),
      );
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.purpose).toBe("signup");
  });

  it("shares the per-member hourly cap with other purposes", async () => {
    const {
      id: storeId,
      member_id: ownerMemberId,
      session_token: ownerToken,
    } = await seedStore(`Reactivate Cap Test ${crypto.randomUUID()}`);
    const db = createDb(env.DB);
    const ownerEmailRows = await db
      .select({ email: schema.members.email })
      .from(schema.members)
      .where(eq(schema.members.id, ownerMemberId));
    const ownerEmail = ownerEmailRows[0]?.email;
    if (!ownerEmail) throw new Error("seedStore did not set a member email");

    await seedRecentTokens(storeId, ownerMemberId, 5, 5 * 60 * 1000);

    // Suspend after seeding the cap-triggering tokens (the sessions those
    // tokens belong to aren't involved — seedRecentTokens only inserts
    // magic_link_tokens rows, not sessions).
    await app.request(
      "/api/stores/me/suspend",
      { method: "POST", ...withAuth(ownerToken) },
      env,
    );

    const res = await app.request(
      "/api/auth/login",
      jsonInit("POST", { email: ownerEmail }),
      devEnv,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { verify_url?: string } };
    expect(body.data.verify_url).toBeUndefined();

    const reactivateTokens = await db
      .select({ id: schema.magicLinkTokens.id })
      .from(schema.magicLinkTokens)
      .where(
        and(
          eq(schema.magicLinkTokens.member_id, ownerMemberId),
          eq(schema.magicLinkTokens.purpose, "reactivate"),
        ),
      );
    expect(reactivateTokens).toHaveLength(0);
  });
});

describe("GET /api/auth/verify with a reactivate token", () => {
  it("reactivates the store and creates a working session", async () => {
    const {
      id: storeId,
      member_id: ownerMemberId,
      session_token: ownerToken,
    } = await seedStore(`Reactivate Verify Test ${crypto.randomUUID()}`);
    const db = createDb(env.DB);
    const ownerEmailRows = await db
      .select({ email: schema.members.email })
      .from(schema.members)
      .where(eq(schema.members.id, ownerMemberId));
    const ownerEmail = ownerEmailRows[0]?.email;
    if (!ownerEmail) throw new Error("seedStore did not set a member email");

    await app.request(
      "/api/stores/me/suspend",
      { method: "POST", ...withAuth(ownerToken) },
      env,
    );

    const loginRes = await app.request(
      "/api/auth/login",
      jsonInit("POST", { email: ownerEmail }),
      devEnv,
    );
    const loginBody = (await loginRes.json()) as {
      data: { verify_url?: string };
    };
    const reactivateToken = new URL(
      loginBody.data.verify_url ?? "",
    ).searchParams.get("token");
    if (!reactivateToken) throw new Error("verify_url missing a token");

    const verifyRes = await app.request(
      `/api/auth/verify?token=${reactivateToken}`,
      {},
      env,
    );
    expect(verifyRes.status).toBe(302);

    const storeRows = await db
      .select({ status: schema.stores.status })
      .from(schema.stores)
      .where(eq(schema.stores.id, storeId));
    expect(storeRows[0]?.status).toBe("active");

    const setCookie = verifyRes.headers.get("Set-Cookie") ?? "";
    const newSessionToken = /session_token=([^;]+)/.exec(setCookie)?.[1];
    if (!newSessionToken) throw new Error("session_token cookie not set");

    const meRes = await app.request(
      "/api/auth/me",
      withAuth(newSessionToken),
      env,
    );
    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as {
      data: { id: string; email: string; role: string };
    };
    expect(meBody.data.id).toBe(storeId);
    expect(meBody.data.email).toBe(ownerEmail);
    expect(meBody.data.role).toBe("owner");
  });
});
