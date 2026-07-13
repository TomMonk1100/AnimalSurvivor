# Parallel Swarm Handoff: Browser Technical Toy

## Copy-paste assignment

You are a coding-only agent swarm working in the AnimalSurvivor repository.
Build the first browser technical toy under this exclusive ownership boundary:

```text
apps/web-toy/
```

Do not edit anything outside that directory. In particular, do not modify the
accepted simulation at `packages/sim/`, root files, docs, assets, Gate 0
artifacts, or Git metadata. You may read and import the simulation's public API.

Use strict TypeScript, Vite, and the standalone MIT PlayCanvas Engine, as fixed
by `docs/decisions/0003-web-3d-stack.md`. This is code work only: do not generate,
download, edit, or replace images, models, textures, animation, audio, or visual
concepts. Use programmatically created primitive meshes and flat debug materials.

## Objective

Prove that the accepted deterministic simulation can drive a responsive WebGL 2
browser game shell without allowing rendering, frame rate, or input devices to
change gameplay state.

Deliver a runnable page with:

- one automatically attacking player represented by a primitive;
- pooled primitive views for enemies, projectiles, and pickups;
- orthographic or high-angle follow camera;
- keyboard movement and a pointer/touch virtual joystick;
- fixed-tick simulation stepping behind a render adapter;
- render interpolation that never mutates simulation state;
- pause, restart-with-seed, and debug/performance controls;
- a compact diagnostic HUD for FPS, frame time, sim ticks, live/high-water pool
  counts, catch-up ticks, dropped accumulated time, and current state hash;
- a deterministic five-minute autopilot stress mode.

Do not add upgrade design, final animal attacks, menus, save data, monetization,
backend services, analytics, or production art. This is the Gate 1 integration
and rendering-performance toy only.

## Frozen integration rules

1. Import from `../../packages/sim/src/index.ts` through a Vite alias or
   another app-local adapter. Never copy simulation source into the app.
2. The simulation is authoritative. Rendering reads public player/pool state and
   per-tick events; it never writes positions, health, timers, RNG, or entity
   lifetimes.
3. Drive simulation at `config.hz` using an accumulator around
   `requestAnimationFrame`. Limit catch-up work per frame and record discarded
   backlog as a diagnostic; never pass wall-clock delta into simulation logic.
4. Produce exactly one canonical `TickInput` per simulation tick. Keyboard,
   touch, and autopilot all feed the same input interface. There is no aiming.
5. Copy any `SimEvents` values needed after a tick because the simulation reuses
   the event object.
6. Map render views by generation-guarded entity ID, not slot alone. A reused
   pool slot must not retain stale visual state.
7. Interpolation may use app-owned previous/current transform snapshots only.
8. Do not step simulations reentrantly or concurrently in one JS isolate.
9. Hidden tabs must not create an unbounded catch-up burst on return.
10. No runtime network calls, API keys, paid services, or telemetry.

## Suggested app-local structure

```text
apps/web-toy/
  src/
    main.ts
    app.ts
    sim/simulation-driver.ts
    sim/renderer-adapter.ts
    input/input-controller.ts
    input/keyboard.ts
    input/virtual-joystick.ts
    render/playcanvas-scene.ts
    render/entity-view-pool.ts
    render/interpolation.ts
    diagnostics/performance-monitor.ts
    diagnostics/debug-hud.ts
    stress/autopilot.ts
  test/
  index.html
  package.json
  package-lock.json
  tsconfig.json
  vite.config.ts
  README.md
```

The exact split may change, but keep simulation driving, input, rendering, and
diagnostics independently testable.

## Rendering constraints

- WebGL 2 baseline; WebGPU is optional and must not be required.
- One shared unlit or inexpensive flat material per primitive category.
- Preallocate or pool views; no entity/view construction in the steady-state
  frame loop.
- Avoid a unique material per unit.
- Use batching, instancing, or another measured low-draw-call approach for
  repeated enemies. Document the chosen PlayCanvas path and its fallback.
- Resize correctly for desktop and mobile device pixel ratios, with an app-local
  resolution cap to prevent extreme fill cost.
- Context loss and restoration must fail visibly and must not corrupt sim state.
- No DOM node creation per frame; update existing HUD text at a throttled rate.

## Input requirements

- WASD and arrow keys produce the same movement vector.
- Opposite keys cancel; diagonal magnitude is at most 1.
- Pointer/touch joystick handles pointer capture, cancellation, resize, and
  release outside its region without leaving movement stuck.
- Page scrolling/zoom gestures are prevented only inside the game input surface,
  not globally.
- Losing window focus clears active input.
- Autopilot uses a pure deterministic function of simulation tick, not time.

## Automated tests

At minimum cover:

- accumulator advances the exact expected tick count for a sequence of frame
  deltas;
- catch-up cap and hidden-tab reset prevent a spiral of death;
- renderer-on and renderer-off runs with the same seed/input finish with the same
  simulation hash;
- interpolation reads snapshots without mutating pools or player state;
- generation changes release/reset a stale view before slot reuse;
- keyboard cancellation and diagonal normalization;
- pointer cancel/focus loss clears touch movement;
- autopilot is a pure deterministic function of tick;
- no app source calls `Math.random` for gameplay or writes simulation component
  arrays/player fields;
- production build succeeds with no runtime dependency on Node APIs.

Do not use snapshot tests for WebGL pixels. Test behavior and contracts.

## Manual/browser acceptance harness

Provide an app-local documented command that serves the page and a stress-mode
URL or control. The integration lead must be able to verify:

- normal keyboard play;
- simulated 390 x 844 touch layout without horizontal overflow;
- pause/resume and restart by explicit seed;
- five-minute deterministic autopilot;
- approximately 1,000 live enemies and up to 500 projectiles without console
  errors or unbounded view/DOM growth;
- final state hash matches a headless control run fed the same tick inputs;
- displayed frame-time and draw-call evidence is clearly labeled as local
  hardware evidence, not a universal pass threshold.

If browser automation is available, automate these checks. Do not download a
new browser binary solely for this task; use an installed browser or return the
manual harness with exact steps.

## Required commands

From `apps/web-toy/`, provide and run:

```text
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Also provide a documented local serve/stress command. Keep dependencies small;
explain every runtime dependency. PlayCanvas should be the only runtime game
dependency unless the lead gives a concrete reason otherwise.

## Swarm decomposition

The lead freezes app-local contracts and package configuration first, then uses
non-overlapping ownership:

- Agent A: fixed-tick driver, renderer adapter, interpolation snapshots, and
  renderer-on/off hash tests.
- Agent B: PlayCanvas scene, pooled/generation-safe views, batching/instancing,
  resize, and context handling.
- Agent C: keyboard/touch input unification, deterministic autopilot, HUD, and
  performance monitor.
- Agent D or lead: integration, browser harness, contract tests, build/lint,
  five-minute stress verification, and final review.

Agents must not independently redefine shared adapter/view/input contracts.

## Required handoff

Return:

1. architecture and renderer/simulation boundary summary;
2. exact commands and pass/fail results;
3. dependency and license list;
4. local stress results: runtime/browser/hardware, FPS/frame-time percentiles,
   draw calls if available, live/high-water counts, memory signal, final hash;
5. renderer-on versus headless-control hash comparison;
6. known limitations and browser checks not performed;
7. commit hash or patch containing only `apps/web-toy/`.

Do not claim production readiness. This handoff proves the browser integration
and identifies the next rendering bottleneck.
