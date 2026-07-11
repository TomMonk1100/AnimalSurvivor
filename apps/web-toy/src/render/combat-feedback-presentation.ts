import * as pc from 'playcanvas';
import type { CombatFeedbackCue, CombatFeedbackSnapshot } from '../presentation/combat-feedback';

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

const BASE_SIZE: Readonly<Record<CombatFeedbackCue['kind'], number>> = Object.freeze({
  'player-death': 34,
  'player-hit': 18,
  attack: 15,
  pickup: 10,
  'enemy-death': 12,
});

function createMaterial(color: pc.Color): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.diffuse.set(0, 0, 0);
  material.emissive.copy(color);
  material.update();
  return material;
}

/** Fixed renderer-only pulse pool; all cue timing is sourced from simulation ticks. */
export function createCombatFeedbackPresentation(
  parent: pc.Entity,
  worldHalfWidth: number,
  worldHalfHeight: number,
  capacity = 24,
): CombatFeedbackPresentation {
  const materials = new Map<CombatFeedbackCue['kind'], pc.StandardMaterial>();
  for (const kind of Object.keys(COLORS) as CombatFeedbackCue['kind'][]) {
    materials.set(kind, createMaterial(COLORS[kind]));
  }
  const entities: pc.Entity[] = [];
  for (let index = 0; index < capacity; index++) {
    const entity = new pc.Entity(`combat-cue-${index}`);
    entity.addComponent('render', { type: 'sphere', material: materials.get('attack')!, castShadows: false, receiveShadows: false });
    entity.enabled = false;
    parent.addChild(entity);
    entities.push(entity);
  }

  return {
    update(snapshot) {
      let used = 0;
      for (const cue of snapshot.cues) {
        if (used === entities.length) break;
        const entity = entities[used++]!;
        const elapsed = Math.max(0, snapshot.tick - cue.tick);
        const progress = Math.min(1, elapsed / cue.lifetimeTicks);
        const size = BASE_SIZE[cue.kind] * cue.intensity * (0.55 + progress * 0.45);
        entity.render!.material = materials.get(cue.kind)!;
        entity.setLocalPosition(cue.x - worldHalfWidth, size * 0.08, worldHalfHeight - cue.y);
        entity.setLocalScale(size, Math.max(1, size * 0.18), size);
        entity.enabled = true;
      }
      for (let index = used; index < entities.length; index++) entities[index]!.enabled = false;
    },
    dispose() {
      for (const entity of entities) entity.destroy();
      for (const material of materials.values()) material.destroy();
    },
  };
}
