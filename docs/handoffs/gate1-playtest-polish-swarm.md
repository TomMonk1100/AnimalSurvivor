# Parallel Swarm Handoff: Gate 1 Playtest Polish

## Integration-lead preflight

The repository is currently largely untracked. Before distributing work, the
integration lead must create a baseline commit or otherwise preserve an exact
snapshot. Do not begin a parallel merge against an unversioned moving target.

Authoritative workspace:

```text
/Users/adammuncie/GameDev/AnimalSurvivor
```

Do not recreate the former Documents workspace. Read `PROJECT-HANDOFF.md` and
`docs/status/current.md` before editing.

## Copy-paste swarm assignment

You are a coding-only swarm improving AnimalSurvivor's first human-playable Greg
vertical slice. The deterministic 12-minute run, real Greg trait catalog, run
director, visible Quills/Pouch/Thornstorm attachments, director notices, and
exact replay parity already pass. Preserve them.

The first owner playtest found the vision exciting but requested clearer upgrade
communication and smoother presentation. The vertical control inversion and the
first plain-language upgrade descriptions are already fixed. This swarm should
make combat, movement, elites, the boss, and the end of a run easier to read and
feel, without redesigning gameplay balance.

### Non-negotiable rules

1. Simulation remains authoritative. Presentation may read snapshots and events
   but never mutate or step gameplay state.
2. No wall-clock time, DOM, renderer objects, network, or ambient randomness in
   deterministic packages. No `Math.random` in gameplay source.
3. Preserve replay schema version 3 and exact hash parity. Any proposed schema
   change must be returned for lead review rather than silently implemented.
4. Do not add dependencies, assets, audio files, generated art, package-lock
   changes, or runtime services.
5. Do not edit another agent's files. Shared integration files are lead-owned
   unless explicitly assigned below.
6. Prefer pure data projectors with focused tests. Rendering effects must degrade
   safely when pools are full or the renderer is disabled.
7. Run the assigned gates and report exact results. Never claim a browser or
   performance pass that was not executed.

## Frozen presentation contracts

Agents A and B must build pure modules that accept app-owned `RenderSnapshot`
values and return immutable presentation data. They must not change
`src/contracts.ts`. Agent C alone may extend the enemy snapshot contract, and
must preserve every existing field and default behavior. Agent D owns DOM copy
and layout but no simulation or renderer code.

All transient presentation durations are measured in simulation ticks, not
milliseconds. Renderer interpolation remains visual-only and must never enter a
canonical hash.

## Agent A — Greg locomotion and animation feel

### Exclusive ownership

```text
apps/web-toy/src/hero/greg-animation-state.ts
apps/web-toy/src/hero/greg-locomotion-presentation.ts       (new)
apps/web-toy/test/greg-animation-state.test.ts
apps/web-toy/test/greg-locomotion-presentation.test.ts      (new)
```

Do not edit `greg-presentation.ts`, `playcanvas-scene.ts`, contracts, input, or
simulation files. Return a short integration recipe for the lead.

### Deliverable

- Audit why Greg reads as visually jerky despite fixed-tick interpolation.
- Add a pure locomotion projector with stable heading retention, bounded turn
  interpolation, movement-start/stop hysteresis, and explicit animation blend
  recommendations.
- Ensure idle/walk/attack/hit transitions do not restart every render frame.
- Preserve instant gameplay response: this work may smooth only presentation,
  never delay or alter canonical movement.
- Cover zero movement, rapid reversal, diagonal movement, attack while moving,
  hit interruption, death, and identical-input determinism.

### Acceptance

```text
npm test -- --run test/greg-animation-state.test.ts test/greg-locomotion-presentation.test.ts
npm run typecheck
npm run lint
```

## Agent B — Combat readability cues

### Exclusive ownership

```text
apps/web-toy/src/presentation/combat-feedback.ts             (new)
apps/web-toy/src/presentation/combat-feedback-pool.ts        (new, if needed)
apps/web-toy/test/combat-feedback.test.ts                    (new)
apps/web-toy/test/combat-feedback-pool.test.ts               (new, if needed)
```

Do not edit `app.ts`, HTML/CSS, PlayCanvas scene code, shared contracts, or the
simulation. Return integration hooks for the lead.

### Deliverable

- Derive renderer-only cues from adjacent `RenderSnapshot` values: player hit,
  fresh projectile/attack pulse, pickup disappearance near Greg, and death.
- Define compact immutable cue records with tick, kind, position, intensity,
  and deterministic lifetime ticks.
- Provide a fixed-capacity reusable cue pool with documented overflow behavior.
- Coalesce same-tick spam so feedback remains readable under projectile stress.
- No particles or DOM implementation is required; the lead will map cues to
  PlayCanvas primitives and HUD flashes.

### Acceptance

```text
npm test -- --run test/combat-feedback.test.ts
npm run typecheck
npm run lint
```

## Agent C — Elite and boss identity pipeline

### Exclusive ownership

```text
spikes/headless-sim/src/simulation.ts
spikes/headless-sim/src/run-spawn-adapter.ts
spikes/headless-sim/test/run-simulation.test.ts
apps/web-toy/src/contracts.ts
apps/web-toy/src/sim/snapshot-producer.ts
apps/web-toy/src/render/instanced-transform-store.ts
apps/web-toy/src/render/playcanvas-scene.ts
apps/web-toy/test/instanced-transform-store.test.ts
apps/web-toy/test/snapshot-producer.test.ts                 (new if useful)
```

Do not edit trait code, Greg hero code, `app.ts`, HTML/CSS, or package files.

### Deliverable

- Expose the already-authoritative regular/elite/boss role as a read-only enemy
  presentation field without changing gameplay behavior or canonical hashing.
- Copy it into app-owned snapshots and the instanced transform store with the
  same generation safety as archetype data.
- Render elites and bosses with distinct scale/color/silhouette treatments using
  existing primitives and shared materials. Target: regular, elite, and boss are
  distinguishable in one glance.
- Keep repeated enemies instanced and draw-call growth bounded. Do not create an
  entity or unique material per enemy.
- Prove renderer-off replay/hash parity remains unchanged.

### Acceptance

```text
cd spikes/headless-sim
npm test && npm run typecheck && npm run lint

cd ../../apps/web-toy
npm test && npm run typecheck && npm run lint && npm run build
```

## Agent D — Upgrade and run-result clarity

### Exclusive ownership

```text
apps/web-toy/src/presentation/upgrade-copy.ts                (new)
apps/web-toy/src/presentation/run-summary.ts                 (new)
apps/web-toy/test/upgrade-copy.test.ts                       (new)
apps/web-toy/test/run-summary.test.ts                        (new)
apps/web-toy/src/app.ts
apps/web-toy/index.html
```

Do not edit input, simulation, renderer, hero, or shared contract files.

### Deliverable

- Replace hardcoded upgrade prose in `app.ts` with a validated data-only module.
- Each Greg card must explain: what triggers automatically, what it does, what
  changes at Adapted, occupied socket, and the Thornstorm pairing hint.
- Clearly distinguish NEW, UPGRADE, and an upgrade that will immediately resolve
  a MYTHIC. Derive this only from authoritative visual/offer state; do not predict
  unavailable recipes by mutating runtime state.
- Add a compact terminal run summary using currently exposed facts only. Do not
  invent untracked statistics.
- Preserve keyboard/touch accessibility, mobile layout, exact upgrade pause
  semantics, and no DOM creation in the steady-state frame loop outside actual
  UI-state changes.

### Acceptance

```text
npm test -- --run test/upgrade-copy.test.ts test/run-summary.test.ts
npm run typecheck
npm run lint
npm run build
```

## Integration lead — merge order and final wiring

Merge in this order:

1. Agent C, because it alone extends the shared enemy presentation contract.
2. Agent A, then wire its projector into `greg-presentation.ts`.
3. Agent B, then wire cues into `playcanvas-scene.ts` using pooled primitives.
4. Agent D, resolving `app.ts`/HTML changes last.

The integration lead owns all cross-agent edits, documentation/status updates,
and browser verification. Agents must return patches/commits with only their
owned files.

## Final gates

Run all four package gates plus the complete authored replay test:

```text
cd spikes/headless-sim && npm test && npm run typecheck && npm run lint
cd ../../packages/trait-runtime && npm test && npm run typecheck && npm run lint
cd ../run-director && npm test && npm run typecheck && npm run lint
cd ../../apps/web-toy && npm test && npm run typecheck && npm run lint && npm run build
```

Then perform a live browser pass covering:

- W/Up moves visually upward; S/Down moves downward;
- Greg starts/stops/turns without obvious animation popping;
- attacks, player hits, and pickups have readable but bounded feedback;
- upgrade cards communicate Quills, Pouch, Adapted changes, and Thornstorm;
- elite and boss silhouettes are immediately distinct from regular brutes;
- phase/boss notices and victory/defeat presentation remain visible;
- the 43,200-tick real-runtime test reproduces the exact replay hash;
- no console warnings/errors, no unbounded DOM/view growth, and renderer-off
  parity remains exact.

## Required return from every agent

1. Summary of behavior implemented.
2. Exact files changed.
3. Exact commands run and pass/fail output.
4. Assumptions and integration hooks.
5. Known limitations or checks not performed.
6. Commit hash or patch containing only owned files.

Do not claim Gate 2 or production readiness. This swarm prepares a clearer,
smoother Gate 1 build for continued human playtesting.
