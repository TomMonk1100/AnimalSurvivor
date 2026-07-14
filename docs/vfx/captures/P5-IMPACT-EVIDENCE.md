# P5 Impact-Framing Evidence Route

This is the deterministic visual-evidence route for P5’s two renderer-only
effects: the three-tick white enemy hit flash and the five-tick camera shake
for a real qualifying critical hit.

From `apps/web-toy`, run:

```bash
node scripts/p5-impact-evidence.mjs --iteration p5-impact-proof --live --preview --headed
```

The script starts a fixed-seed normal-speed autopilot run, continues real DOM
upgrade choices, and watches the public read-only
`window.__webToy.driver.combatPresentationEvents` array. It never injects an
event or changes the renderer/simulation.

The default exact-tick pass is lifecycle support: after the app’s own rAF has
already rendered a matching event, it uses the existing pause control to hold
that visible tick, then resumes exactly one normal fixed tick at a time. The
page-local harness supplies the existing driver exactly one 1/60s timestamp
interval only during those frozen proof steps, avoiding screenshot readback
accidentally consuming two ticks. It does not change input, event arrays,
snapshots, or simulation state and disappears when the browser context closes.

`--live` adds the panel-facing visual closure. It does **not** pause the app or
replace its clock: it records only small timing metadata in consecutive normal
`requestAnimationFrame` callbacks starting with the same real event frame.
After the browser closes, it extracts the target-relative PNGs from
Playwright's compositor-owned video. That avoids a WebGL readback or
`canvas.toDataURL()` disturbing the live rAF cadence. Every metadata sample
records its observed render tick, so a reviewer sees honest tick deltas rather
than an artificially stepped strip.

Acceptance capture uses `--preview --headed`: the report records the served
route, seed, event IDs, Git HEAD, and SHA-256 hashes for the P5 renderer,
flash policy, camera-shake policy, and capture script. This pins a review to
the exact source bytes even when the shared worktree is not yet committed.

For accurate compositor-video alignment, the live pass adds a temporary
magenta DOM timing marker only after the real renderer event has been drawn.
It is capture-only, outside the target-relative crop, removed before browser
close, and never writes game renderer or simulation state.

Each output directory contains:

- `flash/flash-tick-strip-2x.png` and `flash/flash-observed.webm`: exact ages
  0, 1, 2, and the release at 3 in clean target-relative crops, plus the
  real-time renderer recording around the same event.
- `shake/shake-tick-strip-2x.png` and `shake/shake-observed.webm`: exact ages
  0–4 and the release at 5 in a clean fixed-screen terrain patch, plus the
  real-time renderer recording around the same event. The report includes a
  fixed-screen residual measurement and the fresh-critical policy world offset
  path (hard-capped at two world units).
- Raw full-frame PNGs, individual 2× crops, `report.json`, and an evidence
  README containing the actual event/tick/target provenance.
- With `--live`: `live-flash/flash-normal-raf-target-relative-strip-2x.png`
  follows the struck enemy rather than the screen center, while
  `live-shake/shake-normal-raf-fixed-screen-strip-2x.png` keeps the player,
  struck enemy, and terrain landmarks together across normal-speed frames.
  `live-shake/shake-camera-displacement-2x.png` compares a textured fixed
  screen patch and separates raw scene movement from normal player-follow
  movement.

The judgeable 2× strips have no reticle or timing marker over the target.
The temporary marker exists only in retained full compositor frames for the
live timing anchor and is excluded from target crops. No debug UI or extra
visual effect is added to the game. The videos are ordinary real-time
Playwright recordings, trimmed around the observed event.

Use `--headed` to require the preferred real-GPU path, `--headless` to force
SwiftShader, and `--max-seconds 120` if a selected seed takes longer to produce
its first eligible, on-screen fresh critical hit.
