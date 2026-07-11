/**
 * FROZEN APP-LOCAL CONTRACTS — LEAD-OWNED.
 *
 * The web-toy swarm (Agents A/B/C) implements against these interfaces and MUST
 * NOT modify this file. It is the single boundary between:
 *   - the deterministic simulation (imported only through `@sim`),
 *   - the fixed-tick driver (Agent A),
 *   - the PlayCanvas renderer (Agent B),
 *   - input, autopilot, HUD, perf (Agent C),
 *   - and the integrator (lead).
 *
 * RULES ENCODED HERE (mirror the handoff's frozen integration rules):
 *   - The simulation is authoritative. Nothing on the render side writes
 *     positions, health, timers, RNG, or entity lifetimes.
 *   - Render/interpolation consume READ-ONLY snapshots owned by the app, never
 *     the simulation's live typed arrays across a tick boundary for mutation.
 *   - Views are keyed by generation-guarded EntityId, never by slot alone.
 *   - Exactly one canonical TickInput is produced per simulation tick.
 */
import type {
  EntityId,
  PlayerState,
  SimEvents,
  TickInput,
  TraitPresentationEventView,
  TraitVisualAttachmentView,
} from '@sim';
import type { CombatFeedbackSnapshot } from './presentation/combat-feedback';

export type { EntityId, PlayerState, SimEvents, TickInput };

// ---------------------------------------------------------------------------
// Input (Agent C) — every input source resolves to ONE TickInput per tick.
// ---------------------------------------------------------------------------

/**
 * Produces the canonical movement intent for the CURRENT tick. Keyboard, touch
 * joystick, and autopilot all implement this. `moveX`/`moveY` are each in
 * [-1, 1]; the simulation normalizes when the vector length exceeds 1. There is
 * no aiming. Implementations are pure with respect to the simulation: they read
 * device / autopilot state and return intent, never touching sim state.
 */
export interface InputSource {
  /**
   * @param tick   The simulation tick about to be stepped (autopilot is a pure
   *               function of this and nothing else — never wall-clock time).
   * @param paused Whether the shell is currently paused.
   */
  sample(tick: number, paused: boolean): TickInput;
  /** Clear any latched/active input (called on focus loss, pause, teardown). */
  clear(): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Render snapshots (Agent A owns production; Agent B consumes read-only) —
// app-owned previous/current transform snapshots for interpolation. These are
// COPIES; the renderer never reads live sim arrays for interpolation.
// ---------------------------------------------------------------------------

/** Category of a pooled primitive view. One shared flat material per category. */
export type ViewCategory = 'enemy' | 'projectile' | 'pickup';

/**
 * A flat, allocation-stable list of live entities of one category captured at a
 * tick boundary. Parallel arrays indexed 0..count-1. `id` is the generation-
 * guarded EntityId. `archetype`, `role`, `hp`, and `maxHp` are only meaningful
 * for enemies (all are 0 otherwise). Role values mirror the simulation's
 * fixed regular/elite/boss mapping: 0, 1, and 2 respectively.
 * Buffers are preallocated to capacity and reused every tick — never resized in
 * the steady-state loop.
 */
export interface CategorySnapshot {
  readonly category: ViewCategory;
  count: number;
  readonly id: Int32Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly radius: Float32Array;
  /** Current health copied for enemies; zero for projectiles and pickups. */
  readonly hp: Float32Array;
  /** Maximum health copied for enemies; zero for projectiles and pickups. */
  readonly maxHp: Float32Array;
  readonly archetype: Uint8Array;
  readonly role: Uint8Array;
}

/** One full render snapshot: player transform + per-category entity snapshots. */
export interface RenderSnapshot {
  tick: number;
  playerX: number;
  playerY: number;
  playerRadius: number;
  /** Live pickup collection radius, including any active Magnet ranks. */
  playerPickupRadius: number;
  playerHp: number;
  /** Current maximum health copied at the tick boundary for truthful HUDs. */
  playerMaxHp: number;
  /** Experience copied at the tick boundary; never read live by the renderer. */
  playerXp: number;
  /** Current player level copied at the tick boundary. */
  playerLevel: number;
  playerAlive: boolean;
  readonly enemies: CategorySnapshot;
  readonly projectiles: CategorySnapshot;
  readonly pickups: CategorySnapshot;
}

// ---------------------------------------------------------------------------
// Renderer adapter (Agent B implements, Agent A/lead call) — the ONLY surface
// through which simulation state reaches the GPU. All args are read-only.
// ---------------------------------------------------------------------------

export interface RendererStats {
  /** Draw calls for the last rendered frame, or -1 if unavailable on this device. */
  drawCalls: number;
  /** Live view instances currently mounted, summed across categories. */
  liveViews: number;
  /** High-water mark of mounted view instances. */
  highWaterViews: number;
  /** 1 while the WebGL context is lost, else 0. */
  contextLost: number;
}

export interface RendererAdapter {
  /**
   * Render one frame by reading interpolated transforms. `alpha` in [0,1] is the
   * fractional progress between `prev` and `curr` snapshots. Implementations MUST
   * treat both snapshots as read-only and MUST map views by generation-guarded
   * id, releasing/resetting a view whose id changed before a slot is reused.
   */
  render(
    prev: RenderSnapshot,
    curr: RenderSnapshot,
    alpha: number,
    traitVisualState: readonly TraitVisualAttachmentView[],
    combatFeedback: CombatFeedbackSnapshot,
    traitPresentationEvents: readonly TraitPresentationEventView[],
  ): void;
  /** Resize backing store to CSS size * min(devicePixelRatio, cap). */
  resize(): void;
  stats(): RendererStats;
  /** True once WebGL2 is up and the scene is ready to render. */
  readonly ready: boolean;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Diagnostics (Agent C) — perf monitor + HUD data model.
// ---------------------------------------------------------------------------

export interface HudStats {
  fps: number;
  frameTimeMs: number;
  frameP95Ms: number;
  frameP99Ms: number;
  /** Player-facing values copied from the app-owned current tick snapshot. */
  playerHp: number;
  playerMaxHp: number;
  playerXp: number;
  playerLevel: number;
  /** Next cumulative XP threshold; null only when a test configuration disables leveling. */
  playerNextXp: number | null;
  simTick: number;
  /** Ticks advanced on the last frame (catch-up count). */
  ticksLastFrame: number;
  /** Accumulated sim time discarded by the catch-up cap this frame (seconds). */
  droppedAccumSec: number;
  enemiesLive: number;
  enemiesHigh: number;
  projLive: number;
  projHigh: number;
  pickupsLive: number;
  pickupsHigh: number;
  drawCalls: number;
  stateHash: string;
  paused: boolean;
  autopilot: boolean;
}

export interface PerformanceMonitor {
  /** Call once per rendered frame with the measured frame time (ms). */
  frame(frameTimeMs: number): void;
  readonly fps: number;
  readonly frameTimeMs: number;
  /** Percentiles over the rolling window: [p50, p95, p99] frame time (ms). */
  percentiles(): [number, number, number];
  reset(): void;
}

export interface Hud {
  /** Push new stats; the HUD updates existing DOM text at a throttled rate. */
  update(stats: HudStats): void;
  dispose(): void;
}
