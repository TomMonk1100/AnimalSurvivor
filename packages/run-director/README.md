# @animalsurvivor/run-director

Renderer-independent, fully deterministic **run and encounter director** for
AnimalSurvivor. It turns fixed simulation ticks and explicit gameplay metrics
into deterministic encounter commands. It owns **no** pools, combat, traits,
rendering, or wall-clock time — it only reads per-tick `RunMetrics` and emits
typed `DirectorEvent`s (spawn intents, warnings, phase transitions, terminal
outcomes).

Zero runtime dependencies. Strict TypeScript ESM. Node-only for tests and
benchmarks.

## What it does

Drives a 6-minute (21,600-tick @ 60 Hz) authored Greg run:

- readable opening, then escalating pressure across authored phases;
- six deterministic pre-boss elite beats that become more frequent late-run;
- a single boss entrance at tick 17,100 (4:45), following a 20-second warning;
- **victory** when the boss is defeated after its entrance;
- **defeat** the instant the player dies (permanent);
- **defeat** at tick 21,600 if the boss still lives — normal mode has no hidden
  overtime;
- replay/save-safe state with canonical content and state hashes;
- stable pacing regardless of renderer FPS or device speed.

## Public API

```ts
import { RunDirector } from '@animalsurvivor/run-director';

const director = new RunDirector({ seed: 1234 }); // uses the Greg first run by default

const events = director.step({
  tick: 0,
  paused: false,
  playerAlive: true,
  playerHp: 100,
  playerMaxHp: 100,
  playerLevel: 1,
  liveEnemies: 0,
  killsTotal: 0,
  bossAlive: false,
  bossDefeatedThisTick: false,
});
// -> readonly DirectorEvent[]  (phaseStarted, spawnRequested, eliteWarning, ...)

director.outcome;             // 'running' | 'victory' | 'defeat'
director.tick;                // last processed tick
director.phase;               // current RunPhaseId

const snapshot = director.serialize();               // versioned JSON
const restored = RunDirector.deserialize(snapshot);  // continues identically
director.stateHash();          // canonical state hash (hex)
director.contentFingerprint(); // canonical content fingerprint (hex)
```

`RunDirector` saves include the content fingerprint and reject restoration
against any different authored definition. The lower-level `serializeState`
helper remains available for package-internal diagnostics, but is not a
definition-bound run save.

The director **emits intents; it never spawns or mutates an entity itself.** The
integration layer consumes `spawnRequested` / `eliteRequested` / `bossRequested`
intents and owns all world mutation.

### Event vocabulary

`phaseStarted`, `spawnRequested`, `eliteWarning`, `eliteRequested`,
`bossWarning`, `bossRequested`, `overtimeStarted`, `victory`, `defeat`.

`overtimeStarted` is part of the generic director vocabulary for an explicitly
authored endless definition. The default Greg normal definition never emits it:
it ends in victory or defeat at the 6:00 boundary.

Every event carries an absolute fixed `tick`, a monotonic `seq`, its source
`phase`, and all numeric parameters the simulation needs — no renderer object,
callback, promise, or wall-clock timestamp.

## Determinism contract

- Fixed integer ticks only. No wall clock, timers, promises, or frame delta.
- No ambient randomness; a single injected seeded RNG (xorshift128) drives the
  only discretionary choices (which archetype a discretionary wave picks).
- Threat budget accrues in integer units — no floating-point drift over
  21,600+ ticks.
- Stable ordering never depends on object property iteration order.
- Equivalent independent runs produce **byte-identical** serialized state, event
  streams, and final hashes. Serialization round-trip preserves the *future*
  event stream, not just the current hash.

### Policies

- **Pause:** a paused call advances no state, budget, RNG, or sequence and emits
  nothing.
- **Repeated tick:** calling `step` with the current tick is an idempotent no-op
  (`[]`); a backward tick throws.
- **Catch-up:** advancing from tick N to N+k processes all authored phase, elite,
  warning, boss, and terminal events in `(N, N+k]` via bounded
  arithmetic — no per-tick loop over skipped ticks.
- **Precedence:** if death and a valid boss defeat land on the same tick,
  **defeat wins**.
- **Congestion:** the director respects per-phase soft/hard live-enemy caps.
  While at/over the hard cap it releases nothing. Deferred waves drain at most
  one per tick — congestion never produces an unbounded burst.
- **Optional endless support:** an explicit endless definition may author
  bounded periodic overtime support; the default normal definition does not.
- **Event buffer:** fixed-capacity with a deterministic overflow policy
  (drop-oldest non-critical, with an overflow counter). Critical events
  (`victory`, `defeat`, `bossRequested`, `eliteRequested`) are never silently
  lost.

## Authored first-run phases

| Phase ID     | Tick range       | Cadence | Soft/hard cap | Purpose |
| ------------ | ---------------: | ------: | ------------: | ------- |
| `opening`    | 0 – 2,699        | 60 ticks | 12 / 20 | Faster close-in fodder creates the first movement decision. |
| `pressure`   | 2,700 – 8,099    | 42 ticks | 22 / 36 | Runners and Spitters establish sustained pressure. |
| `adaptation` | 8,100 – 13,499   | 32 ticks | 32 / 50 | Dense mixed threats and two elite beats test a growing build. |
| `mutation`   | 13,500 – 17,099  | 24 ticks | 44 / 66 | Short, high-pressure mixed escalation before the apex. |
| `boss`       | 17,100 – 21,599  | 28 ticks | 34 / 54 | Boss spawned once with support pressure; normal mode ends at 6:00. |

At player levels **4, 6, and 8**, bounded level pressure adds +1 soft / +2 hard
capacity and subtracts four ticks from the active phase cadence per earned step.
Elite beats occur at 4,200; 8,700; 11,700; 14,100; 15,300; and 16,500 (each
warned 300 ticks earlier). Boss request is 17,100 (warn 15,900, a 20-second
warning). Fodder now authors 20–24 distance units; runners and ranged threats
enter from 32–40; elites use 30–36; and the boss deliberately authors 16–20 so
the 4:45 encounter starts inside the weapon band. The simulation adapter applies
its documented distance scale and keeps a formation at that authored radius or
rejects it at a world edge rather than clamping it nearby. The boss's HP,
movement, charge, and radial-volley values are an authored `BossCombatProfile`
inside the fingerprinted run definition; the adapter has no hidden boss default.
Generic archetype ids: `enemy:fodder`, `enemy:runner`, `enemy:brute`,
`enemy:spitter`, `enemy:elite`, `enemy:boss`.

## Package layout

```
src/
  ids.ts              frozen identifiers, unions, run constants
  contracts.ts        frozen public + shared-internal types (single source of truth)
  rng.ts              deterministic xorshift128 RNG (pure, seeded)
  definitions.ts      default definition + lookup helpers
  validation.ts       strict definition validation
  content/greg-first-run.ts   authored first-run data
  threat-budget.ts    integer threat accrual / spend
  spawn-scheduler.ts  discretionary waves, caps, delayed queue
  event-buffer.ts     fixed-capacity buffer, deterministic overflow
  director-state.ts   initial state, phase lookup, deep clone
  objective-runtime.ts outcome transitions (defeat/victory precedence)
  serialization.ts    versioned serialize / strict deserialize
  state-hash.ts       canonical state hash + content fingerprint
  index.ts            RunDirector orchestrator + public re-exports
test/                 node:test suites (unit + integration + determinism + hygiene)
bench/bench.ts        diagnostic Node benchmark
```

## Scripts

```
npm run typecheck   # tsc --noEmit
npm run lint        # bans Math.random, wall-clock/time, timers, DOM, canvas, WebGL, PlayCanvas, network, fs in src/
npm test            # tsc + node --test over dist/test/*.test.js
npm run build       # tsc -> dist/
npm run bench       # tsc + node dist/bench/bench.js (diagnostic)
```

## Allocation & overflow behaviour

Per-tick allocation is bounded: a small `pending` array for interval events
(bounded by phase count + authored beats crossed), the drained event array, and
at most one delayed-wave object per discretionary deferral. The delayed queue is
capped (`spawn.maxDelayed`, default 64); excess deferrals increment
`droppedWaves` rather than growing unbounded. The event buffer is fixed capacity
(256 by default); overflow drops oldest non-critical events and increments
`overflowDropped`, while guaranteeing room for critical/terminal events.

## Dependencies & license

No runtime dependencies. Dev-only: `typescript`, `@types/node` (and its
transitive `undici-types`) — all MIT/Apache-2.0. This package is `private`.

## Known limitations

- The default content tunes threat accrual so discretionary waves are usually
  affordable; the delayed-queue path is exercised primarily under fabricated
  unaffordable scenarios in tests, not the default run.
- The benchmark reports wall-clock timing and is explicitly a diagnostic, not a
  hardware-universal performance gate.
- The director trusts the caller's `RunMetrics` (e.g. `liveEnemies`) as truth; it
  validates its own definitions and serialized state but not the live world.
