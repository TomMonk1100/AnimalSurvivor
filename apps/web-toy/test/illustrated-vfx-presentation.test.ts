import { describe, expect, it } from 'vitest';
import type {
  IllustratedCombatVfxEvent,
  IllustratedTraitVfxEvent,
} from '../src/render/illustrated-vfx-presentation';
import {
  SIGNATURE_VFX_ENVELOPE_RELEASE,
  illustratedVfxClipForCombatEvent,
  illustratedVfxClipForTraitEvent,
  illustratedVfxEnvelopeReleaseForClip,
  illustratedVfxLifetimeForClip,
  illustratedVfxRadiusForTraitEvent,
} from '../src/render/illustrated-vfx-presentation';

function trait(overrides: Partial<IllustratedTraitVfxEvent> = {}): IllustratedTraitVfxEvent {
  return {
    kind: 'telegraph',
    sourceId: 'test-source',
    tag: '',
    meleeArcResolved: false,
    resolvedHitCount: 0,
    resolvedHitX: new Float32Array(0),
    resolvedHitY: new Float32Array(0),
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
  it('keeps blink-prone one-shot art at the ten-tick readability floor', () => {
    expect(illustratedVfxLifetimeForClip('normalImpact')).toBe(10);
    expect(illustratedVfxLifetimeForClip('quillVolley')).toBe(10);
    expect(illustratedVfxLifetimeForClip('mantisSweep')).toBe(10);
    expect(illustratedVfxLifetimeForClip('playerImpact')).toBe(10);
  });

  it('keeps coherent eight-frame dissolves visible beyond their source sequence', () => {
    expect(illustratedVfxLifetimeForClip('fluffyShield')).toBeGreaterThanOrEqual(16);
    expect(illustratedVfxLifetimeForClip('geckoPad')).toBeGreaterThanOrEqual(16);
    expect(illustratedVfxLifetimeForClip('skunkCloud')).toBeGreaterThanOrEqual(16);
    expect(illustratedVfxLifetimeForClip('royalStink')).toBeGreaterThanOrEqual(16);
  });

  it('gives every hero signature at least half of its life to visibly release', () => {
    expect(SIGNATURE_VFX_ENVELOPE_RELEASE).toBeGreaterThanOrEqual(0.5);
    for (const clip of ['foxSwipe', 'earthWave', 'spitComet'] as const) {
      expect(illustratedVfxEnvelopeReleaseForClip(clip)).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('requires a resolved target before drawing an illustrated Fox Swipe', () => {
    expect(illustratedVfxClipForTraitEvent(trait({
      kind: 'meleeArc', sourceId: 'greg-fox-swipe', tag: 'greg-fox-swipe', meleeArcResolved: false,
    }))).toBeNull();
    expect(illustratedVfxClipForTraitEvent(trait({
      kind: 'meleeArc', sourceId: 'greg-rush-rake', tag: 'greg-rush-rake', meleeArcResolved: true,
    }))).toBe('foxSwipe');
  });

  it('routes card-owned hero signatures and defensive cards without duplicating Gracie flight', () => {
    expect(illustratedVfxClipForTraitEvent(trait({
      sourceId: 'benny-trample', tag: 'benny-trample-wave', kind: 'telegraph',
    }))).toBe('earthWave');
    expect(illustratedVfxClipForTraitEvent(trait({
      sourceId: 'gracie-spit', tag: 'gracie-spit', kind: 'spawnProjectileBurst',
    }))).toBeNull();
    expect(illustratedVfxClipForTraitEvent(trait({
      sourceId: 'gracie-spit', tag: 'gracie-spit', kind: 'telegraph',
    }))).toBeNull();
    expect(illustratedVfxClipForTraitEvent(trait({
      sourceId: 'fluffy-shield', tag: 'fluffy-shield', kind: 'playTraitCue',
    }))).toBe('fluffyShield');
    expect(illustratedVfxClipForTraitEvent(trait({
      sourceId: 'armor-block', tag: 'armor-block', kind: 'playTraitCue',
    }))).toBe('shieldRecharge');
    expect(illustratedVfxClipForTraitEvent(trait({
      sourceId: 'benny-brace', tag: 'benny-brace', kind: 'areaKnockback',
    }))).toBe('earthWave');
    expect(illustratedVfxClipForTraitEvent(trait({
      sourceId: 'gracie-scout', tag: 'gracie-scout', kind: 'telegraph',
    }))).toBe('midnightRadar');
  });

  it('uses bounded gameplay-camera scales for Benny’s ridge and Gracie’s real comet body', () => {
    expect(illustratedVfxRadiusForTraitEvent({ range: 34, radius: 34, strength: 1 }, 'earthWave')).toBeCloseTo(66.3);
    // Gracie's authoritative hit radius is deliberately compact; the card is
    // a readable renderer-only body/tail, not a widened collision query.
    expect(illustratedVfxRadiusForTraitEvent({ range: 12, radius: 12, strength: 1 }, 'spitComet')).toBe(56);
    expect(illustratedVfxRadiusForTraitEvent({ range: 12, radius: 12, strength: 1 }, 'spitComet')).toBeGreaterThan(12 * 2);
  });

  it('gives every owned trait and mythic command an explicit animated art clip', () => {
    const routes: readonly (readonly [Partial<IllustratedTraitVfxEvent>, string])[] = [
      [{ kind: 'areaGather', sourceId: 'puffer-pouch' }, 'pufferPulse'],
      [{ kind: 'areaKnockback', sourceId: 'puffer-pouch' }, 'pufferPulse'],
      [{ kind: 'spawnZone', sourceId: 'gecko-pads', tag: 'gecko-pad' }, 'geckoPad'],
      [{ kind: 'spawnZone', sourceId: 'razorstep-chimera', tag: 'razorstep-scythe-pad' }, 'geckoPad'],
      [{ kind: 'spawnZone', sourceId: 'skunk-brush', tag: 'stink-cloud' }, 'skunkCloud'],
      [{ kind: 'spawnZone', sourceId: 'royal-stinkcloud', tag: 'royal-stink' }, 'royalStink'],
      [{ kind: 'meleeArc', sourceId: 'mantis-scythes', meleeArcResolved: true }, 'mantisSweep'],
      [{ kind: 'applyAreaDamage', sourceId: 'crab-pincers' }, 'crabCrush'],
      [{ kind: 'areaKnockback', sourceId: 'armadillo-greaves' }, 'armadilloRoll'],
      [{ kind: 'applyAreaDamage', sourceId: 'meteor-mauler' }, 'meteorImpact'],
      [{ kind: 'spawnProjectileBurst', sourceId: 'porcupine-quills' }, 'quillVolley'],
      [{ kind: 'spawnProjectileBurst', sourceId: 'owl-pinions' }, 'owlPinions'],
      [{ kind: 'telegraph', sourceId: 'thornstorm-mantle', tag: 'thornstorm-inhale' }, 'thornstorm'],
      [{ kind: 'areaGather', sourceId: 'thornstorm-mantle' }, 'thornstorm'],
      [{ kind: 'radialProjectileBurst', sourceId: 'thornstorm-mantle' }, 'thornstorm'],
      [{ kind: 'telegraph', sourceId: 'thunderbug-dynamo', tag: 'thunderbug-charge' }, 'thunderbug'],
      [{
        kind: 'chainDamage', sourceId: 'thunderbug-dynamo', resolvedHitCount: 1,
        resolvedHitX: new Float32Array([108]), resolvedHitY: new Float32Array([132]),
      }, 'thunderbug'],
      [{
        kind: 'chainDamage', sourceId: 'electric-eel-coil', resolvedHitCount: 1,
        resolvedHitX: new Float32Array([108]), resolvedHitY: new Float32Array([132]),
      }, 'thunderbug'],
      [{ kind: 'orbitingDamage', sourceId: 'firefly-colony' }, 'fireflyOrbit'],
      [{ kind: 'orbitingDamage', sourceId: 'monarch-brood' }, 'monarchOrbit'],
      [{ kind: 'markTargets', sourceId: 'bat-ears', tag: 'echo-mark' }, 'batSonar'],
      [{ kind: 'markTargets', sourceId: 'midnight-radar', tag: 'night-vision' }, 'midnightRadar'],
    ];

    for (const [event, expectedClip] of routes) {
      expect(illustratedVfxClipForTraitEvent(trait(event))).toBe(expectedClip);
    }
  });

  it('does not show an illustrated chain card until a real endpoint exists', () => {
    expect(illustratedVfxClipForTraitEvent(trait({
      kind: 'chainDamage', sourceId: 'electric-eel-coil', resolvedHitCount: 0,
    }))).toBeNull();
    expect(illustratedVfxClipForTraitEvent(trait({
      kind: 'chainDamage', sourceId: 'thunderbug-dynamo', resolvedHitCount: 1,
      resolvedHitX: new Float32Array([54]), resolvedHitY: new Float32Array([72]),
    }))).toBe('thunderbug');
  });

  it('does not lend player art to unowned commands that merely share a command kind or tag', () => {
    expect(illustratedVfxClipForTraitEvent(trait({
      kind: 'spawnProjectileBurst', sourceId: 'hostile-volley', tag: 'porcupine-quills',
    }))).toBeNull();
    expect(illustratedVfxClipForTraitEvent(trait({
      kind: 'spawnZone', sourceId: 'enemy-cloud', tag: 'stink-cloud',
    }))).toBeNull();
    expect(illustratedVfxClipForTraitEvent(trait({
      kind: 'markTargets', sourceId: 'enemy-radar', tag: 'night-vision',
    }))).toBeNull();
    expect(illustratedVfxClipForTraitEvent(trait({
      kind: 'meleeArc', sourceId: 'mantis-scythes', meleeArcResolved: false,
    }))).toBeNull();
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
