/**
 * Agent A — fixed-tick simulation driver. Wraps a `@sim` Simulation with a
 * wall-clock accumulator so gameplay always advances in fixed `1/config.hz`
 * increments, independent of frame rate. Owns the app's double-buffered
 * interpolation snapshots (see snapshot-producer.ts / ../contracts.ts).
 *
 * FROZEN INTEGRATION RULES THIS FILE FOLLOWS:
 *   - Wall-clock delta is NEVER passed into sim.step(); the sim only ever
 *     sees fixed `dt = 1/config.hz` ticks.
 *   - Exactly one canonical TickInput is produced per simulation tick, via
 *     `input.sample(sim.tick, paused)`.
 *   - While paused, no time is accumulated and no gameplay ticks are
 *     stepped; the driver simply holds the last snapshots.
 *   - Catch-up is capped at MAX_CATCHUP_TICKS ticks per frame(); any
 *     accumulator time still in excess after that is discarded and recorded
 *     in `droppedAccumSec`, so a long stall can never spiral into an
 *     unbounded burst of ticks.
 */
import type { InputSource, RenderSnapshot, TickInput } from '../contracts';
import { createSimulation } from '@sim';
import type {
  SimConfig,
  Simulation,
  SimulationOptions,
  RunUpgradeOfferView,
  TraitVisualAttachmentView,
  TraitPresentationEventView,
  UpgradeSelection,
  RunDirectorEventView,
  RunOutcomeView,
  RunPhaseView,
  ReplayRecord,
  UniversalUpgradeCatalog,
} from '@sim';
import { captureSnapshot, createSnapshot } from './snapshot-producer';
import { createCombatFeedbackPool } from '../presentation/combat-feedback-pool';
import type { CombatFeedbackSnapshot } from '../presentation/combat-feedback';
import {
  isCombatPresentationEventView,
  type CombatPresentationEventView,
} from '../presentation/combat-presentation-events';
import { readFusionOffers, type FusionOfferView } from '../presentation/mastery-fusions';

/** Max simulation ticks stepped within a single frame() call. */
export const MAX_CATCHUP_TICKS = 5;

/**
 * Any single frame() wall-clock delta larger than this (seconds) is treated
 * as a stall (e.g. debugger pause, unrelated jank) rather than legitimate
 * elapsed time: the excess above this threshold is dropped before the
 * catch-up loop even runs. `noteVisible` is the primary defense against
 * hidden-tab gaps; this is a defensive backstop for gaps that arrive as a
 * single large frameDelta without an intervening noteVisible call.
 */
const HARD_CLAMP_SEC = 0.25;

/**
 * Tolerance for the `accumulator >= dt` "is a tick due" comparison. Wall-clock
 * timestamps (e.g. performance.now()) grow unboundedly over a long session;
 * subtracting two large-but-close doubles loses precision at roughly this
 * scale, which can otherwise misclassify a legitimately-due tick as "not yet"
 * and stall the accumulator by one tick's worth of time. The epsilon is many
 * orders of magnitude smaller than any real dt (>= 1/1000s), so it never
 * causes a tick to fire early in practice.
 */
const TICK_EPS = 1e-7;

export interface SimDriver {
  /** Snapshot captured at the tick boundary BEFORE the most recent step(s). */
  readonly prev: RenderSnapshot;
  /** Snapshot captured at the tick boundary AFTER the most recent step(s). */
  readonly curr: RenderSnapshot;
  /** Fractional progress toward the next tick, in [0, 1). Interpolate prev->curr by this. */
  readonly alpha: number;
  /** Ticks stepped during the most recent frame() call. */
  readonly ticksLastFrame: number;
  /** Accumulated sim time (seconds) discarded by clamping/the catch-up cap on the most recent frame() call. */
  readonly droppedAccumSec: number;
  readonly tick: number;
  readonly enemiesLive: number;
  readonly enemiesHigh: number;
  readonly projLive: number;
  readonly projHigh: number;
  readonly pickupsLive: number;
  readonly pickupsHigh: number;
  readonly totalKills: number;
  readonly runEssenceEarned: number;
  readonly universalUpgradeRanks: readonly number[];
  readonly universalUpgradeCatalog: UniversalUpgradeCatalog | null;
  readonly universalUpgradeSlotCapacity: number;
  readonly universalUpgradeSlotsUsed: number;
  /** Offers awaiting the player's deterministic level-up choice. */
  readonly pendingUpgradeOffers: readonly RunUpgradeOfferView[];
  /** True while fixed-tick advancement is blocked on an upgrade choice. */
  readonly upgradeSelectionPending: boolean;
  readonly runOutcome: RunOutcomeView | null;
  readonly runPhase: RunPhaseView | null;
  readonly directorEvents: readonly RunDirectorEventView[];
  /** Presentation cues accumulated on every fixed tick, even during catch-up. */
  readonly combatFeedback: CombatFeedbackSnapshot;
  /**
   * Actual trait commands accumulated during the most recent rendered frame.
   * The array and its records are reused on the next frame, so renderers must
   * consume it synchronously rather than retaining a reference.
   */
  readonly traitPresentationEvents: readonly TraitPresentationEventView[];
  /**
   * Read-only combat outcomes accumulated during the most recent rendered
   * frame. Empty when the active simulation does not expose V1.1 events.
   */
  readonly combatPresentationEvents: readonly CombatPresentationEventView[];
  /**
   * V1.1 free Master fusions, present only when the active simulation exports
   * the optional fusion API. Older simulations simply omit this property.
   */
  readonly availableFusions?: readonly FusionOfferView[];
  /** Explicit, free fusion action paired with `availableFusions`. */
  fuseEvolution?(evolutionId: string): void;
  /** Detached deterministic input/upgrade history for optional issue export. */
  replay(): ReplayRecord;
  hash(): string;
  selectUpgrade(id: string): UpgradeSelection;
  traitVisualState(): readonly TraitVisualAttachmentView[];
  /**
   * Advance the driver by one rendered frame. `nowMs` is wall-clock time
   * (e.g. from a rAF callback or performance.now()). Steps zero or more
   * fixed-dt simulation ticks, each fed by exactly one `input.sample(...)`
   * call, then updates `prev`/`curr`/`alpha` for the renderer to interpolate.
   */
  frame(nowMs: number, input: InputSource, paused: boolean): void;
  /**
   * Call when the tab/page regains visibility after being hidden. Resets the
   * wall-clock reference point so the hidden gap is never observed as a
   * frameDelta, preventing an unbounded catch-up burst on the next frame().
   */
  noteVisible(nowMs: number): void;
  /** Rebuilds the simulation with a new seed/options and resets driver clock/snapshots. */
  restart(seed: number, options?: SimulationOptions): void;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

type MutableTraitPresentationEvent = {
  -readonly [Key in keyof TraitPresentationEventView]: TraitPresentationEventView[Key];
};

type MutableCombatPresentationEvent = {
  -readonly [Key in keyof CombatPresentationEventView]: CombatPresentationEventView[Key];
};

interface CombatPresentationEventSource {
  readonly combatPresentationEvents?: unknown;
}

interface FusionSimulationSource {
  readonly availableFusions?: unknown;
  readonly fuseEvolution?: unknown;
}

function readCombatPresentationEvents(simulation: Simulation): unknown {
  return (simulation as unknown as CombatPresentationEventSource).combatPresentationEvents;
}

function fusionSource(simulation: Simulation): FusionSimulationSource {
  return simulation as unknown as FusionSimulationSource;
}

function supportsFusionControls(simulation: Simulation): boolean {
  const source = fusionSource(simulation);
  return typeof source.fuseEvolution === 'function'
    && (typeof source.availableFusions === 'function' || Array.isArray(source.availableFusions));
}

function readAvailableFusions(simulation: Simulation): readonly FusionOfferView[] {
  const source = fusionSource(simulation);
  const value = typeof source.availableFusions === 'function'
    ? source.availableFusions.call(simulation)
    : source.availableFusions;
  return readFusionOffers(value);
}

function fuseSimulationEvolution(simulation: Simulation, evolutionId: string): void {
  const action = fusionSource(simulation).fuseEvolution;
  if (typeof action !== 'function') return;
  action.call(simulation, evolutionId);
}

export function createSimDriver(
  config: SimConfig,
  seed: number,
  options: SimulationOptions = {},
): SimDriver {
  const dt = 1 / config.hz;

  let activeOptions = options;
  let sim: Simulation = createSimulation(config, seed, activeOptions);
  const hasFusionControls = supportsFusionControls(sim);

  // Double-buffered interpolation snapshots. We never reassign the buffers'
  // internal typed arrays — only which buffer plays the "prev" vs "curr"
  // role, by swapping these two references.
  let bufA: RenderSnapshot = createSnapshot(config);
  let bufB: RenderSnapshot = createSnapshot(config);
  let currBuf = bufA;
  let prevBuf = bufB;

  let lastNowMs: number | null = null;
  let accumulator = 0;
  let alpha = 0;
  let ticksLastFrame = 0;
  let droppedAccumSec = 0;
  const frameDirectorEvents: RunDirectorEventView[] = [];
  // Construction-time director events (notably opening phaseStarted at tick
  // zero) occur before the first rendered frame. Hold them until that frame
  // so the presentation layer receives them exactly once.
  const pendingDirectorEvents: RunDirectorEventView[] = [];
  // The simulation's per-step event records are deliberately reused on its
  // next step. Keep an app-owned frame copy so a catch-up frame retains every
  // command rather than five aliases of the final tick's mutable records.
  const traitPresentationEventStorage: MutableTraitPresentationEvent[] = [];
  const frameTraitPresentationEvents: TraitPresentationEventView[] = [];
  // V1.1 combat events use the same reused-array contract as trait events.
  // Preserve all events from a catch-up burst in app-owned records.
  const combatPresentationEventStorage: MutableCombatPresentationEvent[] = [];
  const frameCombatPresentationEvents: CombatPresentationEventView[] = [];
  const combatFeedbackPool = createCombatFeedbackPool();
  let combatFeedback: CombatFeedbackSnapshot = Object.freeze({ tick: sim.tick, cues: Object.freeze([]) });
  let inFrame = false;

  function primeSnapshots(): void {
    // Both buffers start identical (the sim's initial state) so a renderer
    // that reads prev/curr before any tick has stepped gets a valid, stable
    // pose instead of zeroed-out garbage.
    captureSnapshot(currBuf, sim);
    captureSnapshot(prevBuf, sim);
  }
  primeSnapshots();

  function queueConstructionDirectorEvents(): void {
    pendingDirectorEvents.length = 0;
    for (const event of sim.directorEvents) pendingDirectorEvents.push(event);
  }

  function flushConstructionDirectorEvents(): void {
    for (const event of pendingDirectorEvents) frameDirectorEvents.push(event);
    pendingDirectorEvents.length = 0;
  }

  queueConstructionDirectorEvents();

  function captureTraitPresentationEvents(events: readonly TraitPresentationEventView[]): void {
    for (const event of events) {
      const index = frameTraitPresentationEvents.length;
      let copy = traitPresentationEventStorage[index];
      if (copy === undefined) {
        copy = {
          kind: event.kind,
          sourceId: event.sourceId,
          tick: event.tick,
          targeting: event.targeting,
          originX: event.originX,
          originY: event.originY,
          dirX: event.dirX,
          dirY: event.dirY,
          count: event.count,
          damage: event.damage,
          speed: event.speed,
          radius: event.radius,
          strength: event.strength,
          durationTicks: event.durationTicks,
          intervalTicks: event.intervalTicks,
          amount: event.amount,
          arc: event.arc,
          meleeArcResolved: event.meleeArcResolved,
          facing: event.facing,
          spread: event.spread,
          jumps: event.jumps,
          range: event.range,
          tag: event.tag,
          resolvedHitCount: event.resolvedHitCount,
          resolvedHitX: new Float32Array(event.resolvedHitX),
          resolvedHitY: new Float32Array(event.resolvedHitY),
          resolvedOrbitHitCount: event.resolvedOrbitHitCount,
          resolvedOrbitHitX: new Float32Array(event.resolvedOrbitHitX),
          resolvedOrbitHitY: new Float32Array(event.resolvedOrbitHitY),
          resolvedOrbitSourceX: new Float32Array(event.resolvedOrbitSourceX),
          resolvedOrbitSourceY: new Float32Array(event.resolvedOrbitSourceY),
        };
        traitPresentationEventStorage[index] = copy;
      } else {
        copy.kind = event.kind;
        copy.sourceId = event.sourceId;
        copy.tick = event.tick;
        copy.targeting = event.targeting;
        copy.originX = event.originX;
        copy.originY = event.originY;
        copy.dirX = event.dirX;
        copy.dirY = event.dirY;
        copy.count = event.count;
        copy.damage = event.damage;
        copy.speed = event.speed;
        copy.radius = event.radius;
        copy.strength = event.strength;
        copy.durationTicks = event.durationTicks;
        copy.intervalTicks = event.intervalTicks;
        copy.amount = event.amount;
        copy.arc = event.arc;
        copy.meleeArcResolved = event.meleeArcResolved;
        copy.facing = event.facing;
        copy.spread = event.spread;
        copy.jumps = event.jumps;
        copy.range = event.range;
        copy.tag = event.tag;
        copy.resolvedHitCount = event.resolvedHitCount;
        copy.resolvedHitX.set(event.resolvedHitX);
        copy.resolvedHitY.set(event.resolvedHitY);
        copy.resolvedOrbitHitCount = event.resolvedOrbitHitCount;
        copy.resolvedOrbitHitX.set(event.resolvedOrbitHitX);
        copy.resolvedOrbitHitY.set(event.resolvedOrbitHitY);
        copy.resolvedOrbitSourceX.set(event.resolvedOrbitSourceX);
        copy.resolvedOrbitSourceY.set(event.resolvedOrbitSourceY);
      }
      frameTraitPresentationEvents.push(copy);
    }
  }

  function captureCombatPresentationEvents(events: unknown): void {
    if (!Array.isArray(events)) return;
    for (const event of events) {
      if (!isCombatPresentationEventView(event)) continue;
      const index = frameCombatPresentationEvents.length;
      let copy = combatPresentationEventStorage[index];
      if (copy === undefined) {
        copy = {
          kind: event.kind,
          tick: event.tick,
          x: event.x,
          y: event.y,
          amount: event.amount,
          critical: event.critical,
          sourceId: event.sourceId,
          targetId: event.targetId,
          pickupKind: event.pickupKind,
        };
        combatPresentationEventStorage[index] = copy;
      } else {
        copy.kind = event.kind;
        copy.tick = event.tick;
        copy.x = event.x;
        copy.y = event.y;
        copy.amount = event.amount;
        copy.critical = event.critical;
        copy.sourceId = event.sourceId;
        copy.targetId = event.targetId;
        copy.pickupKind = event.pickupKind;
      }
      frameCombatPresentationEvents.push(copy);
    }
  }

  function frame(nowMs: number, input: InputSource, paused: boolean): void {
    if (inFrame) {
      throw new Error('SimDriver.frame() called reentrantly');
    }
    inFrame = true;
    try {
      const frameDeltaMs = lastNowMs === null ? 0 : nowMs - lastNowMs;
      lastNowMs = nowMs;

      ticksLastFrame = 0;
      droppedAccumSec = 0;
      frameDirectorEvents.length = 0;
      frameTraitPresentationEvents.length = 0;
      frameCombatPresentationEvents.length = 0;
      flushConstructionDirectorEvents();

      const terminalBeforeFrame = sim.runOutcome !== null && sim.runOutcome !== 'running';
      if (paused || sim.upgradeSelectionPending || terminalBeforeFrame) {
        // Do not accumulate time and do not step gameplay ticks. prev/curr/
        // alpha are left exactly as they were; the renderer keeps showing
        // the last interpolated pose. An upgrade prompt is a simulation-owned
        // pause: updating lastNowMs above prevents prompt dwell time from
        // becoming a catch-up burst, while the pre-existing accumulator is
        // retained for a clean resume after selection.
        return;
      }

      let frameDeltaSec = frameDeltaMs / 1000;
      if (frameDeltaSec < 0) {
        // Defensive: a non-monotonic clock must never run time backwards.
        frameDeltaSec = 0;
      }
      if (frameDeltaSec > HARD_CLAMP_SEC) {
        droppedAccumSec += frameDeltaSec - HARD_CLAMP_SEC;
        frameDeltaSec = HARD_CLAMP_SEC;
      }

      accumulator += frameDeltaSec;

      let stepped = 0;
      while (accumulator + TICK_EPS >= dt && stepped < MAX_CATCHUP_TICKS) {
        // Rotate and capture on EVERY stepped tick. After a multi-tick catch-up
        // burst, prev/curr must represent the final two adjacent tick states,
        // not the state before the entire burst and the final state.
        const tmp = prevBuf;
        prevBuf = currBuf;
        currBuf = tmp;
        const tickInput: TickInput = input.sample(sim.tick, false);
        sim.step(tickInput);
        for (const event of sim.directorEvents) frameDirectorEvents.push(event);
        captureTraitPresentationEvents(sim.traitPresentationEvents);
        captureCombatPresentationEvents(readCombatPresentationEvents(sim));
        captureSnapshot(currBuf, sim);
        combatFeedback = combatFeedbackPool.advance(prevBuf, currBuf);
        accumulator -= dt;
        stepped++;
        if (sim.runOutcome !== null && sim.runOutcome !== 'running') {
          // A terminal tick is a hard gameplay boundary. Discard accumulated
          // wall-clock time rather than allowing later loop iterations to add
          // kills, XP, or presentation state after terminal settlement.
          accumulator = 0;
          break;
        }
        if (sim.upgradeSelectionPending) {
          // A level-up choice is a tick boundary. Do not consume any more of
          // this frame's already-accumulated time until the choice is made.
          break;
        }
      }

      if (!sim.upgradeSelectionPending && accumulator + TICK_EPS >= dt) {
        // Catch-up cap hit and time is still owed. Never let it spiral:
        // discard whole-tick multiples of the excess, keeping only the
        // sub-dt remainder so `alpha` stays well-defined and continuous.
        const keep = accumulator % dt;
        droppedAccumSec += accumulator - keep;
        accumulator = keep;
      }

      ticksLastFrame = stepped;
      // Present the exact boundary snapshot while the upgrade chooser is up;
      // accumulator time is preserved independently for post-choice resume.
      alpha = sim.upgradeSelectionPending ? 0 : clamp01(accumulator / dt);
    } finally {
      inFrame = false;
    }
  }

  function noteVisible(nowMs: number): void {
    lastNowMs = nowMs;
  }

  function restart(newSeed: number, nextOptions?: SimulationOptions): void {
    if (inFrame) {
      throw new Error('SimDriver.restart() called during frame()');
    }
    if (nextOptions !== undefined) activeOptions = nextOptions;
    sim = createSimulation(config, newSeed, activeOptions);
    accumulator = 0;
    lastNowMs = null;
    alpha = 0;
    ticksLastFrame = 0;
    droppedAccumSec = 0;
    frameDirectorEvents.length = 0;
    queueConstructionDirectorEvents();
    frameTraitPresentationEvents.length = 0;
    frameCombatPresentationEvents.length = 0;
    combatFeedbackPool.reset();
    primeSnapshots();
    combatFeedback = Object.freeze({ tick: sim.tick, cues: Object.freeze([]) });
  }

  const driver: SimDriver = {
    get prev() {
      return prevBuf;
    },
    get curr() {
      return currBuf;
    },
    get alpha() {
      return alpha;
    },
    get ticksLastFrame() {
      return ticksLastFrame;
    },
    get droppedAccumSec() {
      return droppedAccumSec;
    },
    get tick() {
      return sim.tick;
    },
    get enemiesLive() {
      return sim.enemies.data.count;
    },
    get enemiesHigh() {
      return sim.enemies.data.highWater;
    },
    get projLive() {
      return sim.projectiles.data.count;
    },
    get projHigh() {
      return sim.projectiles.data.highWater;
    },
    get pickupsLive() {
      return sim.pickups.data.count;
    },
    get pickupsHigh() {
      return sim.pickups.data.highWater;
    },
    get totalKills() {
      return sim.totalKills;
    },
    get runEssenceEarned() {
      return sim.runEssenceEarned;
    },
    get universalUpgradeRanks() {
      return sim.universalUpgradeRanks;
    },
    get universalUpgradeCatalog() {
      return sim.universalUpgradeCatalog;
    },
    get universalUpgradeSlotCapacity() {
      return sim.universalUpgradeSlotCapacity;
    },
    get universalUpgradeSlotsUsed() {
      return sim.universalUpgradeSlotsUsed;
    },
    get pendingUpgradeOffers() {
      return sim.pendingUpgradeOffers;
    },
    get upgradeSelectionPending() {
      return sim.upgradeSelectionPending;
    },
    get runOutcome() {
      return sim.runOutcome;
    },
    get runPhase() {
      return sim.runPhase;
    },
    get directorEvents() {
      return frameDirectorEvents;
    },
    get combatFeedback() {
      return combatFeedback;
    },
    get traitPresentationEvents() {
      return frameTraitPresentationEvents;
    },
    get combatPresentationEvents() {
      return frameCombatPresentationEvents;
    },
    hash() {
      return sim.hash();
    },
    replay() {
      return sim.getReplay();
    },
    selectUpgrade(id: string) {
      const selection = sim.selectUpgrade(id);
      // A choice changes authoritative stats at the same fixed-tick boundary.
      // Refresh both interpolation buffers immediately so the paused HUD and
      // resume frame never display stale max HP, pickup radius, or movement.
      captureSnapshot(currBuf, sim);
      captureSnapshot(prevBuf, sim);
      alpha = 0;
      return selection;
    },
    traitVisualState() {
      return sim.traitVisualState();
    },
    frame,
    noteVisible,
    restart,
  };
  if (hasFusionControls) {
    Object.defineProperty(driver, 'availableFusions', {
      enumerable: true,
      get(): readonly FusionOfferView[] {
        return readAvailableFusions(sim);
      },
    });
    driver.fuseEvolution = (evolutionId: string): void => {
      if (typeof evolutionId !== 'string' || evolutionId.trim().length === 0) {
        throw new TypeError('fusion evolutionId must be a non-blank string');
      }
      fuseSimulationEvolution(sim, evolutionId);
    };
  }
  return driver;
}
