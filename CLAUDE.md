# CLAUDE.md

## Language
- Code comments, `CLAUDE.md`, `README.md`, and all AI-readable config files must be written in **English**.
- `docs/` (internal design documents) and in-session conversations are in **Japanese**.

---

## Code & File Structure
- Keep code simple, efficient, and clean — prefer clarity over cleverness.
- Minimize file count; avoid unnecessary abstraction layers.
- One concern per file; keep files focused and small (~300 lines max).
- Delete dead code rather than commenting it out.

---

## Test-Driven Development
- Write tests before implementation. Follow Red → Green → Refactor.
- Place test files as `*.test.ts` / `*.test.tsx` mirroring `src/`.
- Tests must cover intended behavior, not just pass. Keep tests independent from each other.
- Code is complete only when `pnpm test` passes.

---

## Documentation
- Before introducing a new library, upgrading a version, or using a non-obvious API, consult official docs first (use the context7 MCP).
- When a code or design change affects `docs/`, update the relevant documents in the same session.
- Drift between docs and code is treated as technical debt.

---

## Critical Rules

### Committing
- **Never create a git commit unless the user explicitly requests it.**
- Finish all implementation, tests (`pnpm test`), and lint (`pnpm check`) first, then wait for an explicit commit request.
- Never use `--no-verify` or `--amend`. Always create a new commit.
- Never commit secrets (`*.key`, `*.pem`, `credentials*`).
- Stage explicit paths only — never `git add -A` or `git add .`.

Commit message format:
```
<one-line summary>

<Why: one sentence — motivation or problem>

- <change 1>
- <change 2>
```
- Summary: imperative mood, ≤70 chars, no trailing period, no prefix tags (`feat:`, `fix:`, etc.).
- Why line: required only when reason is non-obvious. Skip for trivial changes.
- Bullets: only for 2+ distinct changes.

### Deployment
- **Never deploy to production from a local machine.**
- Local commands may only start or update the local dev server.
- All production deploys must go through **GitHub Actions** to prevent accidental updates and ensure an audited release process.

### Multi-tenant Data Isolation
- Every database query that reads or writes tenant data **must** include a `store_id` filter.
- Never fetch records by `id` alone — always verify `store_id` matches the authenticated store.
- Violating this rule is a security bug, not a style issue.
- Every new tenant-scoped endpoint **must** include a cross-tenant isolation test: verify that
  accessing another store's resource by `id` returns 404 (not 403, not the resource).
  See `src/lib/api/seats.test.ts` for the canonical pattern.

### File Sync
- `CLAUDE.md` and `AGENT.md` at the project root must always have identical content (title line only differs).
- Whenever either file is modified, update the other in the same operation.

### Extending `.claude/` Configuration
- When a rule, pattern, or workflow must be followed repeatedly, add it to `.claude/` (agents, hooks, or settings) rather than relying on memory.
- This keeps guardrails enforceable and consistent across sessions.
- Available automations in `.claude/`:
  - **Agents**: `tenant-security-reviewer` (multi-tenant isolation audit), `doc-sync-auditor` (docs drift check)
  - **Skills**: `/db-migration` (safe migration workflow), `/new-api-endpoint` (secure endpoint scaffold)
  - **Hooks**: secret file write blocker (PreToolUse), CLAUDE/AGENT sync reminder (PostToolUse)

---

## Tech Stack

Astro 6 SSR (Cloudflare Workers) / SolidJS / Hono / Drizzle ORM + Cloudflare D1 / Zod / Vitest / Biome / pnpm

See `docs/` for design details:
- [Requirements](docs/requirements.md)
- [Architecture](docs/architecture.md)
- [Data Model](docs/data-model.md)
- [Roadmap](docs/roadmap.md)
