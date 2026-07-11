import { describe, expect, it } from 'vitest';
import type { CombatFeedbackCue, CombatFeedbackSnapshot } from '../src/presentation/combat-feedback';
import {
  ATTACK_AUDIO_MIN_INTERVAL_TICKS,
  PLAYER_DAMAGE_AUDIO_MIN_INTERVAL_TICKS,
  PICKUP_AUDIO_MIN_INTERVAL_TICKS,
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

describe('audio cue router', () => {
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

  it('adds a sparse auto-attack texture without overtaking fresh player feedback', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });

    router.observe({ tick: 10, combatFeedback: feedback(10, [attack(10), pickup(10), playerHit(10)]), runOutcome: 'running' });
    router.observe({ tick: 11, combatFeedback: feedback(11, [attack(10), pickup(10), playerHit(10)]), runOutcome: 'running' });
    router.observe({ tick: 22, combatFeedback: feedback(22, [attack(22), pickup(22)]), runOutcome: 'running' });
    router.observe({ tick: 23, combatFeedback: feedback(23, [attack(22), pickup(22)]), runOutcome: 'running' });
    router.observe({ tick: 30, combatFeedback: feedback(30, [attack(30)]), runOutcome: 'running' });
    router.observe({
      tick: 30 + ATTACK_AUDIO_MIN_INTERVAL_TICKS - 1,
      combatFeedback: feedback(30 + ATTACK_AUDIO_MIN_INTERVAL_TICKS - 1, [attack(30 + ATTACK_AUDIO_MIN_INTERVAL_TICKS - 1)]),
      runOutcome: 'running',
    });
    router.observe({
      tick: 30 + ATTACK_AUDIO_MIN_INTERVAL_TICKS,
      combatFeedback: feedback(30 + ATTACK_AUDIO_MIN_INTERVAL_TICKS, [attack(30 + ATTACK_AUDIO_MIN_INTERVAL_TICKS)]),
      runOutcome: 'running',
    });

    expect(played).toEqual(['damage', 'pickup', 'attack', 'attack']);
  });

  it('does not let a rate-limited pickup fall through to an otherwise eligible attack', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });

    router.observe({ tick: 0, combatFeedback: feedback(0, [attack(0)]), runOutcome: 'running' });
    router.observe({ tick: 20, combatFeedback: feedback(20, [pickup(20)]), runOutcome: 'running' });
    router.observe({ tick: ATTACK_AUDIO_MIN_INTERVAL_TICKS, combatFeedback: feedback(ATTACK_AUDIO_MIN_INTERVAL_TICKS, [attack(ATTACK_AUDIO_MIN_INTERVAL_TICKS), pickup(ATTACK_AUDIO_MIN_INTERVAL_TICKS)]), runOutcome: 'running' });

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
