# @animalsurvivor/trait-runtime

Renderer-independent, deterministic authority for AnimalSurvivor's trait /
evolution / Mythic system. Runs entirely in Node with **zero runtime
dependencies**. It owns *which trait sits in which body socket*, stage
progression (`locked → bud → adapted → mythic`), deterministic upgrade offers,
paired evolution recipes, automatic behavior scheduling, an emitted combat
command stream, a renderer-facing visual-attachment snapshot, and versioned
save / replay with canonical hashing.

It contains **no** simulation physics and **no** renderer. It emits typed
commands and read-only visual state behind small adapters the simulation and
browser renderer consume later.

## Architecture & frozen public contracts

Data flows one direction: immutable **definitions** → mutable **RuntimeState** →
per-tick **RuntimeContext** in → **Command** stream + **VisualAttachmentState**
out. Nothing downstream mutates definitions; nothing in the runtime touches a
renderer object or a bone name.

| Module | Owner | Responsibility |
| --- | --- | --- |
| `ids.ts` | lead | Frozen id vocabulary: traits, evolutions, 6 socket families, stages. |
| `contracts.ts` | lead | All shared types: `Command` (wide flat struct), `CommandBuffer`, `BehaviorDefinition`, `RuntimeState`, `RuntimeContext`, `SeededRng`, `VisualAttachmentState`, `ApplyResult`. |
| `rng.ts` | lead | Serializable mulberry32 seeded RNG. |
| `content/greg-vertical-slice.ts` | A | Real slice defs: porcupine-quills, puffer-pouch, thornstorm-mantle. |
| `content/catalog.ts` | A | Full catalog: 12 traits + 6 evolutions. |
| `definitions.ts` | A | Read-only catalog lookups / indices. |
| `validation.ts` | A | Pure catalog validation with stable issue codes. |
| `build-state.ts` | B | Socket occupancy, upgrade progression, visual snapshot. |
| `evolution-resolver.ts` | B | Deterministic Mythic resolution (exactly one event). |
| `command-buffer.ts` | C | Reusable zero-alloc buffer, drop-newest overflow policy. |
| `behavior-runtime.ts` | C | Timer reconciliation + one-tick behavior scheduler. |
| `offer-director.ts` | lead | Seeded, deterministic upgrade offers. |
| `serialization.ts` | lead | Versioned JSON, strict validation, rejects non-finite. |
| `state-hash.ts` | lead | Canonical state hash + content fingerprint. |
| `index.ts` | lead | `TraitRuntime` orchestrator + public re-exports. |

### Public surface (frozen)

```ts
const rt = new TraitRuntime({ seed, catalog?, commandCapacity? });
rt.applyUpgrade(traitId): ApplyResult;      // create Bud / advance / resolve Mythic / typed failure
rt.offers(count): UpgradeOffer[];            // deterministic, seeded, excludes maxed/full
rt.update(ctx): CommandBuffer;               // advance exactly the next fixed tick
rt.visualState(): VisualAttachmentState[];   // renderer-facing snapshot
rt.stageOf(id); rt.socketOwner(socket);
rt.serialize(); TraitRuntime.deserialize(json); // catalog-bound semantic validation
rt.hash(); rt.fingerprint();
```

The six socket families are `head, back, leftShoulder, rightShoulder, tail,
bodyOrbit`. A Mythic keeps both recipe sockets occupied under the evolution id;
it never frees them or permits an overlapping silhouette upgrade.

## Commands

```
cd packages/trait-runtime
npm ci
npm run typecheck
npm run lint
npm test
npm run bench
```

### Results (this build)

| Command | Result |
| --- | --- |
| `npm ci` | ✅ clean install from lockfile |
| `npm run typecheck` | ✅ 0 errors (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| `npm run lint` | ✅ `lint ok (15 src files, 10 test files)` |
| `npm test` | ✅ **58 passed / 0 failed** |
| `npm run bench` | ✅ ran 18,000 ticks, 3 Mythics active |

## Dependencies & licenses

Zero runtime dependencies. Dev-only, locked in `package-lock.json`:

| Package | Version | License |
| --- | --- | --- |
| `typescript` | ^5.6 | Apache-2.0 |
| `@types/node` | ^22.10 | MIT |

Tests use only the Node built-in `node:test` runner; lint is a dependency-free
`scripts/lint.mjs`.

## Tests

58 automated tests across validation, build-state/sockets, evolution, behavior
scheduling, visual state, offers, command buffer, serialization, cross-run
determinism, and source hygiene. Highlights mapped to the spec:

- every catalog trait/recipe validates; duplicate ids, unknown ingredients,
  invalid sockets, non-finite params, self-pairing, socket/occupancy mismatch,
  and empty phases each fail validation;
- `locked → bud → adapted` progression; advancing past Adapted without a recipe
  is `maxed`;
- conflicting socket acquisition returns a typed `socketConflict` **without
  mutating state** (verified by hash equality) and never silently replaces;
- Thornstorm resolves **exactly once** when both ingredients reach Adapted;
  replaces both independent loops (only the Mythic emits thereafter);
- exact Thornstorm command order over a cycle: **telegraph → areaGather →
  radialProjectileBurst**;
- 9,000 sequential fixed ticks fire every phase on schedule with no double-fire
  or skip; repeated and skipped tick inputs are rejected without mutation;
- visual state reaches every required slice key and the Mythic uses both sockets;
- deterministic offer filtering / order / selection with injected RNG;
- command-buffer overflow is safe and counted;
- serialization round-trip preserves hash **and** future command stream;
  catalog mismatches, forged Mythics, duplicated timers, malformed/non-finite
  values, wrong versions, and unknown sockets are rejected;
- two independent scripted runs produce byte-identical command streams + state;
- `src/` contains no `Math.random`, DOM, canvas, WebGL, PlayCanvas, or wall-clock
  usage.

## Benchmark

Scenario: three resolved Mythics (Thornstorm + Thunderbug + Razorstep), 18,000
fixed ticks, a `visualState()` read each tick, seed `0xc0ffee`.

| Metric | Value |
| --- | --- |
| ticks | 18,000 |
| active Mythics | 3 |
| commands emitted | 1,308 |
| command-buffer overflow | 0 |
| mean tick | ~0.0006 ms |
| median tick | ~0.0003 ms |
| p95 tick | ~0.0021 ms |
| p99 tick | ~0.0045 ms |
| worst tick | ~0.33 ms (one-off) |

Commands by kind (this run): `radialProjectileBurst` 200, `areaGather` 200,
`telegraph` 200, `chainDamage` 258, `meleeArc` 450.

**Timings are hardware-dependent and are NOT a pass/fail threshold.** The only
asserted invariant is reproducibility: the final canonical hash is identical
across two independent processes.

### Two-process final-hash evidence

```
$ node --expose-gc dist/bench/bench.js --hash-only   ->  02cd9d40ff35422c
$ node            dist/bench/bench.js --hash-only     ->  02cd9d40ff35422c
MATCH ✓
```

## Exact Thornstorm command trace (one full cycle)

Player at (10, 20); origins default to player position. Cycle length 90 ticks
(20 + 15 + 55):

| tick | kind | key params | tag |
| --- | --- | --- | --- |
| 0 | `telegraph` | radius 140 | `thornstorm-inhale` |
| 20 | `areaGather` | strength 9, radius 140 | — |
| 35 | `radialProjectileBurst` | count 16, damage 8, speed 8 | — |
| 90 | `telegraph` | radius 140 (next cycle) | `thornstorm-inhale` |

Every command carries `sourceId: "thornstorm-mantle"` and the emitting `tick`.

## Known limitations & deliberately omitted integrations

- **No simulation or renderer.** The runtime emits typed `Command`s and requests
  targeting *policies* (`nearest`, `highestHealth`, `densestCluster`, `marked`,
  `rearThreat`); it never resolves targets, spawns entities, applies damage, or
  knows a bone name. The integration agent adapts commands + visual states later.
- **Six-socket exclusivity caps a single hero.** With head/back taken by
  Thornstorm and tail/bodyOrbit by Thunderbug, only the two shoulders remain, so
  the third Mythic must be shoulder-only. To make the spec's "three resolved
  Mythics" benchmark reachable on one hero, `mantis-scythes` and `gecko-pads`
  each occupy a single shoulder (`leftShoulder` / `rightShoulder`) so Razorstep
  fills exactly both shoulders. The remaining recipes (Midnight Radar, Meteor
  Mauler, Royal Stinkcloud) are validated metadata with generic placeholder
  behavior and are not part of the vertical slice.
- **Non-slice behaviors are placeholders.** Only porcupine-quills, puffer-pouch,
  and thornstorm-mantle have authored, spec-exact behavior. Other traits use
  generic periodic schedules chosen to exercise the full command vocabulary.
- **`visualState()` allocates** a fresh array per call (it is a renderer read,
  not part of the steady-state command loop). The command emission path itself
  is allocation-free (pre-allocated, reused `Command` structs).
- **Offer RNG** is a single uint32 mulberry32 stream persisted in `RuntimeState`;
  adequate for upgrade selection, not cryptographic.
