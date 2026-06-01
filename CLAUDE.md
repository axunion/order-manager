# CLAUDE.md

## Development Principles

### Test-Driven Development (TDD)
- Write tests before implementation code. Follow the Red → Green → Refactor cycle.
- Place test files as `*.test.ts` / `*.test.tsx` mirroring the `src/` directory structure.
- Code is only considered complete when `pnpm test` passes.

### Consult Official Documentation
- Before introducing a new library or framework, upgrading a version, or using a non-obvious API, consult the official documentation first (use the context7 MCP).
- For significant design changes, always verify against the docs rather than relying on memory.

### Keep Documentation in Sync
- When a code or design change affects `docs/`, update the relevant documents in the same session.
- Drift between docs and code is treated as technical debt.

### Language
- Code comments, `CLAUDE.md`, `README.md`, and any other publicly referenced files must be written in **English**.
- `docs/` (internal design documents) and in-session conversations are in **Japanese**.

---

## Critical Rules

### Multi-tenant Data Isolation
- Every database query that reads or writes tenant data **must** include a `store_id` filter.
- Never fetch records by `id` alone — always also verify `store_id` matches the authenticated store.
- Violating this rule is a security bug, not a style issue.

### Extending `.claude/` Configuration
- When a rule, pattern, or workflow must be followed repeatedly throughout development, consider adding it to `.claude/` (agents, hooks, or settings) rather than relying on memory.
- This keeps guardrails enforceable and consistent across sessions.

---

## Tech Stack

Astro 6 SSR (Cloudflare Workers) / SolidJS / Hono / Drizzle ORM + Cloudflare D1 / Zod / Vitest / Biome / pnpm

See `docs/` for design details:
- [Requirements](docs/requirements.md)
- [Architecture](docs/architecture.md)
- [Data Model](docs/data-model.md)
- [Roadmap](docs/roadmap.md)
