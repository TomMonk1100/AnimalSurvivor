import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, UNIVERSAL_UPGRADE_CATALOG } from '@sim';
import type {
  SimConfig,
  TraitRuntimeFactory,
  TraitRuntimePort,
  TraitRuntimeUpdateContext,
  RunDirectorFactory,
  RunDirectorPort,
  RunMetricsView,
} from '@sim';
import type { InputSource, TickInput } from '../src/contracts';
import { createSimDriver, MAX_CATCHUP_TICKS } from '../src/sim/simulation-driver';

const SEED = 1234;

/** Deterministic, DOM-free stub: constant movement intent, ignores tick/paused. */
class ConstantInput implements InputSource {
  constructor(private readonly moveX: number = 0, private readonly moveY: number = 0) {}
  sample(_tick: number, _paused: boolean): TickInput {
    return { moveX: this.moveX, moveY: this.moveY, paused: false };
  }
  clear(): void {}
  dispose(): void {}
}

const HZ = DEFAULT_CONFIG.hz;
const DT_MS = 1000 / HZ;

function createUpgradeRuntimeFactory(
  constructions: Array<{ seed: number; initialTick: number }>,
): TraitRuntimeFactory {
  return ({ seed, initialTick }): TraitRuntimePort => {
    constructions.push({ seed, initialTick });
    let selected = false;
    let lastTick = initialTick;
    return {
      update(context: TraitRuntimeUpdateContext) {
        if (context.tick !== lastTick + 1) throw new Error('non-sequential trait tick');
        lastTick = context.tick;
        return {
          length: 0,
          at(): never {
            throw new RangeError('empty command source');
          },
        };
      },
      offers() {
        return selected ? [] : [{ traitId: 'fox-tail', resultStage: 'bud' }];
      },
      applyUpgrade(traitId: string) {
        if (traitId !== 'fox-tail') {
          return { outcome: { ok: false, kind: 'unknownTrait', traitId }, evolved: null };
        }
        selected = true;
        return {
          outcome: { ok: true, kind: 'created', traitId, stage: 'bud' },
          evolved: null,
        };
      },
      visualState() {
        return selected
          ? [{
              sourceId: 'fox-tail',
              stage: 'bud',
              sockets: ['tail'],
              visualKey: 'fox-tail-bud',
              enabled: true,
            }]
          : [];
      },
      hash() {
        return selected ? '0000000000000001' : '0000000000000000';
      },
      fingerprint() {
        return '1234567890abcdef';
      },
    };
  };
}

function createFeedbackRuntimeFactory(): TraitRuntimeFactory {
  return ({ initialTick }): TraitRuntimePort => {
    let lastTick = initialTick;
    return {
      update(context: TraitRuntimeUpdateContext) {
        if (context.tick !== lastTick + 1) throw new Error('non-sequential trait tick');
        lastTick = context.tick;
        return {
          length: 1,
          at(index) {
            if (index !== 0) throw new RangeError('only one command');
            return {
              kind: 'spawnProjectileBurst', sourceId: 'test-feedback', tick: context.tick, targeting: 'none',
              originX: context.playerX, originY: context.playerY, dirX: 1, dirY: 0,
              count: 1, damage: 0, speed: 1, radius: 0, strength: 0, durationTicks: 7,
              facing: 0, spread: 0, range: 0, tag: `test-${context.tick}`,
            };
          },
        };
      },
      offers: () => [],
      applyUpgrade: (traitId) => ({ outcome: { ok: false, kind: 'unknownTrait', traitId }, evolved: null }),
      visualState: () => [],
      hash: () => lastTick.toString(16).padStart(16, '0'),
      fingerprint: () => '0123456789abcdef',
    };
  };
}

describe('createSimDriver: fixed-tick accumulator', () => {
  it('retains feedback from every tick in a multi-tick catch-up frame', () => {
    const driver = createSimDriver(DEFAULT_CONFIG, SEED, { traitRuntimeFactory: createFeedbackRuntimeFactory() });
    const input = new ConstantInput();

    driver.frame(0, input, false);
    driver.frame(DT_MS * 5, input, false);

    expect(driver.tick).toBe(5);
    expect(driver.combatFeedback.cues.filter((cue) => cue.kind === 'attack').map((cue) => cue.tick)).toEqual([1, 2, 3, 4, 5]);
  });

  it('retains detached trait command events from every tick in a multi-tick catch-up frame', () => {
    const driver = createSimDriver(DEFAULT_CONFIG, SEED, { traitRuntimeFactory: createFeedbackRuntimeFactory() });
    const input = new ConstantInput();

    driver.frame(0, input, false);
    driver.frame(DT_MS * 5, input, false);

    expect(driver.tick).toBe(5);
    expect(driver.traitPresentationEvents.map((event) => event.tick)).toEqual([1, 2, 3, 4, 5]);
    expect(driver.traitPresentationEvents.map((event) => event.tag)).toEqual([
      'test-1', 'test-2', 'test-3', 'test-4', 'test-5',
    ]);
    expect(driver.traitPresentationEvents.every((event) => event.durationTicks === 7)).toBe(true);

    // A zero-tick rendered frame has no new commands; stale event references
    // cannot accidentally fire a second visual effect.
    driver.frame(DT_MS * 5 + 1, input, false);
    expect(driver.traitPresentationEvents).toEqual([]);
  });

  it('retains director events from every tick in a multi-tick catch-up frame', () => {
    const runDirectorFactory: RunDirectorFactory = (): RunDirectorPort => {
      let tick = -1;
      return {
        outcome: 'running',
        get tick() { return tick; },
        phase: 'opening',
        step(metrics: RunMetricsView) {
          tick = metrics.tick;
          return metrics.tick === 2
            ? [{ kind: 'eliteWarning', tick: 2, seq: 1, phase: 'opening', beatId: 'test', requestTick: 20 }]
            : [];
        },
        stateHash: () => '0000000000000000',
        contentFingerprint: () => 'abcdef12',
      };
    };
    const driver = createSimDriver(DEFAULT_CONFIG, SEED, { runDirectorFactory });
    const input = new ConstantInput();

    driver.frame(0, input, false);
    driver.frame(DT_MS * 4, input, false);

    expect(driver.tick).toBe(4);
    expect(driver.directorEvents.map((event) => event.kind)).toEqual(['eliteWarning']);
    expect(driver.directorEvents[0]?.tick).toBe(2);
  });

  it('presents tick-zero director events on the first frame and after restart', () => {
    const runDirectorFactory: RunDirectorFactory = (): RunDirectorPort => {
      let tick = -1;
      return {
        outcome: 'running',
        get tick() { return tick; },
        phase: 'opening',
        step(metrics: RunMetricsView) {
          tick = metrics.tick;
          return metrics.tick === 0
            ? [{ kind: 'phaseStarted', tick: 0, seq: 1, phase: 'opening', phaseId: 'opening' }]
            : [];
        },
        stateHash: () => Math.max(0, tick).toString(16).padStart(8, '0'),
        contentFingerprint: () => '0badf00d',
      };
    };
    const driver = createSimDriver(DEFAULT_CONFIG, SEED, { runDirectorFactory });
    const input = new ConstantInput();

    driver.frame(0, input, false);
    expect(driver.directorEvents).toEqual([
      { kind: 'phaseStarted', tick: 0, seq: 1, phase: 'opening', phaseId: 'opening' },
    ]);
    driver.frame(DT_MS, input, false);
    expect(driver.directorEvents).toEqual([]);

    driver.restart(SEED + 1);
    driver.frame(0, input, false);
    expect(driver.directorEvents).toEqual([
      { kind: 'phaseStarted', tick: 0, seq: 1, phase: 'opening', phaseId: 'opening' },
    ]);
  });

  it('stops a catch-up frame on its terminal tick', () => {
    const runDirectorFactory: RunDirectorFactory = (): RunDirectorPort => {
      let tick = -1;
      let outcome: 'running' | 'defeat' = 'running';
      return {
        get outcome() { return outcome; },
        get tick() { return tick; },
        phase: 'opening',
        step(metrics: RunMetricsView) {
          tick = metrics.tick;
          if (tick === 1) {
            outcome = 'defeat';
            return [{ kind: 'defeat', tick, seq: 1, phase: 'opening' }];
          }
          return [];
        },
        stateHash: () => '00000001',
        contentFingerprint: () => 'abcdef12',
      };
    };
    const driver = createSimDriver(DEFAULT_CONFIG, SEED, { runDirectorFactory });
    const input = new ConstantInput();

    driver.frame(0, input, false);
    driver.frame(DT_MS * MAX_CATCHUP_TICKS, input, false);

    expect(driver.tick).toBe(1);
    expect(driver.ticksLastFrame).toBe(1);
    expect(driver.runOutcome).toBe('defeat');
    driver.frame(DT_MS * (MAX_CATCHUP_TICKS + 1), input, false);
    expect(driver.tick).toBe(1);
    expect(driver.ticksLastFrame).toBe(0);
  });

  it('refreshes snapshots immediately after a universal upgrade selection', () => {
    const config = { ...DEFAULT_CONFIG, waves: [], xpThresholds: [0] };
    const driver = createSimDriver(config, SEED, { universalUpgradeCatalog: UNIVERSAL_UPGRADE_CATALOG });
    const input = new ConstantInput();

    driver.frame(0, input, false);
    driver.frame(DT_MS, input, false);
    expect(driver.upgradeSelectionPending).toBe(true);

    driver.selectUpgrade('universal:sturdy-hide');
    expect(driver.curr.playerMaxHp).toBe(DEFAULT_CONFIG.player.maxHp + 15);
    expect(driver.prev.playerMaxHp).toBe(DEFAULT_CONFIG.player.maxHp + 15);
    expect(driver.alpha).toBe(0);
  });

  it('advances the exact expected tick count, including a fractional-remainder case', () => {
    const driver = createSimDriver(DEFAULT_CONFIG, SEED);
    const input = new ConstantInput(0, 0);

    driver.frame(0, input, false);
    expect(driver.tick).toBe(0);
    expect(driver.ticksLastFrame).toBe(0);

    // +10ms: below one dt (~16.667ms) -> no tick yet, fractional remainder held.
    driver.frame(10, input, false);
    expect(driver.tick).toBe(0);
    expect(driver.ticksLastFrame).toBe(0);

    // +10ms more (accumulator now 20ms >= 16.667ms) -> exactly 1 tick.
    driver.frame(20, input, false);
    expect(driver.tick).toBe(1);
    expect(driver.ticksLastFrame).toBe(1);

    // +40ms (accumulator ~= 3.333ms leftover + 40ms = 43.333ms -> 2 ticks, ~10ms leftover).
    driver.frame(60, input, false);
    expect(driver.tick).toBe(3);
    expect(driver.ticksLastFrame).toBe(2);
  });

  it('steps a multi-tick catch-up burst within the cap for a single large-but-bounded delta', () => {
    const driver = createSimDriver(DEFAULT_CONFIG, SEED);
    const input = new ConstantInput(0, 0);

    driver.frame(0, input, false);
    // 4 ticks' worth of time in one jump: under both MAX_CATCHUP_TICKS (5)
    // and the hard wall-clock clamp (250ms), so nothing should be dropped.
    driver.frame(DT_MS * 4, input, false);

    expect(driver.tick).toBe(4);
    expect(driver.ticksLastFrame).toBe(4);
    expect(driver.droppedAccumSec).toBe(0);
    expect(driver.curr.tick).toBe(4);
    expect(driver.prev.tick).toBe(3);
  });

  it('caps catch-up at MAX_CATCHUP_TICKS and records positive droppedAccumSec without spiraling', () => {
    const driver = createSimDriver(DEFAULT_CONFIG, SEED);
    const input = new ConstantInput(0, 0);

    driver.frame(0, input, false);
    // 12 ticks' worth of time, still under the 250ms hard clamp, but above the cap.
    driver.frame(DT_MS * 12, input, false);

    expect(driver.ticksLastFrame).toBe(MAX_CATCHUP_TICKS);
    expect(driver.tick).toBe(MAX_CATCHUP_TICKS);
    expect(driver.droppedAccumSec).toBeGreaterThan(0);

    // A subsequent normal frame steps a normal (small) number of ticks - no spiral.
    driver.frame(DT_MS * 12 + DT_MS, input, false);
    expect(driver.ticksLastFrame).toBeLessThanOrEqual(MAX_CATCHUP_TICKS);
    expect(driver.ticksLastFrame).toBeGreaterThan(0);
  });

  it('clamps a single huge wall-clock delta via the hard clamp, bounding ticks to the cap', () => {
    const driver = createSimDriver(DEFAULT_CONFIG, SEED);
    const input = new ConstantInput(0, 0);

    driver.frame(0, input, false);
    driver.frame(10_000, input, false); // 10s "spike" (e.g. debugger pause)

    expect(driver.ticksLastFrame).toBe(MAX_CATCHUP_TICKS);
    expect(driver.tick).toBe(MAX_CATCHUP_TICKS);
    expect(driver.droppedAccumSec).toBeGreaterThan(9); // most of the 10s was discarded
  });

  it('noteVisible resets the wall-clock reference so a hidden-tab gap does not burst', () => {
    const inputX = new ConstantInput(0, 0);
    const driverX = createSimDriver(DEFAULT_CONFIG, SEED);
    driverX.frame(0, inputX, false);
    driverX.frame(DT_MS, inputX, false); // baseline: one normal frame -> 1 tick

    const inputY = new ConstantInput(0, 0);
    const driverY = createSimDriver(DEFAULT_CONFIG, SEED);
    driverY.frame(0, inputY, false);
    // Simulate the tab being hidden for a long time: no frame() calls happen
    // while hidden, then noteVisible is called on resume...
    driverY.noteVisible(1_000_000);
    // ...followed by a normal frame the same delta later than the resume point.
    driverY.frame(1_000_000 + DT_MS, inputY, false);

    expect(driverY.ticksLastFrame).toBe(driverX.ticksLastFrame);
    expect(driverY.tick).toBe(driverX.tick);
    expect(driverY.droppedAccumSec).toBe(0);
  });

  it('does not accumulate time or step while paused, and resumes cleanly', () => {
    const driver = createSimDriver(DEFAULT_CONFIG, SEED);
    const input = new ConstantInput(0, 0);

    driver.frame(0, input, false);
    driver.frame(5_000, input, true); // paused: huge wall-clock gap while paused
    expect(driver.tick).toBe(0);
    expect(driver.ticksLastFrame).toBe(0);
    expect(driver.droppedAccumSec).toBe(0);

    // Resuming with a normal small delta steps a normal number of ticks, not a burst.
    driver.frame(5_000 + DT_MS, input, false);
    expect(driver.ticksLastFrame).toBe(1);
    expect(driver.tick).toBe(1);
  });

  it('restart rebuilds the simulation and resets the clock/snapshots', () => {
    const driver = createSimDriver(DEFAULT_CONFIG, SEED);
    const input = new ConstantInput(1, 0);
    driver.frame(0, input, false);
    driver.frame(DT_MS * 3, input, false);
    expect(driver.tick).toBe(3);

    driver.restart(SEED + 1);
    expect(driver.tick).toBe(0);
    expect(driver.ticksLastFrame).toBe(0);
    expect(driver.droppedAccumSec).toBe(0);
    expect(driver.alpha).toBe(0);

    // The clock reference is reset too: the next frame's delta is measured from here.
    driver.frame(1_000_000, input, false);
    expect(driver.ticksLastFrame).toBe(0);
    driver.frame(1_000_000 + DT_MS, input, false);
    expect(driver.tick).toBe(1);
  });

  it('throws on reentrant frame() calls', () => {
    const driver = createSimDriver(DEFAULT_CONFIG, SEED);
    const reentrantInput: InputSource = {
      sample(tick: number, paused: boolean): TickInput {
        // Attempting to drive the same frame() reentrantly must be rejected.
        expect(() => driver.frame(999, reentrantInput, paused)).toThrow();
        return { moveX: 0, moveY: 0, paused: false };
      },
      clear(): void {},
      dispose(): void {},
    };
    driver.frame(0, reentrantInput, false);
    driver.frame(DT_MS, reentrantInput, false);
  });

  it('stops catch-up at a pending trait choice and preserves only pre-prompt accumulated time', () => {
    const constructions: Array<{ seed: number; initialTick: number }> = [];
    const traitRuntimeFactory = createUpgradeRuntimeFactory(constructions);
    const levelOnFirstTick: SimConfig = { ...DEFAULT_CONFIG, xpThresholds: [0] };
    const driver = createSimDriver(levelOnFirstTick, SEED, { traitRuntimeFactory });
    const input = new ConstantInput();

    driver.frame(0, input, false);
    driver.frame(DT_MS * 4, input, false);

    expect(driver.tick).toBe(1);
    expect(driver.ticksLastFrame).toBe(1);
    expect(driver.droppedAccumSec).toBe(0);
    expect(driver.alpha).toBe(0);
    expect(driver.upgradeSelectionPending).toBe(true);
    expect(driver.pendingUpgradeOffers).toEqual([{
      kind: 'trait', id: 'trait:fox-tail', traitId: 'fox-tail', resultStage: 'bud',
    }]);

    // Prompt dwell time is neither accumulated nor allowed to erase the
    // roughly-three-tick remainder retained from the interrupted catch-up.
    driver.frame(60_000, input, false);
    expect(driver.tick).toBe(1);
    expect(driver.ticksLastFrame).toBe(0);
    expect(driver.droppedAccumSec).toBe(0);

    expect(driver.selectUpgrade('trait:fox-tail')).toEqual({ tick: 1, kind: 'trait', id: 'trait:fox-tail' });
    expect(driver.upgradeSelectionPending).toBe(false);
    expect(driver.traitVisualState()).toEqual([
      {
        sourceId: 'fox-tail',
        stage: 'bud',
        sockets: ['tail'],
        visualKey: 'fox-tail-bud',
        enabled: true,
      },
    ]);

    driver.frame(60_000, input, false);
    expect(driver.tick).toBe(4);
    expect(driver.ticksLastFrame).toBe(3);
    expect(driver.droppedAccumSec).toBe(0);
    expect(constructions).toEqual([{ seed: SEED, initialTick: 0 }]);
  });

  it('preserves trait runtime options when restart rebuilds the simulation', () => {
    const constructions: Array<{ seed: number; initialTick: number }> = [];
    const traitRuntimeFactory = createUpgradeRuntimeFactory(constructions);
    const driver = createSimDriver(DEFAULT_CONFIG, SEED, { traitRuntimeFactory, traitOfferCount: 2 });

    driver.restart(SEED + 99);

    expect(constructions).toEqual([
      { seed: SEED, initialTick: 0 },
      { seed: SEED + 99, initialTick: 0 },
    ]);
    expect(driver.upgradeSelectionPending).toBe(false);
    expect(driver.pendingUpgradeOffers).toEqual([]);
    expect(driver.traitVisualState()).toEqual([]);
  });
});
