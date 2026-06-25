/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from "cloudflare:workers";
import { MAGIC_LINK_TTL_MS, now } from "@order/core";
import { createDb, schema } from "@order/db";
import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { app } from "../app";
import { extractSessionToken, jsonInit, withAuth } from "../test-helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JSON_HEADERS = { "Content-Type": "application/json" };

/** Registers a store via the API and returns its id + the signup magic token. */
async function registerStore(
  name: string,
  email: string,
): Promise<{ storeId: string; signupToken: string }> {
  const res = await app.request(
    "/api/stores",
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name, email }),
    },
    env,
  );
  if (!res.ok) throw new Error(`registerStore failed: ${res.status}`);
  const body = (await res.json()) as { data: { id: string } };
  const storeId = body.data.id;

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

  if (!tokenRow) throw new Error("signup magic_link_token not found");
  return { storeId, signupToken: tokenRow.token };
}

/** Verifies a token via the API (follows the 302 redirect internally). */
async function verifyToken(token: string): Promise<Response> {
  return app.request(`/api/auth/verify?token=${token}`, {}, env);
}

// ---------------------------------------------------------------------------
// GET /api/auth/verify
// ---------------------------------------------------------------------------

describe("GET /api/auth/verify", () => {
  it("activates the store and creates a session on valid signup token", async () => {
    const email = `verify-ok-${crypto.randomUUID()}@example.com`;
    const { storeId, signupToken } = await registerStore(
      "Verify OK Cafe",
      email,
    );

    const res = await verifyToken(signupToken);

    // Redirects to the admin SPA (absolute URL from env)
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("http://admin.localhost");

    const db = createDb(env.DB);

    // Store should now be active
    const storeRow = await db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.id, storeId))
      .then((rows) => rows[0]);
    expect(storeRow?.status).toBe("active");
    expect(storeRow?.activated_at).toBeTruthy();

    // Session should exist
    const sessionRows = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.store_id, storeId));
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0]?.expires_at).toBeGreaterThan(now());

    // session_token cookie should be set with SameSite=None
    const cookie = res.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain("session_token=");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=none");
  });

  it("marks the magic_link_token as used (used_at set, not deleted)", async () => {
    const email = `verify-used-${crypto.randomUUID()}@example.com`;
    const { signupToken } = await registerStore("Used Token Cafe", email);

    await verifyToken(signupToken);

    const db = createDb(env.DB);
    const tokenRow = await db
      .select()
      .from(schema.magicLinkTokens)
      .where(eq(schema.magicLinkTokens.token, signupToken))
      .then((rows) => rows[0]);
    expect(tokenRow).toBeTruthy();
    expect(tokenRow?.used_at).toBeTruthy();
  });

  it("returns INVALID_TOKEN when the token has already been used", async () => {
    const email = `verify-reuse-${crypto.randomUUID()}@example.com`;
    const { signupToken } = await registerStore("Reuse Cafe", email);

    await verifyToken(signupToken);
    const res2 = await verifyToken(signupToken);

    expect(res2.status).toBe(400);
    const body = (await res2.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_TOKEN");
  });

  it("returns INVALID_TOKEN for an expired token", async () => {
    const email = `verify-expired-${crypto.randomUUID()}@example.com`;
    const { storeId } = await registerStore("Expired Cafe", email);

    const db = createDb(env.DB);
    const expiredToken = crypto.randomUUID();
    await db.insert(schema.magicLinkTokens).values({
      id: crypto.randomUUID(),
      store_id: storeId,
      token: expiredToken,
      purpose: "login",
      expires_at: now() - 1,
    });

    const res = await verifyToken(expiredToken);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_TOKEN");
  });

  it("returns INVALID_TOKEN for a non-existent token", async () => {
    const res = await verifyToken("completely-fake-token");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_TOKEN");
  });

  it("returns INVALID_TOKEN when token param is absent", async () => {
    const res = await app.request("/api/auth/verify", {}, env);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_TOKEN");
  });

  it("creates a session on valid login token (store already active)", async () => {
    const email = `verify-login-${crypto.randomUUID()}@example.com`;
    const { storeId, signupToken } = await registerStore(
      "Login Verify Cafe",
      email,
    );

    await verifyToken(signupToken);

    const db = createDb(env.DB);
    const loginToken = crypto.randomUUID();
    await db.insert(schema.magicLinkTokens).values({
      id: crypto.randomUUID(),
      store_id: storeId,
      token: loginToken,
      purpose: "login",
      expires_at: now() + MAGIC_LINK_TTL_MS,
    });

    const res = await verifyToken(loginToken);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("http://admin.localhost");

    // Two sessions should now exist (signup + login)
    const sessionRows = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.store_id, storeId));
    expect(sessionRows.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

describe("POST /api/auth/login", () => {
  it("always returns 200 with { data: { sent: true } }", async () => {
    const res = await app.request(
      "/api/auth/login",
      jsonInit("POST", { email: "ghost@nonexistent.example.com" }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { sent: boolean } };
    expect(body.data.sent).toBe(true);
  });

  it("issues a login token for an active store", async () => {
    const email = `login-active-${crypto.randomUUID()}@example.com`;
    const { storeId, signupToken } = await registerStore(
      "Login Active Cafe",
      email,
    );
    await verifyToken(signupToken);

    const res = await app.request(
      "/api/auth/login",
      jsonInit("POST", { email }),
      env,
    );
    expect(res.status).toBe(200);

    const db = createDb(env.DB);
    const tokens = await db
      .select()
      .from(schema.magicLinkTokens)
      .where(
        and(
          eq(schema.magicLinkTokens.store_id, storeId),
          eq(schema.magicLinkTokens.purpose, "login"),
          isNull(schema.magicLinkTokens.used_at),
        ),
      );
    expect(tokens).toHaveLength(1);
  });

  it("issues a signup token (recovery) for a pending store", async () => {
    const email = `login-pending-${crypto.randomUUID()}@example.com`;
    const { storeId } = await registerStore("Login Pending Cafe", email);

    const res = await app.request(
      "/api/auth/login",
      jsonInit("POST", { email }),
      env,
    );
    expect(res.status).toBe(200);

    const db = createDb(env.DB);
    const tokens = await db
      .select()
      .from(schema.magicLinkTokens)
      .where(
        and(
          eq(schema.magicLinkTokens.store_id, storeId),
          eq(schema.magicLinkTokens.purpose, "signup"),
          isNull(schema.magicLinkTokens.used_at),
        ),
      );
    // The old token is deleted and replaced by a new one
    expect(tokens).toHaveLength(1);
  });

  it("invalidates the old token when reissuing for the same purpose", async () => {
    const email = `login-reissue-${crypto.randomUUID()}@example.com`;
    const { storeId, signupToken: firstToken } = await registerStore(
      "Reissue Cafe",
      email,
    );
    await verifyToken(firstToken);

    await app.request("/api/auth/login", jsonInit("POST", { email }), env);

    const db = createDb(env.DB);
    const tokens = await db
      .select()
      .from(schema.magicLinkTokens)
      .where(
        and(
          eq(schema.magicLinkTokens.store_id, storeId),
          eq(schema.magicLinkTokens.purpose, "login"),
          isNull(schema.magicLinkTokens.used_at),
        ),
      );
    // Only one valid login token should exist regardless of how many times login was called
    expect(tokens).toHaveLength(1);
  });

  it("returns 400 for invalid email format", async () => {
    const res = await app.request(
      "/api/auth/login",
      jsonInit("POST", { email: "not-an-email" }),
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

describe("POST /api/auth/logout", () => {
  it("deletes the current session and clears the cookie", async () => {
    const email = `logout-${crypto.randomUUID()}@example.com`;
    const { signupToken, storeId } = await registerStore("Logout Cafe", email);

    const verifyRes = await verifyToken(signupToken);
    const sessionToken = extractSessionToken(verifyRes);

    const logoutRes = await app.request(
      "/api/auth/logout",
      { method: "POST", headers: { Cookie: `session_token=${sessionToken}` } },
      env,
    );

    // Redirects to the admin SPA login page
    expect(logoutRes.status).toBe(302);
    expect(logoutRes.headers.get("Location")).toBe(
      "http://admin.localhost/login",
    );

    // Cookie should be cleared
    const cookie = logoutRes.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain("Max-Age=0");

    // Session should be deleted from DB
    const db = createDb(env.DB);
    const sessions = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.store_id, storeId));
    expect(sessions).toHaveLength(0);
  });

  it("succeeds even when no cookie is present", async () => {
    const res = await app.request("/api/auth/logout", { method: "POST" }, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("http://admin.localhost/login");
  });

  it("only deletes the session matching the cookie (other sessions remain)", async () => {
    const email = `logout-multi-${crypto.randomUUID()}@example.com`;
    const { storeId, signupToken } = await registerStore(
      "Multi Session Cafe",
      email,
    );

    const res1 = await verifyToken(signupToken);
    const token1 = extractSessionToken(res1);

    const db = createDb(env.DB);
    const loginToken = crypto.randomUUID();
    await db.insert(schema.magicLinkTokens).values({
      id: crypto.randomUUID(),
      store_id: storeId,
      token: loginToken,
      purpose: "login",
      expires_at: now() + MAGIC_LINK_TTL_MS,
    });
    await verifyToken(loginToken);

    await app.request(
      "/api/auth/logout",
      { method: "POST", headers: { Cookie: `session_token=${token1}` } },
      env,
    );

    const remaining = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.store_id, storeId));
    expect(remaining).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// requireStore middleware (session-based auth)
// ---------------------------------------------------------------------------

describe("requireStore middleware (session-based)", () => {
  it("returns 401 for requests without a session cookie", async () => {
    const res = await app.request("/api/seats", {}, env);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 for an invalid session token", async () => {
    const res = await app.request(
      "/api/seats",
      withAuth("fake-token-that-doesnt-exist"),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("grants access to an active store with a valid session", async () => {
    const email = `auth-active-${crypto.randomUUID()}@example.com`;
    const { signupToken } = await registerStore("Auth Active Cafe", email);
    const verifyRes = await verifyToken(signupToken);
    const sessionToken = extractSessionToken(verifyRes);

    const res = await app.request("/api/seats", withAuth(sessionToken), env);
    // 200 (empty list) — auth passed
    expect(res.status).toBe(200);
  });
});
