import { zValidator } from "@hono/zod-validator";
import { and, eq, gt, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { createDb, schema } from "../../db/client";
import {
  buildClearSessionCookie,
  buildSessionCookie,
  deleteSession,
  issueMagicLink,
  SESSION_TOKEN_COOKIE,
  SESSION_TTL_MS,
} from "../auth";
import { sendMagicLinkEmail } from "../email";
import { errorResponse } from "../http";
import { newId } from "../id";
import { now } from "../time";

export const authRouter = new Hono<{ Bindings: Env }>()
  /**
   * GET /api/auth/verify?token=<token>
   *
   * Verifies a Magic Link token (signup or login).
   * On success: marks the token used, activates the store if signing up,
   * creates a session, sets the session_token cookie, and redirects to /admin.
   *
   * All failure modes return the same INVALID_TOKEN error to prevent
   * enumeration attacks (no information about whether the token ever existed).
   */
  .get("/verify", async (c) => {
    const token = c.req.query("token")?.trim() ?? "";
    if (!token) {
      return errorResponse("INVALID_TOKEN", "Invalid or expired link", 400);
    }

    const db = createDb(c.env.DB);
    const ts = now();

    // Look up the token — must be unused and not expired.
    const rows = await db
      .select({
        id: schema.magicLinkTokens.id,
        store_id: schema.magicLinkTokens.store_id,
        purpose: schema.magicLinkTokens.purpose,
      })
      .from(schema.magicLinkTokens)
      .where(
        and(
          eq(schema.magicLinkTokens.token, token),
          isNull(schema.magicLinkTokens.used_at),
          gt(schema.magicLinkTokens.expires_at, ts),
        ),
      )
      .limit(1);

    const linkToken = rows[0];

    if (!linkToken) {
      return errorResponse("INVALID_TOKEN", "Invalid or expired link", 400);
    }

    // Mark the token as consumed (kept for audit trail, not deleted).
    await db
      .update(schema.magicLinkTokens)
      .set({ used_at: ts })
      .where(eq(schema.magicLinkTokens.id, linkToken.id));

    // For signup tokens, transition the store to active.
    if (linkToken.purpose === "signup") {
      await db
        .update(schema.stores)
        .set({ status: "active", activated_at: ts })
        .where(eq(schema.stores.id, linkToken.store_id));
    }

    // Create a new session.
    const sessionToken = newId();
    await db.insert(schema.sessions).values({
      id: newId(),
      store_id: linkToken.store_id,
      session_token: sessionToken,
      expires_at: ts + SESSION_TTL_MS,
    });

    const secure = new URL(c.req.url).protocol === "https:";
    c.header("Set-Cookie", buildSessionCookie(sessionToken, secure));
    return c.redirect("/admin", 302);
  })

  /**
   * POST /api/auth/login
   *
   * Sends a Magic Link to the given email address.
   * Always returns 200 with the same message regardless of whether the email
   * is registered, to prevent email enumeration.
   *
   * Behaviour per status:
   *   active    → sends a "login" Magic Link
   *   pending   → resends the "signup" Magic Link (recovery for failed delivery)
   *   suspended → silent (no email sent)
   */
  .post(
    "/login",
    zValidator("json", z.object({ email: z.email() }), (result, _c) => {
      if (!result.success) {
        return errorResponse(
          "VALIDATION_ERROR",
          result.error.issues.map((i) => i.message).join(", "),
          400,
        );
      }
    }),
    async (c) => {
      const { email } = c.req.valid("json");
      const db = createDb(c.env.DB);

      const rows = await db
        .select()
        .from(schema.stores)
        .where(eq(schema.stores.email, email))
        .limit(1);

      const store = rows[0];

      if (store && store.status !== "suspended") {
        try {
          const purpose = store.status === "active" ? "login" : "signup";
          const token = await issueMagicLink(db, store.id, purpose);
          const baseUrl = new URL(c.req.url).origin;
          const magicLinkUrl = `${baseUrl}/api/auth/verify?token=${token}`;

          // Defer email delivery so its latency is not observable to the caller.
          // Without this, response time reveals whether the email address is registered.
          const emailPromise = sendMagicLinkEmail(
            { to: email, magicLinkUrl, purpose },
            c.env,
          ).catch(() => {
            console.error(`[auth/login] Email delivery failed for ${email}`);
          });
          if (c.executionCtx?.waitUntil) {
            c.executionCtx.waitUntil(emailPromise);
          } else {
            await emailPromise;
          }
        } catch {
          // Silent failure — the "always 200" contract must hold even if token
          // issuance fails (e.g., transient D1 error).
          console.error(`[auth/login] Magic link issuance failed for ${email}`);
        }
      }

      // Always return 200 with the same body regardless of email existence.
      return c.json({ data: { sent: true } });
    },
  )

  /**
   * POST /api/auth/logout
   *
   * Deletes the current session and clears the cookie.
   * Only the session identified by the current cookie is removed;
   * sessions on other devices remain active.
   */
  .post("/logout", async (c) => {
    const token = getCookie(c, SESSION_TOKEN_COOKIE)?.trim() ?? "";
    if (token) {
      const db = createDb(c.env.DB);
      await deleteSession(db, token);
    }

    const secure = new URL(c.req.url).protocol === "https:";
    c.header("Set-Cookie", buildClearSessionCookie(secure));
    return c.redirect("/login", 302);
  });
