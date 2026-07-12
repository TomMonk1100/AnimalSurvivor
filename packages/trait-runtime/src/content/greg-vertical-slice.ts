/**
 * AGENT A — OWNED.
 *
 * First playable arsenal: real, fully-specified definitions that only use
 * combat commands the accepted simulation can execute today.
 * Keep the exported names and types exactly.
 *
 * porcupine-quills  (socket: back)
 *   bud:      periodic compact projectile burst.
 *   adapted:  larger/faster burst (defensive close-range flavor).
 * puffer-pouch      (socket: head)
 *   bud:      periodic telegraphed inhale/exhale pulse.
 *   adapted:  wider gather + knockback pulse.
 * electric-eel-coil (socket: tail)
 *   bud/adapted: directed charged-bolt bursts aimed into dense enemy clusters.
 * firefly-colony (socket: bodyOrbit)
 *   bud/adapted: autonomous radial spark bursts.
 * thunderbug-dynamo (recipe: Adapted Coil + Adapted Colony; sockets tail+bodyOrbit)
 *   mythic charge telegraph followed by a larger radial lightning storm.
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

/**
 * A focused ranged option distinct from Quills: fewer, faster bolts seek the
 * nearest threat. It deliberately maps to the supported projectile bridge
 * rather than pretending the future chain-lightning state exists.
 */
export const ELECTRIC_EEL_COIL: TraitDefinition = {
  id: TRAIT_IDS.electricEelCoil,
  sockets: ['tail'],
  tags: ['electric', 'projectile'],
  stages: {
    bud: {
      visualKey: 'electric-eel-coil:bud',
      behavior: {
        kind: 'periodicBurst',
        periodTicks: 80,
        emit: {
          kind: 'spawnProjectileBurst',
          targeting: 'nearest',
          count: 2,
          damage: 4,
          speed: 8,
          spread: 0.18,
          range: 300,
        },
      },
    },
    adapted: {
      visualKey: 'electric-eel-coil:adapted',
      behavior: {
        kind: 'periodicBurst',
        periodTicks: 52,
        emit: {
          kind: 'spawnProjectileBurst',
          targeting: 'nearest',
          count: 4,
          damage: 6,
          speed: 10,
          spread: 0.32,
          range: 340,
        },
      },
    },
  },
};

/**
 * A radial attack which keeps pressure off Greg without duplicating Quills'
 * targeted spread. Its simple supported burst can later graduate to orbiting
 * projectiles without changing the acquisition or evolution rules.
 */
export const FIREFLY_COLONY: TraitDefinition = {
  id: TRAIT_IDS.fireflyColony,
  sockets: ['bodyOrbit'],
  tags: ['light', 'projectile'],
  stages: {
    bud: {
      visualKey: 'firefly-colony:bud',
      behavior: {
        kind: 'periodicBurst',
        periodTicks: 120,
        emit: {
          kind: 'radialProjectileBurst',
          targeting: 'none',
          count: 6,
          damage: 3,
          speed: 6,
          facing: 0,
        },
      },
    },
    adapted: {
      visualKey: 'firefly-colony:adapted',
      behavior: {
        kind: 'periodicBurst',
        periodTicks: 80,
        emit: {
          kind: 'radialProjectileBurst',
          targeting: 'none',
          count: 10,
          damage: 5,
          speed: 8,
          facing: 0,
        },
      },
    },
  },
};

export const THUNDERBUG_DYNAMO: EvolutionDefinition = {
  id: EVOLUTION_IDS.thunderbugDynamo,
  ingredients: [TRAIT_IDS.electricEelCoil, TRAIT_IDS.fireflyColony],
  occupiedSockets: ['tail', 'bodyOrbit'],
  visualKey: 'thunderbug-dynamo:mythic',
  behavior: {
    kind: 'multiPhase',
    periodTicks: 0,
    phases: [
      {
        durationTicks: 18,
        emit: {
          kind: 'telegraph',
          targeting: 'none',
          radius: 150,
          durationTicks: 18,
          tag: 'thunderbug-charge',
        },
      },
      {
        durationTicks: 72,
        emit: {
          kind: 'radialProjectileBurst',
          targeting: 'none',
          count: 18,
          damage: 9,
          speed: 9,
          facing: 0,
        },
      },
    ],
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

/**
 * Exact content boundary for Greg's first five-attack loadout:
 * starter fire + Quills + Puffer control + Coil + Colony. The two Mythics
 * each retain both ingredient attack slots rather than creating a free slot.
 */
export const GREG_FOREST_ARSENAL_CATALOG: Catalog = Object.freeze({
  traits: Object.freeze([
    PORCUPINE_QUILLS,
    PUFFER_POUCH,
    ELECTRIC_EEL_COIL,
    FIREFLY_COLONY,
  ]),
  evolutions: Object.freeze([THORNSTORM_MANTLE, THUNDERBUG_DYNAMO]),
  maxActiveTraits: 4,
});

/** @deprecated Use GREG_FOREST_ARSENAL_CATALOG for the playable five-slot build. */
export const GREG_VERTICAL_SLICE_CATALOG = GREG_FOREST_ARSENAL_CATALOG;
