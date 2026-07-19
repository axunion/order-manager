import {
  errorResponse,
  MAGIC_LINK_HOURLY_CAP,
  MAGIC_LINK_VERIFY_PATH,
  newId,
  now,
  StaffInviteInput,
  sendMagicLinkEmail,
} from "@order/core";
import { createDb, schema } from "@order/db";
import { and, eq, gt, ne } from "drizzle-orm";
import { Hono } from "hono";
import { issueMagicLink } from "../auth";
import { type AuthEnv, requireOwner, requireStore } from "../middleware";
import { bodyValidator } from "../validator";

const HOUR_MS = 60 * 60 * 1000;

export const staffRouter = new Hono<AuthEnv>()
  .use(requireStore)
  .use(requireOwner)

  /**
   * POST /api/staff
   * Invites a new member to the calling store: creates a pending member
   * (role defaults to 'staff') and issues an 'invite' Magic Link.
   * 400 if the email already belongs to any member (global uniqueness) —
   * caller is authenticated/owner here, so anti-enumeration doesn't apply.
   *
   * Rate limit: MAGIC_LINK_HOURLY_CAP invites per store per rolling hour.
   * issueMagicLink's own cap is member-scoped and can never trigger here
   * (each invite creates a brand-new member with no prior history), so
   * without this store-scoped check an owner session could mint unlimited
   * invite emails.
   *
   * Response: 201 { data: StaffMemberResponse }
   */
  .post("/", bodyValidator(StaffInviteInput), async (c) => {
    const { id: storeId } = c.var.store;
    const { email, role } = c.req.valid("json");
    const db = createDb(c.env.DB);

    const recentInvites = await db
      .select({ id: schema.magicLinkTokens.id })
      .from(schema.magicLinkTokens)
      .where(
        and(
          eq(schema.magicLinkTokens.store_id, storeId),
          eq(schema.magicLinkTokens.purpose, "invite"),
          gt(schema.magicLinkTokens.created_at, now() - HOUR_MS),
        ),
      )
      .limit(MAGIC_LINK_HOURLY_CAP);
    if (recentInvites.length >= MAGIC_LINK_HOURLY_CAP) {
      return errorResponse(
        "VALIDATION_ERROR",
        "招待の送信回数が上限に達しました。しばらくしてから再度お試しください。",
        400,
      );
    }

    const conflict = await db
      .select({ id: schema.members.id })
      .from(schema.members)
      .where(eq(schema.members.email, email))
      .limit(1);
    if (conflict.length > 0) {
      return errorResponse(
        "VALIDATION_ERROR",
        "このメールアドレスはすでに使用されています。",
        400,
      );
    }

    const memberId = newId();
    await db.insert(schema.members).values({
      id: memberId,
      store_id: storeId,
      email,
      role,
    });

    let token: string | null = null;
    try {
      token = await issueMagicLink(db, storeId, memberId, "invite");
    } catch {
      token = null;
    }
    if (!token) {
      // Compensate by removing the member row so the owner can retry.
      await db.delete(schema.members).where(eq(schema.members.id, memberId));
      return errorResponse(
        "INTERNAL_ERROR",
        "招待の送信に失敗しました。再度お試しください。",
        500,
      );
    }

    const baseUrl = new URL(c.req.url).origin;
    const magicLinkUrl = `${baseUrl}${MAGIC_LINK_VERIFY_PATH}?token=${token}`;
    try {
      await sendMagicLinkEmail(
        { to: email, magicLinkUrl, purpose: "invite" },
        { resendApiKey: c.env.RESEND_API_KEY, mailFrom: c.env.MAIL_FROM },
      );
    } catch {
      // Compensate by removing the token and member row so the owner can
      // retry — otherwise this email is permanently stuck as "already used"
      // (members.email UNIQUE) with no way to resend.
      await db.batch([
        db
          .delete(schema.magicLinkTokens)
          .where(eq(schema.magicLinkTokens.member_id, memberId)),
        db.delete(schema.members).where(eq(schema.members.id, memberId)),
      ]);
      return errorResponse(
        "INTERNAL_ERROR",
        "メール送信に失敗しました。しばらくしてから再度お試しください。",
        500,
      );
    }

    return c.json(
      {
        data: {
          id: memberId,
          email,
          role,
          status: "pending" as const,
          created_at: Date.now(),
          activated_at: null,
        },
      },
      201,
    );
  })

  /**
   * GET /api/staff
   * Lists the calling store's members.
   * Response: 200 { data: StaffMemberResponse[] }
   */
  .get("/", async (c) => {
    const { id: storeId } = c.var.store;
    const db = createDb(c.env.DB);
    const rows = await db
      .select({
        id: schema.members.id,
        email: schema.members.email,
        role: schema.members.role,
        status: schema.members.status,
        created_at: schema.members.created_at,
        activated_at: schema.members.activated_at,
      })
      .from(schema.members)
      .where(eq(schema.members.store_id, storeId));
    return c.json({ data: rows });
  })

  /**
   * DELETE /api/staff/:id
   * Revokes a member's access: deletes the member row and their sessions.
   * Rejects 400 for self-removal (use logout instead) and 400 if the
   * target is the store's last remaining owner. Self-removal alone isn't
   * a sufficient guarantee: two distinct owner sessions could otherwise
   * remove each other concurrently and leave zero owners, so this count
   * check is a real (not dead) guard — same check-then-act tradeoff as
   * the slug/email uniqueness checks elsewhere in this codebase.
   * Response: 200 { data: { id } }
   */
  .delete("/:id", async (c) => {
    const { id: storeId, member_id: callerId } = c.var.store;
    const targetId = c.req.param("id");
    const db = createDb(c.env.DB);

    if (targetId === callerId) {
      return errorResponse(
        "VALIDATION_ERROR",
        "自分自身を削除することはできません。ログアウトを使用してください。",
        400,
      );
    }

    const existing = await db
      .select({ id: schema.members.id, role: schema.members.role })
      .from(schema.members)
      .where(
        and(
          eq(schema.members.id, targetId),
          eq(schema.members.store_id, storeId),
        ),
      )
      .limit(1);
    const target = existing[0];
    if (!target) {
      return errorResponse("NOT_FOUND", "Member not found", 404);
    }

    if (target.role === "owner") {
      const otherOwners = await db
        .select({ id: schema.members.id })
        .from(schema.members)
        .where(
          and(
            eq(schema.members.store_id, storeId),
            eq(schema.members.role, "owner"),
            ne(schema.members.id, targetId),
          ),
        )
        .limit(1);
      if (otherOwners.length === 0) {
        return errorResponse(
          "VALIDATION_ERROR",
          "最後のオーナーは削除できません。",
          400,
        );
      }
    }

    await db.batch([
      db.delete(schema.sessions).where(eq(schema.sessions.member_id, targetId)),
      db
        .delete(schema.magicLinkTokens)
        .where(eq(schema.magicLinkTokens.member_id, targetId)),
      db.delete(schema.members).where(eq(schema.members.id, targetId)),
    ]);

    return c.json({ data: { id: targetId } });
  });
