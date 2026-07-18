# Visual Readability Overhaul — Swarm Execution Plan

*Prepared 2026-07-16 against `~/GameDev/AnimalSurvivor` (working tree as of the 16:51 UTC capture). Read-only audit — no source files were modified while writing this plan. This document follows the six-step Autonomous Build Workflow: problem decomposition → build plan → refinement → autonomous execution rewrite → self-review → steelman-and-resolve. Sections 1–3 are the audit and reasoning; **Section 4 is the finished packet set to hand to the implementing agents**; Sections 5–6 record the review passes that hardened it.*

**Owner complaints this plan exists to fix (verbatim intent):**

1. "I can't see when attacks are coming at me."
2. "My attacks are confusing and nothing is cohesive."
3. "Scout doesn't animate when she walks."
4. Overall: "the game is a visual mess."

**Companion docs:** `AGENTS.md` (canonical rules — every agent reads it first), `REVIEW.md` (how the integrator reviews each packet), `docs/automation/agent-workflow.md` (packet format this plan uses), `~/GameDev/ATTACK-VFX-PRODUCTION-PLAN.md` (the July 13 VFX plan — largely implemented; superseded by this document where they conflict).

---

## How to run this plan (for the owner / orchestrator)

Five phases. Phase order is mandatory; parallelism is only allowed where marked.

| Phase | Packets | Parallel? | Agent count |
| --- | --- | --- | --- |
| 0 | WP-0 Integrator: baseline captures + snapshot contract amendment | No — runs alone, first | 1 |
| 1 | WP-A Ground & figure separation · WP-B Hero anchor & Scout locomotion · WP-C Player-attack cohesion | Yes — disjoint write scopes | up to 3 |
| 1→2 gate | Integrator applies each packet's `INTEGRATION-NOTES-*.md` to `playcanvas-scene.ts`, runs gates, captures | No | 1 (same as WP-0) |
| 2 | WP-D Incoming-danger channel | No (depends on WP-0's contract + benefits from WP-A contrast) | 1 |
| 3 | WP-E Verification, evidence, and status record | No — runs last | 1 |

Kickoff prompt template for each swarm agent (paste, filling the two blanks):

```text
You are executing one bounded task packet in the AnimalSurvivor repository at
/Users/adammuncie/GameDev/AnimalSurvivor. Open VISUAL-READABILITY-OVERHAUL-PLAN.md
and execute exactly the packet titled "<WP-ID and name>". Before any edit, read
AGENTS.md, docs/status/current.md, and the plan's "Global guardrails" and
"Trap list" appendices. Stay strictly inside the packet's exclusive write
scope. Do not commit, push, merge, or change dependencies. Finish with the
AGENTS.md handoff block. If you hit a listed fallback condition, follow the
fallback; if you hit an unlisted blocker, stop at a safe checkpoint and report
rather than improvising outside scope.
```

The integrator agent (WP-0) also performs the phase-gate reviews using `REVIEW.md`. No agent ever edits `apps/web-toy/src/render/playcanvas-scene.ts` or `apps/web-toy/src/contracts.ts` except the integrator.

---

## 1. Step 1 — Problem Decomposition

### 1.1 Core problem

The July 13–15 VFX production pass (crossfades, palette law, layer anatomy, impact framing, flash governor) made individual effects better **in isolation**, and the automated flash gate passes. But the July 16 whole-screen evidence shows the game still fails at the level that matters: the **frame as a composition**. In the current 180-second still (`docs/vfx/captures/capture-2026-07-16T16-51-30-972Z/still-180s.png`) and its 40-cell contact sheet, a fresh viewer cannot reliably locate the player character, cannot count the enemies, and sees proximity warning rings glowing brighter than any actual threat. Attack-VFX quality was fixed; **scene readability was never a work package**. That is the gap this plan closes.

### 1.2 Root causes (each pinned to code or capture evidence)

**R1 — Figure/ground failure: entities do not separate from the forest floor.**
Evidence: `capture-2026-07-16T16-51-30-972Z/still-180s.png` (minute 3, level 15, 37 live enemies): enemy sprites are small dark-brown shapes on a mid-dark, high-detail green floor scattered with dark rocks, dark leaf clusters, and bright light patches; the arena edge vignette is darkest exactly where enemies spawn and approach. Bright-green XP motes visually outrank every threat. Nothing on screen anchors the hero: no reliably visible marker survives the clutter (the three-leaf sigil and soft shadow in `apps/web-toy/src/hero/hero-presentation.ts` are swallowed at gameplay zoom). The contact sheet (`contact-sheet-180s.png`) shows this is true in effectively every frame, not one unlucky still.

**R2 — Ranged attacks have zero anticipation, by data-path construction.**
`packages/sim/src/combat.ts:284–311`: elite/spitter/denial enemies decrement `hostileShotCooldown` and fire **instantly** on the tick it reaches 0. No windup state exists for regular shooters (only bosses have `chargeWindupTicks`/`volleyTick` patterns, and chargers a 24-tick stationary phase, `combat.ts:131–143`). The render snapshot copies **no cooldown data** — `apps/web-toy/src/sim/snapshot-producer.ts` `captureEnemies()` hardcodes `velocityX/velocityY = 0` and `source/critical = 0` for enemies. So the renderer *cannot* telegraph a shot even though `apps/web-toy/src/render/enemy-threat-presentation.ts` has a full telegraph descriptor system: its profiles cover boss charge/volley, saltwind, support pulses, director arrivals, and chargers — **nothing for the most common ranged attack in the game**. The player's complaint is literal: the information does not reach the screen because it does not reach the snapshot.

**R3 — In-flight and imminent danger is under-rendered; the warning hierarchy is inverted.**
`apps/web-toy/src/render/playcanvas-scene.ts:2206–2226`: hostile projectile cores are pushed at `headRadius * 2.1` with trail widths floored at 0.8 — at orthoHeight 190 on a 1280-px frame these render as red slivers a few pixels wide (visible in the still as tiny streaks). All projectiles in the batch share one **averaged** material opacity (`recordRoutedBatchOpacity` → `syncRoutedBatchOpacity`), so a single fading projectile dims every live one. Meanwhile contact rings (up to 16, `DEFAULT_ENEMY_THREAT_CAPACITIES.maxContactRings`) render as bright yellow-ringed circles around ordinary contact enemies — in the still they are the most salient gameplay element on screen, brighter than projectiles, brighter than the hero. The thing that warns "an enemy is standing near you" outshines the thing that actually removes your health from across the screen.

**R4 — Player attacks read as disconnected events, not as one character acting.**
The palette law and staged cast/travel/impact layers from the July 13 plan are implemented (`attack-vfx-palette.ts` maps every role into six weapon families; `trait-command-presentation.ts` no longer assigns ad-hoc neon RGB). What remains, visible in `p2-rendered-final-r23-2026-07-14/greg-fox-swipe/full-f1.png` and the July 16 sheet: effects spawn **at target locations with no visible origination from the hero**, so by minute 3 with five attack cards the screen shows simultaneous unrelated silhouettes appearing from nowhere; at gameplay zoom most effects are small enough that their painted detail is lost while their *count* is high; and there is no per-family concurrency budget, so the intensity governor (`illustrated-vfx-intensity-governor.ts`) bounds total load but not visual *diversity per frame* — five families at once is legal and common. Cause→effect attribution ("what did my fox swipe just hit?") relies on hit flashes that work per-enemy but nothing links effect → source.

**R5 — Scout's locomotion is mathematically present and visually absent.**
All three heroes route through `createProceduralAnimalPresentation` (`apps/web-toy/src/hero/hero-presentation.ts:159–161`); the old Fox glTF path (`greg-fox-loader.ts`, `greg-animation-state.ts`) is dead code for the live hero. Scout is a single static PNG cutout (`assets/ui/heroes/scout-pouncer-v1.png`, wired at `procedural-animal-presentation.ts:46,668`) on a flat plane (halfExtent 7.18, root scale 2.45 ≈ 35 world units wide). The procedural gait (`projectProceduralAnimalLocomotion`, lines ~106–150) applies `bodyLift` 0.08–0.30 and `sideSway` ±0.13 **local units** — under 1 world unit, ~2% of body size — and the largest component is on the **Y axis, which the near-top-down orthographic camera foreshortens to nearly nothing**. Lean is ±3.6° roll on a ground-flat card. `movingParts` is a frozen empty array for all three cutouts. Net: Scout slides. The math runs; no one can see it.

### 1.3 What is already good (do not re-litigate)

Deterministic sim/replay/hash discipline; the staged VFX pipeline, crossfades, palette-family mapping, camera impact shake, enemy hit flashes, damage numbers; the capture harness (`apps/web-toy/scripts/vfx-capture.mjs`) with stills, clips, contact sheets, gray sheets, and the flash audit; the verification harness (`verify:changed`, `verify:release`, `verify:agent-smoke`); the task-packet workflow. This plan **reuses** all of it and adds no new dependencies, no new gameplay authority, and no sim behavior change.

### 1.4 Constraints and feasibility

- **Simulation behavior must not change.** All five root causes are fixable in presentation plus one *read-only* data exposure (R2). Golden replay hashes must remain byte-identical; if any determinism/golden/hash-parity test fails, the change is wrong — never rebaseline (`golden:propose` is out of bounds for this effort).
- **Flash budget** (≤3 luminance reversals/sec/cell, 180-s audit) must keep passing while we *add* brightness to danger and *remove* it from noise.
- **No new dependencies; no network at runtime; fixed-capacity instanced batches only** (perf and stress tests enforce this).
- Feasibility: every fix is a bounded renderer/presentation change in files with existing unit-test patterns. One contract amendment (`contracts.ts` + `snapshot-producer.ts` + one read-only sim export) is integrator-owned. Total scope is comfortably within a small swarm's single sustained session per packet.

---

## 2. Step 2–3 — Build plan, refined

The plan groups fixes by *ownership boundary* (so agents cannot collide) rather than by symptom. Reasoning for the major choices, alternatives considered and rejected:

1. **Expose shot imminence read-only instead of adding a sim windup.** A real windup (enemy pauses before firing) would be better game design but changes deterministic combat → golden rebaseline, replay incompatibility, and balance-authority questions the owner has not approved. Rejected. Instead: `hostileShotCooldown` already exists in authoritative state (it is canonically serialized, `simulation.ts` state writer) — copy a normalized 0..1 "attack charge" per enemy into the render snapshot. The renderer then draws a truthful pre-fire cue from real data. Zero gameplay change, zero hash risk, and the cue can never lie.
2. **Fix hierarchy by subtraction as much as addition.** The screen's brightness budget is finite (flash gate). Danger gets brighter/bigger only if noise gets quieter: flatten ground luminance variance, demote contact rings, cap simultaneous attack-family diversity. This is why WP-A (quieting) runs before WP-D (amplifying) — measured on the same seeds.
3. **Anchor the hero with a reserved color, not more brightness.** Ivory is already the hero/hit lane in the palette law. A persistent ivory double-ring ground anchor plus enlarged cutout gives findability without adding a flashing beacon.
4. **Make Scout's gait live in the camera plane.** Y-lift is invisible from above (R5); the gait must be re-expressed as XZ-plane transforms: stride-synced squash/stretch along the travel axis, yaw wag, landing scale kicks, and footfall dust puffs. Restoring the Fox glTF rig was rejected: the owner deliberately replaced it with Scout's cutout (see `docs/release/scout-presentation-provenance.md`); the art direction decision stands, the motion must work within it.
5. **Serialize all edits to the two shared files through the integrator.** `contracts.ts` is frozen/lead-owned by its own header; `playcanvas-scene.ts` (3,130 lines) is the merge hotspot every packet touches. Worker packets ship modules plus an `INTEGRATION-NOTES-<wp>.md` with exact insertion instructions; the integrator applies them. This repo's swarm precedent (Agents A/B/C + lead) already works this way.
6. **Verification is capture-based and uses only existing tooling.** Every packet's acceptance includes running `vfx:capture` on fixed seeds and *looking at the output* (agents must read the PNGs, not just confirm the command exited 0). Numeric pixel metrics beyond the existing flash audit were considered and rejected — they would require new image tooling (new deps) for marginal gain over the existing grayscale contact sheets plus explicit visual checklists.

### Success rubric (used by every packet's verification loop and scored in WP-E)

| # | Test (at 1280×720, seeds 3 and 1234, minutes 1 and 3) | Pass condition |
| --- | --- | --- |
| S1 | Hero findability | In any still, the ivory hero anchor is the only persistent ivory ground marker and is identifiable within ~1 s; in the **gray** contact sheet the hero reads as a distinct light figure at every cell |
| S2 | Enemy countability | In the gray sheet, enemy silhouettes are individually countable near the hero; every enemy has a visible contact shadow separating it from the floor |
| S3 | Shot anticipation | Every ranged enemy shows a visible pre-fire cue for its final ~0.5 s of charge (verified in 10-s clips); no cue ever shows without a shot following while the enemy stays in range |
| S4 | Projectile visibility | Every live hostile projectile is individually trackable in motion in clips: bright coral core + directional tail, plus a spawn pop at the muzzle |
| S5 | Charger/boss telegraphs | Charger lanes visible before the lunge begins; boss charge/volley telegraphs read at full arena scale |
| S6 | Warning hierarchy | Projectiles and telegraphs visibly outrank contact rings; contact rings appear only for genuinely imminent contact and never dominate the frame |
| S7 | Attack cohesion | Every player attack shows a brief cast flash at Scout's body in its family hue; at most 3 attack families' visuals prominent simultaneously; no effect pops to zero (eased fades) |
| S8 | Palette law | Coral/red = incoming danger only; ivory = hero/hits only; mint/gold = rewards only; each attack family inside its lane (extend `attack-vfx-palette.test.ts`) |
| S9 | Scout locomotion | In an 8-still strip at 0.25-s spacing while moving: adjacent frames show visible pose change (stretch/wag/dust); at rest: gentle ≤0.5 Hz breathing only |
| S10 | Flash safety | `verify:vfx-flash` (180-s audit) still passes ≤3 reversals/sec/cell |
| S11 | Determinism untouched | `hash-parity`, `golden-replay-corpus`, sim/trait/director determinism suites pass with **unchanged** golden values |
| S12 | Performance | `perf.test.ts` and `render-stress-snapshots.test.ts` pass; no new per-frame allocation patterns |

S1–S9 are engineering evidence read from captures by the executing agent and the integrator; they are not a claim of human visual approval. WP-E records the outstanding owner-playtest items explicitly.

---

## 3. Section intentionally merged

Step 3 (refinement) was applied directly into Section 2 and Section 4 rather than kept as a separate draft: vague language ("improve", "polish") was replaced by file-pinned actions and rubric numbers; two originally-planned packets (separate "Scout locomotion" and "hero anchor" packets) were merged after the write-scope analysis showed both live in the same two files; a proposed "background art regeneration" packet was cut entirely — regenerating ground art is high-risk/low-necessity when contrast can be dialed procedurally in `wildguard-ground-texture.ts`.

---

## 4. Step 4 — Autonomous execution packets (paste one packet per agent)

Every packet implicitly includes the **Global guardrails** and **Trap list** appendices below. Repo root for all paths: `/Users/adammuncie/GameDev/AnimalSurvivor`.

---

### WP-0 — Integrator: baseline evidence + attack-charge snapshot exposure

**Objective:** Produce the before-captures every later packet compares against, and expose per-enemy attack imminence to the renderer as read-only snapshot data, with proof that simulation behavior and hashes are unchanged.

**Read first:** `AGENTS.md`; `docs/status/current.md`; `docs/automation/change-gates.md`; `apps/web-toy/src/contracts.ts` (whole header); `apps/web-toy/src/sim/snapshot-producer.ts`; `packages/sim/src/enemy-behavior.ts`; `packages/sim/src/combat.ts:270–315`.

**Exclusive write scope:**

- `apps/web-toy/src/contracts.ts` (single bounded amendment)
- `apps/web-toy/src/sim/snapshot-producer.ts`
- `packages/sim/src/index.ts` and one new read-only accessor in `packages/sim/src/simulation.ts`
- `apps/web-toy/test/hash-parity.test.ts` (extend only), new `apps/web-toy/test/` coverage for the snapshot field
- `packages/sim/test/` (one new read-only-view test)
- `docs/vfx/captures/readability-baseline-2026-07/` (new, capture output)

**Steps:**

1. Record `git status --short --branch` output in your notes; preserve all pre-existing working-tree changes untouched.
2. **Baseline captures** (before any code change):
   `npm --prefix apps/web-toy run vfx:capture -- --iteration readability-baseline-2026-07 --hero greg --seed 3 --capture-times 5,60,180 --clip-times 60,180`
   then the same command with `--hero benny --seed 3` and `--hero gracie --seed 3`, then `--hero greg --seed 1234 --capture-times 60,180`. If the port is refused (`listen EPERM`/`EADDRINUSE` — see the 2026-07-16 `BLOCKED.md` precedent), retry with `--port 5211`, then 5223; if headed Chromium cannot get WebGL2, rerun with `--headless` and record the fallback in the report. If all capture attempts fail, write `BLOCKED.md` in the iteration folder describing the exact error and continue with step 3 — the code work does not depend on captures.
3. **Sim read-only exposure:** in `packages/sim/src/simulation.ts`, expose on the public simulation object a read-only view of enemy behavior presentation data, following the existing `readonly enemies: Pool<EnemyPool>` precedent (declared near line 288):
   `readonly enemyBehaviorView: { readonly kind: Readonly<Uint8Array>; readonly hostileShotCooldown: Readonly<Uint16Array> }`
   backed by the existing `enemyBehavior` arrays (created near line 516). Export any needed type from `packages/sim/src/index.ts`. Document on the type: *presentation read-only; writing through this view is forbidden and would corrupt authoritative state.* Add one sim test asserting the view aliases live state and that reading it across ticks does not alter the canonical hash of a short seeded run.
4. **Contract amendment:** in `apps/web-toy/src/contracts.ts`, add to `CategorySnapshot`:
   `readonly attackCharge: Float32Array;` with doc comment: *0 for non-shooters; for ranged/elite/denial/support enemies, 0..1 normalized progress toward the next hostile shot (1 = firing imminent). Presentation-only; copied read-only at the tick boundary.* Update the file header changelog comment if one exists; this is the one authorized amendment.
5. In `apps/web-toy/src/sim/snapshot-producer.ts`: allocate `attackCharge` in `createCategorySnapshot` (zero-filled for all categories); in `captureEnemies()`, for each live slot read `sim.enemyBehaviorView.kind[slot]` and `hostileShotCooldown[slot]`; normalize `charge = 1 - cooldown / interval` clamped to [0,1], where `interval` is the matching config value (`config.enemyBehavior.eliteFireIntervalTicks` for elite-skirmish kind, `spitterFireIntervalTicks` for spitter-skirmish, `supportHealIntervalTicks` for support-pulse; 0 for all other kinds — including bosses, whose telegraphs already flow through cue events). Write 0 for every non-enemy category.
6. **Tests:** extend `hash-parity.test.ts` to assert a run with snapshot production enabled still matches the headless canonical hash (pattern exists in the file). Add a focused test: spawn a seeded run, step until a spitter is in range, assert `attackCharge` rises monotonically to ≥0.99 on the tick before `enemyProjectilesFired` increments, then resets. Assert `attackCharge` is 0 for `direct`-kind enemies.
7. **Gates:** `npm run verify:changed -- --files packages/sim/src/simulation.ts,packages/sim/src/index.ts,apps/web-toy/src/contracts.ts,apps/web-toy/src/sim/snapshot-producer.ts --dry-run`, then run what it routes (expect: sim package typecheck/test/lint + web-toy typecheck/test/lint/build). Run `npm --prefix apps/web-toy run test -- test/golden-replay-corpus.test.ts test/hash-parity.test.ts test/stress-parity.test.ts` explicitly (the web-toy script is already `vitest run`; pass only the file paths). **All golden values must be unchanged.** If any golden/determinism test fails: revert your edits, re-run to confirm green, and report the failure — do not adapt expectations.

**Acceptance evidence:** baseline capture folders exist with stills/sheets (or a `BLOCKED.md` with exact errors); routed gates green; golden values unchanged; new tests green; handoff block per `AGENTS.md`.

**Evidence boundary:** automated only. The baseline PNGs are reference material, not an approval.

---

### WP-A — Ground quieting and figure separation

**Objective:** Make every entity separate from the forest floor: flatten background luminance variance, reduce edge-vignette darkness where enemies approach, ground every enemy with a contact shadow, and lift enemy sprite readability — so that the gray contact sheet shows countable figures (rubric S1/S2 background half).

**Read first:** `AGENTS.md`; this plan §1.2 R1/R3; `apps/web-toy/src/render/wildguard-ground-texture.ts`; `forest-clearing-presentation.ts`; `quaternius-glade-presentation.ts`; `wildguard-enemy-sprites.ts`; `entity-view-pool.ts`; the WP-0 baseline stills and gray sheets.

**Exclusive write scope:**

- `apps/web-toy/src/render/wildguard-ground-texture.ts`
- `apps/web-toy/src/render/forest-clearing-presentation.ts`
- `apps/web-toy/src/render/quaternius-glade-presentation.ts`
- `apps/web-toy/src/render/wildguard-enemy-sprites.ts`
- `apps/web-toy/src/render/entity-view-pool.ts`
- Matching test files (`test/arena-grid-presentation.test.ts`, `test/forest-clearing-presentation.test.ts`, `test/entity-view-pool.test.ts`, `test/wildguard-*.test.ts`) — extend, don't rewrite
- New: `apps/web-toy/INTEGRATION-NOTES-WPA.md`

Do not edit `playcanvas-scene.ts`, hero files, threat presentation, or any asset PNG without following the asset-ledger steps in the guardrails.

**Steps:**

1. From the baseline gray sheet, note (in your working notes) the three concrete separation failures you can see: floor light patches vs. enemy value, edge vignette, missing grounding. Every change below must map to one of them.
2. **Floor variance:** in `wildguard-ground-texture.ts`, reduce the luminance spread of the generated floor: compress bright patch highlights and lighten the deepest shadow speckle toward the mid-tone (target: the floor reads as *texture*, not as *figures*). Keep hue; this is a value-range compression, parameterized by named constants with doc comments.
3. **Vignette:** find the arena edge darkening (search `vignette`, edge gradient, or ambient falloff across your owned files; if it turns out to live in `playcanvas-scene.ts` or the camera setup, do not edit — specify the exact change in the integration notes instead). Reduce edge darkness by ≥40% within the playfield ring where enemies are alive and approaching.
4. **Prop competition:** in `forest-clearing-presentation.ts` / `quaternius-glade-presentation.ts`, darken-and-desaturate rocks and ground props slightly toward the floor tone so gray-scale value contrast belongs to *entities*, not decoration. Do not delete props or change their placement (deterministic layout stays).
5. **Enemy grounding:** add a fixed-capacity instanced contact-shadow layer for enemies — one soft dark ellipse per live enemy (opacity ~0.35, radius ≈ 1.35× enemy radius, lift just above the floor decal layer). Implement in `entity-view-pool.ts` or a small new module in your scope following the existing instanced-batch pattern; expose it so the scene can drive it from the enemy snapshot; write the exact wiring into the integration notes.
6. **Enemy sprite lift:** in `wildguard-enemy-sprites.ts`, raise enemy sprite readability: modest value lift and/or a subtle warm rim so the dark-fur enemies separate from the darkened floor (prefer material/tint changes over editing PNGs; if you must edit a sprite atlas, follow the asset-ledger guardrail exactly: `npm --prefix apps/web-toy run assets:reencode-runtime-pngs`, update the ledger, `verify:assets` green).
7. Keep all new visual parameters as named exported constants so tests can assert bounds (follow the pattern in `enemy-threat-presentation.ts`).
8. **Tests:** extend the owned test files to cover new constants/descriptor outputs (bounds, capacity, determinism from tick — no wall clock).
9. **Verify:** `npm run verify:changed -- --files <your changed files> --dry-run`, run what it routes. Then request integration (notes file) and — after the integrator wires the shadow layer — run the capture: `npm --prefix apps/web-toy run vfx:capture -- --iteration wpa-ground-quiet --hero greg --seed 3 --capture-times 60,180 --clip-times 180`. **Open the gray sheet and confirm S2 with your own reading of the image**; put the yes/no per rubric item in the handoff. If contrast targets fail, iterate constants (bounded: ≤3 capture iterations, then report with images for the integrator to judge).

**Acceptance evidence:** routed gates green; extended tests green; capture iteration folder with your written S1(background)/S2 reading; `INTEGRATION-NOTES-WPA.md` precise enough for the integrator to apply without questions; flash audit unaffected (`verify:vfx-flash` if any luminance-animating value changed — static value changes don't need it).

**Evidence boundary:** automated + your own capture reading. Owner confirmation pending.

---

### WP-B — Hero anchor and Scout locomotion

**Objective:** Make the hero findable in one glance (S1) and make Scout visibly stride, turn, and stop (S9) — within the existing cutout art direction, read-only over snapshots, tick-driven.

**Read first:** `AGENTS.md`; this plan §1.2 R1/R5; `apps/web-toy/src/hero/hero-presentation.ts`; `apps/web-toy/src/hero/procedural-animal-presentation.ts` (whole file); `docs/release/scout-presentation-provenance.md`; trap list items 6, 9, 10.

**Exclusive write scope:**

- `apps/web-toy/src/hero/hero-presentation.ts`
- `apps/web-toy/src/hero/procedural-animal-presentation.ts`
- `apps/web-toy/test/procedural-animal-presentation.test.ts`, `apps/web-toy/test/hero-roster.test.ts` (extend)
- New: `apps/web-toy/INTEGRATION-NOTES-WPB.md` (only if scene wiring is needed; the hero path may not need any)

Do not edit greg-fox glTF modules (dead code for the live path — leave them), threat/VFX modules, `playcanvas-scene.ts`, or assets.

**Steps:**

1. **Hero anchor (hero-presentation.ts):** replace/augment the current sigil+shadow so the hero carries a persistent ivory double-ring ground anchor: inner soft-shadow ellipse + two thin ivory rings (~1.15× and ~1.45× player radius), breathing together at ≤0.5 Hz (`ENEMY_THREAT_BREATH_PERIOD_TICKS = 120` is the repo's canonical period — reuse the constant's value; don't import across ownership if it creates a cycle, define a same-value local named constant with a comment). Ivory is the hero-reserved lane (S8): pick values in the `#f3ead4`–`#fffbe9` band, opacity ~0.55 rings / ~0.3 shadow. All animation tick-derived.
2. **Damage locator pulse:** when `current.playerHp < previous.playerHp`, expand the outer ring once to ~1.9× radius over ~10 ticks with eased fade (helps re-find the hero exactly when it matters). No luminance strobing: single expansion per hit event.
3. **Cutout scale:** raise Scout's readable footprint: `createHeroCutout(..., 7.18)` → try 8.2 (`procedural-animal-presentation.ts:668`; Benny 7.1 and Gracie 7.05 get a proportional bump). Confirm against enemy scale in your capture; the hero should clearly be the largest friendly figure. Keep attachment socket offsets unchanged.
4. **Locomotion re-expression (procedural-animal-presentation.ts):** rewrite `projectProceduralAnimalLocomotion`'s *output application* (the update loop near lines 775–838) so gait reads in the camera plane:
   - Stride-synced **squash/stretch along the travel axis**: lengthScale/widthScale oscillation ±6–9% at the existing stride rate, replacing Y-lift as the primary read (keep a small lift term; it still catches light).
   - **Yaw wag**: ±5–7° oscillation around vertical at stride rate (apply to the art rig yaw on top of heading, not to `root`, so heading math stays intact).
   - **Landing kick**: on each stride beat (existing `footfall` zero-crossings), a 3-tick scale kick (~+4%) with eased decay.
   - **Footfall dust**: small soft ground puffs at the existing footfall marker positions (they already exist — `createFootfallRig`), scaled up to visibility: a puff quad ~2.5–4 world units, eased fade over ~18 ticks, earth-tone (not ivory, not coral, not mint). Fixed small pool (≤8 live puffs), tick-driven.
   - **Idle**: at rest, ≤2% breathing at ≤0.5 Hz; wag and puffs stop.
   - **Turns**: existing heading interpolation stays; add up to ~8° bank into direction changes derived from heading delta.
   All three heroes get the same system with per-hero amplitude table (Benny heavier/slower, Gracie lighter/quicker) — the table already conceptually exists in gait constants; extend it.
5. **Tests:** update amplitude/bounds assertions deliberately (they will fail with old expectations — rebaseline the *presentation* test expectations to the new named constants; this is presentation-only and legal, unlike golden sim hashes). Add: dust pool capacity respected; idle ≠ moving outputs; all outputs finite for degenerate snapshots (zero movement, teleport).
6. **Verify:** `npm run verify:changed -- --files <changed> --dry-run` + routed gates. Capture: `npm --prefix apps/web-toy run vfx:capture -- --iteration wpb-scout-gait --hero greg --seed 3 --capture-times 20,21,22,23,60,180 --clip-times 60` (the four 1-second-spaced stills are your motion strip; plus read the clip). Confirm S1 and S9 by reading the images; check Benny/Gracie with one quick capture each. ≤3 iterations of constant tuning, then report with images.

**Acceptance evidence:** gates green; updated tests green; capture folder + your S1/S9 reading per hero; no sim/`playcanvas-scene.ts` edits (or a minimal integration note if the dust pool needs scene wiring).

**Evidence boundary:** automated + your capture reading. Owner confirmation pending.

---

### WP-C — Player-attack cohesion

**Objective:** Make the player's attacks read as one character acting: every attack visibly originates at the hero, families stay in their palette lanes, at most ~3 families are prominent at once, nothing pops out of existence (S7/S8).

**Read first:** `AGENTS.md`; this plan §1.2 R4; `~/GameDev/ATTACK-VFX-PRODUCTION-PLAN.md` §1.3 (reference-game discipline — still the aesthetic North Star); `apps/web-toy/src/render/trait-command-presentation.ts`; `illustrated-vfx-presentation.ts`; `illustrated-vfx-motion.ts`; `illustrated-vfx-intensity-governor.ts`; `attack-vfx-palette.ts`; `vfx-easing.ts`.

**Exclusive write scope:**

- `apps/web-toy/src/render/trait-command-presentation.ts`
- `apps/web-toy/src/render/illustrated-vfx-presentation.ts`, `illustrated-vfx-motion.ts`, `illustrated-vfx-rank-profile.ts`, `illustrated-vfx-intensity-governor.ts`
- `apps/web-toy/src/render/signature-vfx-composite-presentation.ts`, `impact-vfx-composite-presentation.ts`
- `apps/web-toy/src/render/wildguard-vfx-atlas.ts`, `attack-vfx-palette.ts`, `vfx-easing.ts`
- Their matching `apps/web-toy/test/*.test.ts` files (extend)
- New: `apps/web-toy/INTEGRATION-NOTES-WPC.md`

Do not touch danger palettes/threat modules (WP-D's), hero files, sim, zones' gameplay semantics, or `playcanvas-scene.ts`.

**Steps:**

1. **Audit before editing (mandatory, ~45 min):** run `npm --prefix apps/web-toy run vfx:capture -- --iteration wpc-audit --hero greg --seed 3 --capture-times 60,180 --clip-times 60,180`, repeat for benny and gracie. For every attack family you can see, tabulate in working notes: (a) origin anchored at hero? (b) oriented toward its target/travel? (c) inside its palette lane? (d) fade eased to zero or terminal pop? (e) silhouette distinct at real zoom? Fix only what the table shows broken — this plan does not assume; several July-13 fixes landed and must not be redone.
2. **Cast anchor:** for every trait command that produces a world effect, emit a short cast flash at the hero's position in the family hue (≤8 ticks, small — an origination cue, not a bloom) and, for traveling effects, ensure the travel body is oriented along its velocity. Implement in `trait-command-presentation.ts`/`illustrated-vfx-presentation.ts` where each command's descriptors are built.
3. **Family concurrency budget:** extend `illustrated-vfx-intensity-governor.ts`: beyond total-load bounds, track distinct families with live *prominent* visuals (travel/impact stages); when a 4th family would become prominent, accelerate the oldest family's aftermath fade. Named constants + tests.
4. **Fade discipline:** sweep owned files for linear fades ending above ~0.15 opacity followed by expiry (the F6 pattern — e.g., `0.96 × (1 − progress × 0.74)` shapes); route them through `vfx-easing.ts` ease-out-to-zero. No terminal pops.
5. **Uniform card scaling:** any painted card scaled non-uniformly (stretched art) becomes uniform scale with length expressed by geometry/tiling instead, or gets an explicit comment justifying the exception.
6. **Legacy geometry demotion:** any remaining flat procedural primitive acting as a *primary* attack read gets demoted to a quiet contact footprint (≤0.4 opacity) under the painted layer.
7. **Palette assertion:** extend `attack-vfx-palette.test.ts`: every family's emitted colors stay in-lane; assert coral/ivory/mint-gold exclusions (S8) as computable checks over the palette tables.
8. **Verify:** routed gates; recapture the same seeds/times; compare against your audit table — every "broken" row now reads fixed in the images; flash audit: `npm --prefix apps/web-toy run verify:vfx-flash` must pass (you are changing luminance dynamics). ≤3 tuning iterations.

**Acceptance evidence:** audit table (before) + closure table (after) in the handoff; gates + flash audit green; extended palette/governor tests green; integration notes if any scene wiring changed.

**Evidence boundary:** automated + your capture reading. Cohesion is ultimately an owner-judgment item; record it as pending.

---

### WP-D — Incoming-danger channel (telegraphs, projectiles, hierarchy)

**Objective:** The player sees every damage source before or as it becomes dangerous: pre-fire cues on ranged enemies (from WP-0's `attackCharge`), trackable projectiles with muzzle pops, earlier/stronger charger lanes, bigger boss telegraphs, demoted contact rings (S3–S6).

**Read first:** `AGENTS.md`; this plan §1.2 R2/R3; `apps/web-toy/src/render/enemy-threat-presentation.ts` (whole file); `apps/web-toy/test/enemy-threat-presentation.test.ts`; `projectile-visual-truth.ts`; the scene threat block `playcanvas-scene.ts:2198–2265` (read-only for you); trap list items 2, 3, 4, 5, 12.

**Exclusive write scope:**

- `apps/web-toy/src/render/enemy-threat-presentation.ts`
- `apps/web-toy/src/render/projectile-visual-truth.ts`
- `apps/web-toy/test/enemy-threat-presentation.test.ts`, `apps/web-toy/test/projectile-visual-truth.test.ts`
- New: `apps/web-toy/INTEGRATION-NOTES-WPD.md`

**Steps:**

1. **Shooter pre-fire cue:** add a new descriptor kind to the threat frame, e.g. `shooterWindups: readonly ShooterWindupDescriptor[]`: for enemies with role ∈ {elite(1), ranged(3), denial(5)} and snapshot `attackCharge ≥ 0.55`, emit (a) a thin coral **aim wedge** from the enemy toward the player, length ramping ~26→46 world units with charge, and (b) an **inhale ring** contracting onto the enemy over the final ~18 ticks (charge ≥ ~0.85). Opacity ramps with charge; everything derived from tick + snapshot only. Cap ≤12 concurrent windups; nearest-to-player priority (reuse the module's existing candidate-scoring pattern). Note: `attackCharge` freezes when an enemy leaves firing range (cooldown only ticks in range — `combat.ts:287`); therefore also require current distance ≤ the elite outer band (compute from config values the module already receives, or pass via options) so stale charge never shows a false cue.
2. **Projectile read:** raise `headRadius` multiplier ≈2.1→3.8 and tail minimum width 0.8→2.4 in the descriptor outputs (the scene multiplies your descriptor values — keep the change in the descriptor so tests see it); opacity floor 0.85 while live. Add a **muzzle pop** descriptor on first sight of a projectile id (6–8 ticks, small coral burst at spawn position). Per-instance fading within the batch-averaged-opacity constraint (trap 3): prefer encoding age into scale (grow-snap-in over 2 ticks, shrink-out at expiry) instead of fighting the shared opacity.
3. **Charger lanes:** using the exact mirror formula `(tick + (id & 31)) % 180` (trap 5), surface the lane from phase ≥150 (pre-windup warning) through the lunge end at 60, with escalating opacity: faint→bright at windup start (phase 0)→hot during lunge. Lane length ≈ the lunge travel distance. Chevron motion via the existing pulse field, ≤0.5 Hz luminance envelope (S10).
4. **Boss/elite:** scale radial/lane boss telegraph descriptors ×~1.3 with a darker outline ring for contrast on bright ground; elite auras keep size but gain outline. (The cue *events* already arrive — this is presentation size/contrast only.)
5. **Contact-ring demotion:** rings only when enemy is closing (distance shrinking across snapshots) AND within ~1.2× contact distance; thickness/opacity reduced (≤0.5), cap 16→8, palette stays in the hostile lane but visibly quieter than projectiles and windups (S6 explicitly inverts today's hierarchy).
6. **Budgets and constants:** every new magnitude is a named exported constant; total descriptor capacity stays ≤ the module's existing `MAX_PRESENTATION_CAPACITY = 128`.
7. **Tests:** extend the module tests: windup emission thresholds, false-cue suppression when out of range, monotonic ramp, muzzle-pop one-shot per projectile id, charger phase windows, ring demotion conditions, capacity respect, tick-determinism (same inputs ⇒ same frame).
8. **Integration notes:** exact push-call changes for the scene threat block (`playcanvas-scene.ts:2198–2265`): new routes for windup wedges/rings and muzzle pops on the existing routed-batch pattern, expected batch capacities, lift values above ground decals but below UI, and the yaw convention `Math.atan2(dirX, -dirY)` already used there.
9. **Verify:** routed gates; after the integrator wires the scene: capture `--iteration wpd-danger --hero greg --seed 3 --capture-times 60,180 --clip-times 60,180`, read the clips: S3 (cue precedes every shot; no orphan cues), S4, S5, S6 by eye; `verify:vfx-flash` must pass. ≤3 tuning iterations.

**Acceptance evidence:** module tests green; gates green; flash audit green; capture folder + your S3–S6 reading; integration notes applied cleanly by the integrator.

**Evidence boundary:** automated + capture reading; reaction-time *feel* is an owner item, recorded pending.

---

### WP-E — Verification, evidence assembly, and status record

**Objective:** Prove the overhaul against the rubric with before/after evidence on fixed seeds, run the full release gate, and leave the repository documentation truthful.

**Read first:** `AGENTS.md`; `REVIEW.md`; this plan §Success rubric; all four `INTEGRATION-NOTES-*.md`; all packet handoffs.

**Exclusive write scope:**

- `docs/vfx/captures/readability-final-2026-07/` (new)
- `docs/status/current.md` (append one section)
- `docs/playtests/visual-readability-owner-checklist.md` (new)

**Steps:**

1. **Full capture matrix:** heroes greg/benny/gracie × seeds 3 and 1234, `--capture-times 5,60,180,300 --clip-times 60,180`, one iteration folder per combo under a `readability-final-2026-07` prefix. Same port/headless fallbacks as WP-0.
2. **Rubric scoring:** write `docs/vfx/captures/readability-final-2026-07/RUBRIC.md`: for S1–S12, pass/fail + the specific file (still/sheet/clip/test output) that shows it, with baseline-vs-final references for S1–S9. Read the images; do not score from code.
3. **Full gates:** `npm run verify:release` (expect supply-chain, packages, assets, content, artifact, served-build, and 180-s flash gates); `npm --prefix apps/web-toy run verify:agent-smoke`. Record exact results.
4. **Golden proof:** rerun `npm --prefix apps/web-toy run test -- test/golden-replay-corpus.test.ts test/hash-parity.test.ts test/stress-parity.test.ts` and state plainly that golden values are unchanged from before WP-0.
5. **Status record:** append to `docs/status/current.md` a dated "Visual readability overhaul" section: what changed per package, the rubric table result, and an explicit evidence boundary (automated + agent capture-reading only; owner visual approval and human playtest pending).
6. **Owner checklist:** write `docs/playtests/visual-readability-owner-checklist.md` — a 5-minute route: start `?hero=greg&seed=1234`; can you find Scout instantly at 0:10, 1:00, 3:00? does she visibly stride/stop/turn? dodge the first spitter shot on reaction — did you see it coming twice (cue, then projectile)? name each of your attack families on sight at level 8+; do the yellow-ish rings ever feel louder than real danger? Rate each 1–5 with a notes column.
7. If any rubric item fails: do **not** patch code (out of scope) — file the failure precisely (which item, which capture, suspected owning packet) in the handoff as the next bounded task.

**Acceptance evidence:** capture matrix + RUBRIC.md; verify:release and agent-smoke outputs; status/checklist docs; handoff separating automated vs. pending-human evidence.

---

## Appendix A — Global guardrails (binding for every packet)

1. **Read `AGENTS.md` first.** Its boundaries override anything ambiguous here. Work only in `/Users/adammuncie/GameDev/AnimalSurvivor`.
2. **No Git state actions.** No commit, push, merge, branch, tag, or deploy. The owner commits at phase gates. Preserve pre-existing working-tree changes; never reformat or "clean up" out-of-scope code.
3. **Determinism is sacred.** Presentation reads snapshots/events; it never writes sim state, never uses wall-clock time, `Math.random`, or per-frame allocation in steady state. If `golden-replay-corpus`, `hash-parity`, `determinism`, or replay tests fail, your change leaked into the sim: revert and report. **Never run `golden:propose` under this plan.**
4. **Flash budget:** any change that animates luminance must keep `npm --prefix apps/web-toy run verify:vfx-flash` (≤3 reversals/sec/cell, 180 s) green.
5. **No new dependencies, no network at runtime, no browser-storage additions.** Fixed-capacity instanced batches only; `perf.test.ts` and `render-stress-snapshots.test.ts` must stay green.
6. **Assets:** editing/adding any runtime PNG/JPEG requires the reencode + ledger flow (`assets:reencode-runtime-pngs`, ledger hash rows, `verify:assets` green) and a provenance note per `docs/release/` conventions.
7. **Quality gates:** TypeScript strict typecheck, `eslint --max-warnings 0`, and the package test suites routed by `verify:changed` are all mandatory before handoff.
8. **Environment:** run on the owner's Mac. `vfx:capture` needs a local port: on `listen EPERM`/`EADDRINUSE` retry `--port 5211` then `5223`; prefer headed Chromium, fall back to `--headless` (SwiftShader) and record the fallback; if capture is impossible, write `BLOCKED.md` in the iteration folder (existing convention) and say so in the handoff instead of skipping verification silently.
9. **Captures are for reading.** A capture step passes only when you have opened and *interpreted* the stills/sheets/clips against the rubric, and written what you saw.
10. **Handoff:** end with the `AGENTS.md` compact handoff block (Outcome / Scope / Files / Validation / Evidence boundary / Risks / Owner decision).

## Appendix B — Trap list (verified against the working tree, 2026-07-16)

1. `apps/web-toy/src/contracts.ts` header forbids swarm edits — only WP-0's single authorized amendment touches it.
2. Instanced store signature is `push(x, z, scaleX, scaleY, scaleZ, lift = 0, yawRadians = 0)`; ribbons via `pushRibbon(startX, startZ, endX, endZ, width, lift)`. World→scene mapping is `sceneX(x) = x - worldHalfWidth`, `sceneZ(y) = worldHalfHeight - y` (see usage in `playcanvas-scene.ts`); never invent new coordinate math — copy the existing conversions. Direction→yaw: `Math.atan2(dirX, -dirY)`.
3. Routed VFX batches share **one averaged opacity per batch** (`recordRoutedBatchOpacity`/`syncRoutedBatchOpacity` in `playcanvas-scene.ts`). Per-instance alpha is not available through them — encode urgency/age in scale and palette buckets, or (integrator option) split one palette into fresh/fading twin batches. Do not rebuild the instancing system.
4. Enemy snapshot `velocityX/velocityY` are always 0 by design; derive enemy heading/closing speed from previous-vs-current snapshot positions.
5. Charger phase mirror is exactly `(tick + (id & 31)) % 180` with windup `< 24`, lunge `< 60` (`packages/sim/src/combat.ts:131–143`), using the full snapshot entity id (not `idSlot(id)`).
6. The camera is near-top-down orthographic (`orthoHeight` 190): **Y-axis (lift) motion is visually dead**. Readability motion must live in XZ scale/rotation/position.
7. ACES tonemapping is on (`playcanvas-scene.ts` camera setup): saturated additive stacks distort unpredictably — prefer value (whiteness/darkness) over saturation for emphasis.
8. Painted cards must scale uniformly; non-uniform stretch of illustrated art is the known amateur tell (July 13 finding F5) — express length via geometry, not stretch.
9. Presentation modules are unit-tested as **pure descriptor logic** (happy-dom, no WebGL): keep new visual logic in descriptor-producing functions with named exported constants so tests can assert them; follow `enemy-threat-presentation.ts` as the pattern.
10. The hero's sim id is `greg` everywhere (`?hero=greg`); "Scout" is display-name only (`hero-roster.ts` VISUALS). Do not rename ids.
11. `hostileShotCooldown` is canonically serialized authoritative state (`packages/sim/src/simulation.ts` state writer ~line 2001). Reading it is safe; any write path from the app would corrupt runs — the WP-0 view must be typed `Readonly<...>` and documented as presentation-only.
12. Reserved palette lanes (S8): coral/red = incoming danger; ivory = hero + hit sparks; mint/gold = rewards/XP. Attack families and ground/props must not borrow these.
13. RUN_ENEMY_ROLE codes: regular 0, elite 1, boss 2, ranged 3, charger 4, denial 5, flanker 6, support 7 (`packages/sim/src/run-enemy-content.ts:14–23`).
14. `ENEMY_THREAT_BREATH_PERIOD_TICKS = 120` (0.5 Hz at 60 tps) is the maximum breathing rate for persistent loops — reuse it.

---

## 5. Step 5 — Self-review (issues found in the draft instructions)

1. **WP-A/WP-D ordering hazard:** WP-D tunes danger brightness against the floor WP-A changes; if run in parallel their captures disagree. → Resolved: WP-D is Phase 2, strictly after WP-A integration (already reflected in the phase table).
2. **`attackCharge` false positives:** cooldown freezes out of range, so a stale high charge could show a cue for an enemy that isn't about to fire. → Resolved: WP-D step 1 requires the distance gate; WP-0's test asserts monotonic rise only in range.
3. **Same-file collision between hero anchor and Scout gait** (both in `hero-presentation.ts`/`procedural-animal-presentation.ts`) if split across two agents. → Resolved: merged into single WP-B.
4. **Numeric contrast metrics** (luminance deltas) originally specified for S1/S2 would require new image tooling (violates no-new-deps). → Resolved: rubric uses the existing gray contact sheets + explicit human-readable pass conditions; the flash audit remains the only numeric gate.
5. **Per-instance opacity assumption:** early draft of WP-D assumed per-projectile alpha; the shared-batch constraint makes that wrong. → Resolved: trap 3 + WP-D step 2 encode age in scale, integrator may split batches.
6. **Test-expectation churn:** WP-B/WP-C will break existing presentation unit tests that assert current amplitudes. Unbounded "fix tests" instructions are dangerous (agents may weaken assertions). → Resolved: packets say expectations move to *named constants* and get deliberately rebaselined; golden sim values are explicitly excluded from any rebaselining.
7. **Capture-port failures** (today's real `EPERM` blocker) could silently kill every verification loop. → Resolved: guardrail 8 gives the retry ladder and the `BLOCKED.md` convention; WP-0 decouples code work from capture success.
8. **Vignette location uncertainty:** WP-A step 3 assumes the vignette lives in its owned files; it may live in the scene/camera. → Resolved: the step now says "if it lives in `playcanvas-scene.ts`, spec the change in integration notes instead of editing".
9. **Scene-block line numbers** (2198–2265, 2206–2226) will drift as the integrator applies successive notes. → Resolved: numbers are labeled as audit-time anchors; integrator applies notes by pattern (the threat/projectile block), not by line.

## 6. Step 6 — Steelman and resolve

- **"Add a real sim windup instead of a cosmetic cue — it's better design."** Defense of the original: a sim windup changes combat timing, invalidates golden replays, alters difficulty the owner just re-tuned in V1.2, and requires balance authority no packet has. The read-only cue delivers the *player-facing* outcome (you see shots coming) at zero determinism risk; a designed windup remains a clean future owner-approved content change. **Defense holds — no sim behavior change.**
- **"Integrator-owned `playcanvas-scene.ts` is a bottleneck; let packets edit disjoint regions."** Defense of the original: the file is 3,130 lines with shared batch registries and one render loop; "disjoint regions" is an illusion (routes, capacities, and opacity sync are global). One serializing owner is the repo's proven pattern and the failure mode it prevents (merge corruption by four agents) is far costlier than the wait. **Defense holds — integrator keeps exclusive ownership.**
- **"Cutting the numeric contrast metric makes S1/S2 subjective."** Defense of the fix (keeping it cut): agents *can* read images directly — that's stronger than a proxy number computed by fragile new tooling; the gray sheets make value contrast obvious; and the truly enforceable gates (flash, tests, hashes) stay numeric. Partially strengthened instead: S1/S2 now name the exact artifact (gray sheet) and the exact question to answer, and WP-E scores them with before/after references. **Fix retained, sharpened.**
- **"Six packets is too much process for 'make it readable'."** Defense of the original: the July 13–15 history shows exactly what unstructured iteration produced — five hours of blind asset regeneration and a flash-gate scramble. The packet structure exists because agents without exclusive scopes and mandatory capture-reading *did* fail here before. **Defense holds — structure stays.**
- **Post-resolution pass:** re-read of the final packet set found two residual nits, both fixed inline: WP-B's dust puffs needed an explicit "no scene wiring unless noted" clause (added), and WP-0's step 2 needed the "captures may block, code work proceeds" decoupling stated explicitly (added). No further issues found.

---

*End of plan. Hand WP-0 to the first agent.*

---

## Execution closeout — 2026-07-16

**Technical execution status: complete.** The packet sequence was executed in
the required order: WP-0 supplied the read-only snapshot boundary and baseline;
WP-A separated figures from the floor; WP-B established the hero anchor and
camera-plane locomotion; WP-C added authored cast/cohesion controls; WP-D made
incoming danger visible; and WP-E assembled the evidence, owner checklist, and
status record. No packet introduced a new gameplay authority or changed a
golden expectation.

### Completion evidence

- **S1–S12 technical rubric:**
  [`docs/vfx/captures/readability-final-2026-07/RUBRIC.md`](docs/vfx/captures/readability-final-2026-07/RUBRIC.md)
  records headed-compositor and test evidence for every criterion. It includes
  the final near-camera role-4 charger lifecycle, source-correlated ranged
  windup-to-shot proof, and only the bounded technical claim for warning
  hierarchy.
- **Every damaging player treatment:**
  [`ATTACK-FAMILY-CLOSURE.md`](docs/vfx/captures/readability-final-2026-07/ATTACK-FAMILY-CLOSURE.md)
  links a direct normal-run lifecycle for the current source set. Old blocked
  seed attempts and aggregate reports remain visible rather than being
  overwritten or relabeled as passes.
- **Independent technical review:** the composition, combat/danger, and
  evidence-integrity reviewers all approved the corrected packet; their exact
  technical scope and human-evidence limitation are in
  [`TECHNICAL-REVIEW-PANEL.md`](docs/vfx/captures/readability-final-2026-07/TECHNICAL-REVIEW-PANEL.md).
- **Automated release evidence:** web suite passed **99 files / 564 tests**;
  golden/hash/stress replay subset passed **3 files / 8 tests** with existing
  expected values; `npm run verify:release` passed the package, asset, content,
  artifact, served-artifact, and VFX-flash gates; and
  `npm --prefix apps/web-toy run verify:agent-smoke` passed its visible WebGL2
  Start/Pause/Resume proof plus its explicitly non-player-visible terminal
  lane. The post-capture harness adjustment also passes web lint and
  `node --check`.

### Evidence boundary (still binding)

This completes the plan's **technical** definition of done. It does not make a
human visual-standard claim. The actual human completion condition is still
three independent, uncoached people completing
[`docs/playtests/visual-readability-owner-checklist.md`](docs/playtests/visual-readability-owner-checklist.md)
on the owner hardware. Until those answers are present, the correct status is
“technical visual evidence passed; human visual approval pending.”
