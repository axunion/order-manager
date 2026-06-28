# order-manager

pnpm + Cloudflare Workers monorepo. SolidJS SPA frontends + a Hono API Worker
on D1, with shared logic in `packages/*`.

> **Sync note:** `CLAUDE.md` and `AGENTS.md` contain identical content.
> When updating one, update the other to match.

## Approach

- **Think before coding.** State assumptions; if uncertain, ask. When multiple
  interpretations exist, surface them rather than silently picking one. If a
  simpler path exists, say so and push back when warranted.
- **Simplest thing that works.** Write the minimum code that solves the stated
  problem — nothing speculative. No unasked-for abstractions, flexibility, or
  error handling for impossible cases. If 200 lines could be 50, rewrite it.
- **Surgical changes.** Every changed line should trace to the request. Don't
  refactor, reformat, or "improve" adjacent code that isn't broken; match the
  surrounding style. Remove only the imports and symbols your change orphaned;
  leave unrelated dead code alone and mention it.
- **Goal-driven.** Turn each task into a verifiable outcome ("fix the bug" →
  "write a failing test that reproduces it, then make it pass"). For multi-step
  work, state a brief plan with a verification check per step, then loop until it
  passes.

## Tooling

- **Linting/formatting:** Biome only — no ESLint, no Prettier.
- **Pre-commit hooks:** lefthook runs `biome check --write` + `pnpm test` on
  staged files. Do not bypass (`--no-verify`).
- **TypeScript:** every workspace extends `tsconfig.base.json` (strict,
  `noUncheckedIndexedAccess`, `verbatimModuleSyntax`). Use `@order/*` path
  aliases for cross-package imports.
- **Testing runtime split:** `apps/api` tests run on the Workers runtime via
  `@cloudflare/vitest-pool-workers` (D1 migrations applied in setup). Frontend
  apps use vitest + `happy-dom`.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm check` | Biome lint/format check **and** `tsc --noEmit` across all workspaces |
| `pnpm fix` | Biome auto-fix (`biome check --write`) |
| `pnpm test` | All workspace tests (`pnpm -r test`) |
| `pnpm build` | `pnpm -r build` |
| `pnpm dev:api` | Wrangler dev server for the API |
| `pnpm dev:admin` / `dev:order` / `dev:signup` | Vite dev server for each SPA |
| `pnpm db:generate` | Drizzle: generate migrations from schema |
| `pnpm db:migrate` | Apply migrations to local D1 |
| `pnpm db:reset` | Wipe + re-apply local D1 migrations |
| `pnpm db:rebuild` | `db:generate` + `db:reset` |
| `pnpm db:studio` | Drizzle Studio |

Run `pnpm check` before committing.

## Testing

- Write tests before or alongside implementation — they are your success
  criteria.
- Test observable outcomes and edge cases, not implementation details.
- Each test is fully self-contained; no shared mutable state between tests.

## Language

Write in **English only**: in-code comments, console output, error and log
messages, and AI-readable config files (CLAUDE.md, AGENT.md, etc.).

## Code Structure

- Name variables, functions, and files to communicate intent.
- One concern per file; split when a file exceeds ~300 lines.
- Extract a helper only when used in 3+ places; otherwise inline it.
- Delete dead code you create; never comment it out.

## Commits

Format:

```
<one-line summary>

<Why: one sentence — motivation or problem>

- <change 1>
- <change 2>
```

- Summary: imperative mood, ≤70 chars, no trailing period, no prefix tags
  (`feat:`, `fix:`, etc.).
- Why line: include only when motivation is not evident from the diff alone.
- Bullets: include only for 2+ distinct changes.
- Never commit secrets (`*.key`, `*.pem`, `credentials*`).
- Never use `--no-verify` or `--amend`; always create a new commit.

## Layout

- `apps/admin`, `apps/order`, `apps/signup` (`@order/admin`, `@order/order`,
  `@order/signup`) — SolidJS + Vite SPAs, deployed as Cloudflare static-asset
  Workers.
- `apps/api` (`@order/api`) — Hono + Zod Worker, D1 binding `DB`.
- `packages/core` (`@order/core`) — shared Zod types/domain/client.
- `packages/db` (`@order/db`) — Drizzle ORM schema + migrations.
- `packages/ui` (`@order/ui`) — design tokens (CSS variables) and minimal
  primitives (Button, Field, Select, …). **Not a shared component library.**
  Each app owns its domain components; move to `@order/ui` only when 3+ apps
  need identical logic. See `apps/order/DESIGN.md § Component Ownership Policy`
  and `apps/admin/DESIGN.md § Component Ownership Policy`.
