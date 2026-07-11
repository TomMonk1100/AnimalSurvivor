/**
 * Agent D (integrator) — wires the frozen module layer (Agents A-C) into a
 * single deterministic Simulation. This file, src/index.ts, and the test/
 * bench files that accompany it are the only files this agent owns.
 *
 * ---------------------------------------------------------------------------
 * DETERMINISM CONTRACT
 * ---------------------------------------------------------------------------
 * step(input) executes these sub-steps IN THIS EXACT ORDER, every tick:
 *
 *  1. Validate and clamp `input` components into [-1,1], then record that
 *     canonical input. Paused ticks are recorded too
 *     (so a replay reproduces the exact same paused/unpaused schedule).
 *  2. If input.paused: reset the reusable SimEvents to empty and return it
 *     immediately. The clock, rng, weapon cooldown, enemy contact cooldowns,
 *     and every entity's component data are left completely untouched. No
 *     rng draw happens on a paused tick.
 *  3. clock.advance().
 *  4. Reset the reusable SimEvents in place (clear levelUps, zero counters).
 *     The same object is returned every tick; callers must consume events
 *     before the next non-paused step() call overwrites them.
 *  5. If player.alive: decrement player.invulnTicks (floor 0); compute this
 *     tick's move direction from (input.moveX, input.moveY) — normalized
 *     (scaled to unit length) only if its length exceeds 1, left as-is
 *     (preserving analog magnutide) otherwise; advance player position by
 *     dir * player.speed * dt; clamp position to world bounds. This
 *     direction is reused verbatim as TargetContext.moveDir in step 8.
 *  6. waveDirector.step(clock.tick, rng, enemies.data.count, spawnFn). The
 *     only rng draws here are the director's internal pickWeighted() call
 *     and, inside spawnFn, a single rng.float() draw for the spawn angle —
 *     always in that order, and only when a spawn is actually attempted.
 *  7. stepEnemies(...) — enemy movement, grid.update, contact damage.
 *  8. Weapon: decrement weaponCooldown unconditionally; when <= 0 AND
 *     player.alive, query the nearest live target in range and, if found,
 *     attempt to fire a projectile at it. The cooldown is reset to
 *     config.weapon.cooldownTicks ONLY on a successful fire (found a target
 *     AND the projectile pool had room) — otherwise it is left <= 0 so the
 *     shot is retried next tick without any extra delay.
 *  9. stepProjectiles(...) — projectile movement/collision. killEnemy(slot)
 *     (passed in as the callback) reads the enemy's position and xpDrop,
 *     removes it from the grid, despawns it from the pool, and then
 *     attempts to spawn a pickup at that position; a full pickup pool
 *     silently drops the xp (counted in a diagnostic-only counter, excluded
 *     from the state hash).
 * 10. collectPickups(...) then applyXpThresholds(...).
 * 11. Return the (already-populated) events object.
 *
 * RNG CONSUMERS (only these two, always in this relative order per tick):
 *   a) waveDirector's internal weighted archetype pick (only when a regular
 *      spawn slot is due and aliveEnemies < segment.maxAlive).
 *   b) spawnFn's single rng.float() draw for the perimeter spawn angle
 *      (consumed even if the pool turns out to be full, since the angle is
 *      computed before the spawn attempt — see spawnFn below).
 * Nothing else in this module or in the wired-in modules touches rng.
 *
 * GRID INVARIANT: only enemies are ever inserted into `grid` (projectiles and
 * pickups are never gridded in this spike — collision/collection uses a
 * hitRadius+maxEnemyRadius query against the same enemy grid, and pickups use
 * a linear scan). killEnemy() removes an id from the grid BEFORE despawning
 * the pool slot, so the grid never holds a dead id across a tick boundary,
 * and insert/remove stay strictly paired with spawn/despawn (the grid throws
 * on update/remove of an unknown id).
 *
 * STATE HASH — canonical byte order (see hash() below), all via HashWriter:
 *   u32 CONFIG_VERSION, str configFingerprint
 *   u32 tick
 *   u32 rngState.a, u32 rngState.b, u32 rngState.c, u32 rngState.d
 *   player: f32 x, f32 y, f32 hp, f32 maxHp, f32 speed, f32 radius,
 *           f32 pickupRadius, f64 xp, u32 level, u32 invulnTicks, u8 alive
 *   u32 weaponCooldown, f32 lastMoveDirX, f32 lastMoveDirY
 *   for each pool in order [enemies, projectiles, pickups]:
 *     u32 count
 *     for slot in 0..capacity-1:
 *       u8 alive[slot], u16 generation[slot]
 *       IF alive[slot]: every gameplay component for that slot, in this
 *       fixed order (f32 for float arrays, u16/u8 for int arrays):
 *         enemies:     posX, posY, velX, velY, hp, maxHp, speed, radius,
 *                      touchDamage, contactCooldown(u16), archetype(u8),
 *                      xpDrop, marked(u8)
 *         projectiles: posX, posY, velX, velY, damage, lifetime(u16),
 *                      hitRadius, pierce(u8), faction(u8)
 *         pickups:     posX, posY, xp, radius
 * EXCLUDED from the hash (diagnostics only): highWater, queryCount,
 * spawnAttempts/spawnRejections, and this module's xpLostToFullPickupPool
 * counter. Object property iteration is never used for hashing — every
 * field is read positionally off the typed arrays in the fixed order above.
 */
import {
  NO_ENTITY,
  type EntityId,
  type PlayerState,
  type Pool,
  type EnemyPool,
  type ProjectilePool,
  type PickupPool,
  type SimEvents,
  type SpatialGrid,
  type TickInput,
  type ReplayRecord,
  type UpgradeSelection,
  type WaveDirector,
} from './types.js';
import type { SimConfig } from './config.js';
import { CONFIG_VERSION, fingerprintConfig } from './config.js';
import { createRng } from './rng.js';
import { createClock } from './clock.js';
import { createReplayRecorder, deserializeReplay, serializeReplay } from './replay.js';
import { createHashWriter } from './state-hash.js';
import { createEnemyPool, createProjectilePool, createPickupPool } from './pools.js';
import { createSpatialGrid } from './spatial-grid.js';
import { selectTarget } from './targeting.js';
import { createWaveDirector } from './wave-director.js';
import {
  applyXpThresholds,
  collectPickups,
  spawnProjectile,
  stepEnemies,
  stepProjectiles,
} from './combat.js';
import { createTraitCommandExecutor } from './trait-command-executor.js';
import {
  createTraitRuntimePort,
  type TraitRuntimeFactory,
  type TraitUpgradeOfferView,
  type TraitVisualAttachmentView,
} from './trait-runtime-port.js';
import { createTraitUpgradeQueue } from './trait-upgrade-queue.js';
import {
  createRunDirectorPort,
  type RunDirectorEventView,
  type RunDirectorFactory,
  type RunOutcomeView,
  type RunPhaseView,
} from './run-director-port.js';
import {
  createRunSpawnAdapter,
  RUN_ENEMY_ROLE,
  type DirectedEnemySpawn,
  type RunSpawnAdapterOptions,
} from './run-spawn-adapter.js';

export interface SimulationOptions {
  readonly traitRuntimeFactory?: TraitRuntimeFactory;
  readonly traitOfferCount?: number;
  readonly runDirectorFactory?: RunDirectorFactory;
  readonly runSpawnAdapterOptions?: RunSpawnAdapterOptions;
}

const EMPTY_TRAIT_OFFERS: readonly TraitUpgradeOfferView[] = Object.freeze([]);
const EMPTY_TRAIT_VISUALS: readonly TraitVisualAttachmentView[] = Object.freeze([]);

export interface Simulation {
  readonly tick: number;
  readonly player: PlayerState;
  readonly enemies: Pool<EnemyPool>;
  readonly projectiles: Pool<ProjectilePool>;
  readonly pickups: Pool<PickupPool>;
  readonly grid: SpatialGrid;
  readonly waveDirector: WaveDirector;
  /** XP silently dropped because the pickup pool was full at kill time. Diagnostic only. */
  readonly xpLostToFullPickupPool: number;
  readonly traitCatalogFingerprint: string | null;
  readonly runContentFingerprint: string | null;
  readonly runOutcome: RunOutcomeView | null;
  readonly runPhase: RunPhaseView | null;
  readonly directorEvents: readonly RunDirectorEventView[];
  readonly totalKills: number;
  readonly pendingUpgradeOffers: readonly TraitUpgradeOfferView[];
  readonly upgradeSelectionPending: boolean;
  step(input: TickInput): SimEvents;
  selectUpgrade(traitId: string): UpgradeSelection;
  traitVisualState(): readonly TraitVisualAttachmentView[];
  hash(): string;
  getReplay(): ReplayRecord;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function resetEvents(events: SimEvents): void {
  events.levelUps.length = 0;
  events.kills = 0;
  events.pickupsCollected = 0;
  events.enemiesSpawned = 0;
  events.projectilesFired = 0;
}

export function createSimulation(
  config: SimConfig,
  seed: number,
  options: SimulationOptions = {},
): Simulation {
  if (!Number.isFinite(seed)) throw new RangeError(`createSimulation: seed must be finite (received ${seed})`);
  const configFingerprint = fingerprintConfig(config);
  const rng = createRng(seed);
  const clock = createClock(config.hz);
  const traitRuntime = options.traitRuntimeFactory === undefined
    ? null
    : createTraitRuntimePort(options.traitRuntimeFactory, { seed, initialTick: 0 });
  const traitCatalogFingerprint = traitRuntime?.fingerprint() ?? null;
  if (
    traitCatalogFingerprint !== null &&
    !/^[0-9a-f]{16}$/.test(traitCatalogFingerprint)
  ) {
    throw new Error('trait runtime fingerprint must be 16 lowercase hexadecimal characters');
  }
  const traitExecutor = traitRuntime === null ? null : createTraitCommandExecutor();
  const traitUpgradeQueue = traitRuntime === null
    ? null
    : createTraitUpgradeQueue(traitRuntime, { offerCount: options.traitOfferCount ?? 3 });
  const runDirector = options.runDirectorFactory === undefined
    ? null
    : createRunDirectorPort(options.runDirectorFactory, { seed });
  const runContentFingerprint = runDirector?.contentFingerprint() ?? null;
  if (runContentFingerprint !== null && !/^[0-9a-f]{8}$/.test(runContentFingerprint)) {
    throw new Error('run director content fingerprint must be 8 lowercase hexadecimal characters');
  }
  const runSpawnAdapter = runDirector === null
    ? null
    : createRunSpawnAdapter(options.runSpawnAdapterOptions);
  const replayRecorder = createReplayRecorder(
    seed,
    CONFIG_VERSION,
    configFingerprint,
    traitCatalogFingerprint,
    runContentFingerprint,
  );

  const player: PlayerState = {
    x: config.player.startX,
    y: config.player.startY,
    hp: config.player.maxHp,
    maxHp: config.player.maxHp,
    speed: config.player.speed,
    radius: config.player.radius,
    pickupRadius: config.player.pickupRadius,
    xp: 0,
    level: 1,
    invulnTicks: 0,
    alive: true,
  };

  const enemies = createEnemyPool(config.enemyCap);
  const projectiles = createProjectilePool(config.projectileCap);
  const pickups = createPickupPool(config.pickupCap);
  const grid = createSpatialGrid(config.worldWidth, config.worldHeight, config.gridCellSize, config.enemyCap);
  const waveDirector = createWaveDirector(config.waves);
  if (runDirector !== null && config.archetypes.length < 3) {
    throw new Error('run director integration requires at least three simulation archetypes');
  }
  const enemyRoles = new Uint8Array(config.enemyCap);

  let maxEnemyRadius = 0;
  for (const a of config.archetypes) {
    if (a.radius > maxEnemyRadius) maxEnemyRadius = a.radius;
  }

  const events: SimEvents = {
    levelUps: [],
    kills: 0,
    pickupsCollected: 0,
    enemiesSpawned: 0,
    projectilesFired: 0,
  };

  let weaponCooldown = 0;
  let lastMoveDirX = 0;
  let lastMoveDirY = 0;
  let xpLostToFullPickupPool = 0;
  let totalKills = 0;
  let bossEntityId: EntityId = NO_ENTITY;
  let bossDefeatedThisTick = false;
  let lastDirectorEvents: readonly RunDirectorEventView[] = Object.freeze([]);

  const worldWidth = config.worldWidth;
  const worldHeight = config.worldHeight;

  /**
   * Places one enemy of `archetype` (hp scaled by hpMultiplier) at a
   * deterministic point on the perimeter of a circle of radius
   * config.weapon.range + 100 around the player, angle drawn from rng.
   * The angle draw happens before the spawn attempt, so it is consumed even
   * if the pool turns out to be full (see module-level rng consumer note).
   */
  function spawnEnemy(
    archetype: number,
    hpMultiplier: number,
    x: number,
    y: number,
    role: number,
  ): boolean {
    const slot = enemies.spawn();
    if (slot < 0) return false;

    const arch = config.archetypes[archetype]!;
    const data = enemies.data;
    data.posX[slot] = x;
    data.posY[slot] = y;
    data.velX[slot] = 0;
    data.velY[slot] = 0;
    data.hp[slot] = arch.hp * hpMultiplier;
    data.maxHp[slot] = arch.hp * hpMultiplier;
    data.speed[slot] = arch.speed;
    data.radius[slot] = arch.radius;
    data.touchDamage[slot] = arch.touchDamage;
    data.contactCooldown[slot] = 0;
    data.archetype[slot] = archetype;
    data.xpDrop[slot] = arch.xpDrop;
    data.marked[slot] = 0;
    enemyRoles[slot] = role;

    grid.insert(enemies.idOf(slot), x, y);
    if (role === RUN_ENEMY_ROLE.boss) bossEntityId = enemies.idOf(slot);
    events.enemiesSpawned++;
    return true;
  }

  function spawnFn(archetype: number, hpMultiplier: number): boolean {
    const spawnRadius = config.weapon.range + 100;
    const angle = rng.float() * 2 * Math.PI;
    const x = clamp(player.x + Math.cos(angle) * spawnRadius, 0, worldWidth);
    const y = clamp(player.y + Math.sin(angle) * spawnRadius, 0, worldHeight);
    return spawnEnemy(archetype, hpMultiplier, x, y, RUN_ENEMY_ROLE.regular);
  }

  function spawnDirected(request: DirectedEnemySpawn): boolean {
    return spawnEnemy(
      request.archetype,
      request.hpMultiplier,
      request.x,
      request.y,
      request.role,
    );
  }

  function killEnemy(eSlot: number): void {
    const x = enemies.data.posX[eSlot]!;
    const y = enemies.data.posY[eSlot]!;
    const xpDrop = enemies.data.xpDrop[eSlot]!;
    const killedId = enemies.idOf(eSlot);
    const role = enemyRoles[eSlot]!;

    grid.remove(killedId);
    enemies.despawn(eSlot);
    enemyRoles[eSlot] = RUN_ENEMY_ROLE.regular;
    if (role === RUN_ENEMY_ROLE.boss && killedId === bossEntityId) {
      bossEntityId = NO_ENTITY;
      bossDefeatedThisTick = true;
    }

    const pSlot = pickups.spawn();
    if (pSlot < 0) {
      xpLostToFullPickupPool++;
    } else {
      pickups.data.posX[pSlot] = x;
      pickups.data.posY[pSlot] = y;
      pickups.data.xp[pSlot] = xpDrop;
      pickups.data.radius[pSlot] = 4;
    }
    events.kills++;
    totalKills++;
  }

  if (runDirector !== null) {
    lastDirectorEvents = runDirector.step({
      tick: 0,
      paused: false,
      playerAlive: player.alive,
      playerHp: player.hp,
      playerMaxHp: player.maxHp,
      playerLevel: player.level,
      liveEnemies: enemies.data.count,
      killsTotal: totalKills,
      bossAlive: false,
      bossDefeatedThisTick: false,
    });
  }

  function step(input: TickInput): SimEvents {
    if (traitUpgradeQueue?.blocked) {
      throw new Error('Simulation.step: an upgrade selection is pending');
    }
    if (!Number.isFinite(input.moveX) || !Number.isFinite(input.moveY) || typeof input.paused !== 'boolean') {
      throw new TypeError('Simulation.step: input must contain finite moveX/moveY numbers and a boolean paused');
    }
    // Canonicalize before both recording and simulation so a serialize/deserialize
    // round-trip cannot alter out-of-range controller input.
    const canonicalInput: TickInput = {
      moveX: clamp(input.moveX, -1, 1),
      moveY: clamp(input.moveY, -1, 1),
      paused: input.paused,
    };
    replayRecorder.record(canonicalInput);

    if (canonicalInput.paused) {
      resetEvents(events);
      return events;
    }

    clock.advance();
    resetEvents(events);

    const dt = clock.dt;
    const playerXBeforeMove = player.x;
    const playerYBeforeMove = player.y;

    if (player.alive) {
      if (player.invulnTicks > 0) player.invulnTicks--;

      let mx = canonicalInput.moveX;
      let my = canonicalInput.moveY;
      const len = Math.sqrt(mx * mx + my * my);
      if (len > 1) {
        mx /= len;
        my /= len;
      }
      lastMoveDirX = mx;
      lastMoveDirY = my;

      player.x = clamp(player.x + mx * player.speed * dt, 0, worldWidth);
      player.y = clamp(player.y + my * player.speed * dt, 0, worldHeight);
    }

    if (runDirector === null) {
      waveDirector.step(clock.tick, rng, enemies.data.count, spawnFn);
    }

    stepEnemies(
      enemies,
      grid,
      player,
      dt,
      worldWidth,
      worldHeight,
      config.enemyContactCooldownTicks,
      config.player.invulnTicksOnHit,
    );

    weaponCooldown--;
    if (weaponCooldown <= 0 && player.alive) {
      const ctx = {
        originX: player.x,
        originY: player.y,
        range: config.weapon.range,
        moveDirX: lastMoveDirX,
        moveDirY: lastMoveDirY,
      };
      const target: EntityId = selectTarget('nearest', ctx, enemies, grid, config.weapon.clusterRadius);
      if (target !== NO_ENTITY) {
        const tSlot = enemies.slotOf(target);
        if (tSlot >= 0) {
          const dirX = enemies.data.posX[tSlot]! - player.x;
          const dirY = enemies.data.posY[tSlot]! - player.y;
          const fired = spawnProjectile(projectiles, player.x, player.y, dirX, dirY, config.weapon, 0);
          if (fired) {
            events.projectilesFired++;
            weaponCooldown = config.weapon.cooldownTicks;
          }
          // no target found or pool full: do NOT reset cooldown, retry next tick
        }
      }
    }

    if (traitRuntime !== null && traitExecutor !== null) {
      const distanceMovedThisTick = Math.hypot(
        player.x - playerXBeforeMove,
        player.y - playerYBeforeMove,
      );
      const commands = traitRuntime.update({
        tick: clock.tick,
        playerX: player.x,
        playerY: player.y,
        moveDirX: lastMoveDirX,
        moveDirY: lastMoveDirY,
        distanceMovedThisTick,
      });
      if (player.alive) {
        const traitStats = traitExecutor.execute(commands, {
          tick: clock.tick,
          moveDirX: lastMoveDirX,
          moveDirY: lastMoveDirY,
          worldWidth,
          worldHeight,
          enemies,
          projectiles,
          enemyGrid: grid,
          killEnemy,
        });
        events.projectilesFired += traitStats.projectilesSpawned;
      }
    }

    stepProjectiles(projectiles, enemies, grid, dt, worldWidth, worldHeight, maxEnemyRadius, events, killEnemy);

    collectPickups(pickups, player, events);
    applyXpThresholds(player, config.xpThresholds, events);
    traitUpgradeQueue?.enqueueLevels(events.levelUps.length);

    if (runDirector !== null && runSpawnAdapter !== null) {
      const bossAlive = bossEntityId !== NO_ENTITY && enemies.isLive(bossEntityId);
      lastDirectorEvents = runDirector.step({
        tick: clock.tick,
        paused: false,
        playerAlive: player.alive,
        playerHp: player.hp,
        playerMaxHp: player.maxHp,
        playerLevel: player.level,
        liveEnemies: enemies.data.count,
        killsTotal: totalKills,
        bossAlive,
        bossDefeatedThisTick,
      });
      bossDefeatedThisTick = false;
      if (runDirector.outcome === 'running') {
        runSpawnAdapter.execute(lastDirectorEvents, {
          playerX: player.x,
          playerY: player.y,
          worldWidth,
          worldHeight,
          spawn: spawnDirected,
        });
      }
    }

    return events;
  }

  function selectUpgrade(traitId: string): UpgradeSelection {
    if (traitUpgradeQueue === null) {
      throw new Error('Simulation.selectUpgrade: traits are not enabled');
    }
    const selection = traitUpgradeQueue.select(traitId, clock.tick);
    replayRecorder.recordUpgrade(selection);
    return selection;
  }

  function traitVisualState(): readonly TraitVisualAttachmentView[] {
    return traitRuntime?.visualState() ?? EMPTY_TRAIT_VISUALS;
  }

  function hash(): string {
    const writer = createHashWriter();
    writer.u32(CONFIG_VERSION);
    writer.str(configFingerprint);
    writer.u32(clock.tick);

    const rngState = rng.getState();
    writer.u32(rngState.a);
    writer.u32(rngState.b);
    writer.u32(rngState.c);
    writer.u32(rngState.d);

    writer.f32(player.x);
    writer.f32(player.y);
    writer.f32(player.hp);
    writer.f32(player.maxHp);
    writer.f32(player.speed);
    writer.f32(player.radius);
    writer.f32(player.pickupRadius);
    writer.f64(player.xp);
    writer.u32(player.level);
    writer.u32(player.invulnTicks);
    writer.u8(player.alive ? 1 : 0);

    writer.u32(weaponCooldown);
    writer.f32(lastMoveDirX);
    writer.f32(lastMoveDirY);

    // enemies
    {
      const data = enemies.data;
      writer.u32(data.count);
      for (let slot = 0; slot < data.capacity; slot++) {
        writer.u8(data.alive[slot]!);
        writer.u16(data.generation[slot]!);
        if (data.alive[slot] === 1) {
          writer.f32(data.posX[slot]!);
          writer.f32(data.posY[slot]!);
          writer.f32(data.velX[slot]!);
          writer.f32(data.velY[slot]!);
          writer.f32(data.hp[slot]!);
          writer.f32(data.maxHp[slot]!);
          writer.f32(data.speed[slot]!);
          writer.f32(data.radius[slot]!);
          writer.f32(data.touchDamage[slot]!);
          writer.u16(data.contactCooldown[slot]!);
          writer.u8(data.archetype[slot]!);
          writer.f32(data.xpDrop[slot]!);
          writer.u8(data.marked[slot]!);
        }
      }
    }

    // projectiles
    {
      const data = projectiles.data;
      writer.u32(data.count);
      for (let slot = 0; slot < data.capacity; slot++) {
        writer.u8(data.alive[slot]!);
        writer.u16(data.generation[slot]!);
        if (data.alive[slot] === 1) {
          writer.f32(data.posX[slot]!);
          writer.f32(data.posY[slot]!);
          writer.f32(data.velX[slot]!);
          writer.f32(data.velY[slot]!);
          writer.f32(data.damage[slot]!);
          writer.u16(data.lifetime[slot]!);
          writer.f32(data.hitRadius[slot]!);
          writer.u8(data.pierce[slot]!);
          writer.u8(data.faction[slot]!);
        }
      }
    }

    // pickups
    {
      const data = pickups.data;
      writer.u32(data.count);
      for (let slot = 0; slot < data.capacity; slot++) {
        writer.u8(data.alive[slot]!);
        writer.u16(data.generation[slot]!);
        if (data.alive[slot] === 1) {
          writer.f32(data.posX[slot]!);
          writer.f32(data.posY[slot]!);
          writer.f32(data.xp[slot]!);
          writer.f32(data.radius[slot]!);
        }
      }
    }

    if (traitRuntime !== null && traitUpgradeQueue !== null) {
      writer.str(traitCatalogFingerprint!);
      writer.str(traitRuntime.hash());
      writer.f64(traitUpgradeQueue.queuedLevels);
      writer.f64(traitUpgradeQueue.drainedLevels);
      writer.f64(traitUpgradeQueue.selectionCount);
      writer.u32(traitUpgradeQueue.pendingOfferCount);
      for (const offer of traitUpgradeQueue.pendingOffers) {
        writer.str(offer.traitId);
        writer.str(offer.resultStage);
      }
    }

    if (runDirector !== null) {
      const directorHash = runDirector.stateHash();
      if (!/^[0-9a-f]{8}$/.test(directorHash)) {
        throw new Error('run director state hash must be 8 lowercase hexadecimal characters');
      }
      writer.str(runContentFingerprint!);
      writer.str(directorHash);
      writer.f64(totalKills);
      writer.u32(bossEntityId);
      for (let slot = 0; slot < enemies.data.capacity; slot++) {
        if (enemies.data.alive[slot] === 1) writer.u8(enemyRoles[slot]!);
      }
    }

    return writer.digestHex();
  }

  function getReplay(): ReplayRecord {
    return replayRecorder.finish();
  }

  return {
    get tick() {
      return clock.tick;
    },
    player,
    enemies,
    projectiles,
    pickups,
    grid,
    waveDirector,
    traitCatalogFingerprint,
    runContentFingerprint,
    get runOutcome() {
      return runDirector?.outcome ?? null;
    },
    get runPhase() {
      return runDirector?.phase ?? null;
    },
    get directorEvents() {
      return lastDirectorEvents;
    },
    get totalKills() {
      return totalKills;
    },
    get pendingUpgradeOffers() {
      return traitUpgradeQueue?.pendingOffers ?? EMPTY_TRAIT_OFFERS;
    },
    get upgradeSelectionPending() {
      return traitUpgradeQueue?.blocked ?? false;
    },
    get xpLostToFullPickupPool() {
      return xpLostToFullPickupPool;
    },
    step,
    selectUpgrade,
    traitVisualState,
    hash,
    getReplay,
  };
}

/**
 * Reconstructs a fresh Simulation from record.seed and replays every
 * recorded input (including paused ticks) in order. Throws if the record's
 * configVersion or exact config fingerprint differs from the current build —
 * a replay recorded against different gameplay content cannot be trusted to
 * reproduce the same simulation.
 */
export function runReplay(
  config: SimConfig,
  record: ReplayRecord,
  options: SimulationOptions = {},
): { finalHash: string; ticks: number } {
  if (record.configVersion !== CONFIG_VERSION) {
    throw new Error(
      `runReplay: configVersion mismatch (record has ${record.configVersion}, current is ${CONFIG_VERSION})`,
    );
  }
  const currentFingerprint = fingerprintConfig(config);
  if (record.configFingerprint !== currentFingerprint) {
    throw new Error(
      `runReplay: config fingerprint mismatch (record has ${record.configFingerprint}, current is ${currentFingerprint})`,
    );
  }
  const sim = createSimulation(config, record.seed, options);
  if (record.traitCatalogFingerprint !== sim.traitCatalogFingerprint) {
    throw new Error('runReplay: trait catalog fingerprint mismatch');
  }
  if (record.runContentFingerprint !== sim.runContentFingerprint) {
    throw new Error('runReplay: run content fingerprint mismatch');
  }
  let selectionIndex = 0;
  for (const input of record.inputs) {
    sim.step(input);
    while (
      selectionIndex < record.upgradeSelections.length &&
      record.upgradeSelections[selectionIndex]!.tick === sim.tick
    ) {
      sim.selectUpgrade(record.upgradeSelections[selectionIndex]!.traitId);
      selectionIndex++;
    }
    if (
      selectionIndex < record.upgradeSelections.length &&
      record.upgradeSelections[selectionIndex]!.tick < sim.tick
    ) {
      throw new Error('runReplay: upgrade selection tick was not reachable');
    }
  }
  if (selectionIndex !== record.upgradeSelections.length) {
    throw new Error('runReplay: unapplied upgrade selections remain');
  }
  return { finalHash: sim.hash(), ticks: sim.tick };
}

// Re-exported here so callers of simulation.ts alone (rather than index.ts)
// can still round-trip a replay without a second import from replay.js.
export { serializeReplay, deserializeReplay };
