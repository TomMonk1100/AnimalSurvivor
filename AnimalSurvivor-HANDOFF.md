# AnimalSurvivor Project Handoff

## Authoritative workspace

Use only:

`/Users/adammuncie/GameDev/AnimalSurvivor`

The former cloud-backed path `/Users/adammuncie/Documents/AnimalSurvivor` no
longer exists. Do not recreate it or copy work back into Documents. Cloud-backed
dependency files caused TypeScript, Vitest, npm, and Vite to stall. The GameDev
location resolves the problem.

## Owner and production constraints

- This is a serious hobby project intended to become a complete playable game.
- It is built almost entirely by AI agents.
- Cash budget is effectively zero beyond the owner's existing ChatGPT and
  Claude subscriptions.
- Prefer open-source/CC0 assets and AI-generated assets.
- Ask the owner to make no more than five high-impact creative contributions.
- The practical bottleneck is AI usage, not calendar time.
- Use token-efficient, tightly scoped parallel agents when the owner requests a
  swarm. Give agents exclusive file boundaries and frozen contracts.
- Do not overwrite unrelated changes. The repository began as an uncommitted,
  largely untracked workspace; inspect Git state before making assumptions.

## Game vision

AnimalSurvivor is a web-first, low-poly 3D survivor-like inspired by Vampire
Survivors:

- movement-only combat with automatic aiming and attacks;
- very simple immediate controls;
- deep build, trait, pairing, and evolution choices;
- every upgrade has a visible physical attachment on the animal;
- heroes begin cute and heroic, then become increasingly strange and mutated;
- the animal's body is the loadout;
- readability and silhouette matter more than visual clutter.

Founding heroes:

- Greg the fox: proper older British gentleman.
- Benny the bull: nervous about seeming large, clumsy, or intimidating.
- Gracie the alpaca: twee trend-aware matcha-loving hipster.

Current playable focus: Greg's first vertical slice.

## Current architecture

### Deterministic headless simulation

Path: `spikes/headless-sim/`

- TypeScript ESM, fixed 60 Hz simulation, renderer-independent.
- Seeded RNG, typed-array entity pools, generation-safe entity IDs.
- Uniform spatial grid and deterministic target selection.
- Combat, projectiles, pickups, unbounded XP progression, replay recording,
  and canonical state hashing.
- A unified deterministic run-upgrade queue presents typed animal, universal,
  and Essence fallback choices. The six universal cards are each rank-capped:
  Swift Paws, XP Magnet, Sturdy Hide, Sharpened Instinct, Rapid Instinct, and
  Growth.
- A normalized run-start loadout carries permanent Starting Vitality into a run
  without letting browser storage enter deterministic gameplay.
- Structural injection ports keep the package free of runtime dependencies on
  the trait and run-director packages.
- Config/replay compatibility is version 6. Typed upgrade selections, the
  universal catalog fingerprint, run-start-loadout fingerprint, and deterministic
  runner/ranged behavior parameters are recorded so old content cannot silently
  replay against this alpha state.

Important integration files:

- `src/simulation.ts`
- `src/trait-runtime-port.ts`
- `src/trait-command-executor.ts`
- `src/trait-upgrade-queue.ts`
- `src/run-upgrade-queue.ts`
- `src/universal-upgrades.ts`
- `src/run-start-loadout.ts`
- `src/run-director-port.ts`
- `src/run-spawn-adapter.ts`
- `src/enemy-behavior.ts`

### Trait/evolution runtime

Path: `packages/trait-runtime/`

- Deterministic trait ownership, body sockets, offers, stages, pairing, and
  Mythic resolution.
- Bud -> Adapted -> paired Mythic progression.
- Canonical serialization, content fingerprint, and state hash.
- Greg first-slice content includes Porcupine Quills, Puffer Pouch, and
  Thornstorm Mantle.
- `initialTick` supports clean injection into simulation tick ownership.

### Run director

Path: `packages/run-director/`

- Deterministic finite 12-minute Greg normal run; the boss enters at 10:00.
  The boss must fall by 12:00 or normal mode ends in defeat, with no hidden
  overtime.
- Opening, pressure, adaptation, mutation, and boss phases. Overtime belongs
  only to a future explicit endless definition.
- Six authored elite beats: one in pressure at 3:20, two in adaptation at 5:40
  and 7:00, and three in mutation at 8:10, 9:00, and 9:30. Base phase cadence
  is 75/60/45/30/36 ticks and base soft/hard caps are 10/18, 18/30, 30/48,
  46/72, and 36/56 (opening through boss). Bounded level pressure at 4, 6, and
  8 adds +1/+2 capacity and removes 4 cadence ticks per step; it never creates
  a same-tick spawn burst.
- Emits pure intents; never owns simulation pools or renderer state.
- Imported swarm work was hardened so `RunDirector` saves include and verify
  the exact authored content fingerprint.

Temporary simulation mappings:

- fodder -> walker prototype;
- runner -> runner prototype;
- brute -> brute prototype;
- spitter -> cobalt ranged prototype (36 HP, 2 XP, slow hostile shots);
- elite -> brute prototype with 5x HP and 6x XP (24 XP from its base 4);
- boss -> brute prototype with 18x HP (1,440 HP in the current temporary tune).

Formation placement is deterministic arithmetic derived from director event
tick and sequence and consumes no simulation RNG. Ordinary fodder/runner waves
are authored at 760–920 world units (brutes/elites 800–960); the boss is
deliberately nearer at 400–480 so its 10:00 entrance reaches combat promptly.
At an edge, the adapter finds a complete in-bounds formation at its authored
radius or deterministically rejects it rather than clamping it beside Greg.

### Web toy

Path: `apps/web-toy/`

- Vite + PlayCanvas web application.
- Fixed-tick simulation driver with interpolation and capped catch-up.
- Real `TraitRuntime` and `RunDirector` factories, the universal catalog, and a
  normalized profile-derived run-start loadout are injected.
- Upgrade prompts pause exactly at a tick boundary and resume without time
  bursts or lost accumulated time.
- The unified chooser presents mixed animal-adaptation and neutral cards, with
  a reserved neutral slot when animal offers would otherwise fill the row. The
  XP tail has no player-visible level cap; after all finite cards are ranked,
  **Essence Cache** remains a legal fallback.
- Stress mode deterministically selects the first offer.
- Greg uses an audited low-poly fox glTF with deterministic animation and stable
  attachment sockets.
- GPU-instanced enemy/projectile/pickup rendering is already demonstrated.
- Authoritative trait visual state is projected onto those sockets: Quills and
  Pouch Bud/Adapted forms replace cleanly, and Thornstorm consumes both into one
  Mythic silhouette.
- The limited Greg catalog keeps unsupported future commands out of offers.
  `applyAreaDamage` and `playTraitCue` are supported; zone, mark, chain, melee,
  and shield commands explicitly reject until they have persistent state.
- Executed trait commands cross a read-only presentation stream through the
  fixed-tick driver, so Puffer Pouch and Thornstorm retain ordered telegraph,
  gather, knockback, and burst effects across catch-up frames.
- The HUD and persistent Active Adaptations panel explain selected animal effects
  and cadence. The centered pause panel is the full build reference: it shows
  both owned animal adaptations and neutral run-upgrade ranks/effects without
  cycling per-action text over active combat.
- The player-facing HUD persistently projects authoritative elapsed time,
  phase, and the current objective. It names survival until **The Final
  Threat** before the boss and defeating that threat during the boss phase.
- Greg has renderer-only locomotion with a 45-degree-per-tick visual turn cap
  and hysteresis. Sharp reversals resolve across four bounded visual turns while
  position, input, simulation, and replay remain unchanged; repeat auto-attacks
  do not restart an active attack clip.
- A fixed minor/major world-space arena grid gives camera-following movement a
  stable reference without affecting simulation state or per-frame allocation.
- The orthographic follow camera uses a deliberately tighter presentation-only
  frame so Greg, nearby threats, and XP motes are readable at a glance; it does
  not alter simulation space, balance, input, hashing, or replay.
- Bounded primitive feedback pools show ordinary attacks, hits, pickups, and
  deaths as short additive fading rings alongside trait effects, without
  mutating gameplay state.
- Ordinary fodder and runner waves now approach from beyond the current camera
  boundary rather than materializing at weapon range. Their authored 760–920
  world-unit placement is paired with phase-specific density/cap escalation;
  the boss owns its entrance tick and retains its temporary 18× HP adapter
  multiplier (1,440 HP) while broader boss balance work is built.
- Distant runners use a deterministic weave before directly seeking nearby
  Greg. Elites hold a range band, orbit or retreat, and fire orange-red hostile
  projectiles after a 72-tick delay in firing range and then every 150 in-range
  ticks. Their 8-damage shots are authoritative, respect player invulnerability,
  and render in their own instanced hostile-projectile batch.
- Director events present phase, elite, boss, victory, and defeat notices in
  normal mode. Elites and bosses have distinct bounded instanced primitive roles.
- App-owned enemy snapshots copy current and maximum health, so a persistent,
  accessible boss-health bar appears only while the authoritative boss is live.
- Terminal outcome UI is wired to the simulation-owned run outcome, settles
  earned Essence exactly once per app-owned run id, and uses **Continue to
  upgrades** to return to the next-run prep screen instead of restarting
  immediately.
- A versioned local browser profile holds Essence and the first capped permanent
  purchase, **Starting Vitality** (three +10 maximum-health ranks). Its
  normalized result applies only when the next deterministic run is created;
  the profile appears on the prep card, not in active combat.
- The normal web-toy HUD and controls are compact and player-facing;
  `?debug=1` restores diagnostics and engineering controls for local checks.
- A live desktop run supports **Esc** as a repeat-safe pause/resume toggle; it
  ignores upgrade-prompt and terminal states so it cannot strand the run. A
  centered **Paused** notice tells the player how to resume and lists both
  animal and neutral owned upgrades instead of making the game appear frozen.
- A normal manual run remains at tick 0 behind a presentation-only **Start run**
  gate; autopilot and stress URLs bypass it. Until the first XP gain, the HUD
  also identifies visible green motes as XP to collect.
- Upgrade prompts focus the first offer, allow **1**/**2**/**3** direct picks,
  and preserve **Tab** + **Enter** navigation for mixed trait/universal/Essence
  choices. The touch joystick has a floating drag thumb; persistent Active
  Adaptations cards stay above that lower-left control in portrait and to its
  right in landscape. Pause, Restart run, and terminal Continue to upgrades use
  44px touch targets.
- Sparse procedural sound feedback is opt-in and **Off** by default. Players
  can enable it on the Start run card or with the in-run **Sound: Off/On**
  control; its stronger start/restart and upgrade confirmations remain sparse,
  alongside rate-limited pickup, a quiet auto-attack texture, player-hit
  warnings, and victory/defeat. It never changes gameplay or replay, and
  unavailable browser audio is a nonfatal silent fallback.
- `?autopilot=1&stress=1&fullrun=1` extends the deterministic first-offer stress
  harness from 18,000 to a terminal outcome no later than the 43,200-tick
  normal boundary for boss/run-flow UI checks; it is not normal-balance evidence.
- `Publish web-toy preview` is a constrained workflow for relevant `main`
  pushes: it tests, lints, and builds the browser slice, then publishes only
  `apps/web-toy/dist` through GitHub Pages Actions. Before a deployment URL can
  exist, the owner must enable **Settings → Pages → Build and deployment →
  Source: GitHub Actions**; obtain the GitHub-assigned URL from the green Action
  deployment or **Settings → Pages**, never by hardcoding one.

## Current verification snapshot

All package gates below completed successfully on 2026-07-11 from
`/Users/adammuncie/GameDev/AnimalSurvivor`:

- Headless simulation: **197/197** tests, typecheck, lint, and build passed.
- Trait runtime: **58/58** tests, typecheck, and lint passed.
- Run director: **71/71** tests, typecheck, lint, and build passed.
- Web toy: **195/195** tests, typecheck, lint, and production build passed.
- Total: **521** automated tests passed.
- The integrated real-trait/real-director replay reaches a terminal outcome no
  later than the 12:00 normal cap and reproduces its exact final hash.
- A local browser smoke verified the mixed chooser (two animal cards plus a
  reserved neutral Swift Paws card), selected that card, and showed its exact
  rank/effect in the pause panel. It was not a human balance playtest or a
  terminal-profile-flow test.
- Dedicated tests cover phase cadence, off-screen placement and edge rejection,
  24-XP elite drops, runner weave, Spitter/elite shots, pause/hash parity, and
  hostile snapshot presentation.
- The current production build transformed 1,243 modules; Vite reports its
  expected chunk-size warning for the roughly 2.06 MB minified main bundle
  (about 530 kB gzip).

Useful gate commands:

```bash
cd /Users/adammuncie/GameDev/AnimalSurvivor/spikes/headless-sim
npm test && npm run typecheck && npm run lint

cd /Users/adammuncie/GameDev/AnimalSurvivor/packages/trait-runtime
npm test && npm run typecheck && npm run lint

cd /Users/adammuncie/GameDev/AnimalSurvivor/packages/run-director
npm test && npm run typecheck && npm run lint

cd /Users/adammuncie/GameDev/AnimalSurvivor/apps/web-toy
npm test && npm run typecheck && npm run lint && npm run build
```

## Accepted decisions and documentation

Read these before changing architecture:

- `docs/status/current.md`
- `docs/greenlight-and-swarm-plan.md`
- `docs/decisions/0001-ai-native-production.md`
- `docs/decisions/0004-accept-headless-simulation.md`
- `docs/decisions/0005-accept-browser-technical-toy.md`
- `docs/decisions/0006-gpu-instanced-swarm-renderer.md`
- `docs/decisions/0007-greg-animated-hero-presentation.md`
- `docs/decisions/0008-accept-run-director.md`

Gate 0 has not received its ten external human concept interviews. Development
may continue at risk, but Gate 2 must not be described as passed without real
human playtesting.

## Known limitations

- Gate 0 still lacks its ten external human concept interviews.
- No human has played a complete normal-balance 12-minute browser run with the
  10:00 boss, mixed upgrades, or Starting Vitality. Automated replay and short
  smoke coverage do not validate pacing, clarity, or balance.
- Only two animal paths and six neutral run upgrades are implemented. **Luck**,
  more animal traits, player-selectable difficulties, and Hardcore Endless are
  explicitly deferred, not hidden or partially shipped.
- Essence and Starting Vitality are a local-browser first pass, not cloud saves,
  cross-device progression, a full menu, or a finished meta economy.
- An independently supplied Opus swarm packet was audited and all four of its
  standalone suites pass locally. It is retained as design reference only;
  [`docs/progression-roadmap.md`](docs/progression-roadmap.md) records the
  accepted guardrails and why no packet is being merged ahead of the required
  human normal-mode playtest.
- Trait-command timing, lifetimes, sizes, and colours need hands-on feedback;
  the current effects are deliberately bounded primitive cues, not final art.
- Zone, mark, chain, melee, and shield command kinds remain explicitly rejected
  until their persistent gameplay state is designed and implemented. Keep them
  out of player-facing catalogs in the meantime.
- Elite and boss roles are visually distinct primitives, but still need final
  authored meshes, animation, and richer entrance behavior.
- The normal-plus Spitter is implemented, but additional player attack families
  and broader enemy behavior families remain future content.
- The full-run browser stress option is an engineering UI check, not a
  normal-balance browser run or human-playtest result.
- The optional sound layer now includes stronger start/upgrade confirmations,
  a quiet auto-attack texture, and a rate-limited player-hit warning, but
  remains procedural feedback rather than a final audio mix or authored foley.
- Low-end physical devices, touch hardware, and forced WebGL context loss still
  require testing.
- GitHub Pages availability is pending the owner's one-time **Settings → Pages
  → Build and deployment → Source: GitHub Actions** choice and a green
  deployment from `main`; no hosted URL is assumed in these docs.
- Code splitting can be considered later; it is not the immediate gameplay
  bottleneck.

## Recommended next task

Run a focused human pressure playtest of the revised Greg loop before expanding
the enemy or player-attack catalog.

1. Confirm ordinary waves approach from outside the screen and that phase/level
   pressure is no longer safely ignorable around six to seven minutes. Record
   the phase, level, and exact failure mode rather than inferring balance from
   autoplay.
2. Verify that the six elite beats, their 24-XP pickup, runner weave, and
   cobalt Spitter/elite orange shots create readable movement decisions without unfair
   hits. Check that terminal **Continue to upgrades** returns to prep, the
   profile is absent during play, and a Vitality purchase applies only to a
   fresh next run.
3. Tune only authored, replay-safe pressure values from that evidence:
   placement, phase cadence/caps, bounded level-pressure steps, elite timing,
   and temporary boss health. Preserve deterministic placement and no same-tick
   wave burst.
4. If that loop is readable, design the next player attack family and a second
   enemy behavior with explicit simulation, replay, snapshot,
   visual, and playtest contracts.
5. Only after the compact loop is enjoyable should the owner enable GitHub Pages
   for a hosted test link and broaden external playtesting.

Do not add Luck, player-selectable difficulty, Hardcore Endless, broader enemy
families, or more animal traits opportunistically. Each needs a separate
truthful gameplay contract and should follow—not preempt—evidence that this
compact loop works.

## Non-negotiable technical rules

- Simulation is authoritative; renderers may only read snapshots/state.
- No wall-clock time, DOM, renderer objects, network, or ambient randomness in
  deterministic packages.
- No `Math.random` in simulation, trait, or director source.
- Keep fixed-tick order and replay/hash compatibility explicit.
- Any gameplay schema change must update replay compatibility and canonical hash.
- Never allow an upgrade prompt to consume or create catch-up time.
- Preserve pool-full degradation and deterministic ordering.
- Use `rg` for source discovery and `apply_patch` for edits.
- Do not claim a gate is passed without executing its acceptance checks.

## First instruction for the new agent

Read this handoff and `docs/status/current.md`, confirm the workspace is
`/Users/adammuncie/GameDev/AnimalSurvivor`, and run a quick `git status --short`.
Do not recreate the old Documents workspace or reimplement completed trait
socket, trait-command-presentation, or director-notice work. Start from the
most recent hands-on feedback; if no human tester is available, run the listed
gates and prepare the focused playtest/tuning work without claiming balance is
validated.
