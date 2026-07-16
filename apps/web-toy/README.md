# Animal Survivor browser playtest

`apps/web-toy` is the playable browser presentation for the founding animals'
deterministic **Forest Arsenal** alpha. It owns input, DOM UI, audio controls, WebGL
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
npm run verify:assets
npm run verify:content
npm run build
npm run verify:artifact
npm run verify:served
```

`npm run build` emits `dist/build-info.json` and `dist/asset-manifest.json`.
`npm run verify:artifact` hashes the generated files into
`dist/dist-manifest.json` and checks that the document title and build meta tag
identify the same build. The complete Gate 0 evidence procedure is in
[`../../docs/release/gate0-evidence.md`](../../docs/release/gate0-evidence.md).
`npm run verify:served` serves the exact `dist` directory on a temporary local
HTTP port and checks the served identity, UI markers, Saltwind route, and 404
behavior. It does not replace hosted-browser or human evidence.

## Player controls

- **Start run** begins a manual run. Until it is chosen, the game remains at
  tick 0 behind the intro card.
- **WASD**, **arrow keys**, a standard gamepad's **left stick/D-pad**, or hold-drag on the
  arena with a mouse move the selected animal. On touch, drag in the lower-left virtual
  joystick; precedence is joystick, mouse, gamepad, then keyboard.
- The selected animal attacks automatically. There is no aiming input.
- An upgrade card pauses the run. The first card receives focus; choose with
  the mouse, **1**, **2**, or **3**, or **Tab** + **Enter**.
- **Esc** toggles pause/resume on desktop. The visible pause control supports
  pointer and touch play.
- The prep launch dialog keeps focus inside its controls, reveals the focused
  control inside its scrollable card, and automatically pauses an active run
  when the page is hidden; only a visibility-owned pause resumes on return, so
  manual pauses and level-up choices remain untouched.
- Browser zoom remains available, and the arena/HUD/prep surfaces honor
  safe-area insets for notched or home-indicator devices.
- **Sound effects** are optional and off by default. The prep card exposes
  master, music-bed, and SFX mix sliders; these never affect gameplay or replay.
  Browser audio being unavailable is a silent, nonfatal fallback. The current
  voices and phase bed are procedural release scaffolding, not final authored
  audio; source-aware launch trait, instinct, boss-telegraph, and support-warning
  identities are covered by the same rate-safe presentation router.
- The Field Guide retains a six-card **Perfect Pair** reference, including
  ingredient pairs and deterministic locked/discovered states. It is not a
  fusion restriction: in a run, any two enabled Master attacks can receive a
  Wild Splice offer unless it would exceed the one-Support-Chimera cap. Profile
  discovery remains presentation-owned and never changes a run hash.
- The Field Guide also exposes a six-card Habitat Atlas. Forest is the known
  starting habitat; victories with each hero and in Saltwind, plus archived
  Mythic forms, reveal the remaining postcards without adding currency or run
  state.
- Accessibility settings include persistent one-key-per-direction keyboard
  remapping; Arrow Keys remain available and the remap never changes the
  canonical sampled-input or replay boundary.

Before a normal run, choose one of the founding animals:

- **Greg the fox — The Pouncer:** baseline all-rounder;
- **Benny the bull — The Bastion:** more starting health, lower movement and
  attack cadence;
- **Gracie the alpaca — The Surveyor:** wider pickup field and faster cadence,
  with a lighter starting body.

The choice is stored locally and included in the deterministic run-start
fingerprint. Benny and Gracie use authored procedural low-poly presentation
variants and each has a distinct deterministic starter attack plus mastery path.

The live HUD focuses on health, level, XP, time, phase, and the immediate goal.
It intentionally does not repeat a description every time an attack fires.
Pause to inspect the current attack and passive build. The prep screen, not
combat, shows Essence and the permanent upgrade shop.

## Forest Arsenal gameplay

The arena is a forest clearing with presentation-only landmarks and terrain
treatment for movement readability. It is not part of the deterministic world
state or replay hash.

### Six-minute normal mode

Normal mode ends at **6:00**. Kill **The Final Threat** after it enters at
**4:45** and before 6:00 to win; a living boss at the boundary is a defeat.
There is no hidden overtime.

| Time | Phase |
| --- | --- |
| 0:00–0:45 | Opening |
| 0:45–2:15 | Pressure |
| 2:15–3:45 | Adaptation |
| 3:45–4:45 | Mutation |
| 4:45–6:00 | Boss |

The elite requests are at **1:10**, **2:25**, **3:15**, **3:55**, **4:15**, and
**4:35**, each with a five-second warning. The boss warning is at **4:25**.
Normal waves approach from outside the camera. Runners weave, Spitters and
elites add ranged pressure, and elites give larger XP rewards.

### Attacks and evolutions

The selected animal’s starter attack occupies one active-attack slot. A normal
run can choose up to four of twelve acquired trait families, for five active
attack cards total:

| Starter | Pattern | Mastery |
| --- | --- | --- |
| **Greg’s Auto-Fire** | Precise nearest-target shot; movement charges a three-wave Rush Rake | Pouncer’s Precision; rank 3 unlocks one pierce |
| **Benny’s Brace Burst** | Heavy two-bolt spread | Brace Bloom; rank 2 adds a third bolt |
| **Gracie’s Keen Dart** | Fast highest-health dart | Keen Dart; rank 3 adds a second dart |

| Attack | Bud effect | Adapted effect |
| --- | --- | --- |
| **Porcupine Quills** | Three forward quills that pierce one extra enemy | Five wider quills that pierce two extra enemies |
| **Puffer Pouch** | Gather nearby enemies | Wider push pulse |
| **Electric Eel Coil** | Instant strike on the nearest threat, then chain to 1 nearby unhit foe | Instant strike on the nearest threat, then chain to 3 nearby unhit foes |
| **Firefly Colony** | Two fireflies orbit Greg and zap enemies on contact | Four fireflies orbit wider and zap nearby enemies |
| **Mantis Scythes** | Auto-aimed narrow scythe sweep | Wider, stronger auto-aimed scythe sweep |
| **Gecko Pads** | After traveling 150 units, leave a damaging pad behind the moving selected animal; it does not slow enemies | After traveling 110 units, leave a stronger damaging pad behind the moving selected animal; it does not slow enemies |
| **Owl Pinions** | Four-feather spread at the nearest threat | Wider seven-feather spread |
| **Bat Ears** | Echo-marks a nearby cluster; every automatic attack prioritizes it | Echo-marks a larger priority cluster for every automatic attack |
| **Crab Pincers** | Compact area strike | Wider, heavier area strike |
| **Armadillo Greaves** | Shoves nearby threats away | Stronger defensive shove |
| **Skunk Brush** | Places a damaging stink cloud on an enemy cluster ahead | Places a larger, stronger stink cloud on an enemy cluster ahead |
| **Monarch Brood** | Two orbiting butterflies sting nearby enemies on contact | Three wider-orbit butterflies sting nearby enemies more often |

Every attack has Bud, Adapted, and **Master** (rank-five) forms. Any two enabled
Masters can be explicitly fused through **Wild Splice**: all 66 unordered pairs
are available. The six former named recipes remain signature **Perfect Pairs**:

- **Thornstorm Mantle** — Quills + Pouch.
- **Thunderbug Dynamo** — Coil + Colony.
- **Razorstep Chimera** — Mantis Scythes + Gecko Pads; leaves stronger scythe pads behind the moving selected animal.
- **Midnight Radar** — Bat Ears + Owl Pinions.
- **Meteor Mauler** — Crab Pincers + Armadillo Greaves.
- **Royal Stinkcloud** — Skunk Brush + Monarch Brood; places a monarch-crowned stink cloud on an enemy cluster ahead.

The six all-utility pairs become **Support Chimeras**: their control effects
remain meaningful and they receive a damage rider, but a run may own only one.
Every Wild Splice is free and voluntary. It turns two logical acquired attacks
into one terminal Chimera, freeing an acquired slot while retaining both parent
attachment footprints; the Chimera cannot rank further or re-fuse. The pause
panel shows its braid and both parent names. This economy permits up to three
terminal Chimeras in one run. Base starter fire does not pierce; Quills and the
selected starter mastery own piercing explicitly.
Greg's movement and near-misses charge a replay-safe three-wave Rush Rake burst;
its cyan directional cue is rendered through the same read-only presentation path.

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
the prep surface, where saved Essence can buy capped permanent upgrades for the
next fresh run: Vitality, Might, Swiftness, Magnetism, Growth, Armor, Haste,
Precision, Ferocity, Evasion, and Fortune. Fortune increases the next terminal
Essence award only. The Field Guide archives each terminal build and provides
versioned save export, import, reset, migration, and corrupt-save recovery.

## Local URL controls

| Control | Effect |
| --- | --- |
| `?hero=greg`, `?hero=benny`, or `?hero=gracie` | Selects a founding animal before the run starts; useful for repeatable visual QA. |
| `?biome=saltwind` | Selects Saltwind Ruins after the local profile has recorded a Forest victory; otherwise the app stays in Forest Arsenal and labels the biome as locked. |
| `?seed=<number or text>` | Starts with an explicit deterministic seed. Text is hashed to a 32-bit seed. |
| `?debug=1` | Shows diagnostics and engineering controls; the default view remains player-facing. |
| `?autopilot=1` | Boots into deterministic autopilot and skips the Start run gate. |
| `?autopilot=1&stress=1` | Advances up to five simulation ticks per frame, auto-selects the first pending upgrade, and stops at five simulated minutes. |
| `?autopilot=1&stress=1&fullrun=1` | Keeps the same deterministic stress path until terminal, no later than the 21,600-tick (6:00) normal boundary. This is an engineering flow check, not a balance playtest. |
| `?autopilot=1&stress=1&renderstress=1` | Adds a renderer-only stress fixture without changing simulation state or hash. |

`window.__webToy` exposes the local app handle for engineering checks, including
the driver hash, tick, controls, and stop method.

## Presentation and determinism boundaries

- The browser consumes authoritative simulation snapshots and command cues; it
  does not author combat outcomes, loot, timing, or upgrade selection results.
- The forest clearing, hero facing, trait attachments, attack cues, world
  effects, HUD, authored boss portraits, boss bar, and sound are read-only
  presentation.
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
