# V1.3 Pressure, Tempo, and Swarm — Execution Handoff

**Date:** 2026-07-17
**Audience:** project owner and design consultant
**Source plan:** `V1-3-PRESSURE-TEMPO-SWARM-PLAN.md`
**Status:** stopped at the plan's Packet B abort condition; no rejected balance tuning remains in the working tree

## Executive assessment

Packet A is complete: the project now has a deterministic, production-composed pressure lab that measures all three heroes, three fixed seeds, and three input policies. It reports death timing, level timing, per-second density, proximity, camera occupancy, elite relief, boss health, kills, high-water count, and final state hash. Repeating the same run produces byte-identical output.

Packet B cannot honestly meet its stated acceptance criteria by tuning the authorized global director and XP values. The starting H1 matrix made the opening dramatically worse, including a stationary Gracie death at tick 1,122 (18.7 seconds). Two fallback matrices improved individual gates but exposed strong non-monotonic seed and hero effects. The best unchanged-content matrix still passes only G1 7/9, G2 6/18, G3 7/18, G4 2/18, G5 18/18, and G6 0/18.

The plan says to stop the swarm if no honest matrix satisfies G1–G4 within the performance budget. That condition is met. Packets C–G were therefore not started, goldens were not regenerated, and no balance changes were left behind merely to make the implementation appear complete.

## What was implemented

### Deterministic pressure lab

- `packages/sim/src/pressure-lab.ts`
  - Runs `stationary`, `mobile-orbit`, and boundary-aware `mobile-kite` policies.
  - Always chooses offer index zero and resolves available fusions deterministically.
  - Samples enemy pressure once per simulation second.
  - Declares its renderer-independent camera fallback as 750 world units in every report.
  - Keeps engineering evidence explicitly marked `humanEvidence: false`.
  - Makes G1 stationary-only and G2–G6 mobile-only where the stationary death target would otherwise contradict later-phase sampling.
- `packages/sim/test/pressure-lab.test.ts`
  - Proves byte-identical serialization and final hashes for repeated runs.
  - Encodes current-reality gate expectations as data, ready to flip only after an accepted tuning matrix exists.
- `scripts/report-pressure.mjs`
  - Builds and composes the production sim, run director, and trait runtime.
  - Supports one-run JSON, the full 27-run matrix, compact matrix summaries, and a failing `--verify` mode.

Reproduction commands:

```bash
node scripts/report-pressure.mjs --hero greg --seed 1234 --policy stationary
node scripts/report-pressure.mjs --matrix --summary
node scripts/report-pressure.mjs --verify --summary
```

The last command is expected to exit non-zero until the acceptance conflict below is resolved.

## Baseline evidence

Final measurements use unchanged production encounter and XP tuning, with only the new lab driving it.

| Gate | Result | Key evidence |
| --- | ---: | --- |
| G1 stationary death window | 7/9 | Greg/7 dies at tick 4,488 (74.8s); Gracie/90,210 dies at tick 6,625 (110.4s). These miss opposite ends of the same global window. |
| G2 first mobile modal | 6/18 | Observed first modal spans roughly tick 747 to 4,583, and one mobile-kite run dies without receiving one. |
| G3 mobile modal gap | 7/18 | Several runs produce same-tick or tightly clustered queued levels; other runs have gaps above 1,200 ticks. |
| G4 proximity pressure | 2/18 | Many kite runs die before later phases; surviving hero/seed combinations diverge substantially in Adaptation and Mutation density. |
| G5 camera occupancy | 18/18 | Already passes without directed formations. This disproves the plan's assumption that Packet C is required to make G5 green. |
| G6 elite relief | 0/18 | Runs may defeat fewer than six elites, and recovery-to-floor often fails even when the local pressure drop passes. |

Representative baseline, Greg/1,234/stationary:

- Death: tick 5,189 (86.5s), G1 pass.
- Level-ups: ticks 622 and 3,283.
- Opening mean within 350: 8.909 overall; gate-specific after-30-second mean: 9.467.
- Pressure mean within 350: 13.786.
- Enemy high-water: 25.
- Total kills: 212.
- Final state hash: `307d9f6b14ac4c52`.

These are deterministic engineering measurements, not a human judgment of fun, fairness, or accessibility.

## Tuning iterations and why they were rejected

| Iteration | Change | G1 | G2 | G3 | G4 | G5 | G6 | Decision |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Baseline | Current production values | 7/9 | 6/18 | 7/18 | 2/18 | 18/18 | 0/18 | Best honest reference |
| H1 | Plan's full caps, cadence, level pressure, and XP proposal | 3/9 | 5/18 | 2/18 | 5/18 | 18/18 | 0/18 | Rejected: stationary death as early as 18.7s |
| H2 | Restore opening/pressure; keep H1 late density and H1 XP | 6/9 | 4/18 | 3/18 | 7/18 | 18/18 | 0/18 | Rejected: broad cadence regression remains |
| H3 | H2 density with production XP | 8/9 | 6/18 | 2/18 | 7/18 | 18/18 | 0/18 | Rejected: G2/G3/G4 remain structurally split |
| H4 | H3 plus a two-tick slower Pressure interval | 7/9 | 6/18 | 2/18 | 7/18 | 18/18 | 0/18 | Rejected: non-monotonic seed swing; no convergence |

The H1 level-pressure values also conflict with the accepted validation contract: the plan requests `maxSteps: 6`, `softCapPerStep: 3`, and `hardCapPerStep: 5`, while the director deliberately permits at most 3, 1, and 2. A temporary validation expansion was tested, then rolled back with H1. Changing that contract should be an explicit design decision, not an incidental tuning edit.

## Owner / consultant decision required

The current acceptance model treats hero identity, movement/pickup behavior, survival, and encounter density as though one global director curve and one XP threshold array can normalize all 18 mobile runs. The measurements do not support that assumption.

Recommended decision: revise the gates before authoring formations or rebasing hashes.

1. Keep G1 as the stationary danger check, but decide whether its band is a population target or a strict every-seed invariant. If strict, authorize hero-specific defensive calibration; global director changes move the two edge failures in conflicting ways.
2. Measure G2/G3 on `mobile-orbit` as the representative play policy. Treat `mobile-kite` as a survival/convergence stress lane, because fleeing threats naturally avoids XP motes and cannot share the same modal clock without an XP-delivery rule change.
3. Split G4 into phase-qualified evidence: score a phase only for runs that reach it, and add a separate mobile survival gate. Counting a pre-Mutation death as both a survival failure and a zero-density Mutation sample conflates two problems.
4. Redefine G6 per observed elite defeat, with a minimum sample count across the matrix, instead of requiring six qualifying defeats inside every mobile run. Early terminal runs cannot satisfy the current formulation.
5. Decide whether the level-pressure validation ceiling may expand. If yes, record it as a contract change and test it independently from content tuning.

Alternative decision: retain every current gate exactly and expand Packet B's scope to hero-specific starting defenses, pickup/XP acquisition, and potentially timed level guarantees. That is a broader gameplay-authority change and should not be hidden inside director content tuning.

## Validation

Passed:

```text
npm run verify:changed -- --files packages/sim/src/pressure-lab.ts,packages/sim/test/pressure-lab.test.ts,scripts/report-pressure.mjs
  packages/sim typecheck: pass
  packages/sim lint: pass
  packages/sim tests: 289/289 pass
  verify:agent-contracts: pass

node scripts/report-pressure.mjs --matrix --summary
  deterministic matrix completed
  acceptance gates remain red as recorded above
```

Not run:

- `npm run verify:release`
- `npm --prefix apps/web-toy run verify:agent-smoke`
- golden proposal/rebaseline
- density capture and human visual review

Those belong after Packet B acceptance. Running or rebasing them now would imply that rejected gameplay content was a release candidate.

## Compact handoff

**Outcome:** Packet A instrumentation is complete and verified. Packet B reached the plan's explicit abort condition with a measured cross-hero, cross-policy acceptance conflict.
**Scope:** The accepted change is limited to the three Packet A paths plus this handoff. All experimental director, XP, validation, and test tuning was rolled back.
**Files:** `pressure-lab.ts`, `pressure-lab.test.ts`, `report-pressure.mjs`, and this document.
**Validation:** `verify:changed` passed all selected commands; 289/289 sim tests pass; deterministic 27-run matrix completed. Release, smoke, goldens, and visual evidence were not run because the plan stopped before those packets.
**Evidence boundary:** All reported results are automated deterministic simulation evidence. No human playtest, balance approval, accessibility review, or visual approval occurred.
**Risks / open work:** Gates G1–G4 and G6 are not jointly satisfiable within the authorized global tuning surface demonstrated so far. Packets C–G remain intentionally unstarted.
**Owner decision:** choose revised policy/phase-qualified gates (recommended) or authorize broader hero-specific progression and defense changes.
