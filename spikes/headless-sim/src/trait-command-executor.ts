/**
 * Deterministic bridge from trait-runtime command buffers to simulation pools.
 *
 * This module deliberately depends on a small structural command interface,
 * not on the trait-runtime package itself. That keeps the accepted headless
 * simulation independently buildable while allowing TraitRuntime's Command and
 * CommandBuffer to satisfy these contracts without conversion or allocation.
 */
import {
  NO_ENTITY,
  type EnemyPool,
  type EntityId,
  type Pool,
  type ProjectilePool,
  type SpatialGrid,
  type ZonePool,
} from './types.js';
import { selectTarget } from './targeting.js';
import { zoneTagFromCommandTag } from './zones.js';

export interface TraitCombatCommand {
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
  /** Required by spawnZone; optional structurally while runtimes upgrade. */
  readonly durationTicks?: number;
  /** Optional for legacy zone templates; executor applies its configured default. */
  readonly intervalTicks?: number;
  /** Required by spawnZone: damage dealt once per scheduled zone pulse. */
  readonly amount?: number;
  readonly facing: number;
  readonly spread: number;
  readonly range: number;
  /** Required by spawnZone; mapped to a compact numeric pool role. */
  readonly tag?: string;
}

export interface TraitCommandSource {
  readonly length: number;
  at(index: number): TraitCombatCommand;
}

export interface TraitCommandExecutionContext {
  readonly tick: number;
  readonly moveDirX: number;
  readonly moveDirY: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly enemies: Pool<EnemyPool>;
  readonly projectiles: Pool<ProjectilePool>;
  /** Bounded persistent damaging-pad state owned by the simulation. */
  readonly zones: Pool<ZonePool>;
  readonly enemyGrid: SpatialGrid;
  /** Simulation-owned cleanup so direct trait damage preserves drops/boss state. */
  readonly killEnemy: (slot: number) => void;
}

export interface TraitCommandExecutorOptions {
  readonly defaultTargetRange: number;
  readonly clusterRadius: number;
  /** Authored trait speed 8 becomes 400 world units/second at the default 50. */
  readonly projectileSpeedUnit: number;
  readonly projectileLifetimeTicks: number;
  readonly projectileHitRadius: number;
  readonly projectilePierce: number;
  readonly maxBurstCount: number;
  /** Cadence used only by legacy spawnZone commands that omit intervalTicks. */
  readonly defaultZoneIntervalTicks: number;
}

export interface TraitCommandExecutionStats {
  commandsProcessed: number;
  projectileBursts: number;
  radialBursts: number;
  projectilesRequested: number;
  projectilesSpawned: number;
  projectilesRejected: number;
  zonesRequested: number;
  zonesSpawned: number;
  /** Newest zone request is rejected when the fixed pool is full; no eviction. */
  zonesRejected: number;
  burstsSkippedNoTarget: number;
  enemiesGathered: number;
  enemiesKnockedBack: number;
  areaDamageHits: number;
  enemiesKilled: number;
  telegraphs: number;
  traitCues: number;
  unsupportedCommands: number;
}

export interface TraitCommandExecutor {
  /** The returned stats object is reused and overwritten by the next call. */
  execute(source: TraitCommandSource, context: TraitCommandExecutionContext): TraitCommandExecutionStats;
}

const DEFAULT_OPTIONS: Readonly<TraitCommandExecutorOptions> = Object.freeze({
  defaultTargetRange: 350,
  clusterRadius: 60,
  projectileSpeedUnit: 50,
  projectileLifetimeTicks: 90,
  projectileHitRadius: 6,
  projectilePierce: 0,
  maxBurstCount: 512,
  defaultZoneIntervalTicks: 30,
});

const SUPPORTED_KINDS = new Set([
  'spawnProjectileBurst',
  'radialProjectileBurst',
  'areaGather',
  'areaKnockback',
  'applyAreaDamage',
  'spawnZone',
  'telegraph',
  'playTraitCue',
]);
/** These need state/pools not yet owned by the accepted simulation. */
export const REJECTED_TRAIT_COMMAND_KINDS = Object.freeze([
  'markTargets',
  'chainDamage',
  'meleeArc',
  'grantShield',
] as const);
const REJECTED_KINDS = new Set<string>(REJECTED_TRAIT_COMMAND_KINDS);
const MAX_FLOAT32 = 3.4028234663852886e38;

function finite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
}

function nonNegative(name: string, value: number): void {
  finite(name, value);
  if (value < 0) throw new RangeError(`${name} must be non-negative`);
}

function positive(name: string, value: number): void {
  finite(name, value);
  if (value <= 0) throw new RangeError(`${name} must be positive`);
}

function float32(name: string, value: number): void {
  finite(name, value);
  if (Math.abs(value) > MAX_FLOAT32) throw new RangeError(`${name} exceeds Float32 range`);
}

function validateOptions(options: TraitCommandExecutorOptions): void {
  positive('defaultTargetRange', options.defaultTargetRange);
  positive('clusterRadius', options.clusterRadius);
  positive('projectileSpeedUnit', options.projectileSpeedUnit);
  if (
    !Number.isSafeInteger(options.projectileLifetimeTicks) ||
    options.projectileLifetimeTicks < 1 ||
    options.projectileLifetimeTicks > 0xffff
  ) {
    throw new RangeError('projectileLifetimeTicks must be an integer in [1, 65535]');
  }
  positive('projectileHitRadius', options.projectileHitRadius);
  float32('projectileHitRadius', options.projectileHitRadius);
  if (!Number.isSafeInteger(options.projectilePierce) || options.projectilePierce < 0 || options.projectilePierce > 255) {
    throw new RangeError('projectilePierce must be an integer in [0, 255]');
  }
  if (!Number.isSafeInteger(options.maxBurstCount) || options.maxBurstCount < 1) {
    throw new RangeError('maxBurstCount must be a positive safe integer');
  }
  if (
    !Number.isSafeInteger(options.defaultZoneIntervalTicks) ||
    options.defaultZoneIntervalTicks < 1 ||
    options.defaultZoneIntervalTicks > 0xffff
  ) {
    throw new RangeError('defaultZoneIntervalTicks must be an integer in [1, 65535]');
  }
}

function validateContext(context: TraitCommandExecutionContext): void {
  if (!Number.isSafeInteger(context.tick) || context.tick < 0) {
    throw new RangeError('execution tick must be a non-negative safe integer');
  }
  finite('moveDirX', context.moveDirX);
  finite('moveDirY', context.moveDirY);
  positive('worldWidth', context.worldWidth);
  positive('worldHeight', context.worldHeight);
  float32('worldWidth', context.worldWidth);
  float32('worldHeight', context.worldHeight);
}

function validateCommand(
  command: TraitCombatCommand,
  tick: number,
  options: TraitCommandExecutorOptions,
): void {
  if (!Number.isSafeInteger(command.tick) || command.tick !== tick) {
    throw new RangeError(`trait command tick ${command.tick} does not match execution tick ${tick}`);
  }
  float32('command.originX', command.originX);
  float32('command.originY', command.originY);
  if (REJECTED_KINDS.has(command.kind)) {
    throw new Error(`trait command kind requires unsupported simulation state: ${command.kind}`);
  }
  if (!SUPPORTED_KINDS.has(command.kind)) return;

  switch (command.kind) {
    case 'spawnProjectileBurst':
    case 'radialProjectileBurst':
      if (!Number.isSafeInteger(command.count) || command.count < 1 || command.count > options.maxBurstCount) {
        throw new RangeError(`command.count must be an integer in [1, ${options.maxBurstCount}]`);
      }
      nonNegative('command.damage', command.damage);
      float32('command.damage', command.damage);
      nonNegative('command.speed', command.speed);
      float32('derived projectile speed', command.speed * options.projectileSpeedUnit);
      nonNegative('command.range', command.range);
      finite('command.spread', command.spread);
      finite('command.facing', command.facing);
      finite('command.dirX', command.dirX);
      finite('command.dirY', command.dirY);
      break;
    case 'areaGather':
    case 'areaKnockback':
      nonNegative('command.radius', command.radius);
      nonNegative('command.strength', command.strength);
      break;
    case 'applyAreaDamage':
      nonNegative('command.radius', command.radius);
      nonNegative('command.damage', command.damage);
      float32('command.damage', command.damage);
      break;
    case 'spawnZone': {
      positive('command.radius', command.radius);
      float32('command.radius', command.radius);
      if (command.amount === undefined) {
        throw new TypeError('spawnZone command.amount is required');
      }
      nonNegative('command.amount', command.amount);
      float32('command.amount', command.amount);
      const durationTicks = command.durationTicks;
      if (
        durationTicks === undefined ||
        !Number.isSafeInteger(durationTicks) ||
        durationTicks < 1 ||
        durationTicks > 0xffff
      ) {
        throw new RangeError('spawnZone command.durationTicks must be an integer in [1, 65535]');
      }
      if (
        command.intervalTicks !== undefined &&
        (!Number.isSafeInteger(command.intervalTicks) || command.intervalTicks < 1 || command.intervalTicks > 0xffff)
      ) {
        throw new RangeError('spawnZone command.intervalTicks must be an integer in [1, 65535] when provided');
      }
      if (typeof command.tag !== 'string' || zoneTagFromCommandTag(command.tag) === null) {
        throw new RangeError(`unsupported spawnZone tag: ${String(command.tag)}`);
      }
      break;
    }
  }
}

function resetStats(stats: TraitCommandExecutionStats): void {
  stats.commandsProcessed = 0;
  stats.projectileBursts = 0;
  stats.radialBursts = 0;
  stats.projectilesRequested = 0;
  stats.projectilesSpawned = 0;
  stats.projectilesRejected = 0;
  stats.zonesRequested = 0;
  stats.zonesSpawned = 0;
  stats.zonesRejected = 0;
  stats.burstsSkippedNoTarget = 0;
  stats.enemiesGathered = 0;
  stats.enemiesKnockedBack = 0;
  stats.areaDamageHits = 0;
  stats.enemiesKilled = 0;
  stats.telegraphs = 0;
  stats.traitCues = 0;
  stats.unsupportedCommands = 0;
}

function spawnProjectile(
  pool: Pool<ProjectilePool>,
  command: TraitCombatCommand,
  options: TraitCommandExecutorOptions,
  dirX: number,
  dirY: number,
): boolean {
  const length = Math.sqrt(dirX * dirX + dirY * dirY);
  if (length <= 1e-9) return false;
  const velocity = command.speed * options.projectileSpeedUnit;
  if (!Number.isFinite(velocity) || velocity > MAX_FLOAT32) return false;
  const slot = pool.spawn();
  if (slot < 0) return false;
  const inverseLength = 1 / length;
  const data = pool.data;
  data.posX[slot] = command.originX;
  data.posY[slot] = command.originY;
  data.velX[slot] = dirX * inverseLength * velocity;
  data.velY[slot] = dirY * inverseLength * velocity;
  data.damage[slot] = command.damage;
  data.lifetime[slot] = options.projectileLifetimeTicks;
  data.hitRadius[slot] = options.projectileHitRadius;
  data.pierce[slot] = options.projectilePierce;
  data.faction[slot] = 0;
  return true;
}

function targetingPolicy(value: string): 'nearest' | 'highestHealth' | 'densestCluster' | 'markedThenNearest' | 'rearThreat' {
  switch (value) {
    case 'highestHealth': return 'highestHealth';
    case 'densestCluster': return 'densestCluster';
    case 'marked': return 'markedThenNearest';
    case 'rearThreat': return 'rearThreat';
    default: return 'nearest';
  }
}

function executeDirectedBurst(
  command: TraitCombatCommand,
  context: TraitCommandExecutionContext,
  options: TraitCommandExecutorOptions,
  stats: TraitCommandExecutionStats,
): void {
  let baseX = command.dirX;
  let baseY = command.dirY;
  if (command.targeting !== 'none') {
    const target: EntityId = selectTarget(
      targetingPolicy(command.targeting),
      {
        originX: command.originX,
        originY: command.originY,
        range: command.range > 0 ? command.range : options.defaultTargetRange,
        moveDirX: context.moveDirX,
        moveDirY: context.moveDirY,
      },
      context.enemies,
      context.enemyGrid,
      options.clusterRadius,
    );
    if (target === NO_ENTITY) {
      stats.burstsSkippedNoTarget++;
      return;
    }
    const targetSlot = context.enemies.slotOf(target);
    if (targetSlot < 0) {
      stats.burstsSkippedNoTarget++;
      return;
    }
    baseX = context.enemies.data.posX[targetSlot]! - command.originX;
    baseY = context.enemies.data.posY[targetSlot]! - command.originY;
  }

  const baseAngle = Math.atan2(baseY, baseX);
  stats.projectilesRequested += command.count;
  for (let index = 0; index < command.count; index++) {
    const offset = command.count === 1
      ? 0
      : -command.spread / 2 + command.spread * index / (command.count - 1);
    const angle = baseAngle + offset;
    if (spawnProjectile(context.projectiles, command, options, Math.cos(angle), Math.sin(angle))) {
      stats.projectilesSpawned++;
    } else {
      stats.projectilesRejected++;
    }
  }
}

function executeRadialBurst(
  command: TraitCombatCommand,
  context: TraitCommandExecutionContext,
  options: TraitCommandExecutorOptions,
  stats: TraitCommandExecutionStats,
): void {
  stats.projectilesRequested += command.count;
  for (let index = 0; index < command.count; index++) {
    const angle = command.facing + Math.PI * 2 * index / command.count;
    if (spawnProjectile(context.projectiles, command, options, Math.cos(angle), Math.sin(angle))) {
      stats.projectilesSpawned++;
    } else {
      stats.projectilesRejected++;
    }
  }
}

function executeAreaMove(
  command: TraitCombatCommand,
  context: TraitCommandExecutionContext,
  scratch: EntityId[],
  gather: boolean,
): number {
  const count = context.enemyGrid.queryRadius(command.originX, command.originY, command.radius, scratch);
  let moved = 0;
  for (let index = 0; index < count; index++) {
    const slot = context.enemies.slotOf(scratch[index]!);
    if (slot < 0) continue;
    const data = context.enemies.data;
    const dx = data.posX[slot]! - command.originX;
    const dy = data.posY[slot]! - command.originY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance <= 1e-9) continue;
    const displacement = gather ? Math.min(command.strength, distance) : command.strength;
    const direction = gather ? -1 : 1;
    const x = Math.min(context.worldWidth, Math.max(0, data.posX[slot]! + direction * dx / distance * displacement));
    const y = Math.min(context.worldHeight, Math.max(0, data.posY[slot]! + direction * dy / distance * displacement));
    data.posX[slot] = x;
    data.posY[slot] = y;
    data.velX[slot] = 0;
    data.velY[slot] = 0;
    context.enemyGrid.update(
      context.enemies.idOf(slot),
      data.posX[slot]!,
      data.posY[slot]!,
    );
    moved++;
  }
  return moved;
}

function executeAreaDamage(
  command: TraitCombatCommand,
  context: TraitCommandExecutionContext,
  scratch: EntityId[],
  stats: TraitCommandExecutionStats,
): void {
  const count = context.enemyGrid.queryRadius(command.originX, command.originY, command.radius, scratch);
  for (let index = 0; index < count; index++) {
    const slot = context.enemies.slotOf(scratch[index]!);
    if (slot < 0) continue;
    context.enemies.data.hp[slot] = context.enemies.data.hp[slot]! - command.damage;
    stats.areaDamageHits++;
    if (context.enemies.data.hp[slot]! <= 0) {
      context.killEnemy(slot);
      stats.enemiesKilled++;
    }
  }
}

/**
 * Adds one stationary, damaging pad. The pool deliberately never evicts a
 * live zone: source-order requests beyond capacity are rejected as the newest
 * requests, which is deterministic and visible in stats.
 */
function executeSpawnZone(
  command: TraitCombatCommand,
  context: TraitCommandExecutionContext,
  options: TraitCommandExecutorOptions,
  stats: TraitCommandExecutionStats,
): void {
  stats.zonesRequested++;
  const slot = context.zones.spawn();
  if (slot < 0) {
    stats.zonesRejected++;
    return;
  }
  const tag = zoneTagFromCommandTag(command.tag!);
  // The full batch was validated before mutation, so a null tag cannot occur.
  if (tag === null || command.amount === undefined || command.durationTicks === undefined) {
    throw new Error('validated spawnZone command lost required data');
  }
  const data = context.zones.data;
  data.posX[slot] = command.originX;
  data.posY[slot] = command.originY;
  data.radius[slot] = command.radius;
  data.damage[slot] = command.amount;
  data.lifetime[slot] = command.durationTicks;
  data.intervalTicks[slot] = command.intervalTicks ?? options.defaultZoneIntervalTicks;
  // Zero means pulse on the immediate following zone step.
  data.pulseCooldown[slot] = 0;
  data.tag[slot] = tag;
  stats.zonesSpawned++;
}

export function createTraitCommandExecutor(
  overrides: Partial<TraitCommandExecutorOptions> = {},
): TraitCommandExecutor {
  const options: TraitCommandExecutorOptions = { ...DEFAULT_OPTIONS, ...overrides };
  validateOptions(options);
  const scratch: EntityId[] = [];
  const validatedCommands: TraitCombatCommand[] = [];
  const stats: TraitCommandExecutionStats = {
    commandsProcessed: 0,
    projectileBursts: 0,
    radialBursts: 0,
    projectilesRequested: 0,
    projectilesSpawned: 0,
    projectilesRejected: 0,
    zonesRequested: 0,
    zonesSpawned: 0,
    zonesRejected: 0,
    burstsSkippedNoTarget: 0,
    enemiesGathered: 0,
    enemiesKnockedBack: 0,
    areaDamageHits: 0,
    enemiesKilled: 0,
    telegraphs: 0,
    traitCues: 0,
    unsupportedCommands: 0,
  };

  return {
    execute(source, context) {
      validateContext(context);
      if (!Number.isSafeInteger(source.length) || source.length < 0) {
        throw new RangeError('command source length must be a non-negative safe integer');
      }
      // Validate the complete batch before mutating pools, preserving atomicity
      // for malformed integration input.
      for (let index = 0; index < source.length; index++) {
        const command = source.at(index);
        validateCommand(command, context.tick, options);
        validatedCommands[index] = command;
      }
      validatedCommands.length = source.length;

      resetStats(stats);
      for (let index = 0; index < source.length; index++) {
        const command = validatedCommands[index]!;
        stats.commandsProcessed++;
        switch (command.kind) {
          case 'spawnProjectileBurst':
            stats.projectileBursts++;
            executeDirectedBurst(command, context, options, stats);
            break;
          case 'radialProjectileBurst':
            stats.radialBursts++;
            executeRadialBurst(command, context, options, stats);
            break;
          case 'areaGather':
            stats.enemiesGathered += executeAreaMove(command, context, scratch, true);
            break;
          case 'areaKnockback':
            stats.enemiesKnockedBack += executeAreaMove(command, context, scratch, false);
            break;
          case 'applyAreaDamage':
            executeAreaDamage(command, context, scratch, stats);
            break;
          case 'spawnZone':
            executeSpawnZone(command, context, options, stats);
            break;
          case 'telegraph':
            stats.telegraphs++;
            break;
          case 'playTraitCue':
            stats.traitCues++;
            break;
          default:
            stats.unsupportedCommands++;
            break;
        }
      }
      return stats;
    },
  };
}
