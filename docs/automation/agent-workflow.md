# Agent task packets and handoffs

Use this workflow to make a task resumable from repository artifacts rather
than chat history. It complements the frozen
[Agent Harness contract](agent-harness-contract.md) and the canonical
[agent guide](../../AGENTS.md).

## Copy/paste task packet

```md
# Task: <short, concrete outcome>

## Objective

<One sentence describing the user-visible or engineering result.>

## Read first

- `AGENTS.md`
- `docs/status/current.md`
- <relevant ADR, package README, production template, or prior handoff>

## Exclusive write scope

- `<path-or-directory>/...`
- `<path-or-directory>/...`

Do not edit: <shared files, neighboring ownership, generated files, lockfiles,
or any out-of-scope area>. Preserve unrelated working-tree changes.

## Contract and implementation constraints

- <deterministic/presentation/content boundary that applies>
- <public compatibility, provenance, or performance constraint>
- No implicit commit, push, merge, deployment, or dependency change.

## Acceptance evidence

- `npm run verify:changed -- --files <comma-separated-repo-relative-paths> --dry-run`
- <selected package commands, fixture tests, browser/artifact checks>
- <specific assertion or artifact the reviewer must be able to inspect>

## Evidence boundary

State what automation can establish. Name any required visual/manual or owner
playtest evidence separately; do not claim it is complete unless it occurred.

## Handoff required

Report outcome, changed files, contracts affected, exact commands/results,
unrun gates, evidence boundary, risks, and the next bounded task or owner
decision.
```

## How to use the packet

Keep one task to one outcome and give parallel agents non-overlapping write
paths. The task owner may make only the edits in its scope. If the work reveals
an essential cross-boundary change, stop at a safe checkpoint and request an
explicit scope extension from the integration owner. A follow-up that is useful
but not essential becomes a new packet.

Use `--files` for deterministic, repeatable routing in a packet. Use
`--base <git-ref>` only when the packet deliberately asks the verifier to
inspect a merge-base diff. The two options are mutually exclusive.

## Illustrative result and handoff

The following is an example format, not a claim that these placeholder files or
commands were run:

```text
Outcome: The upgrade-panel wording now explains an existing authoritative
effect without changing simulation behavior.

Scope: Completed within `apps/web-toy/src/presentation/**` and the paired
web-toy test only. No package, content catalog, asset, or lockfile changed.

Files:
- apps/web-toy/src/presentation/<panel>.ts — player-facing label only.
- apps/web-toy/test/<panel>.test.ts — regression assertion for the label.

Validation:
- npm run verify:changed -- --files apps/web-toy/src/presentation/<panel>.ts,apps/web-toy/test/<panel>.test.ts --dry-run
  Result: selected web-toy typecheck, lint, test, and build.
- cd apps/web-toy && npm run typecheck && npm test && npm run lint && npm run build
  Result: passed.

Evidence boundary:
- Automated: the label is covered and the browser package builds.
- Visual/manual: a local browser check confirmed the panel fits at the target
  viewport.
- Human: no owner playtest or final visual approval was performed or claimed.

Risks / open work: Copy clarity still needs owner feedback during the next
planned playtest; no code follow-up is required now.
Owner decision: none.
```
