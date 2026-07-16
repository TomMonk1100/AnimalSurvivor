# AnimalSurvivor Review Protocol

Review evidence, not intent. Start with [AGENTS.md](AGENTS.md), the assigned
task packet, current status, and the relevant decision records. Confirm the
diff stayed inside its assigned paths before evaluating implementation quality.

## Review sequence

1. **Scope and regression review.** Compare the changed paths with the task
   packet. Look for unrelated cleanup, accidental generated/lockfile changes,
   broken public behavior, missing negative cases, and a bug fix that lacks a
   regression assertion. Review existing working-tree changes separately from
   the assigned diff.
2. **Validation review.** Check the exact commands, exit status, and relevant
   output against [change-gate guidance](docs/automation/change-gates.md).
   A claimed gate without a reproducible command/result is unproven. Verify
   that a mixed or unknown change did not rely on a smaller gate set.
3. **Change-class review.** Apply the applicable rows below; a cross-package
   change receives the union of the relevant review work.
4. **Evidence-boundary review.** Confirm the handoff distinguishes automated,
   visual/manual, and human evidence. Missing human playtesting is a blocker
   only when a change falsely claims it, or when the task explicitly requires
   owner evidence.

## What to inspect by change class

| Change class | Inspect | Required evidence or escalation |
| --- | --- | --- |
| Simulation, trait runtime, or run director | Fixed-tick ownership, seeded/deterministic inputs, state reset/pooling, canonical serialization/hash, replay/config/content compatibility, and public API effects. Ensure no renderer/browser dependency crossed inward. | Relevant package typecheck, test, and lint; replay/hash or migration evidence when behavior/compatibility changes. Request a focused regression test when a prior defect was fixed. |
| Browser integration or presentation | Snapshot/event flow is read-only; interpolation, VFX, input, UI, and local preferences cannot mutate authoritative gameplay. Check error states, accessibility/reduced-quality behavior when touched, and build/artifact impact. | Web-toy typecheck, test, lint, and build. Require an appropriate browser or visual check for a player-visible change; describe it as engineering evidence only. |
| Gameplay content | Content follows the [production template](docs/release/content-production-template.md): authored behavior, deterministic targeting/timing/caps, player-facing tells/copy, version/fingerprint effects, and test coverage. | Structural/content validation plus deterministic/replay/hash and browser-presentation evidence appropriate to the change. Escalate missing compatibility or player-facing records. |
| Assets or VFX | Asset provenance/hash/ledger, dimensions/payload, visual keys/fallbacks, texture checks, quality settings, and whether the built artifact contains the intended asset. Inspect motion/flash and readability claims cautiously. | Applicable asset, VFX-texture, build, and artifact checks. Ask for current visual capture/review when that is an acceptance condition; it is not a human final-art verdict. |
| Release tooling, CI, or harness scripts | Command inputs/outputs, deterministic local behavior, no network or Git/source mutation, fixture coverage, and conservative routing. Ensure failure messages are actionable and a mixed/unknown diff cannot under-test. | Script/fixture tests, contract check, and the release recommendation required by routing. Treat a new dependency, autonomous external action, or unsafe side effect as out of scope unless explicitly approved. |
| Documentation, status, or release records | Current status and commands are accurate; links resolve; claims match evidence; historical material is labeled; owner decisions and open human evidence remain visible. | Documentation review. Do not demand package tests for a docs-only diff, but block a false release, playtest, or approval claim. |

## Determinism and presentation checkpoints

For deterministic changes, ask: what data enters the hash/replay, how is it
serialized or migrated, how are ties/randomness ordered, and how do pool/reset
paths behave? A renderer screenshot or a passing browser test is not a
substitute for that answer.

For presentation changes, ask: which authoritative snapshot/event drives the
visible behavior, and can the display fail or be disabled without changing the
run? A visually plausible change that writes gameplay truth in the browser is a
blocker.

## Review result format

Use this format so the next agent can act without reconstructing the review:

```text
Verdict: APPROVE | REQUEST CHANGES | NEEDS OWNER EVIDENCE
Scope inspected: task packet and files reviewed.
Evidence checked: commands/results and any visual/manual artifact.
Blocking findings:
- [P0/P1] path:line — concrete contract, correctness, determinism, security,
  provenance, or false-evidence issue; include the required correction.
Non-blocking suggestions:
- [P2/P3] optional improvement, follow-up, or clarity note.
Evidence boundary: what automation establishes; what visual/manual or human
evidence is still absent.
Residual risk / next action: concise handoff to the implementer or owner.
```

## Blockers versus suggestions

Use a blocker when the change violates a declared boundary, changes behavior
without the required evidence, causes a plausible regression, misstates release
or human evidence, lacks required asset provenance, or exceeds task ownership.
Use a suggestion for optional naming, refactoring, formatting, or future polish
that does not prevent the scoped outcome from being safe and truthful. Do not
turn preferences into blockers merely to expand the task.
