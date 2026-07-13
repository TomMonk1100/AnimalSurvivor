import type { InputMode, InputSource, TickInput } from '../contracts';
import { createGamepadTracker, type GamepadProvider } from './gamepad';
import { createKeyboardTracker, type KeyboardBindings } from './keyboard';
import { createMouseSteering } from './mouse-steering';
import { createVirtualJoystick } from './virtual-joystick';

/**
 * The single canonical `InputSource` for interactive play: merges keyboard,
 * gamepad, and virtual-joystick sub-sources into exactly one `TickInput` per
 * `sample()` call.
 *
 * Precedence: while the joystick is actively being dragged, its vector wins
 * outright; otherwise active mouse steering wins, then gamepad input, then
 * keyboard input.
 * See the sub-source files for the shared up=+Y / right=+X axis convention.
 *
 * Scroll/zoom/gesture suppression is scoped to `opts.surface` only (never
 * attached globally) -- the surface also carries `touch-action: none` in
 * CSS; this listener is a defense-in-depth backstop for gesture types CSS
 * alone doesn't cover (e.g. wheel, Safari `gesturestart`).
 */

export interface InputControllerOptions {
  /** The single game input surface (`#game-surface`). */
  surface: HTMLElement;
  /** The touch joystick zone (`#joystick`), inside or adjacent to `surface`. */
  joystickZone: HTMLElement;
  /** Where keyboard listeners attach; defaults to `window`. Injectable for tests. */
  keyTarget?: Window | HTMLElement;
  /** Injectable gamepad polling source; defaults to browser navigator polling. */
  gamepadProvider?: GamepadProvider;
  /** Versioned presentation preference; arrows remain an always-available fallback. */
  keyboardBindings?: KeyboardBindings;
}

export function createInputController(opts: InputControllerOptions): InputSource {
  const surface = opts.surface;
  const keyboard = createKeyboardTracker(opts.keyTarget ?? window, { bindings: opts.keyboardBindings });
  const gamepad = opts.gamepadProvider === undefined
    ? createGamepadTracker()
    : createGamepadTracker({ provider: opts.gamepadProvider });
  const joystick = createVirtualJoystick(opts.joystickZone);
  const mouse = createMouseSteering(surface);
  let lastInputMode: InputMode = 'keyboard';

  const preventGesture = (e: Event): void => {
    e.preventDefault();
  };

  surface.addEventListener('touchmove', preventGesture, { passive: false });
  surface.addEventListener('wheel', preventGesture, { passive: false });
  surface.addEventListener('gesturestart', preventGesture);

  return {
    sample(_tick: number, paused: boolean): TickInput {
      const gamepadVector = gamepad.vector();
      const keyboardVector = keyboard.vector();
      if (joystick.active()) {
        lastInputMode = 'touch';
      } else if (mouse.active()) {
        lastInputMode = 'mouse';
      } else if (gamepadVector.x !== 0 || gamepadVector.y !== 0) {
        lastInputMode = 'gamepad';
      } else if (keyboardVector.x !== 0 || keyboardVector.y !== 0) {
        lastInputMode = 'keyboard';
      }
      const vec = joystick.active()
        ? joystick.vector()
        : mouse.active()
          ? mouse.vector()
          : gamepadVector.x !== 0 || gamepadVector.y !== 0
            ? gamepadVector
          : keyboardVector;
      const magnitude = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
      const scale = magnitude > 1 ? 1 / magnitude : 1;
      return { moveX: vec.x * scale, moveY: vec.y * scale, paused };
    },
    inputMode(): InputMode {
      return lastInputMode;
    },
    clear(): void {
      keyboard.clear();
      mouse.clear();
      gamepad.clear();
      joystick.clear();
    },
    dispose(): void {
      keyboard.dispose();
      mouse.dispose();
      gamepad.dispose();
      joystick.dispose();
      surface.removeEventListener('touchmove', preventGesture);
      surface.removeEventListener('wheel', preventGesture);
      surface.removeEventListener('gesturestart', preventGesture);
    },
  };
}
