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

  it('creates and resumes one context only from opt-in, then synthesizes a distinct upgrade cue', () => {
    const context = new FakeAudioContext();
    const audio = createProceduralAudio({ createContext: () => context });

    expect(audio.setEnabled(true)).toBe(true);
    const musicVoiceCount = context.oscillators.length;
    audio.play('upgrade');

    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(musicVoiceCount).toBeGreaterThan(12);
    const upgradeVoices = context.oscillators.slice(musicVoiceCount);
    expect(upgradeVoices.map((oscillator) => oscillator.frequency.values[0])).toEqual([
      ['set', 523.25, 2],
      ['set', 783.99, 2.1],
      ['set', 1046.5, 2.2],
    ]);
    expect(upgradeVoices.map((oscillator) => oscillator.type)).toEqual(['triangle', 'sine', 'triangle']);
    expect(upgradeVoices.every((oscillator) => oscillator.stops.length === 1)).toBe(true);
  });

  it('keeps startup, damage, lightning, and sparse auto-attack feedback distinct from the upgrade cue', () => {
    const context = new FakeAudioContext();
    const audio = createProceduralAudio({ createContext: () => context });

    audio.setEnabled(true);
    const firstSfxVoice = context.oscillators.length;
    audio.play('start');
    audio.play('damage');
    audio.play('lightning');
    audio.play('attack');

    const combatVoices = context.oscillators.slice(firstSfxVoice);
    expect(combatVoices.map((oscillator) => oscillator.frequency.values[0]?.[1])).toEqual([
      293.66, 440, 196, 98, 1760, 1174.66, 329.63, 659.25,
    ]);
    expect(combatVoices.map((oscillator) => oscillator.type)).toEqual([
      'triangle', 'sine', 'sawtooth', 'triangle', 'square', 'triangle', 'triangle', 'sine',
    ]);
    expect(combatVoices.every((oscillator) => oscillator.stops.length === 1)).toBe(true);
  });

  it('gives Mantis an authored descending scythe voice, not the generic auto-fire pop', () => {
    const context = new FakeAudioContext();
    const audio = createProceduralAudio({ createContext: () => context });

    audio.setEnabled(true);
    const firstSfxVoice = context.oscillators.length;
    audio.play('mantis');

    const voices = context.oscillators.slice(firstSfxVoice);
    expect(voices.map((oscillator) => oscillator.frequency.values[0])).toEqual([
      ['set', 880, 2],
      ['set', 523.25, 2.018],
    ]);
    expect(voices.map((oscillator) => oscillator.frequency.values[1]?.[1])).toEqual([246.94, 174.61]);
    expect(voices[0]!.frequency.values[1]?.[2]).toBeCloseTo(2.1131, 6);
    expect(voices[1]!.frequency.values[1]?.[2]).toBeCloseTo(2.1116, 6);
    expect(voices.map((oscillator) => oscillator.type)).toEqual(['sawtooth', 'triangle']);
  });

  it('exposes validated master/music/SFX mix controls and stateful music profiles', () => {
    const context = new FakeAudioContext();
    const audio = createProceduralAudio({ createContext: () => context });

    audio.setMix({ masterVolume: 0.5, musicVolume: 0.2, sfxVolume: 0.25 });
    expect(audio.mix).toEqual({ masterVolume: 0.5, musicVolume: 0.2, sfxVolume: 0.25 });
    expect(() => audio.setMix({ masterVolume: 1.1 })).toThrow(/masterVolume/);

    audio.setEnabled(true);
    const openingVoiceCount = context.oscillators.length;
    audio.setMusicState('boss');
    expect(audio.musicState).toBe('boss');
    const bossVoices = context.oscillators.slice(openingVoiceCount);
    expect(bossVoices.length).toBeGreaterThan(20);
    expect(bossVoices.some((oscillator) => oscillator.type === 'sawtooth' && oscillator.frequency.values[0]?.[1] === 65.41)).toBe(true);
    expect(bossVoices.every((oscillator) => oscillator.stops.length === 1)).toBe(true);
    expect(context.gains[0]!.gain.values[0]).toEqual(['set', 0.5, 2]);
    expect(context.gains[1]!.gain.values[0]).toEqual(['set', 0.25, 2]);
    expect(context.gains[2]!.gain.values[0]).toEqual(['set', 0.2, 2]);

    const scheduledBeforeRepeat = context.oscillators.length;
    audio.setMusicState('boss');
    expect(context.oscillators).toHaveLength(scheduledBeforeRepeat);
    audio.setMusicState('victory');
    expect(context.oscillators.length).toBeGreaterThan(scheduledBeforeRepeat);
    expect(context.oscillators.slice(scheduledBeforeRepeat).some((oscillator) => oscillator.frequency.values[0]?.[1] === 880)).toBe(true);
    audio.setMix({ musicVolume: 0 });
    expect(context.gains[2]!.gain.values.at(-1)).toEqual(['set', 0, 2]);
    audio.dispose();
  });

  it('gives orbiting fireflies a clearly audible three-spark contact shimmer', () => {
    const context = new FakeAudioContext();
    const audio = createProceduralAudio({ createContext: () => context });

    audio.setEnabled(true);
    const firstSfxVoice = context.oscillators.length;
    audio.play('firefly');

    const voices = context.oscillators.slice(firstSfxVoice);
    expect(voices.map((oscillator) => oscillator.frequency.values[0])).toEqual([
      ['set', 783.99, 2],
      ['set', 1318.51, 2.028],
      ['set', 1567.98, 2.055],
    ]);
    expect(voices.map((oscillator) => oscillator.type)).toEqual(['sine', 'triangle', 'sine']);
    expect(voices[0]!.frequency.values[1]).toEqual(['ramp', 1174.66, 2.0663]);
  });

  it('uses unmistakably distinct terminal fanfare and defeat stinger profiles', () => {
    const context = new FakeAudioContext();
    const audio = createProceduralAudio({ createContext: () => context });

    audio.setEnabled(true);
    const firstSfxVoice = context.oscillators.length;
    audio.play('victory');
    audio.play('defeat');

    expect(context.oscillators.slice(firstSfxVoice).map((oscillator) => oscillator.frequency.values[0])).toEqual([
      ['set', 523.25, 2],
      ['set', 659.25, 2.1],
      ['set', 783.99, 2.21],
      ['set', 196, 2],
      ['set', 146.83, 2.1],
    ]);
    expect(context.oscillators.slice(firstSfxVoice).map((oscillator) => oscillator.type)).toEqual([
      'triangle', 'triangle', 'sine', 'sawtooth', 'triangle',
    ]);
  });

  it('keeps signature trait voices separable at the synth level', () => {
    const context = new FakeAudioContext();
    const audio = createProceduralAudio({ createContext: () => context });

    audio.setEnabled(true);
    const firstSfxVoice = context.oscillators.length;
    audio.play('quills');
    audio.play('puffer');
    audio.play('bat');
    audio.play('royal-stinkcloud');

    const signatures = context.oscillators.slice(firstSfxVoice).map((oscillator) => oscillator.frequency.values[0]?.[1]);
    expect(signatures).toEqual([622.25, 196, 174.61, 392, 1760, 2093, 98, 196]);
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
