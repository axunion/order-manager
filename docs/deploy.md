# Deployment

All four apps deploy to Cloudflare Workers with `wrangler deploy`. Deployment is
**manual** for now — CI (`.github/workflows/ci.yml`) runs `pnpm check` / `test` /
`build` only and does not deploy.

## One-time setup

1. Authenticate: `wrangler login` (or set `CLOUDFLARE_API_TOKEN`).
2. Create the production D1 database:

   ```sh
   wrangler d1 create order-manager
   ```

   Copy the returned `database_id` into `apps/api/wrangler.jsonc`
   (`d1_databases[0].database_id` — currently a placeholder UUID).
3. Set production values in `apps/api/wrangler.jsonc` `vars`:
   - `ADMIN_ORIGIN` / `ORDER_ORIGIN` / `SIGNUP_ORIGIN` — the deployed SPA URLs
     (currently localhost placeholders).
   - `COOKIE_DOMAIN` — e.g. `.example.com` for cross-subdomain cookie sharing.
   - `ENVIRONMENT` — must stay `"production"` (gates dev-only auth conveniences,
     see [auth.md](./auth.md)).
4. Set secrets (never put these in `wrangler.jsonc`):

   ```sh
   wrangler secret put RESEND_API_KEY   # run inside apps/api
   wrangler secret put MAIL_FROM
   ```

## Deploying

```sh
# 1. Apply pending migrations to production D1 (from apps/api)
pnpm --filter @order/api exec wrangler d1 migrations apply order-manager --remote

# 2. Deploy the API
pnpm --filter @order/api exec wrangler deploy

# 3. Build and deploy each SPA
#    VITE_API_BASE must point at the deployed API origin at build time.
#    @order/admin additionally needs VITE_ORDER_BASE — it is baked into seat QR codes.
VITE_API_BASE=https://api.example.com VITE_ORDER_BASE=https://order.example.com \
  pnpm --filter @order/admin build
pnpm --filter @order/admin exec wrangler deploy
# repeat for @order/order and @order/signup (VITE_API_BASE only)
```

Apply migrations before deploying API code that depends on them.

## Rules

- Never run `wrangler d1 migrations apply --remote` against production while
  untested migrations exist locally — CI must be green on the commit you deploy.
- Local D1 state is separate (`apps/api/.wrangler/state/`); `pnpm db:migrate` /
  `db:reset` only ever touch local state.
