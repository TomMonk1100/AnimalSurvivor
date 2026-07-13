/**
 * Agent C — targeting policies.
 * Pure functions against the frozen interfaces in ./types.js.
 */
import {
  NO_ENTITY,
  type EntityId,
  type EnemyPool,
  type Pool,
  type SelectTarget,
  type SpatialGrid,
  type TargetContext,
  type TargetingPolicy,
} from './types.js';

// Module-level scratch array reused across calls (allocation-light hot path).
const scratch: EntityId[] = [];

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Gather live candidates within ctx.range of origin, ascending by id. */
function gatherLiveCandidates(
  ctx: TargetContext,
  enemies: Pool<EnemyPool>,
  grid: SpatialGrid,
  out: EntityId[],
): EntityId[] {
  const count = grid.queryRadius(ctx.originX, ctx.originY, ctx.range, out);
  const rangeSq = ctx.range * ctx.range;
  const result: EntityId[] = [];
  for (let i = 0; i < count; i++) {
    const id = out[i]!;
    if (!enemies.isLive(id)) continue;
    const slot = enemies.slotOf(id);
    if (slot < 0) continue;
    const d = distSq(ctx.originX, ctx.originY, enemies.data.posX[slot]!, enemies.data.posY[slot]!);
    if (d <= rangeSq) result.push(id);
  }
  return result;
}

function selectNearest(ctx: TargetContext, enemies: Pool<EnemyPool>, candidates: EntityId[]): EntityId {
  let bestId: EntityId = NO_ENTITY;
  let bestDist = Infinity;
  for (const id of candidates) {
    const slot = enemies.slotOf(id);
    if (slot < 0) continue;
    const d = distSq(ctx.originX, ctx.originY, enemies.data.posX[slot]!, enemies.data.posY[slot]!);
    if (d < bestDist) {
      bestDist = d;
      bestId = id;
    }
  }
  return bestId;
}

function selectHighestHealth(enemies: Pool<EnemyPool>, candidates: EntityId[]): EntityId {
  let bestId: EntityId = NO_ENTITY;
  let bestHp = -Infinity;
  for (const id of candidates) {
    const slot = enemies.slotOf(id);
    if (slot < 0) continue;
    const hp = enemies.data.hp[slot]!;
    if (hp > bestHp) {
      bestHp = hp;
      bestId = id;
    }
  }
  return bestId;
}

function selectDensestCluster(
  enemies: Pool<EnemyPool>,
  candidates: EntityId[],
  clusterRadius: number,
): EntityId {
  const clusterRadiusSq = clusterRadius * clusterRadius;
  let bestId: EntityId = NO_ENTITY;
  let bestCount = -1;
  for (const candidateId of candidates) {
    const candidateSlot = enemies.slotOf(candidateId);
    if (candidateSlot < 0) continue;
    const cx = enemies.data.posX[candidateSlot]!;
    const cy = enemies.data.posY[candidateSlot]!;
    let neighborCount = 0;
    for (const otherId of candidates) {
      const otherSlot = enemies.slotOf(otherId);
      if (otherSlot < 0) continue;
      const d = distSq(cx, cy, enemies.data.posX[otherSlot]!, enemies.data.posY[otherSlot]!);
      if (d <= clusterRadiusSq) neighborCount++;
    }
    if (neighborCount > bestCount) {
      bestCount = neighborCount;
      bestId = candidateId;
    }
  }
  return bestId;
}

function selectMarked(enemies: Pool<EnemyPool>, candidates: EntityId[]): EntityId {
  for (const id of candidates) {
    const slot = enemies.slotOf(id);
    if (slot < 0) continue;
    if (enemies.data.marked[slot] === 1) {
      // candidates are ascending by id already (grid guarantees, gather preserves order)
      return id;
    }
  }
  return NO_ENTITY;
}

function selectMarkedThenNearest(ctx: TargetContext, enemies: Pool<EnemyPool>, candidates: EntityId[]): EntityId {
  const marked = selectMarked(enemies, candidates);
  return marked !== NO_ENTITY ? marked : selectNearest(ctx, enemies, candidates);
}

function selectRearThreat(ctx: TargetContext, enemies: Pool<EnemyPool>, candidates: EntityId[]): EntityId {
  if (ctx.moveDirX === 0 && ctx.moveDirY === 0) {
    return selectNearest(ctx, enemies, candidates);
  }
  let bestId: EntityId = NO_ENTITY;
  let bestDist = Infinity;
  for (const id of candidates) {
    const slot = enemies.slotOf(id);
    if (slot < 0) continue;
    const rx = enemies.data.posX[slot]! - ctx.originX;
    const ry = enemies.data.posY[slot]! - ctx.originY;
    const dot = rx * ctx.moveDirX + ry * ctx.moveDirY;
    if (dot >= 0) continue; // not strictly behind
    const d = rx * rx + ry * ry;
    if (d < bestDist) {
      bestDist = d;
      bestId = id;
    }
  }
  return bestId;
}

function selectByPolicy(
  policy: TargetingPolicy,
  ctx: TargetContext,
  enemies: Pool<EnemyPool>,
  candidates: EntityId[],
  clusterRadius: number,
): EntityId {
  switch (policy) {
    case 'nearest':
      return selectNearest(ctx, enemies, candidates);
    case 'highestHealth':
      return selectHighestHealth(enemies, candidates);
    case 'densestCluster':
      return selectDensestCluster(enemies, candidates, clusterRadius);
    case 'markedThenNearest':
      return selectMarkedThenNearest(ctx, enemies, candidates);
    case 'rearThreat':
      return selectRearThreat(ctx, enemies, candidates);
    default: {
      const _exhaustive: never = policy;
      return _exhaustive;
    }
  }
}

export const selectTarget: SelectTarget = (policy, ctx, enemies, grid, clusterRadius) => {
  const candidates = gatherLiveCandidates(ctx, enemies, grid, scratch);
  return selectByPolicy(policy, ctx, enemies, candidates, clusterRadius);
};

/**
 * Shared auto-attack policy: marked prey takes priority over the caller's
 * normal preference, while the original targeting policy remains the fallback.
 * Bat Ears and Gracie Scout therefore improve every hero's automatic attacks
 * without introducing a renderer-owned or hero-specific combat exception.
 */
export function selectPriorityTarget(
  policy: TargetingPolicy,
  ctx: TargetContext,
  enemies: Pool<EnemyPool>,
  grid: SpatialGrid,
  clusterRadius: number,
): EntityId {
  const candidates = gatherLiveCandidates(ctx, enemies, grid, scratch);
  const marked = selectMarked(enemies, candidates);
  return marked !== NO_ENTITY
    ? marked
    : selectByPolicy(policy, ctx, enemies, candidates, clusterRadius);
}
