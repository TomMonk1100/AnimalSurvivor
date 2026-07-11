/**
 * Keyboard movement tracker.
 *
 * AXIS CONVENTION (must match `virtual-joystick.ts`): "up" is +Y, "down" is
 * -Y, "right" is +X, "left" is -X. This is the world-space convention the
 * whole input layer agrees on; the renderer/camera is responsible for
 * mapping it to whatever "up" looks like visually.
 *
 * WASD and Arrow keys map to the SAME logical directions:
 *   W / ArrowUp    -> up    (y += 1)
 *   S / ArrowDown  -> down  (y -= 1)
 *   A / ArrowLeft  -> left  (x -= 1)
 *   D / ArrowRight -> right (x += 1)
 *
 * Held keys are tracked individually (by raw `KeyboardEvent.key`), not just
 * by resolved direction, so releasing one of two keys mapped to the same
 * direction (e.g. releasing 'w' while ArrowUp is still held) correctly keeps
 * that direction active. Opposite directions cancel to 0.
 *
 * The returned vector is the RAW axis sum BEFORE normalization: each
 * component is exactly one of {-1, 0, 1}. A diagonal therefore yields
 * {±1, ±1} (magnitude ~1.41); the simulation normalizes any vector whose
 * length exceeds 1, so this is intentional and correct here.
 */

export interface Vec2 {
  x: number;
  y: number;
}

type Direction = 'up' | 'down' | 'left' | 'right';

export interface KeyboardTracker {
  vector(): Vec2;
  /** Clear all held keys (called directly, or on focus loss). */
  clear(): void;
  dispose(): void;
}

function classify(key: string): Direction | null {
  switch (key) {
    case 'w':
    case 'W':
    case 'ArrowUp':
      return 'up';
    case 's':
    case 'S':
    case 'ArrowDown':
      return 'down';
    case 'a':
    case 'A':
    case 'ArrowLeft':
      return 'left';
    case 'd':
    case 'D':
    case 'ArrowRight':
      return 'right';
    default:
      return null;
  }
}

/**
 * @param target Where `keydown`/`keyup` listeners attach. Defaults to
 *               `window`; injectable so tests can scope events to an
 *               isolated element instead of the shared global `window`.
 *               Focus-loss handling (`blur` / `visibilitychange`) always
 *               listens at the window/document level regardless of
 *               `target`, since losing tab focus is a global concept.
 */
export function createKeyboardTracker(target: EventTarget = window): KeyboardTracker {
  const held = new Set<string>();

  function clear(): void {
    held.clear();
  }

  function vector(): Vec2 {
    let up = false;
    let down = false;
    let left = false;
    let right = false;
    for (const key of held) {
      const dir = classify(key);
      if (dir === 'up') up = true;
      else if (dir === 'down') down = true;
      else if (dir === 'left') left = true;
      else if (dir === 'right') right = true;
    }
    let x = 0;
    let y = 0;
    if (up) y += 1;
    if (down) y -= 1;
    if (left) x -= 1;
    if (right) x += 1;
    return { x, y };
  }

  function onKeyDown(e: Event): void {
    const key = (e as KeyboardEvent).key;
    if (classify(key) !== null) held.add(key);
  }

  function onKeyUp(e: Event): void {
    const key = (e as KeyboardEvent).key;
    held.delete(key);
  }

  function onBlur(): void {
    clear();
  }

  function onVisibilityChange(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      clear();
    }
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  return {
    vector,
    clear,
    dispose(): void {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      clear();
    },
  };
}
