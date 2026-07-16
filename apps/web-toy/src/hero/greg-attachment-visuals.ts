/**
 * Data-only primitive recipes for Greg's first visible upgrade path.
 *
 * Recipes are expressed in attachment-container local space. A renderer may
 * translate `shape` and `materialRole` into PlayCanvas entities/materials, but
 * this module deliberately imports no renderer, DOM, simulation, or entropy.
 */

export const GREG_ATTACHMENT_VISUAL_KEYS = Object.freeze([
  'porcupine-quills:bud',
  'porcupine-quills:adapted',
  'puffer-pouch:bud',
  'puffer-pouch:adapted',
  'thornstorm-mantle:mythic',
  'electric-eel-coil:bud',
  'electric-eel-coil:adapted',
  'firefly-colony:bud',
  'firefly-colony:adapted',
  'mantis-scythes:bud',
  'mantis-scythes:adapted',
  'gecko-pads:bud',
  'gecko-pads:adapted',
  'thunderbug-dynamo:mythic',
  'razorstep-chimera:mythic',
  'owl-pinions:bud',
  'owl-pinions:adapted',
  'bat-ears:bud',
  'bat-ears:adapted',
  'midnight-radar:mythic',
  'crab-pincers:bud',
  'crab-pincers:adapted',
  'armadillo-greaves:bud',
  'armadillo-greaves:adapted',
  'meteor-mauler:mythic',
  'skunk-brush:bud',
  'skunk-brush:adapted',
  'monarch-brood:bud',
  'monarch-brood:adapted',
  'royal-stinkcloud:mythic',
  'chimera-seam:mythic',
] as const);

export type GregAttachmentVisualKey = (typeof GREG_ATTACHMENT_VISUAL_KEYS)[number];
export type GregAttachmentStage = 'bud' | 'adapted' | 'mythic';
export type GregAttachmentFamily =
  | 'porcupine-quills'
  | 'puffer-pouch'
  | 'thornstorm-mantle'
  | 'electric-eel-coil'
  | 'firefly-colony'
  | 'mantis-scythes'
  | 'gecko-pads'
  | 'thunderbug-dynamo'
  | 'razorstep-chimera'
  | 'owl-pinions'
  | 'bat-ears'
  | 'midnight-radar'
  | 'crab-pincers'
  | 'armadillo-greaves'
  | 'meteor-mauler'
  | 'skunk-brush'
  | 'monarch-brood'
  | 'royal-stinkcloud'
  | 'chimera-seam';
export type GregPrimitiveShape = 'sphere' | 'cone' | 'cylinder';
export type GregMaterialRole =
  | 'quillPrimary'
  | 'quillAccent'
  | 'pufferPrimary'
  | 'pufferAccent'
  | 'mythicThorn'
  | 'mythicGlow'
  | 'coilPrimary'
  | 'coilGlow'
  | 'fireflyPrimary'
  | 'fireflyGlow'
  | 'thunderbugCore'
  | 'mantisPrimary'
  | 'mantisAccent'
  | 'geckoPrimary'
  | 'geckoAccent'
  | 'razorstepPrimary'
  | 'razorstepAccent'
  | 'owlPrimary'
  | 'owlAccent'
  | 'batPrimary'
  | 'batAccent'
  | 'crabPrimary'
  | 'crabAccent'
  | 'armadilloPrimary'
  | 'armadilloAccent'
  | 'skunkPrimary'
  | 'skunkAccent'
  | 'monarchPrimary'
  | 'monarchAccent'
  | 'launchMythicGlow';

export interface GregPrimitiveTransform {
  readonly position: readonly [x: number, y: number, z: number];
  readonly euler: readonly [x: number, y: number, z: number];
  readonly scale: readonly [x: number, y: number, z: number];
}

export interface GregPrimitivePart {
  /** Stable within its recipe; suitable for renderer-side entity reuse. */
  readonly id: string;
  readonly shape: GregPrimitiveShape;
  readonly materialRole: GregMaterialRole;
  readonly transform: GregPrimitiveTransform;
}

export interface GregAttachmentVisualRecipe {
  readonly key: GregAttachmentVisualKey;
  readonly family: GregAttachmentFamily;
  readonly stage: GregAttachmentStage;
  readonly parts: readonly GregPrimitivePart[];
}

const SHAPES: readonly GregPrimitiveShape[] = ['sphere', 'cone', 'cylinder'];
const MATERIAL_ROLES: readonly GregMaterialRole[] = [
  'quillPrimary', 'quillAccent', 'pufferPrimary', 'pufferAccent', 'mythicThorn', 'mythicGlow',
  'coilPrimary', 'coilGlow', 'fireflyPrimary', 'fireflyGlow', 'thunderbugCore',
  'mantisPrimary', 'mantisAccent', 'geckoPrimary', 'geckoAccent',
  'razorstepPrimary', 'razorstepAccent', 'owlPrimary', 'owlAccent',
  'batPrimary', 'batAccent', 'crabPrimary', 'crabAccent',
  'armadilloPrimary', 'armadilloAccent', 'skunkPrimary', 'skunkAccent',
  'monarchPrimary', 'monarchAccent', 'launchMythicGlow',
];

function transform(
  position: readonly [number, number, number],
  euler: readonly [number, number, number],
  scale: readonly [number, number, number],
): GregPrimitiveTransform {
  return { position, euler, scale };
}

function part(
  id: string,
  shape: GregPrimitiveShape,
  materialRole: GregMaterialRole,
  position: readonly [number, number, number],
  euler: readonly [number, number, number],
  scale: readonly [number, number, number],
): GregPrimitivePart {
  return { id, shape, materialRole, transform: transform(position, euler, scale) };
}

const RAW_RECIPES: readonly GregAttachmentVisualRecipe[] = [
  {
    key: 'porcupine-quills:bud', family: 'porcupine-quills', stage: 'bud', parts: [
      part('quill-far-left', 'cone', 'quillPrimary', [-0.44, 0.35, 0.08], [55, 0, 28], [0.16, 1, 0.16]),
      part('quill-left', 'cone', 'quillPrimary', [-0.22, 0.35, 0], [55, 0, 14], [0.16, 1, 0.16]),
      part('quill-centre', 'cone', 'quillAccent', [0, 0.35, -0.08], [55, 0, 0], [0.18, 1.08, 0.18]),
      part('quill-right', 'cone', 'quillPrimary', [0.22, 0.35, 0], [55, 0, -14], [0.16, 1, 0.16]),
      part('quill-far-right', 'cone', 'quillPrimary', [0.44, 0.35, 0.08], [55, 0, -28], [0.16, 1, 0.16]),
    ],
  },
  {
    key: 'porcupine-quills:adapted', family: 'porcupine-quills', stage: 'adapted', parts: [
      part('quill-outer-left', 'cone', 'quillAccent', [-0.62, 0.36, 0.12], [58, 0, 40], [0.15, 1.05, 0.15]),
      part('quill-far-left', 'cone', 'quillPrimary', [-0.46, 0.4, 0.03], [58, 0, 29], [0.17, 1.2, 0.17]),
      part('quill-left', 'cone', 'quillPrimary', [-0.25, 0.43, -0.05], [58, 0, 15], [0.18, 1.3, 0.18]),
      part('quill-centre-back', 'cone', 'quillAccent', [0, 0.4, -0.24], [40, 0, 0], [0.16, 1.12, 0.16]),
      part('quill-centre', 'cone', 'quillAccent', [0, 0.47, -0.02], [58, 0, 0], [0.2, 1.42, 0.2]),
      part('quill-centre-front', 'cone', 'quillPrimary', [0, 0.4, 0.2], [72, 0, 0], [0.16, 1.12, 0.16]),
      part('quill-right', 'cone', 'quillPrimary', [0.25, 0.43, -0.05], [58, 0, -15], [0.18, 1.3, 0.18]),
      part('quill-far-right', 'cone', 'quillPrimary', [0.46, 0.4, 0.03], [58, 0, -29], [0.17, 1.2, 0.17]),
      part('quill-outer-right', 'cone', 'quillAccent', [0.62, 0.36, 0.12], [58, 0, -40], [0.15, 1.05, 0.15]),
    ],
  },
  {
    key: 'puffer-pouch:bud', family: 'puffer-pouch', stage: 'bud', parts: [
      part('pouch', 'sphere', 'pufferPrimary', [0, 0.28, 0.72], [0, 0, 0], [0.72, 0.5, 0.78]),
      part('button', 'sphere', 'pufferAccent', [0, 0.28, 1.46], [0, 0, 0], [0.13, 0.13, 0.08]),
    ],
  },
  {
    key: 'puffer-pouch:adapted', family: 'puffer-pouch', stage: 'adapted', parts: [
      part('pouch', 'sphere', 'pufferPrimary', [0, 0.3, 0.78], [0, 0, 0], [0.92, 0.66, 0.96]),
      part('button', 'sphere', 'pufferAccent', [0, 0.3, 1.7], [0, 0, 0], [0.16, 0.16, 0.1]),
      part('spike-top', 'cone', 'pufferAccent', [0, 0.92, 0.78], [0, 0, 0], [0.1, 0.34, 0.1]),
      part('spike-left', 'cone', 'pufferAccent', [-0.82, 0.34, 0.78], [0, 0, -78], [0.1, 0.34, 0.1]),
      part('spike-right', 'cone', 'pufferAccent', [0.82, 0.34, 0.78], [0, 0, 78], [0.1, 0.34, 0.1]),
    ],
  },
  {
    key: 'electric-eel-coil:bud', family: 'electric-eel-coil', stage: 'bud', parts: [
      part('coil-base', 'cylinder', 'coilPrimary', [0, 0.08, -0.14], [0, 0, 90], [0.18, 0.5, 0.18]),
      part('coil-loop-left', 'cylinder', 'coilPrimary', [-0.18, 0.08, -0.04], [90, 0, 0], [0.22, 0.05, 0.22]),
      part('coil-glow', 'sphere', 'coilGlow', [0.15, 0.18, 0.02], [0, 0, 0], [0.12, 0.12, 0.12]),
    ],
  },
  {
    key: 'electric-eel-coil:adapted', family: 'electric-eel-coil', stage: 'adapted', parts: [
      part('coil-base', 'cylinder', 'coilPrimary', [0, 0.08, -0.14], [0, 0, 90], [0.22, 0.62, 0.22]),
      part('coil-loop-left', 'cylinder', 'coilPrimary', [-0.24, 0.09, -0.04], [90, 0, 0], [0.28, 0.05, 0.28]),
      part('coil-loop-right', 'cylinder', 'coilPrimary', [0.24, 0.09, -0.04], [90, 0, 0], [0.28, 0.05, 0.28]),
      part('coil-glow-left', 'sphere', 'coilGlow', [-0.32, 0.2, 0.03], [0, 0, 0], [0.13, 0.13, 0.13]),
      part('coil-glow-right', 'sphere', 'coilGlow', [0.32, 0.2, 0.03], [0, 0, 0], [0.13, 0.13, 0.13]),
    ],
  },
  {
    key: 'firefly-colony:bud', family: 'firefly-colony', stage: 'bud', parts: [
      part('lantern-core', 'sphere', 'fireflyPrimary', [0, 0.18, 0], [0, 0, 0], [0.2, 0.2, 0.2]),
      part('spark-left', 'sphere', 'fireflyGlow', [-0.42, 0.26, 0.08], [0, 0, 0], [0.11, 0.11, 0.11]),
      part('spark-right', 'sphere', 'fireflyGlow', [0.42, 0.26, -0.08], [0, 0, 0], [0.11, 0.11, 0.11]),
    ],
  },
  {
    key: 'firefly-colony:adapted', family: 'firefly-colony', stage: 'adapted', parts: [
      part('lantern-core', 'sphere', 'fireflyPrimary', [0, 0.2, 0], [0, 0, 0], [0.26, 0.26, 0.26]),
      part('spark-north', 'sphere', 'fireflyGlow', [0, 0.31, -0.48], [0, 0, 0], [0.12, 0.12, 0.12]),
      part('spark-east', 'sphere', 'fireflyGlow', [0.48, 0.27, 0], [0, 0, 0], [0.12, 0.12, 0.12]),
      part('spark-south', 'sphere', 'fireflyGlow', [0, 0.31, 0.48], [0, 0, 0], [0.12, 0.12, 0.12]),
      part('spark-west', 'sphere', 'fireflyGlow', [-0.48, 0.27, 0], [0, 0, 0], [0.12, 0.12, 0.12]),
    ],
  },
  {
    key: 'mantis-scythes:bud', family: 'mantis-scythes', stage: 'bud', parts: [
      part('scythe-hilt', 'cylinder', 'mantisPrimary', [0, 0.08, 0], [0, 0, 76], [0.1, 0.42, 0.1]),
      part('scythe-blade', 'cone', 'mantisAccent', [0.24, 0.18, 0], [0, 0, -72], [0.08, 0.52, 0.08]),
    ],
  },
  {
    key: 'mantis-scythes:adapted', family: 'mantis-scythes', stage: 'adapted', parts: [
      part('scythe-hilt', 'cylinder', 'mantisPrimary', [0, 0.08, 0], [0, 0, 76], [0.13, 0.56, 0.13]),
      part('scythe-blade-upper', 'cone', 'mantisAccent', [0.3, 0.22, -0.05], [0, 0, -72], [0.1, 0.68, 0.1]),
      part('scythe-blade-lower', 'cone', 'mantisAccent', [0.2, 0.06, 0.13], [0, 0, -47], [0.08, 0.5, 0.08]),
      part('scythe-rivet', 'sphere', 'mantisPrimary', [-0.07, 0.12, 0], [0, 0, 0], [0.13, 0.13, 0.13]),
    ],
  },
  {
    key: 'gecko-pads:bud', family: 'gecko-pads', stage: 'bud', parts: [
      part('pad-plate', 'sphere', 'geckoPrimary', [0, 0.08, 0], [0, 0, 0], [0.34, 0.13, 0.46]),
      part('pad-band', 'cylinder', 'geckoAccent', [0, 0.13, -0.08], [0, 0, 90], [0.08, 0.34, 0.08]),
      part('toe-glow', 'sphere', 'geckoAccent', [0.16, 0.12, 0.26], [0, 0, 0], [0.11, 0.08, 0.11]),
    ],
  },
  {
    key: 'gecko-pads:adapted', family: 'gecko-pads', stage: 'adapted', parts: [
      part('pad-plate', 'sphere', 'geckoPrimary', [0, 0.08, 0], [0, 0, 0], [0.46, 0.15, 0.62]),
      part('pad-band', 'cylinder', 'geckoAccent', [0, 0.14, -0.08], [0, 0, 90], [0.1, 0.46, 0.1]),
      part('toe-left', 'sphere', 'geckoAccent', [-0.24, 0.13, 0.3], [0, 0, 0], [0.12, 0.09, 0.12]),
      part('toe-centre', 'sphere', 'geckoAccent', [0, 0.15, 0.38], [0, 0, 0], [0.13, 0.09, 0.13]),
      part('toe-right', 'sphere', 'geckoAccent', [0.24, 0.13, 0.3], [0, 0, 0], [0.12, 0.09, 0.12]),
    ],
  },
  {
    key: 'thunderbug-dynamo:mythic', family: 'thunderbug-dynamo', stage: 'mythic', parts: [
      part('dynamo-core', 'sphere', 'thunderbugCore', [0, 0.15, 0], [0, 0, 0], [0.32, 0.32, 0.32]),
      part('dynamo-ring', 'cylinder', 'coilPrimary', [0, 0.14, 0], [90, 0, 0], [0.48, 0.05, 0.48]),
      part('bolt-left', 'cone', 'coilGlow', [-0.42, 0.22, 0], [0, 0, 82], [0.08, 0.42, 0.08]),
      part('bolt-right', 'cone', 'coilGlow', [0.42, 0.22, 0], [0, 0, -82], [0.08, 0.42, 0.08]),
      part('dynamo-spark', 'sphere', 'fireflyGlow', [0, 0.5, 0], [0, 0, 0], [0.12, 0.12, 0.12]),
    ],
  },
  {
    key: 'thornstorm-mantle:mythic', family: 'thornstorm-mantle', stage: 'mythic', parts: [
      part('mantle-core', 'sphere', 'mythicGlow', [0, 0.04, 0], [0, 0, 0], [0.32, 0.12, 0.27]),
      part('thorn-north', 'cone', 'mythicThorn', [0, 0.15, -0.08], [-12, 0, 0], [0.09, 0.55, 0.09]),
      part('thorn-north-east', 'cone', 'mythicThorn', [0.2, 0.09, -0.04], [-8, 0, 30], [0.075, 0.44, 0.075]),
      part('thorn-east', 'cone', 'mythicThorn', [0.3, 0.02, 0.04], [6, 0, 63], [0.065, 0.36, 0.065]),
      part('thorn-south-east', 'cone', 'mythicThorn', [0.18, 0.05, 0.16], [22, 0, 38], [0.07, 0.4, 0.07]),
      part('thorn-south', 'cone', 'mythicThorn', [0, 0.08, 0.2], [28, 0, 0], [0.075, 0.44, 0.075]),
      part('thorn-south-west', 'cone', 'mythicThorn', [-0.18, 0.05, 0.16], [22, 0, -38], [0.07, 0.4, 0.07]),
      part('thorn-west', 'cone', 'mythicThorn', [-0.3, 0.02, 0.04], [6, 0, -63], [0.065, 0.36, 0.065]),
      part('thorn-north-west', 'cone', 'mythicThorn', [-0.2, 0.09, -0.04], [-8, 0, -30], [0.075, 0.44, 0.075]),
      part('glow-rivet-left', 'cylinder', 'mythicGlow', [-0.13, 0.12, 0.08], [90, 0, 0], [0.035, 0.025, 0.035]),
      part('glow-rivet-right', 'cylinder', 'mythicGlow', [0.13, 0.12, 0.08], [90, 0, 0], [0.035, 0.025, 0.035]),
    ],
  },
  {
    // This combined form mounts at the left shoulder while the projector
    // reserves both shoulders, so its bridge and paired pads read as one item.
    key: 'razorstep-chimera:mythic', family: 'razorstep-chimera', stage: 'mythic', parts: [
      part('scythe-bridge', 'cylinder', 'razorstepPrimary', [0.72, 0.15, 0], [0, 0, 90], [0.13, 1.46, 0.13]),
      part('left-pad', 'sphere', 'geckoPrimary', [0.02, 0.08, 0.06], [0, 0, 0], [0.38, 0.14, 0.5]),
      part('right-pad', 'sphere', 'geckoPrimary', [1.42, 0.08, 0.06], [0, 0, 0], [0.38, 0.14, 0.5]),
      part('left-blade', 'cone', 'razorstepAccent', [0.14, 0.34, -0.04], [0, 0, -72], [0.11, 0.74, 0.11]),
      part('right-blade', 'cone', 'razorstepAccent', [1.3, 0.34, -0.04], [0, 0, 72], [0.11, 0.74, 0.11]),
      part('left-rivet', 'sphere', 'razorstepPrimary', [-0.02, 0.18, 0], [0, 0, 0], [0.14, 0.14, 0.14]),
      part('right-rivet', 'sphere', 'razorstepPrimary', [1.46, 0.18, 0], [0, 0, 0], [0.14, 0.14, 0.14]),
      part('trail-core', 'sphere', 'geckoAccent', [0.72, 0.3, 0.1], [0, 0, 0], [0.16, 0.16, 0.16]),
    ],
  },
  {
    key: 'owl-pinions:bud', family: 'owl-pinions', stage: 'bud', parts: [
      part('owl-wing-left', 'cone', 'owlPrimary', [-0.28, 0.2, 0], [0, 0, -32], [0.18, 0.7, 0.18]),
      part('owl-wing-right', 'cone', 'owlPrimary', [0.28, 0.2, 0], [0, 0, 32], [0.18, 0.7, 0.18]),
      part('owl-feather', 'sphere', 'owlAccent', [0, 0.28, -0.18], [0, 0, 0], [0.2, 0.2, 0.2]),
    ],
  },
  {
    key: 'owl-pinions:adapted', family: 'owl-pinions', stage: 'adapted', parts: [
      part('owl-wing-left', 'cone', 'owlPrimary', [-0.4, 0.24, 0], [0, 0, -38], [0.22, 0.96, 0.22]),
      part('owl-wing-right', 'cone', 'owlPrimary', [0.4, 0.24, 0], [0, 0, 38], [0.22, 0.96, 0.22]),
      part('owl-feather-left', 'cone', 'owlAccent', [-0.2, 0.36, -0.16], [0, 0, -18], [0.12, 0.54, 0.12]),
      part('owl-feather-right', 'cone', 'owlAccent', [0.2, 0.36, -0.16], [0, 0, 18], [0.12, 0.54, 0.12]),
    ],
  },
  {
    key: 'bat-ears:bud', family: 'bat-ears', stage: 'bud', parts: [
      part('bat-ear-left', 'cone', 'batPrimary', [-0.24, 0.42, 0.08], [0, 0, -18], [0.14, 0.48, 0.14]),
      part('bat-ear-right', 'cone', 'batPrimary', [0.24, 0.42, 0.08], [0, 0, 18], [0.14, 0.48, 0.14]),
      part('bat-radar', 'sphere', 'batAccent', [0, 0.2, 0.22], [0, 0, 0], [0.1, 0.1, 0.1]),
    ],
  },
  {
    key: 'bat-ears:adapted', family: 'bat-ears', stage: 'adapted', parts: [
      part('bat-ear-left', 'cone', 'batPrimary', [-0.3, 0.5, 0.08], [0, 0, -22], [0.18, 0.7, 0.18]),
      part('bat-ear-right', 'cone', 'batPrimary', [0.3, 0.5, 0.08], [0, 0, 22], [0.18, 0.7, 0.18]),
      part('bat-radar-left', 'sphere', 'batAccent', [-0.18, 0.25, 0.28], [0, 0, 0], [0.12, 0.12, 0.12]),
      part('bat-radar-right', 'sphere', 'batAccent', [0.18, 0.25, 0.28], [0, 0, 0], [0.12, 0.12, 0.12]),
    ],
  },
  {
    key: 'midnight-radar:mythic', family: 'midnight-radar', stage: 'mythic', parts: [
      part('radar-crown', 'cylinder', 'launchMythicGlow', [0, 0.46, 0], [0, 0, 0], [0.34, 0.08, 0.34]),
      part('radar-wing-left', 'cone', 'owlPrimary', [-0.36, 0.26, 0], [0, 0, -42], [0.2, 1.05, 0.2]),
      part('radar-wing-right', 'cone', 'owlPrimary', [0.36, 0.26, 0], [0, 0, 42], [0.2, 1.05, 0.2]),
      part('radar-ear-left', 'cone', 'batAccent', [-0.22, 0.55, 0.1], [0, 0, -24], [0.12, 0.68, 0.12]),
      part('radar-ear-right', 'cone', 'batAccent', [0.22, 0.55, 0.1], [0, 0, 24], [0.12, 0.68, 0.12]),
    ],
  },
  {
    key: 'crab-pincers:bud', family: 'crab-pincers', stage: 'bud', parts: [
      part('crab-claw-left', 'sphere', 'crabPrimary', [-0.38, 0.1, 0.1], [0, 0, 0], [0.3, 0.24, 0.38]),
      part('crab-claw-right', 'sphere', 'crabPrimary', [0.38, 0.1, 0.1], [0, 0, 0], [0.3, 0.24, 0.38]),
      part('crab-tip', 'cone', 'crabAccent', [0, 0.26, 0.28], [0, 0, 0], [0.12, 0.34, 0.12]),
    ],
  },
  {
    key: 'crab-pincers:adapted', family: 'crab-pincers', stage: 'adapted', parts: [
      part('crab-claw-left', 'sphere', 'crabPrimary', [-0.5, 0.14, 0.1], [0, 0, 0], [0.42, 0.32, 0.52]),
      part('crab-claw-right', 'sphere', 'crabPrimary', [0.5, 0.14, 0.1], [0, 0, 0], [0.42, 0.32, 0.52]),
      part('crab-tip-left', 'cone', 'crabAccent', [-0.46, 0.34, 0.3], [0, 0, -12], [0.14, 0.5, 0.14]),
      part('crab-tip-right', 'cone', 'crabAccent', [0.46, 0.34, 0.3], [0, 0, 12], [0.14, 0.5, 0.14]),
    ],
  },
  {
    key: 'armadillo-greaves:bud', family: 'armadillo-greaves', stage: 'bud', parts: [
      part('greave-left', 'cylinder', 'armadilloPrimary', [-0.28, 0.1, -0.1], [0, 0, 0], [0.2, 0.38, 0.2]),
      part('greave-right', 'cylinder', 'armadilloPrimary', [0.28, 0.1, -0.1], [0, 0, 0], [0.2, 0.38, 0.2]),
      part('greave-rivet', 'sphere', 'armadilloAccent', [0, 0.3, -0.2], [0, 0, 0], [0.12, 0.12, 0.12]),
    ],
  },
  {
    key: 'armadillo-greaves:adapted', family: 'armadillo-greaves', stage: 'adapted', parts: [
      part('greave-left', 'cylinder', 'armadilloPrimary', [-0.32, 0.12, -0.1], [0, 0, 0], [0.28, 0.52, 0.28]),
      part('greave-right', 'cylinder', 'armadilloPrimary', [0.32, 0.12, -0.1], [0, 0, 0], [0.28, 0.52, 0.28]),
      part('greave-rivet-left', 'sphere', 'armadilloAccent', [-0.2, 0.38, -0.2], [0, 0, 0], [0.14, 0.14, 0.14]),
      part('greave-rivet-right', 'sphere', 'armadilloAccent', [0.2, 0.38, -0.2], [0, 0, 0], [0.14, 0.14, 0.14]),
    ],
  },
  {
    key: 'meteor-mauler:mythic', family: 'meteor-mauler', stage: 'mythic', parts: [
      part('meteor-core', 'sphere', 'launchMythicGlow', [0, 0.42, 0], [0, 0, 0], [0.28, 0.28, 0.28]),
      part('meteor-claw-left', 'sphere', 'crabPrimary', [-0.52, 0.16, 0.08], [0, 0, 0], [0.44, 0.34, 0.54]),
      part('meteor-claw-right', 'sphere', 'crabPrimary', [0.52, 0.16, 0.08], [0, 0, 0], [0.44, 0.34, 0.54]),
      part('meteor-greave-left', 'cylinder', 'armadilloAccent', [-0.28, 0.12, -0.22], [0, 0, 0], [0.26, 0.58, 0.26]),
      part('meteor-greave-right', 'cylinder', 'armadilloAccent', [0.28, 0.12, -0.22], [0, 0, 0], [0.26, 0.58, 0.26]),
    ],
  },
  {
    key: 'skunk-brush:bud', family: 'skunk-brush', stage: 'bud', parts: [
      part('skunk-brush', 'cone', 'skunkPrimary', [0, 0.18, -0.2], [90, 0, 0], [0.22, 0.7, 0.22]),
      part('skunk-stripe', 'cone', 'skunkAccent', [0, 0.22, -0.42], [90, 0, 0], [0.1, 0.36, 0.1]),
    ],
  },
  {
    key: 'skunk-brush:adapted', family: 'skunk-brush', stage: 'adapted', parts: [
      part('skunk-brush', 'cone', 'skunkPrimary', [0, 0.22, -0.28], [90, 0, 0], [0.3, 0.98, 0.3]),
      part('skunk-stripe', 'cone', 'skunkAccent', [0, 0.3, -0.62], [90, 0, 0], [0.14, 0.52, 0.14]),
      part('skunk-spark', 'sphere', 'launchMythicGlow', [0, 0.38, -0.86], [0, 0, 0], [0.13, 0.13, 0.13]),
    ],
  },
  {
    key: 'monarch-brood:bud', family: 'monarch-brood', stage: 'bud', parts: [
      part('monarch-left', 'sphere', 'monarchPrimary', [-0.34, 0.32, 0], [0, 0, 0], [0.16, 0.1, 0.24]),
      part('monarch-right', 'sphere', 'monarchPrimary', [0.34, 0.32, 0], [0, 0, 0], [0.16, 0.1, 0.24]),
      part('monarch-glow', 'sphere', 'monarchAccent', [0, 0.36, 0], [0, 0, 0], [0.08, 0.08, 0.08]),
    ],
  },
  {
    key: 'monarch-brood:adapted', family: 'monarch-brood', stage: 'adapted', parts: [
      part('monarch-north', 'sphere', 'monarchPrimary', [0, 0.42, -0.34], [0, 0, 0], [0.18, 0.12, 0.28]),
      part('monarch-east', 'sphere', 'monarchPrimary', [0.42, 0.34, 0], [0, 0, 0], [0.18, 0.12, 0.28]),
      part('monarch-south', 'sphere', 'monarchPrimary', [0, 0.42, 0.34], [0, 0, 0], [0.18, 0.12, 0.28]),
      part('monarch-west', 'sphere', 'monarchPrimary', [-0.42, 0.34, 0], [0, 0, 0], [0.18, 0.12, 0.28]),
      part('monarch-glow', 'sphere', 'monarchAccent', [0, 0.38, 0], [0, 0, 0], [0.1, 0.1, 0.1]),
    ],
  },
  {
    key: 'royal-stinkcloud:mythic', family: 'royal-stinkcloud', stage: 'mythic', parts: [
      part('royal-cloud', 'sphere', 'skunkPrimary', [0, 0.28, -0.08], [0, 0, 0], [0.62, 0.3, 0.62]),
      part('royal-stripe', 'cone', 'skunkAccent', [0, 0.58, -0.16], [0, 0, 0], [0.12, 0.42, 0.12]),
      part('royal-wing-left', 'sphere', 'monarchPrimary', [-0.48, 0.36, 0.06], [0, 0, 0], [0.22, 0.14, 0.34]),
      part('royal-wing-right', 'sphere', 'monarchPrimary', [0.48, 0.36, 0.06], [0, 0, 0], [0.22, 0.14, 0.34]),
      part('royal-glow', 'sphere', 'launchMythicGlow', [0, 0.48, 0.2], [0, 0, 0], [0.15, 0.15, 0.15]),
    ],
  },
  {
    // One reusable, renderer-only braid for every generated pair. Parent
    // attachments carry their own authored silhouettes; this makes the splice
    // itself legible without expanding the atlas to sixty-six mesh variants.
    key: 'chimera-seam:mythic', family: 'chimera-seam', stage: 'mythic', parts: [
      part('braid-primary', 'cylinder', 'mythicGlow', [-0.42, 0.18, 0], [0, 0, 62], [0.055, 0.56, 0.055]),
      part('braid-accent', 'cylinder', 'launchMythicGlow', [0.42, 0.18, 0], [0, 0, -62], [0.04, 0.5, 0.04]),
      part('splice-knot', 'sphere', 'mythicGlow', [0, 0.26, 0], [0, 0, 0], [0.14, 0.14, 0.14]),
      // These parts are scale-gated by the renderer-only temperament motion:
      // Echo/Apex use the ghost braid; only Gilded exposes its muted flecks.
      part('braid-echo', 'cylinder', 'launchMythicGlow', [0, 0.25, -0.08], [0, 0, 90], [0.025, 0.42, 0.025]),
      part('gilded-fleck-left', 'sphere', 'launchMythicGlow', [-0.18, 0.38, 0.04], [0, 0, 0], [0.045, 0.045, 0.045]),
      part('gilded-fleck-right', 'sphere', 'launchMythicGlow', [0.18, 0.38, 0.04], [0, 0, 0], [0.045, 0.045, 0.045]),
    ],
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteTriple(value: unknown): value is readonly [number, number, number] {
  return Array.isArray(value) && value.length === 3
    && value.every((component) => typeof component === 'number' && Number.isFinite(component));
}

/** Throws a path-specific error for malformed renderer recipe data. */
export function validateGregAttachmentVisualRecipe(value: unknown): asserts value is GregAttachmentVisualRecipe {
  if (!isRecord(value)) throw new Error('Greg visual recipe must be an object');
  if (!GREG_ATTACHMENT_VISUAL_KEYS.includes(value.key as GregAttachmentVisualKey)) {
    throw new Error(`Greg visual recipe has unknown key: ${String(value.key)}`);
  }
  const [expectedFamily, expectedStage] = (value.key as string).split(':');
  if (value.family !== expectedFamily) throw new Error(`${String(value.key)} family must match its key`);
  if (value.stage !== expectedStage) throw new Error(`${String(value.key)} stage must match its key`);
  if (!Array.isArray(value.parts) || value.parts.length === 0 || value.parts.length > 32) {
    throw new Error(`${String(value.key)} must contain 1..32 primitive parts`);
  }
  const ids = new Set<string>();
  value.parts.forEach((candidate, index) => {
    const path = `${String(value.key)}.parts[${index}]`;
    if (!isRecord(candidate)) throw new Error(`${path} must be an object`);
    if (typeof candidate.id !== 'string' || candidate.id.length === 0) throw new Error(`${path}.id must not be empty`);
    if (ids.has(candidate.id)) throw new Error(`${String(value.key)} contains duplicate part id: ${candidate.id}`);
    ids.add(candidate.id);
    if (!SHAPES.includes(candidate.shape as GregPrimitiveShape)) throw new Error(`${path} has unknown shape`);
    if (!MATERIAL_ROLES.includes(candidate.materialRole as GregMaterialRole)) throw new Error(`${path} has unknown material role`);
    if (!isRecord(candidate.transform)) throw new Error(`${path}.transform must be an object`);
    if (!isFiniteTriple(candidate.transform.position)) throw new Error(`${path}.transform.position must be three finite numbers`);
    if (!isFiniteTriple(candidate.transform.euler)) throw new Error(`${path}.transform.euler must be three finite numbers`);
    if (!isFiniteTriple(candidate.transform.scale) || candidate.transform.scale.some((axis) => axis <= 0)) {
      throw new Error(`${path}.transform.scale must be three positive finite numbers`);
    }
  });
}

function deepFreezeRecipe(recipe: GregAttachmentVisualRecipe): GregAttachmentVisualRecipe {
  for (const item of recipe.parts) {
    Object.freeze(item.transform.position);
    Object.freeze(item.transform.euler);
    Object.freeze(item.transform.scale);
    Object.freeze(item.transform);
    Object.freeze(item);
  }
  Object.freeze(recipe.parts);
  return Object.freeze(recipe);
}

const RECIPE_BY_KEY = new Map<GregAttachmentVisualKey, GregAttachmentVisualRecipe>();
for (const recipe of RAW_RECIPES) {
  validateGregAttachmentVisualRecipe(recipe);
  if (RECIPE_BY_KEY.has(recipe.key)) throw new Error(`Duplicate Greg visual recipe: ${recipe.key}`);
  RECIPE_BY_KEY.set(recipe.key, deepFreezeRecipe(recipe));
}
if (RECIPE_BY_KEY.size !== GREG_ATTACHMENT_VISUAL_KEYS.length) {
  throw new Error('Greg visual recipe registry does not cover every required key');
}

export function isGregAttachmentVisualKey(value: string): value is GregAttachmentVisualKey {
  return RECIPE_BY_KEY.has(value as GregAttachmentVisualKey);
}

export function getGregAttachmentVisualRecipe(key: string): GregAttachmentVisualRecipe {
  const recipe = RECIPE_BY_KEY.get(key as GregAttachmentVisualKey);
  if (recipe === undefined) throw new Error(`Unknown Greg attachment visual key: ${key}`);
  return recipe;
}
