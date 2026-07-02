import {
  buildSlug,
  CreateStoreInput,
  errorResponse,
  MAGIC_LINK_VERIFY_PATH,
  newId,
  sendMagicLinkEmail,
} from "@order/core";
import { createDb, schema } from "@order/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { issueMagicLink } from "../auth";
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
  });
