import type { Vec2 } from './keyboard';

export interface MouseSteering {
  vector(): Vec2;
  active(): boolean;
  clear(): void;
  dispose(): void;
}

export interface MouseSteeringOptions {
  /** Fixed drag radius in CSS pixels used to turn a mouse drag into a vector. */
  readonly maxRadius?: number;
}

const DEFAULT_MAX_RADIUS = 140;

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Mouse-only click-drag movement. Touch and pen pointers are intentionally
 * ignored because the virtual joystick owns those gestures. The source is
 * presentation/input state only; the driver samples its vector into the
 * canonical TickInput and replay record.
 */
export function createMouseSteering(surface: HTMLElement, options: MouseSteeringOptions = {}): MouseSteering {
  const maxRadius = options.maxRadius ?? DEFAULT_MAX_RADIUS;
  if (!Number.isFinite(maxRadius) || maxRadius <= 0) {
    throw new RangeError(`mouse steering maxRadius must be finite and positive, got ${maxRadius}`);
  }
  let pointerId: number | null = null;
  let originX = 0;
  let originY = 0;
  let vectorX = 0;
  let vectorY = 0;

  function reset(): void {
    pointerId = null;
    vectorX = 0;
    vectorY = 0;
  }

  function onPointerDown(event: Event): void {
    const pointer = event as PointerEvent;
    if (pointer.pointerType !== 'mouse' || pointerId !== null) return;
    pointerId = pointer.pointerId;
    originX = finite(pointer.clientX);
    originY = finite(pointer.clientY);
    vectorX = 0;
    vectorY = 0;
  }

  function onPointerMove(event: Event): void {
    const pointer = event as PointerEvent;
    if (pointerId === null || pointer.pointerId !== pointerId || pointer.pointerType !== 'mouse') return;
    const dx = finite(pointer.clientX) - originX;
    const screenDeltaY = finite(pointer.clientY) - originY;
    const dy = screenDeltaY === 0 ? 0 : -screenDeltaY;
    const magnitude = Math.sqrt(dx * dx + dy * dy);
    if (magnitude === 0) {
      vectorX = 0;
      vectorY = 0;
      return;
    }
    const clamped = Math.min(magnitude, maxRadius) / maxRadius;
    vectorX = (dx / magnitude) * clamped;
    vectorY = (dy / magnitude) * clamped;
  }

  function onPointerUp(event: Event): void {
    const pointer = event as PointerEvent;
    if (pointerId === null || pointer.pointerId !== pointerId || pointer.pointerType !== 'mouse') return;
    reset();
  }

  surface.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('blur', reset);

  return {
    vector(): Vec2 {
      return { x: vectorX, y: vectorY };
    },
    active(): boolean {
      return pointerId !== null;
    },
    clear(): void {
      reset();
    },
    dispose(): void {
      surface.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('blur', reset);
      reset();
    },
  };
}
