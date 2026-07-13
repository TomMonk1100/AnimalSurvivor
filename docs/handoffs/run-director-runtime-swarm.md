# Parallel Swarm Handoff: Deterministic Run and Encounter Director

## Copy-paste assignment

You are a coding-only AI swarm working in the AnimalSurvivor repository. Build a
self-contained deterministic run/encounter package under this exclusive
ownership boundary:

```text
packages/run-director/
```

Do not edit anything outside that directory. Other agents are actively reviewing
the trait runtime and modifying the deterministic simulation, browser game, renderer,
Greg's hero presentation, and documentation. Return a commit or patch containing
only `packages/run-director/`.

This is code work only. Do not create, download, generate, edit, or process
models, images, textures, animation, audio, HTML, CSS, shaders, canvas, WebGL, or
visual mockups. The package must run entirely in Node for tests and benchmarks.

## Why this package exists

The accepted simulation currently proves deterministic endless spawning, but a
real first vertical slice needs a complete authored run. This package must turn
fixed simulation ticks and explicit gameplay metrics into deterministic encounter
commands without owning pools, combat, traits, rendering, or wall-clock time.

It will eventually drive a 12-minute Greg run with:

- a readable opening;
- escalating pressure in authored phases;
- deterministic elite beats;
- a final boss entrance;
- victory after the boss is defeated;
- defeat when the player dies;
- replay/save-safe state and canonical hashes;
- stable pacing regardless of renderer FPS or device speed.

## Required package shape

```text
packages/run-director/
  src/
    index.ts
    ids.ts
    contracts.ts
    definitions.ts
    validation.ts
    director-state.ts
    threat-budget.ts
    spawn-scheduler.ts
    objective-runtime.ts
    event-buffer.ts
    serialization.ts
    state-hash.ts
    content/greg-first-run.ts
  test/
  bench/
  package.json
  package-lock.json
  tsconfig.json
  README.md
```

Exact internal file names may improve, but keep public contracts small, strict,
documented, and renderer-independent. Prefer strict TypeScript and zero runtime
dependencies.

## Frozen run target

- Simulation frequency: 60 fixed ticks/second.
- Authored run duration: 43,200 ticks (12 minutes).
- Boss entrance: tick 39,600 (11 minutes).
- Boss defeat after entrance causes victory.
- Reaching tick 43,200 while the boss remains alive does **not** silently award
  victory; enter deterministic overtime with a capped threat schedule.
- Player death causes defeat immediately and permanently.
- The director may be paused by its caller. A paused call must not advance state,
  timers, budgets, RNG, or event sequence numbers.
- The package must not know Greg's model, animation, body sockets, or traits.

## Authored phases for the first run

Encode these IDs and boundaries exactly. Numeric tuning may be data-defined in
the content file, but tests must lock the boundaries.

| Phase ID | Tick range | Purpose |
| --- | ---: | --- |
| `opening` | 0–7,199 | Teach movement and auto-attacks with low pressure. |
| `pressure` | 7,200–17,999 | Mix basic and fast enemies; introduce first elite. |
| `adaptation` | 18,000–28,799 | Higher density; introduce durable enemies and second elite. |
| `mutation` | 28,800–39,599 | Sustained mixed pressure and final pre-boss elite beat. |
| `boss` | 39,600–43,199 | Spawn the boss exactly once and cap supporting enemies. |
| `overtime` | 43,200 onward | Boss remains; bounded deterministic support waves continue. |

Use generic gameplay IDs only so final visual content can change later:

```text
enemy:fodder
enemy:runner
enemy:brute
enemy:elite
enemy:boss
```

Do not invent additional heroes, traits, recipes, biomes, story, dialogue, art,
or monetization.

## Public contracts

Design and freeze equivalents of these concepts before parallel implementation:

```ts
type RunPhaseId =
  | 'opening'
  | 'pressure'
  | 'adaptation'
  | 'mutation'
  | 'boss'
  | 'overtime';

type RunOutcome = 'running' | 'victory' | 'defeat';

interface RunMetrics {
  tick: number;
  paused: boolean;
  playerAlive: boolean;
  playerHp: number;
  playerMaxHp: number;
  playerLevel: number;
  liveEnemies: number;
  killsTotal: number;
  bossAlive: boolean;
  bossDefeatedThisTick: boolean;
}

interface SpawnIntent {
  archetypeId: string;
  count: number;
  formation: 'ring' | 'arc' | 'lane' | 'cluster';
  minDistance: number;
  maxDistance: number;
  elite: boolean;
  boss: boolean;
}
```

Names may improve, but preserve the separation between immutable definitions,
mutable director state, explicit per-tick metrics, emitted events/intents, and
integration-owned world mutation.

## Event vocabulary

The director emits events/intents; it never spawns or mutates an entity itself.
Use a discriminated union supporting at least:

- `phaseStarted`
- `spawnRequested`
- `eliteWarning`
- `eliteRequested`
- `bossWarning`
- `bossRequested`
- `overtimeStarted`
- `victory`
- `defeat`

Every emitted item must include:

- absolute fixed tick;
- monotonic sequence number;
- source phase ID;
- every numeric parameter the simulation needs;
- no renderer object, callback, promise, or wall-clock timestamp.

Use a reusable fixed-capacity event buffer with a documented deterministic
overflow policy and a diagnostic overflow counter. Critical terminal events
(`victory`, `defeat`) must never be silently lost.

## Threat-budget and spawn rules

- All pacing is tick-based and data-defined.
- Threat budget accrues in deterministic integer units; avoid accumulating
  floating-point drift over 43,200+ ticks.
- Spawn costs and weights are validated positive integers.
- The caller reports `liveEnemies`; the director respects phase-specific soft and
  hard caps and safely delays unaffordable/full-cap waves.
- Delayed waves must remain deterministic and bounded. Do not release an
  unbounded burst after congestion clears.
- Use injected seeded RNG only for choices that genuinely need variation.
- No `Math.random` and no hidden RNG construction.
- Stable ordering and ties must not depend on object property order.
- Elite schedule for the first run must include exactly three authored beats
  before the boss. Pick clear fixed ticks inside `pressure`, `adaptation`, and
  `mutation`, expose them in content data, and lock them in tests.
- Boss warning and request ticks must be explicit content values. The boss request
  occurs exactly once even across serialization, repeated metrics, congestion,
  or overtime.
- Overtime support pressure is capped and periodic; it must never grow without
  bound as tick increases.

## Objective and outcome rules

- Initial outcome is `running`.
- `playerAlive === false` transitions to `defeat` once.
- A boss-defeat signal before the boss was requested is invalid and must not
  produce victory.
- After the boss is requested, `bossDefeatedThisTick === true` transitions to
  `victory` once.
- Victory and defeat are terminal; later inputs emit no further encounter events
  and cannot change the outcome.
- If death and valid boss defeat occur on the same tick, define and document one
  deterministic precedence rule. Recommended: defeat wins.
- Repeated calls with the same tick must either be rejected or be provably
  idempotent; choose one policy and test it.
- Tick skips/catch-up must be handled explicitly. The caller should be able to
  advance from tick N to tick N+k without losing phase, elite, warning, boss, or
  terminal events. Do not loop once per skipped tick if a bounded arithmetic
  catch-up implementation is possible.

## Validation

Reject malformed definitions before creating state. At minimum validate:

- phase ranges are contiguous, ordered, and non-overlapping;
- required first-run phase IDs occur exactly once;
- boss and elite beats lie inside their required phases;
- boss warning precedes boss request;
- interval, cost, count, range, cap, and weight fields are finite valid integers;
- `minDistance <= maxDistance`;
- referenced archetype IDs exist;
- duplicate IDs and duplicate one-shot beats fail;
- event-buffer capacity is sufficient for critical-event guarantees;
- 43,200-tick duration and 39,600 boss entrance remain exact.

## Determinism, serialization, and hashing

- Fixed integer ticks only; no wall clock, timers, promises, or frame delta.
- No ambient randomness.
- Stable versioned JSON serialization for all gameplay-affecting state.
- Deserialize with strict shape checking; reject unknown versions, non-finite
  values, impossible phase/tick combinations, invalid sequence numbers, and
  forged terminal/boss state.
- Canonical content fingerprint covering every gameplay-affecting definition.
- Canonical state hash must include phase, outcome, threat budget, RNG state,
  sequence number, fired one-shot beats, delayed spawn state, boss state, and
  overtime schedule state.
- Equivalent independent runs must produce byte-identical serialized state,
  event streams, and final hashes.
- Serialization round-trip must preserve the future event stream, not only the
  current hash.

## Required tests

At minimum automate:

- first-run content validates;
- every required phase starts at the exact boundary;
- all phase boundaries are contiguous and exact;
- invalid phase gaps/overlaps/order fail validation;
- three pre-boss elite beats fire exactly once at authored ticks;
- elite/boss warnings precede their requests in stable order;
- boss request fires exactly once at tick 39,600;
- reaching tick 43,200 with a live boss enters overtime, not victory;
- valid boss defeat after request produces exactly one victory event;
- premature boss-defeat signal cannot win;
- player death produces exactly one defeat event;
- same-tick death/boss-defeat precedence is deterministic;
- terminal state suppresses later spawns and phase events;
- pause causes byte-identical state/hash and emits nothing;
- congestion respects caps and delayed waves never create an unbounded burst;
- event-buffer overflow is deterministic and terminal events remain guaranteed;
- repeated tick policy is enforced;
- tick-skip catch-up preserves authored one-shot events and ordering;
- identical seeds/metrics yield byte-identical streams and hashes;
- different seeds only change explicitly randomized choices, never phase timing;
- serialization round-trip preserves hash and future stream;
- malformed/non-finite/forged serialized state is rejected;
- an independent 43,200-tick run ends at the expected phase/outcome/hash;
- source contains no `Math.random`, DOM, canvas, WebGL, PlayCanvas, network,
  Node wall-clock, or timer usage.

## Benchmark

Provide a repeatable Node benchmark that executes:

- one complete 43,200-tick run;
- a congested/high-live-enemy scenario;
- an overtime scenario extending to at least tick 54,000;
- periodic serialization/hash reads;
- mean, median, p95, p99, and worst update time;
- total events by kind, requested enemies by archetype, delayed/dropped wave
  counts, and event-buffer high water;
- final hash printed twice from independent identical runs and asserted equal.

This is a diagnostic benchmark, not a hardware-universal performance gate.

## Engineering constraints

- Strict TypeScript ESM.
- Zero runtime dependencies preferred.
- No renderer, browser, filesystem, network, telemetry, or paid API dependency in
  runtime source.
- No `any` in public contracts.
- No gameplay dependency on locale, platform time, object iteration order, or
  JavaScript engine scheduling.
- No mutation of caller-provided definitions or metrics.
- Document allocation behavior and overflow policy.
- Include `typecheck`, `lint`, `test`, `build`, and `bench` scripts.
- Lint must explicitly prevent `Math.random`, wall-clock/time APIs, timers, DOM,
  canvas, WebGL, and PlayCanvas in runtime source.

## Swarm sequencing

1. Lead agent freezes contracts, content schema, phase boundaries, event types,
   serialization version, and hash order.
2. Agent A implements validation, content definitions, and fingerprints.
3. Agent B implements threat budget, spawn scheduling, congestion, and elites.
4. Agent C implements objective/outcome state, serialization, and hashing.
5. Integrator wires the package, adds adversarial/catch-up tests, benchmarks,
   README, and runs all gates twice for determinism.

Agents B and C may work in parallel only after contracts are frozen. No agent may
silently revise a frozen contract; proposed changes return to the lead first.

## Return format

Return:

1. architecture and public API summary;
2. exact commands and results for typecheck, lint, tests, build, and benchmark;
3. test count and benchmark numbers;
4. two independent final hashes;
5. dependency/license list;
6. known limitations;
7. commit hash or patch containing only `packages/run-director/`.

Do not integrate the package into `packages/sim` or `apps/web-toy`. The
lead agent will review it and perform that integration after the trait runtime
review.
