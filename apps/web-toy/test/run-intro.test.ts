import { describe, expect, it } from 'vitest';
import { presentRunIntro } from '../src/presentation/run-intro';

describe('run intro presentation', () => {
  it('holds a normal player run at tick zero with stable core-loop copy', () => {
    expect(presentRunIntro({ autoStart: false })).toEqual({
      holdAtStart: true,
      eyebrow: 'Animal Survivor',
      title: 'Greg is ready.',
      objective: 'Stay moving, collect green XP motes, and choose animal adaptations.',
      controls: 'Move with WASD or Arrow Keys — or drag the lower-left circle on touch. Greg auto-fires at nearby threats. Press Esc to pause.',
      cta: 'Start run',
    });
  });

  it('keeps an automated path immediately runnable', () => {
    const presentation = presentRunIntro({ autoStart: true });

    expect(presentation.holdAtStart).toBe(false);
    expect(presentation.cta).toBe('Start run');
  });
});
