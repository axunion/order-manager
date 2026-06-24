# Monorepo Operations

## Package naming convention

All workspace packages use the `@order/` scope:

| Directory | Package name |
|---|---|
| `apps/admin` | `@order/admin` |
| `apps/order` | `@order/order` |
| `apps/signup` | `@order/signup` |
| `apps/api` | `@order/api` |
| `packages/db` | `@order/db` |
| `packages/core` | `@order/core` |
| `packages/ui` | `@order/ui` |

All packages are `"private": true` — nothing is published to npm.

---

## Running commands

### Targeting a single package

```sh
pnpm --filter @order/admin dev
pnpm --filter @order/api test
pnpm --filter @order/db db:generate
```

### Running across all packages

```sh
pnpm -r build     # build every app/package
pnpm -r test      # test everything
pnpm -r exec tsc --noEmit   # type-check everything
```

### Root convenience scripts

See the root `package.json` for shortcuts — `pnpm dev:admin`, `pnpm db:generate`, etc.

---

## Adding a dependency

Always add dependencies to the specific package that uses them, not to the root:

```sh
# Add a runtime dep to the api app
pnpm --filter @order/api add hono

# Add a dev dep to the admin app
pnpm --filter @order/admin add -D @types/some-lib

# Add a shared tool to the root workspace
pnpm add -D -w some-tool
```

Root devDependencies (`-w`) are for tools that operate on the entire repo: `biome`, `lefthook`, `typescript`.

---

## Adding an internal workspace dependency

Use the `workspace:*` protocol so pnpm links the local package:

```json
{
  "dependencies": {
    "@order/core": "workspace:*"
  }
}
```

Then run `pnpm install` to create the symlink.

---

## Adding a new app or package

1. Create the directory under `apps/` or `packages/`.
2. Add a `package.json` with `"name": "@order/<name>"` and `"private": true`.
3. Run `pnpm install` — pnpm will discover it automatically from `pnpm-workspace.yaml`.
4. Update the root `tsconfig.json` paths if the package exports types consumed by other packages.

---

## Dependency boundary enforcement

Currently enforced by convention and code review. Planned: add a lint rule (e.g. `eslint-plugin-boundaries`
or a custom biome plugin) to fail CI when a forbidden cross-package import is detected.

Forbidden imports to watch for:

- `import ... from "@order/db"` inside any `apps/admin`, `apps/order`, or `apps/signup` file
- `import ... from "@order/ui"` inside any `apps/api` file
- `import ... from "@order/core/client"` inside any `apps/api` file

---

## Local D1 state

The local Cloudflare D1 database state is stored at `apps/api/.wrangler/state/v3/d1/`.
Reset it with:

```sh
pnpm db:reset   # wipes local D1 and re-applies all migrations
```

The `.wrangler/` directory is gitignored.
