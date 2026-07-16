import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCatalog } from '../../src/definitions.js';
import {
  canonicalChimeraPair,
  chimeraPairId,
  enumerateChimeraPairs,
  isChimeraPairId,
  parseChimeraPairId,
  tryChimeraPairId,
} from '../../src/chimera/chimera-ids.js';
import { STAT_LEANS, isStatLeanId } from '../../src/chimera/leans.js';
import {
  PAIR_BASE_NAMES,
  classifyChimeraPair,
  displayChimeraNameForPair,
  pairBaseName,
} from '../../src/chimera/naming.js';
import {
  CHIMERA_RARITIES,
  TEMPERAMENT_RARITY_WEIGHTS,
  TEMPERAMENT_WEIGHT_TOTAL,
  TEMPERAMENTS,
  isTemperamentId,
  selectTemperamentForTicket,
} from '../../src/chimera/temperaments.js';
import { CHIMERA_FLAVOR_COUNT, rollVariant, splitmix32 } from '../../src/chimera/variant-roll.js';

const catalog = getCatalog();

test('Chimera pair ids use passed catalog order and reject non-canonical input', () => {
  const id = chimeraPairId(catalog, 'monarch-brood', 'porcupine-quills');
  assert.equal(id, 'chimera:porcupine-quills+monarch-brood');
  assert.deepEqual(parseChimeraPairId(catalog, id), {
    first: 'porcupine-quills',
    second: 'monarch-brood',
    id,
  });
  assert.equal(parseChimeraPairId(catalog, 'chimera:monarch-brood+porcupine-quills'), undefined);
  assert.equal(tryChimeraPairId(catalog, 'porcupine-quills', 'porcupine-quills'), undefined);
  assert.equal(tryChimeraPairId(catalog, 'porcupine-quills', 'unknown-trait'), undefined);
  assert.equal(canonicalChimeraPair(catalog, 'unknown-trait', 'bat-ears'), undefined);
  assert.equal(isChimeraPairId(id), true);
  assert.equal(isChimeraPairId('chimera:porcupine-quills'), false);
  assert.throws(() => chimeraPairId(catalog, 'bat-ears', 'bat-ears'), RangeError);
});

test('the current twelve-trait catalog enumerates all sixty-six named pair bases', () => {
  const pairs = enumerateChimeraPairs(catalog);
  assert.equal(pairs.length, 66);
  assert.equal(new Set(pairs.map((pair) => pair.id)).size, 66);
  assert.equal(PAIR_BASE_NAMES.size, 66);

  const names = pairs.map((pair) => pairBaseName(catalog, pair.first, pair.second));
  assert.ok(names.every((name): name is string => name !== undefined));
  assert.equal(new Set(names).size, 66);
  assert.equal(pairBaseName(catalog, 'puffer-pouch', 'bat-ears'), 'The Polite Kidnapping');
  assert.equal(pairBaseName(catalog, 'crab-pincers', 'monarch-brood'), 'Piñata Patrol');
  assert.equal(pairBaseName(catalog, 'armadillo-greaves', 'skunk-brush'), 'The No-Fly Zone');
  assert.equal(classifyChimeraPair(catalog, 'porcupine-quills', 'puffer-pouch'), 'perfect');
  assert.equal(classifyChimeraPair(catalog, 'puffer-pouch', 'bat-ears'), 'support');
  assert.equal(classifyChimeraPair(catalog, 'porcupine-quills', 'electric-eel-coil'), 'wild');
  assert.equal(
    displayChimeraNameForPair(catalog, 'porcupine-quills', 'owl-pinions', 'twitchy'),
    'TWITCHY Quillnado (Common)',
  );
});

test('all sixteen temperaments retain plan tiers, epithets, and exact tier weights', () => {
  assert.deepEqual(TEMPERAMENTS.map((temperament) => [temperament.id, temperament.rarity, temperament.epithet]), [
    ['steady', 'common', 'STEADY'],
    ['twitchy', 'common', 'TWITCHY'],
    ['hearty', 'common', 'HEARTY'],
    ['long-arm', 'common', 'LONG-ARM'],
    ['compact', 'common', 'COMPACT'],
    ['echo', 'uncommon', 'ECHO'],
    ['magnet-hearted', 'uncommon', 'MAGNET-HEARTED'],
    ['skittish', 'uncommon', 'SKITTISH'],
    ['gilded', 'uncommon', 'GILDED'],
    ['doubled-down', 'rare', 'DOUBLED-DOWN'],
    ['bulwark', 'rare', 'BULWARK'],
    ['seismic', 'rare', 'SEISMIC'],
    ['prismatic', 'epic', 'PRISMATIC'],
    ['colossus', 'epic', 'COLOSSUS'],
    ['apex-whisper', 'mythic', 'APEX WHISPER'],
    ['show-off', 'mythic', 'SHOW-OFF'],
  ]);
  assert.deepEqual(TEMPERAMENT_RARITY_WEIGHTS, {
    common: 4_500,
    uncommon: 3_000,
    rare: 1_700,
    epic: 650,
    mythic: 150,
  });
  assert.equal(
    CHIMERA_RARITIES.reduce((total, rarity) => total + TEMPERAMENT_RARITY_WEIGHTS[rarity], 0),
    TEMPERAMENT_WEIGHT_TOTAL,
  );

  const ticketsByRarity = new Map<string, number>();
  for (let ticket = 0; ticket < TEMPERAMENT_WEIGHT_TOTAL; ticket++) {
    const rarity = selectTemperamentForTicket(ticket, 0).rarity;
    ticketsByRarity.set(rarity, (ticketsByRarity.get(rarity) ?? 0) + 1);
  }
  for (const rarity of CHIMERA_RARITIES) {
    assert.equal(ticketsByRarity.get(rarity), TEMPERAMENT_RARITY_WEIGHTS[rarity]);
  }
});

test('five Stat Leans and SplitMix32 variants are deterministic and bounded', () => {
  assert.deepEqual(STAT_LEANS.map((lean) => lean.id), ['balanced', 'swift', 'heavy', 'reaching', 'dense']);
  const pairId = chimeraPairId(catalog, 'porcupine-quills', 'electric-eel-coil');
  const a = rollVariant(0x1234_5678, pairId, 2);
  const b = rollVariant(0x1234_5678, pairId, 2);
  const changedCount = rollVariant(0x1234_5678, pairId, 3);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, changedCount);
  assert.ok(Number.isInteger(a.seed) && a.seed >= 0 && a.seed <= 0xffff_ffff);
  assert.equal(isTemperamentId(a.temperamentId), true);
  assert.equal(isStatLeanId(a.leanId), true);
  assert.ok(a.flavorIndex >= 0 && a.flavorIndex < CHIMERA_FLAVOR_COUNT);
  assert.equal(splitmix32(42), splitmix32(42));
  assert.notEqual(splitmix32(42), splitmix32(43));
});
