import * as pc from 'playcanvas';
import type { CombatFeedbackCue, CombatFeedbackSnapshot } from '../presentation/combat-feedback';
import { projectCombatFeedbackVisual } from './combat-feedback-visuals';

export interface CombatFeedbackPresentation {
  update(snapshot: CombatFeedbackSnapshot): void;
  dispose(): void;
}

const COLORS: Readonly<Record<CombatFeedbackCue['kind'], pc.Color>> = Object.freeze({
  'player-death': new pc.Color(0.72, 0.22, 0.95),
  'player-hit': new pc.Color(1, 0.2, 0.2),
  attack: new pc.Color(1, 0.82, 0.18),
  pickup: new pc.Color(0.25, 1, 0.48),
  'enemy-death': new pc.Color(1, 0.5, 0.16),
});

const RING_RADIUS = 0.5;
const RING_TUBE_RADIUS = 0.04;
const RING_OUTER_RADIUS = RING_RADIUS + RING_TUBE_RADIUS;

function createMaterial(color: pc.Color): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.diffuse.set(0, 0, 0);
  material.emissive.copy(color);
  material.opacity = 1;
  material.blendType = pc.BLEND_ADDITIVEALPHA;
  material.depthWrite = false;
  material.update();
  return material;
}

interface CombatCueView {
  readonly entity: pc.Entity;
  readonly meshInstance: pc.MeshInstance;
}

/**
 * Fixed renderer-only ring pool; all geometry is created once and every visual
 * age is sourced from simulation ticks. Per-instance opacity keeps overlapping
 * cues independent while shared per-kind materials preserve bounded ownership.
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
  const ringMesh = pc.Mesh.fromGeometry(device, new pc.TorusGeometry({
    ringRadius: RING_RADIUS,
    tubeRadius: RING_TUBE_RADIUS,
    segments: 36,
    sides: 6,
  }));
  const views: CombatCueView[] = [];
  for (let index = 0; index < capacity; index++) {
    const entity = new pc.Entity(`combat-cue-${index}`);
    const meshInstance = new pc.MeshInstance(ringMesh, materials.get('attack')!);
    entity.addComponent('render', {
      meshInstances: [meshInstance], castShadows: false, receiveShadows: false,
    });
    entity.enabled = false;
    parent.addChild(entity);
    views.push({ entity, meshInstance });
  }

  return {
    update(snapshot) {
      let used = 0;
      for (const cue of snapshot.cues) {
        if (used === views.length) break;
        const view = views[used++]!;
        const visual = projectCombatFeedbackVisual(cue, snapshot.tick);
        const radialScale = visual.radius / RING_OUTER_RADIUS;
        view.meshInstance.material = materials.get(cue.kind)!;
        view.meshInstance.setParameter('material_opacity', visual.opacity);
        view.entity.setLocalPosition(
          cue.x - worldHalfWidth,
          visual.thickness * 0.5 + 0.12,
          worldHalfHeight - cue.y,
        );
        view.entity.setLocalScale(
          radialScale,
          visual.thickness / (RING_TUBE_RADIUS * 2),
          radialScale,
        );
        view.entity.enabled = true;
      }
      for (let index = used; index < views.length; index++) views[index]!.entity.enabled = false;
    },
    dispose() {
      for (const view of views) view.entity.destroy();
      for (const material of materials.values()) material.destroy();
    },
  };
}
