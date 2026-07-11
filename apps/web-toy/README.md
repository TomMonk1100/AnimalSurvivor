# web-toy — Gate 1 playable Greg vertical slice

This browser app presents the deterministic simulation in spikes/headless-sim as
a small, locally playable WebGL 2 game. It deliberately keeps simulation,
rendering, input, and diagnostics on separate sides of a read-only boundary:
frame rate, rendering, and input-device details cannot change authoritative
gameplay state.

The current app boots the real Greg vertical-slice trait runtime and the
authored run director. It is a focused trait/evolution playtest slice, not a
complete or balance-approved game: Greg moves and auto-fires, levels create
deterministic choices, traits execute real simulation commands, and the run
director supplies phases, elites, and a boss.

Everything browser-specific lives under apps/web-toy. The authoritative sim,
trait runtime, and run director are consumed through their package aliases;
their source is not copied into the app.

## Quick start

    cd apps/web-toy
    npm ci
    npm run typecheck
    npm run lint
    npm test
    npm run build

    # Vite dev server, normally http://localhost:5173
    npm run dev

Move with **WASD / arrow keys** on desktop or the **bottom-left virtual
joystick** on touch. Greg auto-attacks nearby enemies; movement is the only
combat input. When an upgrade card pauses the run, choose an adaptation to
resume it.

For the recommended hands-on check, use the
[Gate 1 owner playtest guide](../../docs/playtests/gate1-owner-playtest.md).

The app handle is exposed at window.__webToy for local checks, including its
driver hash, tick, controls, and stop method.

### URL controls and debug buttons

| Control | Effect |
| --- | --- |
| ?seed=&lt;number or text&gt; | Start with an explicit seed; text is hashed to a 32-bit seed. The default is 0x1234abcd. |
| ?debug=1 | Shows the diagnostic HUD and engineering controls. The default presentation keeps those details out of the player-facing view. |
| ?autopilot=1 | Boot directly into deterministic autopilot. |
| ?autopilot=1&stress=1 | Step up to five simulation ticks per rendered frame and auto-pause at tick 18,000. Stress mode selects the first pending upgrade deterministically so it does not stall. |
| ?autopilot=1&stress=1&fullrun=1 | Keep the same accelerated, first-offer stress path through the 43,200-tick authored boundary instead of stopping at 18,000. It can exercise boss and terminal UI if Greg survives; it is not a normal-balance result. |
| ?autopilot=1&stress=1&renderstress=1 | Also feed a renderer-only fixture of 1,000 enemies, 500 projectiles, and 200 pickups to the GPU; it does not alter simulation state or hash. |
| **Upgrade choices** | The first card receives focus when the run pauses. Press **1**, **2**, or **3** for the matching offered card, or use normal **Tab** + **Enter** button navigation. |
| **Virtual joystick** | Drag inside the lower-left zone to move. A floating thumb follows the clamped drag and disappears on release, cancel, or focus loss. |
| **Pause / Resume** | Stops stepping. A paused frame advances no clock, RNG, entity state, trait runtime, or run director. |
| **Restart run** | Rebuilds the integrated run from the current seed in the compact player-facing controls. |
| **Restart w/ seed** (debug) | Rebuilds the integrated run from the seed in the debug text box. |
| **Play again** | Appears on a terminal victory/defeat card and restarts the current seed without requiring debug controls. Pause, Restart run, and Play again have 44px-high touch targets. |
| **Autopilot: ON/OFF** (debug) | Toggles the pure-function-of-tick stress input. |
| **Renderer: ON/OFF** (debug) | Detaches or attaches GPU rendering while simulation keeps running, so local A/B checks can confirm that rendering does not affect gameplay. |

## What is playable now

The intentionally small Greg catalog contains two animal adaptations and their
combined Mythic. They are real runtime content rather than display-only cards.

| Choice | Live visual state | Actual effect |
| --- | --- | --- |
| **Porcupine Quills** | Bud and Adapted back attachments | Automatically fires directed quill bursts; Adapted is wider and faster. |
| **Puffer Pouch** | Bud and Adapted head attachments | Bud inhales/gathers nearby enemies; Adapted releases a wider knockback pulse. |
| **Thornstorm Mantle** | Mythic mantle that replaces its ingredients | Telegraphs, gathers enemies, then emits a radial quill storm. |

The upgrade cards name the socket, stage, practical effect, and Mythic pairing.
When they appear, the first card takes keyboard focus: **1**, **2**, and **3**
select matching offers, while **Tab** + **Enter** follows ordinary button
navigation. After a choice, the **Active Adaptations** panel remains visible and
describes the build's effect and cadence. The player-facing HUD leads with
Greg's health, level, XP, and the movement/auto-fire reminder before diagnostic
values.

The simulation emits executed trait commands into a presentation-only stream.
The renderer turns supported commands into short-lived, fixed-pool ground
pulses, while top-of-screen callouts name meaningful Puffer and Thornstorm
moments such as Inhale, Gather, Blast, and Quill storm. These cues are copied
across fixed-tick catch-up before rendering and never feed back into gameplay,
hashing, or replay state.

The authored run director drives phase, elite, boss, overtime, victory, and
defeat notices. Enemy role remains authoritative in simulation; the renderer
reads it to give elites amber cylinder treatments and bosses violet cone
treatments, without per-enemy material or entity allocation. App-owned enemy
snapshots also copy current and maximum health, so a live boss gets a persistent,
accessible **The Final Threat** bar without exposing writable gameplay state.
When the authoritative run ends, its outcome card includes **Play again** for a
same-seed restart.

## Architecture and renderer/simulation boundary

    wall-clock rAF
             |
      +------v---------------- app.ts (integration) ---------------------+
      |                                                                   |
      | InputSource --sample(tick)--> SimDriver --fixed dt--> @sim       |
      | (keyboard/joystick/           (accumulator,        Simulation    |
      |  autopilot)                    catch-up cap)         + real      |
      |                                                   TraitRuntime +   |
      |                                                   RunDirector      |
      |                                      |                            |
      |                         read-only app-owned outputs              |
      |          +---------------------------+------------------------+  |
      |          | snapshots | trait visuals | director/trait events  |  |
      |          +---------------------------+------------------------+  |
      |                                      v                            |
      | RendererAdapter.render(...) -- PlayCanvas WebGL 2 (reads only)    |
      | Hud / upgrade UI / notices -- presentation projections (read only) |
      +-------------------------------------------------------------------+

The frozen browser boundary is src/contracts.ts: InputSource,
RenderSnapshot/CategorySnapshot, RendererAdapter, PerformanceMonitor, and Hud.
Rendering, interpolation, UI projections, and diagnostics only read app-owned
snapshots or copied presentation events. They do not write simulation positions,
health, timers, RNG, entity lifetimes, trait state, or director state.

### How the integration rules are met

1. **Authoritative packages, no copied sim source.** @sim resolves to the
   accepted simulation; app boot supplies real TraitRuntime and RunDirector
   factories through their package aliases.
2. **Fixed-tick stepping.** SimDriver steps at config.hz behind an accumulator.
   Wall-clock delta is never given to simulation logic. Catch-up is capped at
   MAX_CATCHUP_TICKS = 5; discarded excess is surfaced as droppedAccumSec.
3. **One canonical input per tick.** Keyboard, joystick, and autopilot all
   implement InputSource; the driver calls sample(tick, paused) once for every
   stepped tick. There is no aiming path.
4. **Deterministic choices stop advancement.** A pending level-up choice blocks
   stepping atomically. The browser asks the player to choose; stress mode makes
   its explicit, deterministic first-offer choice.
5. **Reusable events are copied at the boundary.** Director events and actual
   trait command records are copied into frame-owned arrays so a multi-tick
   catch-up frame preserves every cue. Renderer feedback is similarly derived
   from adjacent snapshots, never by mutating sim state.
6. **Generation-guarded transforms.** InstancedTransformStore matches the packed
   entity ID, not only the slot. A reused slot with a new generation snaps to
   its new transform rather than interpolating from stale state.
7. **App-owned interpolation.** render(prev, curr, alpha) lerps two app-owned
   snapshots; entities appearing only in curr snap to curr.
8. **No re-entrancy.** SimDriver.frame() and restart() reject re-entrant calls.
9. **Hidden-tab safety.** visibilitychange rebaselines wall-clock time; a hard
   0.25-second frame clamp is a defensive backstop against stall bursts.
10. **No runtime service dependency.** The browser build makes no runtime
    network, telemetry, analytics, key, backend, or paid-service calls.

## Rendering and presentation

- **Device and camera:** a synchronous PlayCanvas WebGL 2 device with a DPR cap
  of min(devicePixelRatio, 2); the orthographic top-down camera follows Greg.
  Simulation x-right/y-up maps to XZ as sceneX = simX - worldWidth/2 and
  sceneZ = worldHeight/2 - simY, so screen-up matches simulation +Y.
- **Arena reference:** two static, subtle world-space line meshes give the
  camera-following view a minor/major grid. They are built once, use shared
  materials, and never update or allocate during the render loop.
- **Instanced swarms:** regular enemies, elite enemies, bosses, projectiles,
  and pickups use fixed hardware-instanced category batches. A normal enemy is
  a red sphere, an elite is an amber cylinder, and a boss is a violet cone. The
  role treatment adds bounded fixed batches, not one mesh or material per enemy.
- **Greg:** an audited local Quaternius fox glTF replaces a resilient cyan
  fallback after loading. A fixed-tick presentation reducer drives Idle, Walk,
  Attack, Hit, and Death behavior; bounded visual heading and hysteresis keep
  locomotion readable without touching movement state.
- **Live attachments:** actual authoritative trait visual state mounts Bud and
  Adapted recipes to stable head/back sockets. Thornstorm consumes its
  ingredient visuals into one Mythic silhouette.
- **Combat readability:** separate fixed pools show attack, hit, pickup, enemy
  death, and player-death feedback. The trait-command pool shows telegraph,
  directed/radial burst, gather, knockback, area-damage, and trait-cue pulses
  for supported executed commands.
- **Context loss:** webglcontextlost sets a visible flag and pauses stepping;
  restoring clears the flag. This path is designed to protect the boundary,
  but forced recovery still needs a manual browser check.

## Automated verification

Run from apps/web-toy:

| Command | What it checks |
| --- | --- |
| npm ci | Installs the locked browser-tooling dependency set. |
| npm run typecheck | Strict TypeScript, including noUncheckedIndexedAccess. |
| npm run lint | ESLint with --max-warnings 0; app-source Math.random is banned. |
| npm test | The current suite contains **159 tests** across the driver, input, snapshots, presentation, real integrated run replay, and renderer-facing helpers. |
| npm run build | Strict typecheck plus a Vite production build. |

The suite covers accumulator exactness, catch-up and hidden-tab behavior,
renderer-on/off hash parity, interpolation and generation reuse, keyboard and
touch cancellation, pure autopilot input, upgrade-boundary pausing, live trait
visual projection, attachment replacement, locomotion/animation behavior,
combat feedback, trait-command cue retention through catch-up, director notice
projection, role snapshots, and fixed-pool trait-command presentation.

Two intentionally different deterministic checks are useful:

- The five-minute fixed-driver autopilot parity test compares the baseline
  browser driver with an identically fed bare headless simulation at 18,000
  ticks. Its current canonical seed/hash is 0x1234abcd / 9e436ff6bc30d8a5.
- full-run-replay.test.ts runs the real trait runtime and run director for
  43,200 ticks (12 minutes), makes deterministic choices, reaches the boss
  phase, and reproduces the exact replay hash. Its enlarged player-health
  configuration validates integration and replay infrastructure; it is not
  evidence of normal difficulty balance.

## Local browser checks and playtesting

The browser has had a short local development smoke pass using the Codex
in-app browser: the app loaded, the deterministic stress path advanced, and no
console errors were observed in that check. This is local smoke evidence only,
not a hardware benchmark, certification, or substitute for human playtesting.

To repeat useful checks locally:

1. **Hands-on feel and clarity:** follow the
   [Gate 1 owner playtest guide](../../docs/playtests/gate1-owner-playtest.md).
   In particular, check vertical controls, upgrade comprehension, Puffer and
   Thornstorm sequence readability, HUD clutter, and elite/boss recognition.
2. **Deterministic stress:** open
   /?autopilot=1&stress=1&renderstress=1&debug=1&seed=305441741. It accelerates to and
   auto-pauses at tick 18,000; compare the displayed hash with the five-minute
   automated-check value above.
3. **Accelerated boss/run flow:** open
   /?autopilot=1&stress=1&fullrun=1. It raises the stress cap to 43,200 ticks
   and makes deterministic upgrade choices. If the normal-health run reaches a
   live boss, verify the **The Final Threat** health bar appears and the terminal
   card offers **Play again**. This is an engineering UI check, not evidence of
   normal-balance survival.
4. **Read-only rendering A/B:** add `?debug=1`, then toggle **Renderer: OFF/ON**
   while autopilot runs. The simulation/hash should continue identically with
   draw calls shown as zero while rendering is detached.
5. **Mobile layout and input:** emulate 390 x 844; check that the lower-left
   joystick thumb follows a drag and resets on release, that Pause/Restart run
   and terminal Play again are comfortable 44px targets, and that the page has
   no horizontal overflow.
6. **Context loss:** use a browser's WEBGL_lose_context facility if available;
   confirm the context banner pauses the run and restoration resumes without an
   unexpected hash discontinuity.

Do not treat any local FPS, frame-time, or draw-call reading as a universal
threshold. No normal-difficulty end-to-end human balance run, physical-touch
test, low-end-device test, or forced-context-loss recovery check has been
accepted yet.

## Dependencies and licenses

Runtime (the only shipped game dependency):

| Package | Version | License | Why |
| --- | --- | --- | --- |
| playcanvas | ^2.20.6 | MIT | Standalone WebGL 2 engine for pooled primitive and hero presentation. |

Development-only (not shipped in the browser bundle):

| Package | Version | License | Why |
| --- | --- | --- | --- |
| vite | ^8.1.4 | MIT | Dev server and production bundler; resolves project aliases. |
| vitest | ^4.1.10 | MIT | Test runner sharing Vite alias resolution. |
| happy-dom | ^20.10.6 | MIT | Pure-JS DOM for input/HUD tests. |
| typescript | ^5.6.0 | Apache-2.0 | Strict typechecking. |
| eslint / TypeScript ESLint | ^9.15.0 / ^8.15.0 | MIT | Lint and the Math.random determinism guard. |
| @eslint/js, @types/node | ^9.15.0 / ^22.10.0 | MIT | ESLint base configuration and Node types for tooling. |

## Known limitations and open checks

- This is a **first playable Greg slice**, not a finished game. It has no final
  animal roster, menus, save flow, audio, backend, telemetry, monetization, or
  production-complete art.
- The playable catalog is deliberately limited to Porcupine Quills, Puffer
  Pouch, and Thornstorm Mantle. Persistent zone, mark, chain, melee, and shield
  command kinds remain out of player-facing catalogs until their authoritative
  state exists; unsupported commands reject rather than silently inventing
  behavior.
- Trait attachments and trait-command feedback are bounded primitive
  presentation, not final VFX, meshes, animation, sound, or accessibility
  treatment. Their timing, scale, color, and callout clarity need human
  feedback.
- Aggregate culling is disabled: each category is arena-wide, and each
  populated category uploads its retained full matrix buffer per frame. Spatial
  chunking and dirty-range uploads are future low-end optimizations if profiling
  justifies them.
- The initial browser payload includes PlayCanvas and the fox glTF. Lazy hero
  loading, glTF optimization, and code splitting remain release work.
- PlayCanvas worker-path build warnings and physical WebGL-context recovery
  still need release-oriented browser validation, even though the normal build
  and local smoke path work.
- @sim re-exports packed-ID helpers as types only. Browser code that needs the
  packed-ID math implements the documented formula locally; it must not assume
  those helpers are runtime imports.

The next meaningful milestone is a hands-on desktop playtest focused on
movement feel, adaptation clarity, trait feedback, and elite/boss readability;
then tune this bounded presentation from that feedback before treating the
vertical slice as balance-ready.
