import * as pc from 'playcanvas';

/**
 * Static, renderer-only floor reference for the top-down arena.  It is built
 * once when the scene is created: the render loop never updates its geometry,
 * transforms, or materials.
 */
export interface ArenaGridPresentation {
  dispose(): void;
}

/** Matches the default simulation's spatial cadence without depending on it. */
export const ARENA_GRID_MINOR_SPACING = 50;
export const ARENA_GRID_MAJOR_EVERY = 5;

const MINOR_COLOR = new pc.Color(0.075, 0.11, 0.15);
const MAJOR_COLOR = new pc.Color(0.12, 0.19, 0.26);
const MINOR_OPACITY = 0.38;
const MAJOR_OPACITY = 0.58;
// A small negative world Y keeps the grid beneath gameplay meshes while the
// top-down camera looks down the -Y axis.
const MINOR_HEIGHT = -0.42;
const MAJOR_HEIGHT = -0.4;

interface GridLineBuffers {
  readonly minor: Float32Array;
  readonly major: Float32Array;
}

interface AxisLine {
  readonly coordinate: number;
  readonly major: boolean;
}

function requirePositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be finite and > 0 (received ${value})`);
  }
}

/**
 * Lists minor-grid coordinates inside an axis, retaining both arena edges.
 * The final partial cell (when an arena is not spacing-aligned) is represented
 * by an edge major line instead of extending the visual outside the world.
 */
function createAxisLines(length: number): readonly AxisLine[] {
  const half = length * 0.5;
  const fullSteps = Math.floor(length / ARENA_GRID_MINOR_SPACING);
  const lines: AxisLine[] = [];
  for (let index = 0; index <= fullSteps; index++) {
    lines.push({
      coordinate: -half + index * ARENA_GRID_MINOR_SPACING,
      major: index % ARENA_GRID_MAJOR_EVERY === 0,
    });
  }

  const last = lines[lines.length - 1]!;
  // The tolerance avoids a duplicate edge caused by harmless floating-point
  // representation noise for otherwise spacing-aligned dimensions.
  if (half - last.coordinate > 1e-8) {
    lines.push({ coordinate: half, major: true });
  } else if (!last.major) {
    lines[lines.length - 1] = { coordinate: half, major: true };
  }
  return lines;
}

function countLines(axisX: readonly AxisLine[], axisZ: readonly AxisLine[], major: boolean): number {
  let count = 0;
  for (const line of axisX) if (line.major === major) count++;
  for (const line of axisZ) if (line.major === major) count++;
  return count;
}

function writeLine(
  positions: Float32Array,
  offset: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  height: number,
): number {
  positions[offset] = x0;
  positions[offset + 1] = height;
  positions[offset + 2] = z0;
  positions[offset + 3] = x1;
  positions[offset + 4] = height;
  positions[offset + 5] = z1;
  return offset + 6;
}

/**
 * Produces two static, unindexed `PRIMITIVE_LINES` buffers in renderer scene
 * space. Exported for a lightweight geometry test without needing a WebGL
 * device; it has no simulation imports or mutable global state.
 */
export function createArenaGridLineBuffers(worldWidth: number, worldHeight: number): GridLineBuffers {
  requirePositiveFinite('worldWidth', worldWidth);
  requirePositiveFinite('worldHeight', worldHeight);

  const axisX = createAxisLines(worldWidth);
  const axisZ = createAxisLines(worldHeight);
  const minor = new Float32Array(countLines(axisX, axisZ, false) * 6);
  const major = new Float32Array(countLines(axisX, axisZ, true) * 6);
  const halfWidth = worldWidth * 0.5;
  const halfHeight = worldHeight * 0.5;
  let minorOffset = 0;
  let majorOffset = 0;

  const append = (isMajor: boolean, x0: number, z0: number, x1: number, z1: number): void => {
    if (isMajor) {
      majorOffset = writeLine(major, majorOffset, x0, z0, x1, z1, MAJOR_HEIGHT);
    } else {
      minorOffset = writeLine(minor, minorOffset, x0, z0, x1, z1, MINOR_HEIGHT);
    }
  };

  for (const line of axisX) {
    append(line.major, line.coordinate, -halfHeight, line.coordinate, halfHeight);
  }
  for (const line of axisZ) {
    append(line.major, -halfWidth, line.coordinate, halfWidth, line.coordinate);
  }

  return { minor, major };
}

function createGridMaterial(color: pc.Color, opacity: number): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.diffuse.set(0, 0, 0);
  material.emissive.copy(color);
  material.opacity = opacity;
  material.blendType = pc.BLEND_NORMAL;
  material.depthWrite = false;
  material.update();
  return material;
}

function createLineMesh(device: pc.GraphicsDevice, positions: Float32Array): pc.Mesh {
  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.update(pc.PRIMITIVE_LINES);
  return mesh;
}

function addGridLayer(
  parent: pc.Entity,
  name: string,
  mesh: pc.Mesh,
  material: pc.StandardMaterial,
): pc.Entity {
  const entity = new pc.Entity(name);
  const meshInstance = new pc.MeshInstance(mesh, material);
  meshInstance.castShadow = false;
  meshInstance.receiveShadow = false;
  entity.addComponent('render', {
    meshInstances: [meshInstance],
    castShadows: false,
    receiveShadows: false,
  });
  parent.addChild(entity);
  return entity;
}

/**
 * Creates two fixed world-space line meshes: a quiet 50-unit minor grid and
 * a slightly clearer five-cell major grid. It deliberately has no `update`
 * method, so it cannot allocate or mutate simulation state per rendered frame.
 */
export function createArenaGridPresentation(
  device: pc.GraphicsDevice,
  parent: pc.Entity,
  worldWidth: number,
  worldHeight: number,
): ArenaGridPresentation {
  const buffers = createArenaGridLineBuffers(worldWidth, worldHeight);
  const minorMaterial = createGridMaterial(MINOR_COLOR, MINOR_OPACITY);
  const majorMaterial = createGridMaterial(MAJOR_COLOR, MAJOR_OPACITY);
  const minorMesh = createLineMesh(device, buffers.minor);
  const majorMesh = createLineMesh(device, buffers.major);
  const minorEntity = addGridLayer(parent, 'arena-grid-minor', minorMesh, minorMaterial);
  const majorEntity = addGridLayer(parent, 'arena-grid-major', majorMesh, majorMaterial);
  let disposed = false;

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      minorEntity.destroy();
      majorEntity.destroy();
      // Entity destruction releases the only MeshInstance references. The
      // final MeshInstance destroys its mesh when that reference count reaches
      // zero, so explicitly destroying either mesh here would double-release
      // its GPU buffers.
      minorMaterial.destroy();
      majorMaterial.destroy();
    },
  };
}
