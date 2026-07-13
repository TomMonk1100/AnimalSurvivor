import * as pc from 'playcanvas';
import type { BiomeId } from '@sim';
import { createInstancedCategoryBatch } from './instanced-category-batch';
import type { InstancedCategoryBatch, InstanceMatrices } from './instanced-category-batch';
import { WILDGUARD_GLADE_GROUND_URL } from './wildguard-ground-texture';

/**
 * Static, presentation-only forest clearing below the survival arena.
 *
 * The layout deliberately uses its own tiny deterministic generator instead
 * of simulation RNG. It is created once alongside the renderer and never
 * reads or writes simulation state, so an art pass cannot alter replay input,
 * fixed-tick ordering, or state hashes.
 */
export interface ForestClearingPresentation {
  dispose(): void;
}

export interface ForestDecoration {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly scaleZ: number;
  readonly rotationY: number;
}

export interface ForestClearingLayout {
  /** Irregular low-poly meadow shapes that establish the playable clearing. */
  readonly clearingLayers: readonly ForestDecoration[];
  readonly mossPatches: readonly ForestDecoration[];
  readonly grassTufts: readonly ForestDecoration[];
  /** Small radial flower stars that break up the lawn without reading as UI. */
  readonly flowerPatches: readonly ForestDecoration[];
  /** Broad fern fronds used to frame, never fill, the fighting space. */
  readonly ferns: readonly ForestDecoration[];
  /** Tiny warm leaf clusters, kept flat enough to remain environmental texture. */
  readonly leafLitter: readonly ForestDecoration[];
  readonly canopies: readonly ForestDecoration[];
  /** Tapered trunks beneath selected canopies; decorative only. */
  readonly treeBases: readonly ForestDecoration[];
  readonly stones: readonly ForestDecoration[];
  readonly roots: readonly ForestDecoration[];
  /** Warm, very low-opacity pools kept away from the exact spawn point. */
  readonly lightPools: readonly ForestDecoration[];
  readonly landmarks: readonly ForestDecoration[];
}

/** A reserved, decoration-light space around the default run start. */
export const FOREST_CLEARING_RADIUS = 210;
export const FOREST_CLEARING_LAYER_COUNT = 5;
export const FOREST_MOSS_PATCH_COUNT = 72;
export const FOREST_GRASS_TUFT_COUNT = 156;
export const FOREST_FLOWER_PATCH_COUNT = 96;
export const FOREST_FERN_COUNT = 68;
export const FOREST_LEAF_LITTER_COUNT = 132;
export const FOREST_CANOPY_COUNT = 112;
export const FOREST_TREE_BASE_COUNT = Math.ceil(FOREST_CANOPY_COUNT / 3);
export const FOREST_STONE_COUNT = 76;
export const FOREST_ROOT_COUNT = 58;
export const FOREST_LIGHT_POOL_COUNT = 11;
export const SALTWIND_RUIN_COUNT = 12;

const VISUAL_SEED = 0x57_49_4c_44;
/** Saltwind uses a stable alternate arrangement so its arena is not a recolor. */
export const SALTWIND_CLEARING_VISUAL_SEED = 0x5a_17_6d;
// The floor-facing detail sits close to the ground; taller scenery is confined
// to the clearing rim and stays presentation-only. None of these values have a
// collider, script, or simulation representation.
const FLOOR_HEIGHT = -0.72;
const GROUND_DECAL_HEIGHT = -0.708;
const CLEARING_BASE_HEIGHT = -0.703;
const CLEARING_INNER_HEIGHT = -0.696;
const MOSS_HEIGHT = -0.69;
const LIGHT_POOL_HEIGHT = -0.684;
const LEAF_LITTER_HEIGHT = -0.679;
const GRASS_HEIGHT = -0.675;
const FLOWER_HEIGHT = -0.666;
const FERN_HEIGHT = -0.662;
const CANOPY_SHADOW_HEIGHT = GROUND_DECAL_HEIGHT;
const CANOPY_HEIGHT = -0.69;
const TREE_BASE_HEIGHT = -0.705;
const ROOT_HEIGHT = -0.7;
const STONE_HEIGHT = -0.704;
const DEFAULT_WORLD_AREA = 2_000 * 2_000;

/** A very small local PRNG: visual placement only, never simulation entropy. */
class VisualRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 0x1_0000_0000;
  }

  between(minimum: number, maximum: number): number {
    return minimum + (maximum - minimum) * this.next();
  }
}

function requirePositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be finite and > 0 (received ${value})`);
  }
}

function scaledCount(baseCount: number, worldWidth: number, worldHeight: number): number {
  const areaRatio = Math.min(1, (worldWidth * worldHeight) / DEFAULT_WORLD_AREA);
  return Math.max(1, Math.round(baseCount * Math.max(0.08, areaRatio)));
}

function clearingRadius(worldWidth: number, worldHeight: number): number {
  return Math.min(FOREST_CLEARING_RADIUS, Math.min(worldWidth, worldHeight) * 0.22);
}

function scenePosition(rng: VisualRng, halfWidth: number, halfHeight: number): readonly [number, number] {
  return [rng.between(-halfWidth, halfWidth), rng.between(-halfHeight, halfHeight)];
}

function outsideClearingPosition(
  rng: VisualRng,
  halfWidth: number,
  halfHeight: number,
  radius: number,
): readonly [number, number] {
  const radiusSquared = radius * radius;
  for (let attempt = 0; attempt < 32; attempt++) {
    const [x, z] = scenePosition(rng, halfWidth, halfHeight);
    if (x * x + z * z >= radiusSquared) return [x, z];
  }

  // Extremely narrow test worlds can leave very little area outside the
  // clearing. Falling back to a deterministic edge point keeps the generator
  // total and all transforms inside the scene bounds.
  const x = (rng.next() < 0.5 ? -1 : 1) * halfWidth * 0.92;
  return [x, rng.between(-halfHeight * 0.92, halfHeight * 0.92)];
}

/**
 * Chooses a point in a clearing annulus without a retry loop. The square-root
 * keeps the distribution even over area, rather than clumping at the centre.
 */
function insideClearingAnnulus(
  rng: VisualRng,
  minimumRadius: number,
  maximumRadius: number,
): readonly [number, number] {
  const angle = rng.between(0, Math.PI * 2);
  const minimumSquared = minimumRadius * minimumRadius;
  const maximumSquared = maximumRadius * maximumRadius;
  const distance = Math.sqrt(rng.between(minimumSquared, maximumSquared));
  return [Math.cos(angle) * distance, Math.sin(angle) * distance];
}

function createDecoration(
  x: number,
  y: number,
  z: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
  rotationY: number,
): ForestDecoration {
  return { x, y, z, scaleX, scaleY, scaleZ, rotationY };
}

/**
 * Produces a repeatable set of low-profile forest-floor details in centered
 * renderer space. The only deliberate open area is the starting clearing;
 * all art remains decorative and has no physics or collision representation.
 */
export function createForestClearingLayout(
  worldWidth: number,
  worldHeight: number,
  seed = VISUAL_SEED,
  biomeId: BiomeId = 'forest',
): ForestClearingLayout {
  requirePositiveFinite('worldWidth', worldWidth);
  requirePositiveFinite('worldHeight', worldHeight);
  const halfWidth = worldWidth * 0.5;
  const halfHeight = worldHeight * 0.5;
  const radius = clearingRadius(worldWidth, worldHeight);
  const rng = new VisualRng(seed);
  const clearingLayers: ForestDecoration[] = [];
  const mossPatches: ForestDecoration[] = [];
  const grassTufts: ForestDecoration[] = [];
  const flowerPatches: ForestDecoration[] = [];
  const ferns: ForestDecoration[] = [];
  const leafLitter: ForestDecoration[] = [];
  const canopies: ForestDecoration[] = [];
  const treeBases: ForestDecoration[] = [];
  const stones: ForestDecoration[] = [];
  const roots: ForestDecoration[] = [];
  const lightPools: ForestDecoration[] = [];
  const landmarks: ForestDecoration[] = [];

  // Five overlapping, deliberately asymmetric meadow silhouettes make a
  // usable open glade without looking like a circular survival arena. Their
  // surfaces remain static visual dressing: they never affect pathing.
  const clearingScaleProfiles = [
    [1.32, 0.88],
    [1.06, 0.72],
    [0.88, 0.62],
    [0.66, 0.44],
    [0.43, 0.29],
  ] as const;
  for (let index = 0; index < FOREST_CLEARING_LAYER_COUNT; index++) {
    const [scaleX, scaleZ] = clearingScaleProfiles[index]!;
    const [x, z] = index === 0
      ? [0, 0] as const
      : insideClearingAnnulus(rng, 0, radius * 0.13);
    clearingLayers.push(createDecoration(
      x,
      index < 2 ? CLEARING_BASE_HEIGHT : CLEARING_INNER_HEIGHT,
      z,
      radius * 2 * scaleX,
      1,
      radius * 2 * scaleZ,
      rng.between(0, Math.PI * 2),
    ));
  }

  for (let index = 0; index < scaledCount(FOREST_MOSS_PATCH_COUNT, worldWidth, worldHeight); index++) {
    const [x, z] = scenePosition(rng, halfWidth, halfHeight);
    mossPatches.push(createDecoration(
      x,
      MOSS_HEIGHT,
      z,
      rng.between(22, 76),
      1,
      rng.between(18, 60),
      rng.between(0, Math.PI * 2),
    ));
  }

  for (let index = 0; index < scaledCount(FOREST_GRASS_TUFT_COUNT, worldWidth, worldHeight); index++) {
    const [x, z] = outsideClearingPosition(rng, halfWidth, halfHeight, radius * 0.25);
    grassTufts.push(createDecoration(
      x,
      GRASS_HEIGHT,
      z,
      rng.between(2.5, 7.5),
      rng.between(0.28, 0.58),
      rng.between(2, 6),
      rng.between(0, Math.PI * 2),
    ));
  }

  // Flowers and ferns establish a readable near/mid-ground rhythm. They hug
  // the meadow rim and never populate the hero's immediate combat pocket.
  for (let index = 0; index < scaledCount(FOREST_FLOWER_PATCH_COUNT, worldWidth, worldHeight); index++) {
    const [x, z] = outsideClearingPosition(rng, halfWidth, halfHeight, radius * 0.34);
    flowerPatches.push(createDecoration(
      x,
      FLOWER_HEIGHT,
      z,
      rng.between(1.1, 2.8),
      rng.between(0.34, 0.68),
      rng.between(1, 2.5),
      rng.between(0, Math.PI * 2),
    ));
  }

  for (let index = 0; index < scaledCount(FOREST_FERN_COUNT, worldWidth, worldHeight); index++) {
    const [x, z] = outsideClearingPosition(rng, halfWidth, halfHeight, radius * 0.46);
    ferns.push(createDecoration(
      x,
      FERN_HEIGHT,
      z,
      rng.between(3.2, 8.8),
      rng.between(0.38, 0.72),
      rng.between(2.8, 7.6),
      rng.between(0, Math.PI * 2),
    ));
  }

  for (let index = 0; index < scaledCount(FOREST_LEAF_LITTER_COUNT, worldWidth, worldHeight); index++) {
    const [x, z] = outsideClearingPosition(rng, halfWidth, halfHeight, radius * 0.2);
    leafLitter.push(createDecoration(
      x,
      LEAF_LITTER_HEIGHT,
      z,
      rng.between(2.2, 7),
      1,
      rng.between(1.4, 5.4),
      rng.between(0, Math.PI * 2),
    ));
  }

  for (let index = 0; index < scaledCount(FOREST_CANOPY_COUNT, worldWidth, worldHeight); index++) {
    const [x, z] = outsideClearingPosition(rng, halfWidth, halfHeight, radius);
    canopies.push(createDecoration(
      x,
      CANOPY_HEIGHT,
      z,
      rng.between(24, 54),
      rng.between(5.5, 12.5),
      rng.between(22, 50),
      rng.between(0, Math.PI * 2),
    ));
  }

  // A sparse tapered trunk below every third crown gives the outer forest a
  // genuine layered silhouette under the pitched camera. It remains outside
  // the opening clearing and has no collision representation.
  for (let index = 0; index < canopies.length; index += 3) {
    const canopy = canopies[index]!;
    treeBases.push(createDecoration(
      canopy.x,
      TREE_BASE_HEIGHT,
      canopy.z,
      Math.max(2.4, Math.min(7.5, canopy.scaleX * 0.17)),
      canopy.scaleY * rng.between(0.72, 0.92),
      Math.max(2.2, Math.min(7, canopy.scaleZ * 0.16)),
      canopy.rotationY,
    ));
  }

  for (let index = 0; index < scaledCount(FOREST_STONE_COUNT, worldWidth, worldHeight); index++) {
    const [x, z] = outsideClearingPosition(rng, halfWidth, halfHeight, radius * 0.62);
    stones.push(createDecoration(
      x,
      STONE_HEIGHT,
      z,
      rng.between(3.5, 8.5),
      rng.between(1.8, 4.8),
      rng.between(3, 7),
      rng.between(0, Math.PI * 2),
    ));
  }

  for (let index = 0; index < scaledCount(FOREST_LIGHT_POOL_COUNT, worldWidth, worldHeight); index++) {
    const [x, z] = insideClearingAnnulus(rng, radius * 0.25, radius * 0.82);
    lightPools.push(createDecoration(
      x,
      LIGHT_POOL_HEIGHT,
      z,
      rng.between(18, 42),
      1,
      rng.between(12, 32),
      rng.between(0, Math.PI * 2),
    ));
  }

  for (let index = 0; index < scaledCount(FOREST_ROOT_COUNT, worldWidth, worldHeight); index++) {
    const [x, z] = outsideClearingPosition(rng, halfWidth, halfHeight, radius * 0.72);
    roots.push(createDecoration(
      x,
      ROOT_HEIGHT,
      z,
      rng.between(11, 28),
      rng.between(0.36, 0.88),
      rng.between(1.6, 3.5),
      rng.between(0, Math.PI * 2),
    ));
  }

  if (biomeId === 'saltwind') {
    for (let index = 0; index < SALTWIND_RUIN_COUNT; index++) {
      const [x, z] = outsideClearingPosition(rng, halfWidth, halfHeight, radius * 1.12);
      landmarks.push(createDecoration(
        x,
        TREE_BASE_HEIGHT,
        z,
        rng.between(4, 9),
        rng.between(4.5, 11),
        rng.between(4, 10),
        rng.between(0, Math.PI * 2),
      ));
    }
  }

  return {
    clearingLayers,
    mossPatches,
    grassTufts,
    flowerPatches,
    ferns,
    leafLitter,
    canopies,
    treeBases,
    stones,
    roots,
    lightPools,
    landmarks,
  };
}

/**
 * Packs a static decoration list into the exact column-major transform layout
 * used by PlayCanvas instancing. It is exported for no-WebGL unit coverage.
 */
export function createForestInstanceMatrices(decorations: readonly ForestDecoration[]): InstanceMatrices {
  const matrices = new Float32Array(decorations.length * 16);
  for (let index = 0; index < decorations.length; index++) {
    const decoration = decorations[index]!;
    const offset = index * 16;
    const cosine = Math.cos(decoration.rotationY);
    const sine = Math.sin(decoration.rotationY);
    const negativeSine = sine === 0 ? 0 : -sine;
    matrices[offset] = cosine * decoration.scaleX;
    matrices[offset + 1] = 0;
    matrices[offset + 2] = negativeSine * decoration.scaleX;
    matrices[offset + 3] = 0;
    matrices[offset + 4] = 0;
    matrices[offset + 5] = decoration.scaleY;
    matrices[offset + 6] = 0;
    matrices[offset + 7] = 0;
    matrices[offset + 8] = sine * decoration.scaleZ;
    matrices[offset + 9] = 0;
    matrices[offset + 10] = cosine * decoration.scaleZ;
    matrices[offset + 11] = 0;
    matrices[offset + 12] = decoration.x;
    matrices[offset + 13] = decoration.y;
    matrices[offset + 14] = decoration.z;
    matrices[offset + 15] = 1;
  }
  return { count: decorations.length, matrices };
}

function createUnlitMaterial(color: pc.Color, opacity = 1): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.cull = pc.CULLFACE_NONE;
  material.diffuse.set(0, 0, 0);
  material.emissive.copy(color);
  material.opacity = opacity;
  if (opacity < 1) {
    material.blendType = pc.BLEND_NORMAL;
    material.depthWrite = false;
  }
  material.update();
  return material;
}

/**
 * Faceted scenery benefits from the scene's warm key light, but a little
 * emissive lift keeps it legible through the intentionally deep forest rim.
 */
function createDioramaMaterial(color: pc.Color): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = true;
  material.cull = pc.CULLFACE_NONE;
  material.diffuse.copy(color);
  material.emissive.set(color.r * 0.08, color.g * 0.08, color.b * 0.08);
  material.specular.set(0.025, 0.025, 0.02);
  material.gloss = 0.12;
  material.update();
  return material;
}

interface ClearingArtProfile {
  readonly floor: readonly [number, number, number];
  readonly clearingOuter: readonly [number, number, number];
  readonly clearingInner: readonly [number, number, number];
  readonly moss: readonly [number, number, number];
  readonly grass: readonly [number, number, number];
  readonly fern: readonly [number, number, number];
  readonly leafLitter: readonly [number, number, number];
  readonly flowerA: readonly [number, number, number];
  readonly flowerB: readonly [number, number, number];
  readonly flowerC: readonly [number, number, number];
  readonly canopyShadow: readonly [number, number, number];
  readonly canopy: readonly [number, number, number];
  readonly canopyHighlight: readonly [number, number, number];
  readonly treeBase: readonly [number, number, number];
  readonly stone: readonly [number, number, number];
  readonly stoneHighlight: readonly [number, number, number];
  readonly root: readonly [number, number, number];
  readonly lightPool: readonly [number, number, number];
  readonly landmark: readonly [number, number, number];
}

const CLEARING_ART: Readonly<Record<BiomeId, ClearingArtProfile>> = Object.freeze({
  forest: Object.freeze({
    // Keep the playable centre a step brighter than the forest rim. This
    // gives the storybook palette its sunny clearing without sacrificing the
    // dark silhouette that makes foes and projectiles readable at the edge.
    floor: [0.075, 0.18, 0.09] as const,
    clearingOuter: [0.17, 0.36, 0.13] as const,
    clearingInner: [0.28, 0.48, 0.18] as const,
    moss: [0.15, 0.32, 0.11] as const,
    grass: [0.34, 0.54, 0.18] as const,
    fern: [0.12, 0.35, 0.15] as const,
    leafLitter: [0.67, 0.33, 0.1] as const,
    flowerA: [0.98, 0.7, 0.22] as const,
    flowerB: [0.96, 0.38, 0.45] as const,
    flowerC: [0.88, 0.82, 0.56] as const,
    canopyShadow: [0.045, 0.12, 0.06] as const,
    canopy: [0.1, 0.28, 0.11] as const,
    canopyHighlight: [0.18, 0.39, 0.15] as const,
    treeBase: [0.32, 0.2, 0.065] as const,
    stone: [0.4, 0.47, 0.34] as const,
    stoneHighlight: [0.58, 0.62, 0.44] as const,
    root: [0.36, 0.24, 0.09] as const,
    lightPool: [0.95, 0.78, 0.38] as const,
    landmark: [0.45, 0.5, 0.36] as const,
  }),
  saltwind: Object.freeze({
    floor: [0.19, 0.105, 0.045] as const,
    clearingOuter: [0.33, 0.2, 0.08] as const,
    clearingInner: [0.45, 0.29, 0.1] as const,
    moss: [0.35, 0.21, 0.06] as const,
    grass: [0.61, 0.38, 0.1] as const,
    fern: [0.34, 0.24, 0.055] as const,
    leafLitter: [0.75, 0.36, 0.08] as const,
    flowerA: [1, 0.68, 0.18] as const,
    flowerB: [0.95, 0.37, 0.18] as const,
    flowerC: [0.95, 0.78, 0.4] as const,
    canopyShadow: [0.12, 0.065, 0.025] as const,
    canopy: [0.22, 0.12, 0.035] as const,
    canopyHighlight: [0.39, 0.23, 0.06] as const,
    treeBase: [0.33, 0.16, 0.045] as const,
    stone: [0.48, 0.39, 0.24] as const,
    stoneHighlight: [0.69, 0.54, 0.31] as const,
    root: [0.36, 0.18, 0.045] as const,
    lightPool: [1, 0.65, 0.25] as const,
    landmark: [0.54, 0.44, 0.27] as const,
  }),
});

function color(values: readonly [number, number, number]): pc.Color {
  return new pc.Color(values[0], values[1], values[2]);
}

function addFloor(
  device: pc.GraphicsDevice,
  parent: pc.Entity,
  worldWidth: number,
  worldHeight: number,
  art: ClearingArtProfile,
  biomeId: BiomeId,
): { readonly entity: pc.Entity; readonly material: pc.StandardMaterial; readonly texture: pc.Texture | null } {
  const material = createUnlitMaterial(color(art.floor));
  let texture: pc.Texture | null = null;
  // The generated ground plate provides the painterly micro-detail our
  // low-poly silhouette layers deliberately do not attempt to encode. It is
  // a renderer-only progressive enhancement: headless geometry tests and
  // browsers without an image decode continue to use the authored flat tint.
  if (biomeId === 'forest' && typeof Image !== 'undefined') {
    texture = new pc.Texture(device, { mipmaps: true });
    texture.addressU = pc.ADDRESS_REPEAT;
    texture.addressV = pc.ADDRESS_REPEAT;
    const image = new Image();
    image.decoding = 'async';
    image.onload = (): void => {
      texture?.setSource(image);
      material.diffuse.set(0.72, 0.84, 0.54);
      material.emissive.set(0.035, 0.065, 0.022);
      material.diffuseMap = texture;
      material.diffuseMapTiling = new pc.Vec2(3, 3);
      material.update();
    };
    image.src = WILDGUARD_GLADE_GROUND_URL;
  }
  const mesh = pc.Mesh.fromGeometry(device, new pc.PlaneGeometry({
    halfExtents: new pc.Vec2(worldWidth * 0.5, worldHeight * 0.5),
    widthSegments: 1,
    lengthSegments: 1,
  }));
  const entity = new pc.Entity(`${biomeId}-floor`);
  const meshInstance = new pc.MeshInstance(mesh, material);
  meshInstance.castShadow = false;
  meshInstance.receiveShadow = false;
  entity.addComponent('render', {
    meshInstances: [meshInstance],
    castShadows: false,
    receiveShadows: false,
  });
  entity.setLocalPosition(0, FLOOR_HEIGHT, 0);
  parent.addChild(entity);
  return { entity, material, texture };
}

interface StaticForestBatch {
  readonly batch: InstancedCategoryBatch;
  readonly material: pc.StandardMaterial;
}

type LocalPoint = readonly [number, number, number];

function createMeshFromData(
  device: pc.GraphicsDevice,
  positions: number[],
  indices: number[],
  normals?: number[],
): pc.Mesh {
  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals ?? pc.calculateNormals(positions, indices));
  mesh.setIndices(indices);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  return mesh;
}

function appendTriangle(
  positions: number[],
  indices: number[],
  first: LocalPoint,
  second: LocalPoint,
  third: LocalPoint,
): void {
  const index = positions.length / 3;
  positions.push(...first, ...second, ...third);
  indices.push(index, index + 1, index + 2);
}

function appendDoubleSidedTriangle(
  positions: number[],
  indices: number[],
  first: LocalPoint,
  second: LocalPoint,
  third: LocalPoint,
): void {
  appendTriangle(positions, indices, first, second, third);
  appendTriangle(positions, indices, third, second, first);
}

/** A repeatable hand-cut ground silhouette: never a circle or a radial UI decal. */
function createIrregularPatchMesh(
  device: pc.GraphicsDevice,
  radialProfile: readonly number[],
): pc.Mesh {
  const positions = [0, 0, 0];
  const normals = [0, 1, 0];
  const indices: number[] = [];
  for (let index = 0; index < radialProfile.length; index++) {
    const angle = (index / radialProfile.length) * Math.PI * 2;
    positions.push(Math.cos(angle) * radialProfile[index]!, 0, Math.sin(angle) * radialProfile[index]!);
    normals.push(0, 1, 0);
  }
  for (let index = 0; index < radialProfile.length; index++) {
    const next = (index + 1) % radialProfile.length;
    // XZ rings wind clockwise from the camera-facing +Y side.
    indices.push(0, next + 1, index + 1);
  }
  return createMeshFromData(device, positions, indices, normals);
}

function createLeafClusterMesh(device: pc.GraphicsDevice): pc.Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const leaves = [
    [-0.3, 0.1, 0.5, 0.18, 0.18],
    [0.2, -0.18, 0.36, 0.15, 1.08],
    [0.08, 0.32, 0.42, 0.12, 2.12],
    [-0.22, -0.28, 0.3, 0.11, 2.9],
  ] as const;
  for (const [x, z, length, width, angle] of leaves) {
    const forwardX = Math.cos(angle) * length;
    const forwardZ = Math.sin(angle) * length;
    const sideX = Math.cos(angle + Math.PI * 0.5) * width;
    const sideZ = Math.sin(angle + Math.PI * 0.5) * width;
    const core: LocalPoint = [x, 0.018, z];
    const tip: LocalPoint = [x + forwardX, 0.006, z + forwardZ];
    const left: LocalPoint = [x + forwardX * 0.48 + sideX, 0.01, z + forwardZ * 0.48 + sideZ];
    const right: LocalPoint = [x + forwardX * 0.48 - sideX, 0.01, z + forwardZ * 0.48 - sideZ];
    appendDoubleSidedTriangle(positions, indices, core, left, tip);
    appendDoubleSidedTriangle(positions, indices, core, tip, right);
  }
  return createMeshFromData(device, positions, indices);
}

function createFlowerMesh(device: pc.GraphicsDevice): pc.Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const centre: LocalPoint = [0, 0.28, 0];
  for (let index = 0; index < 5; index++) {
    const angle = (index / 5) * Math.PI * 2;
    const leftAngle = angle + 0.48;
    const rightAngle = angle - 0.48;
    const tip: LocalPoint = [Math.cos(angle) * 0.72, 0.035, Math.sin(angle) * 0.72];
    const left: LocalPoint = [Math.cos(leftAngle) * 0.43, 0.075, Math.sin(leftAngle) * 0.43];
    const right: LocalPoint = [Math.cos(rightAngle) * 0.43, 0.075, Math.sin(rightAngle) * 0.43];
    appendDoubleSidedTriangle(positions, indices, centre, tip, left);
    appendDoubleSidedTriangle(positions, indices, centre, right, tip);
  }
  return createMeshFromData(device, positions, indices);
}

function createFernMesh(device: pc.GraphicsDevice): pc.Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const centre: LocalPoint = [0, 0.045, 0];
  for (let index = 0; index < 7; index++) {
    const angle = -0.35 + (index / 6) * Math.PI * 1.7;
    const length = index % 2 === 0 ? 0.86 : 0.68;
    const side = 0.22;
    const tip: LocalPoint = [Math.cos(angle) * length, 0.06, Math.sin(angle) * length];
    const left: LocalPoint = [
      Math.cos(angle) * length * 0.46 + Math.cos(angle + Math.PI * 0.5) * side,
      0.11,
      Math.sin(angle) * length * 0.46 + Math.sin(angle + Math.PI * 0.5) * side,
    ];
    const right: LocalPoint = [
      Math.cos(angle) * length * 0.46 - Math.cos(angle + Math.PI * 0.5) * side,
      0.11,
      Math.sin(angle) * length * 0.46 - Math.sin(angle + Math.PI * 0.5) * side,
    ];
    appendDoubleSidedTriangle(positions, indices, centre, left, tip);
    appendDoubleSidedTriangle(positions, indices, centre, tip, right);
  }
  return createMeshFromData(device, positions, indices);
}

function createGrassTuftMesh(device: pc.GraphicsDevice): pc.Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index < 6; index++) {
    const angle = index * 1.05;
    const baseRadius = index % 2 === 0 ? 0.2 : 0.34;
    const width = 0.075 + (index % 3) * 0.025;
    const height = 0.64 + (index % 3) * 0.17;
    const baseX = Math.cos(angle) * baseRadius;
    const baseZ = Math.sin(angle) * baseRadius;
    const sideX = Math.cos(angle + Math.PI * 0.5) * width;
    const sideZ = Math.sin(angle + Math.PI * 0.5) * width;
    const left: LocalPoint = [baseX + sideX, 0, baseZ + sideZ];
    const right: LocalPoint = [baseX - sideX, 0, baseZ - sideZ];
    const tip: LocalPoint = [
      baseX + Math.cos(angle) * 0.28,
      height,
      baseZ + Math.sin(angle) * 0.28,
    ];
    appendDoubleSidedTriangle(positions, indices, left, tip, right);
  }
  return createMeshFromData(device, positions, indices);
}

function createFacetedCrownMesh(
  device: pc.GraphicsDevice,
  radialProfile: readonly number[],
): pc.Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const sideCount = radialProfile.length;
  const lowerOffset = 0;
  const shoulderOffset = sideCount;
  for (let index = 0; index < sideCount; index++) {
    const angle = (index / sideCount) * Math.PI * 2;
    const radius = radialProfile[index]!;
    positions.push(Math.cos(angle) * radius * 0.78, 0, Math.sin(angle) * radius * 0.78);
  }
  for (let index = 0; index < sideCount; index++) {
    const angle = (index / sideCount) * Math.PI * 2 + 0.1;
    const radius = radialProfile[index]!;
    positions.push(Math.cos(angle) * radius, 0.38, Math.sin(angle) * radius);
  }
  const topIndex = positions.length / 3;
  positions.push(0.07, 0.94, -0.05);
  for (let index = 0; index < sideCount; index++) {
    const next = (index + 1) % sideCount;
    const lower = lowerOffset + index;
    const lowerNext = lowerOffset + next;
    const shoulder = shoulderOffset + index;
    const shoulderNext = shoulderOffset + next;
    indices.push(lower, lowerNext, shoulderNext, lower, shoulderNext, shoulder);
    indices.push(shoulder, shoulderNext, topIndex);
  }
  return createMeshFromData(device, positions, indices);
}

function createTaperedTrunkMesh(device: pc.GraphicsDevice): pc.Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const sides = 6;
  for (let index = 0; index < sides; index++) {
    const angle = (index / sides) * Math.PI * 2;
    positions.push(Math.cos(angle) * 0.52, 0, Math.sin(angle) * 0.52);
  }
  for (let index = 0; index < sides; index++) {
    const angle = (index / sides) * Math.PI * 2 + 0.12;
    positions.push(Math.cos(angle) * 0.25, 1, Math.sin(angle) * 0.25);
  }
  const topIndex = positions.length / 3;
  positions.push(0.02, 1.06, -0.015);
  for (let index = 0; index < sides; index++) {
    const next = (index + 1) % sides;
    indices.push(index, next, sides + next, index, sides + next, sides + index);
    indices.push(sides + index, sides + next, topIndex);
  }
  return createMeshFromData(device, positions, indices);
}

function createBoulderMesh(
  device: pc.GraphicsDevice,
  radialProfile: readonly number[],
): pc.Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const sides = radialProfile.length;
  for (let index = 0; index < sides; index++) {
    const angle = (index / sides) * Math.PI * 2;
    const radius = radialProfile[index]!;
    positions.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  }
  for (let index = 0; index < sides; index++) {
    const angle = (index / sides) * Math.PI * 2 + 0.08;
    const radius = radialProfile[index]!;
    positions.push(Math.cos(angle) * radius * 0.86, 0.48, Math.sin(angle) * radius * 0.86);
  }
  const topIndex = positions.length / 3;
  positions.push(-0.12, 0.94, 0.08);
  for (let index = 0; index < sides; index++) {
    const next = (index + 1) % sides;
    indices.push(index, next, sides + next, index, sides + next, sides + index);
    indices.push(sides + index, sides + next, topIndex);
  }
  return createMeshFromData(device, positions, indices);
}

function createRootClusterMesh(device: pc.GraphicsDevice): pc.Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const directions = [0, 2.18, 4.12] as const;
  for (const angle of directions) {
    const forwardX = Math.cos(angle);
    const forwardZ = Math.sin(angle);
    const sideX = Math.cos(angle + Math.PI * 0.5) * 0.22;
    const sideZ = Math.sin(angle + Math.PI * 0.5) * 0.22;
    const innerLeft: LocalPoint = [sideX, 0.04, sideZ];
    const innerRight: LocalPoint = [-sideX, 0.04, -sideZ];
    const outerLeft: LocalPoint = [forwardX * 0.98 + sideX * 0.42, 0.015, forwardZ * 0.98 + sideZ * 0.42];
    const outerRight: LocalPoint = [forwardX * 0.98 - sideX * 0.42, 0.015, forwardZ * 0.98 - sideZ * 0.42];
    const ridge: LocalPoint = [forwardX * 0.42, 0.58, forwardZ * 0.42];
    appendTriangle(positions, indices, innerLeft, outerLeft, ridge);
    appendTriangle(positions, indices, outerLeft, outerRight, ridge);
    appendTriangle(positions, indices, outerRight, innerRight, ridge);
    appendTriangle(positions, indices, innerRight, innerLeft, ridge);
  }
  return createMeshFromData(device, positions, indices);
}

function partitionDecorations(
  decorations: readonly ForestDecoration[],
  bucketCount: number,
): readonly ForestDecoration[][] {
  const buckets = Array.from({ length: bucketCount }, () => [] as ForestDecoration[]);
  for (let index = 0; index < decorations.length; index++) {
    buckets[index % bucketCount]!.push(decorations[index]!);
  }
  return buckets;
}

function createCanopyShadowDecorations(
  canopies: readonly ForestDecoration[],
): readonly ForestDecoration[] {
  return canopies.map((canopy) => createDecoration(
    canopy.x + Math.cos(canopy.rotationY + Math.PI * 0.5) * canopy.scaleX * 0.06,
    CANOPY_SHADOW_HEIGHT,
    canopy.z + Math.sin(canopy.rotationY + Math.PI * 0.5) * canopy.scaleZ * 0.06,
    canopy.scaleX * 1.22,
    1,
    canopy.scaleZ * 1.22,
    canopy.rotationY,
  ));
}

function createCanopyHighlightDecorations(
  canopies: readonly ForestDecoration[],
): readonly ForestDecoration[] {
  const highlights: ForestDecoration[] = [];
  for (let index = 0; index < canopies.length; index += 2) {
    const canopy = canopies[index]!;
    const angle = canopy.rotationY - Math.PI * 0.35;
    highlights.push(createDecoration(
      canopy.x + Math.cos(angle) * canopy.scaleX * 0.12,
      canopy.y + canopy.scaleY * 0.34,
      canopy.z + Math.sin(angle) * canopy.scaleZ * 0.12,
      canopy.scaleX * 0.58,
      canopy.scaleY * 0.52,
      canopy.scaleZ * 0.56,
      canopy.rotationY + Math.PI * 0.2,
    ));
  }
  return highlights;
}

interface StaticForestBatchOptions {
  readonly opacity?: number;
  readonly diorama?: boolean;
}

function createStaticForestBatch(
  device: pc.GraphicsDevice,
  parent: pc.Entity,
  name: string,
  mesh: pc.Mesh,
  color: pc.Color,
  decorations: readonly ForestDecoration[],
  options: StaticForestBatchOptions = {},
): StaticForestBatch {
  const material = options.diorama === true
    ? createDioramaMaterial(color)
    : createUnlitMaterial(color, options.opacity ?? 1);
  const batch = createInstancedCategoryBatch(
    device,
    parent,
    name,
    decorations.length,
    mesh,
    material,
  );
  // This is intentionally the only upload for environmental art. The batch
  // API is shared with live actors, but this source has no frame-loop update.
  batch.sync(createForestInstanceMatrices(decorations));
  return { batch, material };
}

/**
 * Creates a fixed, layered low-poly arena diorama: an irregular meadow,
 * moss/grass/flower accents, faceted tree crowns and grounded rocks. It has
 * no colliders, scripts, event handlers, or per-frame mutations; every draw
 * is uploaded once and remains renderer-only.
 */
export function createForestClearingPresentation(
  device: pc.GraphicsDevice,
  parent: pc.Entity,
  worldWidth: number,
  worldHeight: number,
  biomeId: BiomeId = 'forest',
): ForestClearingPresentation {
  const art = CLEARING_ART[biomeId];
  const layout = createForestClearingLayout(
    worldWidth,
    worldHeight,
    biomeId === 'saltwind' ? SALTWIND_CLEARING_VISUAL_SEED : VISUAL_SEED,
    biomeId,
  );
  const floor = addFloor(device, parent, worldWidth, worldHeight, art, biomeId);
  // These authored primitives are intentionally hand-cut rather than the
  // stock cylinder/sphere vocabulary. Sharing each mesh through an instanced
  // batch preserves the original renderer budget while making every cluster
  // read as vegetation, stone, or a patch of sun rather than a debug circle.
  const clearingBaseMesh = createIrregularPatchMesh(
    device,
    [0.96, 0.78, 1.04, 0.84, 1.08, 0.87, 1.03, 0.8, 0.98, 0.73, 1.06],
  );
  const clearingInnerMesh = createIrregularPatchMesh(
    device,
    [0.88, 1.06, 0.79, 1.03, 0.83, 0.98, 0.76, 1.08, 0.86],
  );
  const mossMesh = createIrregularPatchMesh(
    device,
    [0.78, 1.04, 0.66, 0.92, 1.08, 0.72, 0.97, 0.64],
  );
  const lightPoolMesh = createIrregularPatchMesh(
    device,
    [0.54, 1.02, 0.76, 0.93, 0.61, 1.08, 0.7, 0.88, 0.58],
  );
  const leafLitterMesh = createLeafClusterMesh(device);
  const grassMesh = createGrassTuftMesh(device);
  const flowerMesh = createFlowerMesh(device);
  const fernMesh = createFernMesh(device);
  const canopyShadowMesh = createIrregularPatchMesh(
    device,
    [0.97, 0.82, 1.06, 0.88, 0.74, 1.03, 0.85, 1.08],
  );
  const canopyMeshA = createFacetedCrownMesh(
    device,
    [0.82, 0.98, 0.72, 1.06, 0.87, 1.02, 0.76],
  );
  const canopyMeshB = createFacetedCrownMesh(
    device,
    [1.02, 0.74, 0.96, 0.8, 1.07, 0.7, 0.91, 0.78],
  );
  const canopyHighlightMesh = createFacetedCrownMesh(
    device,
    [0.83, 1.04, 0.76, 0.95, 0.71, 1.08],
  );
  const treeBaseMesh = createTaperedTrunkMesh(device);
  const stoneMeshA = createBoulderMesh(device, [0.88, 1.04, 0.75, 0.96, 0.72, 1.08]);
  const stoneMeshB = createBoulderMesh(device, [1.02, 0.7, 0.9, 1.08, 0.78, 0.94, 0.68]);
  const rootMesh = createRootClusterMesh(device);
  const ruinMesh = biomeId === 'saltwind'
    ? createTaperedTrunkMesh(device)
    : null;
  const canopyShadows = createCanopyShadowDecorations(layout.canopies);
  const canopyHighlights = createCanopyHighlightDecorations(layout.canopies);
  const flowerVariants = partitionDecorations(layout.flowerPatches, 3);
  const canopyVariants = partitionDecorations(layout.canopies, 2);
  const stoneVariants = partitionDecorations(layout.stones, 2);
  const batches: StaticForestBatch[] = [];
  const addBatch = (
    name: string,
    mesh: pc.Mesh,
    tint: pc.Color,
    decorations: readonly ForestDecoration[],
    options?: StaticForestBatchOptions,
  ): void => {
    if (decorations.length === 0) return;
    batches.push(createStaticForestBatch(device, parent, name, mesh, tint, decorations, options));
  };

  // The generated ground plate carries the fine grass/stone/flower texture;
  // these translucent, hand-cut color washes add volume without painting a
  // second opaque polygonal lawn over the combat space.
  addBatch(`${biomeId}-meadow-base`, clearingBaseMesh, color(art.clearingOuter), layout.clearingLayers.slice(0, 2), { opacity: 0.07 });
  addBatch(`${biomeId}-meadow-inner`, clearingInnerMesh, color(art.clearingInner), layout.clearingLayers.slice(2), { opacity: 0.045 });
  addBatch(`${biomeId}-moss-patch`, mossMesh, color(art.moss), layout.mossPatches, { opacity: 0.06 });
  addBatch(`${biomeId}-sun-dapple`, lightPoolMesh, color(art.lightPool), layout.lightPools, { opacity: 0.09 });
  addBatch(`${biomeId}-leaf-litter`, leafLitterMesh, color(art.leafLitter), layout.leafLitter);
  addBatch(`${biomeId}-grass-tuft`, grassMesh, color(art.grass), layout.grassTufts, { diorama: true });
  addBatch(`${biomeId}-fern`, fernMesh, color(art.fern), layout.ferns, { diorama: true });
  addBatch(`${biomeId}-flower-gold`, flowerMesh, color(art.flowerA), flowerVariants[0]!, { diorama: true });
  addBatch(`${biomeId}-flower-rose`, flowerMesh, color(art.flowerB), flowerVariants[1]!, { diorama: true });
  addBatch(`${biomeId}-flower-cream`, flowerMesh, color(art.flowerC), flowerVariants[2]!, { diorama: true });
  // The forest build now uses the curated CC0 trees in the glade presenter.
  // Keep this broad low-poly canopy layer for Saltwind's abstract ruin
  // silhouette only; in the forest it was masking the authored texture and
  // reading as a row of prototype green solids at the camera edge.
  if (biomeId === 'saltwind') {
    addBatch(`${biomeId}-canopy-shadow`, canopyShadowMesh, color(art.canopyShadow), canopyShadows, { opacity: 0.28 });
    addBatch(`${biomeId}-canopy-a`, canopyMeshA, color(art.canopy), canopyVariants[0]!, { diorama: true });
    addBatch(`${biomeId}-canopy-b`, canopyMeshB, color(art.canopy), canopyVariants[1]!, { diorama: true });
    addBatch(`${biomeId}-canopy-sun`, canopyHighlightMesh, color(art.canopyHighlight), canopyHighlights, { diorama: true });
    addBatch(`${biomeId}-tree-trunk`, treeBaseMesh, color(art.treeBase), layout.treeBases, { diorama: true });
  }
  addBatch(`${biomeId}-boulder-a`, stoneMeshA, color(art.stone), stoneVariants[0]!, { diorama: true });
  addBatch(`${biomeId}-boulder-b`, stoneMeshB, color(art.stoneHighlight), stoneVariants[1]!, { diorama: true });
  addBatch(`${biomeId}-root-cluster`, rootMesh, color(art.root), layout.roots, { diorama: true });
  if (ruinMesh !== null) {
    addBatch('saltwind-ruins', ruinMesh, color(art.landmark), layout.landmarks, { diorama: true });
  }
  let disposed = false;

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of batches) {
        entry.batch.dispose();
        entry.material.destroy();
      }
      floor.entity.destroy();
      floor.material.destroy();
      floor.texture?.destroy();
      // The floor and one-mesh-per-batch entities are each their mesh's final
      // owner. Entity destruction releases those meshes; explicitly destroying
      // them here would double-release PlayCanvas-owned GPU buffers.
    },
  };
}
