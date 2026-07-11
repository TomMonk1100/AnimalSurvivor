# web-toy — Gate 1 browser technical toy

Proves the accepted deterministic simulation at `spikes/headless-sim/` can drive
a responsive WebGL 2 browser game shell **without letting rendering, frame rate,
or input devices change gameplay state**. The repeated swarms remain
programmatically-created instanced primitives. Greg now uses the audited local
Quaternius fox glTF with authored animation plus coded socket attachments; there
is still no audio, backend, telemetry, or paid runtime service.

Everything lives under `apps/web-toy/`. Nothing outside this directory is
modified; the simulation is consumed read-only through the `@sim` alias.

## Quick start

```bash
cd apps/web-toy
npm ci
npm run typecheck
npm run lint
npm test
npm run build

# Serve locally (Vite dev server, default http://localhost:5173):
npm run dev            # or: npm run serve  (adds --host for device/mobile testing)
```

Open the served page. Move with **WASD / arrow keys** (desktop) or the
**bottom-left virtual joystick** (touch). The player auto-attacks the nearest
enemy in range; there is no aiming.

### URL controls & on-screen buttons

| Control | Effect |
| --- | --- |
| `?seed=<number or text>` | Start with an explicit seed (text is hashed to a 32-bit seed). Default `0x1234abcd`. |
| `?autopilot=1` | Boot straight into deterministic autopilot. |
| `?autopilot=1&stress=1` | Run five simulation ticks per rendered frame and auto-pause at tick 18,000. |
| `?autopilot=1&stress=1&renderstress=1` | Also feed 1,000 enemies, 500 projectiles, and 200 pickups to the GPU without changing simulation state/hash. |
| **Pause / Resume** | Halts stepping. A paused frame advances no clock, RNG, or entity state. |
| **Restart w/ seed** | Rebuilds the simulation from the seed in the text box (deterministic). |
| **Autopilot: ON/OFF** | Toggle the pure-function-of-tick stress driver. |
| **Renderer: ON/OFF** | Detach/attach the GPU renderer while the simulation keeps running — the A/B that demonstrates rendering cannot alter gameplay. |

The app handle is exposed at `window.__webToy` for console-driven checks
(`window.__webToy.driver.hash()`, `.driver.tick`, `.controls`).

## Architecture & renderer/simulation boundary

```
        wall-clock rAF
             │
      ┌──────▼───────────────── app.ts (integration, lead) ─────────────┐
      │                                                                  │
      │  InputSource ──sample(tick)──► SimDriver ──fixed dt steps──► @sim│  ← AUTHORITATIVE
      │  (keyboard/joystick             (accumulator,               (sim)│
      │   OR autopilot)                  catch-up cap,                    │
      │                                  hidden-tab reset)                │
      │                                     │ produces (read-only)        │
      │                                     ▼                             │
      │                        prev / curr RenderSnapshot  ─┐             │
      │                                                     │ interpolate │
      │                        RendererAdapter.render(prev,curr,alpha)    │  ← READS ONLY
      │                        (PlayCanvas WebGL2, generation-safe matrix │
      │                         stores + GPU-instanced category batches)   │
      │                                                                   │
      │  PerformanceMonitor + Hud  ◄── diagnostics (read-only)            │
      └───────────────────────────────────────────────────────────────── ┘
```

The **frozen boundary** is `src/contracts.ts` (lead-owned): `InputSource`,
`RenderSnapshot`/`CategorySnapshot`, `RendererAdapter`, `PerformanceMonitor`,
`Hud`. The renderer, interpolation, and diagnostics only ever *read* app-owned
snapshots. No render/input/diagnostic code writes simulation positions, health,
timers, RNG, or entity lifetimes.

### How the frozen integration rules are met

1. **Import only via `@sim`.** Vite alias + tsconfig path point `@sim` at
   `../../spikes/headless-sim/src/index.ts`; Vite resolves the sim's `.js`
   specifiers to its `.ts` sources. No simulation source is copied.
2. **Simulation authoritative.** Rendering reads `PlayerState`/pool state through
   snapshots only. Enforced structurally by `contracts.ts` and an ESLint rule
   banning `Math.random` anywhere in app source (the sim owns all RNG).
3. **Fixed-tick accumulator.** `SimDriver` steps at `config.hz` behind an
   accumulator around `requestAnimationFrame`; wall-clock delta is never passed
   into sim logic. Catch-up is capped at `MAX_CATCHUP_TICKS = 5`; excess
   accumulated time is discarded and surfaced as `droppedAccumSec`.
4. **One canonical `TickInput` per tick.** Keyboard, joystick, and autopilot all
   implement the single `InputSource`; the driver calls `sample(tick,paused)`
   exactly once per stepped tick. No aiming.
5. **Event copying.** The driver consumes `SimEvents` within the tick; nothing
   retains the reused event object across a step.
6. **Generation-guarded transforms.** `InstancedTransformStore` matches the
   packed `EntityId`, not the slot alone; a reused slot with a new generation
   snaps to its new transform instead of interpolating from stale state.
7. **App-owned interpolation.** `render(prev,curr,alpha)` lerps between two
   app-owned snapshots; ids present only in `curr` snap to `curr` (fresh spawn).
8. **No reentrancy.** `SimDriver.frame()`/`restart()` throw if called re-entrantly.
9. **Hidden-tab safety.** `visibilitychange` calls `driver.noteVisible()` which
   rebaselines wall-clock so a backgrounded tab cannot burst-catch-up; a hard
   0.25 s single-frame clamp backs this up.
10. **No network/telemetry.** No runtime network calls, keys, paid services, or
    analytics. The production bundle references no Node built-ins.

### Rendering approach (PlayCanvas)

- **Device:** `pc.Application`'s default device opens `webgl2` synchronously.
  WebGPU is not used and not required.
- **Camera:** orthographic top-down, following the interpolated player. World
  `(x right, y up)` maps to the scene XZ ground plane
  (`sceneX = simX - worldWidth/2`, `sceneZ = simY - worldHeight/2`).
- **Materials:** exactly one shared unlit (`useLighting = false`) flat material
  per repeated category with distinct debug colors. Greg retains the glTF's
  authored materials under one soft ambient/directional hero light rig.
- **Instanced swarm path:** enemies, projectiles, and pickups each use one
  `pc.MeshInstance` with a dynamic default-format instance matrix buffer. The
  full 1,700-object primitive fixture measures four draw calls total.
- **Greg presentation:** an async loader preserves the cyan fallback until the
  local fox container is ready. A pure fixed-tick reducer selects Idle, Walk,
  Attack, alternating Hit, and Death tracks from snapshot cues. Six named
  sockets resolve audited bones and safely fall back to the hero root.
- **Visible upgrades:** Porcupine Quills (back) and Puffer Pouch (head) are live
  coded Bud-stage attachments. Immutable validated recipes also define their
  Adapted forms and the combined Thornstorm Mantle Mythic, ready for runtime
  state to select. They prove attachment lifetime and animated-rig coherence;
  combat behavior and stage switching are the next integration slice.
- **Resolution cap:** backing store = CSS size × `min(devicePixelRatio, 2)` to
  bound fill cost on high-DPR/mobile screens.
- **Context loss:** `webglcontextlost` (preventDefault) sets a `contextLost`
  flag surfaced in `stats()`; the app shows the "context lost" banner and pauses
  stepping so a lost context can never desync or corrupt sim state. Restore
  clears the flag and PlayCanvas re-uploads GPU resources.

## Automated verification — commands & results

Run from `apps/web-toy/`:

| Command | Result |
| --- | --- |
| `npm ci` | ✅ 201 packages, lockfile in sync |
| `npm run typecheck` | ✅ 0 errors (strict TS, `noUncheckedIndexedAccess`) |
| `npm run lint` | ✅ 0 errors / 0 warnings (`--max-warnings 0`; Math.random banned) |
| `npm test` | ✅ **99 passed / 99** (16 files) |
| `npm run build` | ✅ Vite production build succeeds |

Test coverage maps to the required contracts: accumulator exact tick counts,
catch-up cap + hidden-tab reset (no spiral of death), **renderer-on vs
renderer-off identical hash**, interpolation reads without mutation,
generation-change view reset before slot reuse, keyboard diagonal normalization
+ cancellation, pointer cancel / focus-loss clearing, autopilot purity, and the
five-minute autopilot ↔ headless-control hash parity (`test/stress-parity.test.ts`),
Greg load/error/disposal behavior, stable socket resolution and generation-safe
detach, animation priority/timing, snapshot-derived presentation cues,
data-defined stage visual validation, and deterministic Rush Rake cue timing.

### Stress evidence (this environment)

`npm test` runs the full **five simulated minutes** (18,000 ticks @ 60 Hz) of
deterministic autopilot through the driver and asserts it equals a bare headless
control fed the identical per-tick inputs:

```
seed = 0x1234abcd   ticks = 18000   final state hash = 9e436ff6bc30d8a5
```

The driver, headless control, and accepted in-browser stress run all produce
`9e436ff6bc30d8a5` at tick 18,000.

> Any FPS / frame-time / draw-call numbers shown in the on-screen HUD are **local
> hardware evidence, not a universal pass threshold.** The app prints this note
> to the console on boot.

## Browser acceptance evidence

The accepted copy was run in the Codex in-app browser on an Apple M4 with Node
v24.11.1 tooling. At a 390 × 844 viewport, the accelerated stress harness
auto-paused at exactly tick 18,000:

| Signal | Result |
|---|---:|
| Final hash | `9e436ff6bc30d8a5` |
| Renderer fixture | 1,000 enemies + 500 projectiles + 200 pickups |
| Draw calls | 4 |
| FPS | 60.0 |
| Rolling frame-time p95 | 17.6 ms |
| Rolling frame-time p99 | 17.7 ms |
| Horizontal overflow | none (`scrollWidth === clientWidth === 390`) |
| Console warnings/errors | none |

Pause held tick and hash stable, resume continued, and renderer-off continued
simulation with draw calls reported as zero. Mobile HUD/control overlap was
found and fixed during acceptance; the virtual joystick now has a visible debug
zone. These measurements are local hardware evidence, not universal thresholds.

To repeat the GPU-side acceptance, run from `apps/web-toy/`:

```bash
npm ci && npm run dev      # http://localhost:5173
```

Then verify:

1. **Normal keyboard play** — WASD/arrows move; player auto-fires at nearest enemy.
2. **Touch layout** — emulate `390 × 844` (DevTools device toolbar); the
   bottom-left joystick drives movement with **no horizontal overflow**; page
   scroll/zoom is prevented only over the game surface.
3. **Pause / resume and restart by explicit seed** — enter a seed, click
   *Restart w/ seed*; the run is reproducible.
4. **Five-minute deterministic autopilot** — open
   `/?autopilot=1&stress=1&renderstress=1&seed=305441741`; it accelerates to and
   auto-pauses at tick 18,000. Confirm hash `9e436ff6bc30d8a5`.
5. **Load / churn** — the renderer-only fixture holds 1,000 enemies, 500
   projectiles, and 200 pickups without touching gameplay state; confirm no
   console errors and no unbounded view/DOM growth
   (HUD live vs high-water counts stabilize; toggle *Renderer: OFF/ON* to confirm
   gameplay/hash are identical with rendering detached).
6. **Context loss** — in DevTools, force a WebGL context loss (e.g. the
   `WEBGL_lose_context` extension); confirm the banner appears, stepping pauses,
   and restoring resumes without a hash discontinuity.

### Greg acceptance evidence

The audited fox was also exercised at 390 × 844 with deterministic autopilot.
It replaced the cyan fallback, remained centered/facing movement, played the
authored animation graph, and kept both coded Bud attachments mounted. The run
held 60 FPS with rolling p95 18.7 ms, no dropped simulation time, and no console
warnings/errors on the tested M4. Draw calls rose to 13–14 depending on populated
swarm categories; the extra calls are the multi-part hero and attachment
prototype, not per-enemy regression.

## Dependencies & licenses

Runtime (the only shipped game dependency):

| Package | Version | License | Why |
| --- | --- | --- | --- |
| `playcanvas` | 2.20.6 | MIT | Standalone MIT WebGL 2 engine fixed by the 3D-stack decision; renders pooled primitives. |

Dev-only (never in the browser bundle):

| Package | Version | License | Why |
| --- | --- | --- | --- |
| `vite` | 8.1.x | MIT | Dev server + production bundler; provides the `@sim` alias resolution. |
| `vitest` | 4.1.x | MIT | Test runner (shares Vite config/alias). |
| `happy-dom` | 20.10.x | MIT | Pure-JS DOM for input/HUD tests. |
| `typescript` | 5.x | Apache-2.0 | Strict typechecking. |
| `eslint` + `@typescript-eslint/*` | 9.x / 8.x | MIT | Lint; enforces the no-`Math.random` gameplay-determinism guard. |
| `@eslint/js`, `@types/node` | — | MIT | ESLint base config / Node types for config files. |

## Known limitations & checks not performed

- **Aggregate culling disabled:** each category is one arena-wide batch, so all
  live instances are submitted even when some are outside the camera. This is a
  deliberate correctness-first choice; spatially chunked batches are a future
  low-end optimization if profiling justifies them.
- **Full-capacity buffer uploads:** each populated category currently uploads its
  retained full matrix buffer per rendered frame. Dirty ranges are a possible
  later optimization.
- **Large initial payload:** production JS is approximately 1.925 MB minified /
  493 KB gzip, and the emitted fox glTF is 3.16 MB. Lazy hero loading, glTF
  optimization, and code splitting should be investigated before a public web
  release.
- **Build warnings:** PlayCanvas's Draco/GSplat worker paths reference
  `node:worker_threads`; Vite externalizes them for browser compatibility. The
  live glTF parser path and production build complete without browser console
  errors; the warnings remain bundle hygiene debt.
- WebGL context loss recovery and physical touch hardware were not manually
  exercised; automated pointer-cancel/focus-loss tests pass.
- **`@sim` re-exports `makeId`/`idSlot`/`idGeneration`/`NO_ENTITY` as types only**
  (`export type *`), so they are not runtime-importable from `@sim`. App code
  that needs the packed-id math reimplements the documented formula locally; this
  is contained and noted at each site.
- This is the **Gate 1 integration + first hero-presentation slice** — no complete
  upgrade loop, final animal attacks, menus, save data, monetization, backend, or
  production art. **Not production-ready**; it proves the browser integration,
  animated hero, live sockets, and swarm rendering needed for the first playable
  trait/evolution slice.
