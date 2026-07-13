import { describe, expect, it } from 'vitest';
import type {
  IllustratedCombatVfxEvent,
  IllustratedTraitVfxEvent,
} from '../src/render/illustrated-vfx-presentation';
import {
  illustratedVfxClipForCombatEvent,
  illustratedVfxClipForTraitEvent,
} from '../src/render/illustrated-vfx-presentation';

function trait(overrides: Partial<IllustratedTraitVfxEvent> = {}): IllustratedTraitVfxEvent {
  return {
    kind: 'telegraph',
    sourceId: 'test-source',
    tag: '',
    meleeArcResolved: false,
    ...overrides,
  };
}

function combat(overrides: Partial<IllustratedCombatVfxEvent> = {}): IllustratedCombatVfxEvent {
  return {
    kind: 'enemyHit',
    critical: false,
    pickupKind: null,
    ...overrides,
  };
}

describe('illustrated VFX presentation routing', () => {
  it('requires a resolved target before drawing an illustrated Fox Swipe', () => {
    expect(illustratedVfxClipForTraitEvent(trait({
      kind: 'meleeArc', sourceId: 'greg-fox-swipe', tag: 'greg-fox-swipe', meleeArcResolved: false,
    }))).toBeNull();
    expect(illustratedVfxClipForTraitEvent(trait({
      kind: 'meleeArc', sourceId: 'greg-rush-rake', tag: 'greg-rush-rake', meleeArcResolved: true,
    }))).toBe('foxSwipe');
  });

  it('routes the three hero signatures and defensive cards to authored clips', () => {
    expect(illustratedVfxClipForTraitEvent(trait({
      sourceId: 'benny-trample', tag: 'benny-trample-wave', kind: 'telegraph',
    }))).toBe('earthWave');
    expect(illustratedVfxClipForTraitEvent(trait({
      sourceId: 'gracie-spit', tag: 'gracie-spit', kind: 'spawnProjectileBurst',
    }))).toBe('spitComet');
    expect(illustratedVfxClipForTraitEvent(trait({
      sourceId: 'gracie-spit', tag: 'gracie-spit', kind: 'telegraph',
    }))).toBe('spitComet');
    expect(illustratedVfxClipForTraitEvent(trait({
      sourceId: 'fluffy-shield', tag: 'fluffy-shield', kind: 'playTraitCue',
    }))).toBe('fluffyShield');
    expect(illustratedVfxClipForTraitEvent(trait({
      sourceId: 'armor-block', tag: 'armor-block', kind: 'playTraitCue',
    }))).toBe('shieldRecharge');
  });

  it('uses illustrated impact art for resolved combat results and rare token pickups', () => {
    expect(illustratedVfxClipForCombatEvent(combat())).toBe('normalImpact');
    expect(illustratedVfxClipForCombatEvent(combat({ critical: true }))).toBe('criticalImpact');
    expect(illustratedVfxClipForCombatEvent(combat({ kind: 'playerHit' }))).toBe('playerImpact');
    expect(illustratedVfxClipForCombatEvent(combat({ kind: 'pickup', pickupKind: 'magnet' }))).toBe('magnet');
    expect(illustratedVfxClipForCombatEvent(combat({ kind: 'pickup', pickupKind: 'food' }))).toBe('food');
    expect(illustratedVfxClipForCombatEvent(combat({ kind: 'heal' }))).toBeNull();
  });
});
