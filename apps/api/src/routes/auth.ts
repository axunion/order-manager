import {
  buildClearSessionCookie,
  buildSessionCookie,
  errorResponse,
  LoginInput,
  MAGIC_LINK_VERIFY_PATH,
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
import { deleteSession, isSecureRequest, issueMagicLink } from "../auth";
import { requireStore } from "../middleware";
import { bodyValidator } from "../validator";

export const authRouter = new Hono<{ Bindings: Env }>()
  /**
   * GET /api/auth/me
   * Returns the authenticated store's id, name, and email.
   * Used by the admin SPA on initial load to resolve the session (and by
   * SettingsPage to show the current email without a second endpoint).
   * Returns 401 if not authenticated or session has expired.
   */
  .get("/me", requireStore, async (c) => {
    const { id, name } = c.var.store;
    const db = createDb(c.env.DB);
    const rows = await db
      .select({ email: schema.stores.email })
      .from(schema.stores)
      .where(eq(schema.stores.id, id))
      .limit(1);
    return c.json({ data: { id, name, email: rows[0]?.email ?? "" } });
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
        new_email: schema.magicLinkTokens.new_email,
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

    // For email_change tokens, apply the pending address now that the owner
    // has proven control of it. A UNIQUE race (the address was claimed by
    // another store after this token was issued) fails generically — the
    // token is already consumed, so the owner must re-request the change.
    if (linkToken.purpose === "email_change") {
      if (!linkToken.new_email) {
        return errorResponse("INVALID_TOKEN", "Invalid or expired link", 400);
      }
      try {
        await db
          .update(schema.stores)
          .set({ email: linkToken.new_email })
          .where(eq(schema.stores.id, linkToken.store_id));
      } catch {
        return errorResponse("INVALID_TOKEN", "Invalid or expired link", 400);
      }
    }

    // Create a new session.
    const sessionToken = newId();
    await db.insert(schema.sessions).values({
      id: newId(),
      store_id: linkToken.store_id,
      session_token: sessionToken,
      expires_at: ts + SESSION_TTL_MS,
    });

    const secure = isSecureRequest(c.req.url, c.env.ENVIRONMENT);
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
    let magicLinkUrl: string | undefined;

    if (store && store.status !== "suspended") {
      try {
        const purpose = store.status === "active" ? "login" : "signup";
        const token = await issueMagicLink(db, store.id, purpose);
        // null means the store hit MAGIC_LINK_HOURLY_CAP — skip sending but
        // keep the response identical to the success case (anti-enumeration).
        if (token) {
          // Magic Link verify URL is always on the API origin.
          const baseUrl = new URL(c.req.url).origin;
          magicLinkUrl = `${baseUrl}${MAGIC_LINK_VERIFY_PATH}?token=${token}`;

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
        }
      } catch {
        // Silent failure — the "always 200" contract must hold even if token
        // issuance fails (e.g., transient D1 error).
        console.error(`[auth/login] Magic link issuance failed for ${email}`);
      }
    }

    // Always return 200 regardless of email existence. In dev
    // (ENVIRONMENT === "development") only, include verify_url when a token
    // was actually issued — production always returns the identical body.
    // Checked as an explicit opt-in (not "!== production") so an unset or
    // misconfigured ENVIRONMENT never accidentally leaks the Magic Link.
    const isDev = c.env.ENVIRONMENT === "development";
    return c.json({
      data: {
        sent: true,
        ...(isDev && magicLinkUrl && { verify_url: magicLinkUrl }),
      },
    });
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

    const secure = isSecureRequest(c.req.url, c.env.ENVIRONMENT);
    const cookieDomain = c.env.COOKIE_DOMAIN || undefined;
    c.header(
      "Set-Cookie",
      buildClearSessionCookie({ secure, domain: cookieDomain }),
    );
    // Redirect to the admin SPA login page.
    return c.redirect(`${c.env.ADMIN_ORIGIN}/login`, 302);
  });
