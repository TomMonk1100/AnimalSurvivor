import type { Vec2 } from './keyboard';

export interface GamepadButtonLike {
  readonly pressed?: boolean;
  readonly value?: number;
}

export interface GamepadLike {
  readonly connected?: boolean;
  readonly axes?: readonly number[];
  readonly buttons?: readonly GamepadButtonLike[];
}

export type GamepadProvider = () => readonly (GamepadLike | null)[];

export interface GamepadTrackerOptions {
  /** Injectable for tests; the browser default polls navigator.getGamepads(). */
  readonly provider?: GamepadProvider;
  /** Analog values below this magnitude are treated as stick drift. */
  readonly deadzone?: number;
}

export interface GamepadTracker {
  /** Polls the current hardware state once and returns a raw movement vector. */
  vector(): Vec2;
  clear(): void;
  dispose(): void;
}

const DEFAULT_DEADZONE = 0.18;
const BUTTON_UP = 12;
const BUTTON_DOWN = 13;
const BUTTON_LEFT = 14;
const BUTTON_RIGHT = 15;

function browserProvider(): readonly (GamepadLike | null)[] {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return [];
  try {
    return navigator.getGamepads() as readonly (GamepadLike | null)[];
  } catch {
    return [];
  }
}

function finiteAxis(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function buttonPressed(button: GamepadButtonLike | undefined): boolean {
  return button?.pressed === true || (typeof button?.value === 'number' && button.value >= 0.5);
}

function applyDeadzone(value: number, deadzone: number): number {
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  const usableRange = 1 - deadzone;
  return usableRange <= 0 ? Math.sign(value) : Math.sign(value) * Math.min(1, (magnitude - deadzone) / usableRange);
}

function readPad(pad: GamepadLike, deadzone: number): Vec2 {
  const axes = pad.axes ?? [];
  const stickX = applyDeadzone(finiteAxis(axes[0]), deadzone);
  const yValue = applyDeadzone(finiteAxis(axes[1]), deadzone);
  const stickY = yValue === 0 ? 0 : -yValue;
  if (stickX !== 0 || stickY !== 0) return { x: stickX, y: stickY };

  const buttons = pad.buttons ?? [];
  let x = 0;
  let y = 0;
  if (buttonPressed(buttons[BUTTON_LEFT])) x -= 1;
  if (buttonPressed(buttons[BUTTON_RIGHT])) x += 1;
  if (buttonPressed(buttons[BUTTON_UP])) y += 1;
  if (buttonPressed(buttons[BUTTON_DOWN])) y -= 1;
  return { x, y };
}

function hasInput(vector: Vec2): boolean {
  return vector.x !== 0 || vector.y !== 0;
}

/**
 * A presentation/input adapter only: it polls hardware and returns movement.
 * It never advances time, mutates simulation state, or owns replay decisions.
 * Gamepads are considered in browser-provided order, so the first connected
 * pad with directional input wins consistently when several are attached.
 */
export function createGamepadTracker(options: GamepadTrackerOptions = {}): GamepadTracker {
  const provider = options.provider ?? browserProvider;
  const deadzone = options.deadzone ?? DEFAULT_DEADZONE;
  if (!Number.isFinite(deadzone) || deadzone < 0 || deadzone >= 1) {
    throw new RangeError(`gamepad deadzone must be finite in [0, 1), got ${deadzone}`);
  }

  return {
    vector(): Vec2 {
      let pads: readonly (GamepadLike | null)[];
      try {
        const provided = provider();
        pads = Array.isArray(provided) ? provided : [];
      } catch {
        pads = [];
      }
      for (const pad of pads) {
        if (pad === null || pad.connected === false) continue;
        const vector = readPad(pad, deadzone);
        if (hasInput(vector)) return vector;
      }
      return { x: 0, y: 0 };
    },
    clear(): void {
      // Gamepad state is polled, so there is no latched state to clear.
    },
    dispose(): void {
      // No listeners or browser resources are owned by this tracker.
    },
  };
}
