# Developer Documentation

Internal engineering docs — architecture, auth design, deploy runbooks, monorepo
operations. Not part of any public-facing site: this directory is kept separate
from a planned GitHub Pages deployment (product/marketing content will live
elsewhere, e.g. `site/` or a dedicated branch, decided later).

## Structure

- `reference/` — confirmed, currently-accurate specs. Treat as source of truth;
  keep in sync with the code (see `.claude/agents/doc-sync-auditor.md`).
- `proposals/` — in-progress or under-discussion design docs. Not yet
  implemented, or implemented but not finalized. Move a proposal to
  `reference/` once its design is confirmed and the code matches it.

## Adding a proposal

Name the file `<topic>.md` and add a short header noting its status, e.g.:

```markdown
# <Title>

**Status:** draft — under discussion as of <date>
```

Once accepted and implemented, `git mv` it into `reference/` and drop the
status line (reference docs are assumed current).
