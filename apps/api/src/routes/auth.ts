import {
  buildClearSessionCookie,
  buildSessionCookie,
  errorResponse,
  LoginInput,
  newId,
  now,
  SESSION_TOKEN_COOKIE,
  SESSION_TTL_MS,
  sendMagicLinkEmail,
} from "@order/core";
import { createDb, schema } from "@order/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { deleteSession, issueMagicLink } from "../auth";
import { requireStore } from "../middleware";
import { bodyValidator } from "../validator";

export const authRouter = new Hono<{ Bindings: Env }>()
  /**
   * GET /api/auth/me
   * Returns the authenticated store's id and name.
   * Used by the admin SPA on initial load to resolve the session.
   * Returns 401 if not authenticated or session has expired.
   */
  .get("/me", requireStore, (c) => {
    const { id, name } = c.var.store;
    return c.json({ data: { id, name } });
  })

  /**
   * GET /api/auth/verify?token=<token>
   *
   * Verifies a Magic Link token (signup or login).
   * On success: marks the token used, activates the store if signing up,
   * creates a session, sets the session_token cookie, and redirects to
   * c.env.ADMIN_ORIGIN (absolute URL — required for cross-origin deployment).
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
    const cookieDomain = c.env.COOKIE_DOMAIN || undefined;
    c.header(
      "Set-Cookie",
      buildSessionCookie(sessionToken, { secure, domain: cookieDomain }),
    );
    // Redirect to the admin SPA — absolute URL required for cross-origin deploy.
    return c.redirect(c.env.ADMIN_ORIGIN, 302);
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
  .post("/login", bodyValidator(LoginInput), async (c) => {
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
        // Magic Link verify URL is always on the API origin.
        const baseUrl = new URL(c.req.url).origin;
        const magicLinkUrl = `${baseUrl}/api/auth/verify?token=${token}`;

        // Defer email delivery so its latency is not observable to the caller.
        // Without this, response time reveals whether the email address is registered.
        const emailPromise = sendMagicLinkEmail(
          { to: email, magicLinkUrl, purpose },
          {
            resendApiKey: c.env.RESEND_API_KEY,
            mailFrom: c.env.MAIL_FROM,
          },
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
  })

  /**
   * POST /api/auth/logout
   *
   * Deletes the current session and clears the cookie.
   * Only the session identified by the current cookie is removed;
   * sessions on other devices remain active.
   * Redirects to the signup SPA (which hosts the login form).
   */
  .post("/logout", async (c) => {
    const token = getCookie(c, SESSION_TOKEN_COOKIE)?.trim() ?? "";
    if (token) {
      const db = createDb(c.env.DB);
      await deleteSession(db, token);
    }

    const secure = new URL(c.req.url).protocol === "https:";
    const cookieDomain = c.env.COOKIE_DOMAIN || undefined;
    c.header(
      "Set-Cookie",
      buildClearSessionCookie({ secure, domain: cookieDomain }),
    );
    // Redirect to the admin SPA login page.
    return c.redirect(`${c.env.ADMIN_ORIGIN}/login`, 302);
  });
