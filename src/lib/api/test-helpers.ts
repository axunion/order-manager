/**
 * Shared request helpers for workers-project integration tests.
 * Import from this file instead of defining local copies in each test file.
 */

// The env binding is only available inside vitest-pool-workers.
// Import from cloudflare:workers is safe here because this file is only
// executed in the workers test project.
import { env } from "cloudflare:workers";
import { createDb, schema } from "../../db/client";
import { SESSION_TTL_MS } from "../auth";
import { newId } from "../id";
import { now } from "../time";

// ---------------------------------------------------------------------------
// Store + session seed helper
// ---------------------------------------------------------------------------

export type SeedStore = { id: string; session_token: string };

/**
 * Inserts an active store and a valid session directly into D1.
 * Returns the store id and a session_token that can be used with withAuth().
 *
 * Each call generates a unique email to prevent UNIQUE constraint conflicts
 * between tests in the same worker pool run.
 */
export async function seedStore(name: string): Promise<SeedStore> {
  const db = createDb(env.DB);
  const id = newId();
  const session_token = newId();
  const email = `${id}@test.internal`;

  await db.insert(schema.stores).values({
    id,
    name,
    slug: newId(),
    email,
    status: "active",
    activated_at: now(),
  });

  await db.insert(schema.sessions).values({
    id: newId(),
    store_id: id,
    session_token,
    expires_at: now() + SESSION_TTL_MS,
  });

  return { id, session_token };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/** Extracts the session_token value from a Set-Cookie response header. */
export function extractSessionToken(res: Response): string {
  const setCookie = res.headers.get("Set-Cookie") ?? "";
  const m = setCookie.match(/session_token=([^;]+)/);
  if (!m)
    throw new Error("session_token cookie not found in Set-Cookie header");
  return m[1];
}

/** Returns RequestInit with the admin session_token Cookie appended. */
export function withAuth(
  session_token: string,
  extra: RequestInit = {},
): RequestInit {
  return {
    ...extra,
    headers: {
      ...(extra.headers as Record<string, string> | undefined),
      Cookie: `session_token=${session_token}`,
    },
  };
}

/** Returns RequestInit for a JSON request (method + Content-Type + body). */
export function jsonInit(
  method: string,
  body: unknown,
  extra: RequestInit = {},
): RequestInit {
  return {
    ...extra,
    method,
    headers: {
      "Content-Type": "application/json",
      ...(extra.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify(body),
  };
}
