/// <reference types="@cloudflare/vitest-pool-workers/types" />
/**
 * Shift patterns and staffing requirements — the store-level templates the
 * schedule builder enters shifts from and measures coverage against.
 */
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "../app";
import { jsonInit, seedShiftStore, withAuth } from "../test-helpers";

async function createPosition(token: string, name = "ホール"): Promise<string> {
  const res = await app.request(
    "/api/shift/positions",
    withAuth(token, jsonInit("POST", { name })),
    env,
  );
  const body = (await res.json()) as { data: { id: string } };
  return body.data.id;
}

const pattern = { name: "早番", start_minutes: 540, end_minutes: 1020 };

const requirement = (position_id: string) => ({
  weekday: 5,
  position_id,
  start_minutes: 1020,
  end_minutes: 1320,
  required_headcount: 2,
});

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

describe("/api/shift/templates/patterns", () => {
  it("creates, lists and updates a pattern", async () => {
    const { session_token } = await seedShiftStore(
      `Patterns CRUD ${crypto.randomUUID()}`,
    );

    const created = await app.request(
      "/api/shift/templates/patterns",
      withAuth(session_token, jsonInit("POST", pattern)),
      env,
    );
    expect(created.status).toBe(201);
    const { data: made } = (await created.json()) as {
      data: { id: string; name: string };
    };

    const listed = await app.request(
      "/api/shift/templates/patterns",
      withAuth(session_token),
      env,
    );
    const { data: list } = (await listed.json()) as { data: { id: string }[] };
    expect(list.map((p) => p.id)).toEqual([made.id]);

    const patched = await app.request(
      `/api/shift/templates/patterns/${made.id}`,
      withAuth(
        session_token,
        jsonInit("PATCH", {
          ...pattern,
          name: "中番",
          sort_order: 1,
          is_active: true,
        }),
      ),
      env,
    );
    expect(patched.status).toBe(200);
    const { data: updated } = (await patched.json()) as {
      data: { name: string };
    };
    expect(updated.name).toBe("中番");
  });

  it("accepts an overnight pattern and rejects a backwards one", async () => {
    const { session_token } = await seedShiftStore(
      `Pattern Times ${crypto.randomUUID()}`,
    );

    const overnight = await app.request(
      "/api/shift/templates/patterns",
      withAuth(
        session_token,
        jsonInit("POST", {
          name: "深夜",
          start_minutes: 1260,
          end_minutes: 1620,
        }),
      ),
      env,
    );
    expect(overnight.status).toBe(201);

    const backwards = await app.request(
      "/api/shift/templates/patterns",
      withAuth(
        session_token,
        jsonInit("POST", {
          name: "逆",
          start_minutes: 1260,
          end_minutes: 600,
        }),
      ),
      env,
    );
    expect(backwards.status).toBe(400);
  });

  it("retires a pattern instead of deleting it, and hides it by default", async () => {
    const { session_token } = await seedShiftStore(
      `Pattern Retire ${crypto.randomUUID()}`,
    );
    const created = await app.request(
      "/api/shift/templates/patterns",
      withAuth(session_token, jsonInit("POST", pattern)),
      env,
    );
    const { data: made } = (await created.json()) as { data: { id: string } };

    const deleted = await app.request(
      `/api/shift/templates/patterns/${made.id}`,
      withAuth(session_token, { method: "DELETE" }),
      env,
    );
    expect(deleted.status).toBe(200);

    const listed = await app.request(
      "/api/shift/templates/patterns",
      withAuth(session_token),
      env,
    );
    const { data: list } = (await listed.json()) as { data: unknown[] };
    expect(list).toEqual([]);

    const all = await app.request(
      "/api/shift/templates/patterns?include_inactive=true",
      withAuth(session_token),
      env,
    );
    const { data: allList } = (await all.json()) as { data: unknown[] };
    expect(allList).toHaveLength(1);
  });

  it("returns 404 for another store's pattern", async () => {
    const storeA = await seedShiftStore(`Pattern A ${crypto.randomUUID()}`);
    const storeB = await seedShiftStore(`Pattern B ${crypto.randomUUID()}`);
    const created = await app.request(
      "/api/shift/templates/patterns",
      withAuth(storeA.session_token, jsonInit("POST", pattern)),
      env,
    );
    const { data: made } = (await created.json()) as { data: { id: string } };

    const res = await app.request(
      `/api/shift/templates/patterns/${made.id}`,
      withAuth(storeB.session_token, { method: "DELETE" }),
      env,
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Staffing requirements
// ---------------------------------------------------------------------------

describe("/api/shift/templates/requirements", () => {
  it("creates and lists a requirement", async () => {
    const { session_token } = await seedShiftStore(
      `Requirements CRUD ${crypto.randomUUID()}`,
    );
    const position = await createPosition(session_token);

    const created = await app.request(
      "/api/shift/templates/requirements",
      withAuth(session_token, jsonInit("POST", requirement(position))),
      env,
    );
    expect(created.status).toBe(201);

    const listed = await app.request(
      "/api/shift/templates/requirements",
      withAuth(session_token),
      env,
    );
    const { data: list } = (await listed.json()) as {
      data: { position_id: string; required_headcount: number }[];
    };
    expect(list).toHaveLength(1);
    expect(list[0]?.position_id).toBe(position);
    expect(list[0]?.required_headcount).toBe(2);
  });

  it("returns 400 for a weekday outside 0-6", async () => {
    const { session_token } = await seedShiftStore(
      `Requirement Weekday ${crypto.randomUUID()}`,
    );
    const position = await createPosition(session_token);

    const res = await app.request(
      "/api/shift/templates/requirements",
      withAuth(
        session_token,
        jsonInit("POST", { ...requirement(position), weekday: 7 }),
      ),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when the position belongs to another store", async () => {
    // The body carries the id, so the route must verify it rather than trust
    // it — otherwise the row lands under this store pointing at another's.
    const storeA = await seedShiftStore(
      `Req Position A ${crypto.randomUUID()}`,
    );
    const storeB = await seedShiftStore(
      `Req Position B ${crypto.randomUUID()}`,
    );
    const foreignPosition = await createPosition(storeA.session_token);

    const res = await app.request(
      "/api/shift/templates/requirements",
      withAuth(
        storeB.session_token,
        jsonInit("POST", requirement(foreignPosition)),
      ),
      env,
    );

    expect(res.status).toBe(404);
  });

  it("deletes a requirement outright, since nothing references it", async () => {
    const { session_token } = await seedShiftStore(
      `Requirement Delete ${crypto.randomUUID()}`,
    );
    const position = await createPosition(session_token);
    const created = await app.request(
      "/api/shift/templates/requirements",
      withAuth(session_token, jsonInit("POST", requirement(position))),
      env,
    );
    const { data: made } = (await created.json()) as { data: { id: string } };

    const deleted = await app.request(
      `/api/shift/templates/requirements/${made.id}`,
      withAuth(session_token, { method: "DELETE" }),
      env,
    );
    expect(deleted.status).toBe(200);

    const listed = await app.request(
      "/api/shift/templates/requirements",
      withAuth(session_token),
      env,
    );
    const { data: list } = (await listed.json()) as { data: unknown[] };
    expect(list).toEqual([]);
  });

  it("returns 404 for another store's requirement", async () => {
    const storeA = await seedShiftStore(`Req A ${crypto.randomUUID()}`);
    const storeB = await seedShiftStore(`Req B ${crypto.randomUUID()}`);
    const position = await createPosition(storeA.session_token);
    const created = await app.request(
      "/api/shift/templates/requirements",
      withAuth(storeA.session_token, jsonInit("POST", requirement(position))),
      env,
    );
    const { data: made } = (await created.json()) as { data: { id: string } };

    const res = await app.request(
      `/api/shift/templates/requirements/${made.id}`,
      withAuth(storeB.session_token, { method: "DELETE" }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("does not list another store's requirements", async () => {
    const storeA = await seedShiftStore(`Req List A ${crypto.randomUUID()}`);
    const storeB = await seedShiftStore(`Req List B ${crypto.randomUUID()}`);
    const position = await createPosition(storeA.session_token);
    await app.request(
      "/api/shift/templates/requirements",
      withAuth(storeA.session_token, jsonInit("POST", requirement(position))),
      env,
    );

    const res = await app.request(
      "/api/shift/templates/requirements",
      withAuth(storeB.session_token),
      env,
    );
    const { data: list } = (await res.json()) as { data: unknown[] };
    expect(list).toEqual([]);
  });
});
