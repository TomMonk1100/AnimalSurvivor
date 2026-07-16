/**
 * Small opt-in Web Audio synth. It never constructs an AudioContext until a
 * player explicitly enables sound, and every failure is a harmless no-op so
 * browser audio support can never block the game.
 */
import type { AudioCue, AudioCueSink } from './audio-cue-router';

type OscillatorShape = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface AudioParamLike {
  setValueAtTime(value: number, startTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
  cancelScheduledValues?(startTime: number): unknown;
}

export interface ProceduralGainNode {
  readonly gain: AudioParamLike;
  connect(destination: unknown): unknown;
}

export interface ProceduralOscillatorNode {
  type: OscillatorShape;
  readonly frequency: AudioParamLike;
  connect(destination: unknown): unknown;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface ProceduralAudioContext {
  readonly currentTime: number;
  readonly destination: unknown;
  createGain(): ProceduralGainNode;
  createOscillator(): ProceduralOscillatorNode;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}

export const MUSIC_STATES = Object.freeze([
  'idle',
  'opening',
  'pressure',
  'adaptation',
  'mutation',
  'boss',
  'victory',
  'defeat',
] as const);
export type MusicState = (typeof MUSIC_STATES)[number];

export interface AudioMix {
  readonly masterVolume: number;
  readonly musicVolume: number;
  readonly sfxVolume: number;
}

export const DEFAULT_AUDIO_MIX: AudioMix = Object.freeze({
  masterVolume: 1,
  // The former music level only exposed a single low oscillator. A slightly
  // fuller but still optional bed gives the forest motif room to breathe.
  musicVolume: 0.34,
  sfxVolume: 0.9,
});

export interface ProceduralAudioOptions {
  /** Injectable for tests; the default feature-detects browser Web Audio. */
  readonly createContext?: () => ProceduralAudioContext | null;
  /** Used only for a player-facing nonfatal "try again" status message. */
  readonly onEnableFailure?: () => void;
  /** Lets deterministic test contexts exercise the recurring music scheduler. */
  readonly loopMusic?: boolean;
}

export interface ProceduralAudio extends AudioCueSink {
  readonly supported: boolean;
  readonly enabled: boolean;
  readonly mix: AudioMix;
  readonly musicState: MusicState;
  /** Call only from a player gesture. Returns the resulting enabled state. */
  setEnabled(enabled: boolean): boolean;
  /** Presentation-only mix controls; never enter simulation state or replay. */
  setMix(mix: Partial<AudioMix>): void;
  /** Sets the current procedural music bed state without advancing gameplay. */
  setMusicState(state: MusicState): void;
  /** Resumes an existing opted-in context from a later player gesture. */
  resumeIfEnabled(): void;
  /** Releases audio work while keeping the player's current opt-in preference. */
  suspend(): void;
  dispose(): void;
}

interface Tone {
  readonly shape: OscillatorShape;
  readonly frequency: number;
  /** A concise frequency glide adds material character without a noise buffer. */
  readonly frequencyEnd?: number;
  readonly peakGain: number;
  readonly durationSeconds: number;
  /** Optional offset for a second note in a concise UI cue. */
  readonly startOffsetSeconds?: number;
  /** Defaults to a quick pluck-like onset. */
  readonly attackSeconds?: number;
}

type ToneProfile = readonly Tone[];

/**
 * Compact hand-authored synth voices. The router keeps combat voices sparse;
 * this table gives each trait a material identity without downloading audio
 * files or letting audio change deterministic gameplay.
 */
const TONES: Readonly<Record<AudioCue, ToneProfile>> = Object.freeze({
  start: [
    { shape: 'triangle', frequency: 293.66, frequencyEnd: 329.63, peakGain: 0.07, durationSeconds: 0.16 },
    { shape: 'sine', frequency: 440, peakGain: 0.062, durationSeconds: 0.24, startOffsetSeconds: 0.09 },
  ],
  pickup: [{ shape: 'sine', frequency: 987.77, frequencyEnd: 1174.66, peakGain: 0.025, durationSeconds: 0.075 }],
  upgrade: [
    { shape: 'triangle', frequency: 523.25, frequencyEnd: 659.25, peakGain: 0.062, durationSeconds: 0.15 },
    { shape: 'sine', frequency: 783.99, peakGain: 0.074, durationSeconds: 0.23, startOffsetSeconds: 0.1 },
    { shape: 'triangle', frequency: 1046.5, peakGain: 0.04, durationSeconds: 0.14, startOffsetSeconds: 0.2 },
  ],
  damage: [
    { shape: 'sawtooth', frequency: 196, frequencyEnd: 116.54, peakGain: 0.05, durationSeconds: 0.15 },
    { shape: 'triangle', frequency: 98, peakGain: 0.035, durationSeconds: 0.18, startOffsetSeconds: 0.02 },
  ],
  // Base auto-fire is intentionally a restrained bow-twang; trait identities
  // are carried by the source-aware cues below.
  attack: [
    { shape: 'triangle', frequency: 329.63, frequencyEnd: 246.94, peakGain: 0.026, durationSeconds: 0.075 },
    { shape: 'sine', frequency: 659.25, peakGain: 0.012, durationSeconds: 0.045, startOffsetSeconds: 0.012 },
  ],
  lightning: [
    { shape: 'square', frequency: 1760, frequencyEnd: 698.46, peakGain: 0.04, durationSeconds: 0.065 },
    { shape: 'triangle', frequency: 1174.66, frequencyEnd: 523.25, peakGain: 0.028, durationSeconds: 0.11, startOffsetSeconds: 0.018 },
  ],
  melee: [
    { shape: 'sawtooth', frequency: 698.46, frequencyEnd: 220, peakGain: 0.037, durationSeconds: 0.13 },
    { shape: 'triangle', frequency: 329.63, frequencyEnd: 196, peakGain: 0.024, durationSeconds: 0.12, startOffsetSeconds: 0.02 },
  ],
  orbit: [
    { shape: 'sine', frequency: 659.25, frequencyEnd: 987.77, peakGain: 0.023, durationSeconds: 0.08 },
    { shape: 'triangle', frequency: 1174.66, peakGain: 0.016, durationSeconds: 0.1, startOffsetSeconds: 0.03 },
  ],
  quills: [
    { shape: 'triangle', frequency: 622.25, frequencyEnd: 349.23, peakGain: 0.033, durationSeconds: 0.09 },
    { shape: 'square', frequency: 196, peakGain: 0.014, durationSeconds: 0.045, startOffsetSeconds: 0.014 },
  ],
  puffer: [
    { shape: 'sine', frequency: 174.61, frequencyEnd: 261.63, peakGain: 0.035, durationSeconds: 0.16 },
    { shape: 'triangle', frequency: 392, frequencyEnd: 293.66, peakGain: 0.019, durationSeconds: 0.12, startOffsetSeconds: 0.06 },
  ],
  eel: [
    { shape: 'square', frequency: 2093, frequencyEnd: 587.33, peakGain: 0.046, durationSeconds: 0.075 },
    { shape: 'sine', frequency: 1046.5, frequencyEnd: 440, peakGain: 0.026, durationSeconds: 0.14, startOffsetSeconds: 0.02 },
  ],
  firefly: [
    { shape: 'sine', frequency: 783.99, frequencyEnd: 1174.66, peakGain: 0.025, durationSeconds: 0.085 },
    { shape: 'triangle', frequency: 1318.51, peakGain: 0.018, durationSeconds: 0.08, startOffsetSeconds: 0.028 },
    { shape: 'sine', frequency: 1567.98, peakGain: 0.012, durationSeconds: 0.065, startOffsetSeconds: 0.055 },
  ],
  mantis: [
    { shape: 'sawtooth', frequency: 880, frequencyEnd: 246.94, peakGain: 0.043, durationSeconds: 0.145 },
    { shape: 'triangle', frequency: 523.25, frequencyEnd: 174.61, peakGain: 0.024, durationSeconds: 0.12, startOffsetSeconds: 0.018 },
  ],
  gecko: [
    { shape: 'sine', frequency: 146.83, frequencyEnd: 98, peakGain: 0.034, durationSeconds: 0.16 },
    { shape: 'triangle', frequency: 246.94, frequencyEnd: 164.81, peakGain: 0.02, durationSeconds: 0.13, startOffsetSeconds: 0.05 },
  ],
  owl: [
    { shape: 'triangle', frequency: 392, frequencyEnd: 783.99, peakGain: 0.031, durationSeconds: 0.12 },
    { shape: 'sine', frequency: 1046.5, peakGain: 0.016, durationSeconds: 0.1, startOffsetSeconds: 0.035 },
  ],
  bat: [
    { shape: 'sine', frequency: 1760, frequencyEnd: 1046.5, peakGain: 0.026, durationSeconds: 0.075 },
    { shape: 'sine', frequency: 2093, frequencyEnd: 1318.51, peakGain: 0.016, durationSeconds: 0.06, startOffsetSeconds: 0.05 },
  ],
  crab: [
    { shape: 'square', frequency: 246.94, frequencyEnd: 196, peakGain: 0.033, durationSeconds: 0.065 },
    { shape: 'triangle', frequency: 146.83, peakGain: 0.02, durationSeconds: 0.09, startOffsetSeconds: 0.022 },
  ],
  armadillo: [
    { shape: 'triangle', frequency: 130.81, frequencyEnd: 73.42, peakGain: 0.04, durationSeconds: 0.19 },
    { shape: 'sine', frequency: 261.63, frequencyEnd: 174.61, peakGain: 0.017, durationSeconds: 0.13, startOffsetSeconds: 0.04 },
  ],
  skunk: [
    { shape: 'sawtooth', frequency: 116.54, frequencyEnd: 164.81, peakGain: 0.029, durationSeconds: 0.18 },
    { shape: 'sine', frequency: 246.94, frequencyEnd: 196, peakGain: 0.018, durationSeconds: 0.12, startOffsetSeconds: 0.065 },
  ],
  monarch: [
    { shape: 'sine', frequency: 523.25, frequencyEnd: 783.99, peakGain: 0.024, durationSeconds: 0.1 },
    { shape: 'triangle', frequency: 987.77, peakGain: 0.019, durationSeconds: 0.13, startOffsetSeconds: 0.036 },
    { shape: 'sine', frequency: 1318.51, peakGain: 0.013, durationSeconds: 0.09, startOffsetSeconds: 0.075 },
  ],
  thornstorm: [
    { shape: 'sawtooth', frequency: 698.46, frequencyEnd: 146.83, peakGain: 0.046, durationSeconds: 0.18 },
    { shape: 'triangle', frequency: 293.66, frequencyEnd: 440, peakGain: 0.027, durationSeconds: 0.2, startOffsetSeconds: 0.045 },
  ],
  thunderbug: [
    { shape: 'square', frequency: 2349.32, frequencyEnd: 440, peakGain: 0.05, durationSeconds: 0.085 },
    { shape: 'triangle', frequency: 880, frequencyEnd: 220, peakGain: 0.028, durationSeconds: 0.18, startOffsetSeconds: 0.025 },
  ],
  razorstep: [
    { shape: 'sawtooth', frequency: 1046.5, frequencyEnd: 329.63, peakGain: 0.042, durationSeconds: 0.13 },
    { shape: 'triangle', frequency: 493.88, frequencyEnd: 246.94, peakGain: 0.024, durationSeconds: 0.11, startOffsetSeconds: 0.028 },
  ],
  midnight: [
    { shape: 'sine', frequency: 146.83, frequencyEnd: 293.66, peakGain: 0.032, durationSeconds: 0.16 },
    { shape: 'sine', frequency: 1174.66, frequencyEnd: 1760, peakGain: 0.017, durationSeconds: 0.09, startOffsetSeconds: 0.07 },
  ],
  meteor: [
    { shape: 'sawtooth', frequency: 392, frequencyEnd: 65.41, peakGain: 0.054, durationSeconds: 0.24 },
    { shape: 'square', frequency: 98, peakGain: 0.035, durationSeconds: 0.16, startOffsetSeconds: 0.11 },
  ],
  'royal-stinkcloud': [
    { shape: 'sawtooth', frequency: 98, frequencyEnd: 73.42, peakGain: 0.043, durationSeconds: 0.22 },
    { shape: 'sine', frequency: 196, frequencyEnd: 130.81, peakGain: 0.024, durationSeconds: 0.18, startOffsetSeconds: 0.07 },
  ],
  greg: [
    { shape: 'triangle', frequency: 329.63, frequencyEnd: 493.88, peakGain: 0.036, durationSeconds: 0.13 },
    { shape: 'square', frequency: 196, peakGain: 0.018, durationSeconds: 0.06, startOffsetSeconds: 0.024 },
  ],
  benny: [
    { shape: 'triangle', frequency: 174.61, frequencyEnd: 116.54, peakGain: 0.041, durationSeconds: 0.16 },
    { shape: 'sine', frequency: 293.66, peakGain: 0.019, durationSeconds: 0.11, startOffsetSeconds: 0.045 },
  ],
  gracie: [
    { shape: 'sine', frequency: 659.25, frequencyEnd: 987.77, peakGain: 0.03, durationSeconds: 0.1 },
    { shape: 'triangle', frequency: 1318.51, peakGain: 0.018, durationSeconds: 0.08, startOffsetSeconds: 0.04 },
  ],
  'enemy-warning': [
    { shape: 'square', frequency: 196, frequencyEnd: 146.83, peakGain: 0.034, durationSeconds: 0.13 },
  ],
  'boss-telegraph': [
    { shape: 'sawtooth', frequency: 110, frequencyEnd: 73.42, peakGain: 0.042, durationSeconds: 0.24 },
    { shape: 'triangle', frequency: 164.81, frequencyEnd: 110, peakGain: 0.028, durationSeconds: 0.22, startOffsetSeconds: 0.09 },
  ],
  'boss-warning': [
    { shape: 'sawtooth', frequency: 98, frequencyEnd: 65.41, peakGain: 0.052, durationSeconds: 0.28 },
    { shape: 'triangle', frequency: 146.83, frequencyEnd: 98, peakGain: 0.034, durationSeconds: 0.32, startOffsetSeconds: 0.16 },
  ],
  'boss-arrive': [
    { shape: 'square', frequency: 246.94, frequencyEnd: 146.83, peakGain: 0.052, durationSeconds: 0.1 },
    { shape: 'sawtooth', frequency: 110, frequencyEnd: 55, peakGain: 0.064, durationSeconds: 0.36, startOffsetSeconds: 0.075 },
  ],
  victory: [
    { shape: 'triangle', frequency: 523.25, peakGain: 0.055, durationSeconds: 0.16 },
    { shape: 'triangle', frequency: 659.25, peakGain: 0.068, durationSeconds: 0.18, startOffsetSeconds: 0.1 },
    { shape: 'sine', frequency: 783.99, peakGain: 0.08, durationSeconds: 0.3, startOffsetSeconds: 0.21 },
  ],
  defeat: [
    { shape: 'sawtooth', frequency: 196, frequencyEnd: 98, peakGain: 0.04, durationSeconds: 0.14 },
    { shape: 'triangle', frequency: 146.83, frequencyEnd: 73.42, peakGain: 0.048, durationSeconds: 0.28, startOffsetSeconds: 0.1 },
  ],
});

type MusicRhythm = 'still' | 'meadow' | 'brisk' | 'urgent' | 'boss' | 'fanfare' | 'lament';

interface MusicProfile {
  /** Sixteenth-note-like subdivision for a four-chord two-bar phrase. */
  readonly stepSeconds: number;
  readonly gain: number;
  readonly bass: readonly number[];
  readonly motif: readonly number[];
  readonly harmony: readonly number[];
  readonly rhythm: MusicRhythm;
}

const REST = 0;
const MUSIC_STEPS_PER_BAR = 8;
const MUSIC_BARS_PER_PHRASE = 2;
const MUSIC_STEPS_PER_PHRASE = MUSIC_STEPS_PER_BAR * MUSIC_BARS_PER_PHRASE;
const MUSIC_TRANSITION_FADE_SECONDS = 0.18;
const MUSIC_SCHEDULE_AHEAD_SECONDS = 0.12;

type MusicPhraseOrder = readonly [number, number, number, number];

interface MusicPhraseVariation {
  readonly id: string;
  /** Reorders the four harmonic cells without changing a state's tonal palette. */
  readonly chordOrder: MusicPhraseOrder;
  /** Rephrases each cell into a distinct melodic contour. */
  readonly motifOrder: MusicPhraseOrder;
  readonly motifTransposeSemitones: number;
  readonly accentStep: number;
}

function musicVariation(
  id: string,
  chordOrder: MusicPhraseOrder,
  motifOrder: MusicPhraseOrder,
  motifTransposeSemitones: number,
  accentStep: number,
): MusicPhraseVariation {
  return Object.freeze({ id, chordOrder, motifOrder, motifTransposeSemitones, accentStep });
}

/**
 * A program is shared structurally by every score state, while each state owns
 * its own bass, harmony, and source motif. Twelve genuinely different phrase
 * contours keep even the fastest boss state from repeating its exact program
 * for more than 45 seconds.
 */
const MUSIC_PROGRAM_VARIATIONS: readonly MusicPhraseVariation[] = Object.freeze([
  musicVariation('trailhead', [0, 1, 2, 3], [0, 1, 2, 3], 0, 0),
  musicVariation('answering-call', [0, 1, 2, 3], [0, 2, 1, 3], 0, 2),
  musicVariation('canopy-turn', [1, 2, 3, 0], [0, 1, 3, 2], -5, 1),
  musicVariation('meadow-arc', [2, 3, 0, 1], [1, 0, 2, 3], 0, 3),
  musicVariation('lantern-lift', [3, 0, 1, 2], [0, 2, 3, 1], 7, 2),
  musicVariation('rill-step', [0, 2, 1, 3], [1, 2, 0, 3], 0, 1),
  musicVariation('pathfinder', [1, 3, 2, 0], [2, 0, 1, 3], -5, 0),
  musicVariation('glow-return', [2, 0, 3, 1], [0, 3, 1, 2], 0, 3),
  musicVariation('gallop', [3, 1, 0, 2], [3, 1, 2, 0], 7, 1),
  musicVariation('homeward', [0, 3, 1, 2], [2, 1, 3, 0], 0, 2),
  musicVariation('fable', [1, 0, 2, 3], [3, 0, 2, 1], -5, 3),
  musicVariation('resolve', [2, 1, 3, 0], [1, 3, 0, 2], 0, 0),
]);

export const MUSIC_PROGRAM_VARIATION_COUNT = MUSIC_PROGRAM_VARIATIONS.length;
export const MIN_MUSIC_PROGRAM_REPEAT_SECONDS = 45;

const MUSIC_PROFILES: Readonly<Record<MusicState, MusicProfile>> = Object.freeze({
  // These are finite, plucked phrases rather than an always-on oscillator:
  // D major / B minor colours make the Wildguard glade warm and adventurous.
  idle: Object.freeze({
    stepSeconds: 0.44, gain: 0.52, rhythm: 'still',
    bass: [146.83, 196, 246.94, 220],
    motif: [293.66, 369.99, 440, 369.99, 392, 293.66, 246.94, 293.66, 493.88, 440, 369.99, 293.66, 329.63, 277.18, 329.63, REST],
    harmony: [440, 493.88, 369.99, 440],
  }),
  opening: Object.freeze({
    stepSeconds: 0.37, gain: 0.62, rhythm: 'meadow',
    bass: [146.83, 196, 246.94, 220],
    motif: [293.66, 369.99, 440, 587.33, 392, 493.88, 587.33, 493.88, 369.99, 493.88, 587.33, 440, 329.63, 369.99, 440, 493.88],
    harmony: [440, 587.33, 493.88, 440],
  }),
  pressure: Object.freeze({
    stepSeconds: 0.34, gain: 0.64, rhythm: 'brisk',
    bass: [196, 146.83, 220, 246.94],
    motif: [392, 493.88, 587.33, 493.88, 369.99, 440, 493.88, 587.33, 440, 523.25, 659.25, 523.25, 493.88, 440, 369.99, 440],
    harmony: [587.33, 440, 523.25, 587.33],
  }),
  adaptation: Object.freeze({
    stepSeconds: 0.35, gain: 0.66, rhythm: 'meadow',
    bass: [164.81, 220, 196, 146.83],
    motif: [329.63, 392, 493.88, 659.25, 440, 523.25, 659.25, 523.25, 392, 493.88, 587.33, 493.88, 369.99, 440, 587.33, 440],
    harmony: [493.88, 659.25, 587.33, 440],
  }),
  mutation: Object.freeze({
    stepSeconds: 0.32, gain: 0.68, rhythm: 'urgent',
    bass: [146.83, 164.81, 220, 196],
    motif: [587.33, 493.88, 440, 587.33, 659.25, 587.33, 493.88, 440, 783.99, 659.25, 587.33, 493.88, 659.25, 587.33, 493.88, 440],
    harmony: [440, 493.88, 659.25, 587.33],
  }),
  boss: Object.freeze({
    stepSeconds: 0.3, gain: 0.72, rhythm: 'boss',
    bass: [146.83, 130.81, 174.61, 110],
    motif: [293.66, 329.63, 440, 329.63, 261.63, 293.66, 392, 293.66, 349.23, 440, 523.25, 440, 220, 261.63, 329.63, 261.63],
    harmony: [440, 392, 523.25, 329.63],
  }),
  victory: Object.freeze({
    stepSeconds: 0.39, gain: 0.7, rhythm: 'fanfare',
    bass: [146.83, 196, 220, 146.83],
    motif: [293.66, 369.99, 440, 587.33, 659.25, 587.33, 493.88, 587.33, 659.25, 783.99, 880, 783.99, 587.33, 659.25, 783.99, 1174.66],
    harmony: [440, 587.33, 659.25, 880],
  }),
  defeat: Object.freeze({
    stepSeconds: 0.46, gain: 0.5, rhythm: 'lament',
    bass: [146.83, 130.81, 110, 98],
    motif: [293.66, 261.63, 220, REST, 246.94, 220, 196, REST, 220, 196, 174.61, REST, 196, 174.61, 146.83, REST],
    harmony: [349.23, 329.63, 293.66, 261.63],
  }),
});

export interface MusicProgramInfo {
  readonly state: MusicState;
  readonly phraseSeconds: number;
  readonly barSeconds: number;
  readonly variationCount: number;
  readonly repeatAfterSeconds: number;
  readonly variationIds: readonly string[];
}

interface ScheduledMusicPhrase {
  readonly state: MusicState;
  readonly programIndex: number;
  readonly startAt: number;
  readonly phraseSeconds: number;
  readonly barSeconds: number;
  readonly endAt: number;
  readonly gain: ProceduralGainNode;
}

function musicProfileFor(state: MusicState): MusicProfile {
  const profile = MUSIC_PROFILES[state];
  if (profile === undefined) throw new RangeError(`unknown music state: ${String(state)}`);
  return profile;
}

function phraseSecondsFor(profile: MusicProfile): number {
  return profile.stepSeconds * MUSIC_STEPS_PER_PHRASE;
}

function barSecondsFor(profile: MusicProfile): number {
  return profile.stepSeconds * MUSIC_STEPS_PER_BAR;
}

function variationFor(programIndex: number): MusicPhraseVariation {
  const count = MUSIC_PROGRAM_VARIATIONS.length;
  const normalizedIndex = ((programIndex % count) + count) % count;
  return MUSIC_PROGRAM_VARIATIONS[normalizedIndex]!;
}

function transposeFrequency(frequency: number, semitones: number): number {
  return frequency <= REST ? REST : frequency * 2 ** (semitones / 12);
}

/** Returns deterministic score-program metadata without constructing audio. */
export function getMusicProgramInfo(state: MusicState): MusicProgramInfo {
  const profile = musicProfileFor(state);
  const phraseSeconds = phraseSecondsFor(profile);
  return Object.freeze({
    state,
    phraseSeconds,
    barSeconds: barSecondsFor(profile),
    variationCount: MUSIC_PROGRAM_VARIATIONS.length,
    repeatAfterSeconds: phraseSeconds * MUSIC_PROGRAM_VARIATIONS.length,
    variationIds: Object.freeze(MUSIC_PROGRAM_VARIATIONS.map((variation) => variation.id)),
  });
}

type BrowserAudioContextConstructor = new () => ProceduralAudioContext;

function browserAudioContextConstructor(): BrowserAudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const browserWindow = window as typeof globalThis & { webkitAudioContext?: BrowserAudioContextConstructor };
  return (browserWindow.AudioContext ?? browserWindow.webkitAudioContext ?? null) as BrowserAudioContextConstructor | null;
}

function createBrowserContext(): ProceduralAudioContext | null {
  const Constructor = browserAudioContextConstructor();
  if (Constructor === null) return null;
  try {
    return new Constructor();
  } catch {
    return null;
  }
}

function ignoreFailure(promise: Promise<void>): void {
  void promise.catch(() => undefined);
}

function finiteTime(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

/**
 * Builds a small bounded voice profile per routed cue. There are intentionally
 * no enemy-death sounds. The router permits only low-volume, rate-limited
 * auto-attack texture, resolved lightning, resolved Mantis sweeps, and
 * player-damage feedback, so the synth stays readable in crowded fights.
 */
export function createProceduralAudio(options: ProceduralAudioOptions = {}): ProceduralAudio {
  const createContext = options.createContext ?? createBrowserContext;
  const supported = options.createContext !== undefined || browserAudioContextConstructor() !== null;
  let context: ProceduralAudioContext | null = null;
  let enabled = false;
  let disposed = false;
  let mix: AudioMix = DEFAULT_AUDIO_MIX;
  let musicState: MusicState = 'idle';
  let masterGain: ProceduralGainNode | null = null;
  let sfxGain: ProceduralGainNode | null = null;
  let musicGain: ProceduralGainNode | null = null;
  let scheduledMusicPhrases: ScheduledMusicPhrase[] = [];
  let activeMusicPhrase: ScheduledMusicPhrase | null = null;
  let musicTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let musicGeneration = 0;

  function volume(value: number, field: string): number {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`${field} must be finite in [0, 1], got ${value}`);
    }
    return value;
  }

  function graphTime(): number {
    return finiteTime(context?.currentTime ?? 0);
  }

  function ensureGraph(): void {
    if (context === null || masterGain !== null) return;
    masterGain = context.createGain();
    sfxGain = context.createGain();
    masterGain.gain.setValueAtTime(mix.masterVolume, graphTime());
    sfxGain.gain.setValueAtTime(mix.sfxVolume, graphTime());
    sfxGain.connect(masterGain);
    masterGain.connect(context.destination);
  }

  function clearMusicTimer(): void {
    if (musicTimer === null) return;
    globalThis.clearTimeout(musicTimer);
    musicTimer = null;
  }

  function scheduleTone(destination: unknown, tone: Tone, startAt: number): void {
    if (context === null) return;
    const duration = Math.max(0.02, tone.durationSeconds);
    const attack = Math.min(Math.max(tone.attackSeconds ?? 0.008, 0.003), duration * 0.45);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = tone.shape;
    oscillator.frequency.setValueAtTime(tone.frequency, startAt);
    if (tone.frequencyEnd !== undefined) {
      oscillator.frequency.linearRampToValueAtTime(tone.frequencyEnd, startAt + duration * 0.78);
    }
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.linearRampToValueAtTime(tone.peakGain, startAt + attack);
    gain.gain.linearRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.015);
  }

  function scheduleRhythm(destination: unknown, profile: MusicProfile, startAt: number): void {
    const step = profile.stepSeconds;
    switch (profile.rhythm) {
      case 'still':
        return;
      case 'meadow':
        for (let beat = 0; beat < 4; beat += 1) {
          scheduleTone(destination, {
            shape: 'sine', frequency: 1318.51, frequencyEnd: 1046.5,
            peakGain: 0.014, durationSeconds: 0.045,
          }, startAt + beat * step * 4 + step * 2);
        }
        return;
      case 'brisk':
      case 'urgent':
        for (let beat = 0; beat < 4; beat += 1) {
          const beatStart = startAt + beat * step * 4;
          scheduleTone(destination, {
            shape: 'triangle', frequency: 73.42, frequencyEnd: 55,
            peakGain: profile.rhythm === 'urgent' ? 0.07 : 0.055, durationSeconds: 0.1,
          }, beatStart);
          scheduleTone(destination, {
            shape: 'square', frequency: 1046.5, frequencyEnd: 783.99,
            peakGain: 0.012, durationSeconds: 0.028,
          }, beatStart + step * 2);
        }
        return;
      case 'boss':
        for (let beat = 0; beat < 4; beat += 1) {
          const beatStart = startAt + beat * step * 4;
          scheduleTone(destination, {
            shape: 'sawtooth', frequency: 65.41, frequencyEnd: 48.99,
            peakGain: 0.085, durationSeconds: 0.13,
          }, beatStart);
          scheduleTone(destination, {
            shape: 'square', frequency: 174.61, frequencyEnd: 130.81,
            peakGain: 0.024, durationSeconds: 0.06,
          }, beatStart + step * 2);
        }
        return;
      case 'fanfare':
        for (let beat = 0; beat < 4; beat += 1) {
          scheduleTone(destination, {
            shape: 'triangle', frequency: 98, frequencyEnd: 73.42,
            peakGain: 0.035, durationSeconds: 0.1,
          }, startAt + beat * step * 4);
        }
        return;
      case 'lament':
        for (let beat = 0; beat < 4; beat += 1) {
          scheduleTone(destination, {
            shape: 'sine', frequency: 73.42, frequencyEnd: 55,
            peakGain: 0.028, durationSeconds: 0.14,
          }, startAt + beat * step * 4);
        }
        return;
      default: {
        const exhaustive: never = profile.rhythm;
        return exhaustive;
      }
    }
  }

  function pruneMusicPhrases(now: number): void {
    scheduledMusicPhrases = scheduledMusicPhrases.filter((phrase) => phrase.endAt > now);
    if (activeMusicPhrase !== null && !scheduledMusicPhrases.includes(activeMusicPhrase)) {
      activeMusicPhrase = scheduledMusicPhrases.at(-1) ?? null;
    }
  }

  function playingMusicPhraseAt(time: number): ScheduledMusicPhrase | null {
    for (let index = scheduledMusicPhrases.length - 1; index >= 0; index -= 1) {
      const phrase = scheduledMusicPhrases[index];
      if (phrase !== undefined && phrase.startAt <= time && phrase.endAt > time) return phrase;
    }
    return null;
  }

  function earliestFutureMusicPhrase(time: number): ScheduledMusicPhrase | null {
    for (const phrase of scheduledMusicPhrases) {
      if (phrase.startAt > time) return phrase;
    }
    return null;
  }

  function nextMusicBarBoundary(now: number): number {
    const reference = playingMusicPhraseAt(now) ?? earliestFutureMusicPhrase(now) ?? activeMusicPhrase;
    if (reference === null) return now + 0.04;
    if (now < reference.startAt) return reference.startAt + reference.barSeconds;
    const elapsedBars = Math.floor((now - reference.startAt) / reference.barSeconds) + 1;
    return Math.min(
      reference.startAt + elapsedBars * reference.barSeconds,
      reference.startAt + reference.phraseSeconds,
    );
  }

  function silenceScheduledPhrase(phrase: ScheduledMusicPhrase, now: number): void {
    phrase.gain.gain.cancelScheduledValues?.(now);
    phrase.gain.gain.setValueAtTime(0.0001, now);
  }

  function fadeMusicForTransition(transitionAt: number, now: number): void {
    const continuingPhrases: ScheduledMusicPhrase[] = [];
    for (const phrase of scheduledMusicPhrases) {
      if (phrase.startAt >= transitionAt) {
        // A look-ahead phrase from the old state must not wake up after a
        // transition selected at the current bar boundary.
        silenceScheduledPhrase(phrase, now);
        continue;
      }
      if (phrase.endAt > transitionAt) {
        const previousGain = musicProfileFor(phrase.state).gain;
        phrase.gain.gain.setValueAtTime(previousGain, transitionAt);
        phrase.gain.gain.linearRampToValueAtTime(0.0001, transitionAt + MUSIC_TRANSITION_FADE_SECONDS);
      }
      continuingPhrases.push(phrase);
    }
    scheduledMusicPhrases = continuingPhrases;
  }

  /**
   * Schedules one finite two-bar variation from the deterministic program.
   * The state transition path starts only on a bar boundary and crossfades the
   * old phrase there, rather than restarting a motif mid-phrase.
   */
  function scheduleMusicPhrase(
    state: MusicState,
    startAt: number,
    programIndex: number,
    transitionFromPrevious: boolean,
  ): ScheduledMusicPhrase | null {
    if (context === null || musicGain === null) return null;
    const profile = musicProfileFor(state);
    const variation = variationFor(programIndex);
    const phraseSeconds = phraseSecondsFor(profile);
    const barSeconds = barSecondsFor(profile);
    const now = graphTime();
    pruneMusicPhrases(now);
    if (transitionFromPrevious) fadeMusicForTransition(startAt, now);

    const phraseGain = context.createGain();
    phraseGain.gain.setValueAtTime(0.0001, startAt);
    phraseGain.gain.linearRampToValueAtTime(profile.gain, startAt + 0.08);
    phraseGain.connect(musicGain);

    const step = profile.stepSeconds;
    for (let chord = 0; chord < 4; chord += 1) {
      const chordStart = startAt + chord * step * 4;
      const sourceChord = variation.chordOrder[chord]!;
      const bass = profile.bass[sourceChord];
      const harmony = profile.harmony[sourceChord];
      if (bass !== undefined && bass > REST) {
        scheduleTone(phraseGain, {
          shape: 'triangle', frequency: bass, frequencyEnd: bass * 0.992,
          peakGain: 0.14, durationSeconds: step * 3.4, attackSeconds: 0.014,
        }, chordStart);
      }
      if (harmony !== undefined && harmony > REST) {
        scheduleTone(phraseGain, {
          shape: 'sine', frequency: harmony, peakGain: 0.045,
          durationSeconds: step * 2.4, attackSeconds: 0.025,
        }, chordStart + step * 0.5);
      }
      for (let noteIndex = 0; noteIndex < 4; noteIndex += 1) {
        const motifStep = variation.motifOrder[noteIndex]!;
        const motif = profile.motif[sourceChord * 4 + motifStep];
        if (motif === undefined || motif <= REST) continue;
        const frequency = transposeFrequency(motif, variation.motifTransposeSemitones);
        const baseGain = noteIndex === 0 ? 0.115 : 0.09;
        scheduleTone(phraseGain, {
          shape: noteIndex === 0 ? 'triangle' : 'sine', frequency,
          peakGain: noteIndex === variation.accentStep ? baseGain + 0.014 : baseGain,
          durationSeconds: step * (noteIndex === 3 ? 1.65 : 1.18), attackSeconds: 0.008,
        }, chordStart + noteIndex * step);
      }
    }
    scheduleRhythm(phraseGain, profile, startAt);
    const phrase: ScheduledMusicPhrase = {
      state,
      programIndex: ((programIndex % MUSIC_PROGRAM_VARIATIONS.length) + MUSIC_PROGRAM_VARIATIONS.length)
        % MUSIC_PROGRAM_VARIATIONS.length,
      startAt,
      phraseSeconds,
      barSeconds,
      endAt: startAt + phraseSeconds,
      gain: phraseGain,
    };
    scheduledMusicPhrases.push(phrase);
    activeMusicPhrase = phrase;
    return phrase;
  }

  function shouldLoopMusic(): boolean {
    if (typeof window === 'undefined') return false;
    // Injected test contexts receive one phrase by default, but can opt into
    // the same recurring program scheduler as production browsers.
    return options.loopMusic ?? options.createContext === undefined;
  }

  function armMusicLoop(generation: number): void {
    const phrase = activeMusicPhrase;
    if (!shouldLoopMusic() || phrase === null) return;
    clearMusicTimer();
    const nextStart = phrase.startAt + phrase.phraseSeconds;
    const delaySeconds = Math.max(0.25, nextStart - graphTime() - MUSIC_SCHEDULE_AHEAD_SECONDS);
    musicTimer = globalThis.setTimeout(() => {
      musicTimer = null;
      if (disposed || !enabled || generation !== musicGeneration || mix.musicVolume <= 0) return;
      const previousPhrase = activeMusicPhrase;
      if (previousPhrase === null) return;
      const scheduledStart = Math.max(
        previousPhrase.startAt + previousPhrase.phraseSeconds,
        graphTime() + 0.04,
      );
      scheduleMusicPhrase(musicState, scheduledStart, previousPhrase.programIndex + 1, false);
      armMusicLoop(generation);
    }, Math.round(delaySeconds * 1000));
  }

  function silenceMusic(now: number): void {
    clearMusicTimer();
    musicGeneration += 1;
    for (const phrase of scheduledMusicPhrases) silenceScheduledPhrase(phrase, now);
    scheduledMusicPhrases = [];
    activeMusicPhrase = null;
  }

  function restartMusic(): void {
    if (context === null || musicGain === null || mix.musicVolume <= 0 || !enabled) return;
    const now = graphTime();
    silenceMusic(now);
    const generation = musicGeneration;
    scheduleMusicPhrase(musicState, now + 0.04, 0, false);
    armMusicLoop(generation);
  }

  function transitionMusicState(): void {
    if (context === null || musicGain === null || mix.musicVolume <= 0 || !enabled) return;
    const now = graphTime();
    clearMusicTimer();
    musicGeneration += 1;
    const generation = musicGeneration;
    scheduleMusicPhrase(musicState, nextMusicBarBoundary(now), 0, true);
    armMusicLoop(generation);
  }

  function ensureMusic(): void {
    if (context === null || mix.musicVolume <= 0) return;
    ensureGraph();
    if (masterGain === null) return;
    if (musicGain === null) {
      musicGain = context.createGain();
      musicGain.gain.setValueAtTime(mix.musicVolume, graphTime());
      musicGain.connect(masterGain);
    }
    if (activeMusicPhrase === null && enabled) restartMusic();
  }

  function notifyEnableFailure(): void {
    options.onEnableFailure?.();
  }

  function resume(contextToResume: ProceduralAudioContext): void {
    try {
      void contextToResume.resume().catch(() => {
        if (disposed || context !== contextToResume || !enabled) return;
        enabled = false;
        notifyEnableFailure();
      });
    } catch {
      enabled = false;
      notifyEnableFailure();
    }
  }

  function setEnabled(nextEnabled: boolean): boolean {
    if (disposed) return false;
    if (!nextEnabled) {
      enabled = false;
      suspend();
      return false;
    }
    if (!supported) {
      notifyEnableFailure();
      return false;
    }
    if (context === null) {
      try {
        context = createContext();
      } catch {
        context = null;
      }
    }
    if (context === null) {
      notifyEnableFailure();
      return false;
    }
    enabled = true;
    ensureGraph();
    ensureMusic();
    resume(context);
    return true;
  }

  function setMix(nextMix: Partial<AudioMix>): void {
    const next: AudioMix = Object.freeze({
      masterVolume: nextMix.masterVolume === undefined ? mix.masterVolume : volume(nextMix.masterVolume, 'masterVolume'),
      musicVolume: nextMix.musicVolume === undefined ? mix.musicVolume : volume(nextMix.musicVolume, 'musicVolume'),
      sfxVolume: nextMix.sfxVolume === undefined ? mix.sfxVolume : volume(nextMix.sfxVolume, 'sfxVolume'),
    });
    mix = next;
    if (context !== null && enabled) {
      ensureGraph();
      const now = graphTime();
      masterGain?.gain.setValueAtTime(mix.masterVolume, now);
      sfxGain?.gain.setValueAtTime(mix.sfxVolume, now);
      musicGain?.gain.setValueAtTime(mix.musicVolume, now);
      if (mix.musicVolume <= 0) {
        silenceMusic(now);
      } else {
        ensureMusic();
      }
    }
  }

  function setMusicState(nextState: MusicState): void {
    if (!(MUSIC_STATES as readonly string[]).includes(nextState)) {
      throw new RangeError(`unknown music state: ${String(nextState)}`);
    }
    const changed = musicState !== nextState;
    musicState = nextState;
    if (!enabled) return;
    if (!changed || activeMusicPhrase === null) {
      ensureMusic();
      return;
    }
    transitionMusicState();
  }

  function resumeIfEnabled(): void {
    if (enabled && context !== null && !disposed) {
      ensureMusic();
      resume(context);
    }
  }

  function play(cue: AudioCue): void {
    if (!enabled || context === null || disposed) return;
    try {
      ensureGraph();
      if (sfxGain === null) return;
      const now = finiteTime(context.currentTime);
      for (const tone of TONES[cue]) {
        scheduleTone(sfxGain, tone, now + (tone.startOffsetSeconds ?? 0));
      }
    } catch {
      // A browser may interrupt/close a context between a player gesture and a
      // later routed cue. Keep gameplay alive and wait for the next opt-in tap.
    }
  }

  function suspend(): void {
    if (context === null || disposed) return;
    silenceMusic(graphTime());
    try {
      ignoreFailure(context.suspend());
    } catch {
      // Suspending is an optional resource release, never a gameplay concern.
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    enabled = false;
    if (context === null) return;
    silenceMusic(graphTime());
    try {
      ignoreFailure(context.close());
    } catch {
      // Some mock/legacy contexts throw on a repeated close; teardown remains safe.
    }
    masterGain = null;
    sfxGain = null;
    musicGain = null;
    context = null;
  }

  return {
    get supported() {
      return supported;
    },
    get enabled() {
      return enabled;
    },
    get mix() {
      return mix;
    },
    get musicState() {
      return musicState;
    },
    setEnabled,
    setMix,
    setMusicState,
    resumeIfEnabled,
    play,
    suspend,
    dispose,
  };
}
