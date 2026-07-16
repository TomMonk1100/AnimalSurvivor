import { describe, expect, it } from 'vitest';
import { presentRunIntro } from '../src/presentation/run-intro';

describe('run intro presentation', () => {
  it('holds a normal player run at tick zero with stable core-loop copy', () => {
    expect(presentRunIntro({ autoStart: false })).toEqual({
      holdAtStart: true,
      eyebrow: 'Animal Survivor',
      title: 'Scout is ready.',
      objective: 'Stay light on your paws, collect green XP motes, and build a close-range adaptation kit. Attacks rank from 1 to 5; at MASTER, fuse two compatible attacks into one slot to free space for another.',
      controls: 'Move with WASD, Arrow Keys, a gamepad left stick/D-pad, or hold-drag on the arena with a mouse. On touch, drag the lower-left circle. Scout’s Scout Swipe cleaves nearby threats. Scout’s baseline dodge and Melee Affinity reward bold close-range builds. Press Esc to pause.',
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
    expect(presentation.objective).toMatch(/MASTER/i);
    expect(presentation.controls).toMatch(/Trample/i);
    expect(presentation.controls).toMatch(/Thick Skin armor/i);
  });

  it('introduces each hero’s V1.1 signature and defense clearly', () => {
    expect(presentRunIntro({ autoStart: false, heroId: 'greg' })).toMatchObject({
      title: 'Scout is ready.',
      controls: expect.stringMatching(/Scout Swipe.*dodge.*Melee Affinity/i),
    });
    expect(presentRunIntro({ autoStart: false, heroId: 'benny' }).controls).toMatch(/Trample.*earth waves.*Thick Skin/i);
    expect(presentRunIntro({ autoStart: false, heroId: 'gracie' }).controls).toMatch(/Spit.*Fluffy Shield.*recharges/i);
  });

  it('keeps every controls prompt complete instead of relying on visual clipping', () => {
    for (const heroId of ['greg', 'benny', 'gracie'] as const) {
      expect(presentRunIntro({ autoStart: false, heroId }).controls).toMatch(/pause\.$/);
    }
  });
});
