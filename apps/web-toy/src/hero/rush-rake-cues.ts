/** Renderer-only description of one of Rush Rake's three expanding waves. */
export interface RushRakeWaveCommand {
  /** Wave start relative to the command's issue tick. */
  readonly delayTicks: number;
  /** Number of ticks for which the arc is visible. */
  readonly durationTicks: number;
  readonly startRadius: number;
  readonly endRadius: number;
  /** Half of the arc's angular width, in radians. */
  readonly halfAngleRadians: number;
}

export type RushRakeThreeWaves = readonly [
  RushRakeWaveCommand,
  RushRakeWaveCommand,
  RushRakeWaveCommand,
];

export interface RushRakeCueInput {
  readonly tick: number;
  readonly issuedTick: number;
  readonly x: number;
  readonly y: number;
  readonly headingRadians: number;
  readonly waves: RushRakeThreeWaves;
}

/**
 * Parametric arc data, deliberately not tessellated geometry. A renderer can
 * turn this into a decal, mesh, or particle ribbon without feeding anything
 * back into simulation state.
 */
export interface RushRakeArcCue {
  readonly waveIndex: 0 | 1 | 2;
  readonly startTick: number;
  readonly expiresTick: number;
  readonly x: number;
  readonly y: number;
  readonly headingRadians: number;
  readonly radius: number;
  readonly halfAngleRadians: number;
  /** Normalized visual lifetime in [0, 1). */
  readonly progress: number;
  /** Convenient linear fade suggestion; renderers may style it differently. */
  readonly opacity: number;
}

export interface RushRakeCueSnapshot {
  readonly tick: number;
  /** Active cues only, always in authored wave order. At most three entries. */
  readonly arcs: readonly RushRakeArcCue[];
}

const EMPTY_ARCS: readonly RushRakeArcCue[] = Object.freeze([]);

function requireFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
}

function validate(input: RushRakeCueInput): void {
  if (!Number.isSafeInteger(input.tick) || input.tick < 0) {
    throw new RangeError('tick must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(input.issuedTick) || input.issuedTick < 0) {
    throw new RangeError('issuedTick must be a non-negative safe integer');
  }
  requireFinite('x', input.x);
  requireFinite('y', input.y);
  requireFinite('headingRadians', input.headingRadians);

  let previousDelay = -1;
  for (let index = 0; index < 3; index++) {
    const wave = input.waves[index]!;
    if (!Number.isSafeInteger(wave.delayTicks) || wave.delayTicks < 0 || wave.delayTicks < previousDelay) {
      throw new RangeError('wave delayTicks must be non-negative safe integers in authored order');
    }
    if (!Number.isSafeInteger(wave.durationTicks) || wave.durationTicks < 1) {
      throw new RangeError('wave durationTicks must be positive safe integers');
    }
    requireFinite('wave startRadius', wave.startRadius);
    requireFinite('wave endRadius', wave.endRadius);
    requireFinite('wave halfAngleRadians', wave.halfAngleRadians);
    if (wave.startRadius < 0 || wave.endRadius < wave.startRadius) {
      throw new RangeError('wave radii must be non-negative and non-decreasing');
    }
    if (wave.halfAngleRadians <= 0 || wave.halfAngleRadians > Math.PI) {
      throw new RangeError('wave halfAngleRadians must be in (0, PI]');
    }
    previousDelay = wave.delayTicks;
  }
}

/**
 * Pure command-to-render projection. It reads no wall clock or global state.
 * The compact immutable result holds at most three objects and no point arrays.
 */
export function projectRushRakeCues(input: RushRakeCueInput): RushRakeCueSnapshot {
  validate(input);
  let arcs: RushRakeArcCue[] | null = null;

  for (let index = 0; index < 3; index++) {
    const wave = input.waves[index]!;
    const startTick = input.issuedTick + wave.delayTicks;
    const expiresTick = startTick + wave.durationTicks;
    if (input.tick < startTick || input.tick >= expiresTick) continue;

    const progress = (input.tick - startTick) / wave.durationTicks;
    const radius = wave.startRadius + (wave.endRadius - wave.startRadius) * progress;
    const cue: RushRakeArcCue = Object.freeze({
      waveIndex: index as 0 | 1 | 2,
      startTick,
      expiresTick,
      x: input.x,
      y: input.y,
      headingRadians: input.headingRadians,
      radius,
      halfAngleRadians: wave.halfAngleRadians,
      progress,
      opacity: 1 - progress,
    });
    (arcs ??= []).push(cue);
  }

  return Object.freeze({
    tick: input.tick,
    arcs: arcs === null ? EMPTY_ARCS : Object.freeze(arcs),
  });
}
