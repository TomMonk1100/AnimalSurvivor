import { describe, expect, it, vi } from 'vitest';
import {
  createProceduralAudio,
  type AudioParamLike,
  type ProceduralAudioContext,
  type ProceduralGainNode,
  type ProceduralOscillatorNode,
} from '../src/audio/procedural-audio';

class FakeParam implements AudioParamLike {
  readonly values: Array<readonly [string, number, number]> = [];

  setValueAtTime(value: number, startTime: number): void {
    this.values.push(['set', value, startTime]);
  }

  linearRampToValueAtTime(value: number, endTime: number): void {
    this.values.push(['ramp', value, endTime]);
  }
}

class FakeGain implements ProceduralGainNode {
  readonly gain = new FakeParam();
  readonly targets: unknown[] = [];

  connect(destination: unknown): void {
    this.targets.push(destination);
  }
}

class FakeOscillator implements ProceduralOscillatorNode {
  type: 'sine' | 'square' | 'sawtooth' | 'triangle' = 'sine';
  readonly frequency = new FakeParam();
  readonly targets: unknown[] = [];
  readonly starts: number[] = [];
  readonly stops: number[] = [];

  connect(destination: unknown): void {
    this.targets.push(destination);
  }

  start(when = 0): void {
    this.starts.push(when);
  }

  stop(when = 0): void {
    this.stops.push(when);
  }
}

class FakeAudioContext implements ProceduralAudioContext {
  currentTime = 2;
  readonly destination = {};
  readonly gains: FakeGain[] = [];
  readonly oscillators: FakeOscillator[] = [];
  readonly resume = vi.fn(() => Promise.resolve());
  readonly suspend = vi.fn(() => Promise.resolve());
  readonly close = vi.fn(() => Promise.resolve());

  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }

  createOscillator(): FakeOscillator {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
}

describe('procedural audio', () => {
  it('does not create a browser context or synthesize sound before opt-in', () => {
    const context = new FakeAudioContext();
    const createContext = vi.fn(() => context);
    const audio = createProceduralAudio({ createContext });

    audio.play('pickup');

    expect(createContext).not.toHaveBeenCalled();
    expect(context.oscillators).toHaveLength(0);
  });

  it('creates and resumes one context only from opt-in, then synthesizes a quiet cue', () => {
    const context = new FakeAudioContext();
    const audio = createProceduralAudio({ createContext: () => context });

    expect(audio.setEnabled(true)).toBe(true);
    audio.play('upgrade');

    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(context.oscillators).toHaveLength(1);
    expect(context.gains).toHaveLength(1);
    expect(context.oscillators[0]!.frequency.values[0]).toEqual(['set', 659.25, 2]);
    expect(context.gains[0]!.gain.values).toContainEqual(['ramp', 0.0001, 2.14]);
  });

  it('fails nonfatally if an opted-in context cannot be created', () => {
    const onEnableFailure = vi.fn();
    const audio = createProceduralAudio({ createContext: () => null, onEnableFailure });

    expect(audio.setEnabled(true)).toBe(false);
    expect(audio.enabled).toBe(false);
    expect(onEnableFailure).toHaveBeenCalledTimes(1);
  });

  it('suspends on disable and closes the one owned context at teardown', () => {
    const context = new FakeAudioContext();
    const audio = createProceduralAudio({ createContext: () => context });

    audio.setEnabled(true);
    audio.setEnabled(false);
    audio.dispose();
    audio.dispose();

    expect(context.suspend).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
  });
});
