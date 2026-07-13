import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createKeyboardTracker } from '../src/input/keyboard';
import { createGamepadTracker, type GamepadLike } from '../src/input/gamepad';
import { createMouseSteering } from '../src/input/mouse-steering';
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

function mousePointerEvent(type: string, opts: { clientX: number; clientY: number; pointerId?: number }): PointerEvent {
  const event = pointerEvent(type, opts);
  Object.defineProperty(event, 'pointerType', { value: 'mouse', configurable: true });
  return event;
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

  it('uses unique remapped keys while preserving Arrow Key fallback', () => {
    const kb = createKeyboardTracker(target, { bindings: { up: 'i', down: 'k', left: 'j', right: 'l' } });
    dispatchKey(target, 'keydown', 'i');
    expect(kb.vector()).toEqual({ x: 0, y: 1 });
    dispatchKey(target, 'keydown', 'w');
    expect(kb.vector()).toEqual({ x: 0, y: 1 });
    dispatchKey(target, 'keydown', 'ArrowLeft');
    expect(kb.vector()).toEqual({ x: -1, y: 1 });
    kb.dispose();
  });

  it('rejects duplicate or whitespace remapped keys', () => {
    expect(() => createKeyboardTracker(target, { bindings: { up: 'i', down: 'i', left: 'j', right: 'l' } })).toThrow('unique');
    expect(() => createKeyboardTracker(target, { bindings: { up: ' ', down: 'k', left: 'j', right: 'l' } })).toThrow('one non-whitespace');
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

describe('gamepad tracker', () => {
  it('maps a left stick with deadzone and screen Y inversion', () => {
    const pad: GamepadLike = { axes: [0.68, -0.62], connected: true };
    const tracker = createGamepadTracker({ provider: () => [pad], deadzone: 0.18 });
    const vector = tracker.vector();
    expect(vector.x).toBeCloseTo(0.609756);
    expect(vector.y).toBeCloseTo(0.536585);
    tracker.dispose();
  });

  it('falls back to standard D-pad buttons when the stick is neutral', () => {
    const pad: GamepadLike = {
      axes: [0, 0],
      buttons: Array.from({ length: 16 }, (_, index) => ({ pressed: index === 12 || index === 15 })),
    };
    const tracker = createGamepadTracker({ provider: () => [pad] });
    expect(tracker.vector()).toEqual({ x: 1, y: 1 });
    tracker.dispose();
  });

  it('skips disconnected and empty pads, then selects the first active pad', () => {
    const first: GamepadLike = { connected: false, axes: [1, 0] };
    const second: GamepadLike = { connected: true, axes: [0, 0] };
    const third: GamepadLike = { connected: true, axes: [-1, 0] };
    const tracker = createGamepadTracker({ provider: () => [first, second, third] });
    expect(tracker.vector()).toEqual({ x: -1, y: 0 });
    tracker.dispose();
  });

  it('returns zero when browser polling throws or data is malformed', () => {
    const throwing = createGamepadTracker({ provider: () => { throw new Error('unavailable'); } });
    expect(throwing.vector()).toEqual({ x: 0, y: 0 });
    throwing.dispose();
    const malformed = createGamepadTracker({ provider: () => [{ axes: [Number.NaN, Number.POSITIVE_INFINITY] }] });
    expect(malformed.vector()).toEqual({ x: 0, y: 0 });
    malformed.dispose();
  });
});

describe('mouse steering', () => {
  let surface: HTMLDivElement;

  beforeEach(() => {
    surface = document.createElement('div');
    document.body.appendChild(surface);
  });

  afterEach(() => {
    surface.remove();
  });

  it('maps a mouse drag to a clamped world vector', () => {
    const mouse = createMouseSteering(surface, { maxRadius: 100 });
    surface.dispatchEvent(mousePointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
    window.dispatchEvent(mousePointerEvent('pointermove', { clientX: 180, clientY: 40 }));
    expect(mouse.active()).toBe(true);
    expect(mouse.vector().x).toBeCloseTo(0.8);
    expect(mouse.vector().y).toBeCloseTo(0.6);
    window.dispatchEvent(mousePointerEvent('pointerup', { clientX: 180, clientY: 40 }));
    expect(mouse.vector()).toEqual({ x: 0, y: 0 });
    mouse.dispose();
  });

  it('ignores touch pointers and clears on blur', () => {
    const mouse = createMouseSteering(surface);
    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
    expect(mouse.active()).toBe(false);
    surface.dispatchEvent(mousePointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
    window.dispatchEvent(mousePointerEvent('pointermove', { clientX: 140, clientY: 100 }));
    expect(mouse.active()).toBe(true);
    window.dispatchEvent(new Event('blur'));
    expect(mouse.vector()).toEqual({ x: 0, y: 0 });
    mouse.dispose();
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
    expect(controller.inputMode?.()).toBe('keyboard');
    controller.dispose();
  });

  it('uses gamepad movement before keyboard input when the joystick is inactive', () => {
    const controller = createInputController({
      surface,
      joystickZone,
      keyTarget,
      gamepadProvider: () => [{ axes: [-1, 0] }],
    });
    dispatchKey(keyTarget, 'keydown', 'd');
    expect(controller.sample(0, false)).toEqual({ moveX: -1, moveY: 0, paused: false });
    expect(controller.inputMode?.()).toBe('gamepad');
    controller.dispose();
  });

  it('uses mouse steering before gamepad movement when the joystick is inactive', () => {
    const controller = createInputController({
      surface,
      joystickZone,
      keyTarget,
      gamepadProvider: () => [{ axes: [-1, 0] }],
    });
    surface.dispatchEvent(mousePointerEvent('pointerdown', { clientX: 50, clientY: 50 }));
    window.dispatchEvent(mousePointerEvent('pointermove', { clientX: 90, clientY: 50 }));
    expect(controller.sample(0, false)).toEqual({ moveX: 40 / 140, moveY: 0, paused: false });
    expect(controller.inputMode?.()).toBe('mouse');
    controller.dispose();
  });

  it('keeps touch joystick precedence over gamepad movement', () => {
    const controller = createInputController({
      surface,
      joystickZone,
      keyTarget,
      gamepadProvider: () => [{ axes: [-1, 0] }],
    });
    joystickZone.dispatchEvent(pointerEvent('pointerdown', { clientX: 50, clientY: 50 }));
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 50, clientY: 10 }));
    const result = controller.sample(1, false);
    expect(result.moveX).toBeCloseTo(0);
    expect(result.moveY).toBeGreaterThan(0);
    expect(controller.inputMode?.()).toBe('touch');
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
