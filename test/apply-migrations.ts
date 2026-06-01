/**
 * Vitest setup file for the "workers" project.
 * Applies Drizzle migrations to the in-memory D1 database before each test file.
 * Runs inside the Cloudflare Workers runtime (Miniflare) via vitest-pool-workers.
 *
 * env.TEST_MIGRATIONS is injected by vitest.config.ts via miniflare.bindings and
 * typed in test/env.d.ts (Cloudflare.Env augmentation) — no cast needed here.
 */
/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll } from "vitest";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
