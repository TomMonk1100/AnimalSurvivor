import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@sim';
import { createSnapshot } from '../src/sim/snapshot-producer';
import {
  deriveGregAnimationInput,
  hasFreshProjectile,
  hasResolvedChainDamage,
  hasResolvedMeleeArc,
} from '../src/hero/greg-presentation';

describe('Greg presentation cues', () => {
  it('derives movement, hit, and attack cues without mutating snapshots', () => {
    const previous = createSnapshot(DEFAULT_CONFIG);
    const current = createSnapshot(DEFAULT_CONFIG);
    previous.playerAlive = true;
    current.playerAlive = true;
    previous.playerHp = 100;
    current.playerHp = 95;
    current.playerX = 3;
    current.playerY = 4;
    current.projectiles.count = 1;
    current.projectiles.id[0] = 7;

    expect(deriveGregAnimationInput(previous, current)).toEqual({
      alive: true,
      movementMagnitude: 5,
      attackPulse: true,
      hitPulse: true,
    });
  });

  it('recognizes persistent projectiles as non-fresh by full id', () => {
    const previous = createSnapshot(DEFAULT_CONFIG);
    const current = createSnapshot(DEFAULT_CONFIG);
    previous.projectiles.count = 1;
    current.projectiles.count = 1;
    previous.projectiles.id[0] = 42;
    current.projectiles.id[0] = 42;
    expect(hasFreshProjectile(previous, current)).toBe(false);
    current.projectiles.id[0] = 42 + 0x1_0000;
    expect(hasFreshProjectile(previous, current)).toBe(true);
  });

  it('pulses Greg for a resolved chain strike without inventing a projectile', () => {
    const previous = createSnapshot(DEFAULT_CONFIG);
    const current = createSnapshot(DEFAULT_CONFIG);
    previous.playerAlive = true;
    current.playerAlive = true;

    expect(hasResolvedChainDamage([{ kind: 'chainDamage', resolvedHitCount: 0 }])).toBe(false);
    expect(hasResolvedChainDamage([{ kind: 'chainDamage', resolvedHitCount: 2 }])).toBe(true);
    expect(deriveGregAnimationInput(previous, current, [
      { kind: 'chainDamage', resolvedHitCount: 2 },
    ]).attackPulse).toBe(true);
  });

  it('pulses Greg for an authoritative Mantis swing but not a targetless directional command', () => {
    const previous = createSnapshot(DEFAULT_CONFIG);
    const current = createSnapshot(DEFAULT_CONFIG);
    previous.playerAlive = true;
    current.playerAlive = true;

    expect(hasResolvedMeleeArc([{
      kind: 'meleeArc', meleeArcResolved: false, dirX: 0.6, dirY: -0.8,
    }])).toBe(false);
    expect(hasResolvedMeleeArc([{ kind: 'meleeArc', meleeArcResolved: true }])).toBe(true);
    expect(deriveGregAnimationInput(previous, current, [
      { kind: 'meleeArc', meleeArcResolved: true },
    ]).attackPulse).toBe(true);
  });
});
