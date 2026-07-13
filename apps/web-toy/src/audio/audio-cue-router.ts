/**
 * Presentation-only audio routing. The fixed-tick driver can retain feedback
 * cues for several rendered frames and can advance multiple ticks at once, so
 * this router deduplicates and rate-limits before any browser audio API runs.
 */
import type { RunDirectorEventView, RunOutcomeView } from '@sim';
import type { CombatFeedbackSnapshot } from '../presentation/combat-feedback';

/**
 * A cue is deliberately a presentation vocabulary rather than a simulation
 * event. Individual trait voices make the player's loadout legible by ear,
 * while the three generic resolved-hit voices remain useful fallbacks for
 * older/replay fixtures that do not carry a source id.
 */
export type AudioCue =
  | 'start'
  | 'pickup'
  | 'upgrade'
  | 'damage'
  | 'attack'
  | 'lightning'
  | 'melee'
  | 'orbit'
  | 'quills'
  | 'puffer'
  | 'eel'
  | 'firefly'
  | 'mantis'
  | 'gecko'
  | 'owl'
  | 'bat'
  | 'crab'
  | 'armadillo'
  | 'skunk'
  | 'monarch'
  | 'thornstorm'
  | 'thunderbug'
  | 'razorstep'
  | 'midnight'
  | 'meteor'
  | 'royal-stinkcloud'
  | 'greg'
  | 'benny'
  | 'gracie'
  | 'enemy-warning'
  | 'boss-telegraph'
  | 'boss-warning'
  | 'boss-arrive'
  | 'victory'
  | 'defeat';

type SourceAudioCue = Exclude<
  AudioCue,
  | 'start'
  | 'pickup'
  | 'upgrade'
  | 'damage'
  | 'attack'
  | 'lightning'
  | 'melee'
  | 'orbit'
  | 'boss-warning'
  | 'boss-arrive'
  | 'victory'
  | 'defeat'
>;

/**
 * Stable presentation mapping for every current launch trait, hero instinct,
 * and in-run enemy telegraph source. This is intentionally outside simulation
 * state: changing a voice never changes a run hash or replay.
 */
export const AUDIO_SOURCE_CUE_MAP: Readonly<Record<string, SourceAudioCue>> = Object.freeze({
  'porcupine-quills': 'quills',
  'puffer-pouch': 'puffer',
  'electric-eel-coil': 'eel',
  'firefly-colony': 'firefly',
  'mantis-scythes': 'mantis',
  'gecko-pads': 'gecko',
  'owl-pinions': 'owl',
  'bat-ears': 'bat',
  'crab-pincers': 'crab',
  'armadillo-greaves': 'armadillo',
  'skunk-brush': 'skunk',
  'monarch-brood': 'monarch',
  'thornstorm-mantle': 'thornstorm',
  'thunderbug-dynamo': 'thunderbug',
  'razorstep-chimera': 'razorstep',
  'midnight-radar': 'midnight',
  'meteor-mauler': 'meteor',
  'royal-stinkcloud': 'royal-stinkcloud',
  'greg-rush-rake': 'greg',
  'benny-brace': 'benny',
  'gracie-scout': 'gracie',
  'forest-final-threat': 'boss-telegraph',
  'forest-support': 'enemy-warning',
});

export const AUDIO_SOURCE_IDS = Object.freeze(Object.keys(AUDIO_SOURCE_CUE_MAP));

export function audioCueForSourceId(sourceId: string): SourceAudioCue | null {
  return AUDIO_SOURCE_CUE_MAP[sourceId] ?? null;
}

/**
 * The audio layer only needs enough of a trait presentation event to identify
 * a resolved chain strike. Keeping this structural prevents presentation audio
 * from depending on simulation internals or retaining mutable event buffers.
 */
export interface TraitCommandAudioEvent {
  readonly kind: string;
  /** Present on real simulation events; optional keeps lightweight test fixtures compatible. */
  readonly sourceId?: string;
  readonly tick: number;
  readonly resolvedHitCount?: number;
  /** Set only when the authoritative executor actually resolved a melee target. */
  readonly meleeArcResolved?: boolean;
  /** Presentation direction only; never use it as a hit/success signal. */
  readonly dirX?: number;
  readonly dirY?: number;
}

export interface AudioCueSink {
  /** May safely be a no-op while the player has sound disabled. */
  play(cue: AudioCue): void;
}

export interface AudioCueFrame {
  readonly tick: number;
  readonly combatFeedback: CombatFeedbackSnapshot;
  /** Actual trait commands emitted during this rendered frame, if any. */
  readonly traitPresentationEvents?: readonly TraitCommandAudioEvent[];
  readonly directorEvents?: readonly RunDirectorEventView[];
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

/**
 * A lightning strike may chain through several enemies but remains one concise
 * cue. Two pulses per second is legible without covering danger feedback.
 */
export const LIGHTNING_AUDIO_MIN_INTERVAL_TICKS = 30;

/** A close-range sweep can be heard more often than sparse auto-fire, but not every frame. */
export const MELEE_AUDIO_MIN_INTERVAL_TICKS = 24;

/** Orbit contact is a persistent defensive identity, but remains sparse enough to avoid a hum. */
export const ORBIT_AUDIO_MIN_INTERVAL_TICKS = 30;

/** Source identity cues are intentionally sparser than the event stream. */
export const TRAIT_AUDIO_MIN_INTERVAL_TICKS = 30;

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

interface FreshAudioEvent {
  readonly tick: number;
  readonly cue: AudioCue;
}

function resolvedCueForEvent(event: TraitCommandAudioEvent, fallback: 'lightning' | 'melee' | 'orbit'): AudioCue {
  if (event.sourceId === undefined) return fallback;
  return audioCueForSourceId(event.sourceId) ?? fallback;
}

function freshResolvedAudioEvents(
  events: readonly TraitCommandAudioEvent[] | undefined,
  lastObservedTick: number,
  kind: 'chainDamage' | 'meleeArc' | 'orbitingDamage',
  fallback: 'lightning' | 'melee' | 'orbit',
  hasResolvedHit: (event: TraitCommandAudioEvent) => boolean,
): FreshAudioEvent[] {
  if (events === undefined) return [];
  return events
    .filter((event) => (
      event.kind === kind
      && Number.isFinite(event.tick)
      && event.tick > lastObservedTick
      && hasResolvedHit(event)
    ))
    .map((event) => ({ tick: Math.trunc(event.tick), cue: resolvedCueForEvent(event, fallback) }))
    .sort((left, right) => left.tick - right.tick);
}

function sourceCueForEvent(event: TraitCommandAudioEvent): SourceAudioCue | null {
  // These three identities already have authoritative, hit-aware routing
  // below. Do not let a generic source fallback turn a miss into a success cue
  // or play two voices for the same resolved command.
  if (event.kind === 'chainDamage' || event.kind === 'meleeArc' || event.kind === 'orbitingDamage') return null;
  if (event.sourceId === undefined) return null;
  return audioCueForSourceId(event.sourceId);
}

function freshSourceAudioEvents(
  events: readonly TraitCommandAudioEvent[] | undefined,
  lastObservedTick: number,
): FreshAudioEvent[] {
  if (events === undefined) return [];
  return events
    .filter((event) => Number.isFinite(event.tick) && event.tick > lastObservedTick)
    .map((event): FreshAudioEvent | null => {
      const cue = sourceCueForEvent(event);
      return cue === null ? null : { tick: Math.trunc(event.tick), cue };
    })
    .filter((event): event is FreshAudioEvent => event !== null)
    .sort((left, right) => left.tick - right.tick);
}

function firstRateLimitedSourceEvent(
  events: readonly FreshAudioEvent[],
  lastPlayedTick: number,
  intervalTicks: number,
): FreshAudioEvent | null {
  for (const event of events) {
    if (event.tick - lastPlayedTick >= intervalTicks) return event;
  }
  return null;
}

function firstRateLimitedAudioEvent(
  events: readonly FreshAudioEvent[],
  lastPlayedTick: number,
  intervalTicks: number,
): FreshAudioEvent | null {
  for (const event of events) {
    if (event.tick - lastPlayedTick >= intervalTicks) return event;
  }
  return null;
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
  let lastObservedLightningTick = Number.NEGATIVE_INFINITY;
  let lastPlayedLightningTick = Number.NEGATIVE_INFINITY;
  let lastObservedMeleeTick = Number.NEGATIVE_INFINITY;
  let lastPlayedMeleeTick = Number.NEGATIVE_INFINITY;
  let lastObservedOrbitTick = Number.NEGATIVE_INFINITY;
  let lastPlayedOrbitTick = Number.NEGATIVE_INFINITY;
  let lastObservedTraitSourceTick = Number.NEGATIVE_INFINITY;
  let lastPlayedTraitSourceTick = Number.NEGATIVE_INFINITY;
  let lastUpgradeSerial = 0;
  let lastObservedDirectorSeq = Number.NEGATIVE_INFINITY;
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
    lastObservedLightningTick = Number.NEGATIVE_INFINITY;
    lastPlayedLightningTick = Number.NEGATIVE_INFINITY;
    lastObservedMeleeTick = Number.NEGATIVE_INFINITY;
    lastPlayedMeleeTick = Number.NEGATIVE_INFINITY;
    lastObservedOrbitTick = Number.NEGATIVE_INFINITY;
    lastPlayedOrbitTick = Number.NEGATIVE_INFINITY;
    lastObservedTraitSourceTick = Number.NEGATIVE_INFINITY;
    lastPlayedTraitSourceTick = Number.NEGATIVE_INFINITY;
    lastUpgradeSerial = 0;
    lastObservedDirectorSeq = Number.NEGATIVE_INFINITY;
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

    const freshDirectorEvents = (frame.directorEvents ?? [])
      .filter((event) => Number.isSafeInteger(event.seq) && event.seq > lastObservedDirectorSeq)
      .sort((left, right) => left.seq - right.seq);
    for (const event of freshDirectorEvents) {
      if (event.kind === 'bossWarning') sink.play('boss-warning');
      if (event.kind === 'bossRequested') sink.play('boss-arrive');
    }
    if (freshDirectorEvents.length > 0) {
      lastObservedDirectorSeq = freshDirectorEvents[freshDirectorEvents.length - 1]!.seq;
    }

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

    const freshLightning = freshResolvedAudioEvents(
      frame.traitPresentationEvents,
      lastObservedLightningTick,
      'chainDamage',
      'lightning',
      (event) => Number.isFinite(event.resolvedHitCount) && event.resolvedHitCount! > 0,
    );
    const lightningEvent = firstRateLimitedAudioEvent(
      freshLightning,
      lastPlayedLightningTick,
      LIGHTNING_AUDIO_MIN_INTERVAL_TICKS,
    );
    // Danger must always cut through. A successful chain then reads ahead of
    // ordinary auto-fire, so the new attack identity is never mistaken for
    // another projectile punctuation.
    if (lightningEvent !== null && damageTick === null) {
      sink.play(lightningEvent.cue);
      lastPlayedLightningTick = lightningEvent.tick;
    }
    if (freshLightning.length > 0) {
      lastObservedLightningTick = freshLightning[freshLightning.length - 1]!.tick;
    }

    const freshMelee = freshResolvedAudioEvents(
      frame.traitPresentationEvents,
      lastObservedMeleeTick,
      'meleeArc',
      'melee',
      (event) => event.meleeArcResolved === true,
    );
    const meleeEvent = firstRateLimitedAudioEvent(
      freshMelee,
      lastPlayedMeleeTick,
      MELEE_AUDIO_MIN_INTERVAL_TICKS,
    );
    // A clean scythe swish is a meaningful attack identity, but it never
    // obscures danger or the more urgent guaranteed lightning discharge.
    if (meleeEvent !== null && damageTick === null && lightningEvent === null) {
      sink.play(meleeEvent.cue);
      lastPlayedMeleeTick = meleeEvent.tick;
    }
    if (freshMelee.length > 0) {
      lastObservedMeleeTick = freshMelee[freshMelee.length - 1]!.tick;
    }

    const freshOrbit = freshResolvedAudioEvents(
      frame.traitPresentationEvents,
      lastObservedOrbitTick,
      'orbitingDamage',
      'orbit',
      () => true,
    );
    const orbitEvent = firstRateLimitedAudioEvent(
      freshOrbit,
      lastPlayedOrbitTick,
      ORBIT_AUDIO_MIN_INTERVAL_TICKS,
    );
    // Orbit contact is less urgent than a confirmed strike or melee hit, but
    // it still deserves its own identity before ordinary auto-fire texture.
    if (orbitEvent !== null && damageTick === null && lightningEvent === null && meleeEvent === null) {
      sink.play(orbitEvent.cue);
      lastPlayedOrbitTick = orbitEvent.tick;
    }
    if (freshOrbit.length > 0) {
      lastObservedOrbitTick = freshOrbit[freshOrbit.length - 1]!.tick;
    }

    const traitEvents = frame.traitPresentationEvents ?? [];
    const freshTraitSource = firstRateLimitedSourceEvent(
      freshSourceAudioEvents(traitEvents, lastObservedTraitSourceTick),
      lastPlayedTraitSourceTick,
      TRAIT_AUDIO_MIN_INTERVAL_TICKS,
    );
    // Source identity is useful texture, but never outranks a confirmed hit,
    // danger, or the already-specialized chain/melee/orbit voices above.
    if (
      freshTraitSource !== null
      && damageTick === null
      && lightningEvent === null
      && meleeEvent === null
      && orbitEvent === null
    ) {
      sink.play(freshTraitSource.cue);
      lastPlayedTraitSourceTick = freshTraitSource.tick;
    }
    const freshTraitTicks = traitEvents
      .filter((event) => Number.isFinite(event.tick) && Math.trunc(event.tick) > lastObservedTraitSourceTick)
      .map((event) => Math.trunc(event.tick))
      .sort((left, right) => left - right);
    if (freshTraitTicks.length > 0) {
      lastObservedTraitSourceTick = freshTraitTicks[freshTraitTicks.length - 1]!;
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
    // Damage remains the most urgent signal, followed by an eligible resolved
    // lightning strike. Otherwise an eligible attack punctuates pickup-heavy
    // play: the former pickup-first ordering could suppress auto-fire forever
    // once XP began arriving steadily.
    if (attackTick !== null && damageTick === null && lightningEvent === null && meleeEvent === null && orbitEvent === null) {
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
    // Never stack an XP ping over a just-routed danger warning, lightning, melee, or attack
    // punctuation. Its observation latch still advances, so this is a
    // deliberate omission rather than a stale chime later in the run.
    if (pickupTick !== null && damageTick === null && lightningEvent === null && meleeEvent === null && orbitEvent === null && attackTick === null) {
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
