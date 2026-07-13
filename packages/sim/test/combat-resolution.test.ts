import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  armorDamageMultiplier,
  createCombatDamageResolver,
  createCombatPresentationEventBuffer,
} from '../src/combat-resolution.js';
import { createEnemyPool } from '../src/pools.js';
import type { PlayerState, Rng, RngState } from '../src/types.js';

class ChanceRng implements Rng {
  private readonly outcomes: boolean[];

  constructor(outcomes: readonly boolean[]) {
    this.outcomes = [...outcomes];
  }

  nextUint32(): number { return 0; }
  float(): number { return 0; }
  int(_minIncl: number, _maxExcl: number): number { return 0; }
  chance(_p: number): boolean { return this.outcomes.shift() ?? false; }
  pickIndex(_length: number): number { return 0; }
  pickWeighted(_weights: readonly number[]): number { return 0; }
  getState(): RngState { return { a: 0, b: 0, c: 0, d: 0 }; }
  setState(_state: RngState): void {}
}

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    x: 10,
    y: 20,
    hp: 100,
    maxHp: 100,
    speed: 0,
    radius: 4,
    pickupRadius: 20,
    xp: 0,
    level: 1,
    invulnTicks: 0,
    alive: true,
    critChance: 0.05,
    critMultiplier: 2,
    dodgeChance: 0,
    armor: 0,
    shield: 0,
    shieldMax: 0,
    shieldRechargeDelayTicks: 0,
    shieldRechargeTicksRemaining: 0,
    shieldRechargePerTick: 0,
    ...overrides,
  };
}

test('outgoing crit is resolved once and reports the real enemy hit before cleanup', () => {
  const actor = player({ critChance: 1, critMultiplier: 2 });
  const events = createCombatPresentationEventBuffer();
  const resolver = createCombatDamageResolver({
    player: actor,
    rng: new ChanceRng([true]),
    eventBuffer: events,
    getTick: () => 42,
  });
  const enemies = createEnemyPool(2);
  const slot = enemies.spawn();
  assert.notEqual(slot, -1);
  enemies.data.posX[slot] = 30;
  enemies.data.posY[slot] = 40;
  enemies.data.hp[slot] = 25;
  enemies.data.maxHp[slot] = 25;

  const resolved = resolver.resolveOutgoingDamage(12, 'fox-swipe');
  assert.deepEqual(resolved, { amount: 24, critical: true });
  assert.equal(resolver.damageEnemy(enemies, slot, resolved, 'fox-swipe'), false);
  assert.equal(enemies.data.hp[slot], 1);
  assert.deepEqual(events.events[0], {
    kind: 'enemyHit', tick: 42, x: 30, y: 40, amount: 24,
    critical: true, sourceId: 'fox-swipe', targetId: enemies.idOf(slot), pickupKind: '',
  });
});

test('incoming hits resolve in dodge -> armor -> shield -> health order', () => {
  const actor = player({ dodgeChance: 0.5, armor: 100, shield: 20, shieldMax: 20 });
  const events = createCombatPresentationEventBuffer();
  const resolver = createCombatDamageResolver({
    player: actor,
    rng: new ChanceRng([true, false]),
    eventBuffer: events,
    getTick: () => 8,
  });

  const dodged = resolver.damagePlayer(100, 'enemy-contact', 12);
  assert.equal(dodged.dodged, true);
  assert.equal(actor.hp, 100);
  assert.equal(actor.shield, 20);
  assert.equal(actor.invulnTicks, 0, 'a dodge does not fake an invulnerability hit');
  assert.equal(events.events[0]?.kind, 'dodge');

  const landed = resolver.damagePlayer(100, 'enemy-contact', 12);
  assert.equal(armorDamageMultiplier(100), 0.5);
  assert.equal(landed.shieldAbsorbed, 20);
  assert.equal(landed.healthDamage, 30);
  assert.equal(actor.shield, 0);
  assert.equal(actor.hp, 70);
  assert.equal(actor.invulnTicks, 12);
  assert.deepEqual(events.events.slice(1).map((event) => event.kind), ['armorBlock', 'shieldAbsorb', 'shieldBreak', 'playerHit']);
  assert.equal(events.events[1]?.amount, 50, 'armor feedback reports the actual prevented damage');
});

test('shield grants/recharge and feedback buffer capacity stay bounded', () => {
  const actor = player({ shieldMax: 20, shield: 0, shieldRechargePerTick: 5 });
  const events = createCombatPresentationEventBuffer(2);
  const resolver = createCombatDamageResolver({
    player: actor,
    rng: new ChanceRng([]),
    eventBuffer: events,
    getTick: () => 3,
  });

  assert.equal(resolver.grantShield(15, 'fluffy-shield'), 15);
  assert.equal(actor.shield, 15);
  actor.shield = 0;
  assert.equal(resolver.stepShieldRecharge(), 5);
  assert.equal(actor.shield, 5);
  resolver.emitPickup(actor.x, actor.y, 'world-food', 'food', 5);
  assert.equal(events.events.length, 2, 'fixed presentation capacity never grows under effect spam');
  assert.equal(events.dropped, 1);
});
