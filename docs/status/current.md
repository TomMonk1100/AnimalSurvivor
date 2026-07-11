# Current Project Status

**Updated:** 2026-07-10  
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

## Explicitly unvalidated

- Ten human concept interviews have not occurred.
- No complete run has been played end-to-end in the browser yet. The deterministic
  win/loss loop and level-up flow are headless-covered, but still need clean
  web-toy typecheck/test/build and live-browser passes after the local Node
  file-read stall is cleared.
- Low-end-device rendering remains unknown, but the instanced primitive fixture
  now renders 1,000 enemies, 500 projectiles, and 200 pickups in four draw calls.
- Physical touch hardware and forced WebGL context-loss recovery remain untested.
- Greg's two coded attachments prove socket coherence, but their Adapted/Mythic
  forms and combat behaviors are not integrated yet.
- Run warnings, elite/boss-specific models, and phase presentation are not yet
  rendered; elite and boss intents currently use the brute prototype with
  explicit health multipliers.

Gate 1 is allowed to proceed at risk because this is a zero-cash AI-built hobby
project. Gate 2 cannot pass without real human playtesting.

## Completed external work

The coding-only swarm assignment in
[`../handoffs/headless-simulation-swarm.md`](../handoffs/headless-simulation-swarm.md)
has returned. Its accepted and hardened copy is `spikes/headless-sim/`; audit
evidence is in
[`../verification/headless-sim-audit.md`](../verification/headless-sim-audit.md).

## Next integration sequence

1. Connect runtime visual states for Porcupine Quills, Puffer Pouch, and
   Thornstorm to Greg's stable renderer sockets.
2. Implement or explicitly reject the remaining authored runtime command kinds;
   the current executor intentionally handles the first Quills/Pouch/Thornstorm
   subset only.
3. Add phase, warning, elite, boss, victory, and defeat presentation using the
   simulation-owned director event stream.
4. Run a clean live-browser level-up/choice/resume/run-director pass, then
   physical-touch and forced-context-loss checks.
5. Run the first complete human play checks after the run loop is integrated.

## Owner decisions remaining

- Later: choose or rename five favorite Mythic evolutions after they are playable.

No owner coding, art production, test execution, or file maintenance is required.
