import { DEFAULT_CONFIG, makeId, ZONE_TAG } from '@sim';
import { describe, expect, it } from 'vitest';
import { createPersistentZoneVisualPresentation } from '../src/render/persistent-zone-visual-presentation';
import { createSnapshot } from '../src/sim/snapshot-producer';

function zones() {
  return createSnapshot(DEFAULT_CONFIG).zones;
}

function writeZone(
  target: ReturnType<typeof zones>,
  index: number,
  id: number,
  tag: number,
  x = 100,
  y = 200,
  radius = 40,
): void {
  target.id[index] = id;
  target.role[index] = tag;
  target.x[index] = x;
  target.y[index] = y;
  target.radius[index] = radius;
  target.count = Math.max(target.count, index + 1);
}

describe('persistent zone visual presentation', () => {
  it('coalesces overlapping clouds into the newest single primary card', () => {
    const presentation = createPersistentZoneVisualPresentation({
      zoneTag: ZONE_TAG.stinkCloud,
      baseOpacity: 0.56,
      scaleMultiplier: 0.82,
    });
    const snapshot = zones();
    writeZone(snapshot, 0, makeId(0, 0), ZONE_TAG.stinkCloud);
    presentation.update(snapshot, 10, -50, 50, -1);
    expect(presentation.selectedId).toBe(makeId(0, 0));

    writeZone(snapshot, 1, makeId(1, 0), ZONE_TAG.stinkCloud, 140, 210);
    presentation.update(snapshot, 16, -50, 50, -1);
    expect(presentation.selectedId).toBe(makeId(1, 0));
    expect(presentation.transforms.count).toBe(1);
    expect(presentation.transforms.matrices[12]).toBeCloseTo(90);
    expect(presentation.transforms.matrices[14]).toBeCloseTo(-160);
  });

  it('ages an unrefreshed primary from a strong cloud into a quiet footprint', () => {
    const presentation = createPersistentZoneVisualPresentation({
      zoneTag: ZONE_TAG.stinkCloud,
      baseOpacity: 0.56,
      scaleMultiplier: 0.82,
    });
    const snapshot = zones();
    writeZone(snapshot, 0, makeId(0, 0), ZONE_TAG.stinkCloud);

    presentation.update(snapshot, 10, 0, 0, 1);
    presentation.update(snapshot, 16, 0, 0, 1);
    const primaryOpacity = presentation.opacity;
    presentation.update(snapshot, 100, 0, 0, 1);

    expect(primaryOpacity).toBeGreaterThan(0.5);
    expect(presentation.opacity).toBeGreaterThan(0);
    expect(presentation.opacity).toBeLessThan(primaryOpacity * 0.35);
  });

  it('ignores other persistent-zone tags and resets age safely after a run rewind', () => {
    const presentation = createPersistentZoneVisualPresentation({
      zoneTag: ZONE_TAG.royalStink,
      baseOpacity: 0.62,
      scaleMultiplier: 0.84,
    });
    const snapshot = zones();
    writeZone(snapshot, 0, makeId(0, 0), ZONE_TAG.stinkCloud);
    presentation.update(snapshot, 100, 0, 0, 1);
    expect(presentation.transforms.count).toBe(0);

    snapshot.count = 0;
    writeZone(snapshot, 0, makeId(0, 1), ZONE_TAG.royalStink);
    presentation.update(snapshot, 4, 0, 0, 1);
    expect(presentation.selectedId).toBe(makeId(0, 1));
    expect(presentation.opacity).toBeCloseTo(0.62 / 6);
  });
});
