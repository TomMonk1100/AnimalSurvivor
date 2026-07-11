# Parallel Swarm Handoff: Trait and Mythic Evolution Runtime

## Copy-paste assignment

You are a coding-only AI swarm working in the AnimalSurvivor repository. Build a
self-contained deterministic trait/evolution package under this exclusive
ownership boundary:

```text
packages/trait-runtime/
```

Do not edit anything outside that directory. Other agents are actively editing
the simulation, browser renderer, Greg's model loader, and documentation. Return
a commit or patch containing only `packages/trait-runtime/`.

This is code work only. Do not create, download, generate, edit, or process
models, images, textures, animation, audio, HTML, CSS, shaders, canvas, WebGL, or
visual mockups. The package must run entirely in Node for tests.

## Why this package exists

AnimalSurvivor's differentiator is that every upgrade visibly attaches to the
hero and paired upgrades evolve into authored Mythic creatures. We need one
renderer-independent authority for:

- which trait occupies which body socket;
- Bud → Adapted → Mythic stage progression;
- deterministic upgrade offers and application;
- paired evolution recipe resolution;
- automatic behavior scheduling;
- combat commands the simulation can execute later;
- visual-state descriptions the renderer can consume later;
- save/replay serialization and canonical hashing.

Do not implement the simulation physics or renderer. Emit typed commands and
state changes behind small adapters.

## Required package shape

```text
packages/trait-runtime/
  src/
    index.ts
    ids.ts
    contracts.ts
    definitions.ts
    validation.ts
    build-state.ts
    offer-director.ts
    evolution-resolver.ts
    behavior-runtime.ts
    command-buffer.ts
    serialization.ts
    state-hash.ts
    content/greg-vertical-slice.ts
    content/catalog.ts
  test/
  bench/
  package.json
  package-lock.json
  tsconfig.json
  README.md
```

Exact file names may change, but contracts must remain small and documented.
Prefer strict TypeScript, typed arrays where useful, and zero runtime
dependencies.

## Frozen terminology

### Stages

- `locked`: not owned.
- `bud`: first useful visible/mechanical stage.
- `adapted`: upgraded visible/mechanical stage.
- `mythic`: paired recipe has replaced both independent behavior loops.

### Six stable socket families

```text
head
back
leftShoulder
rightShoulder
tail
bodyOrbit
```

Definitions may reserve multiple sockets. A Mythic keeps both recipe sockets
occupied; it does not free them or permit overlapping silhouette upgrades.

### First vertical slice

Implement these real definitions first:

- `porcupine-quills`
  - socket: `back`
  - Bud: periodic compact projectile burst.
  - Adapted: larger/faster burst with defensive close-range trigger.
- `puffer-pouch`
  - socket: `head`
  - Bud: periodic telegraphed inhale/exhale pulse.
  - Adapted: wider gather and knockback pulse.
- `thornstorm-mantle`
  - recipe: Adapted Quills + Adapted Pouch.
  - replaces both independent loops.
  - combined cycle: telegraph inhale → gather → radial quill exhale.
  - visual state identifies both `head` and `back` components as one Mythic.

Also encode and validate metadata for the remaining catalog traits and recipes
from `docs/gate0/attachment-catalog.md`, but generic placeholder behavior
schedules are acceptable outside the first vertical slice:

- Electric Eel Coil + Firefly Colony → Thunderbug Dynamo
- Mantis Scythes + Gecko Pads → Razorstep Chimera
- Owl Pinions + Bat Ears → Midnight Radar
- Crab Pincers + Armadillo Greaves → Meteor Mauler
- Skunk Brush + Monarch Brood → Royal Stinkcloud

Do not invent additional traits or recipes.

## Public contracts

Design and freeze equivalents of these concepts before parallel implementation:

```ts
type TraitId = string;
type EvolutionId = string;
type TraitStage = 'locked' | 'bud' | 'adapted' | 'mythic';
type SocketId =
  | 'head'
  | 'back'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'tail'
  | 'bodyOrbit';

interface TraitDefinition {
  id: TraitId;
  sockets: readonly SocketId[];
  tags: readonly string[];
  stages: Readonly<Record<'bud' | 'adapted', StageDefinition>>;
}

interface EvolutionDefinition {
  id: EvolutionId;
  ingredients: readonly [TraitId, TraitId];
  occupiedSockets: readonly SocketId[];
  behavior: BehaviorDefinition;
  visualKey: string;
}

interface RuntimeContext {
  tick: number;
  playerX: number;
  playerY: number;
  moveDirX: number;
  moveDirY: number;
  distanceMovedThisTick: number;
}
```

Names may improve, but preserve the separation between definitions, mutable
build state, runtime context, emitted commands, and renderer-facing visual state.

## Combat command vocabulary

The runtime emits commands; it does not directly mutate enemy/projectile pools.
Use a discriminated union supporting at least:

- `spawnProjectileBurst`
- `radialProjectileBurst`
- `areaGather`
- `areaKnockback`
- `applyAreaDamage`
- `spawnZone`
- `markTargets`
- `chainDamage`
- `meleeArc`
- `grantShield`
- `telegraph`
- `playTraitCue`

Every command must include its source trait/evolution ID, simulation tick, and
all numeric parameters needed for deterministic execution. Commands may request
targeting policies such as nearest, highest-health, densest-cluster, marked, or
rear-threat; they must never search renderer objects.

Use a reusable command buffer with a documented overflow policy. No allocation
per command in the steady-state update loop if reasonably achievable.

## Upgrade and socket rules

- Applying a locked trait creates its Bud stage if all required sockets are free.
- Applying the same Bud trait advances it to Adapted.
- A trait cannot advance beyond Adapted without a recipe.
- Conflicting socket acquisition must fail with a typed, deterministic result;
  never silently replace another trait.
- When both ingredients are Adapted, recipe resolution is deterministic and
  emits exactly one evolution event.
- Mythic resolution disables/replaces both ingredient behavior schedules.
- Recipe ingredient state remains inspectable for save/debug purposes.
- Applying duplicates after Mythic resolution must not retrigger the evolution.
- Upgrade offers must exclude impossible/full/maxed choices and use injected
  seeded RNG—not ambient randomness.
- Offer ordering and ties must be deterministic.

## Renderer-facing visual state

Expose a read-only, allocation-stable snapshot or event stream with enough data
for the browser renderer to attach visible parts later:

```ts
interface VisualAttachmentState {
  sourceId: TraitId | EvolutionId;
  stage: 'bud' | 'adapted' | 'mythic';
  sockets: readonly SocketId[];
  visualKey: string;
  enabled: boolean;
}
```

The runtime never creates an entity or knows a bone name. The renderer maps
stable sockets to Greg/Benny/Gracie-specific bones and transforms.

For the first slice, required visual keys are:

```text
porcupine-quills:bud
porcupine-quills:adapted
puffer-pouch:bud
puffer-pouch:adapted
thornstorm-mantle:mythic
```

## Determinism and serialization

- Fixed integer ticks only; no wall clock.
- No `Math.random`.
- All randomness is injected through a small seeded-RNG interface.
- Stable versioned JSON serialization for build state and behavior timers.
- Deserialize with strict validation and reject non-finite numbers.
- Canonical configuration/content fingerprint.
- Canonical state hash includes owned stages, socket occupancy, resolved
  recipes, behavior timers, charges, and pending deterministic state.
- Same definitions + seed + upgrades + runtime contexts must produce identical
  command streams and final hashes across independent runs in one JS runtime.

## Required tests

At minimum automate:

- every catalog trait/recipe validates;
- duplicate IDs, unknown ingredients, invalid sockets, non-finite parameters,
  and recipe/socket mismatches fail validation;
- locked → Bud → Adapted progression;
- conflicting socket rejection without state mutation;
- Thornstorm resolves exactly once when both ingredients become Adapted;
- Thornstorm replaces both independent timers/command loops;
- exact Thornstorm command order: telegraph, gather, radial exhale;
- large catch-up tick sequences do not double-fire or skip scheduled phases;
- visual state progresses through required keys and uses both Mythic sockets;
- deterministic offer filtering/order/selection with injected RNG;
- command-buffer full behavior is safe and counted;
- serialization round-trip preserves hash and future command stream;
- malformed/non-finite serialized data is rejected;
- identical runs produce byte-identical serialized state and command streams;
- source contains no `Math.random`, DOM, canvas, WebGL, PlayCanvas, or Node
  wall-clock/timer usage.

## Benchmark

Provide a repeatable Node benchmark with:

- six active Adapted traits or three resolved Mythics;
- 18,000 fixed ticks;
- command-buffer activity and visual-state reads;
- mean, median, p95, p99, worst tick time;
- command totals by kind;
- allocation/heap signal;
- final hash repeated in two independent processes.

Do not claim a hardware-independent pass threshold.

## Required commands

From `packages/trait-runtime/`:

```text
npm ci
npm run typecheck
npm run lint
npm test
npm run bench
```

Use zero runtime dependencies unless the lead documents an unavoidable reason.
Development dependencies should be minimal and locked.

## Swarm decomposition

The lead freezes IDs/contracts/definition schemas first, then delegates without
overlapping file ownership:

- Agent A: definition validation, catalog encoding, content fingerprint.
- Agent B: build state, socket occupancy, upgrades, recipe resolution, visual
  state.
- Agent C: command buffer, behavior scheduler, Thornstorm phases and generic
  behavior hooks.
- Agent D/lead: offer director, serialization/hash, integration tests, benchmark,
  dependency/security review, final documentation.

Agents must not independently redefine shared IDs, stage semantics, socket
rules, or command shapes.

## Required handoff

Return:

1. architecture and frozen public-contract summary;
2. exact commands and pass/fail results;
3. dependency/license list;
4. test count and benchmark table;
5. two-process final hash evidence;
6. exact Thornstorm command trace for one full cycle;
7. known limitations and deliberately omitted simulation integrations;
8. commit hash or patch containing only `packages/trait-runtime/`.

Do not edit or merge the main simulation or renderer. The integration agent will
adapt accepted commands and visual states later.
