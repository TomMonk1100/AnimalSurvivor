/** Shared core Forest definitions used by the complete catalog and the
 * presentation-facing Forest Arsenal boundary. Keeping these three records in
 * a dependency-neutral module prevents the two catalog views from importing
 * each other during ESM initialization. */
import type { EvolutionDefinition, TraitDefinition } from '../contracts.js';
import { EVOLUTION_IDS, TRAIT_IDS } from '../ids.js';

export const PORCUPINE_QUILLS: TraitDefinition = {
  id: TRAIT_IDS.porcupineQuills,
  sockets: ['back'],
  tags: ['defensive', 'projectile'],
  stages: {
    bud: {
      visualKey: 'porcupine-quills:bud',
      behavior: { kind: 'periodicBurst', periodTicks: 90, emit: {
        kind: 'spawnProjectileBurst', targeting: 'nearest', count: 3, damage: 4, speed: 8, spread: 0.38, pierce: 1,
      } },
    },
    adapted: {
      visualKey: 'porcupine-quills:adapted',
      behavior: { kind: 'periodicBurst', periodTicks: 60, emit: {
        kind: 'spawnProjectileBurst', targeting: 'nearest', count: 5, damage: 6, speed: 10, spread: 0.52, pierce: 2,
      } },
    },
  },
};

export const PUFFER_POUCH: TraitDefinition = {
  id: TRAIT_IDS.pufferPouch,
  sockets: ['head'],
  tags: ['defensive', 'area'],
  stages: {
    bud: {
      visualKey: 'puffer-pouch:bud',
      behavior: { kind: 'periodicPulse', periodTicks: 100, emit: {
        kind: 'areaGather', targeting: 'none', radius: 90, strength: 5,
      } },
    },
    adapted: {
      visualKey: 'puffer-pouch:adapted',
      behavior: { kind: 'periodicPulse', periodTicks: 80, emit: {
        kind: 'areaKnockback', targeting: 'none', radius: 140, strength: 9,
      } },
    },
  },
};

export const THORNSTORM_MANTLE: EvolutionDefinition = {
  id: EVOLUTION_IDS.thornstormMantle,
  ingredients: [TRAIT_IDS.porcupineQuills, TRAIT_IDS.pufferPouch],
  occupiedSockets: ['head', 'back'],
  visualKey: 'thornstorm-mantle:mythic',
  behavior: {
    kind: 'multiPhase',
    periodTicks: 0,
    phases: [
      { durationTicks: 20, emit: { kind: 'telegraph', targeting: 'none', radius: 140, tag: 'thornstorm-inhale' } },
      { durationTicks: 15, emit: { kind: 'areaGather', targeting: 'none', radius: 140, strength: 9 } },
      { durationTicks: 55, emit: { kind: 'radialProjectileBurst', targeting: 'none', count: 16, damage: 8, speed: 8 } },
    ],
  },
};
