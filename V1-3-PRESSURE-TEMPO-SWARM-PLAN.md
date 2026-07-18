# V1.3 Pressure & Tempo Packet — Autonomous Swarm Build Plan

**Prepared:** 2026-07-17
**Inputs:** `CONSULTANT-GAME-REVIEW.md`, `CONSULTANT-REVIEW-RESPONSE.md`, `AGENTS.md`, `docs/automation/agent-workflow.md`, `docs/status/current.md`
**Mission:** Make the following statement true, then prove it with deterministic evidence and hand the result to human playtest:

> During the first three minutes, the player must repeatedly reposition or carve
> an escape route; standing still after the opening is predictably fatal; the
> first upgrade arrives between approximately 0:25 and 0:40; and each pick has
> enough uninterrupted combat time to produce a visible, understandable change.

This plan follows the accepted review priority: **encounter pressure, convergence, and upgrade tempo first.** Offer identity/agency and content-bearing meta progression are explicitly out of scope for this packet and become their own packet only after the core loop passes its gates.

---

## 1. Problem definition (decomposition summary)

**Core problem.** The deterministic sim delivers player power faster than pressure. Evidence: a stationary player survives to the 6:00 deadline; opening caps are 12 soft / 20 hard and Adaptation only 32/50; level pressure adds at most +3 soft / +6 hard; XP thresholds `[4, 10, 18, …]` produce three full-screen upgrade modals inside the first 20 seconds; the 3:00 capture shows 29 live enemies of which only ~6–7 are visually apparent near the player. Pressure fails on **count, convergence, and visibility simultaneously.**

**Who it affects.** Every player, every run, every second — movement is the only player verb, so absent pressure there is no game between menus.

**Existing resources.** All levers are local and deterministic: phase caps/intervals in `packages/run-director/src/content/greg-first-run.ts` (and `saltwind-ruins.ts`), level pressure in the same file, XP thresholds in `packages/sim/src/config.ts` (LEAD-OWNED), spawn scheduling in `packages/run-director/src/spawn-scheduler.ts`, an `enemyCap` of 1,200, a GPU-instanced swarm renderer, the `verify:changed`/`verify:release` harness, the capture harness, and `apps/web-toy` `golden:propose` for hash rebaselines.

**Minimum viable scope.** One packet series that (a) builds a deterministic pressure-measurement lab, (b) co-tunes threat and XP cadence against numeric gates, (c) adds two directed-formation primitives, (d) rebaselines hashes/replays, (e) revalidates readability at the new density, and (f) fixes comprehension/naming/terminal framing. Fresh human playtest follows as an owner action.

**Constraints.** Determinism and replay integrity are non-negotiable; `packages/sim/src/config.ts` is lead-owned and requires the explicit authorization granted in Packet B below; no autonomous commit/merge/push/deploy; presentation must not become a gameplay authority; automated evidence must never be labeled human evidence.

---

## 2. Swarm operating model

- Six work packets, **A → B → C → D → then E and F in parallel → G**. Each packet is one agent, one bounded objective, exclusive write paths, and the standard handoff block from `docs/automation/agent-workflow.md`.
- Every packet starts by reading, in order: `AGENTS.md`, `docs/status/current.md`, this plan, then its own "read first" list.
- Every packet routes validation with `npm run verify:changed -- --files <paths> --dry-run` and runs what it recommends. Any packet whose diff the router calls mixed/unknown runs `npm run verify:release`.
- Git actions: none are authorized by this plan. Agents leave changes in the working tree and report. The integration owner commits.
- If an essential edit falls outside a packet's write scope, the agent stops at a safe checkpoint and reports; it does not widen the diff.
- Failure default for any packet: leave the tree in a state where all previously passing gates still pass, and record the blocker in the handoff.

### Numeric gates for this packet series

These are the acceptance instruments. Packet A builds them; Packets B–D tune until they pass; values marked *(initial)* may be adjusted only with recorded evidence in the packet handoff, never silently.

| Gate | Target *(initial)* |
| --- | --- |
| G1 Stationary death | A no-input, no-shop-rank run dies between **1:20 and 1:50** for all three heroes (autopilot off, attacks firing). |
| G2 First upgrade | First level-up modal between **0:25 and 0:40** for all three heroes under scripted mobile play. |
| G3 Choice breathing room | Median gap between upgrade modals ≥ **20s** through 3:00. |
| G4 Proximity pressure | Mean live enemies within 350 world units of the hero, sampled per phase: Opening ≥ **6** (after 0:30), Pressure ≥ **12**, Adaptation ≥ **20**, Mutation ≥ **30**. |
| G5 Convergence | ≥ **60%** of live enemies within one camera radius of the hero from Pressure phase onward (approach must be visible, not off-screen loitering). |
| G6 Relief pulse | After each of the six elite defeats, proximity count drops ≥ **25%** within 10s, then re-exceeds its phase floor within 25s (dread → relief → bigger dread is measurable). |
| G7 Performance | Headless stress run at final tuning: no tick over budget; browser smoke (`verify:agent-smoke`) passes; renderer instancing caps unexceeded. |
| G8 Determinism | Replay/hash suite green after rebaseline; same seed twice → identical pressure-lab report. |

---

## 3. Work packets

### Packet A — Deterministic Pressure Lab (build the instruments first)

**Objective.** A headless, deterministic lab that plays authored input policies through the production sim and emits a JSON pressure report; plus fixture tests that encode gates G1–G6 (initially expected-fail where current tuning fails them).

**Read first.** `packages/sim/src/attack-damage-lab.ts` and `upgrade-impact-lab.ts` (house pattern for labs), `packages/sim/src/run-director-port.ts`, `packages/run-director/src/level-pressure.ts`.

**Exclusive write scope.**
- `packages/sim/src/pressure-lab.ts` (new)
- `packages/sim/test/pressure-lab.test.ts` (new)
- `scripts/report-pressure.mjs` (new; root scripts, prints the JSON report for any hero/seed)

Do not edit: `config.ts`, run-director content, any existing test, anything in `apps/web-toy`.

**Implementation requirements.**
- Input policies, all deterministic: `stationary` (no input), `mobile-orbit` (fixed-period direction rotation, the review's playtest pattern), `mobile-kite` (flee nearest-enemy vector). Upgrade policy: always pick offer index 0 (deterministic; matches offer priority).
- Report per run: death tick or survival, first/each level-up tick, per-second live enemy count, per-second count within 350 units and within one camera radius (use the camera contract from the web renderer's documented view radius; if not exposed to sim, define 750 world units as the lab's camera-radius constant and record that definition in the report), per-phase means, elite-defeat relief timings, total kills, boss HP at end.
- Runs all three heroes × seeds `1234`, `7`, `90210` × three policies. Deterministic: same inputs → byte-identical report (this is itself a test).
- Gates G1–G6 encoded as data-driven assertions reading the report, with current-tuning expectations marked; after Packets B–C land, expectations flip to the gate targets. Structure the test so flipping is a fixture change, not a rewrite.
- No browser APIs, no wall clock, no unseeded randomness (sim boundary rules).

**Acceptance evidence.** `verify:changed` route for the three files; `npm --prefix packages/sim test`; committed-tree report JSON for greg/1234/stationary attached to the handoff showing the current failing reality (expected: survives to 6:00).

**Evidence boundary.** Lab reports are engineering measurements of the deterministic sim. They are not human difficulty or fun claims.

---

### Packet B — Co-tuned threat curve and XP cadence

**Objective.** Retune phase caps, wave intervals, level pressure, and XP thresholds together until gates G1–G4 pass in the Packet A lab for the Forest run (Saltwind gets a matching proportional pass).

**Read first.** Packet A's handoff and report format; `packages/run-director/src/content/greg-first-run.ts`; `docs/playtests/v1-2-tempo-power-boss-audio.md` (targets table).

**Exclusive write scope.**
- `packages/run-director/src/content/greg-first-run.ts` (phase caps, `threatPerTick`, `WAVES.phaseIntervalTicks`, `LEVEL_PRESSURE`)
- `packages/run-director/src/content/saltwind-ruins.ts` (proportional pass)
- `packages/sim/src/config.ts` — **LEAD-OWNED; this plan grants a one-line-region authorization limited to the `xpThresholds` array only.** Any other edit to `config.ts` is out of scope and stops the packet.
- `packages/run-director/test/**` and `packages/sim/test/**` only where existing expectations encode the old tuning values (update the numbers, never the contracts).

**Starting hypothesis (H1) — a tuning matrix, not a spec.** Begin here, then iterate headlessly against the lab until gates pass; record every iteration's matrix and gate outcome in the handoff:

| Phase | softCap/hardCap (now) | H1 | intervalTicks (now → H1) |
| --- | --- | --- | --- |
| Opening | 12/20 | 18/28 | 60 → 46 |
| Pressure | 22/36 | 40/62 | 42 → 26 |
| Adaptation | 32/50 | 72/104 | 32 → 18 |
| Mutation | 44/66 | 112/156 | 24 → 13 |
| Boss | 34/54 | 72/104 | 28 → 18 |

Level pressure H1: `startLevel 4, levelsPerStep 2, maxSteps 6, softCapPerStep 3, hardCapPerStep 5, intervalTicksReductionPerStep 2` (a strong build invites meaningfully more danger).

XP thresholds H1: scale early thresholds up so G2/G3 hold at the new kill rates — first attempt `[7, 16, 30, 50, 76, 108, 148, 196, 252, 316]`. The right values depend on measured kill curves from the lab; iterate.

**Fallback logic.**
- If G1 cannot pass without breaking G7's tick budget, reduce hardCaps stepwise (−10%) and increase enemy convergence via Packet C rather than raw count; record the ceiling found.
- If G2 and G4 conflict (slower leveling starves early builds against denser waves), adjust fodder `xpDrop` is **not** in scope (config-owned); instead move threshold values, and if still conflicting, report the tension as an owner decision with both matrices attached.
- Boss phase caps must keep the 75-second boss runway winnable: the existing strong-build boss TTK regression (~48s) must stay within 40–70s; if it leaves that band, adjust boss-phase caps only, not the boss profile (out of scope).

**Acceptance evidence.** Lab report showing G1–G4 green for all three heroes on the Forest run across all three seeds; `verify:changed` route for touched files (expect it to recommend broad gates because `config.ts` is root-adjacent — run what it says, up to `verify:release`); existing replay/hash tests will fail pending Packet D rebaseline — record them as expected-red in the handoff, do not regenerate hashes in this packet.

**Evidence boundary.** Deterministic tuning evidence only. This packet must state plainly that no human has judged the new curve.

---

### Packet C — Directed formations (convergence, not just count)

**Objective.** Two deterministic formation primitives that make pressure visible and directional, scheduled into the Forest run: **ring closure** (a circle of fodder spawned just beyond camera radius that contracts toward the player's position at spawn time) and **pincer lanes** (two runner columns approaching from opposed bearings with a gap the player must find). Wire them as authored beats: one ring at ~1:40, one pincer at ~2:40, one of each in Mutation, all with the existing five-second warning language.

**Read first.** `packages/run-director/src/spawn-scheduler.ts`, `threat-budget.ts`, `contracts.ts`, `event-buffer.ts`; the elite-beat pattern in `greg-first-run.ts`; ADR 0008 (run director acceptance).

**Exclusive write scope.**
- `packages/run-director/src/formations.ts` (new)
- `packages/run-director/src/spawn-scheduler.ts` (integration point only: schedule authored formation beats; no change to ordinary wave behavior)
- `packages/run-director/src/contracts.ts` (additive types only; no breaking changes to existing exported contracts)
- `packages/run-director/src/content/greg-first-run.ts` (formation beat schedule only — coordinate with Packet B's diff; this packet runs after B lands)
- `packages/run-director/test/formations.test.ts` (new)

**Implementation requirements.**
- Formations spend the existing threat budget and respect resolved live-enemy caps — they may momentarily reach the hard cap; they must never exceed it or spawn same-tick bursts beyond existing scheduler rules.
- Spawn positions derive only from director state and seeded RNG (player position at beat start is already available to the director port; if it is not, spawn the ring centered on the arena's camera contract and report the limitation — do **not** add a new sim→director data path without an owner decision).
- Each formation emits a director event so presentation and audio can warn with existing banner language; reuse the elite warning channel, no new UI.
- G5 and G6 become passing gates in the lab after this packet; re-run the Packet A lab and attach before/after convergence numbers.

**Fallback.** If pincer lanes cannot find the player deterministically without a new data path, ship ring closure alone, gate G5 on it, and file the pincer as a follow-up packet with the owner-decision note.

**Acceptance evidence.** New formation tests green; determinism test (same seed → same formation spawns); lab gates G5/G6; `verify:changed` route for run-director.

---

### Packet D — Rebaseline and gate wiring (integration)

**Objective.** Restore full-suite green: regenerate golden hashes for the new content/tuning, update replay fixtures, flip the Packet A gate fixtures from "current reality" to "targets," and wire the pressure lab into the normal verification path.

**Read first.** Packets B/C handoffs; `apps/web-toy/scripts/propose-golden-hashes.mjs`; `docs/automation/change-gates.md`; the loadout-hash rebaseline precedent (changing run-start content forces regenerating golden hashes — same discipline applies here).

**Exclusive write scope.**
- Golden hash fixture files wherever `golden:propose` writes them
- `packages/sim/test/**` and `packages/run-director/test/**` replay/hash expectation values only
- `packages/sim/test/pressure-lab.test.ts` (flip gate fixtures to targets)
- Root `package.json` scripts block: add `verify:pressure` invoking the lab gates (additive only)

**Hard rules.** Regenerate goldens **only after** B and C gates pass, from a clean deterministic run, via the existing `golden:propose` script; record old→new hash pairs and the generating command in the handoff (provenance). Never hand-edit a hash. If any hash differs between two consecutive proposal runs, stop — that is a determinism regression, and it outranks this packet.

**Decision surfaced to owner (not decided by the swarm).** Whether `CONFIG_VERSION` (currently 13) must bump: values changed but the config *contract* did not. Precedent says version bumps accompany contract changes; old replays will reject via hash mismatch regardless. Present both options in the handoff; default to no bump.

**Acceptance evidence.** `npm run verify:release` fully green, including the new `verify:pressure` gate; `npm --prefix apps/web-toy run verify:agent-smoke` green (G7); handoff includes the full gate table G1–G8 with values.

---

### Packet E — Readability at the new density (parallel with F)

**Objective.** Make the denser encounter readable: enemy/ground separation, XP-mote visibility, hero anchor strength — presentation only, judged with the existing capture harness at the new tuning.

**Read first.** `docs/vfx/captures/readability-final-2026-07/RUBRIC.md`; the flash-audit budget (≤3 luminance swings/sec — new glow must not break it); swarm-renderer packet notes; `apps/web-toy/scripts/vfx-capture.mjs`.

**Exclusive write scope.**
- `apps/web-toy/src/render/**` (enemy rim/edge treatment, ground value under threat, mote scale/pulse, hero anchor)
- `apps/web-toy/test/**` for renderer-facing tests it owns
- New capture output under `docs/vfx/captures/pressure-v1-3/**`

Do not edit: any sim/trait/run-director file; combat, damage, or reward values; the danger-color hierarchy contract (coral = hostile) — work within it.

**Implementation requirements.**
- Targets, in priority order: (1) an enemy must separate from the ground in a grayscale still at 100% zoom — add a light rim/edge or lightened contact footprint; (2) XP motes scale ~1.5× with a subtle pulse and stronger tier glow, within flash budget; (3) hero anchor ring must stay the brightest stable element in a 150-enemy frame.
- Evidence is the house standard: headed stills at 60s/180s at final Packet D tuning, grayscale contact sheets, flash audit passing, before/after pairs. Include one deliberately worst-case Mutation-phase frame.
- The three human checklist responses in `docs/playtests/visual-readability-owner-checklist.md` remain required and unfilled — say so; this packet must not claim human visual approval.

**Acceptance evidence.** Web-toy typecheck/lint/test/build; flash audit ≤ budget; capture set attached; `verify:changed` route.

---

### Packet F — Comprehension and first impressions (parallel with E)

**Objective.** Fix what a new player reads: card copy, naming, terminal framing, intro card.

**Read first.** `apps/web-toy/src/presentation/upgrade-copy.ts`, `terminal-essence.ts`, `run-intro.ts`; the naming collision evidence in `CONSULTANT-GAME-REVIEW.md` §8.

**Exclusive write scope.**
- `apps/web-toy/src/presentation/**` (copy and terminal/intro composition only)
- `apps/web-toy/src/hero/**` display-string tables only
- `apps/web-toy/test/**` paired presentation tests
- Docs touched by the naming sweep: `docs/status/current.md` naming note, plus a new `docs/decisions/0009-hero-naming.md` recording the chosen names

**Hard rules.**
- **Never change simulation-facing identifiers** (`greg`, `gracie-scout`, trait ids, content fingerprints) — they are replay-bound. This is a display-string sweep only.
- Card copy: lead with fantasy + felt change ("Faster, wider volley — 7 feathers, ~40% faster"), exact numbers on a secondary line, **no "ticks" anywhere player-facing** (convert to seconds at 60Hz, one decimal). The truthful-impact category labels stay.
- Naming: adopt one canonical set — recommendation: keep player-facing **Scout · Dog** (it is the shipped presentation and prep art), rename the *instinct* currently named Scout on Gracie to **Survey** in display copy, and fix "Scout's Scout Swipe" and Gracie's "Scout marks…" description. If the owner prefers restoring Greg-the-Fox, the decision doc records it; default is Scout.
- Terminal: on time-expiry, show boss HP remaining prominently ("The Final Threat escaped with 12% health") using the authoritative outcome view — presentation of existing data only. Pairing hints on rank-1 cards ("Master Bat Ears too…") are hidden until the parent attack reaches rank 3.
- Intro card: cut to ≤ 40 words before the hero cards; move mechanic explanation to the first upgrade pause.

**Acceptance evidence.** Web-toy typecheck/lint/test/build; a screenshot set (intro, three cards, terminal-expiry) attached; grep proof that no player-facing string contains "tick"; `verify:changed` route.

---

### Packet G — Synthesis, status truth, and playtest kit

**Objective.** Reconcile documentation with what actually shipped and prepare the owner playtest that decides whether the packet worked.

**Read first.** All prior handoffs; `docs/playtests/v1-2-tempo-power-boss-audio.md` (format precedent).

**Exclusive write scope.**
- `docs/status/current.md` (new top section: V1.3 pressure & tempo packet, with the G1–G8 gate table and evidence links)
- `docs/playtests/v1-3-pressure-tempo-playtest.md` (new owner playtest guide: three heroes × two seeds, fresh + earned profiles, the acceptance statement from this plan's mission as the questionnaire spine, explicit fields for "when did standing still stop being safe," "could you count the threats," "did a pick visibly change the screen")
- This file — append a final "Outcome" section summarizing gate results and open human evidence

**Hard rule.** The status update must keep the house discipline: engineering gates are not fun claims. The packet is *done* only in the engineering sense until the human sessions in the new playtest doc are recorded.

**Acceptance evidence.** Docs-only review; every claim links to a handoff, report, or capture that exists in the tree.

---

## 4. Sequencing, parallelism, and abort conditions

```
A (lab) ──► B (co-tune) ──► C (formations) ──► D (rebaseline + gates)
                                                   ├─► E (readability)   ─┐
                                                   └─► F (comprehension) ─┴─► G (synthesis)
```

- B and C are deliberately serial: C's convergence work is tuned against B's landed curve, then D revalidates the pair. Two-stage tuning is accepted; single-stage was rejected because formation behavior changes kill rates, and a combined packet would have an unreviewably wide write scope.
- E and F are file-disjoint and run in parallel after D so captures and screenshots reflect final tuning.
- **Abort condition (any packet):** a determinism break (same seed, different result) stops the swarm; fixing it becomes the only active task. **Abort condition (B):** if no matrix satisfies G1–G4 within G7's performance budget after honest iteration, the swarm stops and reports the best-achieved matrix with the specific conflicting gates — that tension is an owner design decision, not a thing to paper over.
- Nothing in this plan authorizes commits, merges, pushes, deployments, dependency changes, or edits to lockfiles. The only lead-owned exception is the `xpThresholds` line in Packet B, exactly as scoped.

## 5. What this packet series deliberately does not do

No reroll/banish, no hero-weighted offer pools, no meta-shop rework, no new enemies or bosses, no audio work, no Endless mode. Those are real and agreed — and they are the *next* packet, evaluated only after the mission statement above survives contact with fresh human playtesters. The response document's ordering is preserved: pressure first, then comprehension, then variety, then progression.

## 6. Plan provenance (self-review and steelman record)

Issues found in self-review and how they were resolved:

1. **"3–4x density" as a spec** — rejected as a fixed number; resolved into gates (G1–G6) plus an explicit starting matrix (H1) and a recorded iteration loop, honoring the response's "experiential targets" position while preventing timid under-tuning (the gates, not comfort, end the iteration).
2. **`config.ts` lead ownership vs. XP co-tuning** — steelmanned keeping agents out entirely (defense failed: co-tuning is the response's central correction and needs the thresholds); resolved as a single-region authorization with everything else in the file still forbidden.
3. **Formations before or after cap tuning** — steelmanned combining them (defense failed: unreviewable scope, confounded tuning); resolved as serial B→C with D revalidation.
4. **Golden-hash regeneration risk** — resolved with the provenance rule (script-only, after gates, old→new pairs recorded, double-proposal determinism check) mirroring the existing loadout-rebaseline precedent.
5. **Naming sweep touching replay-bound ids** — caught in review; resolved by restricting Packet F to display strings and recording the name choice in an ADR with an explicit owner override path.
6. **Pincer-lane player-position dependency** — potential hidden sim→director data path; resolved with a defined fallback (ring-only) and an owner-decision escalation instead of a silent architecture change.
7. **Camera-radius definition for G4/G5** — potentially ambiguous across sim/renderer; resolved by requiring the lab to declare its constant (750 units fallback) inside the report so every number is self-describing.
8. **CONFIG_VERSION bump** — genuinely undecidable by an agent (contract vs. values); surfaced as a documented owner decision with a stated default rather than guessed.

A second steelman pass on the resolved plan found no fix-introduced regressions: the added gates are additive scripts, the single lead-file authorization is narrower than any alternative, and every fallback leaves previously green gates green.
