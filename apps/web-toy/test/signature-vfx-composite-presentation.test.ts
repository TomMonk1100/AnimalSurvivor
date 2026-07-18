import { describe, expect, it } from 'vitest';
import type { TraitPresentationEventView } from '@sim';
import type { CombatPresentationEventView } from '../src/presentation/combat-presentation-events';
import {
  SIGNATURE_VFX_GROUND_CONTACT_OPACITY_CAP,
  createSignatureVfxCompositePresentation,
  signatureVfxDebrisCountForCritical,
  signatureVfxIllustratedPriorityForClip,
} from '../src/render/signature-vfx-composite-presentation';
import type { WildguardVfxClip } from '../src/render/wildguard-vfx-atlas';
import { envelope } from '../src/render/vfx-easing';

function trait(overrides: Partial<TraitPresentationEventView> = {}): TraitPresentationEventView {
  return {
    kind: 'meleeArc',
    sourceId: 'greg-fox-swipe',
    tick: 60,
    targeting: 'nearest',
    originX: 96,
    originY: 72,
    dirX: 1,
    dirY: 0,
    count: 1,
    damage: 24,
    speed: 0,
    radius: 32,
    strength: 1,
    durationTicks: 0,
    intervalTicks: 0,
    amount: 0,
    arc: Math.PI / 2,
    meleeArcResolved: true,
    facing: 0,
    spread: 0,
    jumps: 0,
    range: 32,
    tag: 'greg-fox-swipe',
    resolvedHitCount: 0,
    resolvedHitX: new Float32Array(0),
    resolvedHitY: new Float32Array(0),
    resolvedOrbitHitCount: 0,
    resolvedOrbitHitX: new Float32Array(0),
    resolvedOrbitHitY: new Float32Array(0),
    resolvedOrbitSourceX: new Float32Array(0),
    resolvedOrbitSourceY: new Float32Array(0),
    ...overrides,
  };
}

function combat(overrides: Partial<CombatPresentationEventView> = {}): CombatPresentationEventView {
  return {
    kind: 'enemyHit',
    tick: 60,
    x: 112,
    y: 76,
    amount: 24,
    critical: true,
    sourceId: 'porcupine-quills',
    targetId: 1,
    pickupKind: null,
    ...overrides,
  };
}

/** Every existing router route that is a one-shot player cast or resolved impact. */
const COMPOSITE_PLAYER_ATTACKS: readonly (readonly [Partial<TraitPresentationEventView>, WildguardVfxClip])[] = [
  [{ kind: 'meleeArc', sourceId: 'greg-fox-swipe', tag: 'greg-fox-swipe', meleeArcResolved: true }, 'foxSwipe'],
  [{ kind: 'meleeArc', sourceId: 'greg-rush-rake', tag: 'greg-rush-rake', meleeArcResolved: true }, 'foxSwipe'],
  [{ kind: 'telegraph', sourceId: 'benny-trample', tag: 'benny-trample-wave' }, 'earthWave'],
  [{ kind: 'areaKnockback', sourceId: 'benny-brace', tag: 'benny-brace' }, 'earthWave'],
  [{ kind: 'areaGather', sourceId: 'puffer-pouch', tag: '' }, 'pufferPulse'],
  [{ kind: 'areaKnockback', sourceId: 'puffer-pouch', tag: '' }, 'pufferPulse'],
  [{ kind: 'meleeArc', sourceId: 'mantis-scythes', tag: '', meleeArcResolved: true }, 'mantisSweep'],
  [{ kind: 'applyAreaDamage', sourceId: 'crab-pincers', tag: '' }, 'crabCrush'],
  [{ kind: 'areaKnockback', sourceId: 'armadillo-greaves', tag: '' }, 'armadilloRoll'],
  [{ kind: 'applyAreaDamage', sourceId: 'meteor-mauler', tag: '' }, 'meteorImpact'],
  [{ kind: 'spawnProjectileBurst', sourceId: 'porcupine-quills', tag: '' }, 'quillVolley'],
  [{ kind: 'spawnProjectileBurst', sourceId: 'owl-pinions', tag: '' }, 'owlPinions'],
  [{ kind: 'telegraph', sourceId: 'thornstorm-mantle', tag: 'thornstorm-inhale' }, 'thornstorm'],
  [{ kind: 'areaGather', sourceId: 'thornstorm-mantle', tag: '' }, 'thornstorm'],
  [{ kind: 'radialProjectileBurst', sourceId: 'thornstorm-mantle', tag: '' }, 'thornstorm'],
  [{ kind: 'telegraph', sourceId: 'thunderbug-dynamo', tag: 'thunderbug-charge' }, 'thunderbug'],
  [{
    kind: 'chainDamage', sourceId: 'thunderbug-dynamo', tag: '', resolvedHitCount: 1,
    resolvedHitX: new Float32Array([108]), resolvedHitY: new Float32Array([132]),
  }, 'thunderbug'],
  [{
    kind: 'chainDamage', sourceId: 'electric-eel-coil', tag: '', resolvedHitCount: 1,
    resolvedHitX: new Float32Array([108]), resolvedHitY: new Float32Array([132]),
  }, 'thunderbug'],
];

/** Routes deliberately excluded from compact cast/impact anatomy. */
const PERSISTENT_UTILITY_OR_SNAPSHOT_PROJECTILE_ROUTES: readonly Partial<TraitPresentationEventView>[] = [
  // Gracie's head-tail body follows the real live projectile snapshot. A
  // hero-origin telegraph must never add a second, invented travelling comet.
  { kind: 'telegraph', sourceId: 'gracie-spit', tag: 'gracie-spit', meleeArcResolved: false },
  { kind: 'spawnProjectileBurst', sourceId: 'gracie-spit', tag: 'gracie-spit', meleeArcResolved: false },
  { kind: 'grantShield', sourceId: 'fluffy-shield', tag: 'fluffy-shield', meleeArcResolved: false },
  { kind: 'playTraitCue', sourceId: 'armor-block', tag: 'armor-block', meleeArcResolved: false },
  { kind: 'telegraph', sourceId: 'gracie-scout', tag: 'gracie-scout', meleeArcResolved: false },
  { kind: 'spawnZone', sourceId: 'gecko-pads', tag: 'gecko-pad', meleeArcResolved: false },
  { kind: 'spawnZone', sourceId: 'skunk-brush', tag: 'stink-cloud', meleeArcResolved: false },
  { kind: 'spawnZone', sourceId: 'royal-stinkcloud', tag: 'royal-stink', meleeArcResolved: false },
  { kind: 'orbitingDamage', sourceId: 'firefly-colony', tag: '', meleeArcResolved: false },
  { kind: 'orbitingDamage', sourceId: 'monarch-brood', tag: '', meleeArcResolved: false },
  { kind: 'markTargets', sourceId: 'bat-ears', tag: 'echo-mark', meleeArcResolved: false },
  { kind: 'markTargets', sourceId: 'midnight-radar', tag: 'night-vision', meleeArcResolved: false },
];

describe('signature VFX composite presentation', () => {
  it('admits only existing player cast/impact routes and excludes zones, utility cues, and snapshot-owned projectiles', () => {
    const composite = createSignatureVfxCompositePresentation({ capacity: 64 });
    const events = [
      ...COMPOSITE_PLAYER_ATTACKS.map(([overrides]) => trait(overrides)),
      ...PERSISTENT_UTILITY_OR_SNAPSHOT_PROJECTILE_ROUTES.map((overrides) => trait(overrides)),
    ];
    const frame = composite.update(60, events);
    const expectedClips = COMPOSITE_PLAYER_ATTACKS.map(([, expectedClip]) => expectedClip);

    expect(frame.cores.count).toBe(expectedClips.length);
    expect(frame.groundContacts.count).toBe(expectedClips.length);
    expect(frame.cores.clip.slice(0, frame.cores.count)).toEqual(expectedClips);
    expect(frame.groundContacts.clip.slice(0, frame.groundContacts.count)).toEqual(expectedClips);
    for (let index = 0; index < frame.groundContacts.count; index++) {
      expect(frame.groundContacts.opacity[index]).toBeLessThanOrEqual(SIGNATURE_VFX_GROUND_CONTACT_OPACITY_CAP);
    }
  });

  it('uses seven shards only for a matching copied critical impact', () => {
    const composite = createSignatureVfxCompositePresentation({ capacity: 4 });
    const fox = trait();
    const normalSignature = composite.update(60, [fox]);
    const firstSeeds = Array.from(normalSignature.debris.seed.slice(0, normalSignature.debris.count));

    expect(normalSignature.cores.critical[0]).toBe(0);
    expect(normalSignature.debris.count).toBe(3);
    expect(new Set(firstSeeds).size).toBe(3);

    composite.reset();
    const evolved = composite.update(60, [trait({
      kind: 'applyAreaDamage', sourceId: 'meteor-mauler', tag: '', meleeArcResolved: false,
    })]);
    expect(evolved.cores.clip[0]).toBe('meteorImpact');
    expect(evolved.cores.critical[0]).toBe(0);
    expect(evolved.debris.count).toBe(3);

    composite.reset();
    const routineEvent = trait({
      kind: 'spawnProjectileBurst', sourceId: 'porcupine-quills', tag: '', meleeArcResolved: false,
    });
    const routine = composite.update(60, [routineEvent]);
    expect(routine.cores.clip[0]).toBe('quillVolley');
    expect(routine.cores.critical[0]).toBe(0);
    expect(routine.debris.count).toBe(3);

    composite.reset();
    const critical = composite.update(60, [routineEvent], [combat()]);
    expect(critical.cores.critical[0]).toBe(1);
    expect(critical.debris.count).toBe(7);
    expect(critical.debris.critical[0]).toBe(1);

    composite.reset();
    const nonCritical = composite.update(60, [routineEvent], [combat({ critical: false })]);
    expect(nonCritical.debris.count).toBe(3);

    composite.reset();
    const unmatchedCritical = composite.update(60, [routineEvent], [combat({ sourceId: 'meteor-mauler' })]);
    expect(unmatchedCritical.debris.count).toBe(3);
    expect(signatureVfxDebrisCountForCritical(false)).toBe(3);
    expect(signatureVfxDebrisCountForCritical(true)).toBe(7);

    composite.reset();
    const repeated = composite.update(60, [fox]);
    expect(Array.from(repeated.debris.seed.slice(0, repeated.debris.count))).toEqual(firstSeeds);
  });

  it('keeps the core inside its four-tick ceiling, uses an envelope contact fade, and reuses frame buffers', () => {
    const composite = createSignatureVfxCompositePresentation({ capacity: 2, coreLifetimeTicks: 4 });
    const first = composite.update(60, [trait()]);
    const cores = first.cores;
    const debris = first.debris;
    const groundContacts = first.groundContacts;
    const expectedFirstContactOpacity = SIGNATURE_VFX_GROUND_CONTACT_OPACITY_CAP * envelope(
      0.5 / (composite.groundContactLifetimeTicks + 0.5),
      0.12,
      0.55,
    );

    expect(first.cores.count).toBe(1);
    expect(first.cores.opacity[0]).toBeGreaterThan(0);
    expect(first.cores.scale[0]).toBeGreaterThan(32 * 0.19);
    expect(first.cores.scale[0]).toBeLessThanOrEqual(32 * 0.25 + 0.001);
    expect(first.groundContacts.opacity[0]).toBeCloseTo(expectedFirstContactOpacity, 6);
    const atLastCoreTick = composite.update(63, []);
    expect(atLastCoreTick.cores.count).toBe(1);
    expect(atLastCoreTick.cores.opacity[0]).toBe(0);
    expect(atLastCoreTick.cores.scale[0]).toBeGreaterThan(32 * 0.21);
    expect(atLastCoreTick.cores.scale[0]).toBeLessThanOrEqual(32 * 0.25 + 0.001);
    const afterCore = composite.update(64, []);
    expect(afterCore.cores.count).toBe(0);
    expect(afterCore.debris.count).toBe(3);
    expect(afterCore.groundContacts.count).toBe(1);
    const terminalGround = composite.update(60 + composite.groundContactLifetimeTicks, []);
    expect(terminalGround.groundContacts.count).toBe(1);
    expect(terminalGround.groundContacts.opacity[0]).toBe(0);

    expect(terminalGround).toBe(first);
    expect(terminalGround.cores).toBe(cores);
    expect(terminalGround.debris).toBe(debris);
    expect(terminalGround.groundContacts).toBe(groundContacts);
  });

  it('keeps Benny’s grounded ridge tied to its authoritative wave while visibly rolling forward', () => {
    const bennyComposite = createSignatureVfxCompositePresentation({ capacity: 2 });
    const benny = trait({
      kind: 'telegraph', sourceId: 'benny-trample', tag: 'benny-trample-wave',
      radius: 34, range: 34, meleeArcResolved: false,
    });
    const bennyCoreFrame = bennyComposite.update(62, [benny]);
    expect(bennyCoreFrame.cores.count).toBe(1);
    expect(bennyCoreFrame.cores.x[0]).toBeGreaterThan(bennyCoreFrame.groundContacts.x[0]! + 6);
    const bennyFrame = bennyComposite.update(64, []);
    expect(bennyFrame.groundContacts.count).toBe(1);
    // Each simulation event owns its forward location. Its normal-blend
    // contact follows the same bounded presentation-only roll as that exact
    // ridge, rather than manufacturing a separate damage wave.
    // The strengthened renderer-only follow-through must be materially ahead
    // of the cast origin in grayscale, yet remain a bounded one-ridge read.
    expect(bennyFrame.groundContacts.x[0]).toBeGreaterThan(benny.originX + 34);
    expect(bennyFrame.groundContacts.x[0]).toBeLessThan(benny.originX + 44);
    expect(bennyFrame.groundContacts.scale[0]).toBeGreaterThan(30);
    expect(bennyFrame.groundContacts.scale[0]).toBeLessThan(56);
    expect(bennyFrame.groundContacts.opacity[0]).toBeLessThanOrEqual(SIGNATURE_VFX_GROUND_CONTACT_OPACITY_CAP);
    // A routine Trample's three chunks march down its one rendered lane rather
    // than forming a static lateral pile. The real burst remains simulation-
    // owned; these visual chips cannot create an additional hit sequence.
    expect(bennyFrame.debris.count).toBe(3);
    const ridgeX = Array.from(bennyFrame.debris.x.slice(0, 3)).sort((left, right) => left - right);
    const ridgeY = Array.from(bennyFrame.debris.y.slice(0, 3)).sort((top, bottom) => top - bottom);
    expect(ridgeX[2]! - ridgeX[0]!).toBeGreaterThan(18);
    expect(ridgeY[0]!).toBeLessThan(benny.originY - 5);
    expect(ridgeY[2]!).toBeGreaterThan(benny.originY + 5);
    // The three route-owned majors use the upper P2 readability budget; they
    // remain large enough to survive the forest floor as a coherent ridge.
    expect(Math.min(...Array.from(bennyFrame.debris.scale.slice(0, 3)))).toBeGreaterThan(11);
    expect(Math.min(...Array.from(bennyFrame.debris.lift.slice(0, 3)))).toBeGreaterThan(2);

    const earlyFirstChunkX = bennyFrame.debris.x[0]!;
    const earlyContactOpacity = bennyFrame.groundContacts.opacity[0]!;
    const laterRidge = bennyComposite.update(70, []);
    expect(laterRidge.debris.count).toBe(3);
    expect(laterRidge.debris.x[0]!).toBeGreaterThan(earlyFirstChunkX + 10);
    // The quiet contact clears before the body terminal tick, preventing a
    // stationary crater from accumulating after the leading crest passes.
    expect(laterRidge.groundContacts.opacity[0]!).toBeLessThan(earlyContactOpacity);

    // The 20-tick Trample body cannot outlive its ground anchor.
    const terminalRidge = bennyComposite.update(80, []);
    expect(terminalRidge.groundContacts.count).toBe(1);
    expect(terminalRidge.groundContacts.opacity[0]).toBe(0);
  });

  it('keeps Greg’s three routine shards distinct from the painted swipe without adding glow or count', () => {
    const composite = createSignatureVfxCompositePresentation({ capacity: 2 });
    const fox = trait({ radius: 46, range: 46 });
    const frame = composite.update(62, [fox]);

    expect(frame.debris.count).toBe(3);
    expect(Array.from(frame.debris.critical.slice(0, 3))).toEqual([0, 0, 0]);
    expect(Math.min(...Array.from(frame.debris.scale.slice(0, 3)))).toBeGreaterThan(46 * 0.16);
    expect(Math.max(...Array.from(frame.debris.opacity.slice(0, 3)))).toBeLessThanOrEqual(0.6);

    const shardPositions = Array.from({ length: 3 }, (_, index) => ({
      x: frame.debris.x[index]!,
      y: frame.debris.y[index]!,
    }));
    for (let left = 0; left < shardPositions.length; left++) {
      for (let right = left + 1; right < shardPositions.length; right++) {
        const dx = shardPositions[left]!.x - shardPositions[right]!.x;
        const dy = shardPositions[left]!.y - shardPositions[right]!.y;
        expect(Math.hypot(dx, dy)).toBeGreaterThan(6);
      }
    }
  });

  it('matches illustrated priority admission rather than using critical status as a pool priority', () => {
    const composite = createSignatureVfxCompositePresentation({ capacity: 1 });
    const routine = trait({ kind: 'areaGather', sourceId: 'puffer-pouch', tag: '', meleeArcResolved: false });
    const topPrioritySignature = trait({ tick: 61 });
    const lowPriorityRoutine = trait({
      tick: 62, kind: 'spawnProjectileBurst', sourceId: 'porcupine-quills', tag: '', meleeArcResolved: false,
    });

    expect(signatureVfxIllustratedPriorityForClip('pufferPulse')).toBe(2);
    expect(signatureVfxIllustratedPriorityForClip('mantisSweep')).toBe(3);
    expect(signatureVfxIllustratedPriorityForClip('foxSwipe')).toBe(4);
    composite.update(60, [routine]);
    const replacing = composite.update(61, [topPrioritySignature]);
    expect(replacing.cores.clip[0]).toBe('foxSwipe');
    expect(replacing.cores.priority[0]).toBe(4);

    const protectedTopPriority = composite.update(62, [lowPriorityRoutine]);
    expect(protectedTopPriority.cores.clip[0]).toBe('foxSwipe');
    expect(protectedTopPriority.cores.priority[0]).toBe(4);
  });
});
