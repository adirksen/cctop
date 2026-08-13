# claudetui — project conventions

This file captures project-specific instructions that the assistant should
follow on every change in this repo. It is loaded into Claude Code's context
automatically.

## Parallelize by default

This project prefers fan-out. Treat serial execution as the exception that
needs a justification (a real data dependency, shared mutable state), not
the default.

**Rule:** whenever work decomposes into independent pieces — research,
exploration, code review, or implementation — dispatch parallel subagents
rather than working through the pieces sequentially in the main session.

- **Research and review:** fan out freely. Multi-file investigations,
  "find all callers of X", reviewing a diff from several angles — each
  independent question goes to its own agent, launched together in a
  single message so they run concurrently.
- **Implementation:** independent implementation tasks are dispatched to
  subagents (see the `subagent-driven-development` skill). When two or
  more agents will edit code concurrently, **worktree isolation is the
  default** — each agent gets its own git worktree. Same-tree parallel
  edits are allowed only when the touched files provably don't overlap.
- **Tool calls:** independent tool calls are batched into one message,
  never issued one-per-turn.
- **Plans:** any multi-step plan must explicitly separate the sequential
  spine from the parallelizable work (see "Always provide implementation
  guidance" below). A plan that serializes independent work is wrong.

## TDD is mandatory

Behavior changes and bugfixes follow red–green–refactor: write the failing
test, watch it fail for the right reason, then write the minimal code to
pass. No production code without a failing test first.

- Tests are Vitest, colocated as `src/**/*.test.ts`.
- Before any commit or PR: `npm test` and `npm run typecheck` must both
  pass. For changes near the build boundary (entrypoint, esbuild config),
  also run `npm run build`.
- Bugfixes get a regression test that reproduces the bug before the fix —
  plus a guard test pinning the neighboring behavior that must *not*
  change, when the fix narrows a condition.

## Keep the README current

The README is claudetui's user guide. **When a change alters the visible UI,
update the matching README section in the same PR.**

### What counts as UI-visible

- A new, removed, or rebound key (`src/ui/keybindings.ts`, or bindings in
  `src/app.ts`) → update the **Keybindings** table.
- A panel added, removed, or changed in what it displays
  (`src/ui/panels/`, `src/ui/layout.ts`) → update **What each panel tells
  you**.
- A new or changed drill-down view (`src/ui/views/`) → update the relevant
  panel/keybinding copy.
- Closing a known limitation → remove the bullet from **Known
  limitations**.

### What does not require a README update

- Internal changes with no visible effect: refactors, cache/perf work,
  test additions, dependency bumps, build/CI changes.
- Cost-math internals. Updating **How the numbers are calculated** is
  encouraged when the estimation model changes, but it is a judgment
  call, not a same-PR obligation.

## Tracking work

claudetui slices tracked work in the same strict four-level hierarchy as its
sibling projects. Use this vocabulary when classifying, planning, or
referencing any body of work.

- **Initiative** — top-level theme spanning multiple phases.
- **Phase** — a coherent slice of an initiative implementing a group of
  related epics in dependency order.
- **Epic** — a single named feature requiring multiple PRs.
- **Issue** — a unit of work. **One issue per PR wherever possible**; if a
  body of work needs to span PRs under a single issue, consult before
  diverging.

The hierarchy is reified on GitHub via three labels: `initiative`,
`phase`, `epic`. Plain implementation issues carry no hierarchy label.
(Create a label the first time it's needed — the repo starts without
them.) File an issue before starting non-trivial work.

### Always provide implementation guidance

When proposing a plan, an epic decomposition, or any multi-PR effort,
include all three of:

1. **Inter-dependencies** — which units of work block which others, and why.
2. **Suggested implementation order** — the sequence that respects the
   dependencies.
3. **Parallelizable work** — explicit call-out of which PRs can land
   concurrently without merge or runtime conflict, and which of them
   should be dispatched to parallel subagents in isolated worktrees.

A plan that omits these forces the user to redo the sequencing work.

## Repository conventions (quick reference)

- **Package manager:** npm; single package, no workspaces. Node >= 20.
- **Stack:** TypeScript (ESM, strict), blessed / blessed-contrib TUI.
  Entrypoint in `bin/`; bundled with esbuild via `npm run build`.
- **Layout:** `src/data/` (raw readers), `src/aggregators/` (derived
  stats), `src/ui/` (layout, panels, views, keybindings), `src/util/`
  (parsing/formatting helpers). Model pricing lives in `src/config.ts`.
- **Branching:** one feature branch per PR; target `master`. Branch names
  include the issue number: `<type>/#<issue>/<short-slug>` — e.g.
  `feat/#3/pricing-fetcher`, `fix/#7/panel-flicker`. The leading `<type>`
  matches the commit prefix (`feat`, `fix`, `chore`, `docs`, `perf`,
  `refactor`, `test`). For work that genuinely has no tracking issue, use
  `<type>/<short-slug>` and call it out in the PR.
- **Commits:** a subject line plus a body explaining each distinct change
  — not one-liners.
- **Post-merge cleanup:** when the user confirms a PR is merged, switch
  back to `master`, `git pull`, and delete the local feature branch
  (`git branch -d <branch>`). Don't leave stale merged branches around.
- **Assistant credit (commits and PR bodies):** when the assistant
  authors a commit or drafts a pull-request body, both end with a
  `Co-Authored-By` trailer that names the model doing the work, e.g.:

  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  ```

  That trailer is the only credit — no marketing taglines such as
  `🤖 Generated with [Claude Code](...)` in commits or PR bodies.
- **Verification before "done":** `npm test` and `npm run typecheck`
  green, README updated if the change was UI-visible, and the evidence
  (test output) cited — never claim success without having run the
  commands.
