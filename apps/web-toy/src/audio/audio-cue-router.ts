/**
 * Presentation-only audio routing. The fixed-tick driver can retain feedback
 * cues for several rendered frames and can advance multiple ticks at once, so
 * this router deduplicates and rate-limits before any browser audio API runs.
 */
import type { RunOutcomeView } from '@sim';
import type { CombatFeedbackSnapshot } from '../presentation/combat-feedback';

export type AudioCue = 'start' | 'pickup' | 'upgrade' | 'damage' | 'attack' | 'victory' | 'defeat';

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

/** A damage warning remains responsive without becoming a collision-rate metronome. */
export const PLAYER_DAMAGE_AUDIO_MIN_INTERVAL_TICKS = 45;

/**
 * Auto-fire punctuates the fight at most about once every three quarters of a
 * second. It is deliberately much sparser than XP so a dense pickup stream
 * cannot turn it into a metronome.
 */
export const ATTACK_AUDIO_MIN_INTERVAL_TICKS = 45;

type TerminalCue = 'victory' | 'defeat' | null;

function terminalCue(outcome: RunOutcomeView | null): TerminalCue {
  return outcome === 'victory' || outcome === 'defeat' ? outcome : null;
}

function finiteTick(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function freshFeedbackTicks(
  feedback: CombatFeedbackSnapshot,
  kind: 'pickup' | 'player-hit' | 'attack',
  lastObservedTick: number,
): number[] {
  return feedback.cues
    .filter((cue) => cue.kind === kind && Number.isFinite(cue.tick) && cue.tick > lastObservedTick)
    .map((cue) => Math.trunc(cue.tick))
    .sort((left, right) => left - right);
}

function firstRateLimitedTick(
  ticks: readonly number[],
  lastPlayedTick: number,
  intervalTicks: number,
): number | null {
  for (const tick of ticks) {
    if (tick - lastPlayedTick >= intervalTicks) return tick;
  }
  return null;
}

/**
 * The router advances its latches even when the sink is silent. Turning sound
 * on mid-run therefore never replays historical pickups, upgrades, or endings.
 */
export function createAudioCueRouter(sink: AudioCueSink): AudioCueRouter {
  let beganRun = false;
  let lastFrameTick = Number.NEGATIVE_INFINITY;
  let lastObservedDamageTick = Number.NEGATIVE_INFINITY;
  let lastPlayedDamageTick = Number.NEGATIVE_INFINITY;
  let lastObservedPickupTick = Number.NEGATIVE_INFINITY;
  let lastPlayedPickupTick = Number.NEGATIVE_INFINITY;
  let lastObservedAttackTick = Number.NEGATIVE_INFINITY;
  let lastPlayedAttackTick = Number.NEGATIVE_INFINITY;
  let lastUpgradeSerial = 0;
  let terminal: TerminalCue = null;

  function resetForRestart(): void {
    beganRun = false;
    lastFrameTick = Number.NEGATIVE_INFINITY;
    lastObservedDamageTick = Number.NEGATIVE_INFINITY;
    lastPlayedDamageTick = Number.NEGATIVE_INFINITY;
    lastObservedPickupTick = Number.NEGATIVE_INFINITY;
    lastPlayedPickupTick = Number.NEGATIVE_INFINITY;
    lastObservedAttackTick = Number.NEGATIVE_INFINITY;
    lastPlayedAttackTick = Number.NEGATIVE_INFINITY;
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

    const freshDamageTicks = freshFeedbackTicks(
      frame.combatFeedback,
      'player-hit',
      lastObservedDamageTick,
    );
    const damageTick = firstRateLimitedTick(
      freshDamageTicks,
      lastPlayedDamageTick,
      PLAYER_DAMAGE_AUDIO_MIN_INTERVAL_TICKS,
    );
    if (damageTick !== null) {
      sink.play('damage');
      lastPlayedDamageTick = damageTick;
    }
    if (freshDamageTicks.length > 0) {
      lastObservedDamageTick = freshDamageTicks[freshDamageTicks.length - 1]!;
    }

    const freshAttackTicks = freshFeedbackTicks(
      frame.combatFeedback,
      'attack',
      lastObservedAttackTick,
    );
    const attackTick = firstRateLimitedTick(
      freshAttackTicks,
      lastPlayedAttackTick,
      ATTACK_AUDIO_MIN_INTERVAL_TICKS,
    );
    // Damage remains the most urgent signal. Otherwise an eligible attack
    // punctuates pickup-heavy play: the former pickup-first ordering could
    // suppress auto-fire forever once XP began arriving steadily.
    if (attackTick !== null && damageTick === null) {
      sink.play('attack');
      lastPlayedAttackTick = attackTick;
    }
    if (freshAttackTicks.length > 0) {
      // Advance even when another cue won the frame, so a suppressed attack
      // cannot chime late after the visible action has already passed.
      lastObservedAttackTick = freshAttackTicks[freshAttackTicks.length - 1]!;
    }

    const freshPickupTicks = freshFeedbackTicks(
      frame.combatFeedback,
      'pickup',
      lastObservedPickupTick,
    );
    const pickupTick = firstRateLimitedTick(
      freshPickupTicks,
      lastPlayedPickupTick,
      PICKUP_AUDIO_MIN_INTERVAL_TICKS,
    );
    // Never stack an XP ping over a just-routed danger warning or attack
    // punctuation. Its observation latch still advances, so this is a
    // deliberate omission rather than a stale chime later in the run.
    if (pickupTick !== null && damageTick === null && attackTick === null) {
      sink.play('pickup');
      lastPlayedPickupTick = pickupTick;
    }
    if (freshPickupTicks.length > 0) {
      lastObservedPickupTick = freshPickupTicks[freshPickupTicks.length - 1]!;
    }
    lastFrameTick = tick;
  }

  return { beginRun, resetForRestart, upgradeOpened, observe };
}
