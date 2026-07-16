/// <reference types="@cloudflare/vitest-pool-workers/types" />
/**
 * Store settings (roadmap Phase 2 item 4): rename and owner email change.
 */
import { env } from "cloudflare:workers";
import { createDb, schema } from "@order/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { app } from "../app";
import { jsonInit, seedStore, withAuth } from "../test-helpers";

// Magic Link responses only include verify_url when ENVIRONMENT=development
// (see stores.ts / auth.ts's isDev gate). Tests that need to extract a token
// from the response body must pass this override explicitly — relying on
// .dev.vars's default is not safe in CI/fresh-checkout environments.
const devEnv = { ...env, ENVIRONMENT: "development" };

// ---------------------------------------------------------------------------
// PATCH /api/stores/me — rename
// ---------------------------------------------------------------------------

describe("PATCH /api/stores/me", () => {
  it("updates the store name and returns id/name/slug", async () => {
    const { id, session_token: token } = await seedStore(
      `Rename Test ${crypto.randomUUID()}`,
    );

    const res = await app.request(
      "/api/stores/me",
      withAuth(token, jsonInit("PATCH", { name: "新しい店名" })),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { id: string; name: string; slug: string };
    };
    expect(body.data.id).toBe(id);
    expect(body.data.name).toBe("新しい店名");
  });

  it("does not regenerate the slug", async () => {
    const { session_token: token } = await seedStore(
      `Slug Test ${crypto.randomUUID()}`,
    );

    const beforeRes = await app.request(
      "/api/stores/me",
      withAuth(token, jsonInit("PATCH", { name: "変更前" })),
      env,
    );
    const before = (await beforeRes.json()) as { data: { slug: string } };

    const afterRes = await app.request(
      "/api/stores/me",
      withAuth(token, jsonInit("PATCH", { name: "変更後" })),
      env,
    );
    const after = (await afterRes.json()) as { data: { slug: string } };

    expect(after.data.slug).toBe(before.data.slug);
  });

  it("returns 400 for an empty name", async () => {
    const { session_token: token } = await seedStore(
      `Validation Test ${crypto.randomUUID()}`,
    );

    const res = await app.request(
      "/api/stores/me",
      withAuth(token, jsonInit("PATCH", { name: "" })),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    const res = await app.request(
      "/api/stores/me",
      jsonInit("PATCH", { name: "無認証" }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("only renames the calling store, leaving other stores untouched", async () => {
    const storeA = await seedStore(`Store A ${crypto.randomUUID()}`);
    const storeB = await seedStore(`Store B ${crypto.randomUUID()}`);

    await app.request(
      "/api/stores/me",
      withAuth(storeA.session_token, jsonInit("PATCH", { name: "Aの新名前" })),
      env,
    );

    const db = createDb(env.DB);
    const rows = await db
      .select({ name: schema.stores.name })
      .from(schema.stores)
      .where(eq(schema.stores.id, storeB.id));
    expect(rows[0]?.name).toContain("Store B");
  });
});

// ---------------------------------------------------------------------------
// POST /api/stores/me/email-change
// ---------------------------------------------------------------------------

describe("POST /api/stores/me/email-change", () => {
  it("returns 401 without a session", async () => {
    const res = await app.request(
      "/api/stores/me/email-change",
      jsonInit("POST", { new_email: "new@example.com" }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when new_email equals the current email", async () => {
    const { id, session_token: token } = await seedStore(
      `Unchanged Email Test ${crypto.randomUUID()}`,
    );
    const db = createDb(env.DB);
    const rows = await db
      .select({ email: schema.stores.email })
      .from(schema.stores)
      .where(eq(schema.stores.id, id));
    const currentEmail = rows[0]?.email;
    if (!currentEmail) throw new Error("seedStore did not set an email");

    const res = await app.request(
      "/api/stores/me/email-change",
      withAuth(token, jsonInit("POST", { new_email: currentEmail })),
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when new_email is already registered to another store", async () => {
    const storeA = await seedStore(`Store A ${crypto.randomUUID()}`);
    const storeB = await seedStore(`Store B ${crypto.randomUUID()}`);
    const db = createDb(env.DB);
    const rows = await db
      .select({ email: schema.stores.email })
      .from(schema.stores)
      .where(eq(schema.stores.id, storeB.id));
    const storeBEmail = rows[0]?.email;
    if (!storeBEmail) throw new Error("seedStore did not set an email");

    const res = await app.request(
      "/api/stores/me/email-change",
      withAuth(
        storeA.session_token,
        jsonInit("POST", { new_email: storeBEmail }),
      ),
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("issues an email_change magic link token with new_email set", async () => {
    const { id, session_token: token } = await seedStore(
      `Issue Test ${crypto.randomUUID()}`,
    );
    const newEmail = `new-${crypto.randomUUID()}@test.internal`;

    const res = await app.request(
      "/api/stores/me/email-change",
      withAuth(token, jsonInit("POST", { new_email: newEmail })),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { sent: true } };
    expect(body.data.sent).toBe(true);

    const db = createDb(env.DB);
    const tokenRows = await db
      .select()
      .from(schema.magicLinkTokens)
      .where(eq(schema.magicLinkTokens.store_id, id));
    const emailChangeToken = tokenRows.find(
      (t) => t.purpose === "email_change" && t.used_at === null,
    );
    expect(emailChangeToken?.new_email).toBe(newEmail);
  });

  it("invalidates the previous unused token on re-request", async () => {
    const { id, session_token: token } = await seedStore(
      `Reissue Test ${crypto.randomUUID()}`,
    );
    const db = createDb(env.DB);

    const firstEmail = `first-${crypto.randomUUID()}@test.internal`;
    const firstRes = await app.request(
      "/api/stores/me/email-change",
      withAuth(token, jsonInit("POST", { new_email: firstEmail })),
      devEnv,
    );
    const firstBody = (await firstRes.json()) as {
      data: { verify_url?: string };
    };
    if (!firstBody.data.verify_url) {
      throw new Error("verify_url missing (ENVIRONMENT dev bypass off?)");
    }
    const firstToken = new URL(firstBody.data.verify_url).searchParams.get(
      "token",
    );
    if (!firstToken) throw new Error("verify_url has no token param");

    const secondEmail = `second-${crypto.randomUUID()}@test.internal`;
    await app.request(
      "/api/stores/me/email-change",
      withAuth(token, jsonInit("POST", { new_email: secondEmail })),
      env,
    );

    // The first token was superseded (deleted/invalidated) by the re-request.
    const verifyRes = await app.request(
      `/api/auth/verify?token=${firstToken}`,
      {},
      env,
    );
    expect(verifyRes.status).toBe(400);

    const storeRows = await db
      .select({ email: schema.stores.email })
      .from(schema.stores)
      .where(eq(schema.stores.id, id));
    expect(storeRows[0]?.email).not.toBe(firstEmail);
  });

  it("end-to-end: request, verify, then login works only via the new email", async () => {
    const { id, session_token: token } = await seedStore(
      `E2E Test ${crypto.randomUUID()}`,
    );
    const db = createDb(env.DB);
    const beforeRows = await db
      .select({ email: schema.stores.email })
      .from(schema.stores)
      .where(eq(schema.stores.id, id));
    const oldEmail = beforeRows[0]?.email;
    if (!oldEmail) throw new Error("seedStore did not set an email");
    const newEmail = `new-${crypto.randomUUID()}@test.internal`;

    const changeRes = await app.request(
      "/api/stores/me/email-change",
      withAuth(token, jsonInit("POST", { new_email: newEmail })),
      devEnv,
    );
    const changeBody = (await changeRes.json()) as {
      data: { verify_url?: string };
    };
    if (!changeBody.data.verify_url) {
      throw new Error("verify_url missing (ENVIRONMENT dev bypass off?)");
    }

    const verifyRes = await app.request(
      changeBody.data.verify_url.replace(/^https?:\/\/[^/]+/, ""),
      {},
      env,
    );
    expect(verifyRes.status).toBe(302);

    const afterRows = await db
      .select({ email: schema.stores.email })
      .from(schema.stores)
      .where(eq(schema.stores.id, id));
    expect(afterRows[0]?.email).toBe(newEmail);

    // Login with the old email issues no token (store no longer found by it).
    const oldLoginRes = await app.request(
      "/api/auth/login",
      jsonInit("POST", { email: oldEmail }),
      devEnv,
    );
    expect(oldLoginRes.status).toBe(200);
    const oldLoginBody = (await oldLoginRes.json()) as {
      data: { sent: true; verify_url?: string };
    };
    expect(oldLoginBody.data.verify_url).toBeUndefined();

    // Login with the new email issues a real token.
    const newLoginRes = await app.request(
      "/api/auth/login",
      jsonInit("POST", { email: newEmail }),
      devEnv,
    );
    expect(newLoginRes.status).toBe(200);
    const newLoginBody = (await newLoginRes.json()) as {
      data: { sent: true; verify_url?: string };
    };
    expect(newLoginBody.data.verify_url).toBeTruthy();
  });

  it("fails at verify with INVALID_TOKEN when a UNIQUE race claims the email first", async () => {
    const { id, session_token: token } = await seedStore(
      `Race Test ${crypto.randomUUID()}`,
    );
    const raceEmail = `race-${crypto.randomUUID()}@test.internal`;

    const changeRes = await app.request(
      "/api/stores/me/email-change",
      withAuth(token, jsonInit("POST", { new_email: raceEmail })),
      devEnv,
    );
    const changeBody = (await changeRes.json()) as {
      data: { verify_url?: string };
    };
    if (!changeBody.data.verify_url) {
      throw new Error("verify_url missing (ENVIRONMENT dev bypass off?)");
    }
    const raceToken = new URL(changeBody.data.verify_url).searchParams.get(
      "token",
    );
    if (!raceToken) throw new Error("verify_url has no token param");

    // Simulate a concurrent claim: another store takes the target email
    // after the token was issued but before it's verified.
    const racer = await seedStore(`Racer ${crypto.randomUUID()}`);
    const db = createDb(env.DB);
    await db
      .update(schema.stores)
      .set({ email: raceEmail })
      .where(eq(schema.stores.id, racer.id));

    const verifyRes = await app.request(
      `/api/auth/verify?token=${raceToken}`,
      {},
      env,
    );
    expect(verifyRes.status).toBe(400);
    const verifyBody = (await verifyRes.json()) as {
      error: { code: string };
    };
    expect(verifyBody.error.code).toBe("INVALID_TOKEN");

    // The original store's email was NOT changed.
    const rows = await db
      .select({ email: schema.stores.email })
      .from(schema.stores)
      .where(eq(schema.stores.id, id));
    expect(rows[0]?.email).not.toBe(raceEmail);
  });
});
