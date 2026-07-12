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
 *  8. Weapon: decrement weaponCooldown down to zero; when it is ready AND
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
 * 10. While alive, collectPickups(...) then applyXpThresholds(...).
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
 *   for each pool in order [enemies, projectiles, pickups, zones]:
 *     u32 count
 *     for slot in 0..capacity-1:
 *       u8 alive[slot], u16 generation[slot]
 *       IF alive[slot]: every gameplay component for that slot, in this
 *       fixed order (f32 for float arrays, u16/u8 for int arrays):
 *         enemies:     posX, posY, velX, velY, hp, maxHp, speed, radius,
 *                      touchDamage, contactCooldown(u16),
 *                      zoneDamageCooldown(u16), archetype(u8),
 *                      xpDrop, marked(u8)
 *         projectiles: posX, posY, velX, velY, damage, lifetime(u16),
 *                      hitRadius, pierce(u8), faction(u8)
 *         pickups:     posX, posY, xp, radius
 *         zones:       posX, posY, radius, damage, lifetime(u16),
 *                      intervalTicks(u16), pulseCooldown(u16), tag(u8)
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
  type ZonePool,
} from './types.js';
import type { SimConfig } from './config.js';
import { CONFIG_VERSION, fingerprintConfig } from './config.js';
import { createRng } from './rng.js';
import { createClock } from './clock.js';
import { createReplayRecorder, deserializeReplay, serializeReplay } from './replay.js';
import { createHashWriter } from './state-hash.js';
import { createEnemyPool, createProjectilePool, createPickupPool, createZonePool } from './pools.js';
import { createSpatialGrid } from './spatial-grid.js';
import { selectTarget } from './targeting.js';
import { createWaveDirector } from './wave-director.js';
import {
  applyXpThresholds,
  attractPickups,
  collectPickups,
  spawnProjectile,
  stepEnemies,
  stepProjectiles,
} from './combat.js';
import { MAX_CHAIN_JUMPS, createTraitCommandExecutor } from './trait-command-executor.js';
import { createZoneStepper } from './zones.js';
import {
  createTraitRuntimePort,
  type TraitRuntimeCommandSource,
  type TraitRuntimeCommandView,
  type TraitRuntimeFactory,
  type TraitVisualAttachmentView,
} from './trait-runtime-port.js';
import {
  createRunUpgradeQueue,
  type RunUpgradeOfferView,
} from './run-upgrade-queue.js';
import type { UniversalUpgradeCatalog } from './universal-upgrades.js';
import {
  fingerprintRunStartLoadout,
  normalizeRunStartLoadout,
  type RunStartLoadout,
} from './run-start-loadout.js';
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
  type RunEnemyRole,
  type RunSpawnAdapterOptions,
} from './run-spawn-adapter.js';
import { createEnemyBehaviorState, resetEnemyBehavior } from './enemy-behavior.js';

export interface SimulationOptions {
  readonly traitRuntimeFactory?: TraitRuntimeFactory;
  readonly traitOfferCount?: number;
  /** Optional neutral per-run catalog; omitted keeps legacy trait-only runs. */
  readonly universalUpgradeCatalog?: UniversalUpgradeCatalog;
  /** App-resolved permanent effects, detached before simulation startup. */
  readonly runStartLoadout?: RunStartLoadout;
  readonly runDirectorFactory?: RunDirectorFactory;
  readonly runSpawnAdapterOptions?: RunSpawnAdapterOptions;
}

const EMPTY_RUN_OFFERS: readonly RunUpgradeOfferView[] = Object.freeze([]);
const EMPTY_TRAIT_VISUALS: readonly TraitVisualAttachmentView[] = Object.freeze([]);
const EMPTY_UNIVERSAL_RANKS: readonly number[] = Object.freeze([]);
/** Kept in lockstep with the executor so every authoritative hit can render. */
export const MAX_TRAIT_PRESENTATION_CHAIN_HITS = MAX_CHAIN_JUMPS + 1;

/**
 * A renderer-facing copy of a trait command that was handed to the combat
 * executor. The simulation reuses both the array and its event objects on
 * the next step, so consumers must copy any data they need to retain.
 *
 * Zone metadata is normalized because the structural runtime port keeps it
 * optional for compatibility with lightweight runtimes.
 * This is presentation-only output and is deliberately excluded from hash()
 * and replay state.
 */
export interface TraitPresentationEventView {
  readonly kind: string;
  readonly sourceId: string;
  readonly tick: number;
  readonly targeting: string;
  readonly originX: number;
  readonly originY: number;
  readonly dirX: number;
  readonly dirY: number;
  readonly count: number;
  readonly damage: number;
  readonly speed: number;
  readonly radius: number;
  readonly strength: number;
  readonly durationTicks: number;
  readonly intervalTicks: number;
  readonly amount: number;
  readonly facing: number;
  readonly spread: number;
  /** Additional chain targets requested by authored content. */
  readonly jumps: number;
  readonly range: number;
  readonly tag: string;
  /** Actual chain victims captured before any simulation-owned kill cleanup. */
  readonly resolvedHitCount: number;
  /** Fixed-capacity endpoint arrays; only [0, resolvedHitCount) are meaningful. */
  readonly resolvedHitX: Float32Array;
  readonly resolvedHitY: Float32Array;
}

type MutableTraitPresentationEvent = {
  -readonly [Key in keyof TraitPresentationEventView]: TraitPresentationEventView[Key];
};

export interface Simulation {
  readonly tick: number;
  readonly player: PlayerState;
  readonly enemies: Pool<EnemyPool>;
  readonly projectiles: Pool<ProjectilePool>;
  readonly pickups: Pool<PickupPool>;
  /** Persistent player damage pads; compact numeric tags are renderer-ready. */
  readonly zones: Pool<ZonePool>;
  readonly grid: SpatialGrid;
  readonly waveDirector: WaveDirector;
  /** XP silently dropped because the pickup pool was full at kill time. Diagnostic only. */
  readonly xpLostToFullPickupPool: number;
  readonly traitCatalogFingerprint: string | null;
  readonly universalUpgradeCatalogFingerprint: string | null;
  readonly runStartLoadoutFingerprint: string;
  readonly runContentFingerprint: string | null;
  readonly runOutcome: RunOutcomeView | null;
  readonly runPhase: RunPhaseView | null;
  readonly directorEvents: readonly RunDirectorEventView[];
  readonly totalKills: number;
  /** Essence earned from fallback cards during this run, before terminal settlement. */
  readonly runEssenceEarned: number;
  /** Immutable universal ranks in the active catalog's canonical order. */
  readonly universalUpgradeRanks: readonly number[];
  /** Five for a neutral-enabled run; zero when neutral upgrades are disabled. */
  readonly universalUpgradeSlotCapacity: number;
  /** Distinct neutral upgrades selected into the current run build. */
  readonly universalUpgradeSlotsUsed: number;
  readonly pendingUpgradeOffers: readonly RunUpgradeOfferView[];
  readonly upgradeSelectionPending: boolean;
  /**
   * Renderer-only copies of commands executed during the most recent advancing
   * tick. This reusable output is empty after a paused step and excluded from
   * deterministic gameplay state.
   */
  readonly traitPresentationEvents: readonly TraitPresentationEventView[];
  /**
   * Read-only presentation classification for a live enemy id. This mirrors
   * the run adapter's already-authoritative role and is intentionally not a
   * writable component exposed to callers. Stale/dead ids safely read as a
   * regular enemy so a renderer can discard an obsolete snapshot without
   * affecting simulation state.
   */
  enemyPresentationRole(id: EntityId): RunEnemyRole;
  step(input: TickInput): SimEvents;
  selectUpgrade(id: string): UpgradeSelection;
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
  events.enemyProjectilesFired = 0;
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
  const runUpgradeQueue = traitRuntime === null && options.universalUpgradeCatalog === undefined
    ? null
    : options.universalUpgradeCatalog === undefined
      ? createRunUpgradeQueue(traitRuntime, { offerCount: options.traitOfferCount ?? 3 })
      : createRunUpgradeQueue(traitRuntime, {
        offerCount: options.traitOfferCount ?? 3,
        universalCatalog: options.universalUpgradeCatalog,
      });
  const universalUpgradeCatalogFingerprint = runUpgradeQueue?.universalCatalogFingerprint ?? null;
  if (
    universalUpgradeCatalogFingerprint !== null &&
    !/^[0-9a-f]{16}$/.test(universalUpgradeCatalogFingerprint)
  ) {
    throw new Error('universal upgrade catalog fingerprint must be 16 lowercase hexadecimal characters');
  }
  const runStartLoadout = normalizeRunStartLoadout(options.runStartLoadout);
  const runStartLoadoutFingerprint = fingerprintRunStartLoadout(runStartLoadout);
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
    universalUpgradeCatalogFingerprint,
    runContentFingerprint,
    runStartLoadoutFingerprint,
  );

  const basePlayerMaxHp = config.player.maxHp + runStartLoadout.maxHpBonus;
  const player: PlayerState = {
    x: config.player.startX,
    y: config.player.startY,
    hp: basePlayerMaxHp,
    maxHp: basePlayerMaxHp,
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
  const zones = createZonePool(config.zoneCap);
  const grid = createSpatialGrid(config.worldWidth, config.worldHeight, config.gridCellSize, config.enemyCap);
  const waveDirector = createWaveDirector(config.waves);
  // The config is immutable content. A local copy lets an actual run upgrade
  // change projectile damage without mutating caller-owned config state.
  const weapon = { ...config.weapon };
  if (runDirector !== null && config.archetypes.length < 4) {
    throw new Error('run director integration requires at least four simulation archetypes');
  }
  const enemyRoles = new Uint8Array(config.enemyCap);
  const enemyBehavior = createEnemyBehaviorState(config.enemyCap);

  let maxEnemyRadius = 0;
  for (const a of config.archetypes) {
    if (a.radius > maxEnemyRadius) maxEnemyRadius = a.radius;
  }

  const events: SimEvents = {
    levelUps: [],
    kills: 0,
    pickupsCollected: 0,
    enemiesSpawned: 0,
    enemyProjectilesFired: 0,
    projectilesFired: 0,
  };
  const traitPresentationEventStorage: MutableTraitPresentationEvent[] = [];
  const traitPresentationEvents: MutableTraitPresentationEvent[] = [];
  let traitPresentationCommandSource: TraitRuntimeCommandSource | null = null;
  const traitPresentationCommandCapture: TraitRuntimeCommandSource = {
    get length() {
      return traitPresentationCommandSource?.length ?? 0;
    },
    at(index: number): TraitRuntimeCommandView {
      const source = traitPresentationCommandSource;
      if (source === null) {
        throw new Error('trait presentation command capture is not active');
      }
      const command = source.at(index);
      let event = traitPresentationEventStorage[index];
      if (event === undefined) {
        event = {
          kind: command.kind,
          sourceId: command.sourceId,
          tick: command.tick,
          targeting: command.targeting,
          originX: command.originX,
          originY: command.originY,
          dirX: command.dirX,
          dirY: command.dirY,
          count: command.count,
          damage: command.damage,
          speed: command.speed,
          radius: command.radius,
          strength: command.strength,
          durationTicks: command.durationTicks ?? 0,
          intervalTicks: command.intervalTicks ?? 0,
          amount: command.amount ?? 0,
          facing: command.facing,
          spread: command.spread,
          jumps: command.jumps ?? 0,
          range: command.range,
          tag: command.tag ?? '',
          resolvedHitCount: 0,
          resolvedHitX: new Float32Array(MAX_TRAIT_PRESENTATION_CHAIN_HITS),
          resolvedHitY: new Float32Array(MAX_TRAIT_PRESENTATION_CHAIN_HITS),
        };
        traitPresentationEventStorage[index] = event;
      } else {
        event.kind = command.kind;
        event.sourceId = command.sourceId;
        event.tick = command.tick;
        event.targeting = command.targeting;
        event.originX = command.originX;
        event.originY = command.originY;
        event.dirX = command.dirX;
        event.dirY = command.dirY;
        event.count = command.count;
        event.damage = command.damage;
        event.speed = command.speed;
        event.radius = command.radius;
        event.strength = command.strength;
        event.durationTicks = command.durationTicks ?? 0;
        event.intervalTicks = command.intervalTicks ?? 0;
        event.amount = command.amount ?? 0;
        event.facing = command.facing;
        event.spread = command.spread;
        event.jumps = command.jumps ?? 0;
        event.range = command.range;
        event.tag = command.tag ?? '';
        event.resolvedHitCount = 0;
      }
      traitPresentationEvents[index] = event;
      return command;
    },
  };

  function resetTraitPresentationEvents(): void {
    traitPresentationEvents.length = 0;
    traitPresentationCommandSource = null;
  }

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
  let pickupAttractionRadius = 0;
  let pickupAttractionSpeed = 0;
  let xpGainMultiplier = 1;
  let traitDamageMultiplier = 1;
  let traitCooldownMultiplier = 1;
  const zoneStepper = createZoneStepper();

  /** Synchronize concrete authoritative stats after a universal card selection. */
  function applyUniversalStats(): void {
    const stats = runUpgradeQueue?.universalStats;
    if (stats === null || stats === undefined) return;

    player.speed = config.player.speed * stats.speedMultiplier;
    player.pickupRadius = config.player.pickupRadius + stats.pickupRadiusBonus;
    pickupAttractionRadius = stats.pickupAttractionRadius;
    pickupAttractionSpeed = stats.pickupAttractionSpeed;
    weapon.damage = config.weapon.damage * stats.weaponDamageMultiplier;
    weapon.cooldownTicks = Math.max(1, Math.round(config.weapon.cooldownTicks * stats.weaponCooldownMultiplier));
    traitDamageMultiplier = stats.weaponDamageMultiplier;
    traitCooldownMultiplier = stats.weaponCooldownMultiplier;
    xpGainMultiplier = stats.xpMultiplier;

    const nextMaxHp = basePlayerMaxHp + stats.maxHpBonus;
    if (nextMaxHp > player.maxHp) player.hp += nextMaxHp - player.maxHp;
    player.maxHp = nextMaxHp;
    if (player.hp > player.maxHp) player.hp = player.maxHp;
  }

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
    xpMultiplier = 1,
  ): boolean {
    if (!Number.isFinite(xpMultiplier) || xpMultiplier <= 0) {
      throw new RangeError('enemy XP multiplier must be finite and positive');
    }
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
    data.zoneDamageCooldown[slot] = 0;
    data.archetype[slot] = archetype;
    data.xpDrop[slot] = arch.xpDrop * xpMultiplier;
    data.marked[slot] = 0;
    enemyRoles[slot] = role;
    resetEnemyBehavior(
      enemyBehavior,
      slot,
      arch.name,
      role === RUN_ENEMY_ROLE.elite,
      config.enemyBehavior.eliteInitialFireDelayTicks,
      config.enemyBehavior.spitterInitialFireDelayTicks,
    );

    grid.insert(enemies.idOf(slot), x, y);
    if (role === RUN_ENEMY_ROLE.boss) bossEntityId = enemies.idOf(slot);
    events.enemiesSpawned++;
    return true;
  }

  function spawnFn(archetype: number, hpMultiplier: number): boolean {
    const spawnRadius = weapon.range + 100;
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
      request.xpMultiplier,
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
    resetEnemyBehavior(enemyBehavior, eSlot, '', false, 0, 0);
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
      // Rare elite drops are a visibly larger, easier-to-spot XP token while
      // retaining one bounded pickup per kill and the same authoritative XP
      // value. Ordinary 1-XP motes remain at radius 4.
      pickups.data.radius[pSlot] = 4 + Math.min(5, Math.floor(Math.sqrt(xpDrop) / 2));
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
    // Tick-zero events are authoritative just like events from later fixed
    // ticks. Execute any authored spawn intents now so custom content cannot
    // silently lose its opening formation before the first input arrives.
    if (runSpawnAdapter !== null && runDirector.outcome === 'running') {
      runSpawnAdapter.execute(lastDirectorEvents, {
        playerX: player.x,
        playerY: player.y,
        worldWidth,
        worldHeight,
        spawn: spawnDirected,
      });
    }
  }

  function step(input: TickInput): SimEvents {
    if (runUpgradeQueue?.blocked) {
      throw new Error('Simulation.step: an upgrade selection is pending');
    }
    if (!Number.isFinite(input.moveX) || !Number.isFinite(input.moveY) || typeof input.paused !== 'boolean') {
      throw new TypeError('Simulation.step: input must contain finite moveX/moveY numbers and a boolean paused');
    }
    if (runDirector !== null && runDirector.outcome !== 'running') {
      // A terminal run is frozen at its final authoritative boundary. This is
      // deliberately a no-op rather than a new replay input: callers that
      // sample once more after a terminal frame cannot add kills, XP, or a
      // post-run upgrade choice.
      resetEvents(events);
      resetTraitPresentationEvents();
      return events;
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
      resetTraitPresentationEvents();
      return events;
    }

    clock.advance();
    resetEvents(events);
    resetTraitPresentationEvents();

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
      {
        state: enemyBehavior,
        config: config.enemyBehavior,
        tick: clock.tick,
        projectiles,
        events,
      },
    );

    if (weaponCooldown > 0) weaponCooldown--;
    if (weaponCooldown === 0 && player.alive) {
      const ctx = {
        originX: player.x,
        originY: player.y,
        range: weapon.range,
        moveDirX: lastMoveDirX,
        moveDirY: lastMoveDirY,
      };
      const target: EntityId = selectTarget('nearest', ctx, enemies, grid, weapon.clusterRadius);
      if (target !== NO_ENTITY) {
        const tSlot = enemies.slotOf(target);
        if (tSlot >= 0) {
          const dirX = enemies.data.posX[tSlot]! - player.x;
          const dirY = enemies.data.posY[tSlot]! - player.y;
          const fired = spawnProjectile(projectiles, player.x, player.y, dirX, dirY, weapon, 0);
          if (fired) {
            events.projectilesFired++;
            weaponCooldown = weapon.cooldownTicks;
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
        weaponDamageMultiplier: traitDamageMultiplier,
        weaponCooldownMultiplier: traitCooldownMultiplier,
      });
      if (player.alive) {
        traitPresentationCommandSource = commands;
        try {
          const traitStats = traitExecutor.execute(traitPresentationCommandCapture, {
            tick: clock.tick,
            moveDirX: lastMoveDirX,
            moveDirY: lastMoveDirY,
            worldWidth,
            worldHeight,
            enemies,
            projectiles,
            zones,
            enemyGrid: grid,
            killEnemy,
            onChainDamageHit(commandIndex, hitIndex, x, y): void {
              const event = traitPresentationEvents[commandIndex];
              if (
                event === undefined
                || event.kind !== 'chainDamage'
                || hitIndex < 0
                || hitIndex >= MAX_TRAIT_PRESENTATION_CHAIN_HITS
              ) {
                return;
              }
              event.resolvedHitX[hitIndex] = x;
              event.resolvedHitY[hitIndex] = y;
              event.resolvedHitCount = hitIndex + 1;
            },
          });
          events.projectilesFired += traitStats.projectilesSpawned;
        } catch (error) {
          // Do not leave a partially captured batch visible when validation
          // rejects a malformed runtime command source.
          resetTraitPresentationEvents();
          throw error;
        } finally {
          traitPresentationCommandSource = null;
        }
      }
    }

    // Persistent pads resolve after all new trait commands in the same tick,
    // so a newly placed Gecko/Razorstep pad gets its first damaging pulse
    // immediately. Zones are damage-only and never alter enemy movement.
    zoneStepper.step(zones, {
      enemies,
      enemyGrid: grid,
      killEnemy,
    });

    stepProjectiles(
      projectiles,
      enemies,
      grid,
      dt,
      worldWidth,
      worldHeight,
      maxEnemyRadius,
      events,
      killEnemy,
      player,
      config.player.invulnTicksOnHit,
    );

    if (player.alive) {
      attractPickups(pickups, player, dt, pickupAttractionRadius, pickupAttractionSpeed);
      collectPickups(pickups, player, events, xpGainMultiplier);
      applyXpThresholds(player, config.xpThresholds, events);
    }

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

    // A same-tick terminal outcome settles the run before any unresolved XP
    // can become a player choice. This prevents an upgrade (including Essence
    // Cache) from appearing after the terminal reward has already been paid.
    if (runDirector === null || runDirector.outcome === 'running') {
      runUpgradeQueue?.enqueueLevels(events.levelUps.length);
    }

    return events;
  }

  function selectUpgrade(id: string): UpgradeSelection {
    if (runUpgradeQueue === null) {
      throw new Error('Simulation.selectUpgrade: run upgrades are not enabled');
    }
    if (runDirector !== null && runDirector.outcome !== 'running') {
      throw new Error('Simulation.selectUpgrade: run has ended');
    }
    const selection = runUpgradeQueue.select(id, clock.tick);
    applyUniversalStats();
    replayRecorder.recordUpgrade(selection);
    return selection;
  }

  function traitVisualState(): readonly TraitVisualAttachmentView[] {
    return traitRuntime?.visualState() ?? EMPTY_TRAIT_VISUALS;
  }

  function enemyPresentationRole(id: EntityId): RunEnemyRole {
    const slot = enemies.slotOf(id);
    return slot === -1
      ? RUN_ENEMY_ROLE.regular
      : enemyRoles[slot]! as RunEnemyRole;
  }

  function hash(): string {
    const writer = createHashWriter();
    writer.u32(CONFIG_VERSION);
    writer.str(configFingerprint);
    writer.str(runStartLoadoutFingerprint);
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
    writer.f32(weapon.damage);
    writer.u32(weapon.cooldownTicks);
    writer.f32(pickupAttractionRadius);
    writer.f32(pickupAttractionSpeed);
    writer.f64(xpGainMultiplier);
    writer.f32(traitDamageMultiplier);
    writer.f32(traitCooldownMultiplier);
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
          writer.u16(data.zoneDamageCooldown[slot]!);
          writer.u8(data.archetype[slot]!);
          writer.f32(data.xpDrop[slot]!);
          writer.u8(data.marked[slot]!);
          writer.u8(enemyBehavior.kind[slot]!);
          writer.u16(enemyBehavior.hostileShotCooldown[slot]!);
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

    // persistent damage zones
    {
      const data = zones.data;
      writer.u32(data.count);
      for (let slot = 0; slot < data.capacity; slot++) {
        writer.u8(data.alive[slot]!);
        writer.u16(data.generation[slot]!);
        if (data.alive[slot] === 1) {
          writer.f32(data.posX[slot]!);
          writer.f32(data.posY[slot]!);
          writer.f32(data.radius[slot]!);
          writer.f32(data.damage[slot]!);
          writer.u16(data.lifetime[slot]!);
          writer.u16(data.intervalTicks[slot]!);
          writer.u16(data.pulseCooldown[slot]!);
          writer.u8(data.tag[slot]!);
        }
      }
    }

    if (traitRuntime !== null) {
      writer.str(traitCatalogFingerprint!);
      writer.str(traitRuntime.hash());
    }

    if (runUpgradeQueue !== null) {
      writer.f64(runUpgradeQueue.queuedLevels);
      writer.f64(runUpgradeQueue.drainedLevels);
      writer.f64(runUpgradeQueue.selectionCount);
      writer.f64(runUpgradeQueue.essenceEarned);
      writer.f64(runUpgradeQueue.universalOfferCursor);
      writer.u32(runUpgradeQueue.universalSlotCapacity ?? 0);
      writer.u32(runUpgradeQueue.universalSlotsUsed ?? 0);
      writer.u32(runUpgradeQueue.pendingOfferCount);
      for (const offer of runUpgradeQueue.pendingOffers) {
        writer.str(offer.kind);
        writer.str(offer.id);
        switch (offer.kind) {
          case 'trait':
            writer.str(offer.traitId);
            writer.str(offer.resultStage);
            break;
          case 'universal':
            writer.str(offer.upgradeId);
            writer.f64(offer.currentRank);
            writer.f64(offer.nextRank);
            writer.f64(offer.maxRank);
            break;
          case 'essence':
            writer.f64(offer.amount);
            break;
        }
      }
      const universalState = runUpgradeQueue.universalState;
      if (universalState === null) {
        writer.u8(0);
      } else {
        writer.u8(1);
        writer.str(universalState.catalogFingerprint);
        writer.u32(universalState.ranks.length);
        for (const rank of universalState.ranks) writer.f64(rank);
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
    zones,
    grid,
    waveDirector,
    traitCatalogFingerprint,
    universalUpgradeCatalogFingerprint,
    runStartLoadoutFingerprint,
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
    get runEssenceEarned() {
      return runUpgradeQueue?.essenceEarned ?? 0;
    },
    get universalUpgradeRanks() {
      return runUpgradeQueue?.universalState?.ranks ?? EMPTY_UNIVERSAL_RANKS;
    },
    get universalUpgradeSlotCapacity() {
      return runUpgradeQueue?.universalSlotCapacity ?? 0;
    },
    get universalUpgradeSlotsUsed() {
      return runUpgradeQueue?.universalSlotsUsed ?? 0;
    },
    get pendingUpgradeOffers() {
      return runUpgradeQueue?.pendingOffers ?? EMPTY_RUN_OFFERS;
    },
    get upgradeSelectionPending() {
      return runUpgradeQueue?.blocked ?? false;
    },
    get traitPresentationEvents() {
      return traitPresentationEvents;
    },
    get xpLostToFullPickupPool() {
      return xpLostToFullPickupPool;
    },
    enemyPresentationRole,
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
  if (record.universalUpgradeCatalogFingerprint !== sim.universalUpgradeCatalogFingerprint) {
    throw new Error('runReplay: universal upgrade catalog fingerprint mismatch');
  }
  if (record.runContentFingerprint !== sim.runContentFingerprint) {
    throw new Error('runReplay: run content fingerprint mismatch');
  }
  if (record.runStartLoadoutFingerprint !== sim.runStartLoadoutFingerprint) {
    throw new Error('runReplay: run start loadout fingerprint mismatch');
  }
  let selectionIndex = 0;
  for (const input of record.inputs) {
    sim.step(input);
    while (
      selectionIndex < record.upgradeSelections.length &&
      record.upgradeSelections[selectionIndex]!.tick === sim.tick
    ) {
      const expectedSelection = record.upgradeSelections[selectionIndex]!;
      const appliedSelection = sim.selectUpgrade(expectedSelection.id);
      if (
        appliedSelection.kind !== expectedSelection.kind ||
        appliedSelection.id !== expectedSelection.id
      ) {
        throw new Error('runReplay: upgrade selection no longer matches the pending typed offer');
      }
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
