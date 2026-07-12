import * as pc from 'playcanvas';
import { createInstancedCategoryBatch } from './instanced-category-batch';
import type { InstancedCategoryBatch, InstanceMatrices } from './instanced-category-batch';

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
  readonly mossPatches: readonly ForestDecoration[];
  readonly canopies: readonly ForestDecoration[];
  readonly stones: readonly ForestDecoration[];
  readonly roots: readonly ForestDecoration[];
}

/** A reserved, decoration-light space around the default run start. */
export const FOREST_CLEARING_RADIUS = 210;
export const FOREST_MOSS_PATCH_COUNT = 72;
export const FOREST_CANOPY_COUNT = 112;
export const FOREST_STONE_COUNT = 76;
export const FOREST_ROOT_COUNT = 58;

const VISUAL_SEED = 0x57_49_4c_44;
const FLOOR_HEIGHT = -0.7;
const MOSS_HEIGHT = -0.61;
const CANOPY_HEIGHT = -0.56;
const ROOT_HEIGHT = -0.5;
const STONE_HEIGHT = -0.42;
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
): ForestClearingLayout {
  requirePositiveFinite('worldWidth', worldWidth);
  requirePositiveFinite('worldHeight', worldHeight);
  const halfWidth = worldWidth * 0.5;
  const halfHeight = worldHeight * 0.5;
  const radius = clearingRadius(worldWidth, worldHeight);
  const rng = new VisualRng(seed);
  const mossPatches: ForestDecoration[] = [];
  const canopies: ForestDecoration[] = [];
  const stones: ForestDecoration[] = [];
  const roots: ForestDecoration[] = [];

  for (let index = 0; index < scaledCount(FOREST_MOSS_PATCH_COUNT, worldWidth, worldHeight); index++) {
    const [x, z] = scenePosition(rng, halfWidth, halfHeight);
    mossPatches.push(createDecoration(
      x,
      MOSS_HEIGHT,
      z,
      rng.between(34, 88),
      rng.between(0.025, 0.045),
      rng.between(26, 70),
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
      rng.between(0.045, 0.075),
      rng.between(22, 50),
      rng.between(0, Math.PI * 2),
    ));
  }

  for (let index = 0; index < scaledCount(FOREST_STONE_COUNT, worldWidth, worldHeight); index++) {
    const [x, z] = outsideClearingPosition(rng, halfWidth, halfHeight, radius * 0.62);
    stones.push(createDecoration(
      x,
      STONE_HEIGHT,
      z,
      rng.between(3.5, 8.5),
      rng.between(0.16, 0.34),
      rng.between(3, 7),
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
      rng.between(0.06, 0.12),
      rng.between(1.6, 3.5),
      rng.between(0, Math.PI * 2),
    ));
  }

  return { mossPatches, canopies, stones, roots };
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

function createUnlitMaterial(color: pc.Color): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.diffuse.set(0, 0, 0);
  material.emissive.copy(color);
  material.update();
  return material;
}

function addFloor(
  device: pc.GraphicsDevice,
  parent: pc.Entity,
  worldWidth: number,
  worldHeight: number,
): { readonly entity: pc.Entity; readonly material: pc.StandardMaterial } {
  const material = createUnlitMaterial(new pc.Color(0.15, 0.29, 0.16));
  const mesh = pc.Mesh.fromGeometry(device, new pc.PlaneGeometry({
    halfExtents: new pc.Vec2(worldWidth * 0.5, worldHeight * 0.5),
    widthSegments: 1,
    lengthSegments: 1,
  }));
  const entity = new pc.Entity('forest-floor');
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
  return { entity, material };
}

interface StaticForestBatch {
  readonly batch: InstancedCategoryBatch;
  readonly material: pc.StandardMaterial;
}

function createStaticForestBatch(
  device: pc.GraphicsDevice,
  parent: pc.Entity,
  name: string,
  mesh: pc.Mesh,
  color: pc.Color,
  decorations: readonly ForestDecoration[],
): StaticForestBatch {
  const material = createUnlitMaterial(color);
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
 * Creates one floor draw and four fixed instanced decoration draws. There are
 * no colliders, scripts, event handlers, or per-frame mutations in this
 * module; all forest art remains safely below live gameplay meshes.
 */
export function createForestClearingPresentation(
  device: pc.GraphicsDevice,
  parent: pc.Entity,
  worldWidth: number,
  worldHeight: number,
): ForestClearingPresentation {
  const layout = createForestClearingLayout(worldWidth, worldHeight);
  const floor = addFloor(device, parent, worldWidth, worldHeight);
  const patchMesh = pc.Mesh.fromGeometry(device, new pc.CylinderGeometry({
    radius: 0.5,
    height: 1,
    heightSegments: 1,
    capSegments: 9,
  }));
  const canopyMesh = pc.Mesh.fromGeometry(device, new pc.CylinderGeometry({
    radius: 0.5,
    height: 1,
    heightSegments: 1,
    capSegments: 7,
  }));
  const stoneMesh = pc.Mesh.fromGeometry(device, new pc.SphereGeometry({
    radius: 0.5,
    latitudeBands: 4,
    longitudeBands: 6,
  }));
  const rootMesh = pc.Mesh.fromGeometry(device, new pc.BoxGeometry({
    halfExtents: new pc.Vec3(0.5, 0.5, 0.5),
  }));
  const batches = [
    createStaticForestBatch(
      device,
      parent,
      'forest-moss-patch',
      patchMesh,
      new pc.Color(0.18, 0.31, 0.16),
      layout.mossPatches,
    ),
    createStaticForestBatch(
      device,
      parent,
      'forest-canopy',
      canopyMesh,
      new pc.Color(0.13, 0.27, 0.13),
      layout.canopies,
    ),
    createStaticForestBatch(
      device,
      parent,
      'forest-stone',
      stoneMesh,
      new pc.Color(0.28, 0.34, 0.28),
      layout.stones,
    ),
    createStaticForestBatch(
      device,
      parent,
      'forest-root',
      rootMesh,
      new pc.Color(0.26, 0.19, 0.09),
      layout.roots,
    ),
  ];
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
      // The floor and one-mesh-per-batch entities are each their mesh's final
      // owner. Entity destruction releases those meshes; explicitly destroying
      // them here would double-release PlayCanvas-owned GPU buffers.
    },
  };
}
