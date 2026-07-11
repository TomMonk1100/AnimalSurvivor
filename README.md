# Animal Survivor

Animal Survivor is a web-first, low-poly 3D animal bullet-heaven game in active
Gate 1 development. The repository now contains a playable Greg the fox vertical
slice: a deterministic simulation drives a browser game with visible hero
adaptations, automatic attacks, upgrades, elites, and a boss encounter.

This is a playtest build, not a finished game. Its current purpose is to make
the core movement, combat, upgrade, progression, and visual-feedback loop easy
to evaluate.

## Play the Gate 1 slice

From the repository root:

```bash
cd apps/web-toy
npm ci
npm run dev
```

Open the local Vite URL printed in the terminal (normally
`http://localhost:5173`).

- A normal manual run waits at tick 0 behind **Start run**, so you can read the
  core loop before anything moves. The deterministic autopilot and stress URLs
  bypass that first-run gate.
- **Sound effects** are optional and start **Off**. Enable them on the Start
  run card or with the in-run **Sound: Off/On** control. The stronger but still
  sparse procedural cues confirm starting/restarting and upgrade choices, give
  spaced XP pickups, a quiet rate-limited auto-attack texture, and player-hit
  feedback, and mark victory or defeat. They never change gameplay or replay;
  an unavailable browser audio feature simply leaves the game playable and
  silent.
- Move Greg with **WASD** or the **arrow keys**. On touch devices, use the
  bottom-left virtual joystick. His facing is presentation-only: a sharp
  reversal visibly resolves across four bounded turns without changing movement
  input or simulation state.
- Greg automatically attacks nearby enemies; there is no aiming control.
- Short additive rings now mark ordinary shots, XP pickups, enemy deaths, and
  player hits. They are renderer-only feedback and never change combat,
  balance, or replay.
- Before Greg earns the first XP, the HUD labels visible green motes as XP so
  it is clear that collecting them creates levels and upgrade choices.
- The HUD also keeps the elapsed run time, current authored phase, and the
  phase-appropriate goal visible: survive until **The Final Threat**, then
  defeat it to finish the run.
- Normal mode has a hard **12:00** end. **The Final Threat** enters at **10:00**;
  defeat it before 12:00 to win. Normal mode does not enter hidden overtime.
- Ordinary fodder, runners, and Spitters enter from beyond the camera rather
  than materializing beside Greg (760–920 world units in the current adapter).
  Brutes and elites enter at 800–960, while the 10:00 boss deliberately starts
  nearer at 400–480 so its fight begins within seconds. Phase cadence ramps
  through **75 / 60 / 45 / 30 / 36** ticks (opening through boss), with base
  soft/hard caps of **10/18, 18/30, 30/48, 46/72, and 36/56**. Levels **4**,
  **6**, and **8** add a bounded **+1 soft / +2 hard** enemy capacity and remove
  four cadence ticks per step; no same-tick burst is allowed.
- Runners weave while approaching. The cobalt **Spitter** is a normal-plus
  ranged enemy that arrives after the opening, holds distance, and fires slow,
  dodgeable orange shots; elites are tougher ranged skirmishers with 24-XP
  reward motes.
- Greg has no player-visible level cap. When he levels up, the game pauses at an
  upgrade choice. The mixed chooser presents animal adaptations alongside six
  neutral run upgrades—**Swift Paws**, **XP Magnet**, **Sturdy Hide**,
  **Sharpened Instinct**, **Rapid Instinct**, and **Growth**—and reserves room
  for a neutral card when animal offers would otherwise fill the row. Once every
  finite run upgrade is complete, **Essence Cache** remains as a legal fallback.
  Click a card to continue; the first card receives keyboard focus, and **1**,
  **2**, or **3** (or **Tab** then **Enter**) choose without a mouse.
- **Porcupine Quills** fires quill bursts. **Puffer Pouch** pulls nearby enemies
  in, then upgrades into a wider knockback pulse. Adapt both paths to evolve
  them into **Thornstorm Mantle**, which gathers enemies before a radial quill
  storm.
- The normal interface stays compact and player-facing. Press **Esc** to pause
  or resume a live desktop run; the centered pause panel explains both owned
  animal adaptations and neutral run-upgrade ranks instead of cycling action
  copy above active combat. Append `?debug=1` to expose the diagnostic HUD and
  engineering controls for repeatable checks.
- On touch, the floating joystick thumb follows each drag. The persistent
  **Active Adaptations** cards stay above the lower-left joystick in portrait
  and clear to its right in landscape. **Pause**, **Restart run**, and terminal
  **Continue to upgrades** controls use 44px-high touch targets.
- A live boss exposes a persistent **The Final Threat** health bar. At victory or
  defeat, the outcome card banks the earned **Essence** once for that run and
  sends Greg back to the prep screen. Spend saved Essence on the capped
  **Starting Vitality** purchase there; each rank adds starting maximum health
  on the next run, without leaving permanent-stat UI over active play.
- The follow camera uses a deliberately tighter presentation-only frame, making
  Greg, nearby threats, and green XP motes easier to read without changing
  movement, simulation space, balance, or replay.

For a deterministic accelerated run, append
`?autopilot=1&stress=1` to the local URL. Append `&fullrun=1` to extend that
engineering harness to a terminal outcome no later than the 12-minute normal
boundary, including the boss encounter if Greg survives. It auto-selects
upgrades and is not a normal-balance playtest. The browser-specific README has
the full control list, diagnostics,
and stress procedure:
[`apps/web-toy/README.md`](apps/web-toy/README.md).
For a short nontechnical hands-on test, use the
[Gate 1 owner playtest guide](docs/playtests/gate1-owner-playtest.md).

## Share a hosted playtest

`Publish web-toy preview` is a GitHub Actions workflow for relevant pushes to
`main`. It tests, lints, and builds the browser slice, then publishes only
`apps/web-toy/dist` through GitHub Pages Actions.

Before the first deployment, the repository owner must enable GitHub Pages in
**Settings → Pages → Build and deployment → Source: GitHub Actions**. After a
green workflow run, open its deployment link in **Actions**, or **Settings →
Pages**, to get the GitHub-assigned playtest URL. The URL is intentionally not
hardcoded in this repository.

## Automated verification

Run the browser-slice checks from `apps/web-toy/`:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The deterministic simulation, trait runtime, and encounter director each have
their own focused test suites and commands in their package READMEs:
[`spikes/headless-sim/README.md`](spikes/headless-sim/README.md),
[`packages/trait-runtime/README.md`](packages/trait-runtime/README.md), and
[`packages/run-director/README.md`](packages/run-director/README.md).

## Current state

The current universal-progression and local-profile alpha has passed its full
deterministic and browser package gates, but human balance testing is still
pending. Hands-on play is needed to tune movement feel, pacing, upgrade
comprehension, trait readability, and the elite/boss experience before this can
advance beyond Gate 1. **Luck**, player-selectable difficulties, Hardcore
Endless, additional animal traits, and further player attack families are
deliberately deferred rather than implied by this small alpha catalog.

For the up-to-date milestone, known gaps, and next work, see
[`docs/status/current.md`](docs/status/current.md). The original product
definition and execution plan remain in
[`docs/greenlight-and-swarm-plan.md`](docs/greenlight-and-swarm-plan.md), and
the AI-assisted operating rules are in
[`docs/ai-native-operating-model.md`](docs/ai-native-operating-model.md).
