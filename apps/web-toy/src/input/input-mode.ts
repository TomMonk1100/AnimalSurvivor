import type { InputMode } from '../contracts';
import { DEFAULT_KEYBOARD_BINDINGS, type KeyboardBindings } from './keyboard';

export interface InputModePresentation {
  readonly label: string;
  readonly guidance: string;
}

const PRESENTATIONS: Readonly<Record<InputMode, InputModePresentation>> = Object.freeze({
  keyboard: Object.freeze({ label: 'Keyboard', guidance: 'WASD / Arrow Keys' }),
  mouse: Object.freeze({ label: 'Mouse drag', guidance: 'Hold-drag on the arena' }),
  touch: Object.freeze({ label: 'Touch joystick', guidance: 'Drag the lower-left circle' }),
  gamepad: Object.freeze({ label: 'Gamepad', guidance: 'Left stick / D-pad' }),
});

/** Pure player-facing copy for a detected input source. */
export function presentInputMode(mode: InputMode): InputModePresentation {
  return PRESENTATIONS[mode];
}

function keyLabel(key: string): string {
  return key.length === 1 ? key.toUpperCase() : key;
}

/** Returns truthful keyboard guidance after a player remaps movement keys. */
export function presentKeyboardInputMode(bindings: KeyboardBindings = DEFAULT_KEYBOARD_BINDINGS): InputModePresentation {
  const isDefault = bindings.up === DEFAULT_KEYBOARD_BINDINGS.up
    && bindings.left === DEFAULT_KEYBOARD_BINDINGS.left
    && bindings.down === DEFAULT_KEYBOARD_BINDINGS.down
    && bindings.right === DEFAULT_KEYBOARD_BINDINGS.right;
  return Object.freeze({
    label: 'Keyboard',
    guidance: isDefault
      ? PRESENTATIONS.keyboard.guidance
      : `${keyLabel(bindings.up)} / ${keyLabel(bindings.left)} / ${keyLabel(bindings.down)} / ${keyLabel(bindings.right)} · Arrow Keys remain available`,
  });
}
