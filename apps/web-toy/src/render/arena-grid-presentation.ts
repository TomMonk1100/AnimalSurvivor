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
/** Short perimeter stitch length for the quiet, renderer-only wayfinding cue. */
export const ARENA_GRID_MINOR_TICK_LENGTH = 16;
/** Broader, still edge-bound cadence marks used in place of full crosshair seams. */
export const ARENA_GRID_MAJOR_TICK_LENGTH = 42;

// The forest floor is the primary movement reference. The old major crosshair
// still made the centre read like a diagnostic arena, so *all* wayfinding is
// now pushed to the far perimeter. These are quiet hand-stitch marks, not a
// grid the player fights on.
const MINOR_COLOR = new pc.Color(0.31, 0.4, 0.25);
const MAJOR_COLOR = new pc.Color(0.64, 0.52, 0.28);
const MINOR_OPACITY = 0.018;
const MAJOR_OPACITY = 0.042;
// A small negative world Y keeps the grid under forest-floor details and
// gameplay meshes while the top-down camera looks down the -Y axis.
const MINOR_HEIGHT = -0.713;
const MAJOR_HEIGHT = -0.711;

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
 * Writes a short stitch that starts at a world edge instead of a full minor
 * grid line. It is a static wayfinding hint, never a gameplay boundary.
 */
function writeEdgeTick(
  positions: Float32Array,
  offset: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  height: number,
): number {
  return writeLine(positions, offset, x0, z0, x1, z1, height);
}

/**
 * Produces two static, unindexed `PRIMITIVE_LINES` buffers in renderer scene
 * space. Both cadences live only at the far perimeter, so the combat pocket
 * stays a natural clearing instead of a diagnostic overlay. Exported for a
 * lightweight geometry test without needing a WebGL device; it has no
 * simulation imports or mutable global state.
 */
export function createArenaGridLineBuffers(worldWidth: number, worldHeight: number): GridLineBuffers {
  requirePositiveFinite('worldWidth', worldWidth);
  requirePositiveFinite('worldHeight', worldHeight);

  const axisX = createAxisLines(worldWidth);
  const axisZ = createAxisLines(worldHeight);
  // Every coordinate receives paired border stitches. Major marks are longer
  // and warmer, but never cross the fighting space.
  const minor = new Float32Array(countLines(axisX, axisZ, false) * 2 * 6);
  const major = new Float32Array(countLines(axisX, axisZ, true) * 2 * 6);
  const halfWidth = worldWidth * 0.5;
  const halfHeight = worldHeight * 0.5;
  let minorOffset = 0;
  let majorOffset = 0;

  const appendBoundaryTicks = (
    buffer: Float32Array,
    offset: number,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    requestedLength: number,
    height: number,
  ): number => {
    const length = Math.min(requestedLength, Math.hypot(x1 - x0, z1 - z0) * 0.5);
    const dx = x1 === x0 ? 0 : Math.sign(x1 - x0) * length;
    const dz = z1 === z0 ? 0 : Math.sign(z1 - z0) * length;
    let nextOffset = writeEdgeTick(buffer, offset, x0, z0, x0 + dx, z0 + dz, height);
    nextOffset = writeEdgeTick(buffer, nextOffset, x1, z1, x1 - dx, z1 - dz, height);
    return nextOffset;
  };

  const append = (isMajor: boolean, x0: number, z0: number, x1: number, z1: number): void => {
    if (isMajor) {
      majorOffset = appendBoundaryTicks(
        major,
        majorOffset,
        x0,
        z0,
        x1,
        z1,
        ARENA_GRID_MAJOR_TICK_LENGTH,
        MAJOR_HEIGHT,
      );
    } else {
      minorOffset = appendBoundaryTicks(
        minor,
        minorOffset,
        x0,
        z0,
        x1,
        z1,
        ARENA_GRID_MINOR_TICK_LENGTH,
        MINOR_HEIGHT,
      );
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
 * Creates two fixed world-space line meshes: a soft perimeter stitch guide and
 * a warmer, longer five-cell perimeter cadence. It deliberately has no
 * `update` method, so it cannot allocate or mutate simulation state per frame.
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
