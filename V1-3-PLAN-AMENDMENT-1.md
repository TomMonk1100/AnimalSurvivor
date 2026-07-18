# V1.3 Pressure & Tempo — Plan Amendment 1 (Gates v2 and Resumption)

**Date:** 2026-07-17
**Amends:** `V1-3-PRESSURE-TEMPO-SWARM-PLAN.md`
**Responds to:** `V1-3-PRESSURE-TEMPO-EXECUTION-HANDOFF.md` (Packet B abort)
**Decision authority:** consultant recommendation; owner may override any line item

## Decision

**The revised-gates path is adopted.** The alternative — expanding Packet B into hero-specific starting defenses, pickup/XP acquisition changes, and timed level guarantees — is rejected for this packet series. Hero identity is a deliberate design surface; changing it to satisfy measurement gates would hide design decisions inside tuning, exactly what the house rules exist to prevent. If hero-specific calibration ever becomes necessary, it gets its own packet with its own design review.

The abort itself is endorsed. Stopping with a measured conflict and a clean tree is the plan working, not failing. Packet A's instruments and the 27-run matrix are exactly the evidence needed to write better gates; v1's gates were authored against zero measurements and it shows.

## What the measurements actually taught

Three lessons drive the revisions:

1. **Policies are not players, and each policy is only evidence for what it exercises.** `mobile-kite` flees enemies and therefore flees XP; holding it to modal-timing gates was a category error. Kite is a survival/convergence stressor. `mobile-orbit` is the representative-play proxy. `stationary` is the danger floor. Gates v2 assigns each gate to the policy that can honestly measure it.
2. **A death is one failure, not two.** Counting a pre-Mutation death as both a survival failure and a zero-density Mutation sample made G4 unpassable by construction. Phase evidence must be phase-qualified.
3. **Marginal misses on opposite ends of a narrow band are a gate-width problem, not a tuning problem.** Greg/7 died at 74.8s (5.2s early); Gracie/90210 at 110.4s (0.4s late). A 30-second strict band across three deliberately different defensive kits (dodge / armor+HP / shield) over-constrains a global curve. The design goal — standing still is predictably fatal, not instantly fatal — survives a wider strict bound plus a central-tendency target.

## Gates v2

G7 and G8 are unchanged. G5 is retained as a regression floor (it already passes; it must not regress). The others are restated:

| Gate | Policy lane | Target |
| --- | --- | --- |
| **G1 stationary fatality** | stationary | Every hero/seed run dies within **1:05–2:00** (hard per-run bound); median of the 9 runs within **1:20–1:50**. |
| **G2 first choice** | mobile-orbit only | First upgrade modal within **0:25–0:40** in ≥ **7/9** runs; hard outer bound 0:15–1:00 for all 9. |
| **G3 choice breathing room** | mobile-orbit only | Per-run median modal gap ≥ **20s** through 3:00 in ≥ **7/9** runs; at most one queued same-tick double-modal per run through 3:00. |
| **G4a proximity pressure** | orbit + kite, phase-qualified | Phase floors unchanged (Opening ≥6 after 0:30, Pressure ≥12, Adaptation ≥20, Mutation ≥30), scored only over runs alive in that phase. Each phase needs ≥ **5** qualifying runs to be scoreable; an unscoreable phase fails G4b, not G4a. |
| **G4b mobile survival** *(new)* | mobile-orbit | No orbit run dies before **2:15**; ≥ **6/9** orbit runs alive at boss entrance (4:45). Kite survival is recorded as evidence, not gated. |
| **G6 elite relief** | orbit + kite, per event | Scored per observed elite defeat across the matrix: ≥ **70%** of defeats show a ≥25% proximity drop within 10s and re-exceed the phase floor within 25s. Minimum sample: **20** defeats matrix-wide; a smaller sample fails G6 on its own terms (elites must actually die under median builds). |

Two structural rules carry over from the lessons above: no gate may combine policies with conflicting incentives, and no run may be penalized twice for one death.

## Authorized contract change: level-pressure validation ceiling

`packages/run-director/src/validation.ts` currently enforces `maxSteps ≤ 3`, `softCapPerStep = 1`, `hardCapPerStep ≤ 2`. This amendment authorizes raising the ceilings to `maxSteps ≤ 6`, `softCapPerStep ≤ 3`, `hardCapPerStep ≤ 5` — as an **explicit, separately validated contract change**, per the handoff's correct objection to doing it as an incidental tuning edit.

Conditions: dedicated validation tests for the new bounds (accept at ceiling, reject above, reject hard < soft); the existing same-tick-burst and cap-resolution invariants must be shown unaffected by tests, not assertion; a short decision record at `docs/decisions/0009-level-pressure-ceiling.md` noting the old bounds, new bounds, and why (player-scaled pressure is a design goal; the old ceiling encoded V1.2's modest intent, not a safety property). This lands as its own reviewable step **before** any tuning values use the new headroom.

## Packet B2 — resumed tuning instructions

Same write scope and rules as Packet B, plus the validation-ceiling step above, minus the H1 anchor (it is measured and dead). New requirements:

1. **Diagnose variance before tuning values.** The first-modal spread (tick 747–4,583) says early XP flow varies wildly by seed. Before touching caps, produce a per-seed report of opening-phase spawn/kill/XP timelines and identify the variance source (archetype draw order, spawn distance, wave slot timing). If the source is authored content (e.g., inconsistent opening fodder cadence), fixing it inside `greg-first-run.ts` is in scope and is the preferred first move — an authored deterministic opening trickle that narrows seed variance will do more for G2/G3 than any global multiplier.
2. **Tune in lanes, in order:** (a) opening consistency until G2/G3 pass, (b) stationary lethality until G1 passes (opening/pressure caps and intervals — note both current G1 misses are marginal, so expect small moves), (c) mid/late density until G4a/G4b pass (now with level-pressure headroom available). Re-run the full matrix after each lane; record every matrix in the handoff as before.
3. **G6 is diagnostic during B2, gating after C.** Formations and relief cadence are Packet C's subject; B2 reports G6 per-event numbers but does not block on them. Packet C then owns making G6 green.
4. Same abort condition, honestly applied: if G1–G4b cannot jointly pass under Gates v2 within the performance budget, stop and report — but with phase-qualified scoring and policy lanes, the previously "structurally split" gates are no longer forced into contradiction, so exhaust the lanes before concluding.

## Corrections to downstream packets

- **Packet C:** its stated purpose is amended. G5 already passes, which disproves the v1 assumption that formations are needed for camera occupancy — the handoff is right. Formations now exist to create **readable, warned, directional pressure events and the relief cadence G6 measures** — ring closure and pincer lanes as authored dramatic beats, evaluated by G6 (which flips to gating) plus a determinism/warning-emission test. G5 remains a floor.
- **Packet D:** unchanged, still strictly after B2+C acceptance; the handoff's refusal to rebaseline goldens around rejected tuning was correct and remains the rule.
- **Packets E/F/G:** unchanged. G absorbs this amendment into the status narrative.

## Sequencing from here

```
B2.0 validation-ceiling contract change → B2.1 variance diagnosis →
B2.2 lane tuning (opening → stationary → density) → C (formations, G6 gates) →
D (rebaseline, verify:pressure wiring) → E ∥ F → G
```

## Handoff appreciation, for the record

Packet A delivered more than specified (boundary-aware kite, hash-stamped reports, `--verify` mode), the H1 rejection was correctly evidenced rather than argued, the validation-ceiling conflict was correctly escalated rather than silently expanded, and the tree was left clean. This is the standard. The one criticism runs the other way, at the plan itself: v1 gates were written before the instrument existed, and two of them (G4's double-counting, G6's per-run framing) were unpassable by construction. Gates authored ahead of measurement should be labeled provisional in future plans — Packet G should carry that lesson into the workflow docs.
