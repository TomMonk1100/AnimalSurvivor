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
 *   bud/adapted: instant, never-miss lightning that chains through nearby foes.
 * firefly-colony (socket: bodyOrbit)
 *   bud/adapted: orbiting fireflies that damage enemies on contact.
 * mantis-scythes (socket: leftShoulder)
 *   bud/adapted: auto-aimed directional scythe sweeps at nearby threats.
 * gecko-pads (socket: rightShoulder)
 *   bud/adapted: leave damaging pads only while Greg travels through the forest.
 * razorstep-chimera (recipe: Adapted Mantis + Adapted Gecko; shoulders)
 *   mythic: a stronger, denser moving trail that preserves both ingredients' slots.
 * thunderbug-dynamo (recipe: Adapted Coil + Adapted Colony; sockets tail+bodyOrbit)
 *   mythic charge telegraph followed by a larger chain-lightning discharge.
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
 * A guaranteed, low-damage lightning strike distinct from Greg's Auto-Fire
 * and Quills. `jumps` means additional unique enemies after the first strike;
 * `range` is the hop radius between each struck enemy. The executor acquires
 * the initial target at its standard nearby-enemy range, applies damage in the
 * same tick, and never creates a projectile that can miss.
 */
export const ELECTRIC_EEL_COIL: TraitDefinition = {
  id: TRAIT_IDS.electricEelCoil,
  sockets: ['tail'],
  tags: ['electric', 'chain'],
  stages: {
    bud: {
      visualKey: 'electric-eel-coil:bud',
      behavior: {
        kind: 'periodicBurst',
        periodTicks: 80,
        emit: {
          kind: 'chainDamage',
          targeting: 'nearest',
          damage: 4,
          jumps: 1,
          range: 120,
        },
      },
    },
    adapted: {
      visualKey: 'electric-eel-coil:adapted',
      behavior: {
        kind: 'periodicBurst',
        periodTicks: 52,
        emit: {
          kind: 'chainDamage',
          targeting: 'nearest',
          damage: 5,
          jumps: 3,
          range: 150,
        },
      },
    },
  },
};

/**
 * A true orbit/contact family: the fireflies occupy Greg's space, damage the
 * nearest enemy at each contact pulse, and never become another aimed bolt.
 * `speed` is angular radians per tick; the executor derives each firefly's
 * position from the authoritative command tick, so replay never needs a
 * persistent companion pool.
 */
export const FIREFLY_COLONY: TraitDefinition = {
  id: TRAIT_IDS.fireflyColony,
  sockets: ['bodyOrbit'],
  tags: ['light', 'orbit', 'defensive'],
  stages: {
    bud: {
      visualKey: 'firefly-colony:bud',
      behavior: {
        kind: 'periodicBurst',
        periodTicks: 30,
        emit: {
          kind: 'orbitingDamage',
          targeting: 'none',
          count: 2,
          damage: 3,
          speed: (Math.PI * 2) / 120,
          radius: 50,
          range: 18,
          facing: 0,
        },
      },
    },
    adapted: {
      visualKey: 'firefly-colony:adapted',
      behavior: {
        kind: 'periodicBurst',
        periodTicks: 24,
        emit: {
          kind: 'orbitingDamage',
          targeting: 'none',
          count: 4,
          damage: 4,
          speed: (Math.PI * 2) / 96,
          radius: 64,
          range: 20,
          facing: 0,
        },
      },
    },
  },
};

/**
 * A close, auto-aimed cleave: unlike an aura, it only cuts enemies inside the
 * resolved scythe sector. That makes crowd positioning matter and gives Greg
 * a true melee family instead of another all-direction damage pulse.
 */
export const MANTIS_SCYTHES: TraitDefinition = {
  id: TRAIT_IDS.mantisScythes,
  sockets: ['leftShoulder'],
  tags: ['melee', 'area'],
  stages: {
    bud: {
      visualKey: 'mantis-scythes:bud',
      behavior: {
        kind: 'periodicPulse',
        periodTicks: 45,
        emit: {
          kind: 'meleeArc',
          targeting: 'nearest',
          damage: 6,
          arc: 1.2,
          range: 68,
        },
      },
    },
    adapted: {
      visualKey: 'mantis-scythes:adapted',
      behavior: {
        kind: 'periodicPulse',
        periodTicks: 30,
        emit: {
          kind: 'meleeArc',
          targeting: 'nearest',
          damage: 10,
          arc: 1.6,
          range: 88,
        },
      },
    },
  },
};

/**
 * A movement-dependent zone attack. Its BehaviorTimer carries fixed
 * milliunits of travel, so stationary players never receive free damage and
 * attack speed adjusts only the pad's damage cadence, not its placement
 * distance.
 */
export const GECKO_PADS: TraitDefinition = {
  id: TRAIT_IDS.geckoPads,
  sockets: ['rightShoulder'],
  tags: ['mobility', 'zone'],
  stages: {
    bud: {
      visualKey: 'gecko-pads:bud',
      behavior: {
        kind: 'movementTrail',
        periodTicks: 0,
        distanceMilliunits: 150_000,
        emit: {
          kind: 'spawnZone',
          targeting: 'none',
          radius: 38,
          amount: 3,
          durationTicks: 150,
          intervalTicks: 24,
          tag: 'gecko-pad',
        },
      },
    },
    adapted: {
      visualKey: 'gecko-pads:adapted',
      behavior: {
        kind: 'movementTrail',
        periodTicks: 0,
        distanceMilliunits: 110_000,
        emit: {
          kind: 'spawnZone',
          targeting: 'none',
          radius: 52,
          amount: 5,
          durationTicks: 180,
          intervalTicks: 18,
          tag: 'gecko-pad',
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
          kind: 'chainDamage',
          targeting: 'nearest',
          damage: 9,
          jumps: 7,
          range: 185,
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
 * The close-range Mantis/Gecko evolution. It keeps both shoulder slots
 * occupied and remains movement-gated, but turns the trail into a larger,
 * faster-ticking Razorstep pad.
 */
export const RAZORSTEP_CHIMERA: EvolutionDefinition = {
  id: EVOLUTION_IDS.razorstepChimera,
  ingredients: [TRAIT_IDS.mantisScythes, TRAIT_IDS.geckoPads],
  occupiedSockets: ['leftShoulder', 'rightShoulder'],
  visualKey: 'razorstep-chimera:mythic',
  behavior: {
    kind: 'movementTrail',
    periodTicks: 0,
    distanceMilliunits: 90_000,
    emit: {
      kind: 'spawnZone',
      targeting: 'none',
      radius: 58,
      amount: 7,
      durationTicks: 200,
      intervalTicks: 14,
      tag: 'razorstep-scythe-pad',
    },
  },
};

/**
 * Exact content boundary for Greg's first five-attack loadout: starter fire
 * plus any four selected candidates from Quills, Puffer control, Coil, Colony,
 * Mantis Scythes, and Gecko Pads. The Mythics each retain both ingredient
 * attack slots rather than creating a free slot.
 */
export const GREG_FOREST_ARSENAL_CATALOG: Catalog = Object.freeze({
  traits: Object.freeze([
    PORCUPINE_QUILLS,
    PUFFER_POUCH,
    ELECTRIC_EEL_COIL,
    FIREFLY_COLONY,
    MANTIS_SCYTHES,
    GECKO_PADS,
  ]),
  evolutions: Object.freeze([THORNSTORM_MANTLE, THUNDERBUG_DYNAMO, RAZORSTEP_CHIMERA]),
  maxActiveTraits: 4,
});

/** @deprecated Use GREG_FOREST_ARSENAL_CATALOG for the playable five-slot build. */
export const GREG_VERTICAL_SLICE_CATALOG = GREG_FOREST_ARSENAL_CATALOG;
