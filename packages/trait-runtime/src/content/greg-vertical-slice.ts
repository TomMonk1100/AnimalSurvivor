/**
 * AGENT A — OWNED.
 *
 * First vertical slice: real, fully-specified definitions.
 * Fill these three consts with concrete authored data (see spec below).
 * Keep the exported names and types exactly.
 *
 * porcupine-quills  (socket: back)
 *   bud:      periodic compact projectile burst.
 *   adapted:  larger/faster burst (defensive close-range flavor).
 * puffer-pouch      (socket: head)
 *   bud:      periodic telegraphed inhale/exhale pulse.
 *   adapted:  wider gather + knockback pulse.
 * thornstorm-mantle (recipe: Adapted Quills + Adapted Pouch; sockets head+back)
 *   mythic multiPhase, EXACT order: telegraph -> gather -> radial quill exhale.
 *   visualKey identifies both head and back as one Mythic.
 *
 * Determinism: all numeric params are integers or exact floats; no RNG here.
 */

import type { Catalog, TraitDefinition, EvolutionDefinition } from '../contracts.js';
import { TRAIT_IDS, EVOLUTION_IDS } from '../ids.js';

export const PORCUPINE_QUILLS: TraitDefinition = {
  id: TRAIT_IDS.porcupineQuills,
  sockets: ['back'],
  tags: ['defensive', 'projectile'],
  stages: {
    bud: {
      visualKey: 'porcupine-quills:bud',
      behavior: {
        kind: 'periodicBurst',
        periodTicks: 90,
        emit: {
          kind: 'spawnProjectileBurst',
          targeting: 'nearest',
          count: 5,
          damage: 4,
          speed: 6,
          spread: 0.4,
        },
      },
    },
    adapted: {
      visualKey: 'porcupine-quills:adapted',
      behavior: {
        kind: 'periodicBurst',
        periodTicks: 60,
        emit: {
          kind: 'spawnProjectileBurst',
          targeting: 'nearest',
          count: 9,
          damage: 6,
          speed: 9,
          spread: 0.4,
        },
      },
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
      behavior: {
        kind: 'periodicPulse',
        periodTicks: 100,
        emit: {
          kind: 'areaGather',
          targeting: 'none',
          radius: 90,
          strength: 5,
        },
      },
    },
    adapted: {
      visualKey: 'puffer-pouch:adapted',
      behavior: {
        kind: 'periodicPulse',
        periodTicks: 80,
        emit: {
          kind: 'areaKnockback',
          targeting: 'none',
          radius: 140,
          strength: 9,
        },
      },
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
      {
        durationTicks: 20,
        emit: {
          kind: 'telegraph',
          targeting: 'none',
          radius: 140,
          tag: 'thornstorm-inhale',
        },
      },
      {
        durationTicks: 15,
        emit: {
          kind: 'areaGather',
          targeting: 'none',
          radius: 140,
          strength: 9,
        },
      },
      {
        durationTicks: 55,
        emit: {
          kind: 'radialProjectileBurst',
          targeting: 'none',
          count: 16,
          damage: 8,
          speed: 8,
        },
      },
    ],
  },
};

/** Exact content boundary supported by Greg's current playable vertical slice. */
export const GREG_VERTICAL_SLICE_CATALOG: Catalog = Object.freeze({
  traits: Object.freeze([PORCUPINE_QUILLS, PUFFER_POUCH]),
  evolutions: Object.freeze([THORNSTORM_MANTLE]),
});
