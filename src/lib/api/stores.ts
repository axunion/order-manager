import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createDb, schema } from "../../db/client";
import { issueMagicLink } from "../auth";
import { sendMagicLinkEmail } from "../email";
import { errorResponse } from "../http";
import { newId } from "../id";
import { buildSlug } from "../slug";

const createStoreSchema = z.object({
  /** Store display name. Trimmed; must be 1–100 characters after trimming. */
  name: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1).max(100)),
  /** Owner email — Magic Link is sent here. */
  email: z.email(),
});

export const storesRouter = new Hono<{ Bindings: Env }>()
  /**
   * POST /api/stores
   * Registers a new store with status="pending" and sends a signup Magic Link.
   * No cookie is set here; the session is created on GET /api/auth/verify.
   * Response: 201 { data: { id, name, slug } }
   */
  .post(
    "/",
    zValidator("json", createStoreSchema, (result, _c) => {
      if (!result.success) {
        return errorResponse(
          "VALIDATION_ERROR",
          result.error.issues.map((i) => i.message).join(", "),
          400,
        );
      }
    }),
    async (c) => {
      const { name, email } = c.req.valid("json");
      const db = createDb(c.env.DB);

      // Generate unique slug, retrying on the rare collision.
      // The SELECT-then-INSERT is a TOCTOU; the INSERT is wrapped in try/catch
      // to handle the unlikely concurrent-request race at the DB constraint level.
      let slug = "";
      for (let attempt = 0; attempt < 5; attempt++) {
        slug = buildSlug(name);
        const existing = await db
          .select({ id: schema.stores.id })
          .from(schema.stores)
          .where(eq(schema.stores.slug, slug))
          .limit(1);
        if (existing.length === 0) break;
        if (attempt === 4) {
          return errorResponse(
            "INTERNAL_ERROR",
            "Failed to generate unique slug",
            500,
          );
        }
      }

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
      const magicLinkUrl = `${baseUrl}/api/auth/verify?token=${token}`;

      try {
        await sendMagicLinkEmail(
          { to: email, magicLinkUrl, purpose: "signup" },
          c.env,
        );
      } catch {
        // Email delivery failure: store stays pending; owner can retry via /login.
        return errorResponse(
          "INTERNAL_ERROR",
          "メール送信に失敗しました。しばらくしてから再度お試しください。",
          500,
        );
      }

      return c.json({ data: { id, name, slug } }, 201);
    },
  );
