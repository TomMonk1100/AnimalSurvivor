# @animalsurvivor/sim

The renderer-free, deterministic gameplay core for Animal Survivor. This is a
production package, not an experiment: browser presentation consumes its
snapshots and events but never mutates its state.

## Responsibilities

- Fixed-step simulation, seeded RNG, replay serialization, and canonical state
  hashing.
- Authoritative players, enemies, projectiles, pickups, persistent zones,
  combat, XP, upgrades, and run-terminal state.
- Hero-owned starter attacks and instincts, trait-runtime command execution,
  run-director intents, and data-defined enemy content.
- Deterministic run-start loadouts, universal upgrades, content validation, and
  the isolated attack-damage verification harness.

The public surface is [`src/index.ts`](src/index.ts). Application code imports
this package through the `@sim` alias configured in
[`apps/web-toy`](../../apps/web-toy); do not duplicate simulation code into a
renderer.

## Run locally

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run bench
npm run bench:projectiles
```

`npm test` first emits the TypeScript test build, then runs Node's test runner.
The generated `dist/` directory and `node_modules/` are intentionally ignored.

## Determinism contract

Simulation behavior is replay-bound. Any gameplay-relevant change must keep
these pieces aligned:

1. Config/content versioning and fingerprints.
2. Canonical state hashing, including every new authoritative state field.
3. Replay serialization and playback.
4. Focused package tests and the browser golden-replay/hash-parity suites.

Tuning, spawn logic, XP thresholds, and state-shape changes intentionally alter
canonical hashes. Rebaseline them only after reviewing the new behavior, never
by copying a failing assertion mechanically.

## Boundaries

- Simulation owns gameplay state; renderers read snapshots and presentation
  events only.
- Browser storage and accessibility preferences are resolved outside the
  package into a replay-bound `RunStartLoadout`.
- The trait runtime and run director enter through explicit ports/factories;
  this avoids an implicit dependency from deterministic simulation code to UI
  infrastructure.
- The package has no runtime dependencies. Keep new dependencies deliberate,
  deterministic, and covered by the supply-chain gate.

## Repository role

Operational references use `packages/sim/`, so future contributors do not
mistake the production core for disposable prototype code.
