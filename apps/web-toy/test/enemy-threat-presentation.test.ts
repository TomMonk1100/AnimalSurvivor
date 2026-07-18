import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, makeId, RUN_ENEMY_ROLE } from '@sim';
import type { RunDirectorEventView, TraitPresentationEventView } from '@sim';
import type { CategorySnapshot, RenderSnapshot } from '../src/contracts';
import {
  BOSS_TELEGRAPH_SCALE_MULTIPLIER,
  CHARGER_LUNGE_END_TICKS,
  CHARGER_LUNGE_MIN_OPACITY,
  CHARGER_LUNGE_TRAVEL_DISTANCE,
  CHARGER_PREWARNING_MIN_OPACITY,
  CHARGER_PREWARNING_START_TICKS,
  CHARGER_WINDUP_MIN_OPACITY,
  CONTACT_THREAT_MAX_OPACITY,
  DEFAULT_ENEMY_THREAT_CAPACITIES,
  ENEMY_THREAT_BREATH_PERIOD_TICKS,
  HOSTILE_PROJECTILE_DESCRIPTOR_HEAD_RADIUS_MULTIPLIER,
  HOSTILE_PROJECTILE_MUZZLE_LIFETIME_TICKS,
  HOSTILE_PROJECTILE_OPACITY_FLOOR,
  HOSTILE_PROJECTILE_ROLE,
  HOSTILE_PROJECTILE_TAIL_MINIMUM_SCENE_WIDTH,
  MAX_HOSTILE_PROJECTILE_MUZZLE_POPS,
  MAX_CONTACT_THREAT_RINGS,
  MAX_ENEMY_THREAT_PRESENTATION_CAPACITY,
  MAX_SHOOTER_WINDUPS,
  SHOOTER_INHALE_CHARGE_THRESHOLD,
  SHOOTER_WINDUP_CHARGE_THRESHOLD,
  SHOOTER_WINDUP_MAX_LENGTH,
  SHOOTER_WINDUP_MIN_LENGTH,
  STORED_TELEGRAPH_ENTRY_TICKS,
  STORED_TELEGRAPH_RELEASE_TICKS,
  createEnemyThreatPresentation,
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
  velocityX = 0,
  velocityY = 0,
): void {
  snapshot.id[index] = id;
  snapshot.x[index] = x;
  snapshot.y[index] = y;
  snapshot.radius[index] = radius;
  snapshot.velocityX[index] = velocityX;
  snapshot.velocityY[index] = velocityY;
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
  attackCharge = 0,
): void {
  snapshot.id[index] = id;
  snapshot.x[index] = x;
  snapshot.y[index] = y;
  snapshot.radius[index] = radius;
  snapshot.role[index] = role;
  snapshot.hp[index] = hp;
  snapshot.maxHp[index] = maxHp;
  snapshot.attackCharge[index] = attackCharge;
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

function chargerFrameAtPhase(phase: number) {
  const id = 5;
  const { previous, current } = snapshots(phase + 175);
  enemy(current.enemies, 0, id, 90, 0, RUN_ENEMY_ROLE.charger, 12);
  return createEnemyThreatPresentation({ maxTelegraphs: 4 }).update({ previous, current, alpha: 1 });
}

describe('enemy threat presentation', () => {
  it('keeps every persistent threat breathe loop at or below the flash-safe half-hertz cap', () => {
    expect(ENEMY_THREAT_BREATH_PERIOD_TICKS).toBeGreaterThanOrEqual(120);
  });

  it('projects only hostile projectile heads/tails with the stronger descriptor scale and live opacity floor', () => {
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
    const descriptor = frame.hostileProjectiles[0]!;
    expect(descriptor).toMatchObject({
      entityId: 17,
      family: 'boss-volley',
      critical: true,
      headX: 5,
      headY: 0,
      palette: 'hostile',
    });
    expect(descriptor.tailX).toBeLessThan(5);
    expect(descriptor.tailY).toBeLessThan(0);
    expect(descriptor.headingRadians).toBeCloseTo(Math.atan2(4, 3));
    expect(descriptor.headRadius).toBeGreaterThan(4 * HOSTILE_PROJECTILE_DESCRIPTOR_HEAD_RADIUS_MULTIPLIER);
    expect(descriptor.tailMinimumSceneWidth).toBe(HOSTILE_PROJECTILE_TAIL_MINIMUM_SCENE_WIDTH);
    expect(descriptor.opacity).toBeGreaterThanOrEqual(HOSTILE_PROJECTILE_OPACITY_FLOOR);
    expect(isHostileProjectileSnapshot(current.projectiles, 0)).toBe(true);
    expect(isHostileProjectileSnapshot(current.projectiles, 1)).toBe(false);
    expect(Array.from(current.projectiles.x.slice(0, current.projectiles.count))).toEqual(beforeCurrent);
    expect(Array.from(previous.projectiles.x.slice(0, previous.projectiles.count))).toEqual(beforePrevious);
  });

  it('retains one scale-only muzzle pop per full hostile projectile id and re-arms a recycled slot', () => {
    const { previous, current } = snapshots(50);
    const firstId = makeId(17, 0);
    projectile(current.projectiles, 0, firstId, 10, 0, HOSTILE_PROJECTILE_ROLE, 3, 60, 0);
    const presentation = createEnemyThreatPresentation();

    const first = presentation.update({ previous, current, alpha: 1 }).hostileProjectiles[0]!.muzzlePop!;
    expect(first).toMatchObject({ entityId: firstId, ageTicks: 0, lifetimeTicks: HOSTILE_PROJECTILE_MUZZLE_LIFETIME_TICKS });
    expect(first.x).toBeCloseTo(9);
    const firstScale = first.scale;

    previous.tick = 50;
    current.tick = 51;
    projectile(previous.projectiles, 0, firstId, 9, 0, HOSTILE_PROJECTILE_ROLE, 3, 60, 0);
    const second = presentation.update({ previous, current, alpha: 1 }).hostileProjectiles[0]!.muzzlePop!;
    expect(second.ageTicks).toBe(1);
    expect(second.scale).toBeGreaterThan(firstScale);
    const secondScale = second.scale;

    previous.tick = 56;
    current.tick = 57;
    const finalLive = presentation.update({ previous, current, alpha: 1 }).hostileProjectiles[0]!.muzzlePop!;
    expect(finalLive.ageTicks).toBe(HOSTILE_PROJECTILE_MUZZLE_LIFETIME_TICKS - 1);
    expect(finalLive.scale).toBeLessThan(secondScale);

    previous.tick = 57;
    current.tick = 58;
    expect(presentation.update({ previous, current, alpha: 1 }).hostileProjectiles[0]!.muzzlePop).toBeNull();

    const recycledId = makeId(17, 1);
    previous.tick = 58;
    current.tick = 59;
    current.projectiles.count = 0;
    projectile(current.projectiles, 0, recycledId, 10, 0, HOSTILE_PROJECTILE_ROLE, 3, 60, 0);
    expect(presentation.update({ previous, current, alpha: 1 }).hostileProjectiles[0]!.muzzlePop)
      .toMatchObject({ entityId: recycledId, ageTicks: 0 });
  });

  it('caps simultaneous muzzle semantics at twelve by the already deterministic projectile priority', () => {
    const { previous, current } = snapshots(50);
    for (let index = 0; index < MAX_HOSTILE_PROJECTILE_MUZZLE_POPS + 1; index++) {
      projectile(
        current.projectiles,
        index,
        500 + index,
        index + 1,
        0,
        HOSTILE_PROJECTILE_ROLE,
        3,
        60,
        0,
      );
    }
    const frame = createEnemyThreatPresentation().update({ previous, current, alpha: 1 });
    const popped = frame.hostileProjectiles
      .filter((descriptor) => descriptor.muzzlePop !== null)
      .map((descriptor) => descriptor.entityId);
    expect(popped).toHaveLength(MAX_HOSTILE_PROJECTILE_MUZZLE_POPS);
    expect(popped).toEqual(Array.from({ length: MAX_HOSTILE_PROJECTILE_MUZZLE_POPS }, (_, index) => 500 + index));
  });

  it('emits nearest truthful shooter windups, ramps them monotonically, and suppresses stale out-of-range charge', () => {
    const { previous, current } = snapshots(100);
    enemy(current.enemies, 0, 31, 100, 0, RUN_ENEMY_ROLE.elite, 10, 100, 100, SHOOTER_WINDUP_CHARGE_THRESHOLD);
    enemy(current.enemies, 1, 32, 70, 0, RUN_ENEMY_ROLE.denial, 10, 100, 100, 0.7);
    enemy(current.enemies, 2, 33, 90, 0, RUN_ENEMY_ROLE.ranged, 10, 100, 100, 0.54);
    enemy(current.enemies, 3, 34, 80, 0, RUN_ENEMY_ROLE.support, 10, 100, 100, 1);
    enemy(current.enemies, 4, 35, 346, 0, RUN_ENEMY_ROLE.ranged, 10, 100, 100, 1);
    const presentation = createEnemyThreatPresentation();
    const frame = presentation.update({ previous, current, alpha: 1 });

    expect(frame.shooterWindups.map((windup) => windup.entityId)).toEqual([32, 31]);
    const threshold = frame.shooterWindups[1]!;
    expect(threshold.wedgeLength).toBeCloseTo(SHOOTER_WINDUP_MIN_LENGTH);
    expect(threshold.hasInhale).toBe(false);
    expect(threshold.dirX).toBeLessThan(0);

    current.enemies.attackCharge[0] = SHOOTER_INHALE_CHARGE_THRESHOLD + 0.05;
    const charged = createEnemyThreatPresentation().update({ previous, current, alpha: 1 })
      .shooterWindups.find((windup) => windup.entityId === 31)!;
    expect(charged.wedgeLength).toBeGreaterThan(threshold.wedgeLength);
    expect(charged.wedgeLength).toBeLessThanOrEqual(SHOOTER_WINDUP_MAX_LENGTH);
    expect(charged.wedgeOpacity).toBeGreaterThan(threshold.wedgeOpacity);
    expect(charged.hasInhale).toBe(true);
    expect(charged.inhaleOpacity).toBeGreaterThan(0);
  });

  it('caps shooter windups at twelve deterministically by nearest distance then id', () => {
    const { previous, current } = snapshots(100);
    for (let index = 0; index < 15; index++) {
      enemy(
        current.enemies,
        index,
        100 + index,
        20 + index,
        0,
        RUN_ENEMY_ROLE.ranged,
        8,
        100,
        100,
        0.7,
      );
    }
    const frame = createEnemyThreatPresentation().update({ previous, current, alpha: 1 });
    expect(frame.shooterWindups).toHaveLength(MAX_SHOOTER_WINDUPS);
    expect(frame.shooterWindups.map((windup) => windup.entityId)).toEqual(
      Array.from({ length: MAX_SHOOTER_WINDUPS }, (_, index) => 100 + index),
    );
  });

  it('retains only explicit enemy telegraphs across their fixed-tick lifetime and gives boss attacks an outline', () => {
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
    expect(start.telegraphs[0]!.radius).toBeCloseTo(120 * 0.86 * BOSS_TELEGRAPH_SCALE_MULTIPLIER);
    expect(start.telegraphs[0]!.outlineScale).toBeGreaterThan(1);
    expect(start.telegraphs[0]!.outlineOpacity).toBeGreaterThan(0);
    const startOpacity = start.telegraphs[0]!.opacity;

    current.tick = 110;
    previous.tick = 109;
    const middle = presentation.update({ previous, current, alpha: 1 });
    expect(middle.telegraphs).toHaveLength(1);
    expect(middle.telegraphs[0]!.progress).toBeCloseTo(0.5);
    expect(middle.telegraphs[0]!.opacity).toBeGreaterThan(0.5);
    expect(startOpacity).toBeLessThan(middle.telegraphs[0]!.opacity);
    const middleOpacity = middle.telegraphs[0]!.opacity;

    current.tick = 120 - Math.max(1, Math.floor(STORED_TELEGRAPH_RELEASE_TICKS / 2));
    previous.tick = current.tick - 1;
    const release = presentation.update({ previous, current, alpha: 1 }).telegraphs[0]!;
    expect(release.opacity).toBeLessThan(middleOpacity);
    expect(STORED_TELEGRAPH_ENTRY_TICKS).toBeGreaterThan(0);

    current.tick = 121;
    previous.tick = 120;
    expect(presentation.update({ previous, current, alpha: 1 }).telegraphs).toEqual([]);
  });

  it('keeps boss and elite distinction ahead of a swarm while contact rings require closing movement', () => {
    const { previous, current } = snapshots(300);
    enemy(previous.enemies, 0, 900, 30, 0, RUN_ENEMY_ROLE.boss, 20, 100, 200);
    enemy(previous.enemies, 1, 901, 20, 0, RUN_ENEMY_ROLE.elite, 10, 25, 100);
    enemy(previous.enemies, 2, 902, 10, 0, RUN_ENEMY_ROLE.regular, 4);
    enemy(current.enemies, 0, 900, 20, 0, RUN_ENEMY_ROLE.boss, 20, 100, 200);
    enemy(current.enemies, 1, 901, 15, 0, RUN_ENEMY_ROLE.elite, 10, 25, 100);
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
      outlineOpacity: 0,
    });
    expect(frame.contactRings.map((ring) => ring.entityId)).toEqual([900, 901]);
    expect(frame.contactRings.every((ring) => ring.opacity <= CONTACT_THREAT_MAX_OPACITY)).toBe(true);
    expect(frame.eliteBossAuras).toHaveLength(1);
    expect(frame.eliteBossAuras[0]).toMatchObject({
      entityId: 900, severity: 'boss', palette: 'boss', healthFraction: 0.5,
    });
    expect(frame.eliteBossAuras[0]!.outlineScale).toBeGreaterThan(1);
    expect(frame.eliteBossAuras[0]!.outlineOpacity).toBeGreaterThan(0);
  });

  it('demotes contacts to closing, in-range enemies and caps their output at eight', () => {
    const { previous, current } = snapshots(80);
    enemy(previous.enemies, 0, 1, 14, 0, RUN_ENEMY_ROLE.regular, 4);
    enemy(current.enemies, 0, 1, 10, 0, RUN_ENEMY_ROLE.regular, 4);
    enemy(previous.enemies, 1, 2, 8, 0, RUN_ENEMY_ROLE.regular, 4);
    enemy(current.enemies, 1, 2, 12, 0, RUN_ENEMY_ROLE.regular, 4);
    enemy(current.enemies, 2, 3, 10, 0, RUN_ENEMY_ROLE.regular, 4);
    enemy(previous.enemies, 3, 4, 70, 0, RUN_ENEMY_ROLE.regular, 4);
    enemy(current.enemies, 3, 4, 65, 0, RUN_ENEMY_ROLE.regular, 4);
    const demoted = createEnemyThreatPresentation().update({ previous, current, alpha: 1 });
    expect(demoted.contactRings.map((ring) => ring.entityId)).toEqual([1]);

    const many = snapshots(100);
    for (let index = 0; index < 10; index++) {
      enemy(many.previous.enemies, index, 100 + index, 14 + index * 0.01, 0, RUN_ENEMY_ROLE.regular, 4);
      enemy(many.current.enemies, index, 100 + index, 10 + index * 0.01, 0, RUN_ENEMY_ROLE.regular, 4);
    }
    const capped = createEnemyThreatPresentation().update({
      previous: many.previous,
      current: many.current,
      alpha: 1,
    });
    expect(capped.contactRings).toHaveLength(MAX_CONTACT_THREAT_RINGS);
    expect(capped.contactRings.every((ring) => ring.opacity <= CONTACT_THREAT_MAX_OPACITY)).toBe(true);
  });

  it('mirrors the complete deterministic charger warning window through lunge end', () => {
    expect(chargerFrameAtPhase(CHARGER_PREWARNING_START_TICKS - 1).telegraphs).toEqual([]);
    expect(chargerFrameAtPhase(CHARGER_LUNGE_END_TICKS).telegraphs).toEqual([]);

    const prewarning = chargerFrameAtPhase(CHARGER_PREWARNING_START_TICKS).telegraphs[0]!;
    const windup = chargerFrameAtPhase(0).telegraphs[0]!;
    const lunge = chargerFrameAtPhase(24).telegraphs[0]!;
    const finalLunge = chargerFrameAtPhase(CHARGER_LUNGE_END_TICKS - 1).telegraphs[0]!;
    expect(prewarning).toMatchObject({ source: 'charger', severity: 'charger', style: 'lane', label: 'LUNGE' });
    expect(windup.opacity).toBeGreaterThanOrEqual(CHARGER_WINDUP_MIN_OPACITY);
    expect(lunge.opacity).toBeGreaterThanOrEqual(CHARGER_LUNGE_MIN_OPACITY);
    expect(prewarning.opacity).toBeGreaterThanOrEqual(CHARGER_PREWARNING_MIN_OPACITY);
    expect(prewarning.opacity).toBeLessThan(windup.opacity);
    expect(windup.opacity).toBeLessThanOrEqual(lunge.opacity);
    expect(finalLunge.length).toBe(CHARGER_LUNGE_TRAVEL_DISTANCE);
    expect(windup.dirX).toBeLessThan(0);
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

  it('keeps default combined capacity under 128, clamps policy caps, rejects oversized custom totals, and is tick-deterministic', () => {
    const defaults = createEnemyThreatPresentation();
    const total = defaults.capacities.maxProjectileTrails
      + defaults.capacities.maxMuzzlePops
      + defaults.capacities.maxShooterWindups
      + defaults.capacities.maxTelegraphs
      + defaults.capacities.maxContactRings
      + defaults.capacities.maxEliteBossAuras;
    expect(total).toBeLessThanOrEqual(MAX_ENEMY_THREAT_PRESENTATION_CAPACITY);
    expect(total).toBe(124);
    expect(createEnemyThreatPresentation({ maxContactRings: 99 }).capacities.maxContactRings)
      .toBe(MAX_CONTACT_THREAT_RINGS);
    expect(createEnemyThreatPresentation({ maxShooterWindups: 99 }).capacities.maxShooterWindups)
      .toBe(MAX_SHOOTER_WINDUPS);
    expect(() => createEnemyThreatPresentation({
      maxProjectileTrails: 100,
      maxMuzzlePops: MAX_HOSTILE_PROJECTILE_MUZZLE_POPS,
      maxShooterWindups: MAX_SHOOTER_WINDUPS,
      maxTelegraphs: 24,
      maxContactRings: MAX_CONTACT_THREAT_RINGS,
      maxEliteBossAuras: 6,
    })).toThrow(/descriptor capacity/);
    expect(DEFAULT_ENEMY_THREAT_CAPACITIES.maxContactRings).toBe(MAX_CONTACT_THREAT_RINGS);

    const { previous, current } = snapshots(120);
    enemy(previous.enemies, 0, 60, 100, 0, RUN_ENEMY_ROLE.ranged, 8, 100, 100, 0.8);
    enemy(current.enemies, 0, 60, 90, 0, RUN_ENEMY_ROLE.ranged, 8, 100, 100, 0.8);
    projectile(current.projectiles, 0, 61, 20, 0, HOSTILE_PROJECTILE_ROLE, 3, 60, 0);
    const input = { previous, current, alpha: 1 };
    expect(JSON.stringify(createEnemyThreatPresentation().update(input)))
      .toBe(JSON.stringify(createEnemyThreatPresentation().update(input)));
  });
});
