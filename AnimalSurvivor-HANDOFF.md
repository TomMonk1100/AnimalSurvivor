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
- Combat, projectiles, pickups, XP, replay recording, canonical state hashing.
- Structural injection ports keep the package free of runtime dependencies on
  the trait and run-director packages.
- Replay schema version is 3.

Important integration files:

- `src/simulation.ts`
- `src/trait-runtime-port.ts`
- `src/trait-command-executor.ts`
- `src/trait-upgrade-queue.ts`
- `src/run-director-port.ts`
- `src/run-spawn-adapter.ts`

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

- Deterministic 12-minute Greg run.
- Opening, pressure, adaptation, mutation, boss, and overtime phases.
- Three authored elite beats, boss entrance, victory, defeat, and overtime.
- Emits pure intents; never owns simulation pools or renderer state.
- Imported swarm work was hardened so `RunDirector` saves include and verify
  the exact authored content fingerprint.

Temporary simulation mappings:

- fodder -> walker prototype;
- runner -> runner prototype;
- brute -> brute prototype;
- elite -> brute prototype with 5x HP;
- boss -> brute prototype with 30x HP.

Formation placement is deterministic arithmetic derived from director event
tick and sequence and consumes no simulation RNG.

### Web toy

Path: `apps/web-toy/`

- Vite + PlayCanvas web application.
- Fixed-tick simulation driver with interpolation and capped catch-up.
- Real `TraitRuntime` and `RunDirector` factories are injected.
- Upgrade prompts pause exactly at a tick boundary and resume without time
  bursts or lost accumulated time.
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
- The HUD and persistent Active Adaptations panel explain selected effects and
  cadence; short callouts name live Puffer and Thornstorm actions.
- Greg has renderer-only locomotion with a 45-degree-per-tick visual turn cap
  and hysteresis. Sharp reversals resolve across four bounded visual turns while
  position, input, simulation, and replay remain unchanged; repeat auto-attacks
  do not restart an active attack clip.
- A fixed minor/major world-space arena grid gives camera-following movement a
  stable reference without affecting simulation state or per-frame allocation.
- Bounded primitive feedback pools show attacks, hits, pickups, deaths, and
  trait effects without mutating gameplay state.
- Director events present phase, elite, boss, overtime, victory, and defeat
  notices. Elites and bosses have distinct bounded instanced primitive roles.
- App-owned enemy snapshots copy current and maximum health, so a persistent,
  accessible boss-health bar appears only while the authoritative boss is live.
- Terminal outcome UI is wired to the simulation-owned run outcome and includes
  **Play again** for a same-seed restart.
- The normal web-toy HUD and controls are compact and player-facing;
  `?debug=1` restores diagnostics and engineering controls for local checks.
- A normal manual run remains at tick 0 behind a presentation-only **Start run**
  gate; autopilot and stress URLs bypass it. Until the first XP gain, the HUD
  also identifies visible green motes as XP to collect.
- Upgrade prompts focus the first offer, allow **1**/**2**/**3** direct picks,
  and preserve **Tab** + **Enter** navigation. The touch joystick has a
  floating drag thumb; persistent Active Adaptations cards stay above that
  lower-left control in portrait and to its right in landscape. Pause, Restart
  run, and terminal Play again use 44px touch targets.
- `?autopilot=1&stress=1&fullrun=1` extends the deterministic first-offer stress
  harness from 18,000 to the 43,200-tick authored boundary for boss/run-flow UI
  checks; it is not normal-balance evidence.
- `Publish web-toy preview` is a constrained workflow for relevant `main`
  pushes: it tests, lints, and builds the browser slice, then publishes only
  `apps/web-toy/dist` through GitHub Pages Actions. Before a deployment URL can
  exist, the owner must enable **Settings → Pages → Build and deployment →
  Source: GitHub Actions**; obtain the GitHub-assigned URL from the green Action
  deployment or **Settings → Pages**, never by hardcoding one.

## Current verification snapshot

All checks below ran successfully from
`/Users/adammuncie/GameDev/AnimalSurvivor` on 2026-07-11:

- Headless simulation: 161/161 tests passed; typecheck and lint passed.
- Trait runtime: 58/58 tests passed; typecheck and lint passed.
- Run director: 61/61 tests passed; typecheck and lint passed.
- Web toy: 164/164 tests passed; typecheck, lint, and production build passed.
- Total: 444 passing automated tests.
- Web production build passed: 1,231 modules transformed. The current main
  JavaScript bundle is about 2.03 MB minified (522 kB gzip); Vite reports the
  expected chunk-size warning.
- Concrete simulation + real TraitRuntime + real RunDirector replay reproduced
  the exact final hash with a recorded trait selection.
- A real 43,200-tick Greg autoplay using the real trait runtime and director
  reaches the boss and reproduces its exact replay hash. Its endurance setup
  validates infrastructure, not normal difficulty balance.
- A short local browser smoke pass advanced gameplay and showed no console
  errors, but it is not a human end-to-end playtest.

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
- No human has played a complete normal-balance 12-minute browser run. Automated
  replay and short smoke coverage do not validate pacing, clarity, or balance.
- Trait-command timing, lifetimes, sizes, and colours need hands-on feedback;
  the current effects are deliberately bounded primitive cues, not final art.
- Zone, mark, chain, melee, and shield command kinds remain explicitly rejected
  until their persistent gameplay state is designed and implemented. Keep them
  out of player-facing catalogs in the meantime.
- Elite and boss roles are visually distinct primitives, but still need final
  authored meshes, animation, and richer entrance behavior.
- The full-run browser stress option is an engineering UI check, not a
  normal-balance browser run or human-playtest result.
- Low-end physical devices, touch hardware, and forced WebGL context loss still
  require testing.
- GitHub Pages availability is pending the owner's one-time **Settings → Pages
  → Build and deployment → Source: GitHub Actions** choice and a green
  deployment from `main`; no hosted URL is assumed in these docs.
- Code splitting can be considered later; it is not the immediate gameplay
  bottleneck.

## Recommended next task

If a hosted tester link is needed, first enable **Settings → Pages → Build and
deployment → Source: GitHub Actions**, then use the GitHub-assigned URL from a
green `Publish web-toy preview` deployment on `main`. Run a second hands-on
desktop playtest after that, then make one evidence-led presentation tuning
pass. Do not reopen completed trait-socket, command-stream, or director-notice
integration without a reproducible regression.

Scope:

1. Test corrected vertical movement, locomotion smoothness, upgrade-card and
   Active Adaptations comprehension, combat/trait callouts, and elite/boss
   readability, boss-health progress, terminal **Play again** flow, keyboard
   upgrade selection, and touch joystick feedback plus joystick-safe
   adaptation-card placement on desktop/mobile.
2. Record concrete observations at the relevant trait or director event rather
   than inferring balance from the autoplay fixture.
3. Tune only the bounded renderer-facing cue lifetimes, sizes, colours, and
   messaging indicated by that feedback; preserve simulation and replay hashes.
4. Re-run the affected automated gates and retain the distinction between a
   successful smoke test and a normal-balance human run.

After that:

1. decide whether each remaining unsupported trait command kind gets persistent
   state or remains excluded from all player-facing catalogs;
2. run physical-touch, low-end-device, and forced-WebGL-context-loss checks;
3. begin broader external human play checks once the normal-balance loop is
   enjoyable.

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
