/**
 * AGENT A — OWNED.
 *
 * Full catalog: the three slice definitions plus the remaining catalog traits
 * and 5 remaining recipes. Non-slice traits/recipes may use generic placeholder
 * behavior schedules but MUST have correct metadata: valid sockets, valid
 * ingredient pairs, occupiedSockets = union of ingredient sockets, distinct
 * visual keys.
 *
 * Frozen socket assignments (each recipe pair internally non-overlapping so the
 * pair is co-ownable):
 *   electric-eel-coil    : [tail]           firefly-colony  : [bodyOrbit]
 *     -> thunderbug-dynamo   : [tail, bodyOrbit]
 *   mantis-scythes       : [leftShoulder]   gecko-pads : [rightShoulder]
 *     -> razorstep-chimera   : [leftShoulder, rightShoulder]
 *     (single-shoulder each so thornstorm + thunderbug + razorstep are fully
 *      socket-disjoint and six Mythics can coexist on one hero)
 *   owl-pinions          : [leftShoulder,rightShoulder]  bat-ears   : [head]
 *     -> midnight-radar      : [head, leftShoulder, rightShoulder]
 *   crab-pincers         : [leftShoulder,rightShoulder]  armadillo-greaves : [back]
 *     -> meteor-mauler       : [back, leftShoulder, rightShoulder]
 *   skunk-brush          : [tail]           monarch-brood   : [bodyOrbit]
 *     -> royal-stinkcloud    : [tail, bodyOrbit]
 *
 * Do NOT invent traits or recipes beyond these.
 */

import type { Catalog, TraitDefinition, EvolutionDefinition } from '../contracts.js';
import { TRAIT_IDS, EVOLUTION_IDS } from '../ids.js';
import { PORCUPINE_QUILLS, PUFFER_POUCH, THORNSTORM_MANTLE } from './forest-core.js';

/* ────────────────────────────────────────────────────────────────────────
 * Thunderbug pair: electric-eel-coil + firefly-colony
 * ──────────────────────────────────────────────────────────────────────── */

const ELECTRIC_EEL_COIL: TraitDefinition = {
  id: TRAIT_IDS.electricEelCoil,
  sockets: ['tail'],
  tags: ['electric', 'chain'],
  stages: {
    bud: {
      visualKey: 'electric-eel-coil:bud',
      behavior: {
        kind: 'generic',
        periodTicks: 80,
        emit: {
          kind: 'chainDamage',
          targeting: 'nearest',
          damage: 5,
          jumps: 3,
          range: 100,
        },
      },
    },
    adapted: {
      visualKey: 'electric-eel-coil:adapted',
      behavior: {
        kind: 'generic',
        periodTicks: 55,
        emit: {
          kind: 'chainDamage',
          targeting: 'nearest',
          damage: 8,
          jumps: 5,
          range: 130,
        },
      },
    },
  },
};

const FIREFLY_COLONY: TraitDefinition = {
  id: TRAIT_IDS.fireflyColony,
  sockets: ['bodyOrbit'],
  // Keep the default/full catalog aligned with the playable Forest Arsenal
  // definition. A visual firefly companion that emits an unsupported shield
  // command is worse than no fallback: it looks like an attack while doing
  // nothing in the accepted simulation.
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

const THUNDERBUG_DYNAMO: EvolutionDefinition = {
  id: EVOLUTION_IDS.thunderbugDynamo,
  ingredients: [TRAIT_IDS.electricEelCoil, TRAIT_IDS.fireflyColony],
  occupiedSockets: ['tail', 'bodyOrbit'],
  visualKey: 'thunderbug-dynamo:mythic',
  behavior: {
    kind: 'generic',
    periodTicks: 70,
    emit: {
      kind: 'chainDamage',
      targeting: 'nearest',
      damage: 12,
      jumps: 6,
      range: 160,
    },
  },
};

/* ────────────────────────────────────────────────────────────────────────
 * Razorstep pair: mantis-scythes + gecko-pads
 * ──────────────────────────────────────────────────────────────────────── */

const MANTIS_SCYTHES: TraitDefinition = {
  id: TRAIT_IDS.mantisScythes,
  sockets: ['leftShoulder'],
  tags: ['melee', 'blade'],
  stages: {
    bud: {
      visualKey: 'mantis-scythes:bud',
      behavior: {
        kind: 'generic',
        periodTicks: 45,
        emit: {
          kind: 'meleeArc',
          targeting: 'nearest',
          damage: 6,
          arc: 1.2,
          range: 40,
        },
      },
    },
    adapted: {
      visualKey: 'mantis-scythes:adapted',
      behavior: {
        kind: 'generic',
        periodTicks: 30,
        emit: {
          kind: 'meleeArc',
          targeting: 'nearest',
          damage: 10,
          arc: 1.6,
          range: 55,
        },
      },
    },
  },
};

const GECKO_PADS: TraitDefinition = {
  id: TRAIT_IDS.geckoPads,
  sockets: ['rightShoulder'],
  tags: ['mobility', 'zone'],
  stages: {
    bud: {
      visualKey: 'gecko-pads:bud',
      behavior: {
        kind: 'generic',
        periodTicks: 130,
        emit: {
          kind: 'spawnZone',
          targeting: 'none',
          radius: 60,
          amount: 2,
          durationTicks: 80,
          tag: 'sticky-trail',
        },
      },
    },
    adapted: {
      visualKey: 'gecko-pads:adapted',
      behavior: {
        kind: 'generic',
        periodTicks: 100,
        emit: {
          kind: 'spawnZone',
          targeting: 'none',
          radius: 80,
          amount: 3,
          durationTicks: 100,
          tag: 'sticky-trail',
        },
      },
    },
  },
};

const RAZORSTEP_CHIMERA: EvolutionDefinition = {
  id: EVOLUTION_IDS.razorstepChimera,
  ingredients: [TRAIT_IDS.mantisScythes, TRAIT_IDS.geckoPads],
  occupiedSockets: ['leftShoulder', 'rightShoulder'],
  visualKey: 'razorstep-chimera:mythic',
  behavior: {
    kind: 'generic',
    periodTicks: 40,
    emit: {
      kind: 'meleeArc',
      targeting: 'nearest',
      damage: 14,
      arc: 2.0,
      range: 60,
    },
  },
};

/* ────────────────────────────────────────────────────────────────────────
 * Midnight pair: owl-pinions + bat-ears
 * ──────────────────────────────────────────────────────────────────────── */

const OWL_PINIONS: TraitDefinition = {
  id: TRAIT_IDS.owlPinions,
  sockets: ['leftShoulder', 'rightShoulder'],
  tags: ['ranged', 'flight'],
  stages: {
    bud: {
      visualKey: 'owl-pinions:bud',
      behavior: {
        kind: 'generic',
        periodTicks: 95,
        emit: {
          kind: 'spawnProjectileBurst',
          targeting: 'nearest',
          count: 4,
          damage: 3,
          speed: 7,
          spread: 0.3,
        },
      },
    },
    adapted: {
      visualKey: 'owl-pinions:adapted',
      behavior: {
        kind: 'generic',
        periodTicks: 70,
        emit: {
          kind: 'spawnProjectileBurst',
          targeting: 'nearest',
          count: 7,
          damage: 5,
          speed: 10,
          spread: 0.3,
        },
      },
    },
  },
};

const BAT_EARS: TraitDefinition = {
  id: TRAIT_IDS.batEars,
  sockets: ['head'],
  tags: ['support', 'perception'],
  stages: {
    bud: {
      visualKey: 'bat-ears:bud',
      behavior: {
        kind: 'generic',
        periodTicks: 120,
        emit: {
          kind: 'markTargets',
          targeting: 'densestCluster',
          count: 3,
          radius: 200,
          tag: 'echo-mark',
        },
      },
    },
    adapted: {
      visualKey: 'bat-ears:adapted',
      behavior: {
        kind: 'generic',
        periodTicks: 90,
        emit: {
          kind: 'markTargets',
          targeting: 'densestCluster',
          count: 5,
          radius: 260,
          tag: 'echo-mark',
        },
      },
    },
  },
};

const MIDNIGHT_RADAR: EvolutionDefinition = {
  id: EVOLUTION_IDS.midnightRadar,
  ingredients: [TRAIT_IDS.owlPinions, TRAIT_IDS.batEars],
  occupiedSockets: ['head', 'leftShoulder', 'rightShoulder'],
  visualKey: 'midnight-radar:mythic',
  behavior: {
    kind: 'generic',
    periodTicks: 100,
    emit: {
      kind: 'markTargets',
      targeting: 'densestCluster',
      count: 6,
      radius: 320,
      tag: 'night-vision',
    },
  },
};

/* ────────────────────────────────────────────────────────────────────────
 * Meteor pair: crab-pincers + armadillo-greaves
 * ──────────────────────────────────────────────────────────────────────── */

const CRAB_PINCERS: TraitDefinition = {
  id: TRAIT_IDS.crabPincers,
  sockets: ['leftShoulder', 'rightShoulder'],
  tags: ['melee', 'crush'],
  stages: {
    bud: {
      visualKey: 'crab-pincers:bud',
      behavior: {
        kind: 'generic',
        periodTicks: 100,
        emit: {
          kind: 'applyAreaDamage',
          targeting: 'nearest',
          radius: 50,
          damage: 5,
        },
      },
    },
    adapted: {
      visualKey: 'crab-pincers:adapted',
      behavior: {
        kind: 'generic',
        periodTicks: 75,
        emit: {
          kind: 'applyAreaDamage',
          targeting: 'nearest',
          radius: 65,
          damage: 8,
        },
      },
    },
  },
};

const ARMADILLO_GREAVES: TraitDefinition = {
  id: TRAIT_IDS.armadilloGreaves,
  sockets: ['back'],
  tags: ['defensive', 'knockback'],
  stages: {
    bud: {
      visualKey: 'armadillo-greaves:bud',
      behavior: {
        kind: 'generic',
        periodTicks: 140,
        emit: {
          kind: 'areaKnockback',
          targeting: 'none',
          radius: 70,
          strength: 6,
        },
      },
    },
    adapted: {
      visualKey: 'armadillo-greaves:adapted',
      behavior: {
        kind: 'generic',
        periodTicks: 100,
        emit: {
          kind: 'areaKnockback',
          targeting: 'none',
          radius: 90,
          strength: 10,
        },
      },
    },
  },
};

const METEOR_MAULER: EvolutionDefinition = {
  id: EVOLUTION_IDS.meteorMauler,
  ingredients: [TRAIT_IDS.crabPincers, TRAIT_IDS.armadilloGreaves],
  occupiedSockets: ['back', 'leftShoulder', 'rightShoulder'],
  visualKey: 'meteor-mauler:mythic',
  behavior: {
    kind: 'generic',
    periodTicks: 90,
    emit: {
      kind: 'applyAreaDamage',
      targeting: 'nearest',
      radius: 100,
      damage: 20,
    },
  },
};

/* ────────────────────────────────────────────────────────────────────────
 * Royal Stinkcloud pair: skunk-brush + monarch-brood
 * ──────────────────────────────────────────────────────────────────────── */

const SKUNK_BRUSH: TraitDefinition = {
  id: TRAIT_IDS.skunkBrush,
  sockets: ['tail'],
  tags: ['zone', 'debuff'],
  stages: {
    bud: {
      visualKey: 'skunk-brush:bud',
      behavior: {
        kind: 'generic',
        periodTicks: 160,
        emit: {
          kind: 'spawnZone',
          targeting: 'none',
          radius: 70,
          amount: 2,
          durationTicks: 120,
          intervalTicks: 30,
          tag: 'stink-cloud',
        },
      },
    },
    adapted: {
      visualKey: 'skunk-brush:adapted',
      behavior: {
        kind: 'generic',
        periodTicks: 120,
        emit: {
          kind: 'spawnZone',
          targeting: 'none',
          radius: 95,
          amount: 4,
          durationTicks: 140,
          intervalTicks: 24,
          tag: 'stink-cloud',
        },
      },
    },
  },
};

const MONARCH_BROOD: TraitDefinition = {
  id: TRAIT_IDS.monarchBrood,
  sockets: ['bodyOrbit'],
  tags: ['companion', 'orbit', 'contact'],
  stages: {
    bud: {
      visualKey: 'monarch-brood:bud',
      behavior: {
        // A slower, wider outer ring than Firefly Colony: Monarch is a light
        // companion attack, not a second high-DPS orbit swarm.
        kind: 'periodicBurst',
        periodTicks: 60,
        emit: {
          kind: 'orbitingDamage',
          targeting: 'none',
          count: 2,
          damage: 2,
          speed: (Math.PI * 2) / 180,
          radius: 72,
          range: 14,
          facing: Math.PI / 4,
        },
      },
    },
    adapted: {
      visualKey: 'monarch-brood:adapted',
      behavior: {
        kind: 'periodicBurst',
        periodTicks: 45,
        emit: {
          kind: 'orbitingDamage',
          targeting: 'none',
          count: 3,
          damage: 3,
          speed: (Math.PI * 2) / 150,
          radius: 84,
          range: 16,
          facing: Math.PI / 4,
        },
      },
    },
  },
};

const ROYAL_STINKCLOUD: EvolutionDefinition = {
  id: EVOLUTION_IDS.royalStinkcloud,
  ingredients: [TRAIT_IDS.skunkBrush, TRAIT_IDS.monarchBrood],
  occupiedSockets: ['tail', 'bodyOrbit'],
  visualKey: 'royal-stinkcloud:mythic',
  behavior: {
    kind: 'generic',
    periodTicks: 140,
    emit: {
      kind: 'spawnZone',
      targeting: 'none',
      radius: 110,
      amount: 6,
      durationTicks: 160,
      intervalTicks: 18,
      tag: 'royal-stink',
    },
  },
};

/* ────────────────────────────────────────────────────────────────────────
 * Catalog assembly
 * ──────────────────────────────────────────────────────────────────────── */

export const CATALOG: Catalog = {
  traits: [
    PORCUPINE_QUILLS,
    PUFFER_POUCH,
    ELECTRIC_EEL_COIL,
    FIREFLY_COLONY,
    MANTIS_SCYTHES,
    GECKO_PADS,
    OWL_PINIONS,
    BAT_EARS,
    CRAB_PINCERS,
    ARMADILLO_GREAVES,
    SKUNK_BRUSH,
    MONARCH_BROOD,
  ],
  evolutions: [
    THORNSTORM_MANTLE,
    THUNDERBUG_DYNAMO,
    RAZORSTEP_CHIMERA,
    MIDNIGHT_RADAR,
    METEOR_MAULER,
    ROYAL_STINKCLOUD,
  ],
};
