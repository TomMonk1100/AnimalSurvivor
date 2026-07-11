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
  disables the legacy wave scheduler when it is active, maps six authored
  encounter archetypes onto regular/ranged/elite/boss presentation roles, tracks boss
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
- Director events now present phase, elite, boss, victory, and defeat notices
  in normal mode. Catch-up frames retain every director event stepped in that
  frame.
- A real integrated Greg autoplay using the actual trait runtime and run
  director reaches a terminal outcome no later than the normal cap and
  reproduces its exact replay hash. Its endurance configuration validates
  infrastructure, not normal difficulty balance.
- The first owner playtest found the vision promising. Screen-space vertical
  movement is corrected; upgrade cards now explain triggers, effects, sockets,
  Adapted improvements, and the Thornstorm pairing.
- The follow-up owner playtest confirmed the Essence/Starting Vitality loop and
  the new neutral cards, but found that Greg could stand still safely around
  six to seven minutes. That specific density feedback drives the current
  approach-wave, elite-reward, and ranged-pressure pass.
- A persistent Active Adaptations panel now keeps each selected build's effect
  and cadence visible after the choice card closes, including Thornstorm's
  telegraph-to-gather-to-storm sequence.
- The player-facing HUD now leads with Greg's health, level, cumulative XP,
  and the desktop movement/auto-fire reminder; its original performance data
  remains below that playtest information.
- That HUD now also persistently projects authoritative elapsed time, current
  run phase, and the phase-appropriate objective. Before the boss it names the
  survival goal; during the boss phase it makes defeating **The Final Threat**
  explicit, without changing simulation, replay, or balance.
- Per-action trait callouts are intentionally absent from active play. The
  persistent Active Adaptations panel and the central pause panel instead show
  the selected build's effects and cadence without covering combat.
- Greg now has a renderer-only locomotion projector with a 45-degree-per-tick
  visual turn cap and movement hysteresis. Sharp reversals resolve across four
  bounded visual turns while position, input, simulation, and replay remain
  unchanged; repeated automatic attacks no longer restart an active attack clip.
- A fixed two-layer world-space arena grid now gives movement stable visual
  reference points without touching simulation state or allocating per frame.
- The renderer's orthographic follow frame is deliberately tighter so Greg,
  nearby threats, and XP motes have a clearer first-glance scale; it remains a
  presentation-only camera change with no simulation-space or replay impact.
- Renderer-only combat cues now persist across fixed-tick catch-up. Their fixed
  primitive pools render ordinary attacks, pickups, hits, enemy deaths, and
  player death as short additive fading rings without mutating gameplay.
- Ordinary fodder and runner waves now begin at 760–920 world units, with brute
  and elite formations at 800–960. The deterministic placement adapter keeps a
  complete formation at its authored radius or rejects it at an edge; it never
  clamps an off-screen wave beside Greg. This is intended to make threats enter
  from beyond the current camera boundary rather than spawn at attack range.
- The boss is deliberately an exception at 400–480 world units, so its 10:00
  entrance reaches combat within seconds instead of spending much of the short
  response window walking in.
- Pressure now rises through authored phase cadence/caps: opening 75 ticks with
  10/18 live enemies; pressure 60 with 18/30; adaptation 45 with 30/48;
  mutation 30 with 46/72; and boss 36 with 36/56. Levels 4, 6, and 8 each add
  +1/+2 capacity and remove four cadence ticks, for a maximum of three steps.
- Six warned elite beats now occur one/two/three times across pressure,
  adaptation, and mutation (3:20; 5:40 and 7:00; 8:10, 9:00, and 9:30).
  Temporary brute-mapped elites retain 5× HP but now award 6× their 4-XP base
  drop—24 XP—with a visibly larger pickup.
- Runners now weave deterministically while distant and seek directly close to
  Greg. Elites skirmish at range, orbit or retreat, and fire orange-red hostile
  projectiles after 72 ticks in firing range and then every 150 in-range ticks;
  shots deal 8 damage and respect player invulnerability. Behavior state and
  cooldowns participate in replay/hash state, and hostile projectile snapshots
  remain visually distinct.
- The cobalt **Spitter** is now a distinct normal-plus ranged archetype: it
  joins pressure through mutation waves, awards 2 XP, holds the same skirmish
  band, and fires slower 6-damage orange shots after its own 90/180-tick
  in-range cadence. Its behavior, role, snapshot, fixed renderer batch, and
  replay state are covered by targeted tests.
- Actual executed trait commands now cross a presentation-only stream from the
  deterministic simulation through the fixed-tick driver. Puffer Pouch and
  Thornstorm therefore have distinct pooled telegraph, gather, knockback, and
  burst effects; catch-up commands reach the bounded renderer pool in order
  without entering the gameplay hash or replay state.
- Elites and bosses now have read-only presentation roles and distinct bounded
  instanced treatments: amber cylinder elites and violet cone bosses, while
  gameplay role state remains authoritative and hashed.
- App-owned enemy snapshots now copy current and maximum health. A persistent,
  accessible **The Final Threat** bar appears only while the authoritative boss
  is alive; it remains a read-only presentation surface outside hash and replay
  state.
- Terminal victory and defeat cards now use **Continue to upgrades**, which
  returns to the prep screen without replaying the settled run. Starting
  Vitality and Essence therefore appear only before a run, never in the active
  combat HUD; a fresh deterministic run is created when the player starts again.
- The normal web-toy HUD and controls are now compact and player-facing;
  `?debug=1` restores the diagnostic HUD and engineering controls for local
  checks.
- A live desktop run now supports **Esc** as a repeat-safe pause/resume toggle;
  it ignores upgrade-prompt and terminal states so it cannot strand the run. A
  centered **Paused** notice tells the player how to resume instead of making
  the game appear frozen.
- A normal manual run now waits at tick 0 behind a presentation-only **Start
  run** gate. Automated autopilot/stress paths bypass it, and the normal HUD
  identifies green motes as XP until Greg earns the first point.
- Upgrade prompts now put keyboard focus on the first offer, support **1**,
  **2**, and **3** for direct selection, and retain ordinary **Tab** + **Enter**
  button navigation. The touch joystick now has a floating drag thumb, while
  persistent Active Adaptations cards stay above that lower-left control in
  portrait and to its right in landscape; Pause, Restart run, and terminal Play
  again use 44px-high touch targets.
- Sparse procedural sound feedback is now opt-in and **Off** by default. The
  player can enable it from the Start run card or the in-run **Sound: Off/On**
  control; stronger start/restart and upgrade cues, rate-limited pickup,
  player-hit, and quiet auto-attack texture cues, plus victory/defeat, are
  synthesized. It never changes gameplay or replay, and unavailable browser
  audio is a nonfatal silent fallback.
- `?autopilot=1&stress=1&fullrun=1` extends the accelerated, deterministic
  first-offer stress harness from 18,000 to a terminal outcome no later than
  the 43,200-tick normal boundary for boss/run-flow UI checks. It is not
  evidence of normal-difficulty balance or survival.
- A constrained `Publish web-toy preview` workflow is prepared for relevant
  `main` pushes. It tests, lints, and builds the browser slice, then publishes
  only `apps/web-toy/dist` through GitHub Pages Actions once the repository
  owner enables Pages.
- The progression alpha has unbounded in-run XP, a mixed trait/neutral chooser,
  real XP Magnet attraction, Essence Cache fallback, local Essence settlement,
  and three ranks of next-run Starting Vitality. Its profile is a prep-screen
  decision, while normal mode remains a finite 12:00 run with a 10:00 boss.
- The current post-pressure verification pass has **521 tests** across the
  headless simulation (197), run director (71), trait runtime (58), and browser
  app (195), plus typecheck, lint, and production-build gates. Dedicated tests
  cover phase cadence, off-screen placement/edge rejection, 24-XP elite drops,
  runner/Spitter/elite behavior, hostile shots, pause/hash parity, and hostile
  snapshot presentation.
- The project is now backed up in the private GitHub repository
  `TomMonk1100/AnimalSurvivor` on `main`.

## Explicitly unvalidated

- Ten human concept interviews have not occurred.
- No complete normal-balance run has been played end-to-end by a human in the
  browser yet. The owner has now tested the progression loop and supplied the
  low-density feedback addressed above, but the revised pressure curve still
  needs a fresh hands-on run. The real integrated replay reaches a terminal
  outcome no later than the normal cap, but it does not replace pacing and
  clarity feedback.
- The `fullrun=1` browser stress option is an accelerated engineering path; it
  has not validated a normal-balance browser run, boss outcome, or human flow.
- Low-end-device rendering remains unknown. The regular stress fixture still
  renders 1,000 enemies, 500 friendly projectiles, and 200 pickups in four draw
  calls; role-specific enemies and hostile shots add only bounded fixed batches.
- Physical touch hardware and forced WebGL context-loss recovery remain untested.
- GitHub Pages still requires a one-time owner choice in **Settings → Pages →
  Build and deployment → Source: GitHub Actions**. After that, the actual
  hosted URL must be taken from the green Action deployment or **Settings →
  Pages**; it is not assumed or hardcoded in project documentation.
- Trait-command timing and visual readability still need a human playtest; the
  current effects are deliberately bounded primitive cues, not final art.
- The new optional sound layer is sparse procedural feedback, not a final audio
  mix or authored foley, and needs hands-on volume/timing feedback.
- Elite and boss roles are visually distinct primitives, but still need final
  authored meshes, animation, and richer entrance behavior.
- The normal-plus Spitter is implemented, but broader enemy families and
  additional player attack families still need content, balance, and playtests.

Gate 1 is allowed to proceed at risk because this is a zero-cash AI-built hobby
project. Gate 2 cannot pass without real human playtesting.

## Completed external work

The coding-only swarm assignment in
[`../handoffs/headless-simulation-swarm.md`](../handoffs/headless-simulation-swarm.md)
has returned. Its accepted and hardened copy is `spikes/headless-sim/`; audit
evidence is in
[`../verification/headless-sim-audit.md`](../verification/headless-sim-audit.md).

## Next integration sequence

1. If a hosted build is needed for a tester, enable GitHub Pages with **Settings
   → Pages → Build and deployment → Source: GitHub Actions**, then use the URL
   reported by a green `Publish web-toy preview` deployment from `main`.
2. Run a focused hands-on pressure test: verify off-screen approaches, rising
   density at levels 4/6/8 and through 6–10 minutes, the 24-XP elite reward,
   runner weave, Spitter/elite shots, and whether standing still is still safe.
3. Verify the terminal-to-prep flow: **Continue to upgrades** should show
   Essence/Starting Vitality only there, and a purchase should affect only the
   next fresh run.
4. Tune only authored pressure values from that evidence (placement, phase
   cadence/caps, level steps, and temporary boss health), retaining replay-safe
   definitions and no same-tick wave burst.
5. If the pressure pass is readable, design the next player attack family and a
   second enemy behavior with explicit simulation, replay, snapshot, visual,
   and playtest contracts.
6. Run physical-touch, low-end-device, and forced-WebGL-context-loss checks,
   then begin external human play checks once the normal-balance loop is enjoyable.

## Owner decisions remaining

- Later: choose or rename five favorite Mythic evolutions after they are playable.

No owner coding, art production, test execution, or file maintenance is required.
