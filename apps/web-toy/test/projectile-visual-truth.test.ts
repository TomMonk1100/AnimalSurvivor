import { COMBAT_DAMAGE_SOURCE, DEFAULT_CONFIG, makeId } from '@sim';
import { describe, expect, it } from 'vitest';
import type { CategorySnapshot } from '../src/contracts';
import {
  createProjectileVisualTruth,
  PLAYER_PROJECTILE_VISUAL_FAMILY,
  type ProjectileVisualTraitEvent,
} from '../src/render/projectile-visual-truth';
import { createSnapshot } from '../src/sim/snapshot-producer';

function projectiles(): CategorySnapshot {
  const snapshot = createSnapshot(DEFAULT_CONFIG).projectiles;
  snapshot.count = 0;
  return snapshot;
}

function appendProjectile(
  snapshot: CategorySnapshot,
  slot: number,
  x: number,
  y: number,
  velocityX: number,
  velocityY: number,
  source: number = COMBAT_DAMAGE_SOURCE.traitProjectile,
  generation = 0,
): number {
  const index = snapshot.count++;
  const id = makeId(slot, generation);
  snapshot.id[index] = id;
  snapshot.x[index] = x;
  snapshot.y[index] = y;
  snapshot.radius[index] = 3;
  snapshot.role[index] = 0;
  snapshot.source[index] = source;
  snapshot.velocityX[index] = velocityX;
  snapshot.velocityY[index] = velocityY;
  return id;
}

function event(overrides: Partial<ProjectileVisualTraitEvent> = {}): ProjectileVisualTraitEvent {
  return {
    kind: 'spawnProjectileBurst',
    sourceId: 'porcupine-quills',
    tick: 20,
    originX: 100,
    originY: 100,
    dirX: 1,
    dirY: 0,
    count: 1,
    ...overrides,
  };
}

describe('projectile visual truth attribution', () => {
  it('attaches each authored family to a real matching projectile identity, not an invented travel card', () => {
    const current = projectiles();
    const quillId = appendProjectile(current, 3, 108, 100, 400, 0);
    const owlId = appendProjectile(current, 7, 200, 208, 0, 400);
    const thornId = appendProjectile(current, 11, 308, 300, 400, 0);
    const genericId = appendProjectile(current, 15, 700, 700, 400, 0);
    const truth = createProjectileVisualTruth(DEFAULT_CONFIG.projectileCap, DEFAULT_CONFIG.hz);

    truth.update(current, [
      event(),
      event({ sourceId: 'owl-pinions', originX: 200, originY: 200, dirX: 0, dirY: 1 }),
      event({
        kind: 'radialProjectileBurst', sourceId: 'thornstorm-mantle', originX: 300, originY: 300,
        dirX: 0, dirY: 0, count: 1,
      }),
    ], 21);

    expect(truth.familyFor(quillId, COMBAT_DAMAGE_SOURCE.traitProjectile))
      .toBe(PLAYER_PROJECTILE_VISUAL_FAMILY.porcupineQuills);
    expect(truth.familyFor(owlId, COMBAT_DAMAGE_SOURCE.traitProjectile))
      .toBe(PLAYER_PROJECTILE_VISUAL_FAMILY.owlPinions);
    expect(truth.familyFor(thornId, COMBAT_DAMAGE_SOURCE.traitProjectile))
      .toBe(PLAYER_PROJECTILE_VISUAL_FAMILY.thornstorm);
    expect(truth.familyFor(genericId, COMBAT_DAMAGE_SOURCE.traitProjectile))
      .toBe(PLAYER_PROJECTILE_VISUAL_FAMILY.generic);
  });

  it('rejects a merely nearby but wrong-heading directed projectile instead of assigning the wrong attack art', () => {
    const current = projectiles();
    const backwardsId = appendProjectile(current, 4, 108, 100, -400, 0);
    const truth = createProjectileVisualTruth(DEFAULT_CONFIG.projectileCap, DEFAULT_CONFIG.hz);

    truth.update(current, [event()], 21);

    expect(truth.familyFor(backwardsId, COMBAT_DAMAGE_SOURCE.traitProjectile))
      .toBe(PLAYER_PROJECTILE_VISUAL_FAMILY.generic);
  });

  it('keeps attribution generation-safe and reserves Gracie Spit for its authoritative source code', () => {
    const current = projectiles();
    const oldId = appendProjectile(current, 5, 108, 100, 400, 0);
    const spitId = appendProjectile(
      current, 9, 400, 400, 400, 0, COMBAT_DAMAGE_SOURCE.heroSpit,
    );
    const truth = createProjectileVisualTruth(DEFAULT_CONFIG.projectileCap, DEFAULT_CONFIG.hz);

    truth.update(current, [event()], 21);

    expect(truth.familyFor(oldId, COMBAT_DAMAGE_SOURCE.traitProjectile))
      .toBe(PLAYER_PROJECTILE_VISUAL_FAMILY.porcupineQuills);
    expect(truth.familyFor(makeId(5, 1), COMBAT_DAMAGE_SOURCE.traitProjectile))
      .toBe(PLAYER_PROJECTILE_VISUAL_FAMILY.generic);
    expect(truth.familyFor(spitId, COMBAT_DAMAGE_SOURCE.heroSpit))
      .toBe(PLAYER_PROJECTILE_VISUAL_FAMILY.gracieSpit);
  });
});
