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
import { selectPriorityTarget, selectTarget } from './targeting.js';
import { zoneTagFromCommandTag } from './zones.js';
import {
  COMBAT_DAMAGE_SOURCE,
  type CombatDamageResolver,
  type ResolvedOutgoingDamage,
} from './combat-resolution.js';

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
  /** Directional melee sweep width in radians. */
  readonly arc?: number;
  /** Additional unique enemies after the initial chain-lightning strike. */
  readonly jumps?: number;
  /** Additional enemies a projectile may hit after its first collision. */
  readonly pierce?: number;
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
  /**
   * Shared V1.1 damage authority. Omitted only for legacy isolated executor
   * tests; production simulation always supplies it so all trait attacks can
   * crit and emit truthful resolved-hit events.
   */
  readonly combat?: CombatDamageResolver;
  /** Greg's V1.1 Melee Affinity; only tagged close-range attack sources use it. */
  readonly meleeDamageMultiplier?: number;
  /**
   * Presentation-only observer for actual chain victims. Coordinates are sent
   * before damage cleanup so a fatal strike still has a renderable endpoint.
   */
  readonly onChainDamageHit?: (
    commandIndex: number,
    hitIndex: number,
    x: number,
    y: number,
  ) => void;
  /**
   * Presentation-only observer for actual orbit/contact victims. Both the
   * companion position and the victim position are reported before a lethal
   * cleanup so the renderer can show a truthful contact spark instead of a
   * cosmetic pulse that implies damage.
   */
  readonly onOrbitingDamageHit?: (
    commandIndex: number,
    hitIndex: number,
    flyX: number,
    flyY: number,
    targetX: number,
    targetY: number,
  ) => void;
  /** Presentation-only direction resolved from a successful melee acquisition. */
  readonly onMeleeArcResolved?: (
    commandIndex: number,
    dirX: number,
    dirY: number,
  ) => void;
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
  /** Chain commands may hit at most maxChainJumps + 1 distinct enemies. */
  readonly maxChainJumps: number;
  /** Cadence used only by legacy spawnZone commands that omit intervalTicks. */
  readonly defaultZoneIntervalTicks: number;
}

export interface TraitCommandExecutionStats {
  commandsProcessed: number;
  projectileBursts: number;
  radialBursts: number;
  orbitingDamageCommands: number;
  orbitingDamageHits: number;
  projectilesRequested: number;
  projectilesSpawned: number;
  projectilesRejected: number;
  zonesRequested: number;
  zonesSpawned: number;
  /** Newest zone request is rejected when the fixed pool is full; no eviction. */
  zonesRejected: number;
  burstsSkippedNoTarget: number;
  meleeArcCommands: number;
  meleeArcHits: number;
  meleeArcsSkippedNoTarget: number;
  chainDamageCommands: number;
  /** Total immediate chain victims, including the first acquired target. */
  chainDamageHits: number;
  chainsSkippedNoTarget: number;
  enemiesGathered: number;
  enemiesKnockedBack: number;
  areaDamageHits: number;
  markTargetsCommands: number;
  markedTargets: number;
  enemiesKilled: number;
  telegraphs: number;
  traitCues: number;
  shieldGrants: number;
  unsupportedCommands: number;
}

export interface TraitCommandExecutor {
  /** The returned stats object is reused and overwritten by the next call. */
  execute(source: TraitCommandSource, context: TraitCommandExecutionContext): TraitCommandExecutionStats;
}

/**
 * Combat and presentation share this bound: seven extra hops plus the first
 * strike fit the fixed eight-endpoint presentation event without silently
 * hiding authoritative damage from the player.
 */
export const MAX_CHAIN_JUMPS = 7;
/** Fixed work bound for one orbit/contact pulse. */
export const MAX_ORBITING_DAMAGE_COUNT = 16;

const DEFAULT_OPTIONS: Readonly<TraitCommandExecutorOptions> = Object.freeze({
  defaultTargetRange: 350,
  clusterRadius: 60,
  projectileSpeedUnit: 50,
  projectileLifetimeTicks: 90,
  projectileHitRadius: 6,
  projectilePierce: 0,
  maxBurstCount: 512,
  maxChainJumps: MAX_CHAIN_JUMPS,
  defaultZoneIntervalTicks: 30,
});

const SUPPORTED_KINDS = new Set([
  'spawnProjectileBurst',
  'radialProjectileBurst',
  'orbitingDamage',
  'areaGather',
  'areaKnockback',
  'applyAreaDamage',
  'spawnZone',
  'markTargets',
  'chainDamage',
  'meleeArc',
  'grantShield',
  'telegraph',
  'playTraitCue',
]);
/** Kept for contract compatibility; all known command kinds now have a path. */
export const REJECTED_TRAIT_COMMAND_KINDS = Object.freeze([] as const);
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
  if (!Number.isSafeInteger(options.maxChainJumps) || options.maxChainJumps < 0 || options.maxChainJumps > MAX_CHAIN_JUMPS) {
    throw new RangeError(`maxChainJumps must be an integer in [0, ${MAX_CHAIN_JUMPS}]`);
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
      if (command.pierce !== undefined && (!Number.isSafeInteger(command.pierce) || command.pierce < 0 || command.pierce > 255)) {
        throw new RangeError('command.pierce must be an integer in [0, 255]');
      }
      break;
    case 'orbitingDamage':
      if (!Number.isSafeInteger(command.count) || command.count < 1 || command.count > MAX_ORBITING_DAMAGE_COUNT) {
        throw new RangeError(`command.count must be an integer in [1, ${MAX_ORBITING_DAMAGE_COUNT}] for orbitingDamage`);
      }
      nonNegative('command.damage', command.damage);
      float32('command.damage', command.damage);
      positive('command.radius', command.radius);
      float32('command.radius', command.radius);
      positive('command.range', command.range);
      float32('command.range', command.range);
      positive('command.speed', command.speed);
      float32('command.speed', command.speed);
      finite('command.facing', command.facing);
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
    case 'meleeArc': {
      const arc = command.arc;
      if (!(typeof arc === 'number' && Number.isFinite(arc) && arc > 0 && arc <= Math.PI * 2)) {
        throw new RangeError('command.arc must be finite and in (0, 2π] for meleeArc');
      }
      positive('command.range', command.range);
      float32('command.range', command.range);
      nonNegative('command.damage', command.damage);
      float32('command.damage', command.damage);
      break;
    }
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
    case 'chainDamage': {
      const jumps = command.jumps ?? 0;
      if (!Number.isSafeInteger(jumps) || jumps < 0 || jumps > options.maxChainJumps) {
        throw new RangeError(`command.jumps must be an integer in [0, ${options.maxChainJumps}]`);
      }
      nonNegative('command.damage', command.damage);
      float32('command.damage', command.damage);
      positive('command.range', command.range);
      float32('command.range', command.range);
      break;
    }
    case 'markTargets':
      if (!Number.isSafeInteger(command.count) || command.count < 1 || command.count > options.maxBurstCount) {
        throw new RangeError(`command.count must be an integer in [1, ${options.maxBurstCount}] for markTargets`);
      }
      positive('command.radius', command.radius);
      float32('command.radius', command.radius);
      if (typeof command.tag !== 'string' || command.tag.length === 0) {
        throw new RangeError('markTargets command.tag must be a non-empty string');
      }
      break;
    case 'grantShield':
      if (command.amount === undefined) {
        throw new TypeError('grantShield command.amount is required');
      }
      nonNegative('command.amount', command.amount);
      float32('command.amount', command.amount);
      break;
  }
}

function resetStats(stats: TraitCommandExecutionStats): void {
  stats.commandsProcessed = 0;
  stats.projectileBursts = 0;
  stats.radialBursts = 0;
  stats.orbitingDamageCommands = 0;
  stats.orbitingDamageHits = 0;
  stats.projectilesRequested = 0;
  stats.projectilesSpawned = 0;
  stats.projectilesRejected = 0;
  stats.zonesRequested = 0;
  stats.zonesSpawned = 0;
  stats.zonesRejected = 0;
  stats.burstsSkippedNoTarget = 0;
  stats.meleeArcCommands = 0;
  stats.meleeArcHits = 0;
  stats.meleeArcsSkippedNoTarget = 0;
  stats.chainDamageCommands = 0;
  stats.chainDamageHits = 0;
  stats.chainsSkippedNoTarget = 0;
  stats.enemiesGathered = 0;
  stats.enemiesKnockedBack = 0;
  stats.areaDamageHits = 0;
  stats.markTargetsCommands = 0;
  stats.markedTargets = 0;
  stats.enemiesKilled = 0;
  stats.telegraphs = 0;
  stats.traitCues = 0;
  stats.shieldGrants = 0;
  stats.unsupportedCommands = 0;
}

function spawnProjectile(
  pool: Pool<ProjectilePool>,
  command: TraitCombatCommand,
  options: TraitCommandExecutorOptions,
  dirX: number,
  dirY: number,
  damage: ResolvedOutgoingDamage,
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
  data.damage[slot] = damage.amount;
  data.lifetime[slot] = options.projectileLifetimeTicks;
  data.hitRadius[slot] = options.projectileHitRadius;
  data.pierce[slot] = command.pierce ?? options.projectilePierce;
  data.faction[slot] = 0;
  data.critical[slot] = damage.critical ? 1 : 0;
  data.source[slot] = COMBAT_DAMAGE_SOURCE.traitProjectile;
  return true;
}

function resolveOutgoingDamage(
  context: TraitCommandExecutionContext,
  damage: number,
  sourceId: string,
): ResolvedOutgoingDamage {
  const meleeSources = sourceId === 'mantis-scythes'
    || sourceId === 'crab-pincers'
    || sourceId === 'razorstep-chimera'
    || sourceId === 'meteor-mauler';
  const affinity = meleeSources
    ? Math.max(0, context.meleeDamageMultiplier ?? 1)
    : 1;
  const adjustedDamage = damage * affinity;
  return context.combat?.resolveOutgoingDamage(adjustedDamage, sourceId)
    ?? { amount: adjustedDamage, critical: false };
}

function applyEnemyDamage(
  context: TraitCommandExecutionContext,
  slot: number,
  damage: ResolvedOutgoingDamage,
  sourceId: string,
): boolean {
  if (context.combat !== undefined) {
    return context.combat.damageEnemy(context.enemies, slot, damage, sourceId);
  }
  context.enemies.data.hp[slot] = context.enemies.data.hp[slot]! - damage.amount;
  return context.enemies.data.hp[slot]! <= 0;
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
    const target: EntityId = selectPriorityTarget(
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
  const resolvedDamage = resolveOutgoingDamage(context, command.damage, command.sourceId);
  stats.projectilesRequested += command.count;
  for (let index = 0; index < command.count; index++) {
    const offset = command.count === 1
      ? 0
      : -command.spread / 2 + command.spread * index / (command.count - 1);
    const angle = baseAngle + offset;
    if (spawnProjectile(context.projectiles, command, options, Math.cos(angle), Math.sin(angle), resolvedDamage)) {
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
  const resolvedDamage = resolveOutgoingDamage(context, command.damage, command.sourceId);
  stats.projectilesRequested += command.count;
  for (let index = 0; index < command.count; index++) {
    const angle = command.facing + Math.PI * 2 * index / command.count;
    if (spawnProjectile(context.projectiles, command, options, Math.cos(angle), Math.sin(angle), resolvedDamage)) {
      stats.projectilesSpawned++;
    } else {
      stats.projectilesRejected++;
    }
  }
}

/** Select the nearest live enemy to one deterministic firefly position. */
function selectOrbitContact(
  x: number,
  y: number,
  range: number,
  context: TraitCommandExecutionContext,
  scratch: EntityId[],
  visited: readonly EntityId[],
): EntityId {
  const count = context.enemyGrid.queryRadius(x, y, range, scratch);
  let bestId = NO_ENTITY;
  let bestDistanceSq = Infinity;
  for (let index = 0; index < count; index++) {
    const id = scratch[index]!;
    if (hasVisited(visited, id)) continue;
    const slot = context.enemies.slotOf(id);
    if (slot < 0) continue;
    const dx = context.enemies.data.posX[slot]! - x;
    const dy = context.enemies.data.posY[slot]! - y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < bestDistanceSq || (distanceSq === bestDistanceSq && (bestId === NO_ENTITY || id < bestId))) {
      bestId = id;
      bestDistanceSq = distanceSq;
    }
  }
  return bestId;
}

/**
 * Resolves a pure orbit/contact pulse. Firefly positions are derived from the
 * authoritative command tick, so there is no companion state to serialize or
 * synchronize. Each pulse may hit an enemy once at most, even when multiple
 * fireflies overlap the same target.
 */
function executeOrbitingDamage(
  command: TraitCombatCommand,
  commandIndex: number,
  context: TraitCommandExecutionContext,
  scratch: EntityId[],
  visited: EntityId[],
  stats: TraitCommandExecutionStats,
): void {
  visited.length = 0;
  const resolvedDamage = resolveOutgoingDamage(context, command.damage, command.sourceId);
  const angularStep = Math.PI * 2 / command.count;
  const angularTick = (command.speed % (Math.PI * 2)) * (command.tick % 1_000_000);
  const baseAngle = command.facing + angularTick;
  for (let index = 0; index < command.count; index++) {
    const angle = baseAngle + angularStep * index;
    const flyX = command.originX + Math.cos(angle) * command.radius;
    const flyY = command.originY + Math.sin(angle) * command.radius;
    const target = selectOrbitContact(flyX, flyY, command.range, context, scratch, visited);
    if (target === NO_ENTITY) continue;
    const slot = context.enemies.slotOf(target);
    if (slot < 0) continue;
    visited.push(target);
    context.onOrbitingDamageHit?.(
      commandIndex,
      stats.orbitingDamageHits,
      flyX,
      flyY,
      context.enemies.data.posX[slot]!,
      context.enemies.data.posY[slot]!,
    );
    const killed = applyEnemyDamage(context, slot, resolvedDamage, command.sourceId);
    stats.orbitingDamageHits++;
    if (killed) {
      context.killEnemy(slot);
      stats.enemiesKilled++;
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
  const resolvedDamage = resolveOutgoingDamage(context, command.damage, command.sourceId);
  const count = context.enemyGrid.queryRadius(command.originX, command.originY, command.radius, scratch);
  for (let index = 0; index < count; index++) {
    const slot = context.enemies.slotOf(scratch[index]!);
    if (slot < 0) continue;
    const killed = applyEnemyDamage(context, slot, resolvedDamage, command.sourceId);
    stats.areaDamageHits++;
    if (killed) {
      context.killEnemy(slot);
      stats.enemiesKilled++;
    }
  }
}

/**
 * Resolves a targeted cleave direction before applying a deterministic sector
 * query. Targeted arcs select their anchor inside authored range; untargeted
 * future commands retain a sensible authored/facing/+X fallback.
 */
function executeMeleeArc(
  command: TraitCombatCommand,
  commandIndex: number,
  context: TraitCommandExecutionContext,
  options: TraitCommandExecutorOptions,
  scratch: EntityId[],
  stats: TraitCommandExecutionStats,
): void {
  let dirX = 0;
  let dirY = 0;
  let hasDirection = false;
  if (command.targeting !== 'none') {
    const target = selectPriorityTarget(
      targetingPolicy(command.targeting),
      {
        originX: command.originX,
        originY: command.originY,
        range: command.range,
        moveDirX: context.moveDirX,
        moveDirY: context.moveDirY,
      },
      context.enemies,
      context.enemyGrid,
      options.clusterRadius,
    );
    if (target === NO_ENTITY) {
      stats.meleeArcsSkippedNoTarget++;
      return;
    }
    const targetSlot = context.enemies.slotOf(target);
    if (targetSlot < 0) {
      stats.meleeArcsSkippedNoTarget++;
      return;
    }
    const towardX = context.enemies.data.posX[targetSlot]! - command.originX;
    const towardY = context.enemies.data.posY[targetSlot]! - command.originY;
    const length = Math.sqrt(towardX * towardX + towardY * towardY);
    if (length > 1e-9) {
      dirX = towardX / length;
      dirY = towardY / length;
      hasDirection = true;
    }
  }
  if (!hasDirection) {
    const length = Math.sqrt(command.dirX * command.dirX + command.dirY * command.dirY);
    if (length > 1e-9) {
      dirX = command.dirX / length;
      dirY = command.dirY / length;
      hasDirection = true;
    }
  }
  if (!hasDirection) {
    const facingX = Math.cos(command.facing);
    const facingY = Math.sin(command.facing);
    const length = Math.sqrt(facingX * facingX + facingY * facingY);
    if (length > 1e-9) {
      dirX = facingX / length;
      dirY = facingY / length;
      hasDirection = true;
    }
  }
  // A finite zero facing gives (+X, 0); retain this final fallback for hostile
  // structural inputs where all authored direction sources were non-finite.
  if (!hasDirection) {
    dirX = 1;
    dirY = 0;
  }
  context.onMeleeArcResolved?.(commandIndex, dirX, dirY);
  const resolvedDamage = resolveOutgoingDamage(context, command.damage, command.sourceId);
  const cosHalfArc = Math.cos(command.arc! / 2);
  const count = context.enemyGrid.queryRadius(command.originX, command.originY, command.range, scratch);
  for (let index = 0; index < count; index++) {
    const slot = context.enemies.slotOf(scratch[index]!);
    if (slot < 0) continue;
    const dx = context.enemies.data.posX[slot]! - command.originX;
    const dy = context.enemies.data.posY[slot]! - command.originY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 1e-9 && (dx * dirX + dy * dirY) / distance < cosHalfArc) continue;
    const killed = applyEnemyDamage(context, slot, resolvedDamage, command.sourceId);
    stats.meleeArcHits++;
    if (killed) {
      context.killEnemy(slot);
      stats.enemiesKilled++;
    }
  }
}

function hasVisited(visited: readonly EntityId[], id: EntityId): boolean {
  for (let index = 0; index < visited.length; index++) {
    if (visited[index] === id) return true;
  }
  return false;
}

/**
 * Pick the closest live, unvisited enemy around the most recent strike.
 * queryRadius returns sorted ids, but tie-breaking remains explicit here so
 * every SpatialGrid implementation has the same deterministic contract.
 */
function selectChainHop(
  x: number,
  y: number,
  range: number,
  context: TraitCommandExecutionContext,
  scratch: EntityId[],
  visited: readonly EntityId[],
): EntityId {
  const count = context.enemyGrid.queryRadius(x, y, range, scratch);
  let bestId = NO_ENTITY;
  let bestDistanceSq = Infinity;
  for (let index = 0; index < count; index++) {
    const id = scratch[index]!;
    if (hasVisited(visited, id)) continue;
    const slot = context.enemies.slotOf(id);
    if (slot < 0) continue;
    const dx = context.enemies.data.posX[slot]! - x;
    const dy = context.enemies.data.posY[slot]! - y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < bestDistanceSq || (distanceSq === bestDistanceSq && (bestId === NO_ENTITY || id < bestId))) {
      bestId = id;
      bestDistanceSq = distanceSq;
    }
  }
  return bestId;
}

/**
 * Resolves an instantaneous, never-miss chain. First acquisition uses the
 * normal nearby-target selector; every following hop originates at the prior
 * victim. Victims are recorded before kill cleanup and can never repeat.
 */
function executeChainDamage(
  command: TraitCombatCommand,
  commandIndex: number,
  context: TraitCommandExecutionContext,
  options: TraitCommandExecutorOptions,
  scratch: EntityId[],
  visited: EntityId[],
  stats: TraitCommandExecutionStats,
): void {
  const initial = selectPriorityTarget(
    targetingPolicy(command.targeting),
    {
      originX: command.originX,
      originY: command.originY,
      range: options.defaultTargetRange,
      moveDirX: context.moveDirX,
      moveDirY: context.moveDirY,
    },
    context.enemies,
    context.enemyGrid,
    options.clusterRadius,
  );
  if (initial === NO_ENTITY) {
    stats.chainsSkippedNoTarget++;
    return;
  }

  visited.length = 0;
  const resolvedDamage = resolveOutgoingDamage(context, command.damage, command.sourceId);
  let target = initial;
  const maximumHits = (command.jumps ?? 0) + 1;
  for (let hitIndex = 0; hitIndex < maximumHits; hitIndex++) {
    const slot = context.enemies.slotOf(target);
    if (slot < 0) break;
    // Preserve the victim position before cleanup removes a lethal target from
    // the spatial grid; this same coordinate is the next hop's origin.
    const x = context.enemies.data.posX[slot]!;
    const y = context.enemies.data.posY[slot]!;
    visited.push(target);
    context.onChainDamageHit?.(commandIndex, hitIndex, x, y);
    const killed = applyEnemyDamage(context, slot, resolvedDamage, command.sourceId);
    stats.chainDamageHits++;
    if (killed) {
      context.killEnemy(slot);
      stats.enemiesKilled++;
    }
    if (hitIndex + 1 >= maximumHits) break;
    target = selectChainHop(x, y, command.range, context, scratch, visited);
    if (target === NO_ENTITY) break;
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
  const resolvedDamage = resolveOutgoingDamage(context, command.amount, command.sourceId);
  data.damage[slot] = resolvedDamage.amount;
  data.lifetime[slot] = command.durationTicks;
  data.intervalTicks[slot] = command.intervalTicks ?? options.defaultZoneIntervalTicks;
  // Zero means pulse on the immediate following zone step.
  data.pulseCooldown[slot] = 0;
  data.tag[slot] = tag;
  data.critical[slot] = resolvedDamage.critical ? 1 : 0;
  data.source[slot] = COMBAT_DAMAGE_SOURCE.traitZone;
  stats.zonesSpawned++;
}

function executeGrantShield(
  command: TraitCombatCommand,
  context: TraitCommandExecutionContext,
  stats: TraitCommandExecutionStats,
): void {
  if (context.combat === undefined || command.amount === undefined) {
    throw new Error('grantShield requires the simulation combat resolver');
  }
  context.combat.grantShield(command.amount, command.sourceId);
  stats.shieldGrants++;
}

/**
 * Marks a deterministic cluster around the selected anchor. Marks are a
 * simulation-owned byte on each enemy, so marked targeting participates in
 * hashes/replays without a second status pool. A mark persists until that
 * enemy leaves the pool; future status expiry can be added without changing
 * the command vocabulary.
 */
function executeMarkTargets(
  command: TraitCombatCommand,
  context: TraitCommandExecutionContext,
  scratch: EntityId[],
  stats: TraitCommandExecutionStats,
): void {
  const anchor = selectTarget(
    targetingPolicy(command.targeting),
    {
      originX: command.originX,
      originY: command.originY,
      range: Math.max(command.radius, DEFAULT_OPTIONS.defaultTargetRange),
      moveDirX: context.moveDirX,
      moveDirY: context.moveDirY,
    },
    context.enemies,
    context.enemyGrid,
    DEFAULT_OPTIONS.clusterRadius,
  );
  if (anchor === NO_ENTITY) return;
  const anchorSlot = context.enemies.slotOf(anchor);
  if (anchorSlot < 0) return;
  const count = context.enemyGrid.queryRadius(
    context.enemies.data.posX[anchorSlot]!,
    context.enemies.data.posY[anchorSlot]!,
    command.radius,
    scratch,
  );
  let marked = 0;
  for (let index = 0; index < count && marked < command.count; index++) {
    const slot = context.enemies.slotOf(scratch[index]!);
    if (slot < 0) continue;
    context.enemies.data.marked[slot] = 1;
    marked++;
  }
  stats.markedTargets += marked;
}

export function createTraitCommandExecutor(
  overrides: Partial<TraitCommandExecutorOptions> = {},
): TraitCommandExecutor {
  const options: TraitCommandExecutorOptions = { ...DEFAULT_OPTIONS, ...overrides };
  validateOptions(options);
  const scratch: EntityId[] = [];
  const chainVisited: EntityId[] = [];
  const validatedCommands: TraitCombatCommand[] = [];
  const stats: TraitCommandExecutionStats = {
    commandsProcessed: 0,
    projectileBursts: 0,
    radialBursts: 0,
    orbitingDamageCommands: 0,
    orbitingDamageHits: 0,
    projectilesRequested: 0,
    projectilesSpawned: 0,
    projectilesRejected: 0,
    zonesRequested: 0,
    zonesSpawned: 0,
    zonesRejected: 0,
    burstsSkippedNoTarget: 0,
    meleeArcCommands: 0,
    meleeArcHits: 0,
    meleeArcsSkippedNoTarget: 0,
    chainDamageCommands: 0,
    chainDamageHits: 0,
    chainsSkippedNoTarget: 0,
    enemiesGathered: 0,
    enemiesKnockedBack: 0,
    areaDamageHits: 0,
    markTargetsCommands: 0,
    markedTargets: 0,
    enemiesKilled: 0,
    telegraphs: 0,
    traitCues: 0,
    shieldGrants: 0,
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
          case 'orbitingDamage':
            stats.orbitingDamageCommands++;
            executeOrbitingDamage(command, index, context, scratch, chainVisited, stats);
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
          case 'meleeArc':
            stats.meleeArcCommands++;
            executeMeleeArc(command, index, context, options, scratch, stats);
            break;
          case 'spawnZone':
            executeSpawnZone(command, context, options, stats);
            break;
          case 'markTargets':
            stats.markTargetsCommands++;
            executeMarkTargets(command, context, scratch, stats);
            break;
          case 'grantShield':
            executeGrantShield(command, context, stats);
            break;
          case 'chainDamage':
            stats.chainDamageCommands++;
            executeChainDamage(command, index, context, options, scratch, chainVisited, stats);
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
