/// <reference types="@cloudflare/vitest-pool-workers/types" />
/// <reference path="../src/env.d.ts" />

// Extend Cloudflare.Env with the test-only binding injected by vitest.config.ts.
// This eliminates the type cast in apply-migrations.ts and makes renaming the
// binding key a compile error instead of a silent runtime undefined.
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import("@cloudflare/vitest-pool-workers").D1Migration[];
  }
}
