import {
  buildSlug,
  CreateStoreInput,
  EmailChangeInput,
  errorResponse,
  MAGIC_LINK_VERIFY_PATH,
  newId,
  sendMagicLinkEmail,
  UpdateStoreNameInput,
} from "@order/core";
import { createDb, schema } from "@order/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { issueMagicLink } from "../auth";
import { requireStore } from "../middleware";
import { bodyValidator } from "../validator";

export const storesRouter = new Hono<{ Bindings: Env }>()
  /**
   * POST /api/stores
   * Registers a new store with status="pending" and sends a signup Magic Link.
   * No cookie is set here; the session is created on GET /api/auth/verify.
   * Response: 201 { data: { id, name, slug, verify_url? } }
   * (verify_url is only included when ENVIRONMENT === "development")
   */
  .post("/", bodyValidator(CreateStoreInput), async (c) => {
    const { name, email } = c.req.valid("json");
    const db = createDb(c.env.DB);

    // buildSlug appends a 5-char random suffix (~60M combinations); the INSERT
    // UNIQUE constraint below is the real collision guard.
    const slug = buildSlug(name);
    const id = newId();

    try {
      await db.insert(schema.stores).values({ id, name, slug, email });
    } catch {
      // Determine which UNIQUE constraint failed for an accurate error message.
      const emailConflict = await db
        .select({ id: schema.stores.id })
        .from(schema.stores)
        .where(eq(schema.stores.email, email))
        .limit(1);
      if (emailConflict.length > 0) {
        return errorResponse(
          "VALIDATION_ERROR",
          "このメールアドレスはすでに登録されています",
          400,
        );
      }
      // Slug race-condition (TOCTOU between the pre-check and INSERT).
      return errorResponse(
        "INTERNAL_ERROR",
        "Store registration failed. Please try again.",
        500,
      );
    }

    // Issue a signup Magic Link (also invalidates any previous unused signup token).
    let token: string;
    try {
      token = await issueMagicLink(db, id, "signup");
    } catch {
      // Token insert failed — compensate by removing the store row so the
      // user can retry registration without hitting "email already registered".
      await db.delete(schema.stores).where(eq(schema.stores.id, id));
      return errorResponse(
        "INTERNAL_ERROR",
        "Store registration failed. Please try again.",
        500,
      );
    }

    const baseUrl = new URL(c.req.url).origin;
    const magicLinkUrl = `${baseUrl}${MAGIC_LINK_VERIFY_PATH}?token=${token}`;

    try {
      await sendMagicLinkEmail(
        { to: email, magicLinkUrl, purpose: "signup" },
        {
          resendApiKey: c.env.RESEND_API_KEY,
          mailFrom: c.env.MAIL_FROM,
        },
      );
    } catch {
      // Email delivery failure: store stays pending; owner can retry via /login.
      return errorResponse(
        "INTERNAL_ERROR",
        "メール送信に失敗しました。しばらくしてから再度お試しください。",
        500,
      );
    }

    // Checked as an explicit opt-in (not "!== production") so an unset or
    // misconfigured ENVIRONMENT never accidentally leaks the Magic Link.
    const isDev = c.env.ENVIRONMENT === "development";
    return c.json(
      {
        data: {
          id,
          name,
          slug,
          ...(isDev && { verify_url: magicLinkUrl }),
        },
      },
      201,
    );
  })

  /**
   * PATCH /api/stores/me
   * Updates the authenticated store's display name. storesRouter is
   * otherwise public (POST / for signup), so requireStore is applied
   * inline on this route rather than router-wide — same pattern as
   * authRouter's GET /me.
   *
   * The slug is intentionally NOT regenerated; it is a stable identifier
   * not currently used by any feature.
   *
   * Response: 200 { data: { id, name, slug } }
   */
  .patch(
    "/me",
    requireStore,
    bodyValidator(UpdateStoreNameInput),
    async (c) => {
      const { id: storeId } = c.var.store;
      const { name } = c.req.valid("json");
      const db = createDb(c.env.DB);

      const updated = await db
        .update(schema.stores)
        .set({ name })
        .where(eq(schema.stores.id, storeId))
        .returning();

      const result = updated[0];
      if (!result) {
        return errorResponse("NOT_FOUND", "Store not found", 404);
      }

      return c.json({
        data: { id: result.id, name: result.name, slug: result.slug },
      });
    },
  )

  /**
   * POST /api/stores/me/email-change
   * Requests an owner email change: issues a Magic Link (purpose
   * 'email_change') sent to the NEW address, proving control before the
   * change takes effect at GET /api/auth/verify.
   *
   * Rejects 400 if new_email equals the current email or is already
   * registered to another store — the caller is authenticated here, so
   * (unlike /api/auth/login) anti-enumeration does not apply.
   *
   * Response: 200 { data: { sent: true, verify_url? } }
   */
  .post(
    "/me/email-change",
    requireStore,
    bodyValidator(EmailChangeInput),
    async (c) => {
      const { id: storeId } = c.var.store;
      const { new_email } = c.req.valid("json");
      const db = createDb(c.env.DB);

      const storeRows = await db
        .select({ email: schema.stores.email })
        .from(schema.stores)
        .where(eq(schema.stores.id, storeId))
        .limit(1);
      const currentEmail = storeRows[0]?.email;
      if (!currentEmail) {
        return errorResponse("NOT_FOUND", "Store not found", 404);
      }

      if (new_email === currentEmail) {
        return errorResponse(
          "VALIDATION_ERROR",
          "現在のメールアドレスと同じです。",
          400,
        );
      }

      const conflict = await db
        .select({ id: schema.stores.id })
        .from(schema.stores)
        .where(eq(schema.stores.email, new_email))
        .limit(1);
      if (conflict.length > 0) {
        return errorResponse(
          "VALIDATION_ERROR",
          "このメールアドレスはすでに使用されています。",
          400,
        );
      }

      let token: string;
      try {
        token = await issueMagicLink(db, storeId, "email_change", new_email);
      } catch {
        return errorResponse(
          "INTERNAL_ERROR",
          "変更の準備に失敗しました。再度お試しください。",
          500,
        );
      }

      const baseUrl = new URL(c.req.url).origin;
      const magicLinkUrl = `${baseUrl}${MAGIC_LINK_VERIFY_PATH}?token=${token}`;

      try {
        await sendMagicLinkEmail(
          { to: new_email, magicLinkUrl, purpose: "email_change" },
          {
            resendApiKey: c.env.RESEND_API_KEY,
            mailFrom: c.env.MAIL_FROM,
          },
        );
      } catch {
        return errorResponse(
          "INTERNAL_ERROR",
          "メール送信に失敗しました。しばらくしてから再度お試しください。",
          500,
        );
      }

      const isDev = c.env.ENVIRONMENT === "development";
      return c.json({
        data: {
          sent: true,
          ...(isDev && { verify_url: magicLinkUrl }),
        },
      });
    },
  );
