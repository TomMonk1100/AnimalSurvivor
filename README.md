# Animal Survivor

Animal Survivor is a web-first, low-poly 3D animal bullet-heaven game in active
Gate 1 development. The repository now contains a playable Greg the fox vertical
slice: a deterministic simulation drives a browser game with visible hero
adaptations, automatic attacks, upgrades, elites, and a boss encounter.

This is a playtest build, not a finished game. Its current purpose is to make
the core movement, combat, upgrade, and visual-feedback loop easy to evaluate.

## Play the Gate 1 slice

From the repository root:

```bash
cd apps/web-toy
npm ci
npm run dev
```

Open the local Vite URL printed in the terminal (normally
`http://localhost:5173`).

- Move Greg with **WASD** or the **arrow keys**. On touch devices, use the
  bottom-left virtual joystick.
- Greg automatically attacks nearby enemies; there is no aiming control.
- When Greg levels up, the game pauses at an upgrade choice. Click a card to
  continue the run.
- **Porcupine Quills** fires quill bursts. **Puffer Pouch** pulls nearby enemies
  in, then upgrades into a wider knockback pulse. Adapt both paths to evolve
  them into **Thornstorm Mantle**, which gathers enemies before a radial quill
  storm.
- The on-screen **Pause / Resume**, **Restart w/ seed**, and autopilot controls
  are useful for repeatable checks.

For a deterministic accelerated run, append
`?autopilot=1&stress=1` to the local URL. The browser-specific README has the
full control list, diagnostics, and stress procedure:
[`apps/web-toy/README.md`](apps/web-toy/README.md).
For a short nontechnical hands-on test, use the
[Gate 1 owner playtest guide](docs/playtests/gate1-owner-playtest.md).

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

The technical slice has deterministic replay and browser parity coverage, but
real human balance testing is still pending. Hands-on play is needed to tune
movement feel, pacing, upgrade comprehension, trait readability, and the
elite/boss experience before this can advance beyond Gate 1.

For the up-to-date milestone, known gaps, and next work, see
[`docs/status/current.md`](docs/status/current.md). The original product
definition and execution plan remain in
[`docs/greenlight-and-swarm-plan.md`](docs/greenlight-and-swarm-plan.md), and
the AI-assisted operating rules are in
[`docs/ai-native-operating-model.md`](docs/ai-native-operating-model.md).
