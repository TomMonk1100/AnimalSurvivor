import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createKeyboardTracker } from '../src/input/keyboard';
import { createVirtualJoystick } from '../src/input/virtual-joystick';
import { createInputController } from '../src/input/input-controller';

function dispatchKey(target: EventTarget, type: 'keydown' | 'keyup', key: string): void {
  target.dispatchEvent(new KeyboardEvent(type, { key }));
}

// jsdom (as of v25) does not implement the `PointerEvent` constructor, so
// pointer gestures are simulated with a `MouseEvent` carrying a
// hand-attached `pointerId` property; the input layer only reads
// `clientX`/`clientY`/`pointerId` off the event, so this is a faithful
// stand-in in tests while real browsers dispatch genuine `PointerEvent`s.
function pointerEvent(type: string, opts: { clientX: number; clientY: number; pointerId?: number }): PointerEvent {
  const evt = new MouseEvent(type, {
    clientX: opts.clientX,
    clientY: opts.clientY,
    bubbles: true,
  }) as unknown as PointerEvent;
  Object.defineProperty(evt, 'pointerId', { value: opts.pointerId ?? 1, configurable: true });
  return evt;
}

describe('keyboard tracker', () => {
  let target: HTMLDivElement;

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
  });

  afterEach(() => {
    target.remove();
  });

  it('WASD and Arrow keys produce identical vectors', () => {
    const wasd = createKeyboardTracker(target);
    dispatchKey(target, 'keydown', 'w');
    dispatchKey(target, 'keydown', 'd');
    const wasdVec = wasd.vector();
    wasd.dispose();

    const target2 = document.createElement('div');
    document.body.appendChild(target2);
    const arrows = createKeyboardTracker(target2);
    dispatchKey(target2, 'keydown', 'ArrowUp');
    dispatchKey(target2, 'keydown', 'ArrowRight');
    const arrowVec = arrows.vector();
    arrows.dispose();
    target2.remove();

    expect(wasdVec).toEqual({ x: 1, y: 1 });
    expect(arrowVec).toEqual({ x: 1, y: 1 });
  });

  it('opposite keys cancel to zero', () => {
    const kb = createKeyboardTracker(target);
    dispatchKey(target, 'keydown', 'ArrowLeft');
    dispatchKey(target, 'keydown', 'ArrowRight');
    expect(kb.vector()).toEqual({ x: 0, y: 0 });
    dispatchKey(target, 'keydown', 'w');
    dispatchKey(target, 'keydown', 's');
    expect(kb.vector()).toEqual({ x: 0, y: 0 });
    kb.dispose();
  });

  it('a diagonal yields each raw component as ±1', () => {
    const kb = createKeyboardTracker(target);
    dispatchKey(target, 'keydown', 'a');
    dispatchKey(target, 'keydown', 's');
    expect(kb.vector()).toEqual({ x: -1, y: -1 });
    kb.dispose();
  });

  it('keeps a direction active if another key mapped to it is still held', () => {
    const kb = createKeyboardTracker(target);
    dispatchKey(target, 'keydown', 'w');
    dispatchKey(target, 'keydown', 'ArrowUp');
    dispatchKey(target, 'keyup', 'w');
    expect(kb.vector()).toEqual({ x: 0, y: 1 });
    dispatchKey(target, 'keyup', 'ArrowUp');
    expect(kb.vector()).toEqual({ x: 0, y: 0 });
    kb.dispose();
  });

  it('clears held keys on window blur (focus loss)', () => {
    const kb = createKeyboardTracker(target);
    dispatchKey(target, 'keydown', 'w');
    dispatchKey(target, 'keydown', 'd');
    expect(kb.vector()).toEqual({ x: 1, y: 1 });
    window.dispatchEvent(new Event('blur'));
    expect(kb.vector()).toEqual({ x: 0, y: 0 });
    kb.dispose();
  });

  it('clear() zeroes the vector directly', () => {
    const kb = createKeyboardTracker(target);
    dispatchKey(target, 'keydown', 's');
    kb.clear();
    expect(kb.vector()).toEqual({ x: 0, y: 0 });
    kb.dispose();
  });
});

describe('virtual joystick', () => {
  let zone: HTMLDivElement;

  beforeEach(() => {
    zone = document.createElement('div');
    document.body.appendChild(zone);
  });

  afterEach(() => {
    zone.remove();
  });

  it('is inactive with a zero vector before any gesture', () => {
    const joystick = createVirtualJoystick(zone);
    expect(joystick.active()).toBe(false);
    expect(joystick.vector()).toEqual({ x: 0, y: 0 });
    joystick.dispose();
  });

  it('produces a vector with magnitude <= 1 while dragging', () => {
    const joystick = createVirtualJoystick(zone);
    zone.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
    expect(joystick.active()).toBe(true);
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 400, clientY: 400 }));
    const v = joystick.vector();
    const mag = Math.sqrt(v.x * v.x + v.y * v.y);
    expect(mag).toBeLessThanOrEqual(1 + 1e-9);
    joystick.dispose();
  });

  it('updates a decorative floating-thumb position without changing input math', () => {
    Object.defineProperty(zone, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 10, top: 20, right: 210, bottom: 220, width: 200, height: 200,
      }),
    });
    const joystick = createVirtualJoystick(zone);

    zone.dispatchEvent(pointerEvent('pointerdown', { clientX: 60, clientY: 70 }));
    expect(zone.dataset.active).toBe('true');
    expect(zone.style.getPropertyValue('--joystick-thumb-x')).toBe('50px');
    expect(zone.style.getPropertyValue('--joystick-thumb-y')).toBe('50px');

    window.dispatchEvent(pointerEvent('pointermove', { clientX: 90, clientY: 50 }));
    expect(zone.style.getPropertyValue('--joystick-thumb-x')).toBe('80px');
    expect(zone.style.getPropertyValue('--joystick-thumb-y')).toBe('30px');
    expect(joystick.vector().x).toBeCloseTo(0.3);
    expect(joystick.vector().y).toBeCloseTo(0.2);

    window.dispatchEvent(pointerEvent('pointerup', { clientX: 90, clientY: 50 }));
    expect(zone.dataset.active).toBe('false');
    expect(zone.style.getPropertyValue('--joystick-thumb-x')).toBe('');
    expect(zone.style.getPropertyValue('--joystick-thumb-y')).toBe('');
    joystick.dispose();
  });

  it('maps an upward drag (decreasing clientY) to a positive Y component', () => {
    const joystick = createVirtualJoystick(zone);
    zone.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 100, clientY: 40 }));
    const v = joystick.vector();
    expect(v.y).toBeGreaterThan(0);
    expect(v.x).toBeCloseTo(0);
    joystick.dispose();
  });

  it('resets to zero on pointercancel', () => {
    const joystick = createVirtualJoystick(zone);
    zone.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 150, clientY: 80 }));
    expect(joystick.active()).toBe(true);
    window.dispatchEvent(pointerEvent('pointercancel', { clientX: 150, clientY: 80 }));
    expect(joystick.active()).toBe(false);
    expect(joystick.vector()).toEqual({ x: 0, y: 0 });
    joystick.dispose();
  });

  it('resets to zero when pointerup happens outside the zone (window fallback)', () => {
    const joystick = createVirtualJoystick(zone);
    zone.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 150, clientY: 80 }));
    window.dispatchEvent(pointerEvent('pointerup', { clientX: 9999, clientY: 9999 }));
    expect(joystick.active()).toBe(false);
    expect(joystick.vector()).toEqual({ x: 0, y: 0 });
    joystick.dispose();
  });

  it('resets to zero on window blur', () => {
    const joystick = createVirtualJoystick(zone);
    zone.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 150, clientY: 80 }));
    window.dispatchEvent(new Event('blur'));
    expect(joystick.active()).toBe(false);
    expect(joystick.vector()).toEqual({ x: 0, y: 0 });
    joystick.dispose();
  });

  it('clear() force-releases an active gesture', () => {
    const joystick = createVirtualJoystick(zone);
    zone.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 150, clientY: 80 }));
    joystick.clear();
    expect(joystick.active()).toBe(false);
    expect(joystick.vector()).toEqual({ x: 0, y: 0 });
    joystick.dispose();
  });
});

describe('input controller', () => {
  let surface: HTMLDivElement;
  let joystickZone: HTMLDivElement;
  let keyTarget: HTMLDivElement;

  beforeEach(() => {
    surface = document.createElement('div');
    joystickZone = document.createElement('div');
    keyTarget = document.createElement('div');
    surface.appendChild(joystickZone);
    document.body.appendChild(surface);
    document.body.appendChild(keyTarget);
  });

  afterEach(() => {
    surface.remove();
    keyTarget.remove();
  });

  it('uses the keyboard vector when the joystick is inactive', () => {
    const controller = createInputController({ surface, joystickZone, keyTarget });
    dispatchKey(keyTarget, 'keydown', 'd');
    const result = controller.sample(0, false);
    expect(result).toEqual({ moveX: 1, moveY: 0, paused: false });
    controller.dispose();
  });

  it('normalizes a keyboard diagonal before producing canonical TickInput', () => {
    const controller = createInputController({ surface, joystickZone, keyTarget });
    dispatchKey(keyTarget, 'keydown', 'w');
    dispatchKey(keyTarget, 'keydown', 'd');
    const result = controller.sample(0, false);
    expect(Math.sqrt(result.moveX ** 2 + result.moveY ** 2)).toBeCloseTo(1);
    expect(result.moveX).toBeCloseTo(Math.SQRT1_2);
    expect(result.moveY).toBeCloseTo(Math.SQRT1_2);
    controller.dispose();
  });

  it('prefers the joystick vector over keyboard once the joystick is active', () => {
    const controller = createInputController({ surface, joystickZone, keyTarget });
    dispatchKey(keyTarget, 'keydown', 'd');
    joystickZone.dispatchEvent(pointerEvent('pointerdown', { clientX: 50, clientY: 50 }));
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 50, clientY: 10 }));
    const result = controller.sample(1, false);
    expect(result.moveX).toBeCloseTo(0);
    expect(result.moveY).toBeGreaterThan(0);
    controller.dispose();
  });

  it('clear() zeroes output from both sub-sources', () => {
    const controller = createInputController({ surface, joystickZone, keyTarget });
    dispatchKey(keyTarget, 'keydown', 'w');
    joystickZone.dispatchEvent(pointerEvent('pointerdown', { clientX: 50, clientY: 50 }));
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 90, clientY: 50 }));
    controller.clear();
    const result = controller.sample(0, false);
    expect(result).toEqual({ moveX: 0, moveY: 0, paused: false });
    controller.dispose();
  });

  it('passes the paused flag through unchanged', () => {
    const controller = createInputController({ surface, joystickZone, keyTarget });
    expect(controller.sample(5, true).paused).toBe(true);
    expect(controller.sample(5, false).paused).toBe(false);
    controller.dispose();
  });
});
