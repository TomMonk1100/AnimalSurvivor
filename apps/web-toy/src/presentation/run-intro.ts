/**
 * Player-facing copy and start-gate policy. This stays presentation-owned so
 * first-run onboarding cannot alter fixed-tick simulation state or replay
 * behavior.
 */
export interface RunIntroOptions {
  /** Automated or diagnostic harnesses must retain their immediate boot path. */
  readonly autoStart: boolean;
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
  eyebrow: 'Animal Survivor',
  title: 'Greg is ready.',
  objective: 'Stay moving, collect green XP motes, and choose animal adaptations.',
  controls: 'Move with WASD or Arrow Keys — or drag the lower-left circle on touch. Greg auto-fires at nearby threats. Press Esc to pause.',
  cta: 'Start run',
} as const;

/**
 * Autopilot/stress paths deliberately skip the gate: their reproducible
 * commands are engineering evidence, while an ordinary first playthrough gets
 * time to read the core loop before its first tick.
 */
export function presentRunIntro(options: RunIntroOptions): RunIntroPresentation {
  return {
    holdAtStart: !options.autoStart,
    ...PLAYER_COPY,
  };
}
