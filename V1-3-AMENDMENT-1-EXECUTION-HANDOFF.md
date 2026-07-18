# V1.3 Plan Amendment 1 — Execution Handoff

**Date:** 2026-07-18
**Responds to:** `V1-3-PLAN-AMENDMENT-1.md`
**Status:** B2.0 accepted; B2 stopped at the amended abort condition during the opening-consistency lane

## Outcome

The amendment successfully fixes the original gate contradictions. Gates v2
now score each policy only for the behavior it exercises, treat later phases as
phase-qualified evidence, separate mobile survival from density, and aggregate
elite relief per observed event.

The separately authorized level-pressure contract change is implemented and
green. The accepted ceiling is now `maxSteps <= 6`, `softCapPerStep <= 3`, and
`hardCapPerStep <= 5`, with dedicated ceiling/above-ceiling/cap-order tests and
a real scheduler proof that the expanded values still emit at most one
discretionary spawn decision per tick. The decision is recorded in
`docs/decisions/0009-level-pressure-ceiling.md`.

B2.1 also produced the requested opening spawn/kill/XP timeline. It identifies
the remaining G2/G3 variance as collected-mote geography, not archetype draw
order: Opening contains only fodder, all runs share the initial capped waves,
and then seed-dependent kill timing changes both when the cap reopens and where
dead enemies leave motes relative to the fixed orbit. At 30 seconds, similar
kill totals can yield only 2 collected motes in one run and 7 in another.

The B2 opening lane was then exhausted across the authorized content, XP, and
policy-description surfaces. No tested matrix reached G2's required 7/9 inner
band while preserving the other constraints. Per the amendment's abort rule,
the sequence stops here. All rejected content, XP, and orbit-path experiments
were rolled back. Packets C–G were not started.

## Accepted changes

- `packages/run-director/src/validation.ts`
  - Expands only the three authorized level-pressure ceilings.
- `packages/run-director/test/level-pressure.test.ts`
  - Accepts the exact 6/3/5 ceiling.
  - Rejects 7 steps, soft increment 4, hard increment 6, and hard below soft.
  - Exercises cap resolution and proves the scheduler's one-decision-per-tick
    invariant and deterministic state hash at the new ceiling.
- `docs/decisions/0009-level-pressure-ceiling.md`
  - Records the old bounds, new bounds, rationale, and non-authorizations.
- `packages/sim/src/pressure-lab.ts`
  - Implements G1, G2, G3, G4a, G4b, G5, and G6 matrix semantics from the
    amendment.
  - Adds same-tick modal counts, boss-entrance survival, and per-second Opening
    spawn/kill/pickup/level timelines.
  - Records the exact fixed orbit period and starting offset in each report.
- `packages/sim/test/pressure-lab.test.ts`
  - Keeps deterministic report/hash evidence and explicit current-reality
    fixtures aligned with Gates v2.
- `scripts/report-pressure.mjs`
  - Adds `--opening-diagnosis` and compact Gates v2 summaries.

## Gates v2 baseline

This is the final unchanged-content matrix after rejected tuning was removed.

| Gate | Result | Status |
| --- | --- | --- |
| G1 stationary fatality | 9/9 within 3,900–7,200; median 5,486 | Pass |
| G2 first choice | 3/9 inner; 7/9 outer | Fail |
| G3 breathing room | 6/9 median; 7/9 same-tick bound | Fail |
| G4a proximity | Opening 8.804 (18), Pressure 13.508 (18), Adaptation 16.141 (12), Mutation 21.087 (10) | Fail Adaptation/Mutation |
| G4b mobile survival | 9/9 through 2:15; 9/9 at boss; all phases scoreable | Pass |
| G5 camera occupancy | 18/18 mobile runs | Pass |
| G6 elite relief | 10/45 events, 22.2% | Diagnostic fail; gating belongs after C |

Reproduce:

```bash
node scripts/report-pressure.mjs --matrix --summary
node scripts/report-pressure.mjs --opening-diagnosis
```

## Opening-lane iterations

| Iteration | Change | Result | Disposition |
| --- | --- | --- | --- |
| V2 baseline | Production content and XP | G2 3/9 inner, 7/9 outer | Reference |
| O1 | Opening cap 16/24; fodder distance 16–20 | Outer 9/9, but inner 1/9; G1 8/9 with an 18.7s Gracie death | Rejected |
| O2 | Cap 16/24; restore distance 20–24 | G1 pass; G2 2/9 inner, 7/9 outer | Rejected |
| O3 | Cap 14/22; distance 18–22 | G2 outer 9/9 and G3 6/9, but G1 7/9 and G2 inner 1/9 | Rejected |
| O4 | Production cap 12/20; distance 16–20 | G1 pass; first-choice seed variance narrows, but G2 inner remains 0/9 | Diagnostic base only |
| O5 | O4 plus XP `[6,18,36,60,90,126,168,216,270,330]` | Outer 9/9; common cluster overshoots to ~2,900–3,000; G1 8/9 | Rejected |
| O6 | First threshold 5 | Lands on the same pickup burst as 6; no useful middle | Rejected |
| O7 | Three-second orbit, threshold 4 | Best G2 trial: 5/9 inner, 9/9 outer; still below 7/9 | Rejected policy change |
| O8 | 150/210-tick orbit periods and starting offsets 1/2/4 | Multiple first choices delayed beyond three minutes or absent | Rejected |
| O9 | Ring then cluster Opening formations | Ring spreads drops out of path; cluster still produces 1/9 inner and extreme late outliers | Rejected |

The tests cover the plausible existing primitives and numeric surface. A new
authored spawn-beat type would not solve the core issue: enemies are already
present and dying; the modal variance comes from whether the movement proxy
collects their drops.

## Decision required

G2 still asks a fixed orbit path to demonstrate consistent pickup timing while
the amendment explicitly rejects pickup/XP acquisition changes. Those two
constraints cannot both be maintained at the 7/9 inner target with the tested
production content surface.

Recommended next decision: create one separate, narrow **early reward delivery
packet**. It should preserve hero defenses and damage identity while making the
first few earned fodder motes reliably reachable—for example, a bounded
simulation-authoritative opening collection assist or an authored first-choice
reward event. That is a real gameplay decision and should have replay/hash,
copy, and player-facing review rather than being hidden in director tuning.

If that packet remains rejected, revise G2 to an evidence target the current
proxy can actually measure, such as the hard 0:15–1:00 bound plus a median
band, instead of requiring 7/9 inside a narrow window.

## Validation

Passed:

```text
npm run verify:changed -- --files \
  packages/run-director/src/validation.ts,packages/run-director/test/level-pressure.test.ts,\
  docs/decisions/0009-level-pressure-ceiling.md,packages/sim/src/pressure-lab.ts,\
  packages/sim/test/pressure-lab.test.ts,scripts/report-pressure.mjs

packages/sim: typecheck, lint, 289/289 tests
packages/run-director: typecheck, lint, 77/77 tests
verify:agent-contracts: pass (139 deterministic source/test files)
Gates v2 27-run matrix: deterministic completion, values recorded above
```

Not run because B2 did not accept:

- `npm run verify:release`
- `npm --prefix apps/web-toy run verify:agent-smoke`
- formation implementation, golden rebaseline, density captures, or human
  visual/balance review

## Compact handoff

**Outcome:** Gates v2 and the authorized validation-ceiling contract are
implemented and verified; B2 stops at the amended abort condition because G2
cannot reach 7/9 within the accepted tuning surface.
**Scope:** Accepted paths are the ceiling validation/test/ADR and the pressure
lab/test/script. Rejected gameplay tuning was removed.
**Files:** six accepted implementation/evidence files plus this handoff.
**Validation:** sim 289/289, director 77/77, typecheck/lint, and agent contracts
all pass. Full release/smoke were correctly deferred.
**Evidence boundary:** deterministic engineering evidence only; no human
balance, fun, accessibility, or visual claim.
**Risks / open work:** G2, G3, G4a, and G6 remain red; C–G remain unstarted.
**Owner decision:** authorize a separately reviewed early reward-delivery
packet (recommended), or revise G2 away from the unsupported 7/9 inner band.
