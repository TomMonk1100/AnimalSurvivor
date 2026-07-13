import * as pc from 'playcanvas';
import type { CombatFeedbackCue, CombatFeedbackSnapshot } from '../presentation/combat-feedback';
import { projectCombatFeedbackVisual } from './combat-feedback-visuals';

export interface CombatFeedbackPresentation {
  update(snapshot: CombatFeedbackSnapshot): void;
  dispose(): void;
}

const COLORS: Readonly<Record<CombatFeedbackCue['kind'], pc.Color>> = Object.freeze({
  'player-death': new pc.Color(0.74, 0.28, 0.98),
  'player-hit': new pc.Color(1, 0.18, 0.16),
  attack: new pc.Color(1, 0.78, 0.16),
  pickup: new pc.Color(0.3, 1, 0.5),
  'enemy-death': new pc.Color(1, 0.42, 0.12),
});

type GroundPoint = readonly [number, number];

interface FlatMeshBuilder {
  readonly positions: number[];
  readonly indices: number[];
}

interface CombatCueView {
  readonly entity: pc.Entity;
  readonly glyphEntity: pc.Entity;
  readonly coreEntity: pc.Entity;
  readonly glyphMeshInstance: pc.MeshInstance;
  readonly coreMeshInstance: pc.MeshInstance;
}

/**
 * Combat cues deliberately use a small family of hand-authored, faceted
 * silhouettes instead of an interchangeable ring. They are renderer-only
 * meshes and all animation is derived from the cue's deterministic tick age.
 */
function createMaterial(color: pc.Color): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.diffuse.set(0, 0, 0);
  material.emissive.copy(color);
  material.opacity = 1;
  material.blendType = pc.BLEND_ADDITIVEALPHA;
  material.depthWrite = false;
  material.cull = pc.CULLFACE_NONE;
  material.update();
  return material;
}

function appendVertex(builder: FlatMeshBuilder, point: GroundPoint): number {
  const index = builder.positions.length / 3;
  builder.positions.push(point[0], 0, point[1]);
  return index;
}

function appendQuad(
  builder: FlatMeshBuilder,
  a: GroundPoint,
  b: GroundPoint,
  c: GroundPoint,
  d: GroundPoint,
): void {
  const aIndex = appendVertex(builder, a);
  const bIndex = appendVertex(builder, b);
  const cIndex = appendVertex(builder, c);
  const dIndex = appendVertex(builder, d);
  builder.indices.push(aIndex, bIndex, cIndex, aIndex, cIndex, dIndex);
}

function appendRay(
  builder: FlatMeshBuilder,
  angleRadians: number,
  innerRadius: number,
  outerRadius: number,
  halfWidth: number,
): void {
  const dirX = Math.cos(angleRadians);
  const dirZ = Math.sin(angleRadians);
  const perpendicularX = -dirZ;
  const perpendicularZ = dirX;
  const middleRadius = innerRadius + (outerRadius - innerRadius) * 0.54;
  const root: GroundPoint = [dirX * innerRadius, dirZ * innerRadius];
  const tip: GroundPoint = [dirX * outerRadius, dirZ * outerRadius];
  const left: GroundPoint = [
    dirX * middleRadius + perpendicularX * halfWidth,
    dirZ * middleRadius + perpendicularZ * halfWidth,
  ];
  const right: GroundPoint = [
    dirX * middleRadius - perpendicularX * halfWidth,
    dirZ * middleRadius - perpendicularZ * halfWidth,
  ];
  appendQuad(builder, root, left, tip, right);
}

function createFlatMesh(device: pc.GraphicsDevice, build: (builder: FlatMeshBuilder) => void): pc.Mesh {
  const builder: FlatMeshBuilder = { positions: [], indices: [] };
  build(builder);
  const geometry = new pc.Geometry();
  geometry.positions = builder.positions;
  geometry.normals = Array.from({ length: builder.positions.length }, (_value, index) => index % 3 === 1 ? 1 : 0);
  geometry.indices = builder.indices;
  return pc.Mesh.fromGeometry(device, geometry);
}

function createShardBurstMesh(
  device: pc.GraphicsDevice,
  count: number,
  innerRadius: number,
  outerRadius: number,
  halfWidth: number,
  phase = 0,
): pc.Mesh {
  return createFlatMesh(device, (builder) => {
    for (let index = 0; index < count; index++) {
      const stagger = 0.84 + (index % 3) * 0.065;
      appendRay(
        builder,
        phase + Math.PI * 2 * index / count,
        innerRadius,
        outerRadius * stagger,
        halfWidth * (index % 2 === 0 ? 1 : 0.72),
      );
    }
  });
}

function createTripleSlashMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createFlatMesh(device, (builder) => {
    // Three feathered strokes make the auto-attack read as a deliberate shot,
    // even though combat feedback does not own an aiming direction.
    for (const offset of [-0.32, 0.04, 0.36]) {
      appendRay(builder, Math.PI / 2 + offset, 0.08, 1, 0.1);
    }
    appendRay(builder, -Math.PI / 2 + 0.1, 0.05, 0.42, 0.08);
  });
}

function createPickupBloomMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createFlatMesh(device, (builder) => {
    for (let index = 0; index < 4; index++) {
      appendRay(builder, Math.PI / 4 + Math.PI * 0.5 * index, 0.05, 0.92, 0.17);
    }
    appendRay(builder, 0, 0, 0.36, 0.12);
    appendRay(builder, Math.PI / 2, 0, 0.36, 0.12);
  });
}

function createFeedbackGlyphMeshes(device: pc.GraphicsDevice): Map<CombatFeedbackCue['kind'], pc.Mesh> {
  return new Map<CombatFeedbackCue['kind'], pc.Mesh>([
    ['attack', createTripleSlashMesh(device)],
    ['pickup', createPickupBloomMesh(device)],
    ['enemy-death', createShardBurstMesh(device, 6, 0.08, 1, 0.13, 0.2)],
    ['player-hit', createShardBurstMesh(device, 8, 0.05, 1, 0.1, -0.12)],
    ['player-death', createShardBurstMesh(device, 12, 0.04, 1, 0.14, 0.04)],
  ]);
}

function createFeedbackCoreMeshes(device: pc.GraphicsDevice): Map<CombatFeedbackCue['kind'], pc.Mesh> {
  return new Map<CombatFeedbackCue['kind'], pc.Mesh>([
    ['attack', pc.Mesh.fromGeometry(device, new pc.ConeGeometry({
      baseRadius: 0.45, height: 0.72, heightSegments: 1, capSegments: 3,
    }))],
    ['pickup', pc.Mesh.fromGeometry(device, new pc.ConeGeometry({
      baseRadius: 0.5, height: 0.95, heightSegments: 1, capSegments: 4,
    }))],
    ['enemy-death', pc.Mesh.fromGeometry(device, new pc.SphereGeometry({
      radius: 0.5, latitudeBands: 4, longitudeBands: 6,
    }))],
    ['player-hit', pc.Mesh.fromGeometry(device, new pc.SphereGeometry({
      radius: 0.5, latitudeBands: 4, longitudeBands: 6,
    }))],
    ['player-death', pc.Mesh.fromGeometry(device, new pc.ConeGeometry({
      baseRadius: 0.56, height: 1.2, heightSegments: 1, capSegments: 6,
    }))],
  ]);
}

function seededAngleDegrees(cue: CombatFeedbackCue): number {
  // Stable, compact variation prevents a stack of matching glyphs while never
  // consulting wall-clock time or mutating the simulation's cue stream.
  const seed = Math.abs(
    Math.floor(cue.tick * 37 + cue.x * 11 + cue.y * 7 + cue.intensity * 53),
  );
  return seed % 360;
}

function coreScaleFor(cue: CombatFeedbackCue, radius: number, progress: number): number {
  const kindWeight = cue.kind === 'player-death' ? 0.09 : cue.kind === 'player-hit' ? 0.075 : 0.06;
  return Math.max(0.42, radius * kindWeight * (1.08 - progress * 0.36));
}

/**
 * Fixed renderer-only cue pool. The hierarchy combines an angular ground
 * glyph with one small low-poly core, so kill, hit, pickup, attack, and death
 * moments no longer collapse into the same stack of glowing circles.
 */
export function createCombatFeedbackPresentation(
  device: pc.GraphicsDevice,
  parent: pc.Entity,
  worldHalfWidth: number,
  worldHalfHeight: number,
  capacity = 24,
): CombatFeedbackPresentation {
  const materials = new Map<CombatFeedbackCue['kind'], pc.StandardMaterial>();
  for (const kind of Object.keys(COLORS) as CombatFeedbackCue['kind'][]) {
    materials.set(kind, createMaterial(COLORS[kind]));
  }
  const glyphMeshes = createFeedbackGlyphMeshes(device);
  const coreMeshes = createFeedbackCoreMeshes(device);
  // Mesh assignment changes as a fixed pool slot is reused. Keep one detached
  // reference for every authored mesh so PlayCanvas does not dispose a mesh
  // simply because it is between two visible cue kinds.
  const meshKeepers = [
    ...glyphMeshes.values(),
    ...coreMeshes.values(),
  ].map((mesh) => new pc.MeshInstance(mesh, materials.get('attack')!));
  const views: CombatCueView[] = [];

  for (let index = 0; index < capacity; index++) {
    const entity = new pc.Entity(`combat-cue-${index}`);
    const glyphEntity = new pc.Entity(`combat-cue-glyph-${index}`);
    const coreEntity = new pc.Entity(`combat-cue-core-${index}`);
    const glyphMeshInstance = new pc.MeshInstance(glyphMeshes.get('attack')!, materials.get('attack')!);
    const coreMeshInstance = new pc.MeshInstance(coreMeshes.get('attack')!, materials.get('attack')!);
    glyphEntity.addComponent('render', {
      meshInstances: [glyphMeshInstance], castShadows: false, receiveShadows: false,
    });
    coreEntity.addComponent('render', {
      meshInstances: [coreMeshInstance], castShadows: false, receiveShadows: false,
    });
    entity.addChild(glyphEntity);
    entity.addChild(coreEntity);
    entity.enabled = false;
    parent.addChild(entity);
    views.push({ entity, glyphEntity, coreEntity, glyphMeshInstance, coreMeshInstance });
  }

  return {
    update(snapshot) {
      let used = 0;
      for (const cue of snapshot.cues) {
        if (used === views.length) break;
        const view = views[used++]!;
        const visual = projectCombatFeedbackVisual(cue, snapshot.tick);
        const material = materials.get(cue.kind)!;
        const glyphScale = Math.max(0.5, visual.radius);
        const progress = visual.progress;
        const spin = cue.kind === 'attack' ? progress * 18 : cue.kind === 'pickup' ? -progress * 12 : progress * 7;
        const coreScale = coreScaleFor(cue, visual.radius, progress);
        const coreHeight = cue.kind === 'player-death'
          ? 0.72 + progress * 0.38
          : 0.38 + (1 - progress) * 0.18;

        view.glyphMeshInstance.mesh = glyphMeshes.get(cue.kind)!;
        view.coreMeshInstance.mesh = coreMeshes.get(cue.kind)!;
        view.glyphMeshInstance.material = material;
        view.coreMeshInstance.material = material;
        view.glyphMeshInstance.setParameter('material_opacity', visual.opacity);
        view.coreMeshInstance.setParameter('material_opacity', Math.min(1, visual.opacity * 0.92));
        view.entity.setLocalPosition(
          cue.x - worldHalfWidth,
          0.34 + cue.intensity * 0.035 + progress * 0.1,
          worldHalfHeight - cue.y,
        );
        view.entity.setLocalEulerAngles(0, seededAngleDegrees(cue) + spin, 0);
        view.glyphEntity.setLocalPosition(0, 0, 0);
        view.glyphEntity.setLocalScale(glyphScale, 1, glyphScale);
        view.coreEntity.setLocalPosition(0, coreHeight, 0);
        view.coreEntity.setLocalScale(
          coreScale,
          coreScale * (cue.kind === 'player-death' ? 1.35 : 0.82),
          coreScale,
        );
        view.entity.enabled = true;
      }
      for (let index = used; index < views.length; index++) views[index]!.entity.enabled = false;
    },
    dispose() {
      for (const view of views) view.entity.destroy();
      for (const keeper of meshKeepers) keeper.destroy();
      for (const material of materials.values()) material.destroy();
    },
  };
}
