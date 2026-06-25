/// <reference types="@cloudflare/workers-types" />

// Global Env type for the API Worker.
// Bindings are resolved from wrangler.jsonc; secrets from .dev.vars (local) or
// Cloudflare dashboard (production).
interface Env {
  DB: D1Database;
  /** Origin of the admin SPA, e.g. "https://admin.example.com" */
  ADMIN_ORIGIN: string;
  /** Origin of the customer order SPA, e.g. "https://order.example.com" */
  ORDER_ORIGIN: string;
  /** Origin of the store signup SPA, e.g. "https://signup.example.com" */
  SIGNUP_ORIGIN: string;
  /**
   * Parent domain for cross-subdomain cookie sharing, e.g. ".example.com".
   * Leave empty in local dev so the cookie is scoped to localhost only.
   */
  COOKIE_DOMAIN: string;
  /** Resend API key for Magic Link email delivery. Omit in local dev → console fallback. */
  RESEND_API_KEY: string;
  /** Sender address used in outgoing emails. */
  MAIL_FROM: string;
}

// Augment Cloudflare.Env for `import { env } from "cloudflare:workers"` in tests.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ADMIN_ORIGIN: string;
    ORDER_ORIGIN: string;
    SIGNUP_ORIGIN: string;
    COOKIE_DOMAIN: string;
    RESEND_API_KEY: string;
    MAIL_FROM: string;
  }
}
