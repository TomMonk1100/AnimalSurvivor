# Visual Readability Overhaul — Technical Evidence Record

**Renderer cutoff:** 2026-07-16. Subsequent changes in this packet are capture
harness selection/reporting only; the renderer-source manifest is recorded in
each focused report. This is an engineering record, not human visual approval.

## Evidence contract

- The six normal-run folders were captured from a production preview in
  **headed Chromium with WebGL2**, using normal autoplay and real DOM upgrade
  choices. No renderer or simulation event was injected.
- Targeted family captures use the same production-preview contract. They pause
  the public presentation control only after an authentic event/snapshot is
  observed, so a still can hold a truthful tick window; they are not presented
  as uninterrupted gameplay footage.
- Screenshots and grayscale sheets were opened during this review. Passing JSON
  alone was not treated as a visual pass.
- A generic missing-resource `404` appears in some browser-message arrays. It
  is retained as evidence; no row below claims a clean browser console.

## Normal-run capture matrix

| Hero / seed | Final folder | Milestones obtained | Motion clips / flash audit | Terminal record |
| --- | --- | --- | --- | --- |
| Greg / 3 | [report](../readability-final-2026-07-greg-s3-closure-r2/report.json) | 5, 20–21.75 gait strip, 60, 180, 285, 300 | 60, 180, 285 — pass; worst 2, 3, 3 swings/s | none |
| Greg / 1234 | [report](../readability-final-2026-07-greg-s1234-closure-r2/report.json) | 5, 20–21.75 gait strip, 60, 180, 285 | 60, 180, 285 — pass; worst 1, 2, 2 swings/s | victory at tick 17,720 before 300 s |
| Benny / 3 | [report](../readability-final-2026-07-benny-s3-matrix-r2/report.json) | 5, 20–21.75 gait strip, 60, 180 | 60, 180 — pass; worst 3, 2 swings/s | defeat at tick 15,748 before 285 s |
| Benny / 1234 | [report](../readability-final-2026-07-benny-s1234-matrix-r2/report.json) | 5, 20–21.75 gait strip, 60, 180, 285, 300 | 60, 180 — pass; worst 2, 2 swings/s | victory after the 300 s still |
| Gracie / 3 | [report](../readability-final-2026-07-gracie-s3-matrix-r2/report.json) | 5, 20–21.75 gait strip, 60, 180, 285 | 60, 180 — pass; worst 2, 3 swings/s | victory at tick 17,780 before 300 s |
| Gracie / 1234 | [report](../readability-final-2026-07-gracie-s1234-matrix-r2/report.json) | 5, 20–21.75 gait strip, 60, 180, 285 | 60, 180 — pass; worst 2, 2 swings/s | victory at tick 17,674 before 300 s |

The missing late milestones are documented terminal outcomes, not skipped
timeouts or substituted frames. The runner stops at a genuine victory or
defeat and never invents a post-run image.

## Baseline comparison sources

The pre-overhaul fixed-route references are
[Greg / 1234](../readability-baseline-2026-07-greg-s1234/report.json),
[Benny / 3](../readability-baseline-2026-07-benny-s3/report.json),
[Gracie / 3](../readability-baseline-2026-07-gracie-s3/report.json), and the
[pre-overhaul 180-second capture](../capture-2026-07-16T16-51-30-972Z/report.json).
They are comparison material, not a human benchmark claim.

## Rubric scoring

| Item | Technical result | Specific final evidence read | Baseline-to-final comparison |
| --- | --- | --- | --- |
| S1 — Hero findability | **PASS — technical capture reading** | The ivory double ring and light hero silhouette remain identifiable in the 60/180 grayscale sheets: [Greg / 3 at 180](../readability-final-2026-07-greg-s3-closure-r2/contact-sheet-180s-gray.png), [Benny / 1234 at 180](../readability-final-2026-07-benny-s1234-matrix-r2/contact-sheet-180s-gray.png), and [Gracie / 3 at 180](../readability-final-2026-07-gracie-s3-matrix-r2/contact-sheet-180s-gray.png). | The pre-overhaul [180-second gray sheet](../capture-2026-07-16T16-51-30-972Z/contact-sheet-180s-gray.png) lacks a comparably persistent reserved-value locator. |
| S2 — Enemy countability | **PASS — technical capture reading** | The same final gray sheets show dark enemy bodies separated from the quieter ground by contact shadows; close packs remain individually countable around the anchor. | The baseline sheet has enemy-shaped dark forms competing with rocks and leaf clusters. |
| S3 — Shot anticipation | **PASS — source-correlated technical evidence** | [Qualifying inhale frame](../readability-final-2026-07-shooter-closure-r7/enemy-shooter-windup/phase-01-pre-fire-cue-t3611.png) is a real in-range ranged enemy at charge 0.85 and distance 339.15; [the linked shot frame](../readability-final-2026-07-shooter-closure-r7/enemy-shooter-windup/phase-02-hostile-shot-t3638.png) is the source-3 hostile projectile 27 ticks later. The [report](../readability-final-2026-07-shooter-closure-r7/report.json) journals both conditions. | Baseline had no read-only attack-charge/windup channel. |
| S4 — Projectile visibility | **PASS — technical capture reading** | [Hostile projectile lifecycle](../readability-final-2026-07-focused-closure-r3/report.json) records head/travel/threat-read compositor stills at ticks 3,638/3,642/3,646; normal 60/180-second clips corroborate the coral core/tail lane. | Baseline did not reserve an explicit hostile core/tail and muzzle lane. |
| S5 — Charger / boss telegraphs | **PASS — near-camera technical capture reading** | A headed source-checked role-4 charger at distance 159.73 has a readable [wind-up start](../readability-final-2026-07-charger-closure-r4/enemy-charger/phase-01-windup-start-t11690.png), [wind-up read](../readability-final-2026-07-charger-closure-r4/enemy-charger/phase-02-windup-read-t11697.png), and [release](../readability-final-2026-07-charger-closure-r4/enemy-charger/phase-03-windup-release-t11706.png); the [report](../readability-final-2026-07-charger-closure-r4/report.json) enforces the <=180 player-distance bound. [Greg / 3 at 285](../readability-final-2026-07-greg-s3-closure-r2/contact-sheet-285s.png) shows the arena-scale boss lane. | Baseline lacked this distinct boss/charger hierarchy. |
| S6 — Warning hierarchy | **PASS — bounded technical evidence** | [Contact-versus-projectile target row](../readability-final-2026-07-focused-closure-r3/report.json) captures one source-verified coexistence case, while normal matrix clips and `enemy-threat-presentation.test.ts` verify the closing-contact gate, cap, and demotion policy. It is not a universal human-preference claim. | Baseline had no equivalent capped hierarchy. |
| S7 — Attack cohesion | **PASS — exhaustive source route + direct compositor coverage** | [Attack-family closure record](ATTACK-FAMILY-CLOSURE.md) links a real normal-run lifecycle for every current damaging source/treatment and the exhaustive source-route/palette/fade tests. | Earlier evidence emphasized destination-only effects; current records include real source-attributed runs and cast/lifecycle routes. |
| S8 — Palette law | **PASS — technical capture reading + unit tests** | Final captures reserve coral for danger, ivory for hero/hits, and mint/gold for rewards; `attack-vfx-palette.test.ts` asserts every known trait/fusion lane and exclusions. | Baseline used more unreserved bright green/reward clutter. |
| S9 — Scout locomotion | **PASS — technical capture reading + motion tests** | The six 20.00–21.75-second strips show adjacent pose/stride changes. No-input idle strips for [Greg](../readability-final-2026-07-greg-s3-idle-rest-r5/contact-sheet-1.85s.png), [Benny](../readability-final-2026-07-benny-s3-idle-rest-r5/contact-sheet-1.85s.png), and [Gracie](../readability-final-2026-07-gracie-s3-idle-rest-r5/contact-sheet-1.85s.png) show restrained rest motion; motion tests cap idle breathing and dust. | Baseline strips did not have the final camera-plane gait/anchor treatment. |
| S10 — Flash safety | **PASS** | Every normal clip reports `flashPass: true`; the highest observed cell is 3 swings/s at the stated ≤3 limit. The no-input idle reports also pass. | The earlier failure remains historical evidence and is superseded by repaired captures. |
| S11 — Determinism untouched | **PASS — regression evidence** | `npm --prefix apps/web-toy run test -- test/golden-replay-corpus.test.ts test/hash-parity.test.ts test/stress-parity.test.ts` passed 3 files / 8 tests against the existing expected values; no golden rebaseline was run or authorized. | Regression proof only. |
| S12 — Performance | **PASS — automated regression evidence** | `npm --prefix apps/web-toy run test` passed 99 files / 564 tests, including the existing performance and render-stress coverage; `npm run verify:release` also passed its package, artifact, served-build, and flash gates. | Regression proof only. |

## Final command record

The production renderer evidence was frozen before the final command runs. The
two later harness-only constraint changes add focused proof; they do not change
renderer or simulation behavior.

```text
PASS: npm --prefix apps/web-toy run test — 99 files / 564 tests
PASS: npm --prefix apps/web-toy run test -- test/golden-replay-corpus.test.ts test/hash-parity.test.ts test/stress-parity.test.ts — 3 files / 8 tests
PASS: npm run verify:release — package, assets, content, artifact, served-artifact, and VFX-flash gates; final output: all deterministic and artifact gates passed
PASS: npm --prefix apps/web-toy run verify:agent-smoke — WebGL2 Start/Pause/Resume proof plus bounded terminal route; browser/server closed
PASS: npm --prefix apps/web-toy run lint — current capture-harness source, no warnings
PASS: node --check apps/web-toy/scripts/vfx-family-evidence.mjs — current capture-harness syntax
PASS: git diff --check — no whitespace errors
```

## Evidence boundary and human decision

This record establishes capture provenance, renderer-facing visual evidence,
flash-audit results, and—once the command record is filled—automated regression
evidence. It cannot establish comfort, readability, fairness, accessibility,
or acceptance on real people’s displays.

The requested human visual standard requires three independent people to
complete [the unfilled owner checklist](../../../playtests/visual-readability-owner-checklist.md).
Until that happens, the project may state **technical visual evidence passed**
but must not state **human visual approval passed**.
