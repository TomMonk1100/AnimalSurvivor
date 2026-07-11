# headless-sim

A renderer-free, deterministic simulation core for a top-down survival-style
game (waves of enemies, an auto-firing weapon, pickups, leveling). The point
of this spike is to validate **CPU scaling of the simulation logic itself**
at high enemy counts, decoupled from any rendering concerns — the numbers
`bench/bench.ts` prints are step()-loop timings only. They are **not** a
claim about rendering performance; a browser integration will own that
budget separately once this core is wired to a renderer.

## Architecture map

One line per module — who conceptually owns what:

- `src/types.ts` — frozen public contracts (entity ids, pools, grid, rng,
  clock, targeting, waves, player/events/replay/hash shapes). Never modified
  by implementers.
- `src/config.ts` — tunables, fail-fast validation, and a canonical gameplay
  fingerprint used to bind replays to exact content.
- `src/rng.ts` — deterministic sfc32 PRNG, seeded via splitmix32; the only
  source of randomness anywhere in the sim.
- `src/clock.ts` — fixed-step tick counter (`tick`, `dt = 1/hz`), advanced
  exactly once per non-paused `step()`.
- `src/replay.ts` — records `TickInput` history and provides stable
  JSON (de)serialization of `ReplayRecord`. Does not itself replay/step.
- `src/state-hash.ts` — FNV-1a byte-stream `HashWriter`; ordering is entirely
  the caller's (`simulation.ts`'s) responsibility.
- `src/pools.ts` — structure-of-arrays entity pools (enemies, projectiles,
  pickups) with generation-checked ids; despawn-of-dead-slot is a safe no-op.
- `src/spatial-grid.ts` — uniform 2D grid over world bounds; only enemies are
  ever inserted in this spike. Throws on update/remove of an unknown id.
- `src/targeting.ts` — pure targeting-policy functions (`nearest`,
  `highestHealth`, `densestCluster`, `markedThenNearest`, `rearThreat`).
- `src/wave-director.ts` — deterministic spawn scheduler driven by
  `config.waves`; calls back into a caller-supplied `spawnFn`.
- `src/combat.ts` — enemy movement/contact damage, projectile movement/hit
  detection, pickup collection, xp-threshold leveling, projectile spawning.
- `src/trait-command-executor.ts` — structural, zero-runtime-dependency bridge
  that executes Quills/Pouch/Thornstorm projectile bursts, radial bursts,
  gathering, knockback, and telegraphs against the authoritative pools/grid.
- `src/simulation.ts` **(this agent)** — wires all of the above into
  `createSimulation()` / `runReplay()`; owns the exact per-tick step order,
  the canonical state-hash field order, and the weapon/spawn glue code that
  isn't any other agent's module.
- `src/index.ts` **(this agent)** — public re-export surface.
- `bench/bench.ts` **(this agent)** — steady-state throughput benchmark.
- `test/simulation.test.ts`, `test/determinism.test.ts` **(this agent)** —
  integration and determinism tests.

## How to run

```sh
npm install
npm run typecheck   # tsc --noEmit
npm run lint         # scripts/lint.mjs: no Math.random/Date.now/timers/DOM in src/
npm test             # tsc then node --test dist/test/
npm run bench        # tsc then node dist/bench/bench.js
npm run bench:projectiles # steady-state 500-projectile collision workload
```

## Determinism contract

`Simulation.step(input)` executes, in this exact order, every call:

1. Record `input` into the replay recorder (paused ticks are recorded too).
2. If `input.paused`: reset the reusable `SimEvents` to empty and return it.
   The clock, rng, weapon cooldown, contact cooldowns, and every entity's
   component data are left completely untouched — no rng draw happens on a
   paused tick.
3. `clock.advance()`.
4. Reset the reusable `SimEvents` in place (same object every tick — do not
   hold a reference across calls without copying what you need).
5. If `player.alive`: decrement `invulnTicks` (floor 0); compute this tick's
   move direction from `(moveX, moveY)` — normalized only if its length
   exceeds 1; advance position by `dir * speed * dt`; clamp to world bounds.
6. `waveDirector.step(tick, rng, enemies.data.count, spawnFn)`. `spawnFn`
   places a new enemy on the perimeter of a circle of radius
   `weapon.range + 100` around the player, angle drawn from `rng.float()`,
   clamped to world bounds.
7. `stepEnemies(...)` — movement, `grid.update`, contact damage.
8. Weapon: decrement `weaponCooldown` unconditionally; when `<= 0` and the
   player is alive, find the nearest live target in range and fire. The
   cooldown only resets on a **successful** fire; otherwise it stays `<= 0`
   and retries next tick (no extra delay from a missed shot).
9. `stepProjectiles(...)` — movement/hit detection. Its `killEnemy` callback
   reads the enemy's position/xpDrop, removes it from the grid **before**
   despawning the pool slot (so the grid never holds a dead id across a tick
   boundary), then spawns a pickup at that position if the pickup pool has
   room (a full pool silently drops the xp — see Known limitations).
10. `collectPickups(...)` then `applyXpThresholds(...)`.
11. Return the events object.

**RNG consumers** (always in this order, and only on non-paused ticks): the
wave director's internal weighted archetype pick, then `spawnFn`'s single
`rng.float()` draw for the spawn angle (consumed even when the pool turns out
to be full — the angle is drawn before the spawn attempt).

**State hash** (`Simulation.hash()`) — canonical byte order via
`HashWriter`, everything read positionally off typed arrays (never object
property iteration):

```
u32 CONFIG_VERSION, string configFingerprint
u32 tick
u32 rngState.a, u32 rngState.b, u32 rngState.c, u32 rngState.d
player: f32 x, f32 y, f32 hp, f32 maxHp, f32 speed, f32 radius,
        f32 pickupRadius, f64 xp, u32 level, u32 invulnTicks, u8 alive
u32 weaponCooldown, f32 lastMoveDirX, f32 lastMoveDirY
for each pool in [enemies, projectiles, pickups]:
  u32 count
  for slot in 0..capacity-1:
    u8 alive[slot], u16 generation[slot]
    if alive[slot]:
      enemies:     posX,posY,velX,velY,hp,maxHp,speed,radius,touchDamage,
                   contactCooldown(u16),archetype(u8),xpDrop,marked(u8)
      projectiles: posX,posY,velX,velY,damage,lifetime(u16),hitRadius,
                   pierce(u8),faction(u8)
      pickups:     posX,posY,xp,radius
```

Excluded from the hash (diagnostics only): `highWater`, `queryCount`,
`spawnAttempts`/`spawnRejections`, and `xpLostToFullPickupPool`.

**Replay format**: `ReplayRecord { seed, configVersion, configFingerprint,
inputs: TickInput[] }`,
stable-JSON (de)serialized by `src/replay.ts`. `runReplay(config, record)`
reconstructs a sim from `record.seed`, throws if
the version or exact configuration fingerprint differs, and replays every
recorded input (including paused ticks) in order. Direct controller input is
clamped to the same canonical `[-1, 1]` representation before both recording
and simulation, so serialization cannot change a run.

## Dependencies

`typescript` and `@types/node` — both dev-only. **Zero runtime dependencies.**
The simulation is pure TypeScript/JS against typed arrays and plain objects;
nothing here needs a library, and pulling one in would risk hidden
non-determinism (e.g. iteration-order assumptions, floating-point library
differences) that this spike is specifically trying to rule out.

## Known limitations

- **Trait runtime lifecycle not yet injected:** the command executor is accepted
  and public, but `createSimulation()` does not yet own a `TraitRuntime`. The
  next integration must bind trait hash/replay state and level-up choices in one
  schema change rather than creating a partial replay format.
- **Vertical-slice command coverage:** the executor handles the five command
  kinds used by Quills, Pouch, and Thornstorm. Other catalog command kinds are
  counted as unsupported until their combat semantics are authored.

- **Pierce re-hit across ticks**: a projectile with remaining pierce keeps no
  per-projectile hit list, so a surviving pierced enemy can be re-hit by the
  same projectile on a later tick if it's still in range.
- **Single grid, enemies only**: projectiles and pickups are never inserted
  into the spatial grid in this spike; projectile-vs-enemy hit tests reuse
  the enemy grid with a padded query radius, and pickup collection is a
  linear scan.
- **Pickup linear scan**: acceptable because the pickup cap is small; would
  need its own grid (or the enemy grid extended) at much larger scale.
- **XP lost when the pickup pool is full**: `killEnemy` silently drops the
  dropped xp if `pickups.spawn()` returns `-1`; counted in the diagnostic-only
  `xpLostToFullPickupPool` counter (excluded from the state hash).
- **One contact-damage instance per tick per enemy, gated by both a
  per-enemy cooldown and player invulnerability**: an enemy standing on the
  player deals damage once, then can't again until its own
  `contactCooldown` reaches 0 *and* the player's `invulnTicks` reaches 0 —
  two independent timers guarding the same event.
- **Float32 pool storage**: all pool position/velocity/stat components are
  `Float32Array`, so component values are subject to float32 rounding
  (intentional — it's what the state hash actually hashes, and keeps memory
  layout compact for the CPU-scaling question this spike is asking).
- **Same-engine determinism only**: repeatability is verified across separate
  Node processes on one runtime. Transcendental functions used for movement
  and spawning (`sin`, `cos`, `sqrt`) mean bit-identical hashes across different
  JS engines/architectures are not yet a supported replay guarantee.
- **Not reentrant**: combat and targeting reuse module-level scratch arrays.
  Multiple simulations may be stepped sequentially, but must not be stepped
  reentrantly from callbacks or concurrently in one JS isolate.
