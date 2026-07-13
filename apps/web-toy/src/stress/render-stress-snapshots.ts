import { COMBAT_DAMAGE_SOURCE, powerPickupCapacityForXpCap, type SimConfig } from '@sim';
import type { CategorySnapshot, RenderSnapshot } from '../contracts';
import { createSnapshot } from '../sim/snapshot-producer';

export interface RenderStressHarness {
  readonly prev: RenderSnapshot;
  readonly curr: RenderSnapshot;
  readonly enemies: number;
  readonly projectiles: number;
  readonly pickups: number;
  /** One renderer-only exemplar per rare pickup kind. */
  readonly powerPickups: number;
  update(tick: number): void;
}

/**
 * The renderer has three deliberately different XP silhouettes. Keep all of
 * them in the saturation fixture so a high-count render run exercises the
 * same tier routing as ordinary, elite, and boss drops.
 */
const XP_VALUE_TIERS = [1, 3, 9] as const;

/**
 * Cycle every renderer-visible projectile family through the fixed stress
 * pool. The faction role is the authoritative compact player/enemy split;
 * source chooses the player accent or hostile threat family.
 */
const PROJECTILE_VISUAL_FAMILIES = [
  { role: 0, source: COMBAT_DAMAGE_SOURCE.playerProjectile, damage: 12 },
  { role: 0, source: COMBAT_DAMAGE_SOURCE.traitProjectile, damage: 20 },
  { role: 0, source: COMBAT_DAMAGE_SOURCE.heroSpit, damage: 28 },
  { role: 1, source: COMBAT_DAMAGE_SOURCE.enemyProjectile, damage: 18 },
] as const;

function fillCategory(
  out: CategorySnapshot,
  count: number,
  columns: number,
  spacing: number,
  centerX: number,
  centerY: number,
  radius: number,
  tick: number,
): void {
  out.count = count;
  const rows = Math.ceil(count / columns);
  const halfColumns = (columns - 1) * 0.5;
  const halfRows = (rows - 1) * 0.5;
  const phase = tick * 0.025;
  for (let i = 0; i < count; i++) {
    const column = i % columns;
    const row = Math.floor(i / columns);
    out.id[i] = i;
    out.x[i] = centerX + (column - halfColumns) * spacing + Math.sin(phase + i * 0.17) * 2;
    out.y[i] = centerY + (row - halfRows) * spacing + Math.cos(phase * 0.8 + i * 0.13) * 2;
    out.radius[i] = radius;
    // Stress snapshots are renderer-only, but keep the expanded snapshot
    // contract coherent: synthetic enemies are healthy and non-enemy
    // categories explicitly have no health data.
    out.hp[i] = out.category === 'enemy' ? 100 : 0;
    out.maxHp[i] = out.category === 'enemy' ? 100 : 0;
    out.value[i] = out.category === 'enemy' ? XP_VALUE_TIERS[i % XP_VALUE_TIERS.length]! : 0;
    out.velocityX[i] = 0;
    out.velocityY[i] = 0;
    out.archetype[i] = out.category === 'enemy' ? i % 3 : 0;
    out.role[i] = 0;
    out.source[i] = 0;
    out.critical[i] = 0;
    out.marked[i] = 0;
  }
}

/**
 * Seed the expanded projectile snapshot fields with motion that matches the
 * deterministic position orbit above. This gives both player accents and
 * hostile trails real headings without requiring a live simulation run.
 */
function fillProjectileVisualFields(out: CategorySnapshot, motionTick: number, hz: number): void {
  const phase = motionTick * 0.025;
  for (let index = 0; index < out.count; index++) {
    const family = PROJECTILE_VISUAL_FAMILIES[index % PROJECTILE_VISUAL_FAMILIES.length]!;
    const xPhase = phase + index * 0.17;
    const yPhase = phase * 0.8 + index * 0.13;
    out.value[index] = family.damage + (index % 3) * 4;
    out.velocityX[index] = Math.cos(xPhase) * 2 * 0.025 * hz;
    out.velocityY[index] = -Math.sin(yPhase) * 2 * 0.8 * 0.025 * hz;
    out.role[index] = family.role;
    out.source[index] = family.source;
    // Every family receives both normal and critical examples at saturation.
    out.critical[index] = index % 7 === 0 || index % 8 === 3 ? 1 : 0;
  }
}

function fillPickupVisualFields(out: CategorySnapshot): void {
  for (let index = 0; index < out.count; index++) {
    out.value[index] = XP_VALUE_TIERS[index % XP_VALUE_TIERS.length]!;
  }
}

function fillSnapshot(
  out: RenderSnapshot,
  config: SimConfig,
  tick: number,
  enemies: number,
  projectiles: number,
  pickups: number,
  powerPickups: number,
): void {
  out.tick = tick;
  out.playerX = config.player.startX;
  out.playerY = config.player.startY;
  out.playerRadius = config.player.radius;
  out.playerPickupRadius = config.player.pickupRadius;
  out.playerHp = config.player.maxHp;
  out.playerMaxHp = config.player.maxHp;
  out.playerXp = 0;
  out.playerLevel = 1;
  out.playerAlive = true;
  fillCategory(out.enemies, enemies, 40, 9, out.playerX, out.playerY, 3.5, tick);
  fillCategory(out.projectiles, projectiles, 25, 8, out.playerX, out.playerY, 2, tick + 37);
  fillCategory(out.pickups, pickups, 20, 10, out.playerX, out.playerY, 2.5, tick + 79);
  fillCategory(out.powerPickups, powerPickups, 3, 18, out.playerX, out.playerY, 12, tick + 113);
  fillProjectileVisualFields(out.projectiles, tick + 37, config.hz);
  fillPickupVisualFields(out.pickups);
  // Exercise the three bounded renderer batches without inventing a fourth
  // gameplay kind. Stress snapshots remain presentation-only.
  for (let index = 0; index < powerPickups; index++) out.powerPickups.role[index] = index + 1;
}

/**
 * Creates deterministic renderer-only load. It never touches simulation state;
 * the real simulation continues separately so its canonical hash remains the
 * acceptance oracle while the GPU sees the requested maximum view counts.
 */
export function createRenderStressHarness(config: SimConfig): RenderStressHarness {
  const prev = createSnapshot(config);
  const curr = createSnapshot(config);
  const enemies = Math.min(1000, config.enemyCap);
  const projectiles = Math.min(500, config.projectileCap);
  const pickups = Math.min(200, config.pickupCap);
  const powerPickups = Math.min(3, powerPickupCapacityForXpCap(config.pickupCap));

  function update(tick: number): void {
    fillSnapshot(prev, config, Math.max(0, tick - 1), enemies, projectiles, pickups, powerPickups);
    fillSnapshot(curr, config, tick, enemies, projectiles, pickups, powerPickups);
  }
  update(0);
  return { prev, curr, enemies, projectiles, pickups, powerPickups, update };
}
