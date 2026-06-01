import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createDb, schema } from "../../db/client";
import { buildAuthCookie } from "../auth";
import { errorResponse } from "../http";
import { newId } from "../id";
import { buildSlug } from "../slug";

const createStoreSchema = z.object({
  /** Store display name. Trimmed; must be 1–100 characters after trimming. */
  name: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1).max(100)),
});

export const storesRouter = new Hono<{ Bindings: Env }>()
  /**
   * POST /api/stores
   * Registers a new store, sets the admin access_token cookie.
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
      const { name } = c.req.valid("json");
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
      const access_token = newId();

      try {
        await db.insert(schema.stores).values({ id, name, slug, access_token });
      } catch {
        // UNIQUE constraint violation (concurrent request race on slug or access_token).
        return errorResponse(
          "INTERNAL_ERROR",
          "Store registration failed. Please try again.",
          500,
        );
      }

      // Add Secure flag when the request arrived over HTTPS (production).
      // Omit it for local dev (wrangler dev serves HTTP on localhost).
      const secure = new URL(c.req.url).protocol === "https:";
      c.header("Set-Cookie", buildAuthCookie(access_token, secure));
      return c.json({ data: { id, name, slug } }, 201);
    },
  );
