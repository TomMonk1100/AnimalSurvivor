import * as pc from 'playcanvas';

/** Minimal CPU-side matrix source consumed by the GPU upload path. */
export interface InstanceMatrices {
  readonly count: number;
  readonly matrices: Float32Array;
}

/**
 * One hardware-instanced draw batch for a homogeneous render category.
 *
 * PlayCanvas's default instancing format is four vec4 attributes containing a
 * column-major model matrix. The batch node stays at identity, so each matrix
 * directly maps the unit sphere into world space. Every live row is rewritten
 * before the instance count is exposed; a generation-reused sim slot can
 * therefore never inherit transform data from its previous entity id.
 */
export interface InstancedCategoryBatch {
  sync(instances: InstanceMatrices): void;
  readonly liveViews: number;
  readonly highWaterViews: number;
  dispose(): void;
}

const FLOATS_PER_MATRIX = 16;

export function createInstancedCategoryBatch(
  device: pc.GraphicsDevice,
  parent: pc.Entity,
  name: string,
  capacity: number,
  mesh: pc.Mesh,
  material: pc.Material,
  localY = 0,
): InstancedCategoryBatch {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`${name} instance capacity must be a positive integer`);
  }

  const format = pc.VertexFormat.getDefaultInstancingFormat(device);
  const matrices = new Float32Array(capacity * FLOATS_PER_MATRIX);
  const vertexBuffer = new pc.VertexBuffer(device, format, capacity, {
    usage: pc.BUFFER_DYNAMIC,
    data: matrices.buffer,
  });

  const meshInstance = new pc.MeshInstance(mesh, material);
  // A single local-space sphere bound cannot describe instances distributed
  // across the arena. Disable aggregate culling rather than risk pop-in.
  meshInstance.cull = false;
  meshInstance.setInstancing(vertexBuffer, false);
  meshInstance.instancingCount = 0;
  meshInstance.visible = false;

  const entity = new pc.Entity(`${name}-instances`);
  entity.addComponent('render', {
    meshInstances: [meshInstance],
    castShadows: false,
    receiveShadows: false,
  });
  entity.setLocalPosition(0, localY, 0);
  parent.addChild(entity);

  let liveViews = 0;
  let highWaterViews = 0;
  let disposed = false;

  function sync(instances: InstanceMatrices): void {
    if (disposed) {
      return;
    }
    if (instances.count > capacity) {
      throw new RangeError(
        `${name} instance count ${instances.count} exceeds capacity ${capacity}`,
      );
    }

    const usedFloats = instances.count * FLOATS_PER_MATRIX;
    if (instances.matrices.length < usedFloats) {
      throw new RangeError(`${name} matrix source is shorter than its instance count`);
    }
    if (instances.matrices.length > matrices.length) {
      throw new RangeError(`${name} matrix source exceeds batch capacity`);
    }
    // The transform store is capacity-matched to this batch, so copying its
    // stable view avoids allocating a subarray in the render loop.
    matrices.set(instances.matrices, 0);

    // setData uploads the retained CPU array and is context-restore safe: the
    // VertexBuffer remains a PlayCanvas-owned resource, never a raw GL object.
    if (instances.count > 0) {
      vertexBuffer.setData(matrices.buffer);
    }
    meshInstance.instancingCount = instances.count;
    meshInstance.visible = instances.count > 0;
    liveViews = instances.count;
    highWaterViews = Math.max(highWaterViews, liveViews);
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    meshInstance.setInstancing(null);
    entity.destroy();
    vertexBuffer.destroy();
    liveViews = 0;
  }

  return {
    sync,
    get liveViews(): number {
      return liveViews;
    },
    get highWaterViews(): number {
      return highWaterViews;
    },
    dispose,
  };
}
