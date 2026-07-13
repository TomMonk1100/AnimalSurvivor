# Parallel Swarm Handoff: Headless Simulation Core

## Copy-paste assignment

You are a coding-only agent swarm working in the AnimalSurvivor repository.
Build a self-contained, renderer-free simulation spike under:

```text
packages/sim/
```

This is parallel work. Other agents are editing the rest of the repository.

## Absolute ownership boundary

You may create or edit files only inside `packages/sim/`.

Do not edit, move, format, stage, or delete anything outside that directory. In
particular, do not touch root configuration, `README.md`, `docs/`, `assets/`,
`gate0/`, `.gitignore`, lockfiles outside your directory, or existing untracked
files. Keep the spike's `package.json`, lockfile, TypeScript configuration, tests,
benchmarks, and documentation inside its owned directory.

Use a separate `codex/` branch or worktree if available. Return a commit hash or
patch limited to the owned directory. Never merge into the main branch yourself.

## Coding-only restriction

Do not produce or modify:

- graphics, rendering code, shaders, canvas, WebGL, PlayCanvas, Three.js, or DOM;
- HTML, CSS, UI, menus, HUDs, or browser pages;
- images, video, models, sounds, animations, icons, or visual mockups;
- asset downloads or asset-processing pipelines;
- game-design expansion beyond the contracts below.

The package must run entirely in Node for tests and benchmarks. No runtime network
access, backend, paid service, API key, database, or native binary is permitted.

## Objective

Determine whether a deterministic TypeScript simulation can cheaply support the
core combat load before it is connected to any renderer.

The spike should model:

- one player position and health state;
- pooled enemies moving toward the player;
- pooled projectiles and XP pickups;
- fixed-timestep updates;
- seeded randomness;
- uniform-grid spatial queries;
- automatic targeting;
- timed wave spawning;
- damage, death, pickup collection, and XP level thresholds;
- serializable input/replay records and deterministic state hashes.

## Required architecture

Prefer plain TypeScript and typed arrays over a general-purpose ECS dependency.
Small development-only packages for tests and TypeScript compilation are allowed.

Suggested modules:

```text
packages/sim/
  src/
    index.ts
    config.ts
    rng.ts
    clock.ts
    pools.ts
    spatial-grid.ts
    targeting.ts
    wave-director.ts
    combat.ts
    simulation.ts
    replay.ts
    state-hash.ts
  test/
  bench/
  package.json
  tsconfig.json
  README.md
```

The exact file split may change, but public contracts must remain small and
documented.

## Required behavior

### Deterministic clock

- Default simulation frequency: 60 Hz.
- Advance by integer ticks, not wall-clock deltas.
- Support pause without advancing RNG or timers.
- The same seed, configuration, and recorded player movement must produce the
  same final state hash.

### Seeded RNG

- No `Math.random()` inside simulation code.
- Provide explicit methods for integer ranges, floats, chance, and deterministic
  selection.
- RNG state must be serializable.

### Pools

- Fixed-capacity or explicitly growable pools for enemies, projectiles, and
  pickups.
- Stable numeric entity IDs with stale-ID protection or generation counters.
- No per-entity class instances in the hot loop.
- Reuse slots after despawn/death.

### Spatial grid

- Insert, remove/update, and query entities in a 2D uniform grid.
- Radius query and nearest-neighbor query.
- Correctness test against brute force over randomized deterministic fixtures.
- No all-pairs enemy collision loop.

### Automatic targeting policies

Implement pure, renderer-independent functions for:

1. nearest valid enemy;
2. highest-health enemy within range;
3. densest cluster sector or target proxy;
4. marked target, then nearest fallback;
5. nearest rear threat relative to movement direction.

Tie-breaking must be deterministic, preferably lowest stable entity ID.

### Wave director

- Data-defined timed spawn segments.
- Spawn rate, enemy archetype weights, maximum alive count, and deterministic
  elite events.
- Must degrade safely when a pool is full rather than corrupting state.

### Combat and progression

- Projectiles support position, velocity, damage, lifetime, hit radius, pierce,
  and owner/faction.
- Enemy contact damage uses cooldown or invulnerability ticks.
- Dead enemies may produce deterministic XP pickups.
- Pickup collection increases XP and exposes level-up events.
- No attachment-specific balance content is required; provide generic behavior
  hooks that later systems can call.

### Replay and state hashing

- Record seed, config version, and per-tick player movement vector.
- Replay from the record without wall-clock input.
- Produce a stable final hash from all gameplay-relevant state.
- Exclude diagnostic counters and object/property iteration order from the hash.

## Tests

At minimum, automate:

- same seed + same inputs = same state hash;
- different seed changes a scenario that uses randomness;
- pause leaves tick, timers, entities, and RNG unchanged;
- pool slots are safely reused;
- stale IDs cannot mutate a replacement entity;
- grid radius/nearest results match brute force;
- every targeting policy obeys range, faction, liveness, and deterministic ties;
- full pools fail safely;
- replay reproduces the original run;
- XP thresholds emit the expected number of level events;
- no simulation source file contains `Math.random`.

## Benchmarks

Create a repeatable Node benchmark that runs without rendering:

- 10,000 simulated ticks;
- steady state of approximately 1,000 enemies;
- up to 500 projectiles;
- up to 200 pickups;
- player follows a deterministic movement pattern;
- prints mean, median, p95, and worst tick time;
- prints spawn/despawn totals, pool high-water marks, query counts, and final hash.

Do not fake a pass threshold across unknown hardware. Record the machine/runtime
details and measured values. Flag obvious allocation spikes or pathological
scaling. The later browser integration will set the real frame budget.

## Quality gates

The assignment is complete only when, from `packages/sim/`:

```text
npm test
npm run typecheck
npm run lint
npm run bench
```

all succeed.

Keep dependencies minimal and explain every runtime dependency. Prefer zero
runtime dependencies.

## Swarm decomposition

The lead should freeze interfaces first, then delegate non-overlapping modules:

- Agent A: RNG, clock, replay, and state hashing.
- Agent B: entity pools and spatial grid.
- Agent C: targeting, wave director, and combat integration.
- Agent D or lead: tests, benchmarks, integration, and final review.

Agents must not independently redefine shared entity layouts. The lead owns
`config.ts`, public interfaces, package configuration, and final integration.

## Required handoff

Return:

1. concise architecture summary;
2. exact commands run and results;
3. benchmark table and final deterministic hash;
4. known limitations and any behavior intentionally omitted;
5. dependency list and why each dependency exists;
6. commit hash or patch containing only `packages/sim/`.

Do not claim this validates rendering performance. It validates simulation
correctness, determinism, and approximate CPU scaling only.

