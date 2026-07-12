# Animal Survivor browser playtest

`apps/web-toy` is the playable browser presentation for Greg’s deterministic
**Forest Arsenal** alpha. It owns input, DOM UI, audio controls, WebGL
presentation, and the local prep/profile surface. The authoritative simulation,
trait runtime, and run director live in their respective packages.

This is an early playtest build. It is meant to answer whether moving,
surviving, choosing attacks, and building a loadout feel good—not to claim final
balance, art, or content completeness.

## Run it

```bash
cd apps/web-toy
npm ci
npm run dev
```

Vite normally serves the game at `http://localhost:5173`.

Run the local checks from the same directory:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Player controls

- **Start run** begins a manual run. Until it is chosen, the game remains at
  tick 0 behind the intro card.
- **WASD** or **arrow keys** move Greg. On touch, drag in the lower-left virtual
  joystick.
- Greg attacks automatically. There is no aiming input.
- An upgrade card pauses the run. The first card receives focus; choose with
  the mouse, **1**, **2**, or **3**, or **Tab** + **Enter**.
- **Esc** toggles pause/resume on desktop. The visible pause control supports
  pointer and touch play.
- **Sound effects** are optional and off by default. They never affect gameplay
  or replay; browser audio being unavailable is a silent, nonfatal fallback.

The live HUD focuses on health, level, XP, time, phase, and the immediate goal.
It intentionally does not repeat a description every time an attack fires.
Pause to inspect the current attack and passive build. The prep screen, not
combat, shows Essence and Starting Vitality.

## Forest Arsenal gameplay

The arena is a forest clearing with presentation-only landmarks and terrain
treatment for movement readability. It is not part of the deterministic world
state or replay hash.

### Eight-minute normal mode

Normal mode ends at **8:00**. Kill **The Final Threat** after it enters at
**6:30** and before 8:00 to win; a living boss at the boundary is a defeat.
There is no hidden overtime.

| Time | Phase |
| --- | --- |
| 0:00–1:00 | Opening |
| 1:00–3:00 | Pressure |
| 3:00–5:00 | Adaptation |
| 5:00–6:30 | Mutation |
| 6:30–8:00 | Boss |

The elite requests are at **2:00**, **3:40**, **4:30**, **5:15**, **5:45**, and
**6:05**, each with a five-second warning. The boss warning is at **6:10**.
Normal waves approach from outside the camera. Runners weave, Spitters and
elites add ranged pressure, and elites give larger XP rewards.

### Attacks and evolutions

Greg’s starter **Auto-Fire** occupies one active-attack slot. A normal run can
choose up to four of six acquired trait families, for five active attack slots
total:

| Attack | Bud effect | Adapted effect |
| --- | --- | --- |
| **Porcupine Quills** | Three forward quills that pierce one extra enemy | Five wider quills that pierce two extra enemies |
| **Puffer Pouch** | Gather nearby enemies | Wider push pulse |
| **Electric Eel Coil** | Instant strike on the nearest threat, then chain to 1 nearby unhit foe | Instant strike on the nearest threat, then chain to 3 nearby unhit foes |
| **Firefly Colony** | Two fireflies orbit Greg and zap enemies on contact | Four fireflies orbit wider and zap nearby enemies |
| **Mantis Scythes** | Auto-aimed narrow scythe sweep | Wider, stronger auto-aimed scythe sweep |
| **Gecko Pads** | After traveling 150 units, create a damaging pad at Greg's feet; it does not slow enemies | After traveling 110 units, create a stronger damaging pad at Greg's feet; it does not slow enemies |

Every attack has Bud and Adapted forms. Three paired evolutions are available:

- **Thornstorm Mantle** combines Adapted Quills and Adapted Pouch: telegraph,
  gather, then radial quill storm.
- **Thunderbug Dynamo** combines Adapted Coil and Adapted Colony: telegraph,
  then release a larger chain discharge across nearby enemies.
- **Razorstep Chimera** combines Adapted Mantis Scythes and Adapted Gecko Pads:
  moving leaves stronger scythe pads every 90 units.

Each Mythic retains its two ingredient slots. Evolving is a power conversion,
not a way to open a sixth active-attack slot.

### Neutral passives and Essence

Level-up offers mix attacks with neutral passives. A run can select five
distinct passives: **Swift Paws**, **XP Magnet**, **Sturdy Hide**, **Sharpened
Instinct**, **Rapid Instinct**, and **Growth** are the current candidates.

After a passive has claimed one of the five slots, it can continue gaining ranks
until its individual cap. Once all five slots are committed, untouched passives
are no longer legal choices. **Sharpened Instinct** improves damage for every
attack and **Rapid Instinct** reduces cooldown for every attack. If no finite
upgrade remains, the chooser offers repeatable **Essence Cache**.

Terminal Essence is settled once per run. **Continue to upgrades** returns to
the prep surface, where saved Essence can buy capped Starting Vitality for the
next fresh run only.

## Local URL controls

| Control | Effect |
| --- | --- |
| `?seed=<number or text>` | Starts with an explicit deterministic seed. Text is hashed to a 32-bit seed. |
| `?debug=1` | Shows diagnostics and engineering controls; the default view remains player-facing. |
| `?autopilot=1` | Boots into deterministic autopilot and skips the Start run gate. |
| `?autopilot=1&stress=1` | Advances up to five simulation ticks per frame, auto-selects the first pending upgrade, and stops at five simulated minutes. |
| `?autopilot=1&stress=1&fullrun=1` | Keeps the same deterministic stress path until terminal, no later than the 28,800-tick (8:00) normal boundary. This is an engineering flow check, not a balance playtest. |
| `?autopilot=1&stress=1&renderstress=1` | Adds a renderer-only stress fixture without changing simulation state or hash. |

`window.__webToy` exposes the local app handle for engineering checks, including
the driver hash, tick, controls, and stop method.

## Presentation and determinism boundaries

- The browser consumes authoritative simulation snapshots and command cues; it
  does not author combat outcomes, loot, timing, or upgrade selection results.
- The forest clearing, hero facing, trait attachments, attack cues, world
  effects, HUD, boss bar, and sound are read-only presentation.
- A pause frame advances no simulation clock, RNG, entity state, trait runtime,
  or run director state.
- The renderer uses bounded, reusable presentation pools and fixed instanced
  batches rather than per-frame gameplay allocation.
- The browser build makes no runtime telemetry, analytics, key, backend, or
  paid-service calls.

## Share a preview

Relevant pushes to `main` run `Publish web-toy preview`, which tests, lints,
builds, and deploys `dist/` through GitHub Pages Actions. Enable **Settings →
Pages → Build and deployment → Source: GitHub Actions** once, then use the
green deployment link in **Actions** or **Settings → Pages**.

For a structured manual pass, follow the
[Gate 1 owner playtest guide](../../docs/playtests/gate1-owner-playtest.md).

## Current boundary

Forest Arsenal is deliberately a compact first loadout, not a final roster or
art pass. More attack families, enemy patterns, difficulty modes, polished
audio, final authored assets, physical-touch validation, low-end-device
profiling, and broader human balance testing remain open.
