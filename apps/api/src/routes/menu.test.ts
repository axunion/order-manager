/// <reference types="@cloudflare/vitest-pool-workers/types" />
/**
 * Menu item description field (roadmap Phase 3 item 1).
 */
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "../app";
import { jsonInit, seedStore, withAuth } from "../test-helpers";

describe("POST /api/menu/items description", () => {
  it("persists and returns a trimmed description", async () => {
    const { session_token: token } = await seedStore(
      `Create Description ${crypto.randomUUID()}`,
    );

    const res = await app.request(
      "/api/menu/items",
      withAuth(
        token,
        jsonInit("POST", {
          name: "唐揚げ",
          price: 500,
          description: "  国産鶏もも肉を使用。  ",
        }),
      ),
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { description: string } };
    expect(body.data.description).toBe("国産鶏もも肉を使用。");
  });

  it("defaults to null when omitted", async () => {
    const { session_token: token } = await seedStore(
      `Create No Description ${crypto.randomUUID()}`,
    );

    const res = await app.request(
      "/api/menu/items",
      withAuth(token, jsonInit("POST", { name: "ビール", price: 600 })),
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { description: string | null } };
    expect(body.data.description).toBeNull();
  });
});

describe("PATCH /api/menu/items/:id description", () => {
  it("updates the description", async () => {
    const { session_token: token } = await seedStore(
      `Update Description ${crypto.randomUUID()}`,
    );
    const createRes = await app.request(
      "/api/menu/items",
      withAuth(token, jsonInit("POST", { name: "唐揚げ", price: 500 })),
      env,
    );
    const { data: created } = (await createRes.json()) as {
      data: { id: string };
    };

    const res = await app.request(
      `/api/menu/items/${created.id}`,
      withAuth(
        token,
        jsonInit("PATCH", {
          name: "唐揚げ",
          price: 500,
          is_available: true,
          description: "新しい説明文",
        }),
      ),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { description: string } };
    expect(body.data.description).toBe("新しい説明文");
  });

  it("preserves the existing description when omitted", async () => {
    const { session_token: token } = await seedStore(
      `Preserve Description ${crypto.randomUUID()}`,
    );
    const createRes = await app.request(
      "/api/menu/items",
      withAuth(
        token,
        jsonInit("POST", {
          name: "唐揚げ",
          price: 500,
          description: "元の説明",
        }),
      ),
      env,
    );
    const { data: created } = (await createRes.json()) as {
      data: { id: string };
    };

    const res = await app.request(
      `/api/menu/items/${created.id}`,
      withAuth(
        token,
        jsonInit("PATCH", { name: "唐揚げ改", price: 500, is_available: true }),
      ),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { description: string } };
    expect(body.data.description).toBe("元の説明");
  });

  it("clears the description when explicitly null", async () => {
    const { session_token: token } = await seedStore(
      `Clear Description ${crypto.randomUUID()}`,
    );
    const createRes = await app.request(
      "/api/menu/items",
      withAuth(
        token,
        jsonInit("POST", {
          name: "唐揚げ",
          price: 500,
          description: "元の説明",
        }),
      ),
      env,
    );
    const { data: created } = (await createRes.json()) as {
      data: { id: string };
    };

    const res = await app.request(
      `/api/menu/items/${created.id}`,
      withAuth(
        token,
        jsonInit("PATCH", {
          name: "唐揚げ",
          price: 500,
          is_available: true,
          description: null,
        }),
      ),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { description: string | null } };
    expect(body.data.description).toBeNull();
  });
});
