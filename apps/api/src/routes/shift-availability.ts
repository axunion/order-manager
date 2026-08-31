import {
  type AvailabilityEntryResponse,
  type AvailabilitySubmissionResponse,
  errorResponse,
  newId,
  now,
  periodDates,
  SaveAvailabilityInput,
} from "@order/core";
import { createDb, schema } from "@order/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import {
  type AuthEnv,
  requireEntitlement,
  requireOwner,
  requireStore,
} from "../middleware";
import { bodyValidator } from "../validator";

const entryColumns = {
  id: schema.availabilityEntries.id,
  work_date: schema.availabilityEntries.work_date,
  kind: schema.availabilityEntries.kind,
  start_minutes: schema.availabilityEntries.start_minutes,
  end_minutes: schema.availabilityEntries.end_minutes,
};

async function findPeriod(
  db: ReturnType<typeof createDb>,
  storeId: string,
  periodId: string,
) {
  const rows = await db
    .select({
      id: schema.schedulePeriods.id,
      start_date: schema.schedulePeriods.start_date,
      end_date: schema.schedulePeriods.end_date,
      status: schema.schedulePeriods.status,
    })
    .from(schema.schedulePeriods)
    .where(
      and(
        eq(schema.schedulePeriods.id, periodId),
        eq(schema.schedulePeriods.store_id, storeId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function entriesFor(
  db: ReturnType<typeof createDb>,
  submissionIds: string[],
): Promise<Map<string, AvailabilityEntryResponse[]>> {
  const bySubmission = new Map<string, AvailabilityEntryResponse[]>();
  if (submissionIds.length === 0) return bySubmission;

  const rows = await db
    .select({
      ...entryColumns,
      submission_id: schema.availabilityEntries.submission_id,
    })
    .from(schema.availabilityEntries)
    .where(inArray(schema.availabilityEntries.submission_id, submissionIds))
    .orderBy(
      asc(schema.availabilityEntries.work_date),
      asc(schema.availabilityEntries.start_minutes),
    );

  for (const { submission_id, ...entry } of rows) {
    const list = bySubmission.get(submission_id);
    if (list) list.push(entry);
    else bySubmission.set(submission_id, [entry]);
  }
  return bySubmission;
}

/**
 * The caller's own submission as stored. A member who has saved nothing gets
 * an empty draft rather than a 404, so the form always has something to bind.
 */
async function readOwnSubmission(
  db: ReturnType<typeof createDb>,
  storeId: string,
  periodId: string,
  memberId: string,
): Promise<AvailabilitySubmissionResponse> {
  const rows = await db
    .select({
      id: schema.availabilitySubmissions.id,
      member_id: schema.availabilitySubmissions.member_id,
      status: schema.availabilitySubmissions.status,
      submitted_at: schema.availabilitySubmissions.submitted_at,
      note: schema.availabilitySubmissions.note,
    })
    .from(schema.availabilitySubmissions)
    .where(
      and(
        eq(schema.availabilitySubmissions.store_id, storeId),
        eq(schema.availabilitySubmissions.period_id, periodId),
        eq(schema.availabilitySubmissions.member_id, memberId),
      ),
    )
    .limit(1);

  const submission = rows[0];
  if (!submission) {
    return {
      id: "",
      member_id: memberId,
      status: "draft",
      submitted_at: null,
      note: null,
      entries: [],
    };
  }

  const entries = (await entriesFor(db, [submission.id])).get(submission.id);
  return { ...submission, entries: entries ?? [] };
}

export const shiftAvailabilityRouter = new Hono<AuthEnv>()
  .use(requireStore)
  .use(requireEntitlement("shift"))

  /**
   * GET /api/shift/availability/:periodId/me
   * The caller's own submission. A member who has saved nothing gets an empty
   * draft rather than a 404, so the form has something to render.
   * Response: 200 { data: AvailabilitySubmissionResponse }
   */
  .get("/:periodId/me", async (c) => {
    const { id: storeId, member_id: memberId } = c.var.store;
    const periodId = c.req.param("periodId");
    const db = createDb(c.env.DB);

    if (!(await findPeriod(db, storeId, periodId))) {
      return errorResponse("NOT_FOUND", "Schedule period not found", 404);
    }

    return c.json({
      data: await readOwnSubmission(db, storeId, periodId, memberId),
    });
  })

  /**
   * PUT /api/shift/availability/:periodId/me
   * Replaces the caller's entries for the period. Allowed only while the
   * period is collecting: submission_deadline is advisory in v1, the manager
   * closing submissions is the enforcement.
   * Response: 200 { data: AvailabilitySubmissionResponse }
   */
  .put("/:periodId/me", bodyValidator(SaveAvailabilityInput), async (c) => {
    const { id: storeId, member_id: memberId } = c.var.store;
    const periodId = c.req.param("periodId");
    const { submit, note, entries } = c.req.valid("json");
    const db = createDb(c.env.DB);

    const period = await findPeriod(db, storeId, periodId);
    if (!period) {
      return errorResponse("NOT_FOUND", "Schedule period not found", 404);
    }
    if (period.status !== "collecting") {
      return errorResponse(
        "CONFLICT",
        "この期間の希望受付は締め切られています。",
        409,
      );
    }

    const withinPeriod = new Set(
      periodDates(period.start_date, period.end_date),
    );
    const stray = entries.find((entry) => !withinPeriod.has(entry.work_date));
    if (stray) {
      return errorResponse(
        "VALIDATION_ERROR",
        `${stray.work_date} はこの期間に含まれていません。`,
        400,
      );
    }

    const existing = await db
      .select({ id: schema.availabilitySubmissions.id })
      .from(schema.availabilitySubmissions)
      .where(
        and(
          eq(schema.availabilitySubmissions.store_id, storeId),
          eq(schema.availabilitySubmissions.period_id, periodId),
          eq(schema.availabilitySubmissions.member_id, memberId),
        ),
      )
      .limit(1);

    const submissionId = existing[0]?.id ?? newId();
    const status = submit ? ("submitted" as const) : ("draft" as const);
    const submitted_at = submit ? now() : null;

    if (existing[0]) {
      await db
        .update(schema.availabilitySubmissions)
        .set({ status, submitted_at, note })
        .where(eq(schema.availabilitySubmissions.id, submissionId));
      await db
        .delete(schema.availabilityEntries)
        .where(eq(schema.availabilityEntries.submission_id, submissionId));
    } else {
      await db.insert(schema.availabilitySubmissions).values({
        id: submissionId,
        store_id: storeId,
        period_id: periodId,
        member_id: memberId,
        status,
        submitted_at,
        note,
      });
    }

    if (entries.length > 0) {
      await db.insert(schema.availabilityEntries).values(
        entries.map((entry) => ({
          id: newId(),
          store_id: storeId,
          submission_id: submissionId,
          ...entry,
        })),
      );
    }

    // Read back rather than echoing the request: the response then carries
    // the stored entry ids, and a client can trust it as the new state.
    return c.json({
      data: await readOwnSubmission(db, storeId, periodId, memberId),
    });
  })

  /**
   * GET /api/shift/availability/:periodId
   * Every submission for the period, plus the members with none — v1 offers
   * that list instead of chasing non-submitters by email.
   *
   * Owner-only: one member must not read another's availability.
   * Response: 200 { data: { submissions, missing_member_ids } }
   */
  .get("/:periodId", requireOwner, async (c) => {
    const { id: storeId } = c.var.store;
    const periodId = c.req.param("periodId");
    const db = createDb(c.env.DB);

    if (!(await findPeriod(db, storeId, periodId))) {
      return errorResponse("NOT_FOUND", "Schedule period not found", 404);
    }

    const [rows, members] = await Promise.all([
      db
        .select({
          id: schema.availabilitySubmissions.id,
          member_id: schema.availabilitySubmissions.member_id,
          status: schema.availabilitySubmissions.status,
          submitted_at: schema.availabilitySubmissions.submitted_at,
          note: schema.availabilitySubmissions.note,
        })
        .from(schema.availabilitySubmissions)
        .where(
          and(
            eq(schema.availabilitySubmissions.store_id, storeId),
            eq(schema.availabilitySubmissions.period_id, periodId),
          ),
        ),
      db
        .select({ id: schema.members.id })
        .from(schema.members)
        .where(eq(schema.members.store_id, storeId)),
    ]);

    const entriesBySubmission = await entriesFor(
      db,
      rows.map((r) => r.id),
    );
    const submissions: AvailabilitySubmissionResponse[] = rows.map((row) => ({
      ...row,
      entries: entriesBySubmission.get(row.id) ?? [],
    }));

    // A draft counts as missing: the manager needs to know who is still
    // deciding, not just who has touched the form.
    const submittedBy = new Set(
      rows.filter((r) => r.status === "submitted").map((r) => r.member_id),
    );
    const missing_member_ids = members
      .map((m) => m.id)
      .filter((id) => !submittedBy.has(id));

    return c.json({ data: { submissions, missing_member_ids } });
  });
