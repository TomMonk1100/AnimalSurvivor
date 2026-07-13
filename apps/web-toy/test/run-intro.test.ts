import { describe, expect, it } from 'vitest';
import { presentRunIntro } from '../src/presentation/run-intro';

describe('run intro presentation', () => {
  it('holds a normal player run at tick zero with stable core-loop copy', () => {
    expect(presentRunIntro({ autoStart: false })).toEqual({
      holdAtStart: true,
      eyebrow: 'Animal Survivor',
      title: 'Greg is ready.',
      objective: 'Stay moving, collect green XP motes, and choose animal adaptations.',
      controls: 'Move with WASD, Arrow Keys, a gamepad left stick/D-pad, or hold-drag on the arena with a mouse. On touch, drag the lower-left circle. Greg auto-fires and charges a three-wave Rush Rake while moving near threats. Press Esc to pause.',
      cta: 'Start run',
    });
  });

  it('keeps an automated path immediately runnable', () => {
    const presentation = presentRunIntro({ autoStart: true });

    expect(presentation.holdAtStart).toBe(false);
    expect(presentation.cta).toBe('Start run');
  });

  it('changes onboarding copy when Benny is selected', () => {
    const presentation = presentRunIntro({ autoStart: false, heroId: 'benny' });

    expect(presentation.title).toBe('Benny is ready.');
    expect(presentation.objective).toMatch(/sturdy body/i);
    expect(presentation.controls).toMatch(/Benny auto-fires/i);
  });
});
