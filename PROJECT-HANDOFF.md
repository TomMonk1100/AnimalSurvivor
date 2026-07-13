# AnimalSurvivor Project Handoff

> **Current-state note — 2026-07-12:** The latest authoritative status is
> [docs/status/current.md](docs/status/current.md). The project now has a
> selectable founding roster of Greg, Benny, and Gracie, with hero selection
> persisted locally and included in the version-three run-start fingerprint.
> Benny and Gracie use procedural low-poly prototype presentation with distinct
> authored starter attacks and mastery paths. Older sections in this document retain
> historical 12-minute / 10:00-boss wording from earlier milestones; do not use
> that wording for current Forest Arsenal work. The current normal contract is
> 8:00 with the boss at 6:30.

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

Current playable focus: three founding heroes, distinct starter attacks, starter
mastery paths, a twelve-family/six-Mythic Forest Arsenal build, and a local
Field Guide/save-management loop. Greg's Rush Rake, Benny's Brace Bloom, and
Gracie's Scout mark instincts are integrated with authoritative state and cues.

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
- Config/replay compatibility is version 10. Typed upgrade selections, the
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
- The current trait catalog includes twelve shared attack families and six
  slot-consuming Mythics; the founding roster also owns distinct starter
  attacks and three-rank starter mastery cards.
- `initialTick` supports clean injection into simulation tick ownership.

### Run director

Path: `packages/run-director/`

- Historical (superseded) deterministic finite 12-minute Greg normal run; the
  boss entered at 10:00. Current normal mode is eight minutes with a 6:30 boss
  and no hidden overtime. Current timing is authoritative in `docs/status/current.md`.
- Opening, pressure, adaptation, mutation, and boss phases. Overtime belongs
  only to a future explicit endless definition.
- Historical elite/cap values from the superseded 12-minute snapshot remain
  below for archaeology; do not use them for tuning. Current elite timing and
  phase caps are defined by the live run-director package and current status.
- Emits pure intents; never owns simulation pools or renderer state.
- Imported swarm work was hardened so `RunDirector` saves include and verify
  the exact authored content fingerprint.

Temporary simulation mappings:

- fodder -> walker prototype;
- runner -> runner prototype;
- brute -> brute prototype;
- spitter -> cobalt ranged prototype (36 HP, 2 XP, slow hostile shots);
- charger -> deterministic wind-up/lunge prototype (46 HP, 3 XP);
- denial -> slow spacing ranged prototype (58 HP, 3 XP, hostile shots);
- elite -> brute prototype with 5x HP and 6x XP (24 XP from its base 4);
- boss -> brute prototype with 18x HP (1,440 HP in the current temporary tune).

Formation placement is deterministic arithmetic derived from director event
tick and sequence and consumes no simulation RNG. Ordinary fodder/runner waves
are authored at 760–920 world units (brutes/elites 800–960); the boss is
deliberately nearer at 400–480 so its historical 10:00 entrance reached combat
promptly; current director timing is documented in `docs/status/current.md`.
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
- The selected founding hero uses a stable presentation surface: Greg uses the
  audited low-poly fox glTF, while Benny and Gracie use procedural low-poly
  silhouettes with the same attachment socket contract. A renderer-only hero
  identity ring keeps the selected animal readable during play.
- GPU-instanced enemy/projectile/pickup rendering is already demonstrated.
- Authoritative trait visual state is projected onto those sockets: Quills and
  Pouch Bud/Adapted forms replace cleanly, and Thornstorm consumes both into one
  Mythic silhouette.
- The Forest Arsenal catalog exposes twelve launch families and six Mythics.
  `applyAreaDamage`, `markTargets`, authored damage zones, and `playTraitCue`
  are supported; chain, melee, and shield commands remain rejected until their
  persistent state is designed and implemented.
- Executed trait commands cross a read-only presentation stream through the
  fixed-tick driver, so Puffer Pouch and Thornstorm retain ordered telegraph,
  gather, knockback, and burst effects across catch-up frames.
- The HUD and persistent Active Adaptations panel explain selected animal effects
  and cadence. The centered pause panel is the full build reference: it shows
  both owned animal adaptations and neutral run-upgrade ranks/effects without
  cycling per-action text over active combat.
- The player-facing HUD persistently projects authoritative elapsed time,
  phase, and the current objective. Forest names **The Final Threat**; Saltwind
  names **The Sandglass Sovereign** consistently in the HUD, boss bar, and
  director notices.
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
  control; the prep card also exposes master, music-bed, and SFX mix sliders.
  Its stronger start/restart and upgrade confirmations remain sparse, alongside
  rate-limited pickup, a quiet auto-attack texture, player-hit warnings, and
  victory/defeat. It never changes gameplay or replay, and unavailable browser
  audio is a nonfatal silent fallback. Source-aware launch trait, instinct,
  boss-telegraph, and support-warning identities are now covered by the same
  rate-safe router. The voices remain procedural scaffolding; final authored
  audio is still open.
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

All package gates below completed successfully on 2026-07-12 from
`/Users/adammuncie/GameDev/AnimalSurvivor`:

- Headless simulation: **249/249** tests, typecheck, lint, and build passed.
- Trait runtime: **73/73** tests, typecheck, and lint passed.
- Run director: **73/73** tests, typecheck, lint, and build passed.
- Web toy: **323/323** tests, typecheck, lint, production build, and artifact
  identity check passed.
- Total: **718** automated tests passed.
- Cross-hero replay tests cover Greg, Benny, and Gracie; integrated runs
  reproduce their exact final hashes.
- Local browser boot verified the exact production artifact's title, build meta
  tag, prep-screen build label, public `build-info.json`, app boot, clean error
  console, hero portraits, prep controls, responsive modal focus at portrait
  and landscape sizes, and a successful Start-run transition. Build ID was
  `0.1.0+c2c56a14f039.2b20bd83.5e81a607`; the local artifact correctly reports
  dirty source because this worktree is not committed. This was not a human
  balance playtest or a hosted deployment check.
- Dedicated tests cover phase cadence, off-screen placement and edge rejection,
  elite drops, runner weave, Spitter/elite shots, Charger/Denial/Flanker/Support
  behaviors, bespoke boss charge/volley cues including the Saltwind variant,
  pause/hash parity, and hostile snapshot presentation.
- The run spawn boundary is now data-defined and validated for all ten authored
  archetypes, and the prep Field Guide exposes their tells, counters, and spawn
  profiles. The reusable content-production template records the required
  behavior, presentation, replay, performance, and provenance gates.
- Interactive input now supports keyboard, touch joystick, mouse click-drag,
  and standard gamepad left-stick/D-pad movement with tested precedence;
  sampled input remains part of the deterministic replay contract.
- The browser stack also completes and replays a full Saltwind 8-minute run,
  including the biome-specific apex request, without a hash mismatch.
- The checked-in golden corpus pins exact terminal hashes for Greg, Benny, and
  Gracie in both Forest and Saltwind.
- The prep screen exposes the audited credits/notices summary, including the
  three authored Field Guide portraits and two boss-health portraits; the current third-party notice and
  local-storage disclosure are checked in, while the repository license and
  final legal review remain open.
- Procedural audio now routes boss warning and arrival events as distinct,
  sequence-deduplicated cues, plus source-aware launch trait, instinct,
  boss-telegraph, and support-warning identities; final authored audio remains
  open.
- The current production build transformed 1,274 modules; Vite reports its
  expected chunk-size warning for the roughly 2.20 MB minified main bundle
  (about 572.89 kB gzip).
- Saltwind Ruins is selectable with `?biome=saltwind` after a Forest victory;
  its profile unlock, director definition, run-start fingerprint, and renderer
  palette and ruin-landmark layout are covered by automated gates. The
  Sandglass Sovereign name is carried through the HUD, boss bar, and notices.
- The Field Guide persists discovered Mythic recipe ids from terminal silhouettes
  and renders them as a bounded local recipe archive without adding a currency.
  A Forest victory also persists the first horizontal unlock: Saltwind Ruins;
  archived builds receive an authored final-form portrait tile with a
  deterministic glyph fallback and evolution tree. The prep layer also persists reduced-motion, reduced-flash, and
  high-contrast presentation settings plus a reduced render-quality tier that
  caps device pixel ratio without touching simulation fairness.
- Archived Field Guide entries can copy a stable issue report with build ID,
  run ID, hero, biome, seed, outcome, duration, kills, build name, browser/
  device, viewport, quality tier, and accessibility flags without persisting
  those environment fields.
- Mythic discoveries unlock persistent presentation palettes in profile schema
  v5; palette selection tints prep and arena presentation but never enters the
  deterministic run-start payload.
- The Field Guide now presents the complete six-recipe Mythic catalog with
  ingredient pairs and deterministic locked/discovered states; this is a
  profile presentation surface and does not change the simulation contract.
- The Field Guide now also presents a six-card Habitat Atlas. Forest is the
  known starting habitat; Saltwind and each hero habitat unlock from authored
  victories, while Mythic Canopy unlocks from an archived Mythic form.
- The browser viewport keeps zoom enabled and applies safe-area insets to the
  arena, HUD, touch joystick, and prep dialog; short/zoomed prep content scrolls
  inside its modal card.

Useful gate commands:

```bash
cd /Users/adammuncie/GameDev/AnimalSurvivor/spikes/headless-sim
npm test && npm run typecheck && npm run lint

cd /Users/adammuncie/GameDev/AnimalSurvivor/packages/trait-runtime
npm test && npm run typecheck && npm run lint

cd /Users/adammuncie/GameDev/AnimalSurvivor/packages/run-director
npm test && npm run typecheck && npm run lint

cd /Users/adammuncie/GameDev/AnimalSurvivor/apps/web-toy
npm test && npm run typecheck && npm run lint && npm run build && npm run verify:artifact && npm run verify:served
```

The Gate 0 artifact procedure and hosted-browser evidence checklist are in
[`docs/release/gate0-evidence.md`](docs/release/gate0-evidence.md).

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
- No human has played a complete normal-balance eight-minute browser run with
  the 6:30 boss, mixed upgrades, or Starting Vitality. Automated replay and
  short smoke coverage do not validate pacing, clarity, or balance.
- Three founding hero paths, six neutral run upgrades, twelve launch attack
  families, six Mythics, and the local Field Guide/save-management slice are
  implemented. Greg's Rush Rake, Benny's Brace Bloom, and Gracie's Scout marks
  are authoritative; **Luck**, more animal
  traits, player-selectable difficulties, and Hardcore Endless are explicitly
  deferred, not hidden or partially shipped.
- Essence and Starting Vitality are a local-browser first pass, not cloud saves,
  cross-device progression, a full menu, or a finished meta economy.
- An independently supplied Opus swarm packet was audited and all four of its
  standalone suites pass locally. It is retained as design reference only;
  [`docs/progression-roadmap.md`](docs/progression-roadmap.md) records the
  accepted guardrails and why no packet is being merged ahead of the required
  human normal-mode playtest.
- Trait-command timing, lifetimes, sizes, and colours need hands-on feedback;
  the current effects are deliberately bounded primitive cues, not final art.
- Chain, melee, and shield command kinds remain explicitly rejected until their
  persistent gameplay state is designed and implemented. Mark targeting and
  damage zones are now supported and player-facing.
- Elite and boss roles are visually distinct primitives, but still need final
  authored meshes, animation, and richer entrance behavior.
- The normal-plus Spitter, Charger, Denial, Flanker, and Support roles are
  implemented. The Final Threat's first bespoke phase cycle and the Saltwind
  variant are active, with biome-specific apex copy now player-facing; final
  authored meshes, audio, and second-biome environment dressing remain future
  work.
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

Continue the final authored presentation pass for the Forest boss and Saltwind
Ruins while keeping human playtests deferred.

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
4. When human evidence becomes available, use the Gate 1 pressure sheet to tune
   only authored, replay-safe values and then broaden external testing.

Do not add Luck, player-selectable difficulty, Hardcore Endless, broader enemy
families, or more animal traits opportunistically. Each needs a separate
truthful gameplay contract.

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
socket, trait-command-presentation, launch-pool, Field Guide, biome-unlock, or
director-notice work. Start with the next bounded V1 slice: final authored
presentation and accessibility. If no human tester is available, keep running
the listed gates and implement deterministic release slices without claiming
balance is validated.
