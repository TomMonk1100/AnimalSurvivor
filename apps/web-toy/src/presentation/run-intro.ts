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

const MOVEMENT_CONTROLS = 'Move with WASD, Arrow Keys, a gamepad left stick/D-pad, or hold-drag on the arena with a mouse. On touch, drag the lower-left circle.';
const MASTERY_OBJECTIVE = 'Attacks rank from 1 to 5; at MASTER, fuse two compatible attacks into one slot to free space for another.';

const PLAYER_COPY = {
  greg: {
    title: 'Greg is ready.',
    objective: `Stay light on your paws, collect green XP motes, and build a close-range adaptation kit. ${MASTERY_OBJECTIVE}`,
    controls: `${MOVEMENT_CONTROLS} Greg’s Fox Swipe cleaves nearby threats. His baseline dodge and Melee Affinity reward bold close-range builds. Press Esc to pause.`,
  },
  benny: {
    title: 'Benny is ready.',
    objective: `Use Benny’s sturdy body to hold space, collect XP, and build visible adaptations. ${MASTERY_OBJECTIVE}`,
    controls: `${MOVEMENT_CONTROLS} Benny’s Trample sends hard earth waves forward. Thick Skin armor reduces incoming damage so he can stand his ground. Press Esc to pause.`,
  },
  gracie: {
    title: 'Gracie is ready.',
    objective: `Sweep up XP from a wider field, stay mobile, and grow a strange visible build. ${MASTERY_OBJECTIVE}`,
    controls: `${MOVEMENT_CONTROLS} Gracie’s Spit attack grows wilder with ranks. Her Fluffy Shield absorbs damage first, then recharges between hits. Press Esc to pause.`,
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
