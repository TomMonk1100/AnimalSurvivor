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
] as const);

export type GregAttachmentVisualKey = (typeof GREG_ATTACHMENT_VISUAL_KEYS)[number];
export type GregAttachmentStage = 'bud' | 'adapted' | 'mythic';
export type GregAttachmentFamily = 'porcupine-quills' | 'puffer-pouch' | 'thornstorm-mantle';
export type GregPrimitiveShape = 'sphere' | 'cone' | 'cylinder';
export type GregMaterialRole =
  | 'quillPrimary'
  | 'quillAccent'
  | 'pufferPrimary'
  | 'pufferAccent'
  | 'mythicThorn'
  | 'mythicGlow';

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
