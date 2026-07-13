import type { SimConfig } from '@sim';
import type { CategorySnapshot, RenderSnapshot } from '../contracts';
import { createSnapshot } from '../sim/snapshot-producer';

export interface RenderStressHarness {
  readonly prev: RenderSnapshot;
  readonly curr: RenderSnapshot;
  readonly enemies: number;
  readonly projectiles: number;
  readonly pickups: number;
  update(tick: number): void;
}

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
    out.archetype[i] = out.category === 'enemy' ? i % 3 : 0;
    out.role[i] = 0;
    out.marked[i] = 0;
  }
}

function fillSnapshot(
  out: RenderSnapshot,
  config: SimConfig,
  tick: number,
  enemies: number,
  projectiles: number,
  pickups: number,
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

  function update(tick: number): void {
    fillSnapshot(prev, config, Math.max(0, tick - 1), enemies, projectiles, pickups);
    fillSnapshot(curr, config, tick, enemies, projectiles, pickups);
  }
  update(0);
  return { prev, curr, enemies, projectiles, pickups, update };
}
