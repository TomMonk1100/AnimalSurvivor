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
}

const TONES: Readonly<Record<AudioCue, Tone>> = Object.freeze({
  start: { shape: 'triangle', frequency: 523.25, peakGain: 0.04, durationSeconds: 0.11 },
  pickup: { shape: 'sine', frequency: 783.99, peakGain: 0.028, durationSeconds: 0.055 },
  upgrade: { shape: 'triangle', frequency: 659.25, peakGain: 0.042, durationSeconds: 0.14 },
  victory: { shape: 'sine', frequency: 880, peakGain: 0.05, durationSeconds: 0.2 },
  defeat: { shape: 'sawtooth', frequency: 164.81, peakGain: 0.025, durationSeconds: 0.18 },
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
 * Builds one short, quiet oscillator per routed cue. There are intentionally no
 * attack, hit, or enemy-death sounds: the router only requests sparse player
 * milestones, so the synth stays readable during catch-up or crowded fights.
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
    const tone = TONES[cue];
    try {
      const now = finiteTime(context.currentTime);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = tone.shape;
      oscillator.frequency.setValueAtTime(tone.frequency, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(tone.peakGain, now + 0.008);
      gain.gain.linearRampToValueAtTime(0.0001, now + tone.durationSeconds);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + tone.durationSeconds + 0.01);
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
