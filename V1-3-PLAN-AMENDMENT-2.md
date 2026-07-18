# V1.3 Pressure & Tempo — Plan Amendment 2 (Instrument First, Game Second)

**Date:** 2026-07-18
**Amends:** `V1-3-PRESSURE-TEMPO-SWARM-PLAN.md` + `V1-3-PLAN-AMENDMENT-1.md`
**Responds to:** `V1-3-AMENDMENT-1-EXECUTION-HANDOFF.md` (B2 abort in the opening lane)
**Decision authority:** consultant recommendation; owner may override any line item

## Decision

The handoff offers two paths: authorize an early reward-delivery gameplay packet, or soften G2. **This amendment orders them into a three-tier resolution with defined triggers, so B3 can run to completion without another abort round-trip:**

1. **Tier 1 — fix the instrument.** Add a fourth deterministic policy, `mobile-greedy`, and move G2/G3 measurement onto it. The opening diagnosis proves the blind orbit is not a valid instrument for reward-timing gates: at 30s, similar kills yield 2 vs 7 collected motes purely by drop geography. Real players steer toward motes — that is the genre's core micro-decision. A proxy that ignores it cannot measure first-choice timing, and O7's near-pass (5/9 with a mere 3-second orbit tweak) shows how much of the red is proxy artifact. If G2/G3 pass on `mobile-greedy` with production content, **no gameplay change happens** — the finding is recorded and B3 proceeds to the density lane.
2. **Tier 2 — bounded reward-delivery change, only on valid-instrument evidence.** If G2 still fails on `mobile-greedy`, the early reward-delivery change activates under the scope below. The design concern is then real, not artifact: even a mote-seeking player can't reliably reach a first choice in the window.
3. **Tier 3 — pre-authorized gate softening.** If G2 fails after both tiers, G2 becomes: hard outer bound 0:15–1:00 for 9/9, median of the 9 greedy runs within 0:25–0:45. This is recorded now so the swarm never deadlocks on G2 again; reaching Tier 3 must be reported as a finding, not buried.

Why this ordering: changing the game to satisfy an invalid measurement would be exactly the mistake Amendment 1 corrected in the other direction. Measure with a truthful instrument first; change the game only on evidence that survives it.

## Tier 1 spec — `mobile-greedy` policy

- Deterministic overlay on the existing orbit: each decision tick, if the nearest uncollected XP mote lies within **200 world units**, steer directly to it; otherwise continue the fixed orbit. No enemy-avoidance term (keep it simple and reproducible); collection remains contact-based.
- The lab records the policy's constants (seek radius, orbit period, offset) in every report, exactly as it already records the camera fallback.
- Gate re-laning: **G2/G3 score on `mobile-greedy` only.** G4a/G4b/G5 remain on orbit + kite (movement-pattern gates should not gain a pickup-seeking bias). G1 unchanged. G6 adds greedy runs to its event pool (more observed elite defeats, same per-event rule).
- The matrix grows to 36 runs (4 policies × 3 heroes × 3 seeds). Determinism and byte-identical-report tests extend to the new lane.

**Write scope (Tier 1):** `packages/sim/src/pressure-lab.ts`, `packages/sim/test/pressure-lab.test.ts`, `scripts/report-pressure.mjs`. Nothing else.

## Tier 2 spec — base mote drift (conditional)

The sim already owns a deterministic attraction path (`attractPickups` in `packages/sim/src/combat.ts`) fed by Mote Draw's per-rank values. Tier 2 gives every hero a small nonzero baseline through the **existing** machinery — no new systems:

- Starting hypothesis: XP motes within **70 units** drift toward the hero at **90 units/sec**. Collection radius unchanged. Bomb/Magnet/Food pickups unchanged.
- **Mote Draw must remain a measurably meaningful pick.** Its +80 range / +120 speed per rank dwarfs the baseline by design. Acceptance requires an Upgrade Impact Lab row showing Mote Draw rank 1 still produces a significant collection-rate delta over the new baseline; if the baseline erodes it, shrink the baseline, not the card.
- Constants live in `packages/sim/src/config.ts` — **LEAD-OWNED; this amendment grants a scoped authorization for the two new pickup-drift constants only** (plus their validation/serialization lines), same discipline as the `xpThresholds` grant.
- Player-facing copy: Mote Draw's card text stays truthful ("+80 pull range" reads as an addition — verify wording still holds against a nonzero base; adjust the card copy in `apps/web-toy/src/presentation/upgrade-copy.ts` if not). This is the one presentation file Tier 2 may touch, with a paired test.
- Replay/hash: this is a sim behavior change; goldens rebaseline in Packet D as already planned, never in this packet. Surface the CONFIG_VERSION question to the owner in the handoff with default no-bump (values and additive constants, not a contract break), consistent with the Packet D precedent.
- XP threshold retuning under the original grant remains available and expected — O5 showed thresholds interact with delivery; with reliable delivery, retune until the greedy-lane window lands.

**Write scope (Tier 2):** the Tier 1 files, `packages/sim/src/combat.ts` (baseline wiring only), `packages/sim/src/config.ts` (two-constant grant), `packages/sim/src/upgrade-impact-lab.ts` (Mote Draw delta row), paired sim tests, and `apps/web-toy/src/presentation/upgrade-copy.ts` + its test if copy needs truth repair.

## Also carried into B3

- **The density lane was never exhausted.** B2 stopped in the opening lane, so G4a Adaptation (16.1 vs 20) and Mutation (21.1 vs 30) remain untuned reds with fresh level-pressure headroom (6/3/5) available. After the G2 resolution settles (whichever tier), continue Amendment 1's lane (c): mid/late caps, intervals, and level-pressure values until G4a passes within G7's budget.
- **G3's same-tick double-modals** correlate with threshold overshoot clusters (O5's ~2,900–3,000 tick pileup). Expect G3 to move with the Tier 1/2 changes; only tune thresholds for G3 after G2's lane is settled.
- **G6 stays diagnostic** until Packet C, unchanged. The 22.2% per-event baseline is now honest evidence for C's design work.
- Everything else in Amendment 1 stands: C's reframed purpose, D's rebaseline-only-after-acceptance rule, E/F/G unchanged.

## Resumption order

```
B3.0  Tier 1 instrument (greedy lane, re-laned gates, 36-run matrix)
B3.1  Decision point (automatic): G2 pass → record finding, skip Tier 2
                                  G2 fail → implement Tier 2, re-run matrix
B3.2  If Tier 2 lands: Mote Draw impact check + threshold retune
      If G2 still red: apply Tier 3 gate revision, record prominently
B3.3  Density lane (G4a) with level-pressure headroom
C     Formations (G6 flips to gating)  →  D  →  E ∥ F  →  G
```

Abort condition: only a determinism break or a G4a/G7 joint impossibility stops B3 now — every G2 outcome has a defined path.

## Steelman record

- *Soften G2 immediately and skip both tiers* — defense: cheapest, no gameplay risk. Fails: the 0:25–0:40 first choice is a design target from the accepted review response, not a measurement convenience; softening before instrumenting properly would hide a possibly real delivery problem behind a friendlier ruler.
- *Authorize the reward packet immediately (handoff's recommendation) and skip Tier 1* — defense: the diagnosis already shows collection geography is the variance source, and drift helps real players too. Fails narrowly: O7 suggests a seeking proxy may pass with production content, and a gameplay change justified by an invalid instrument would be unfalsifiable — if greedy-lane evidence then showed it unnecessary, it would already be baked into goldens. One extra matrix run is cheap; run it first. Tier 2 preserves the handoff's recommendation with a trigger instead of rejecting it.
- *Give greedy an enemy-avoidance term for realism* — defense: closer to real play. Rejected: every added term is a new free parameter to argue about; the lab's value is reproducibility, not fidelity. Greedy-vs-orbit disagreement is itself the diagnostic.
- Second pass on the resolved amendment: the Tier 2 copy-file exception is the only cross-package write; it is conditional, single-file, test-paired, and exists to keep card copy truthful — accepted. No other fix-introduced risks found.
