import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BehaviorDefinition, Catalog, CommandTemplate, FusionVariant } from '../src/contracts.js';
import { getCatalog } from '../src/definitions.js';
import { enumerateChimeraPairs } from '../src/chimera/chimera-ids.js';
import { estimateBehaviorDps } from '../src/chimera/budget.js';
import {
  CHIMERA_LAB_CALIBRATION,
  CHIMERA_LAB_CADENCE_CALIBRATION,
  chimeraLabCadenceMultiplier,
  chimeraLabCalibrationMultiplier,
} from '../src/chimera/lab-calibration.js';
import { synthesizeChimera } from '../src/chimera/synthesize.js';
import { STAT_LEANS } from '../src/chimera/leans.js';
import { TEMPERAMENTS } from '../src/chimera/temperaments.js';
import { validateCatalog } from '../src/validation.js';

const catalog = getCatalog();

function templatesFor(behavior: BehaviorDefinition): CommandTemplate[] {
  const preludes = (behavior.preludes ?? []).map((prelude) => prelude.emit);
  if (behavior.phases !== undefined) {
    return [
      ...preludes,
      ...behavior.phases.flatMap((phase) => [
      phase.emit,
      ...(phase.followUps ?? []).map((followUp) => followUp.emit),
      ]),
    ];
  }
  return [
    ...preludes,
    ...(behavior.emit === undefined ? [] : [behavior.emit]),
    ...(behavior.followUps ?? []).map((followUp) => followUp.emit),
  ];
}

function assertHardBounds(behavior: BehaviorDefinition): void {
  if (behavior.phases !== undefined) assert.ok(behavior.phases.length <= 4);
  const groups = behavior.phases === undefined
    ? [{ emit: behavior.emit, preludes: behavior.preludes, followUps: behavior.followUps }]
    : behavior.phases.map((phase, index) => ({
      ...phase,
      preludes: index === 0 ? behavior.preludes : undefined,
    }));
  for (const group of groups) {
    assert.ok(
      (group.preludes?.length ?? 0) + (group.followUps?.length ?? 0) <= 2,
      'at most three commands fire from one trigger',
    );
    const orbiting = [
      ...(group.emit === undefined ? [] : [group.emit]),
      ...(group.preludes ?? []).map((prelude) => prelude.emit),
      ...(group.followUps ?? []).map((followUp) => followUp.emit),
    ].reduce((total, template) => (
      total + (template.kind === 'orbitingDamage' ? template.count ?? 0 : 0)
    ), 0);
    assert.ok(orbiting <= 16, 'orbiting total remains executor-bounded per trigger');
  }
  for (const template of templatesFor(behavior)) {
    if (template.jumps !== undefined) assert.ok(template.jumps <= 7);
    if (template.pierce !== undefined) assert.ok(template.pierce <= 255);
    for (const field of ['damage', 'amount', 'radius', 'range', 'speed', 'strength'] as const) {
      if (template[field] !== undefined) {
        assert.ok(Number.isFinite(template[field]) && template[field]! >= 0);
      }
    }
  }
}

function catalogWith(definition: ReturnType<typeof synthesizeChimera>['definition']): Catalog {
  const replacesAuthored = catalog.evolutions.some((evolution) => evolution.id === definition.id);
  return {
    ...catalog,
    evolutions: replacesAuthored
      ? catalog.evolutions.map((evolution) => evolution.id === definition.id ? definition : evolution)
      : [...catalog.evolutions, definition],
  };
}

test('all 5,280 Wild Splice compositions are deterministic, valid, and executor-bounded', () => {
  const pairs = enumerateChimeraPairs(catalog);
  assert.equal(pairs.length, 66);
  const independentCatalog: Catalog = {
    ...catalog,
    traits: [...catalog.traits],
    evolutions: [...catalog.evolutions],
  };

  let compositions = 0;
  for (let pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
    const pair = pairs[pairIndex]!;
    for (let temperamentIndex = 0; temperamentIndex < TEMPERAMENTS.length; temperamentIndex++) {
      const temperament = TEMPERAMENTS[temperamentIndex]!;
      for (let leanIndex = 0; leanIndex < STAT_LEANS.length; leanIndex++) {
        const lean = STAT_LEANS[leanIndex]!;
        const variant: FusionVariant = {
          seed: (pairIndex * 80 + temperamentIndex * STAT_LEANS.length + leanIndex + 1) >>> 0,
          temperamentId: temperament.id,
          leanId: lean.id,
        };
        const synthesized = synthesizeChimera(catalog, pair.first, pair.second, variant);
        const independent = synthesizeChimera(independentCatalog, pair.first, pair.second, variant);
        assert.deepEqual(synthesized, independent, `${pair.id} ${temperament.id}/${lean.id}`);
        assert.equal(validateCatalog(catalogWith(synthesized.definition)).ok, true, `${pair.id} validates`);
        assertHardBounds(synthesized.definition.behavior);
        if (synthesized.pairKind === 'support') {
          assert.ok(estimateBehaviorDps(synthesized.definition.behavior) > 0, `${pair.id} has its damage rider`);
        }
        compositions++;
      }
    }
  }
  assert.equal(compositions, 66 * 16 * 5);
});

test('target-dependent donor grafts retain an explicit triggering-target anchor', () => {
  const variant: FusionVariant = {
    seed: 99,
    temperamentId: 'steady',
    leanId: 'balanced',
  };
  const cases: ReadonlyArray<readonly [string, string, string]> = [
    ['porcupine-quills', 'electric-eel-coil', 'chimera-arc'],
    ['porcupine-quills', 'gecko-pads', 'sticky-trail'],
    ['porcupine-quills', 'crab-pincers', 'chimera-impact'],
    ['porcupine-quills', 'skunk-brush', 'stink-cloud'],
  ];

  for (const [first, second, tag] of cases) {
    const synthesized = synthesizeChimera(catalog, first, second, variant);
    const graft = templatesFor(synthesized.definition.behavior).find((template) => template.tag === tag);
    assert.ok(graft, `${tag} graft exists`);
    assert.equal(graft.anchor, 'triggerTarget', `${tag} receives its payload target deterministically`);
  }
});

test('Chimera Lab calibration covers exactly every canonical production pair', () => {
  const pairs = enumerateChimeraPairs(catalog);
  const pairKeys = pairs.map((pair) => `${pair.first}+${pair.second}`).sort();
  assert.deepEqual(Object.keys(CHIMERA_LAB_CALIBRATION).sort(), pairKeys);
  assert.deepEqual(Object.keys(CHIMERA_LAB_CADENCE_CALIBRATION).sort(), pairKeys);

  for (const pair of pairs) {
    const damage = chimeraLabCalibrationMultiplier(pair.first, pair.second);
    const cadence = chimeraLabCadenceMultiplier(pair.second, pair.first);
    assert.ok(Number.isFinite(damage) && damage > 0, `${pair.id} has a positive damage correction`);
    assert.ok(Number.isFinite(cadence) && cadence > 0, `${pair.id} has a positive cadence correction`);
  }
});
