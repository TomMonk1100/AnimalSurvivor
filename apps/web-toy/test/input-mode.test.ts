import { describe, expect, it } from 'vitest';
import { presentInputMode, presentKeyboardInputMode } from '../src/input/input-mode';

describe('input mode presentation', () => {
  it('keeps device guidance stable and presentation-only', () => {
    expect(presentInputMode('keyboard')).toEqual({ label: 'Keyboard', guidance: 'WASD / Arrow Keys' });
    expect(presentInputMode('mouse')).toEqual({ label: 'Mouse drag', guidance: 'Hold-drag on the arena' });
    expect(presentInputMode('touch')).toEqual({ label: 'Touch joystick', guidance: 'Drag the lower-left circle' });
    expect(presentInputMode('gamepad')).toEqual({ label: 'Gamepad', guidance: 'Left stick / D-pad' });
    expect(presentKeyboardInputMode({ up: 'i', down: 'k', left: 'j', right: 'l' })).toEqual({
      label: 'Keyboard',
      guidance: 'I / J / K / L · Arrow Keys remain available',
    });
  });
});
