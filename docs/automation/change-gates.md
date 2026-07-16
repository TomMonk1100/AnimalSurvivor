# Change-gate routing

`npm run verify:changed` chooses a conservative local verification plan from
the paths that changed. It is a routing tool, not a release declaration. The
frozen source of truth is the
[Agent Harness contract](agent-harness-contract.md); this guide explains how to
apply it consistently.

## Command interface

Use repository-relative paths for a reproducible plan:

```bash
npm run verify:changed -- --files packages/sim/src/simulation.ts --dry-run
```

The stable interface is:

```text
npm run verify:changed -- [--files <comma-separated-repo-relative-paths> | --base <git-ref>] [--dry-run] [--json]
```

- With no selector, the command derives changed paths from Git.
- `--files` is best for task packets and fixture tests. It is mutually exclusive
  with `--base`.
- `--base <ref>` compares the merge-base diff for developer convenience.
- `--dry-run` reports the selected plan without running commands.
- `--json` emits one machine-readable report; normal mode is human-readable.

The selected bounded gates run by default. A root-tooling, mixed, or unknown
diff produces a clear recommendation to run `npm run verify:release`; it does
not silently run a smaller package subset or pretend that the release gate was
completed.

`npm run verify:agent-contracts` is a separate local check for stable harness
and architecture invariants. It accepts `--root <fixture-or-repo-root>` for
fixture coverage and `--json` for a machine-readable result.

## Routing matrix

| Changed path class | `verify:changed` selects | Also review / do next |
| --- | --- | --- |
| `packages/sim/**` | Sim typecheck, lint, test. | Review deterministic state, replay/hash, and compatibility effects. |
| `packages/trait-runtime/**` | Trait-runtime typecheck, lint, test. | Review content fingerprint, deterministic selection/state, and sim integration impact. |
| `packages/run-director/**` | Run-director typecheck, lint, test. | Review pure intents, schedule compatibility, and deterministic event ordering. |
| `apps/web-toy/src/**` or `apps/web-toy/test/**` | Web-toy typecheck, lint, test, build. | Review the simulation-to-presentation boundary; use a browser/manual check when the behavior is visible. |
| `apps/web-toy/assets/**`, `assets/**`, or VFX scripts | Web-toy typecheck, lint, test, asset check, VFX-texture check, build, artifact check. | Review provenance, payload/dimensions, fallback, reduced-quality behavior, and any required visual capture. |
| Release, asset, or content verification scripts | Web-toy typecheck, lint, test, `verify:assets`, `verify:vfx-textures`, `verify:content`, build, and artifact check. | Review command side effects and false-pass paths; run `verify:release` when the routing result recommends it. |
| `.github/**`, root `scripts/**`, any `package.json`, or lockfiles | Agent-contract check. | Treat `npm run verify:release` as required follow-up evidence for a release candidate and recommended by the router. |
| Docs-only changes | No package command. | Review factual accuracy, links, status alignment, and evidence claims. |
| Cross-package or unknown paths | Conservative combined plan plus a release recommendation. | Run `npm run verify:release` before declaring a release candidate; never infer that a partial plan covers an unknown path. |

The table is additive. A diff that changes both simulation and web presentation
must receive both relevant bounded gate sets; a change outside known paths must
not receive less validation because its owner guessed incorrectly.

The changed-path router does not automatically run `verify:served` or the
browser smoke flow. Add either deliberately when its evidence is relevant to
the task or required by the release gate; neither is a claim of human approval.

The technical browser smoke command is:

```bash
npm --prefix apps/web-toy run verify:agent-smoke
```

It builds and loopback-serves `dist`, then emits a JSON evidence report for a
seeded visible Start/Pause/Resume flow and a bounded terminal route. After the
visible WebGL proof, the terminal lane uses the existing hidden diagnostics
renderer toggle so the supported stress route can finish inside its explicit
bound; the report identifies that as non-player-visible acceleration. It does
not prove balance, fun, final visual quality, or a human playtest.

## Examples

### One simulation change

```bash
npm run verify:changed -- --files packages/sim/src/simulation.ts --dry-run
npm run verify:changed -- --files packages/sim/src/simulation.ts
```

Expect sim typecheck, lint, and test. If the change alters saved/replay-bound
behavior, add focused replay/hash or migration evidence even when the router
cannot infer it from a filename.

### Browser-only presentation change

```bash
npm run verify:changed -- --files apps/web-toy/src/presentation/example.ts --dry-run
```

Expect web-toy typecheck, lint, test, and build. Check that the feature reads
authoritative snapshots/events and note any browser observation separately from
human visual approval.

### Asset or VFX change

```bash
npm run verify:changed -- --files apps/web-toy/assets/vfx/example.png --dry-run
```

Expect the broader web-toy, asset, VFX-texture, build, and artifact plan. The
file path does not waive provenance, payload, accessibility, or current visual
review requirements.

### Mixed or root-tooling change

```bash
npm run verify:changed -- --files packages/sim/src/simulation.ts,apps/web-toy/src/main.ts,scripts/verify-release.mjs --dry-run
```

Review the union of selected package gates and follow the release recommendation.
For a release candidate, finish with:

```bash
npm run verify:release
```

### Documentation-only change

```bash
npm run verify:changed -- --files docs/status/current.md --dry-run
```

Expect no package command. Inspect the document against current code/evidence
and block any false claim of a release, human playtest, balance verdict, or
final visual approval.

## `verify:changed` versus `verify:release`

| Command | Purpose | Does not establish |
| --- | --- | --- |
| `npm run verify:changed` | Fast, path-based selection of conservative local gates for an implementation diff. | A complete release, human playtest, final art approval, or an unselected cross-package concern. |
| `npm run verify:release` | Final local deterministic, package, asset, artifact, and release verification gate. | Fun, fairness, accessibility certification, device certification, final art approval, or human-player evidence. |

Run the smallest truthful plan while implementing; run the full release gate
when releasing or when routing says the diff cannot safely be treated as a
bounded package change. Keep owner playtests and visual approval as separate
evidence in the handoff.
