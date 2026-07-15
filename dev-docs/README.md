# Developer Documentation

Internal docs — product specs, roadmap, architecture, auth design, deploy
runbooks, monorepo operations. Not part of any public-facing site: this
directory is kept separate from a planned GitHub Pages deployment
(product/marketing content will live elsewhere, e.g. `site/` or a dedicated
branch, decided later).

## Structure

- `roadmap.md` — phased product plan; the entry point for "what's next".
- `specs/` — product specs: what the product does and why. Describes
  *current, shipped behavior* plus known limitations; treat as source of
  truth alongside the code. `specs/features/` holds one spec per feature
  area.
- `reference/` — technical specs: how the system is built and operated
  (auth architecture, deploy runbook, monorepo ops, and
  `implementation-loop.md` — the per-item workflow for turning a
  proposal into shipped code). Treat as source of
  truth; keep in sync with the code (see `.claude/agents/doc-sync-auditor.md`).
- `proposals/` — in-progress or under-discussion design docs. Not yet
  implemented, or implemented but not finalized. Once shipped and
  confirmed, fold the content into the relevant `specs/` or `reference/`
  doc and delete the proposal.

The boundary between `specs/` and `reference/` is audience of the
decision: product behavior (visible to users) goes in `specs/`;
implementation and operations go in `reference/`.

To avoid the same content living in three places, each layer owns one
thing and links to the next:

- `specs/` state gaps as **facts** ("no cancellation exists") with a
  phase pointer — never solution designs.
- `roadmap.md` owns **priority and sequencing**, with one-or-two-sentence
  summaries linking to proposals — never schema/API detail.
- `proposals/` own **all design decisions** (schema, endpoints, UI,
  trade-offs). If a design choice appears anywhere else, it's a copy —
  move it here.

## Adding a proposal

Name the file `<topic>.md` and add a short header noting its status, e.g.:

```markdown
# <Title>

**Status:** draft — under discussion as of <date>
```

Once accepted and implemented, fold its content into the relevant
`specs/` or `reference/` doc and delete the proposal (those directories
are assumed current).
