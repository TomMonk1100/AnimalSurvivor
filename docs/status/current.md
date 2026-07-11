# Current Project Status

**Updated:** 2026-07-11
**Active milestone:** Gate 1 playable Greg vertical slice, conditional/at-risk  
**Budget model:** AI subscription usage; no additional cash

## Completed

- Market and platform greenlight research.
- Storybook Wildguard visual direction selected.
- Founding heroes locked: Greg the fox, Benny the bull, Gracie the alpaca.
- Gate 0 visual grammar, three direction boards, gameplay/control animatics,
  twelve attachments, six Mythics, asset audit, landing test, and browser QA.
- Quaternius fox glTF and CC0 license inspected and preserved.
- Gate 0 package is ready for human testing.
- Headless simulation swarm output independently audited, revised, and accepted
  under [`ADR 0004`](../decisions/0004-accept-headless-simulation.md).
- Accepted simulation passed 154 tests at the run-director integration
  checkpoint, plus typecheck, lint, the 1,000-enemy
  benchmark, and a 500-projectile saturation benchmark.
- Browser technical toy audited, hardened, and accepted for Gate 1 under
  [`ADR 0005`](../decisions/0005-accept-browser-technical-toy.md).
- Browser/headless parity confirmed at tick 18,000 with hash
  `9e436ff6bc30d8a5`; live WebGL reached 1,000 enemies at 60 FPS on the tested M4.
- Hardware-instanced swarm renderer accepted under
  [`ADR 0006`](../decisions/0006-gpu-instanced-swarm-renderer.md): the 1,700-object
  stress fixture renders in four draw calls.
- Greg's audited fox glTF, deterministic animation controller, stable attachment
  sockets, and live Porcupine/Puffer Bud prototypes accepted under
  [`ADR 0007`](../decisions/0007-greg-animated-hero-presentation.md).
- Greg browser pass: 60 FPS at 390 × 844, p95 18.7 ms, no dropped simulation
  time, and no console warnings/errors on the tested M4.
- Rush Rake now has an exported deterministic fixed-tick reducer and a separate
  renderer cue projector. Near-misses correctly shorten its movement charge;
  three waves preserve authored tick order and deterministic target ties.
- All five first-slice visual keys now have validated immutable primitive
  recipes: Quills/Pouch Bud and Adapted plus Thornstorm Mythic.
- The returned deterministic trait runtime is imported at `packages/trait-runtime/`
  and hardened after review: custom catalogs execute correctly, ticks are
  strictly sequential, saves are catalog-bound and semantically validated, and
  public state snapshots cannot mutate the runtime. Its 58 tests, typecheck,
  lint, and 18,000-tick benchmark pass with reproducible hash
  `02cd9d40ff35422c`.
- The simulation now exports a deterministic, allocation-conscious trait-command
  executor for Quills/Pouch/Thornstorm. It performs directed and radial bursts,
  gather, knockback, and telegraph handling with pool-full degradation,
  Float32/grid consistency, authored range, batch prevalidation, and 13 focused
  tests.
- Trait runtime ownership is now integrated into the simulation behind a
  structural zero-dependency port. Fixed ticks update traits, emitted commands
  execute before projectile resolution, level gains queue deterministic offers,
  choices block/resume advancement atomically, and trait catalog/build/queue
  state participates in replay compatibility and canonical hashing.
- The web toy now instantiates the real trait runtime, stops catch-up at exact
  upgrade boundaries, preserves prompt dwell time correctly, exposes trait
  visual state, and presents deterministic level-up choices. Stress mode selects
  the first offer deterministically so automated runs do not stall.
- The returned deterministic run director is imported at
  `packages/run-director/` and accepted with revisions under
  [`ADR 0008`](../decisions/0008-accept-run-director.md). Its 61 tests and lint
  pass. Saves are now bound to the exact authored content fingerprint.
- The simulation now owns an optional run director through a structural port,
  disables the legacy wave scheduler when it is active, maps the five authored
  encounter roles onto the three prototype enemy archetypes, tracks boss
  identity and same-tick defeat, and includes run content/state in replay and
  canonical hashing. A concrete 600-tick run with the real trait and director
  packages completed deterministically; replay with a real trait selection
  reproduced the exact state hash.
- Greg's authoritative visual trait state is now projected onto stable live
  sockets: Quills and Pouch Bud/Adapted forms replace correctly, and Thornstorm
  consumes both into one Mythic silhouette.
- The playable browser build now uses the intentionally limited Greg vertical
  slice catalog, so unsupported future-trait commands cannot appear in offers.
  `applyAreaDamage` and `playTraitCue` are supported; zone, mark, chain, melee,
  and shield commands explicitly reject until their persistent state exists.
- Director events now present phase, elite, boss, overtime, victory, and defeat
  notices. Catch-up frames retain every director event stepped in that frame.
- A real 43,200-tick Greg autoplay using the actual trait runtime and run
  director reaches the boss and reproduces its exact replay hash. Its endurance
  configuration validates infrastructure, not normal difficulty balance.
- The first owner playtest found the vision promising. Screen-space vertical
  movement is corrected; upgrade cards now explain triggers, effects, sockets,
  Adapted improvements, and the Thornstorm pairing.
- Greg now has a renderer-only locomotion projector with bounded turning and
  movement hysteresis; repeated automatic attacks no longer restart an active
  attack clip.
- Renderer-only combat cues now persist across fixed-tick catch-up, and fixed
  primitive feedback pools show attacks, hits, pickups, enemy deaths, and player
  death without mutating gameplay.
- Actual executed trait commands now cross a presentation-only stream from the
  deterministic simulation through the fixed-tick driver. Puffer Pouch and
  Thornstorm therefore have distinct pooled telegraph, gather, knockback, and
  burst effects; catch-up commands reach the bounded renderer pool in order
  without entering the gameplay hash or replay state.
- Elites and bosses now have read-only presentation roles and distinct bounded
  instanced treatments: amber cylinder elites and violet cone bosses, while
  gameplay role state remains authoritative and hashed.
- The project is now backed up in the private GitHub repository
  `TomMonk1100/AnimalSurvivor` on `main`.

## Explicitly unvalidated

- Ten human concept interviews have not occurred.
- No complete normal-balance run has been played end-to-end by a human in the
  browser yet. The real 12-minute deterministic replay gate and a short live
  browser smoke pass now succeed, but they do not replace hands-on pacing and
  clarity feedback.
- Low-end-device rendering remains unknown, but the instanced primitive fixture
  now renders 1,000 enemies, 500 projectiles, and 200 pickups in four draw calls.
- Physical touch hardware and forced WebGL context-loss recovery remain untested.
- Trait-command timing and visual readability still need a human playtest; the
  current effects are deliberately bounded primitive cues, not final art.
- Elite and boss roles are visually distinct primitives, but still need final
  authored meshes, animation, and richer entrance behavior.

Gate 1 is allowed to proceed at risk because this is a zero-cash AI-built hobby
project. Gate 2 cannot pass without real human playtesting.

## Completed external work

The coding-only swarm assignment in
[`../handoffs/headless-simulation-swarm.md`](../handoffs/headless-simulation-swarm.md)
has returned. Its accepted and hardened copy is `spikes/headless-sim/`; audit
evidence is in
[`../verification/headless-sim-audit.md`](../verification/headless-sim-audit.md).

## Next integration sequence

1. Run a second hands-on desktop playtest focused on corrected controls,
   locomotion feel, upgrade comprehension, combat/trait feedback, and
   elite/boss readability.
2. Tune the trait-command cue lifetimes, sizes, and colors from that playtest,
   especially Puffer Pouch and Thornstorm's telegraph-to-exhale sequence.
3. Decide whether to implement each remaining authored command kind or keep it
   out of all player-facing catalogs until its persistent gameplay state exists.
4. Run physical-touch, low-end-device, and forced-WebGL-context-loss checks.
5. Begin external human play checks once the normal-balance loop is enjoyable.

## Owner decisions remaining

- Later: choose or rename five favorite Mythic evolutions after they are playable.

No owner coding, art production, test execution, or file maintenance is required.
