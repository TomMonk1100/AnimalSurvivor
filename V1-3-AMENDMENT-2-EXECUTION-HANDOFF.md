# V1.3 Pressure & Tempo — Amendment 2 Execution Handoff

**Date:** 2026-07-18
**Status:** B3 complete at a safe deterministic checkpoint; Packet C blocked by its declared write scope
**Authority:** `V1-3-PLAN-AMENDMENT-2.md`, carrying forward Amendment 1 and the original swarm plan

## Outcome

Amendment 2's instrument-first sequence is implemented through B3:

- The pressure lab now has a fourth deterministic `mobile-greedy` policy. On each tick it seeks the nearest live XP mote within 200 world units, ties by stable entity id, and otherwise uses the existing eight-direction orbit.
- The default matrix is 36 runs. G2/G3 score only the nine greedy runs; G4a/G5 score orbit plus kite; G4b preserves Amendment 1's explicit orbit-only survival contract; G6 includes all moving lanes.
- Tier 1 proved the old orbit timing result was proxy-sensitive, but greedy production runs were too early rather than too late: all nine first choices landed at ticks 474–839 before Tier 2.
- Tier 2 adds deterministic base XP-mote drift through the existing simulation-owned attraction pass: 70-unit range at 90 units/second. Collection radius and non-XP pickups are unchanged.
- Mote Draw remains meaningful. The deterministic impact fixture measures 1 mote/second at the new baseline and 5 motes/second at rank 1, a +4 mote/second result. Its existing `+80 pull range` language remains truthful, so no browser copy was changed.
- The accepted XP curve is `[32, 80, 144, 224, 320, 432, 560, 704, 864, 1040]`. This makes G2 and G3 green on the greedy lane and makes G4a green without changing director density.
- The raised level-pressure validation ceiling from Amendment 1 is implemented and separately recorded in ADR 0009, but the production run does not yet spend that headroom because the accepted XP curve already clears G4a.

No human playtest, fun, fairness, accessibility, or final visual approval is claimed.

## Final 36-run matrix

Production configuration: base drift 70/90, the accepted XP curve above, unchanged Forest density content.

| Gate | Result | Measured value |
| --- | --- | --- |
| G1 stationary fatality | **FAIL** | 6/9 inside 3,900–7,200; median 4,836. All three Gracie stationary runs die around ticks 1,252–1,298 before earning the 32-XP first choice. |
| G2 first choice | **PASS** | 9/9 in the 1,500–2,400 inner band; 9/9 in the 900–3,600 outer band. |
| G3 breathing room | **PASS** | 9/9 median gaps at least 1,200 ticks; 9/9 within the same-tick bound. |
| G4a proximity | **PASS** | Opening 8.667 (18 qualifiers), Pressure 15.731 (18), Adaptation 23.749 (12), Mutation 33.118 (9). |
| G4b orbit survival | **PASS** | 9/9 orbit runs alive through tick 8,100; 9/9 alive at boss entrance; every phase scoreable. |
| G5 convergence floor | **PASS** | 18/18 orbit and kite runs retain at least 0.6 camera occupancy. |
| G6 elite relief | Diagnostic **FAIL** pending C | 38/66 events pass, or 0.576 against the 0.70 target. |

G1 is not hidden. Opening-cap experiments at 8/12 and 10/16 prolonged stationary Gracie but made G2 and Opening G4a red. Increasing base attraction to 140 did not help because stationary Gracie earns fewer than 28 XP before death, while the larger baseline reduced late proximity by accelerating orbit/kite progression. Those experiments were reverted. Amendment 1 explicitly rejected hero-specific defense changes, and no such change was made.

## Decision trail

1. **Tier 1 matrix:** G2 0/9 inner and 0/9 outer because greedy choices arrived too early (474–839); G3 0/9 median; Tier 2 triggered automatically under Amendment 2.
2. **Raw-XP diagnosis:** with leveling temporarily disabled, greedy runs held roughly 24–56 XP by tick 2,400. A first threshold of 32 placed all nine production choices in the intended window.
3. **Accepted Tier 2 matrix:** G2 9/9, G3 9/9, G4a green across all four scored phases, G4b orbit survival green, and G5 green.
4. **Tier 3:** not activated because G2 passed after Tier 2.
5. **CONFIG_VERSION:** left at 13 by the amendment's default. The config fingerprint includes both new drift fields and the changed thresholds, so mismatched replays still reject. Owner may choose a version bump during Packet D.

## Files

- `packages/sim/src/pressure-lab.ts` — greedy policy, policy constants/reporting, 36-run matrix, Gates v2 lane assignment.
- `packages/sim/test/pressure-lab.test.ts` — orbit/greedy byte-identical report proof and policy constant assertions.
- `scripts/report-pressure.mjs` — greedy opening diagnosis lane.
- `packages/sim/src/config.ts` — two scoped baseline-drift fields, validation/fingerprinting/defaults, accepted XP curve.
- `packages/sim/src/simulation.ts` — adds config baseline to the existing attraction stats; renderers remain read-only.
- `packages/sim/src/upgrade-impact-lab.ts` — deterministic one-second Mote Draw collection-rate fixture.
- `packages/sim/test/config.test.ts`, `packages/sim/test/run-upgrade-simulation.test.ts`, `packages/sim/test/upgrade-impact-lab.test.ts` — paired config, authoritative wiring, and impact evidence.
- `packages/run-director/src/validation.ts`, `packages/run-director/test/level-pressure.test.ts`, `docs/decisions/0009-level-pressure-ceiling.md` — previously authorized level-pressure ceiling contract step.

`packages/sim/src/simulation.ts` and other files in the workspace already contain unrelated visual-readability work. Only the attraction initialization/addition lines belong to this packet; those unrelated changes were preserved.

## Validation

- `npm --prefix packages/sim run typecheck` — PASS.
- `npm --prefix packages/sim run lint` — PASS, 32 source files and 34 test files.
- `npm --prefix packages/sim test` — PASS, 290/290.
- `npm --prefix packages/run-director run typecheck` — PASS.
- `npm --prefix packages/run-director run lint` — PASS, 16 source files and 8 test files.
- `npm --prefix packages/run-director test` — PASS, 77/77.
- `node scripts/report-pressure.mjs --matrix --summary` — deterministic matrix above; intentionally non-green overall because G1 remains red and G6 belongs to Packet C.

`verify:release`, browser smoke, golden proposals, and human evidence were not run because Packet D cannot begin before Packet C acceptance.

## Packet C scope blocker

Packet C cannot meet its own requirements inside its exclusive write list:

- `spawn-scheduler.ts` returns spawn decisions but cannot emit the required five-second warning event. Warning emission and chronological sequence stamping live in `packages/run-director/src/index.ts`.
- A gameplay-affecting formation schedule added to `RunDefinition` must be validated and included in the content fingerprint. That requires `packages/run-director/src/validation.ts` and `packages/run-director/src/state-hash.ts`; omitting either would violate ADR 0008 and replay safety.
- Exact opposed pincer placement and a ring just beyond the camera contract require the simulation's deterministic run-director formation adapter and paired tests. The current four-value formation enum is insufficient to prove opposed bearings from director code alone.

The minimum safe Packet C scope amendment is:

- Existing Packet C paths.
- `packages/run-director/src/index.ts` for warned/requested beat orchestration.
- `packages/run-director/src/validation.ts` for additive formation-beat validation.
- `packages/run-director/src/state-hash.ts` for authored-schedule fingerprinting.
- Existing run-director integration/determinism tests needed to prove warning order, catch-up, one-shot behavior, and fingerprint changes.
- The simulation's run-director formation adapter plus its paired test for exact ring/pincer placement.

No Packet C files were changed. No goldens were regenerated. No Git action was taken.

## Compact handoff

**Outcome:** B3's greedy instrument, bounded base drift, Mote Draw impact proof, and accepted XP curve are implemented; G2/G3/G4a/G4b/G5 are green.
**Scope:** Tier 1 and Tier 2 paths honored; experiments were reverted; Packet C was not widened.
**Files:** Listed above; unrelated dirty-tree work preserved.
**Validation:** Sim type/lint/test 290/290 and run-director type/lint/test 77/77 pass; final matrix recorded.
**Evidence boundary:** Deterministic engineering evidence only; no human or visual approval.
**Risks / open work:** G1 remains red for stationary Gracie; G6 awaits formations; Packet C needs the explicit scope amendment above.
**Owner decision:** authorize the minimum Packet C scope amendment, and decide during Packet D whether CONFIG_VERSION should remain 13 or bump.
