# order-manager

pnpm + Cloudflare Workers monorepo. SolidJS SPA frontends + a Hono API Worker
on D1, with shared logic in `packages/*`.

Bias toward caution over speed; on trivial tasks, use judgment.

## Approach

- **Think before coding.** State assumptions. Make routine judgment calls yourself and
  note them; ask only when different interpretations would lead to materially different
  work. If a simpler path exists, say so and push back when warranted.
- **Simplest thing that works.** Write the minimum code that solves the stated problem —
  nothing speculative. No unasked-for abstractions, flexibility, or error handling for
  impossible cases. If 200 lines could be 50, rewrite it.
- **Surgical changes.** Every changed line should trace to the request. Don't refactor,
  reformat, or "improve" adjacent code that isn't broken; match the surrounding style.
  Remove only the imports and symbols your change orphaned; leave unrelated dead code alone
  and mention it.
- **Goal-driven.** Turn each task into a verifiable outcome ("fix the bug" → "write a
  failing test that reproduces it, then make it pass"). For multi-step work, state a brief
  plan before starting.

## Tooling

- **Linting/formatting:** Biome only — no ESLint, no Prettier.
- **Pre-commit hooks:** lefthook runs `biome check --write` on staged files and
  the full `pnpm test`. Do not bypass (`--no-verify`).
- **Dependencies:** shared library versions are pinned once in the
  `pnpm-workspace.yaml` catalog; workspace `package.json` files reference them
  as `"catalog:"`. Add new shared deps to the catalog, not per-workspace.
- **CI/deploy:** GitHub Actions (`.github/workflows/ci.yml`) runs
  `check`/`test`/`build` on pushes and PRs. Deployment is manual — see
  `dev-docs/reference/deploy.md`.
- **TypeScript:** every workspace extends `tsconfig.base.json` (strict,
  `noUncheckedIndexedAccess`, `verbatimModuleSyntax`). Use `@order/*` path
  aliases for cross-package imports.
- **Testing runtime split:** `apps/api` tests run on the Workers runtime via
  `@cloudflare/vitest-pool-workers` (D1 migrations applied in setup). Frontend
  apps use vitest + `happy-dom`.

Run `pnpm check` before committing.

## Testing

- Write tests before or alongside implementation — they are your success
  criteria.
- Test observable outcomes and edge cases, not implementation details.
- Each test is fully self-contained; no shared mutable state between tests.

## Language

Write everything in **English** — in-code comments, console output, error and log
messages, AI-readable instruction files, and docs meant for readers (README and the
like). This rule applies to artifacts, not conversation: chat replies and
development-time planning notes follow the language the user is working in.

## Code Structure

- Name variables, functions, and files to communicate intent.
- One concern per file; split new code when a file exceeds ~300 lines. Don't split
  existing files unless asked.
- Extract a helper only when used in 3+ places; otherwise inline it.
- Delete dead code you create; never comment it out.

## Commits

Format — plain prose, no prefixes or labels (`feat:`, `fix:`, and the like):

```
<summary: imperative mood, ≤70 chars, no trailing period>

<motivation: one sentence, only when not evident from the diff>

- <change bullets: only for 2+ distinct changes>
```

- Never commit secrets (`*.key`, `*.pem`, `credentials*`).
- Never use `--no-verify`. Use `--amend` only when explicitly asked; default to a new
  commit.

## Layout

- `packages/ui` (`@order/ui`) — design tokens (CSS variables) and minimal
  primitives (Button, Field, Select, …). **Not a shared component library.**
  Each app owns its domain components; move to `@order/ui` only when 3+ apps
  need identical logic. See `apps/order/DESIGN.md § Component Ownership Policy`
  and `apps/admin/DESIGN.md § Component Ownership Policy`.
- `dev-docs/` — internal docs, kept separate from any future public GitHub
  Pages site. `roadmap.md` is the phased product plan; `specs/` holds product
  specs (shipped behavior + known limitations); `reference/` holds technical
  specs (auth, deploy, monorepo ops); `proposals/` holds
  in-progress/under-discussion designs. See `dev-docs/README.md`.
