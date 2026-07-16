# AnimalSurvivor Agent Guide

This is the canonical repository guide for implementation, review, and agent
handoff work. The Agent Harness contract lives in
[docs/automation/agent-harness-contract.md](docs/automation/agent-harness-contract.md);
use it for the frozen meaning of the harness rather than redefining it in a
task.

## Workspace and orientation

Work only in:

```text
/Users/adammuncie/GameDev/AnimalSurvivor
```

Do not recreate or copy work to the retired cloud-backed Documents checkout.
Before changing a file, read in this order:

1. This guide.
2. [docs/status/current.md](docs/status/current.md) for the current playable
   target, known limitations, and open human evidence.
3. The applicable task packet and its acceptance criteria. For harness work,
   read the frozen contract above and
   [docs/automation/change-gates.md](docs/automation/change-gates.md).
4. The relevant architecture decision under `docs/decisions/`, plus
   [docs/release/content-production-template.md](docs/release/content-production-template.md)
   for gameplay content or asset work.
5. The affected package's `README.md`, `package.json`, tests, and nearby code.
6. `git status --short --branch` to distinguish your scope from existing work.

`AnimalSurvivor-HANDOFF.md` and `PROJECT-HANDOFF.md` are useful broad
orientation. If either conflicts with current status, follow
`docs/status/current.md` and the relevant accepted decision.

## Package map

| Area | Responsibility | Primary validation |
| --- | --- | --- |
| `packages/sim/` | Production fixed-tick deterministic simulation, replay, canonical hash, and gameplay state. | `npm run typecheck`, `npm test`, `npm run lint` in that package. |
| `packages/trait-runtime/` | Renderer-independent traits, upgrades, evolution, and content fingerprints. | Its typecheck, test, and lint commands. |
| `packages/run-director/` | Renderer-independent encounter schedule and pure director intents. | Its typecheck, test, and lint commands. |
| `apps/web-toy/` | PlayCanvas/Vite browser integration, presentation, local input/profile surfaces, assets, and built-artifact checks. | Typecheck, test, lint, build, and applicable asset/artifact checks. |
| `scripts/` and root `package.json` | Local release and agent-harness tooling; never a gameplay authority. | Agent-contract checks and the appropriate release evidence. |
| `docs/` | Current status, decisions, production records, verification evidence, and handoffs. | Evidence-based documentation review. |

## Non-negotiable boundaries

- `packages/sim` is the production deterministic simulation. Keep it
  renderer- and browser-independent. Do not introduce browser APIs, frame-time
  state, unseeded randomness, or presentation-owned gameplay inputs.
- Trait runtime and run director behavior must remain deterministic and
  renderer-independent. Compatibility-affecting gameplay/content changes need
  the appropriate deterministic tests and replay/hash evidence.
- `apps/web-toy` presentation reads authoritative simulation snapshots and
  events. It may interpolate, animate, render, and hold browser preferences;
  it must not become a second source of combat, movement, reward, targeting,
  or replay truth.
- New or changed gameplay content follows the
  [production template](docs/release/content-production-template.md): authored
  behavior, player-facing copy/tells, state/hash and replay compatibility,
  validation, performance, and asset provenance belong in one reviewable
  packet.
- Reuse existing gates before inventing a new one. New harness guards must be
  local, deterministic, dependency-light, and covered by fixtures or tests.
- No task may imply a paid runtime AI service, autonomous merge/push/deploy, or
  a new gameplay authority without an explicit decision and scoped approval.

## Scope, ownership, and task packets

Each task starts with one bounded objective, exclusive write paths, explicit
acceptance gates, and a handoff requirement. Use the copy/paste format in
[docs/automation/agent-workflow.md](docs/automation/agent-workflow.md).

- Change only the paths assigned to the task. If a necessary edit crosses an
  ownership boundary, report it to the integration owner and wait for a scoped
  assignment; do not silently widen the diff.
- Preserve unrelated working-tree changes. Do not reformat, regenerate, update
  dependencies/lockfiles, or clean up nearby code merely because it is there.
- A task packet must explicitly authorize Git-state actions. Never assume a
  commit, push, merge, issue, or deployment is part of implementation.
- Keep an implementation task focused on one outcome. A discovered follow-up
  becomes a separate task packet unless it is required to make the declared
  change safe and within scope.

## Choosing validation

Use the path-based guidance in
[docs/automation/change-gates.md](docs/automation/change-gates.md). For a
repeatable planned file list, begin with a dry run such as:

```bash
npm run verify:changed -- --files packages/sim/src/simulation.ts --dry-run
```

`verify:changed` selects and runs the conservative bounded package gates for a
diff. It can also inspect a Git base with `--base <ref>`; `--files` and `--base`
are mutually exclusive. For a release candidate, mixed/unknown diff, or when
the command recommends it, run the final local gate:

```bash
npm run verify:release
```

`verify:changed` is a fast routing aid; it never replaces `verify:release`.
Docs-only work normally needs no package command, but it still needs accurate,
current, evidence-based review.

When a task needs a real built-browser integration check, run:

```bash
npm --prefix apps/web-toy run verify:agent-smoke
```

It builds and loopback-serves the artifact, then emits JSON evidence for a
seeded visible Start/Pause/Resume flow and a bounded terminal route. The
terminal lane uses the existing hidden diagnostics renderer toggle after the
visible WebGL proof so it can finish inside its declared bound; the JSON labels
that non-player-visible acceleration explicitly. It is technical browser
evidence only, not a balance, visual-approval, or human-playtest claim.

## Evidence and handoff

Automated tests, replay/hash parity, artifact checks, and browser smoke checks
are engineering evidence. They do **not** establish fun, fairness, accessibility
compliance, device certification, final art approval, or a human playtest. Do
not label synthetic/automated feedback as player feedback. Record missing human
or visual evidence plainly.

Finish every task with this compact handoff:

```text
Outcome: what is now true, without overstating evidence.
Scope: objective and exclusive paths honored.
Files: changed files and the contract/behavior each affects.
Validation: exact commands, pass/fail result, and any unrun required gate.
Evidence boundary: automated, visual/manual, and human evidence kept separate.
Risks / open work: known limitation, blocked dependency, or follow-up packet.
Owner decision: only if a real choice is needed; otherwise “none”.
```
