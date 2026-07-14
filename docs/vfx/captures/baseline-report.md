# P0 visual-capture baseline — 2026-07-13

This is the first real renderer capture set for the attack-VFX production plan. It is evidence, not a release approval.

## Capture facts

- Route: `?autopilot=1&hero=greg&seed=3`, normal speed, fixed seed.
- Browser: headed Chromium with a real WebGL2 context; no SwiftShader fallback.
- Upgrade handling: the harness clicked the first visible real upgrade button 17 times so the normal run could not stall on a level-up dialog.
- Stills: 5s, 30s, 90s, and 180s simulation time.
- Video/contact-sheet evidence: 10-second clips beginning at 30s and 180s, with matching grayscale sheets.
- Flash result: **FAIL**. At 30s the worst 8x8 cell reached 4 swings/second; at 180s it reached 6 swings/second. The hard limit is 3 swings/second at a >0.10 linear-luminance reversal.

The machine emitted one generic HTTP 404 console warning while the run otherwise kept WebGL2 active; it is recorded in `baseline-2026-07-13/report.json` and must be attributed or cleared before final approval.

## Provenance warning

The renderer was shared with parallel P1/P2 work while this normal-speed run was in progress. The images accurately show the integrated state captured at their listed ticks, but they must **not** be represented as a pristine pre-P1 before-image. The next post-merge phase capture is the valid before/after comparator.

## Rubric score (harsh baseline)

| # | Criterion | Score / 10 | Evidence-based observation |
| --- | --- | ---: | --- |
| 1 | Attack silhouette in grayscale | 3 | Fox swipes can be found, but the grayscale 180s sheet is dominated by pickup specks and does not make every attack family legible. |
| 2 | No visible frame pop | 2 | The 30s and 180s strips show brief card-like slash appearances/disappearances rather than a continuous readable motion path. |
| 3 | Clean edges | 4 | No obvious magenta block is present in the captured frames, but the painted cards still read as hard-cut stickers at contact-sheet scale. |
| 4 | Ground/contact anchoring | 3 | The fox card has a ground direction, yet most hit feedback lacks a distinct contact ring, shadow, or debris anchor. |
| 5 | Distinct in/hold/out motion | 2 | Effects mostly arrive and vanish within a few sampled frames; the captures do not show a reliable eased release. |
| 6 | Archetype motion identity without color | 3 | The fox family is distinguishable, but dense XP and hit text obscure other family-specific motion language. |
| 7 | Palette discipline | 3 | Cyan XP dominates the high-density sheet and competes with combat reads; the player-effect lane is not visually isolated. |
| 8 | Additive restraint | 4 | There is no full-frame white blowout, but burst/highlight clusters still compete with the illustrated body rather than framing it. |
| 9 | Flash safety | 0 | Automated gate fails: 4 swings/s at 30s and 6 swings/s at 180s. |
| 10 | Forest/enemy readability at barrage density | 3 | The 180s grayscale sheet makes the play space, enemy silhouettes, and attack read difficult to separate. |

**Result: 2.7 / 10 average; not eligible to close a phase.** The zero flash-safety score alone blocks approval.

## Three most important defects visible in the evidence

1. **Dense cyan pickup noise overwhelms attack hierarchy.** The 180s color and grayscale contact sheets are full of small high-contrast specks, so the player, enemies, and attack bodies lose priority.
2. **Attack timing still reads as stickers, not motion.** Fox-frame appearances are recognizable, but their short hard transitions do not establish anticipation, contact, and release.
3. **The capture policy does not prove all player attacks.** This deterministic route reached level 11 but naturally exercised only a narrow loadout. Later phase acceptance needs forced-loadout capture cases in addition to this normal-play proof.

## Evidence files

- `baseline-2026-07-13/still-5s.png`
- `baseline-2026-07-13/still-30s.png`
- `baseline-2026-07-13/still-90s.png`
- `baseline-2026-07-13/still-180s.png`
- `baseline-2026-07-13/contact-sheet-30s.png` and `contact-sheet-30s-gray.png`
- `baseline-2026-07-13/contact-sheet-180s.png` and `contact-sheet-180s-gray.png`
- `baseline-2026-07-13/flash-audit-30s.json`, `flash-audit-180s.json`, and `report.json`
