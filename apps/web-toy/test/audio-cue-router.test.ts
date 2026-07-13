import { describe, expect, it } from 'vitest';
import type { CombatFeedbackCue, CombatFeedbackSnapshot } from '../src/presentation/combat-feedback';
import {
  AUDIO_SOURCE_IDS,
  ATTACK_AUDIO_MIN_INTERVAL_TICKS,
  TRAIT_AUDIO_MIN_INTERVAL_TICKS,
  LIGHTNING_AUDIO_MIN_INTERVAL_TICKS,
  MELEE_AUDIO_MIN_INTERVAL_TICKS,
  ORBIT_AUDIO_MIN_INTERVAL_TICKS,
  PLAYER_DAMAGE_AUDIO_MIN_INTERVAL_TICKS,
  PICKUP_AUDIO_MIN_INTERVAL_TICKS,
  audioCueForSourceId,
  createAudioCueRouter,
  type AudioCue,
} from '../src/audio/audio-cue-router';

function pickup(tick: number): CombatFeedbackCue {
  return {
    tick,
    kind: 'pickup',
    x: 0,
    y: 0,
    intensity: 1,
    lifetimeTicks: 10,
    expiresAtTick: tick + 10,
  };
}

function playerHit(tick: number): CombatFeedbackCue {
  return {
    tick,
    kind: 'player-hit',
    x: 0,
    y: 0,
    intensity: 1,
    lifetimeTicks: 14,
    expiresAtTick: tick + 14,
  };
}

function attack(tick: number): CombatFeedbackCue {
  return {
    tick,
    kind: 'attack',
    x: 0,
    y: 0,
    intensity: 1,
    lifetimeTicks: 8,
    expiresAtTick: tick + 8,
  };
}

function feedback(tick: number, cues: readonly CombatFeedbackCue[] = []): CombatFeedbackSnapshot {
  return { tick, cues };
}

function lightning(tick: number, resolvedHitCount = 1) {
  return { kind: 'chainDamage', tick, resolvedHitCount };
}

function melee(tick: number, meleeArcResolved = true, dirX = 1, dirY = 0) {
  return { kind: 'meleeArc', tick, meleeArcResolved, dirX, dirY };
}

function orbit(tick: number) {
  return { kind: 'orbitingDamage', tick };
}

describe('audio cue router', () => {
  it('covers every current launch trait, instinct, and telegraph source', () => {
    expect(AUDIO_SOURCE_IDS).toEqual([
      'porcupine-quills', 'puffer-pouch', 'electric-eel-coil', 'firefly-colony',
      'mantis-scythes', 'gecko-pads', 'owl-pinions', 'bat-ears', 'crab-pincers',
      'armadillo-greaves', 'skunk-brush', 'monarch-brood', 'thornstorm-mantle',
      'thunderbug-dynamo', 'razorstep-chimera', 'midnight-radar', 'meteor-mauler',
      'royal-stinkcloud', 'greg-rush-rake', 'benny-brace', 'gracie-scout',
      'forest-final-threat', 'forest-support',
    ]);
    expect(audioCueForSourceId('porcupine-quills')).toBe('quills');
    expect(audioCueForSourceId('monarch-brood')).toBe('monarch');
    expect(audioCueForSourceId('royal-stinkcloud')).toBe('royal-stinkcloud');
    expect(audioCueForSourceId('greg-rush-rake')).toBe('greg');
    expect(audioCueForSourceId('forest-final-threat')).toBe('boss-telegraph');
    expect(audioCueForSourceId('unknown-source')).toBeNull();
  });

  it('routes source identity cues once with a fixed-tick rate limit', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });

    router.observe({
      tick: 10,
      combatFeedback: feedback(10),
      traitPresentationEvents: [{ kind: 'spawnProjectileBurst', sourceId: 'porcupine-quills', tick: 10 }],
      runOutcome: 'running',
    });
    router.observe({
      tick: 10 + TRAIT_AUDIO_MIN_INTERVAL_TICKS - 1,
      combatFeedback: feedback(10 + TRAIT_AUDIO_MIN_INTERVAL_TICKS - 1),
      traitPresentationEvents: [{ kind: 'spawnZone', sourceId: 'gecko-pads', tick: 10 + TRAIT_AUDIO_MIN_INTERVAL_TICKS - 1 }],
      runOutcome: 'running',
    });
    router.observe({
      tick: 10 + TRAIT_AUDIO_MIN_INTERVAL_TICKS,
      combatFeedback: feedback(10 + TRAIT_AUDIO_MIN_INTERVAL_TICKS),
      traitPresentationEvents: [{ kind: 'spawnZone', sourceId: 'gecko-pads', tick: 10 + TRAIT_AUDIO_MIN_INTERVAL_TICKS }],
      runOutcome: 'running',
    });

    expect(played).toEqual(['quills', 'gecko']);
  });

  it('uses hit-aware source voices for Eel, Mantis, Firefly, and Monarch contacts', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });

    router.observe({
      tick: 10,
      combatFeedback: feedback(10),
      traitPresentationEvents: [{ kind: 'chainDamage', sourceId: 'electric-eel-coil', tick: 10, resolvedHitCount: 1 }],
      runOutcome: 'running',
    });
    router.observe({
      tick: 10 + LIGHTNING_AUDIO_MIN_INTERVAL_TICKS,
      combatFeedback: feedback(10 + LIGHTNING_AUDIO_MIN_INTERVAL_TICKS),
      traitPresentationEvents: [{ kind: 'meleeArc', sourceId: 'mantis-scythes', tick: 10 + LIGHTNING_AUDIO_MIN_INTERVAL_TICKS, meleeArcResolved: true }],
      runOutcome: 'running',
    });
    router.observe({
      tick: 10 + LIGHTNING_AUDIO_MIN_INTERVAL_TICKS + MELEE_AUDIO_MIN_INTERVAL_TICKS,
      combatFeedback: feedback(10 + LIGHTNING_AUDIO_MIN_INTERVAL_TICKS + MELEE_AUDIO_MIN_INTERVAL_TICKS),
      traitPresentationEvents: [{ kind: 'orbitingDamage', sourceId: 'firefly-colony', tick: 10 + LIGHTNING_AUDIO_MIN_INTERVAL_TICKS + MELEE_AUDIO_MIN_INTERVAL_TICKS }],
      runOutcome: 'running',
    });
    router.observe({
      tick: 10 + LIGHTNING_AUDIO_MIN_INTERVAL_TICKS + MELEE_AUDIO_MIN_INTERVAL_TICKS + ORBIT_AUDIO_MIN_INTERVAL_TICKS,
      combatFeedback: feedback(10 + LIGHTNING_AUDIO_MIN_INTERVAL_TICKS + MELEE_AUDIO_MIN_INTERVAL_TICKS + ORBIT_AUDIO_MIN_INTERVAL_TICKS),
      traitPresentationEvents: [{ kind: 'orbitingDamage', sourceId: 'monarch-brood', tick: 10 + LIGHTNING_AUDIO_MIN_INTERVAL_TICKS + MELEE_AUDIO_MIN_INTERVAL_TICKS + ORBIT_AUDIO_MIN_INTERVAL_TICKS }],
      runOutcome: 'running',
    });

    expect(played).toEqual(['eel', 'mantis', 'firefly', 'monarch']);
  });

  it('keeps source identity below damage and does not turn a chain miss into a cue', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });

    router.observe({
      tick: 10,
      combatFeedback: feedback(10, [playerHit(10)]),
      traitPresentationEvents: [
        { kind: 'spawnProjectileBurst', sourceId: 'greg-rush-rake', tick: 10 },
        { kind: 'chainDamage', sourceId: 'electric-eel-coil', tick: 10, resolvedHitCount: 0 },
      ],
      runOutcome: 'running',
    });

    expect(played).toEqual(['damage']);
  });

  it('gives boss and support telegraphs their own lower-priority identities', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });

    router.observe({
      tick: 10,
      combatFeedback: feedback(10),
      traitPresentationEvents: [{ kind: 'telegraph', sourceId: 'forest-final-threat', tick: 10 }],
      runOutcome: 'running',
    });
    router.observe({
      tick: 10 + TRAIT_AUDIO_MIN_INTERVAL_TICKS,
      combatFeedback: feedback(10 + TRAIT_AUDIO_MIN_INTERVAL_TICKS),
      traitPresentationEvents: [{ kind: 'telegraph', sourceId: 'forest-support', tick: 10 + TRAIT_AUDIO_MIN_INTERVAL_TICKS }],
      runOutcome: 'running',
    });

    expect(played).toEqual(['boss-telegraph', 'enemy-warning']);
  });

  it('makes start and upgrade prompts idempotent within one run', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });

    router.beginRun();
    router.beginRun();
    router.upgradeOpened(1);
    router.upgradeOpened(1);
    router.upgradeOpened(2);

    expect(played).toEqual(['start', 'upgrade', 'upgrade']);
  });

  it('routes boss warning and arrival events once by director sequence', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });
    const events = [
      { kind: 'bossWarning', tick: 100, seq: 4, phase: 'boss' as const },
      { kind: 'bossRequested', tick: 200, seq: 5, phase: 'boss' as const },
    ];

    router.observe({ tick: 100, combatFeedback: feedback(100), directorEvents: events, runOutcome: 'running' });
    router.observe({ tick: 201, combatFeedback: feedback(201), directorEvents: events, runOutcome: 'running' });

    expect(played).toEqual(['boss-warning', 'boss-arrive']);
  });

  it('plays at most one fresh pickup from retained or catch-up feedback', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });

    router.observe({ tick: 14, combatFeedback: feedback(14, [pickup(10), pickup(11), pickup(12), pickup(13), pickup(14)]), runOutcome: 'running' });
    router.observe({ tick: 14, combatFeedback: feedback(14, [pickup(10), pickup(11), pickup(12), pickup(13), pickup(14)]), runOutcome: 'running' });
    router.observe({ tick: 14 + PICKUP_AUDIO_MIN_INTERVAL_TICKS, combatFeedback: feedback(14 + PICKUP_AUDIO_MIN_INTERVAL_TICKS, [pickup(14 + PICKUP_AUDIO_MIN_INTERVAL_TICKS)]), runOutcome: 'running' });

    expect(played).toEqual(['pickup', 'pickup']);
  });

  it('does not let rate-limited pickup history leak out later', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });

    router.observe({ tick: 10, combatFeedback: feedback(10, [pickup(10)]), runOutcome: 'running' });
    router.observe({ tick: 15, combatFeedback: feedback(15, [pickup(15)]), runOutcome: 'running' });
    router.observe({ tick: 21, combatFeedback: feedback(21, [pickup(15)]), runOutcome: 'running' });
    router.observe({ tick: 22, combatFeedback: feedback(22, [pickup(22)]), runOutcome: 'running' });

    expect(played).toEqual(['pickup', 'pickup']);
  });

  it('gives fresh player damage a rate-limited priority over a same-frame pickup', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });

    router.observe({ tick: 10, combatFeedback: feedback(10, [playerHit(10), pickup(10)]), runOutcome: 'running' });
    router.observe({ tick: 11, combatFeedback: feedback(11, [playerHit(10), pickup(10)]), runOutcome: 'running' });
    router.observe({ tick: 22, combatFeedback: feedback(22, [pickup(22)]), runOutcome: 'running' });
    router.observe({
      tick: 10 + PLAYER_DAMAGE_AUDIO_MIN_INTERVAL_TICKS - 1,
      combatFeedback: feedback(10 + PLAYER_DAMAGE_AUDIO_MIN_INTERVAL_TICKS - 1, [playerHit(10 + PLAYER_DAMAGE_AUDIO_MIN_INTERVAL_TICKS - 1)]),
      runOutcome: 'running',
    });
    router.observe({
      tick: 10 + PLAYER_DAMAGE_AUDIO_MIN_INTERVAL_TICKS,
      combatFeedback: feedback(10 + PLAYER_DAMAGE_AUDIO_MIN_INTERVAL_TICKS, [playerHit(10 + PLAYER_DAMAGE_AUDIO_MIN_INTERVAL_TICKS)]),
      runOutcome: 'running',
    });

    expect(played).toEqual(['damage', 'pickup', 'damage']);
  });

  it('keeps damage ahead of a same-frame attack and pickup', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });

    router.observe({ tick: 10, combatFeedback: feedback(10, [attack(10), pickup(10), playerHit(10)]), runOutcome: 'running' });
    router.observe({ tick: 11, combatFeedback: feedback(11, [attack(10), pickup(10), playerHit(10)]), runOutcome: 'running' });

    expect(played).toEqual(['damage']);
  });

  it('gives a resolved lightning chain priority after damage and before ordinary attack feedback', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });

    router.observe({
      tick: 10,
      combatFeedback: feedback(10, [attack(10), pickup(10), playerHit(10)]),
      traitPresentationEvents: [lightning(10), melee(10)],
      runOutcome: 'running',
    });
    router.observe({
      tick: 10 + PLAYER_DAMAGE_AUDIO_MIN_INTERVAL_TICKS,
      combatFeedback: feedback(10 + PLAYER_DAMAGE_AUDIO_MIN_INTERVAL_TICKS, [
        attack(10 + PLAYER_DAMAGE_AUDIO_MIN_INTERVAL_TICKS),
        pickup(10 + PLAYER_DAMAGE_AUDIO_MIN_INTERVAL_TICKS),
      ]),
      traitPresentationEvents: [lightning(10 + PLAYER_DAMAGE_AUDIO_MIN_INTERVAL_TICKS), melee(10 + PLAYER_DAMAGE_AUDIO_MIN_INTERVAL_TICKS)],
      runOutcome: 'running',
    });

    expect(played).toEqual(['damage', 'lightning']);
  });

  it('rate-limits resolved lightning without replaying suppressed history later', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });

    router.observe({
      tick: 0,
      combatFeedback: feedback(0),
      traitPresentationEvents: [lightning(0)],
      runOutcome: 'running',
    });
    router.observe({
      tick: LIGHTNING_AUDIO_MIN_INTERVAL_TICKS - 1,
      combatFeedback: feedback(LIGHTNING_AUDIO_MIN_INTERVAL_TICKS - 1, [attack(LIGHTNING_AUDIO_MIN_INTERVAL_TICKS - 1)]),
      traitPresentationEvents: [lightning(LIGHTNING_AUDIO_MIN_INTERVAL_TICKS - 1)],
      runOutcome: 'running',
    });
    router.observe({
      tick: LIGHTNING_AUDIO_MIN_INTERVAL_TICKS,
      combatFeedback: feedback(LIGHTNING_AUDIO_MIN_INTERVAL_TICKS),
      traitPresentationEvents: [lightning(LIGHTNING_AUDIO_MIN_INTERVAL_TICKS - 1)],
      runOutcome: 'running',
    });
    router.observe({
      tick: LIGHTNING_AUDIO_MIN_INTERVAL_TICKS * 2,
      combatFeedback: feedback(LIGHTNING_AUDIO_MIN_INTERVAL_TICKS * 2),
      traitPresentationEvents: [lightning(LIGHTNING_AUDIO_MIN_INTERVAL_TICKS * 2)],
      runOutcome: 'running',
    });

    expect(played).toEqual(['lightning', 'attack', 'lightning']);
  });

  it('does not route a lightning cue when the chain resolved no targets', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });

    router.observe({
      tick: 10,
      combatFeedback: feedback(10, [attack(10)]),
      traitPresentationEvents: [lightning(10, 0)],
      runOutcome: 'running',
    });

    expect(played).toEqual(['attack']);
  });

  it('routes a resolved Mantis swish ahead of ordinary attack and pickup, with its own rate limit', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });

    router.observe({
      tick: 10,
      combatFeedback: feedback(10, [attack(10), pickup(10)]),
      traitPresentationEvents: [melee(10)],
      runOutcome: 'running',
    });
    router.observe({
      tick: 10 + MELEE_AUDIO_MIN_INTERVAL_TICKS - 1,
      combatFeedback: feedback(10 + MELEE_AUDIO_MIN_INTERVAL_TICKS - 1, [attack(10 + MELEE_AUDIO_MIN_INTERVAL_TICKS - 1)]),
      traitPresentationEvents: [melee(10 + MELEE_AUDIO_MIN_INTERVAL_TICKS - 1)],
      runOutcome: 'running',
    });
    router.observe({
      tick: 10 + MELEE_AUDIO_MIN_INTERVAL_TICKS,
      combatFeedback: feedback(10 + MELEE_AUDIO_MIN_INTERVAL_TICKS, [attack(10 + MELEE_AUDIO_MIN_INTERVAL_TICKS)]),
      traitPresentationEvents: [melee(10 + MELEE_AUDIO_MIN_INTERVAL_TICKS)],
      runOutcome: 'running',
    });

    expect(played).toEqual(['melee', 'attack', 'melee']);
  });

  it('does not route a Mantis swish when the executor acquired no target', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });

    router.observe({
      tick: 10,
      combatFeedback: feedback(10, [attack(10)]),
      // Non-zero authored/fallback direction must not cause a targetless arc
      // to play as if it struck an enemy.
      traitPresentationEvents: [melee(10, false, 1, 0)],
      runOutcome: 'running',
    });

    expect(played).toEqual(['attack']);
  });

  it('routes orbiting firefly contact after urgent strikes and rate-limits its shimmer', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });

    router.observe({
      tick: 10,
      combatFeedback: feedback(10, [attack(10), pickup(10)]),
      traitPresentationEvents: [orbit(10)],
      runOutcome: 'running',
    });
    router.observe({
      tick: 10 + ORBIT_AUDIO_MIN_INTERVAL_TICKS - 1,
      combatFeedback: feedback(10 + ORBIT_AUDIO_MIN_INTERVAL_TICKS - 1),
      traitPresentationEvents: [orbit(10 + ORBIT_AUDIO_MIN_INTERVAL_TICKS - 1)],
      runOutcome: 'running',
    });
    router.observe({
      tick: 10 + ORBIT_AUDIO_MIN_INTERVAL_TICKS,
      combatFeedback: feedback(10 + ORBIT_AUDIO_MIN_INTERVAL_TICKS),
      traitPresentationEvents: [orbit(10 + ORBIT_AUDIO_MIN_INTERVAL_TICKS)],
      runOutcome: 'running',
    });

    expect(played).toEqual(['orbit', 'orbit']);
  });

  it('lets sparse attack punctuation through a steady pickup stream', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });

    router.observe({ tick: 0, combatFeedback: feedback(0, [attack(0), pickup(0)]), runOutcome: 'running' });
    router.observe({ tick: PICKUP_AUDIO_MIN_INTERVAL_TICKS, combatFeedback: feedback(PICKUP_AUDIO_MIN_INTERVAL_TICKS, [attack(PICKUP_AUDIO_MIN_INTERVAL_TICKS), pickup(PICKUP_AUDIO_MIN_INTERVAL_TICKS)]), runOutcome: 'running' });
    router.observe({ tick: PICKUP_AUDIO_MIN_INTERVAL_TICKS * 2, combatFeedback: feedback(PICKUP_AUDIO_MIN_INTERVAL_TICKS * 2, [attack(PICKUP_AUDIO_MIN_INTERVAL_TICKS * 2), pickup(PICKUP_AUDIO_MIN_INTERVAL_TICKS * 2)]), runOutcome: 'running' });
    router.observe({ tick: ATTACK_AUDIO_MIN_INTERVAL_TICKS, combatFeedback: feedback(ATTACK_AUDIO_MIN_INTERVAL_TICKS, [attack(ATTACK_AUDIO_MIN_INTERVAL_TICKS), pickup(ATTACK_AUDIO_MIN_INTERVAL_TICKS)]), runOutcome: 'running' });

    expect(played).toEqual(['attack', 'pickup', 'pickup', 'attack']);
  });

  it('does not replay an attack or pickup while either channel is rate-limited', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });

    router.observe({ tick: 0, combatFeedback: feedback(0, [attack(0)]), runOutcome: 'running' });
    router.observe({ tick: 20, combatFeedback: feedback(20, [pickup(20)]), runOutcome: 'running' });
    const stillRateLimitedTick = 20 + PICKUP_AUDIO_MIN_INTERVAL_TICKS - 1;
    router.observe({ tick: stillRateLimitedTick, combatFeedback: feedback(stillRateLimitedTick, [attack(stillRateLimitedTick), pickup(stillRateLimitedTick)]), runOutcome: 'running' });

    expect(played).toEqual(['attack', 'pickup']);
  });

  it('emits each terminal result once and resets cleanly for a new run', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });

    router.observe({ tick: 100, combatFeedback: feedback(100), runOutcome: 'victory' });
    router.observe({ tick: 101, combatFeedback: feedback(101), runOutcome: 'victory' });
    router.resetForRestart();
    router.beginRun();
    router.observe({ tick: 1, combatFeedback: feedback(1, [playerHit(1)]), runOutcome: 'defeat' });
    router.observe({ tick: 2, combatFeedback: feedback(2), runOutcome: 'defeat' });

    expect(played).toEqual(['victory', 'start', 'defeat']);
  });
});
