# P2 signature renderer evidence

This directory contains event-matched, normal-speed renderer frames. It is not a synthetic effect preview.

## Exact command

```sh
cd /Users/adammuncie/GameDev/AnimalSurvivor/apps/web-toy
node scripts/p2-signature-evidence.mjs --iteration p2-rendered-final-r23-2026-07-14 --seed 3
```

- Server mode: production-preview.
- Browser: headed Chromium with hardware WebGL2 and Playwright compositor recording.
- Each target uses an isolated Chromium process so a renderer failure cannot contaminate another target.
- Each target discovers a run from a public, authoritative `driver.traitPresentationEvents` record on its own event tick. Event discovery is not automatically a visual-card claim.
- Each target records a fresh Playwright compositor video and takes headed compositor screenshots only after rAF observes the live driver inside its named review window. The capture momentarily pauses the public presentation control after the live tick is reached so the compositor can hold that already-rendered frame; it does not alter simulation state, events, transforms, or textures. Because those holds are recorded, this P2 WebM is provenance-only rather than continuous-motion proof.
- A page-owned rAF probe records only authoritative event/tick timing. It does not capture pixels or mutate the game.
- After the context closes, Playwright bundled ffmpeg extracts three consecutive source-video frames beginning strictly after the first normal-rAF sample whose driver tick advanced beyond the event.
- No driver wrapper, timing override, input/event injection, or renderer-state mutation is used. The documented phase screenshots momentarily pause only the public presentation control after the live phase is rendered.
- The supporting video strip labels record source-video frame index and real PTS. Its nearest-rAF timing is explicitly approximate because compositor encoding is buffered; it is not used as visual-tick or continuous-motion proof.
- `report.json` pins the active signature atlas, dedicated signature-body atlas, impact core, family debris strip, ground-contact texture, and atlas-router/motion/composite/scene source SHA-256 values compiled into this preview.
- Greg uses early, mid, and near-terminal anatomy review. Its optional zero-envelope frame is admitted only when the public journal proves every event that can paint the illustrated foxSwipe family is past its inclusive renderer lifetime and no later same-source or family-alias event contaminated the selected cast; otherwise supplementary evidence is explicitly `unavailable`. It does not make a programmatic canvas-pixel transparency claim.
- Benny uses first-ridge early, first-ridge mid, and first-ridge pre-next-ridge only: its real second ridge begins at +7 while the first can still be visible, so no overlap image is called a first-ridge release. `report.json` records the complete observed grouped burst and explicitly marks `releaseFrameClaimed: false`. It may add `after-complete-burst-zero-envelope` only when the selected group has expired without an independent later wave on or before that expiry; otherwise supplementary evidence is explicitly `unavailable`.
- Gracie’s telegraph is launch discovery only. The reviewer must use the exact locked packed `heroSpit` id in `report.json`; every selected anatomy screenshot records a live `driver.curr` snapshot with its x/y/velocity before, during, and after the screenshot. An optional impact/contact frame is admitted only if a public `gracie-spit` `enemyHit` position agrees with that exact locked projectile trajectory; a missing correlation is reported as unavailable, not inferred from projectile disappearance. No telegraph-card visual is claimed.
- Every signature target also includes `rendered-milestone-*-strip.png` files for truthful named-phase anatomy review. Each image records its requested window plus live driver ticks immediately before and after its compositor screenshot. Window membership alone never earns a pass.
- `focus-2x-*` files are true 2x 640×432 CSS-pixel crops scaled to 1280×864. Each target uses a fixed reported hero/action-local anchor chosen before capture; crops are made only after compositor video closes and never read or alter the live canvas.

## Targets and predicates

- **Greg — Fox Swipe** — `meleeArc` / `greg-fox-swipe` / `meleeArcResolved=true`. Single-event early/mid/near-terminal anatomy evidence with optional post-family-zero proof that rejects later same-source and foxSwipe-family alias events.
- **Benny — Trample Earth Wave** — `telegraph` / `benny-trample` / `benny-trample-wave`. Grouped sequential-ridge evidence: first-ridge-only anatomy through Δ6; complete real burst journal required; no first-ridge release frame claimed. Post-group zero-envelope proof is optional and must reject independent-wave overlap.
- **Gracie — Spit Comet** — `telegraph` / `gracie-spit`. Public snapshot-projectile evidence: cast telegraph is discovery-only; exact live current-snapshot heroSpit id is required for all anatomy frames; impact/contact additionally requires source-and-trajectory correlation or is reported unavailable; no telegraph card claimed.

Each target folder includes `compositor.webm`, `full-f0..f2.png`, 2x color/grayscale crops, supporting video strips, and phase-timed `rendered-milestone-f*.png` compositor screenshots with matching strips. When a supplementary release or contact frame is admissible it is emitted as `rendered-supplementary-*.png` with a one-frame strip; otherwise `report.json` records why no such frame is claimed. `report.json` records the live event, screenshot timing contract, source provenance, and video timing journal.
