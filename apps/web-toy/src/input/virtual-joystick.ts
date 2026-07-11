import type { Vec2 } from './keyboard';

/**
 * Virtual joystick bound to a DOM zone element, driven by Pointer Events.
 *
 * AXIS CONVENTION (must match `keyboard.ts`): "up" is +Y, "right" is +X. On
 * screen, client coordinates increase downward, so an upward drag
 * (decreasing `clientY` relative to the press origin) must map to a
 * POSITIVE Y component -- the Y delta is inverted relative to raw screen
 * coordinates. Rightward drag (increasing `clientX`) maps directly to a
 * positive X component.
 *
 * Behavior:
 *  - `pointerdown` inside the zone captures the pointer (best-effort; guarded
 *    for environments like jsdom that lack `setPointerCapture`), records the
 *    press position as the origin, and becomes active.
 *  - `pointermove` computes displacement from the origin, clamps it to
 *    `maxRadius`, and normalizes so the overall vector magnitude is <= 1
 *    (per-axis components stay in [-1, 1] as a consequence).
 *  - `pointerup` / `pointercancel` / `lostpointercapture` reset to zero and
 *    release. `pointermove`/`pointerup`/`pointercancel` are ALSO listened on
 *    `window` as a fallback so a release outside the zone (or in
 *    environments where capture doesn't reliably redirect events) never
 *    leaves movement stuck.
 *  - `refresh()` recomputes the zone's radius from `getBoundingClientRect()`
 *    on demand (e.g. after a resize); the radius is also recomputed at the
 *    start of every new gesture.
 */

const DEFAULT_MAX_RADIUS = 60;

export interface VirtualJoystick {
  vector(): Vec2;
  active(): boolean;
  /** Recompute the zone's radius from its current layout rect. */
  refresh(): void;
  /** Force-release and zero out (called on focus loss / pause / teardown). */
  clear(): void;
  dispose(): void;
}

export interface VirtualJoystickOptions {
  /** Fixed max drag radius in px. If omitted, derived from the zone's rect. */
  maxRadius?: number;
}

export function createVirtualJoystick(zone: HTMLElement, opts: VirtualJoystickOptions = {}): VirtualJoystick {
  let maxRadius = opts.maxRadius ?? DEFAULT_MAX_RADIUS;
  let originX = 0;
  let originY = 0;
  let vecX = 0;
  let vecY = 0;
  let pointerId: number | null = null;

  function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
  }

  /** Decorative feedback only: it never participates in TickInput math. */
  function showThumb(screenOffsetX: number, screenOffsetY: number): void {
    const rect = zone.getBoundingClientRect();
    const originLocalX = clamp(originX - rect.left, 0, rect.width);
    const originLocalY = clamp(originY - rect.top, 0, rect.height);
    const thumbX = clamp(originLocalX + screenOffsetX, 0, rect.width);
    const thumbY = clamp(originLocalY + screenOffsetY, 0, rect.height);
    zone.style.setProperty('--joystick-thumb-x', `${thumbX}px`);
    zone.style.setProperty('--joystick-thumb-y', `${thumbY}px`);
    zone.dataset.active = 'true';
  }

  function hideThumb(): void {
    zone.dataset.active = 'false';
    zone.style.removeProperty('--joystick-thumb-x');
    zone.style.removeProperty('--joystick-thumb-y');
  }

  function computeRadius(): number {
    if (opts.maxRadius !== undefined) return opts.maxRadius;
    const rect = zone.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    return size > 0 ? size / 2 : DEFAULT_MAX_RADIUS;
  }

  function releaseCapture(id: number): void {
    if (typeof zone.releasePointerCapture === 'function') {
      try {
        zone.releasePointerCapture(id);
      } catch {
        // Unsupported / not currently captured in this environment: ignore.
      }
    }
  }

  function resetState(): void {
    if (pointerId !== null) releaseCapture(pointerId);
    pointerId = null;
    vecX = 0;
    vecY = 0;
    hideThumb();
  }

  function onPointerDown(e: PointerEvent): void {
    if (pointerId !== null) return; // already tracking a gesture
    pointerId = e.pointerId;
    originX = e.clientX;
    originY = e.clientY;
    maxRadius = computeRadius();
    vecX = 0;
    vecY = 0;
    showThumb(0, 0);
    if (typeof zone.setPointerCapture === 'function') {
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {
        // Unsupported in this environment (e.g. jsdom): ignore, fall back to
        // the window-level listeners below.
      }
    }
  }

  function updateFromPointer(e: PointerEvent): void {
    if (pointerId === null || e.pointerId !== pointerId) return;
    const dx = e.clientX - originX;
    const dyScreen = e.clientY - originY;
    const dy = -dyScreen; // invert: screen-down (+) is world-down (-Y).
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag === 0) {
      vecX = 0;
      vecY = 0;
      showThumb(0, 0);
      return;
    }
    const clampedMag = Math.min(mag, maxRadius);
    const ratio = maxRadius > 0 ? clampedMag / maxRadius : 0;
    vecX = (dx / mag) * ratio;
    vecY = (dy / mag) * ratio;
    showThumb((dx / mag) * clampedMag, (dyScreen / mag) * clampedMag);
  }

  function onPointerMove(e: PointerEvent): void {
    updateFromPointer(e);
  }

  function onPointerUp(e: PointerEvent): void {
    if (pointerId === null || e.pointerId !== pointerId) return;
    resetState();
  }

  function onPointerCancel(e: PointerEvent): void {
    if (pointerId === null || e.pointerId !== pointerId) return;
    resetState();
  }

  function onLostCapture(e: PointerEvent): void {
    if (pointerId === null || e.pointerId !== pointerId) return;
    resetState();
  }

  function onWindowBlur(): void {
    resetState();
  }

  zone.addEventListener('pointerdown', onPointerDown as EventListener);
  zone.addEventListener('lostpointercapture', onLostCapture as EventListener);
  // Fallback listeners on window: a release outside the zone (or an
  // environment where pointer capture doesn't redirect events) must still
  // clear the gesture instead of leaving movement stuck.
  window.addEventListener('pointermove', onPointerMove as EventListener);
  window.addEventListener('pointerup', onPointerUp as EventListener);
  window.addEventListener('pointercancel', onPointerCancel as EventListener);
  window.addEventListener('blur', onWindowBlur);
  hideThumb();

  return {
    vector(): Vec2 {
      return { x: vecX, y: vecY };
    },
    active(): boolean {
      return pointerId !== null;
    },
    refresh(): void {
      maxRadius = computeRadius();
    },
    clear(): void {
      resetState();
    },
    dispose(): void {
      zone.removeEventListener('pointerdown', onPointerDown as EventListener);
      zone.removeEventListener('lostpointercapture', onLostCapture as EventListener);
      window.removeEventListener('pointermove', onPointerMove as EventListener);
      window.removeEventListener('pointerup', onPointerUp as EventListener);
      window.removeEventListener('pointercancel', onPointerCancel as EventListener);
      window.removeEventListener('blur', onWindowBlur);
      resetState();
    },
  };
}
