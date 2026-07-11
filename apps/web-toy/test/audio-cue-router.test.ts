import { describe, expect, it } from 'vitest';
import type { CombatFeedbackCue, CombatFeedbackSnapshot } from '../src/presentation/combat-feedback';
import {
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

  it('emits each terminal result once and resets cleanly for a new run', () => {
    const played: AudioCue[] = [];
    const router = createAudioCueRouter({ play: (cue) => played.push(cue) });

    router.observe({ tick: 100, combatFeedback: feedback(100), runOutcome: 'victory' });
    router.observe({ tick: 101, combatFeedback: feedback(101), runOutcome: 'victory' });
    router.resetForRestart();
    router.beginRun();
    router.observe({ tick: 1, combatFeedback: feedback(1), runOutcome: 'defeat' });
    router.observe({ tick: 2, combatFeedback: feedback(2), runOutcome: 'defeat' });

    expect(played).toEqual(['victory', 'start', 'defeat']);
  });
});
