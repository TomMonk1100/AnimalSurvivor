/**
 * Presentation-only audio routing. The fixed-tick driver can retain feedback
 * cues for several rendered frames and can advance multiple ticks at once, so
 * this router deduplicates and rate-limits before any browser audio API runs.
 */
import type { RunOutcomeView } from '@sim';
import type { CombatFeedbackSnapshot } from '../presentation/combat-feedback';

export type AudioCue = 'start' | 'pickup' | 'upgrade' | 'victory' | 'defeat';

export interface AudioCueSink {
  /** May safely be a no-op while the player has sound disabled. */
  play(cue: AudioCue): void;
}

export interface AudioCueFrame {
  readonly tick: number;
  readonly combatFeedback: CombatFeedbackSnapshot;
  readonly runOutcome: RunOutcomeView | null;
}

export interface AudioCueRouter {
  /** Emits the intentional start/restart confirmation at most once per run. */
  beginRun(): void;
  /** Starts a new presentation run without retaining stale terminal/cue state. */
  resetForRestart(): void;
  /** Emits once for each freshly rendered upgrade prompt serial. */
  upgradeOpened(serial: number): void;
  /** Observes a rendered frame without ever mutating the authoritative driver. */
  observe(frame: AudioCueFrame): void;
}

/** Five pickup pings per second is ample feedback without turning catch-up into noise. */
export const PICKUP_AUDIO_MIN_INTERVAL_TICKS = 12;

type TerminalCue = 'victory' | 'defeat' | null;

function terminalCue(outcome: RunOutcomeView | null): TerminalCue {
  return outcome === 'victory' || outcome === 'defeat' ? outcome : null;
}

function finiteTick(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

/**
 * The router advances its latches even when the sink is silent. Turning sound
 * on mid-run therefore never replays historical pickups, upgrades, or endings.
 */
export function createAudioCueRouter(sink: AudioCueSink): AudioCueRouter {
  let beganRun = false;
  let lastFrameTick = Number.NEGATIVE_INFINITY;
  let lastObservedPickupTick = Number.NEGATIVE_INFINITY;
  let lastPlayedPickupTick = Number.NEGATIVE_INFINITY;
  let lastUpgradeSerial = 0;
  let terminal: TerminalCue = null;

  function resetForRestart(): void {
    beganRun = false;
    lastFrameTick = Number.NEGATIVE_INFINITY;
    lastObservedPickupTick = Number.NEGATIVE_INFINITY;
    lastPlayedPickupTick = Number.NEGATIVE_INFINITY;
    lastUpgradeSerial = 0;
    terminal = null;
  }

  function beginRun(): void {
    if (beganRun) return;
    beganRun = true;
    sink.play('start');
  }

  function upgradeOpened(serial: number): void {
    if (!Number.isSafeInteger(serial) || serial <= lastUpgradeSerial) return;
    lastUpgradeSerial = serial;
    sink.play('upgrade');
  }

  function observe(frame: AudioCueFrame): void {
    const tick = finiteTick(frame.tick, lastFrameTick);
    if (tick < lastFrameTick) resetForRestart();

    const outcome = terminalCue(frame.runOutcome);
    if (outcome !== null) {
      if (terminal === null) {
        terminal = outcome;
        sink.play(outcome);
      }
      lastFrameTick = tick;
      return;
    }
    terminal = null;

    const freshPickupTicks = frame.combatFeedback.cues
      .filter((cue) => cue.kind === 'pickup' && Number.isFinite(cue.tick) && cue.tick > lastObservedPickupTick)
      .map((cue) => Math.trunc(cue.tick))
      .sort((left, right) => left - right);

    if (freshPickupTicks.length > 0) {
      for (const pickupTick of freshPickupTicks) {
        if (pickupTick - lastPlayedPickupTick >= PICKUP_AUDIO_MIN_INTERVAL_TICKS) {
          sink.play('pickup');
          lastPlayedPickupTick = pickupTick;
          break;
        }
      }
      lastObservedPickupTick = freshPickupTicks[freshPickupTicks.length - 1]!;
    }
    lastFrameTick = tick;
  }

  return { beginRun, resetForRestart, upgradeOpened, observe };
}
