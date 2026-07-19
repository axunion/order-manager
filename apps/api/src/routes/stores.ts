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
import { requireOwner, requireStore } from "../middleware";
import { bodyValidator } from "../validator";

export const storesRouter = new Hono<{ Bindings: Env }>()
  /**
   * POST /api/stores
   * Registers a new store (status="pending") and its owner member
   * (role="owner", status="pending"), then sends a signup Magic Link.
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
    const memberId = newId();

    try {
      await db.batch([
        db.insert(schema.stores).values({ id, name, slug, email }),
        db.insert(schema.members).values({
          id: memberId,
          store_id: id,
          email,
          role: "owner",
        }),
      ]);
    } catch {
      // Determine which UNIQUE constraint failed for an accurate error message.
      // Both stores.email and members.email get this same address, and either
      // one can independently already be taken — e.g. a member elsewhere
      // changed their login email (POST /me/email-change) to this address
      // without ever having been a store's original signup email, so only
      // members.email holds it. Check both.
      const [storeConflict, memberConflict] = await Promise.all([
        db
          .select({ id: schema.stores.id })
          .from(schema.stores)
          .where(eq(schema.stores.email, email))
          .limit(1),
        db
          .select({ id: schema.members.id })
          .from(schema.members)
          .where(eq(schema.members.email, email))
          .limit(1),
      ]);
      if (storeConflict.length > 0 || memberConflict.length > 0) {
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

    // Issue a signup Magic Link (also invalidates any previous unused signup
    // token). A null return (MAGIC_LINK_HOURLY_CAP hit) is practically
    // unreachable for a brand-new member_id, but is handled the same as an
    // issuance failure for type-safety and future-proofing.
    let token: string | null = null;
    try {
      token = await issueMagicLink(db, id, memberId, "signup");
    } catch {
      token = null;
    }
    if (!token) {
      // Compensate by removing the store + member rows so the user can retry
      // registration without hitting "email already registered".
      await db.batch([
        db.delete(schema.members).where(eq(schema.members.id, memberId)),
        db.delete(schema.stores).where(eq(schema.stores.id, id)),
      ]);
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
   * authRouter's GET /me. Owner-only: renaming the store is a settings
   * action, not a daily-operations one.
   *
   * The slug is intentionally NOT regenerated; it is a stable identifier
   * not currently used by any feature.
   *
   * Response: 200 { data: { id, name, slug } }
   */
  .patch(
    "/me",
    requireStore,
    requireOwner,
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
   * Requests a change of the calling member's own login email: issues a
   * Magic Link (purpose 'email_change') sent to the NEW address, proving
   * control before the change takes effect at GET /api/auth/verify. Any
   * active member (owner or staff) can change their own email; not
   * owner-gated. stores.email is untouched — it stays fixed at whatever
   * address created the store (display-only from here on).
   *
   * Rejects 400 if new_email equals the current email or is already
   * registered to another member — the caller is authenticated here, so
   * (unlike /api/auth/login) anti-enumeration does not apply.
   *
   * Response: 200 { data: { sent: true, verify_url? } }
   */
  .post(
    "/me/email-change",
    requireStore,
    bodyValidator(EmailChangeInput),
    async (c) => {
      const { id: storeId, member_id: memberId } = c.var.store;
      const { new_email } = c.req.valid("json");
      const db = createDb(c.env.DB);

      const memberRows = await db
        .select({ email: schema.members.email })
        .from(schema.members)
        .where(eq(schema.members.id, memberId))
        .limit(1);
      const currentEmail = memberRows[0]?.email;
      if (!currentEmail) {
        return errorResponse("NOT_FOUND", "Member not found", 404);
      }

      if (new_email === currentEmail) {
        return errorResponse(
          "VALIDATION_ERROR",
          "現在のメールアドレスと同じです。",
          400,
        );
      }

      const conflict = await db
        .select({ id: schema.members.id })
        .from(schema.members)
        .where(eq(schema.members.email, new_email))
        .limit(1);
      if (conflict.length > 0) {
        return errorResponse(
          "VALIDATION_ERROR",
          "このメールアドレスはすでに使用されています。",
          400,
        );
      }

      let token: string | null;
      try {
        token = await issueMagicLink(
          db,
          storeId,
          memberId,
          "email_change",
          new_email,
        );
      } catch {
        return errorResponse(
          "INTERNAL_ERROR",
          "変更の準備に失敗しました。再度お試しください。",
          500,
        );
      }

      // null means the store hit MAGIC_LINK_HOURLY_CAP — silently skip
      // sending but keep the response identical to the success case, same
      // anti-abuse posture as /api/auth/login.
      let magicLinkUrl: string | undefined;
      if (token) {
        const baseUrl = new URL(c.req.url).origin;
        magicLinkUrl = `${baseUrl}${MAGIC_LINK_VERIFY_PATH}?token=${token}`;

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
      }

      const isDev = c.env.ENVIRONMENT === "development";
      return c.json({
        data: {
          sent: true,
          ...(isDev && magicLinkUrl && { verify_url: magicLinkUrl }),
        },
      });
    },
  );
