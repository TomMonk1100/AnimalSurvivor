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
- Terminal outcome UI is wired to the simulation-owned run outcome.

## Verified state after moving the project

All checks below ran successfully from
`/Users/adammuncie/GameDev/AnimalSurvivor` on 2026-07-10:

- Headless simulation: 155/155 tests passed; typecheck and lint passed.
- Trait runtime: 58/58 tests passed; typecheck and lint passed.
- Run director: 61/61 tests passed; typecheck and lint passed.
- Web toy: 101/101 tests passed; typecheck and lint passed.
- Total: 375 passing automated tests.
- Web production build passed: 1,216 modules transformed.
- `npm ci` reported zero vulnerabilities in every package.
- Concrete simulation + real TraitRuntime + real RunDirector replay reproduced
  the exact final hash with a recorded trait selection.
- Live browser smoke test passed at 60 FPS with no console errors:
  - gameplay advanced;
  - director spawned enemies;
  - XP produced a deterministic three-choice prompt;
  - Porcupine Quills Bud was selected;
  - simulation resumed cleanly with no dropped accumulated time.

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

- Trait visual state is exposed by the simulation and web driver but is not yet
  fully projected onto Greg's live renderer sockets.
- Only the first Quills/Pouch/Thornstorm combat-command subset is implemented:
  directed/radial projectile bursts, gather, knockback, and telegraphs.
- Remaining authored command kinds must be implemented or explicitly rejected.
- Elite and boss currently reuse the brute prototype and need distinct visual
  presentation later.
- Phase changes, elite/boss warnings, and richer victory/defeat presentation are
  not implemented.
- The full 12-minute balance curve has not been human-playtested.
- Low-end physical devices, touch hardware, and forced WebGL context loss still
  require testing.
- Production JavaScript is currently about 2 MB minified; code splitting can be
  considered later, but it is not the immediate gameplay bottleneck.

## Recommended next task

Connect authoritative trait visual state to Greg's stable attachment sockets.

Scope:

1. Carry `traitVisualState()` into the renderer-facing presentation layer
   without letting rendering mutate or step simulation state.
2. Map Porcupine Quills Bud/Adapted, Puffer Pouch Bud/Adapted, and Thornstorm
   Mythic visual keys to the existing validated primitive recipes.
3. Show/hide attachments according to `enabled`, stage, source ID, and socket
   occupancy.
4. Preserve interpolation, deterministic hash parity, and renderer-off parity.
5. Add focused presentation/contract tests and run all affected gates.
6. Perform a live browser check that selecting an upgrade visibly changes Greg
   and that Mythic replacement hides consumed independent attachments.

After that:

1. finish or reject the remaining trait command vocabulary;
2. add phase/warning/elite/boss presentation from `directorEvents`;
3. run a complete 12-minute autoplay and replay parity test;
4. begin human playtesting.

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
`/Users/adammuncie/GameDev/AnimalSurvivor`, run a quick `git status --short`,
then start the recommended trait-visual socket integration. Do not recreate the
old Documents workspace.
