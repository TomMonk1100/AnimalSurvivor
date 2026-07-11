import type { InputSource, TickInput } from '../contracts';
import { createKeyboardTracker } from './keyboard';
import { createVirtualJoystick } from './virtual-joystick';

/**
 * The single canonical `InputSource` for interactive play: merges keyboard
 * and virtual-joystick sub-sources into exactly one `TickInput` per
 * `sample()` call.
 *
 * Precedence: while the joystick is actively being dragged, its vector wins
 * outright; otherwise the keyboard vector is used. See `keyboard.ts` /
 * `virtual-joystick.ts` for the shared up=+Y / right=+X axis convention both
 * sub-sources agree on.
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
}

export function createInputController(opts: InputControllerOptions): InputSource {
  const keyboard = createKeyboardTracker(opts.keyTarget ?? window);
  const joystick = createVirtualJoystick(opts.joystickZone);
  const surface = opts.surface;

  const preventGesture = (e: Event): void => {
    e.preventDefault();
  };

  surface.addEventListener('touchmove', preventGesture, { passive: false });
  surface.addEventListener('wheel', preventGesture, { passive: false });
  surface.addEventListener('gesturestart', preventGesture);

  return {
    sample(_tick: number, paused: boolean): TickInput {
      const vec = joystick.active() ? joystick.vector() : keyboard.vector();
      const magnitude = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
      const scale = magnitude > 1 ? 1 / magnitude : 1;
      return { moveX: vec.x * scale, moveY: vec.y * scale, paused };
    },
    clear(): void {
      keyboard.clear();
      joystick.clear();
    },
    dispose(): void {
      keyboard.dispose();
      joystick.dispose();
      surface.removeEventListener('touchmove', preventGesture);
      surface.removeEventListener('wheel', preventGesture);
      surface.removeEventListener('gesturestart', preventGesture);
    },
  };
}
