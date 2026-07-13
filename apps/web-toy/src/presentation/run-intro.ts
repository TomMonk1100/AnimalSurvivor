import { getHeroDefinition, type HeroId } from '@sim';

/**
 * Player-facing copy and start-gate policy. This stays presentation-owned so
 * first-run onboarding cannot alter fixed-tick simulation state or replay
 * behavior.
 */
export interface RunIntroOptions {
  /** Automated or diagnostic harnesses must retain their immediate boot path. */
  readonly autoStart: boolean;
  readonly heroId?: HeroId;
}

export interface RunIntroPresentation {
  /** Normal player runs wait at tick zero until the player explicitly starts. */
  readonly holdAtStart: boolean;
  readonly eyebrow: string;
  readonly title: string;
  readonly objective: string;
  readonly controls: string;
  readonly cta: string;
}

const PLAYER_COPY = {
  greg: {
    title: 'Greg is ready.',
    objective: 'Stay moving, collect green XP motes, and choose animal adaptations.',
    controls: 'Move with WASD, Arrow Keys, a gamepad left stick/D-pad, or hold-drag on the arena with a mouse. On touch, drag the lower-left circle. Greg auto-fires and charges a three-wave Rush Rake while moving near threats. Press Esc to pause.',
  },
  benny: {
    title: 'Benny is ready.',
    objective: 'Use Benny’s sturdy body to hold space, collect XP, and build visible adaptations.',
    controls: 'Move with WASD, Arrow Keys, a gamepad left stick/D-pad, or hold-drag on the arena with a mouse. On touch, drag the lower-left circle. Benny auto-fires; two contact hits charge his Brace Bloom shockwave. Press Esc to pause.',
  },
  gracie: {
    title: 'Gracie is ready.',
    objective: 'Sweep up XP from a wider field, stay mobile, and grow a strange visible build.',
    controls: 'Move with WASD, Arrow Keys, a gamepad left stick/D-pad, or hold-drag on the arena with a mouse. On touch, drag the lower-left circle. Gracie auto-fires and periodically Scouts forward threats. Press Esc to pause.',
  },
} as const;

/**
 * Autopilot/stress paths deliberately skip the gate: their reproducible
 * commands are engineering evidence, while an ordinary first playthrough gets
 * time to read the core loop before its first tick.
 */
export function presentRunIntro(options: RunIntroOptions): RunIntroPresentation {
  const heroId = options.heroId ?? 'greg';
  getHeroDefinition(heroId);
  return {
    holdAtStart: !options.autoStart,
    eyebrow: 'Animal Survivor',
    ...PLAYER_COPY[heroId],
    cta: 'Start run',
  };
}
