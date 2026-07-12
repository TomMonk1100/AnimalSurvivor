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

export interface ProceduralAudioOptions {
  /** Injectable for tests; the default feature-detects browser Web Audio. */
  readonly createContext?: () => ProceduralAudioContext | null;
  /** Used only for a player-facing nonfatal "try again" status message. */
  readonly onEnableFailure?: () => void;
}

export interface ProceduralAudio extends AudioCueSink {
  readonly supported: boolean;
  readonly enabled: boolean;
  /** Call only from a player gesture. Returns the resulting enabled state. */
  setEnabled(enabled: boolean): boolean;
  /** Resumes an existing opted-in context from a later player gesture. */
  resumeIfEnabled(): void;
  /** Releases audio work while keeping the player's current opt-in preference. */
  suspend(): void;
  dispose(): void;
}

interface Tone {
  readonly shape: OscillatorShape;
  readonly frequency: number;
  readonly peakGain: number;
  readonly durationSeconds: number;
  /** Optional offset for a second note in a concise UI cue. */
  readonly startOffsetSeconds?: number;
}

type ToneProfile = readonly Tone[];

const TONES: Readonly<Record<AudioCue, ToneProfile>> = Object.freeze({
  // A two-note confirmation is easier to notice than the former single short
  // chirp, while still remaining modest enough for an opt-in game layer.
  start: [
    { shape: 'triangle', frequency: 392, peakGain: 0.07, durationSeconds: 0.13 },
    { shape: 'triangle', frequency: 587.33, peakGain: 0.086, durationSeconds: 0.19, startOffsetSeconds: 0.1 },
  ],
  pickup: [{ shape: 'sine', frequency: 783.99, peakGain: 0.032, durationSeconds: 0.06 }],
  // The brighter rising pair makes a paused upgrade choice unmistakable from
  // both the start confirmation and the frequent XP ping.
  upgrade: [
    { shape: 'sine', frequency: 659.25, peakGain: 0.078, durationSeconds: 0.13 },
    { shape: 'triangle', frequency: 987.77, peakGain: 0.096, durationSeconds: 0.22, startOffsetSeconds: 0.11 },
  ],
  // A lower, rougher warning is distinct from the bright pickup/upgrade
  // family and is audible over the arena without becoming an alarm loop.
  damage: [{ shape: 'sawtooth', frequency: 155.56, peakGain: 0.055, durationSeconds: 0.13 }],
  // This short square pulse is intentionally more present than XP, but the
  // router allows it only as sparse combat punctuation rather than per shot.
  attack: [{ shape: 'square', frequency: 261.63, peakGain: 0.04, durationSeconds: 0.05 }],
  // A bright, tightly spaced pair reads as an instantaneous electric chain,
  // not another launched projectile. Router priority and rate limiting keep
  // this high-frequency cue from masking damage feedback.
  lightning: [
    { shape: 'square', frequency: 1046.5, peakGain: 0.042, durationSeconds: 0.045 },
    { shape: 'triangle', frequency: 1567.98, peakGain: 0.034, durationSeconds: 0.08, startOffsetSeconds: 0.022 },
  ],
  // A descending, short sawtooth sweep makes the close-range Mantis cut read
  // separately from the square auto-fire pop and the bright lightning pair.
  melee: [
    { shape: 'sawtooth', frequency: 440, peakGain: 0.038, durationSeconds: 0.075 },
    { shape: 'triangle', frequency: 293.66, peakGain: 0.026, durationSeconds: 0.095, startOffsetSeconds: 0.018 },
  ],
  victory: [
    { shape: 'triangle', frequency: 523.25, peakGain: 0.06, durationSeconds: 0.13 },
    { shape: 'triangle', frequency: 659.25, peakGain: 0.072, durationSeconds: 0.15, startOffsetSeconds: 0.1 },
    { shape: 'sine', frequency: 783.99, peakGain: 0.084, durationSeconds: 0.24, startOffsetSeconds: 0.2 },
  ],
  defeat: [
    { shape: 'sawtooth', frequency: 196, peakGain: 0.042, durationSeconds: 0.12 },
    { shape: 'triangle', frequency: 146.83, peakGain: 0.052, durationSeconds: 0.24, startOffsetSeconds: 0.1 },
  ],
});

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
    resume(context);
    return true;
  }

  function resumeIfEnabled(): void {
    if (enabled && context !== null && !disposed) resume(context);
  }

  function play(cue: AudioCue): void {
    if (!enabled || context === null || disposed) return;
    try {
      const now = finiteTime(context.currentTime);
      for (const tone of TONES[cue]) {
        const startAt = now + (tone.startOffsetSeconds ?? 0);
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = tone.shape;
        oscillator.frequency.setValueAtTime(tone.frequency, startAt);
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.linearRampToValueAtTime(tone.peakGain, startAt + 0.008);
        gain.gain.linearRampToValueAtTime(0.0001, startAt + tone.durationSeconds);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + tone.durationSeconds + 0.01);
      }
    } catch {
      // A browser may interrupt/close a context between a player gesture and a
      // later routed cue. Keep gameplay alive and wait for the next opt-in tap.
    }
  }

  function suspend(): void {
    if (context === null || disposed) return;
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
    try {
      ignoreFailure(context.close());
    } catch {
      // Some mock/legacy contexts throw on a repeated close; teardown remains safe.
    }
    context = null;
  }

  return {
    get supported() {
      return supported;
    },
    get enabled() {
      return enabled;
    },
    setEnabled,
    resumeIfEnabled,
    play,
    suspend,
    dispose,
  };
}
