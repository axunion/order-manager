/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

// Cloudflare D1 and other bindings.
// Accessed via `import { env } from "cloudflare:workers"` in Astro endpoints (Astro v6).
// Note: Astro.locals.runtime.env was removed in Astro v6.
interface Env {
  DB: D1Database;
}

// Augment Cloudflare.Env so that `env.DB` is typed when using
// `import { env } from "cloudflare:workers"` directly in endpoints and tests.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
  }
}

// Runtime only carries cfContext in @astrojs/cloudflare v13+ — no generic parameter.
type Runtime = import("@astrojs/cloudflare").Runtime;

declare namespace App {
  interface Locals extends Runtime {
    /** Set by src/middleware.ts for all /admin/* routes after successful auth. */
    store?: import("./lib/auth").StoreSession;
  }
}
