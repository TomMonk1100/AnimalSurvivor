import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, RUN_ENEMY_ROLE } from '@sim';
import type { RunDirectorEventView, TraitPresentationEventView } from '@sim';
import type { CategorySnapshot, RenderSnapshot } from '../src/contracts';
import {
  createEnemyThreatPresentation,
  HOSTILE_PROJECTILE_ROLE,
  isHostileProjectileSnapshot,
} from '../src/render/enemy-threat-presentation';
import { createSnapshot } from '../src/sim/snapshot-producer';

function snapshots(tick = 100): { previous: RenderSnapshot; current: RenderSnapshot } {
  const previous = createSnapshot(DEFAULT_CONFIG);
  const current = createSnapshot(DEFAULT_CONFIG);
  previous.tick = tick - 1;
  current.tick = tick;
  previous.playerX = current.playerX = 0;
  previous.playerY = current.playerY = 0;
  previous.playerRadius = current.playerRadius = 8;
  previous.playerAlive = current.playerAlive = true;
  return { previous, current };
}

function projectile(
  snapshot: CategorySnapshot,
  index: number,
  id: number,
  x: number,
  y: number,
  role = HOSTILE_PROJECTILE_ROLE,
  radius = 3,
): void {
  snapshot.id[index] = id;
  snapshot.x[index] = x;
  snapshot.y[index] = y;
  snapshot.radius[index] = radius;
  snapshot.role[index] = role;
  snapshot.count = Math.max(snapshot.count, index + 1);
}

function enemy(
  snapshot: CategorySnapshot,
  index: number,
  id: number,
  x: number,
  y: number,
  role: number,
  radius = 10,
  hp = 100,
  maxHp = 100,
): void {
  snapshot.id[index] = id;
  snapshot.x[index] = x;
  snapshot.y[index] = y;
  snapshot.radius[index] = radius;
  snapshot.role[index] = role;
  snapshot.hp[index] = hp;
  snapshot.maxHp[index] = maxHp;
  snapshot.count = Math.max(snapshot.count, index + 1);
}

function traitTelegraph(overrides: Partial<TraitPresentationEventView> = {}): TraitPresentationEventView {
  const empty = new Float32Array(0);
  return {
    kind: 'telegraph',
    sourceId: 'forest-final-threat',
    tick: 100,
    targeting: 'none',
    originX: 80,
    originY: 40,
    dirX: 1,
    dirY: 0,
    count: 0,
    damage: 0,
    speed: 0,
    radius: 120,
    strength: 1,
    durationTicks: 20,
    intervalTicks: 0,
    amount: 0,
    arc: 0,
    meleeArcResolved: false,
    facing: 0,
    spread: 0,
    jumps: 0,
    range: 120,
    tag: 'boss-charge',
    resolvedHitCount: 0,
    resolvedHitX: empty,
    resolvedHitY: empty,
    resolvedOrbitHitCount: 0,
    resolvedOrbitHitX: empty,
    resolvedOrbitHitY: empty,
    resolvedOrbitSourceX: empty,
    resolvedOrbitSourceY: empty,
    ...overrides,
  };
}

function directorEvent(kind: string, tick: number, seq = 1): RunDirectorEventView {
  return { kind, tick, seq, phase: 'opening' };
}

describe('enemy threat presentation', () => {
  it('projects only hostile projectile heads/tails and accepts optional source, crit, and velocity metadata', () => {
    const { previous, current } = snapshots(40);
    projectile(previous.projectiles, 0, 17, 0, 0);
    projectile(current.projectiles, 0, 17, 10, 0);
    projectile(current.projectiles, 1, 18, 7, 7, 0);
    const beforeCurrent = Array.from(current.projectiles.x.slice(0, current.projectiles.count));
    const beforePrevious = Array.from(previous.projectiles.x.slice(0, previous.projectiles.count));
    const presentation = createEnemyThreatPresentation();
    const frame = presentation.update({
      previous,
      current,
      alpha: 0.5,
      hostileProjectileMetadata: new Map([[17, {
        family: 'boss-volley', critical: true, velocityX: 3, velocityY: 4,
      }]]),
    });

    expect(frame.hostileProjectiles).toHaveLength(1);
    expect(frame.hostileProjectiles[0]).toMatchObject({
      entityId: 17,
      family: 'boss-volley',
      critical: true,
      headX: 5,
      headY: 0,
      palette: 'hostile',
    });
    expect(frame.hostileProjectiles[0]!.tailX).toBeLessThan(5);
    expect(frame.hostileProjectiles[0]!.tailY).toBeLessThan(0);
    expect(frame.hostileProjectiles[0]!.headingRadians).toBeCloseTo(Math.atan2(4, 3));
    expect(frame.hostileProjectiles[0]!.headRadius).toBeGreaterThan(4);
    expect(isHostileProjectileSnapshot(current.projectiles, 0)).toBe(true);
    expect(isHostileProjectileSnapshot(current.projectiles, 1)).toBe(false);
    expect(Array.from(current.projectiles.x.slice(0, current.projectiles.count))).toEqual(beforeCurrent);
    expect(Array.from(previous.projectiles.x.slice(0, previous.projectiles.count))).toEqual(beforePrevious);
  });

  it('retains only explicit enemy telegraphs across their fixed-tick lifetime', () => {
    const { previous, current } = snapshots(100);
    const presentation = createEnemyThreatPresentation();
    const bossCue = traitTelegraph();
    const heroCue = traitTelegraph({ sourceId: 'greg-swipe', tag: 'greg-fox-swipe' });

    const start = presentation.update({
      previous,
      current,
      alpha: 1,
      traitPresentationEvents: [bossCue, heroCue],
    });
    expect(start.telegraphs).toHaveLength(1);
    expect(start.telegraphs[0]).toMatchObject({
      source: 'trait', severity: 'boss', style: 'lane', label: 'CHARGE',
      palette: 'boss', startTick: 100, expiresAtTick: 120, progress: 0,
    });

    current.tick = 110;
    previous.tick = 109;
    const middle = presentation.update({ previous, current, alpha: 1 });
    expect(middle.telegraphs).toHaveLength(1);
    expect(middle.telegraphs[0]!.progress).toBeCloseTo(0.5);
    expect(middle.telegraphs[0]!.opacity).toBeGreaterThan(0.5);

    current.tick = 121;
    previous.tick = 120;
    expect(presentation.update({ previous, current, alpha: 1 }).telegraphs).toEqual([]);
  });

  it('keeps boss and elite distinction ahead of a nearby regular swarm and bounds every output', () => {
    const { previous, current } = snapshots(300);
    enemy(current.enemies, 0, 900, 80, 0, RUN_ENEMY_ROLE.boss, 20, 100, 200);
    enemy(current.enemies, 1, 901, 20, 0, RUN_ENEMY_ROLE.elite, 10, 25, 100);
    enemy(current.enemies, 2, 902, 5, 0, RUN_ENEMY_ROLE.regular, 4);
    const presentation = createEnemyThreatPresentation({
      maxContactRings: 2,
      maxEliteBossAuras: 1,
      maxTelegraphs: 4,
    });
    const frame = presentation.update({
      previous,
      current,
      alpha: 1,
      directorEvents: [directorEvent('bossWarning', 300, 42)],
    });

    expect(frame.telegraphs).toHaveLength(1);
    expect(frame.telegraphs[0]).toMatchObject({
      source: 'director', style: 'arrival', severity: 'boss', label: 'APEX INBOUND', palette: 'boss',
    });
    expect(frame.contactRings).toHaveLength(2);
    expect(frame.contactRings.map((ring) => ring.entityId)).toEqual([900, 901]);
    expect(frame.contactRings.map((ring) => ring.palette)).toEqual(['boss', 'elite']);
    expect(frame.eliteBossAuras).toHaveLength(1);
    expect(frame.eliteBossAuras[0]).toMatchObject({
      entityId: 900, severity: 'boss', palette: 'boss', healthFraction: 0.5,
    });
  });

  it('uses the deterministic charger wind-up window for a directional lunge tell', () => {
    const { previous, current } = snapshots(175);
    enemy(current.enemies, 0, 5, 90, 0, RUN_ENEMY_ROLE.charger, 12);
    const presentation = createEnemyThreatPresentation({ maxTelegraphs: 4 });

    const windup = presentation.update({ previous, current, alpha: 1 });
    expect(windup.telegraphs).toHaveLength(1);
    expect(windup.telegraphs[0]).toMatchObject({
      source: 'charger', severity: 'charger', style: 'lane', label: 'LUNGE', progress: 0, palette: 'charger',
    });
    expect(windup.telegraphs[0]!.dirX).toBeLessThan(0);

    current.tick = 199; // (199 + (5 & 31)) % 180 === 24, immediately after wind-up.
    previous.tick = 198;
    expect(presentation.update({ previous, current, alpha: 1 }).telegraphs).toEqual([]);
  });

  it('reserves a charger warning when explicit telegraphs saturate the budget', () => {
    const { previous, current } = snapshots(175);
    enemy(current.enemies, 0, 5, 90, 0, RUN_ENEMY_ROLE.charger, 12);
    const presentation = createEnemyThreatPresentation({ maxTelegraphs: 1 });

    const frame = presentation.update({
      previous,
      current,
      alpha: 1,
      traitPresentationEvents: [traitTelegraph({
        sourceId: 'stored-boss-charge',
        tick: 175,
        durationTicks: 24,
      })],
    });

    expect(frame.telegraphs).toHaveLength(1);
    expect(frame.telegraphs[0]).toMatchObject({
      source: 'charger', severity: 'charger', label: 'LUNGE', palette: 'charger',
    });
  });
});
