---
name: implement-item
description: Implement one roadmap item end to end — tests, implementation, review, checks, and commits — following the project's implementation loop. Pass the proposal name as the argument (e.g. /implement-item order-cancellation). Use only when the user explicitly asks to implement a roadmap item.
disable-model-invocation: true
---

Implement a single roadmap item by running the loop defined in
`docs/reference/implementation-loop.md`. That doc is the procedure
of record — read it first and follow it exactly; this skill only
resolves the argument and states the ground rules.

## Resolve the argument

The argument names a proposal: `docs/proposals/<argument>.md`.

- No argument, or the file doesn't exist → list the files in
  `docs/proposals/` alongside the roadmap's current phase ordering
  and ask which item to implement. Do not guess.
- Proposal exists but its Status is a design sketch (not "ready for
  implementation") → stop and tell the user which open decisions must
  be resolved first (they're listed in the proposal). Never auto-promote
  a sketch.

## Ground rules

- Read the proposal, its linked spec(s), and
  `docs/reference/implementation-loop.md` before writing anything.
- Committing at each green slice is authorized as part of this skill's
  invocation — the usual "don't commit without an explicit request"
  rule is satisfied by the user invoking `/implement-item`.
- Run the loop to completion, including the Definition of Done (fold
  docs, delete the proposal, mark the roadmap). Stop early only for the
  cases the loop doc names: a design flaw in the proposal, or a
  decision reserved for the user.
