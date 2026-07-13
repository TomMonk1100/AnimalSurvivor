/** Deterministic reducer for Benny's reactive Brace Bloom instinct. */

export interface BennyBraceConfig {
  readonly hitsToPulse: number;
  readonly cooldownTicks: number;
  readonly pulseRadius: number;
  readonly pulseDamage: number;
  readonly knockbackStrength: number;
}

export const BENNY_BRACE_CONTENT_VERSION = 1 as const;

export const DEFAULT_BENNY_BRACE_CONFIG: Readonly<BennyBraceConfig> = Object.freeze({
  hitsToPulse: 2,
  cooldownTicks: 90,
  pulseRadius: 92,
  pulseDamage: 14,
  knockbackStrength: 26,
});

export interface BennyBraceState {
  readonly tick: number;
  readonly charge: number;
  readonly cooldownTicksRemaining: number;
}

export interface BennyBraceInput {
  readonly contactHits: number;
  readonly originX: number;
  readonly originY: number;
}

export interface BennyBracePulse {
  readonly kind: 'bennyBracePulse';
  readonly tick: number;
  readonly originX: number;
  readonly originY: number;
  readonly radius: number;
  readonly damage: number;
  readonly knockbackStrength: number;
}

export interface BennyBraceStepResult {
  readonly state: BennyBraceState;
  readonly pulse: BennyBracePulse | null;
}

export function createBennyBraceState(): BennyBraceState {
  return { tick: -1, charge: 0, cooldownTicksRemaining: 0 };
}

export function stepBennyBrace(
  previous: Readonly<BennyBraceState>,
  input: Readonly<BennyBraceInput>,
  config: Readonly<BennyBraceConfig> = DEFAULT_BENNY_BRACE_CONFIG,
): BennyBraceStepResult {
  const tick = previous.tick + 1;
  const cooldownTicksRemaining = Math.max(0, previous.cooldownTicksRemaining - 1);
  const contactHits = Number.isSafeInteger(input.contactHits) && input.contactHits > 0
    ? input.contactHits
    : 0;
  const charge = Math.min(config.hitsToPulse, previous.charge + contactHits);
  if (cooldownTicksRemaining > 0 || charge < config.hitsToPulse) {
    return {
      state: { tick, charge, cooldownTicksRemaining },
      pulse: null,
    };
  }
  return {
    state: { tick, charge: 0, cooldownTicksRemaining: config.cooldownTicks },
    pulse: {
      kind: 'bennyBracePulse',
      tick,
      originX: input.originX,
      originY: input.originY,
      radius: config.pulseRadius,
      damage: config.pulseDamage,
      knockbackStrength: config.knockbackStrength,
    },
  };
}
