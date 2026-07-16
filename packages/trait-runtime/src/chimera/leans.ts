/** Small deterministic stat-bias identities rolled alongside a temperament. */

export type StatLeanId = 'balanced' | 'swift' | 'heavy' | 'reaching' | 'dense';

export interface StatLeanDefinition {
  readonly id: StatLeanId;
  readonly label: string;
}

export const STAT_LEANS: readonly StatLeanDefinition[] = Object.freeze([
  { id: 'balanced', label: 'Balanced' },
  { id: 'swift', label: 'Swift' },
  { id: 'heavy', label: 'Heavy' },
  { id: 'reaching', label: 'Reaching' },
  { id: 'dense', label: 'Dense' },
]);

const BY_ID = new Map<StatLeanId, StatLeanDefinition>(STAT_LEANS.map((lean) => [lean.id, lean]));
const U32_RANGE = 0x1_0000_0000;

function uint32(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Stat Lean selection requires a finite roll');
  return value >>> 0;
}

export function isStatLeanId(value: unknown): value is StatLeanId {
  return typeof value === 'string' && BY_ID.has(value as StatLeanId);
}

export function getStatLean(id: StatLeanId): StatLeanDefinition {
  return BY_ID.get(id)!;
}

/** Uniformly select one of the five plan Stat Leans from a deterministic uint32 roll. */
export function selectStatLean(roll: number): StatLeanDefinition {
  const index = Math.floor((uint32(roll) * STAT_LEANS.length) / U32_RANGE);
  return STAT_LEANS[index]!;
}
