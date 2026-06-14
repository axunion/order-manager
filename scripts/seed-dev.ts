/**
 * Local development seed script.
 *
 * Inserts a pre-activated store and a long-lived session into the local D1
 * database so developers can access /admin without going through the Magic Link
 * email flow.
 *
 * NEVER run against the production database.
 * The script exits immediately if NODE_ENV is "production".
 *
 * Usage:
 *   pnpm seed:dev
 *
 * After running, copy the printed session_token and set it as a browser cookie:
 *   DevTools → Application → Cookies → Name: session_token, Value: <token>, Path: /
 * Or paste the printed JS snippet into the browser console.
 */

import { execSync } from "node:child_process";

const NODE_ENV = process.env.NODE_ENV ?? "development";
if (NODE_ENV === "production") {
  console.error(
    "[seed-dev] Refusing to run in production environment. Aborting.",
  );
  process.exit(1);
}

const now = Date.now();
const storeId = crypto.randomUUID();
const sessionId = crypto.randomUUID();
const sessionToken = crypto.randomUUID();

// 365 days in ms
const SESSION_EXPIRES = now + 365 * 24 * 60 * 60 * 1000;

const sql = `
DELETE FROM sessions WHERE store_id IN (SELECT id FROM stores WHERE slug = 'dev-store');
DELETE FROM magic_link_tokens WHERE store_id IN (SELECT id FROM stores WHERE slug = 'dev-store');
DELETE FROM stores WHERE slug = 'dev-store';

INSERT INTO stores (id, name, slug, email, status, activated_at, created_at)
VALUES (
  '${storeId}',
  '開発用テスト店舗',
  'dev-store',
  'dev@localhost',
  'active',
  ${now},
  ${now}
);

INSERT INTO sessions (id, store_id, session_token, expires_at, created_at)
VALUES (
  '${sessionId}',
  '${storeId}',
  '${sessionToken}',
  ${SESSION_EXPIRES},
  ${now}
);
`.trim();

try {
  execSync(
    `wrangler d1 execute order-manager --local --command "${sql.replace(/\n/g, " ").replace(/"/g, '\\"')}"`,
    { stdio: "pipe" },
  );
} catch (err) {
  console.error("[seed-dev] Failed to execute SQL:", err);
  process.exit(1);
}

console.log("");
console.log("✓ Seeded: dev@localhost (dev-store)");
console.log(`  store_id:      ${storeId}`);
console.log(`  session_token: ${sessionToken}`);
console.log("");
console.log("Set the session cookie in your browser:");
console.log(
  `  DevTools → Application → Cookies → Name: session_token, Value: ${sessionToken}, Path: /`,
);
console.log("");
console.log("Or paste this into the browser console:");
console.log(
  `  document.cookie = 'session_token=${sessionToken}; path=/; max-age=${365 * 24 * 3600}';`,
);
console.log("");
