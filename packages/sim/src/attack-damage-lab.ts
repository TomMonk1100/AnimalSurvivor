/**
 * Deterministic combat proof lab for developer diagnostics.
 *
 * Each entry runs alone for twenty simulated seconds against a dense bed of
 * stationary, low-health training targets.  It observes health before and
 * after every authoritative simulation step, so its totals come from the
 * combat simulation rather than renderer cues or emitted presentation events.
 *
 * The scripted trait profiles intentionally mirror the currently playable
 * Forest Arsenal command data.  Keeping the scripts at the headless boundary
 * makes the lab usable by browser diagnostics without importing renderer code.
 */
import { DEFAULT_CONFIG, type SimConfig } from './config.js';
import { createSimulation, type Simulation } from './simulation.js';
import { RUN_START_LOADOUT_VERSION } from './run-start-loadout.js';
import type { EntityId, TickInput } from './types.js';
import type {
  TraitRuntimeCommandView,
  TraitRuntimeFactory,
  TraitRuntimePort,
  TraitRuntimeUpdateContext,
} from './trait-runtime-port.js';

/** Versioned public contract for the browser developer damage panel. */
export const ATTACK_DAMAGE_LAB_VERSION = 1 as const;
export const ATTACK_DAMAGE_LAB_DURATION_SECONDS = 20 as const;
export const ATTACK_DAMAGE_LAB_SEED = 0x0d_a7_a6_e1 as const;

const LAB_TARGET_HEALTH = 20;
const LAB_TARGET_COUNT = 96;
const LAB_RUNTIME_FINGERPRINT = 'd0a6e00000000001';
const LAB_HERO_ID = 'greg';

export type AttackDamageLabCategory = 'starter' | 'trait' | 'mythic';
export type AttackDamageLabStatus =
  | 'damage-confirmed'
  | 'damage-missing'
  | 'utility-confirmed'
  | 'utility-missing';

/**
 * One developer-facing proof result. `totalDamage` is effective health damage
 * actually removed from live training enemies, so it is never inferred from a
 * visual effect and is capped by a victim's remaining health on its death hit.
 */
export interface AttackDamageLabResult {
  readonly id: string;
  readonly name: string;
  readonly category: AttackDamageLabCategory;
  readonly durationTicks: number;
  readonly totalDamage: number;
  readonly damagePerSecond: number;
  readonly kills: number;
  /** Authoritative target-health hits; a victim can count again on a later valid hit. */
  readonly hitCount: number;
  /** Number of fixed ticks on which one or more target-health hits occurred. */
  readonly damageTickCount: number;
  readonly firstDamageTick: number | null;
  /** Commands emitted by the isolated trait runtime, not presentation events. */
  readonly commandsEmitted: number;
  /** Mark/displacement observations for an intentionally non-damaging utility. */
  readonly utilityEffectsObserved: number;
  readonly status: AttackDamageLabStatus;
  readonly notes: string;
  /** Useful when comparing a report generated on another machine or branch. */
  readonly finalStateHash: string;
}

export interface AttackDamageLabSummary {
  readonly totalCases: number;
  readonly damageCases: number;
  readonly damageConfirmed: number;
  readonly utilityCases: number;
  readonly utilityConfirmed: number;
  readonly failures: number;
}

export interface AttackDamageLabReport {
  readonly version: typeof ATTACK_DAMAGE_LAB_VERSION;
  readonly seed: number;
  readonly durationSeconds: typeof ATTACK_DAMAGE_LAB_DURATION_SECONDS;
  readonly durationTicks: number;
  readonly targetHealth: number;
  readonly targetCount: number;
  readonly results: readonly AttackDamageLabResult[];
  readonly summary: AttackDamageLabSummary;
}

interface AttackCommandTemplate {
  readonly kind: string;
  readonly targeting: string;
  readonly count?: number;
  readonly damage?: number;
  readonly speed?: number;
  readonly radius?: number;
  readonly strength?: number;
  readonly durationTicks?: number;
  readonly intervalTicks?: number;
  readonly amount?: number;
  readonly arc?: number;
  readonly facing?: number;
  readonly spread?: number;
  readonly jumps?: number;
  readonly pierce?: number;
  readonly range?: number;
  readonly tag?: string;
}

type AttackBehavior =
  | { readonly kind: 'periodic'; readonly periodTicks: number; readonly command: AttackCommandTemplate }
  | { readonly kind: 'movementTrail'; readonly distanceMilliunits: number; readonly command: AttackCommandTemplate }
  | { readonly kind: 'multiPhase'; readonly phases: readonly AttackPhase[] };

interface AttackPhase {
  readonly durationTicks: number;
  readonly command: AttackCommandTemplate;
}

interface AttackDamageLabCase {
  readonly id: string;
  readonly name: string;
  readonly category: AttackDamageLabCategory;
  readonly sourceId: string;
  readonly expectsDamage: boolean;
  readonly notes: string;
  readonly behavior: AttackBehavior | null;
  readonly requiresMovement: boolean;
  /** Runs a hero instinct without allowing its ordinary auto-fire to contribute. */
  readonly suppressBaseAttack: boolean;
  /** Keeps training targets outside Greg's near-miss band for Auto-Fire isolation. */
  readonly avoidRushRakeNearMisses: boolean;
  readonly heroId: 'greg' | 'benny' | 'gracie';
}

interface RuntimeProbe {
  commandsEmitted: number;
}

interface TargetSnapshot {
  readonly id: EntityId;
  readonly hp: number;
  readonly x: number;
  readonly y: number;
  readonly marked: boolean;
}

interface StepObservation {
  readonly damage: number;
  readonly affectedTargets: number;
  readonly movedOrMarkedTargets: number;
}

function periodic(
  periodTicks: number,
  command: AttackCommandTemplate,
): AttackBehavior {
  return { kind: 'periodic', periodTicks, command };
}

function movementTrail(
  distanceMilliunits: number,
  command: AttackCommandTemplate,
): AttackBehavior {
  return { kind: 'movementTrail', distanceMilliunits, command };
}

function multiPhase(...phases: readonly AttackPhase[]): AttackBehavior {
  return { kind: 'multiPhase', phases };
}

function starter(
  id: string,
  name: string,
  heroId: 'greg' | 'benny' | 'gracie',
): AttackDamageLabCase {
  return {
    id,
    name,
    category: 'starter',
    sourceId: id,
    expectsDamage: true,
    notes: 'Uses the selected founder’s live authored starter projectile pattern.',
    behavior: null,
    requiresMovement: false,
    suppressBaseAttack: false,
    avoidRushRakeNearMisses: heroId === 'greg',
    heroId,
  };
}

function trait(
  id: string,
  name: string,
  behavior: AttackBehavior,
  notes: string,
  expectsDamage = true,
): AttackDamageLabCase {
  return {
    id,
    name,
    category: 'trait',
    sourceId: id.slice('trait:'.length).replace(/:bud$|:adapted$/, ''),
    expectsDamage,
    notes,
    behavior,
    requiresMovement: behavior.kind === 'movementTrail',
    suppressBaseAttack: false,
    avoidRushRakeNearMisses: false,
    heroId: LAB_HERO_ID,
  };
}

function mythic(
  id: string,
  name: string,
  behavior: AttackBehavior,
  notes: string,
  expectsDamage = true,
): AttackDamageLabCase {
  return {
    id,
    name,
    category: 'mythic',
    sourceId: id.slice('mythic:'.length),
    expectsDamage,
    notes,
    behavior,
    requiresMovement: behavior.kind === 'movementTrail',
    suppressBaseAttack: false,
    avoidRushRakeNearMisses: false,
    heroId: LAB_HERO_ID,
  };
}

/**
 * Active Forest Arsenal data, expanded to one isolated Bud/Adapted/Mythic
 * combat proof each.  Utility-only entries deliberately remain in the report:
 * a zero damage total for Puffer, Bat, Armadillo, or Midnight is expected,
 * not a hidden combat regression.
 */
const CASES: readonly AttackDamageLabCase[] = Object.freeze([
  starter('starter:greg-auto-fire', "Greg’s Auto-Fire", 'greg'),
  starter('starter:benny-brace-burst', 'Benny’s Brace Burst', 'benny'),
  starter('starter:gracie-keen-dart', 'Gracie’s Keen Dart', 'gracie'),
  {
    id: 'starter:greg-rush-rake',
    name: 'Greg’s Rush Rake',
    category: 'starter',
    sourceId: 'greg-rush-rake',
    expectsDamage: true,
    notes: 'Movement instinct isolated from Auto-Fire by setting the base attack range to zero.',
    behavior: null,
    requiresMovement: true,
    suppressBaseAttack: true,
    avoidRushRakeNearMisses: false,
    heroId: 'greg',
  },

  trait('trait:porcupine-quills:bud', 'Porcupine Quills — Bud', periodic(90, {
    kind: 'spawnProjectileBurst', targeting: 'nearest', count: 3, damage: 4, speed: 8, spread: 0.38, pierce: 1,
  }), 'Three piercing quills every 90 ticks.'),
  trait('trait:porcupine-quills:adapted', 'Porcupine Quills — Adapted', periodic(60, {
    kind: 'spawnProjectileBurst', targeting: 'nearest', count: 5, damage: 6, speed: 10, spread: 0.52, pierce: 2,
  }), 'Five deeper-piercing quills every 60 ticks.'),

  trait('trait:puffer-pouch:bud', 'Puffer Pouch — Bud', periodic(100, {
    kind: 'areaGather', targeting: 'none', radius: 90, strength: 5,
  }), 'Intentional utility-only gather: it repositions threats but has no damage field.', false),
  trait('trait:puffer-pouch:adapted', 'Puffer Pouch — Adapted', periodic(80, {
    kind: 'areaKnockback', targeting: 'none', radius: 140, strength: 9,
  }), 'Intentional utility-only knockback: it repositions threats but has no damage field.', false),

  trait('trait:electric-eel-coil:bud', 'Electric Eel Coil — Bud', periodic(80, {
    kind: 'chainDamage', targeting: 'nearest', damage: 4, jumps: 1, range: 120,
  }), 'Two-target deterministic chain damage.'),
  trait('trait:electric-eel-coil:adapted', 'Electric Eel Coil — Adapted', periodic(52, {
    kind: 'chainDamage', targeting: 'nearest', damage: 5, jumps: 3, range: 150,
  }), 'Four-target deterministic chain damage.'),

  trait('trait:firefly-colony:bud', 'Firefly Colony — Bud', periodic(30, {
    kind: 'orbitingDamage', targeting: 'none', count: 2, damage: 3,
    speed: (Math.PI * 2) / 120, radius: 50, range: 18, facing: 0,
  }), 'Two orbiting contact fireflies; the lab keeps targets at their contact ring.'),
  trait('trait:firefly-colony:adapted', 'Firefly Colony — Adapted', periodic(24, {
    kind: 'orbitingDamage', targeting: 'none', count: 4, damage: 4,
    speed: (Math.PI * 2) / 96, radius: 64, range: 20, facing: 0,
  }), 'Four orbiting contact fireflies; the lab keeps targets at their contact ring.'),

  trait('trait:mantis-scythes:bud', 'Mantis Scythes — Bud', periodic(45, {
    kind: 'meleeArc', targeting: 'nearest', damage: 6, arc: 1.2, range: 68,
  }), 'Auto-aimed close cleave.'),
  trait('trait:mantis-scythes:adapted', 'Mantis Scythes — Adapted', periodic(30, {
    kind: 'meleeArc', targeting: 'nearest', damage: 10, arc: 1.6, range: 88,
  }), 'Wider, stronger close cleave.'),

  trait('trait:gecko-pads:bud', 'Gecko Pads — Bud', movementTrail(150_000, {
    kind: 'spawnZone', targeting: 'none', radius: 38, amount: 3,
    durationTicks: 150, intervalTicks: 24, tag: 'gecko-pad',
  }), 'Movement-gated trail; the lab walks Greg continuously so pads must pulse damage.'),
  trait('trait:gecko-pads:adapted', 'Gecko Pads — Adapted', movementTrail(110_000, {
    kind: 'spawnZone', targeting: 'none', radius: 52, amount: 5,
    durationTicks: 180, intervalTicks: 18, tag: 'gecko-pad',
  }), 'Movement-gated trail with a larger, faster-pulsing pad.'),

  trait('trait:owl-pinions:bud', 'Owl Pinions — Bud', periodic(95, {
    kind: 'spawnProjectileBurst', targeting: 'nearest', count: 4, damage: 3, speed: 7, spread: 0.3,
  }), 'Four-ribbon wing volley.'),
  trait('trait:owl-pinions:adapted', 'Owl Pinions — Adapted', periodic(70, {
    kind: 'spawnProjectileBurst', targeting: 'nearest', count: 7, damage: 5, speed: 10, spread: 0.3,
  }), 'Seven-ribbon wing volley.'),

  trait('trait:bat-ears:bud', 'Bat Ears — Bud', periodic(120, {
    kind: 'markTargets', targeting: 'densestCluster', count: 3, radius: 200, tag: 'echo-mark',
  }), 'Intentional utility-only target marking; it should mark targets, not directly damage them.', false),
  trait('trait:bat-ears:adapted', 'Bat Ears — Adapted', periodic(90, {
    kind: 'markTargets', targeting: 'densestCluster', count: 5, radius: 260, tag: 'echo-mark',
  }), 'Intentional utility-only target marking; it should mark targets, not directly damage them.', false),

  trait('trait:crab-pincers:bud', 'Crab Pincers — Bud', periodic(100, {
    kind: 'applyAreaDamage', targeting: 'nearest', radius: 50, damage: 5,
  }), 'Close area crush.'),
  trait('trait:crab-pincers:adapted', 'Crab Pincers — Adapted', periodic(75, {
    kind: 'applyAreaDamage', targeting: 'nearest', radius: 65, damage: 8,
  }), 'Larger close area crush.'),

  trait('trait:armadillo-greaves:bud', 'Armadillo Greaves — Bud', periodic(140, {
    kind: 'areaKnockback', targeting: 'none', radius: 70, strength: 6,
  }), 'Intentional utility-only knockback; it should displace targets without direct damage.', false),
  trait('trait:armadillo-greaves:adapted', 'Armadillo Greaves — Adapted', periodic(100, {
    kind: 'areaKnockback', targeting: 'none', radius: 90, strength: 10,
  }), 'Intentional utility-only knockback; it should displace targets without direct damage.', false),

  trait('trait:skunk-brush:bud', 'Skunk Brush — Bud', periodic(160, {
    kind: 'spawnZone', targeting: 'none', radius: 70, amount: 2,
    durationTicks: 120, intervalTicks: 30, tag: 'stink-cloud',
  }), 'Persistent damaging stink-cloud.'),
  trait('trait:skunk-brush:adapted', 'Skunk Brush — Adapted', periodic(120, {
    kind: 'spawnZone', targeting: 'none', radius: 95, amount: 4,
    durationTicks: 140, intervalTicks: 24, tag: 'stink-cloud',
  }), 'Wider, more frequent persistent stink-cloud.'),

  trait('trait:monarch-brood:bud', 'Monarch Brood — Bud', periodic(60, {
    kind: 'orbitingDamage', targeting: 'none', count: 2, damage: 2,
    speed: (Math.PI * 2) / 180, radius: 72, range: 14, facing: Math.PI / 4,
  }), 'Two wide-orbit contact monarchs; this is a real damage proof, not a visual cue.'),
  trait('trait:monarch-brood:adapted', 'Monarch Brood — Adapted', periodic(45, {
    kind: 'orbitingDamage', targeting: 'none', count: 3, damage: 3,
    speed: (Math.PI * 2) / 150, radius: 84, range: 16, facing: Math.PI / 4,
  }), 'Three wide-orbit contact monarchs; this is a real damage proof, not a visual cue.'),

  mythic('mythic:thornstorm-mantle', 'Thornstorm Mantle — Mythic', multiPhase(
    { durationTicks: 20, command: { kind: 'telegraph', targeting: 'none', radius: 140, durationTicks: 20, tag: 'thornstorm-inhale' } },
    { durationTicks: 15, command: { kind: 'areaGather', targeting: 'none', radius: 140, strength: 9 } },
    { durationTicks: 55, command: { kind: 'radialProjectileBurst', targeting: 'none', count: 16, damage: 8, speed: 8 } },
  ), 'Mythic cycle: telegraph, gather, then radial quill exhale.'),
  mythic('mythic:thunderbug-dynamo', 'Thunderbug Dynamo — Mythic', multiPhase(
    { durationTicks: 18, command: { kind: 'telegraph', targeting: 'none', radius: 150, durationTicks: 18, tag: 'thunderbug-charge' } },
    { durationTicks: 72, command: { kind: 'chainDamage', targeting: 'nearest', damage: 9, jumps: 7, range: 185 } },
  ), 'Mythic cycle: charge telegraph, then eight-target chain discharge.'),
  mythic('mythic:razorstep-chimera', 'Razorstep Chimera — Mythic', movementTrail(90_000, {
    kind: 'spawnZone', targeting: 'none', radius: 58, amount: 7,
    durationTicks: 200, intervalTicks: 14, tag: 'razorstep-scythe-pad',
  }), 'Movement-gated Mythic trail with high cadence scythe-pad damage.'),
  mythic('mythic:midnight-radar', 'Midnight Radar — Mythic', periodic(100, {
    kind: 'markTargets', targeting: 'densestCluster', count: 6, radius: 320, tag: 'night-vision',
  }), 'Intentional utility-only Mythic marking; it should mark targets without direct damage.', false),
  mythic('mythic:meteor-mauler', 'Meteor Mauler — Mythic', periodic(90, {
    kind: 'applyAreaDamage', targeting: 'nearest', radius: 100, damage: 20,
  }), 'Large area-damage Mythic crush.'),
  mythic('mythic:royal-stinkcloud', 'Royal Stinkcloud — Mythic', periodic(140, {
    kind: 'spawnZone', targeting: 'none', radius: 110, amount: 6,
    durationTicks: 160, intervalTicks: 18, tag: 'royal-stink',
  }), 'Large persistent Mythic stink-cloud.'),
]);

/** Number of independently exercised entries in the launch attack proof. */
export const ATTACK_DAMAGE_LAB_CASE_COUNT = CASES.length;

function materializeCommand(
  template: AttackCommandTemplate,
  sourceId: string,
  context: TraitRuntimeUpdateContext,
): TraitRuntimeCommandView {
  return {
    kind: template.kind,
    sourceId,
    tick: context.tick,
    targeting: template.targeting,
    originX: context.playerX,
    originY: context.playerY,
    dirX: 0,
    dirY: 0,
    count: template.count ?? 0,
    damage: template.damage ?? 0,
    speed: template.speed ?? 0,
    radius: template.radius ?? 0,
    strength: template.strength ?? 0,
    facing: template.facing ?? 0,
    spread: template.spread ?? 0,
    range: template.range ?? 0,
    ...(template.durationTicks === undefined ? {} : { durationTicks: template.durationTicks }),
    ...(template.intervalTicks === undefined ? {} : { intervalTicks: template.intervalTicks }),
    ...(template.amount === undefined ? {} : { amount: template.amount }),
    ...(template.arc === undefined ? {} : { arc: template.arc }),
    ...(template.jumps === undefined ? {} : { jumps: template.jumps }),
    ...(template.pierce === undefined ? {} : { pierce: template.pierce }),
    ...(template.tag === undefined ? {} : { tag: template.tag }),
  };
}

/**
 * Minimal deterministic scheduler used only by this lab. It models the same
 * periodic, movement-trail, and multi-phase cadence that the active content
 * sends through the production trait-command executor.
 */
class ScriptedAttackRuntime implements TraitRuntimePort {
  private lastTick = 0;
  private periodicCooldown = 0;
  private movementCharges = 0;
  private phase = 0;
  private phaseTicks = 0;

  constructor(
    private readonly attackCase: AttackDamageLabCase,
    private readonly probe: RuntimeProbe,
  ) {}

  update(context: TraitRuntimeUpdateContext) {
    if (context.tick !== this.lastTick + 1) {
      throw new RangeError(`attack damage lab runtime expected tick ${this.lastTick + 1}, received ${context.tick}`);
    }
    this.lastTick = context.tick;
    const behavior = this.attackCase.behavior;
    if (behavior === null) return emptyCommandSource();

    const commands: TraitRuntimeCommandView[] = [];
    switch (behavior.kind) {
      case 'periodic':
        if (this.periodicCooldown <= 0) {
          this.periodicCooldown = behavior.periodTicks;
          commands.push(materializeCommand(behavior.command, this.attackCase.sourceId, context));
        }
        this.periodicCooldown--;
        break;
      case 'movementTrail': {
        if (context.distanceMovedThisTick > 0) {
          this.movementCharges += Math.round(context.distanceMovedThisTick * 1000);
          if (this.movementCharges >= behavior.distanceMilliunits) {
            this.movementCharges -= behavior.distanceMilliunits;
            commands.push(materializeCommand(behavior.command, this.attackCase.sourceId, context));
          }
        }
        break;
      }
      case 'multiPhase': {
        const activePhase = behavior.phases[this.phase];
        if (activePhase === undefined) throw new Error('attack damage lab multi-phase index is invalid');
        if (this.phaseTicks === 0) {
          commands.push(materializeCommand(activePhase.command, this.attackCase.sourceId, context));
        }
        this.phaseTicks++;
        if (this.phaseTicks >= activePhase.durationTicks) {
          this.phaseTicks = 0;
          this.phase = (this.phase + 1) % behavior.phases.length;
        }
        break;
      }
    }
    this.probe.commandsEmitted += commands.length;
    return commandSource(commands);
  }

  offers(_count: number) { return []; }

  applyUpgrade(traitId: string) {
    return {
      outcome: { ok: false as const, kind: 'unknownTrait' as const, traitId },
      evolved: null,
    };
  }

  visualState() { return []; }

  hash(): string {
    return this.lastTick.toString(16).padStart(16, '0');
  }

  fingerprint(): string { return LAB_RUNTIME_FINGERPRINT; }
}

function emptyCommandSource() {
  return commandSource([]);
}

function commandSource(commands: readonly TraitRuntimeCommandView[]) {
  return {
    length: commands.length,
    at(index: number): TraitRuntimeCommandView {
      const command = commands[index];
      if (command === undefined) throw new RangeError(`attack damage lab command index out of range: ${index}`);
      return command;
    },
  };
}

function createLabConfig(starterDamage: boolean, suppressBaseAttack: boolean): SimConfig {
  return {
    ...DEFAULT_CONFIG,
    worldWidth: 8_000,
    worldHeight: 1_000,
    gridCellSize: 50,
    enemyCap: 192,
    projectileCap: 256,
    pickupCap: 96,
    zoneCap: 96,
    waves: [],
    xpThresholds: [],
    player: {
      ...DEFAULT_CONFIG.player,
      startX: 2_000,
      startY: 500,
      maxHp: 1_000_000,
      pickupRadius: 0,
    },
    weapon: {
      ...DEFAULT_CONFIG.weapon,
      // Trait cases must not have an auto-fire projectile contribute to a
      // trait’s total. Starter cases retain their current authored damage.
      damage: starterDamage ? DEFAULT_CONFIG.weapon.damage : 0,
      // Rush Rake uses the starter projectile's damage fields internally. A
      // zero range isolates that movement instinct from ordinary Auto-Fire.
      range: suppressBaseAttack ? 0 : DEFAULT_CONFIG.weapon.range,
    },
  };
}

function createTraitFactory(attackCase: AttackDamageLabCase, probe: RuntimeProbe): TraitRuntimeFactory {
  return () => new ScriptedAttackRuntime(attackCase, probe);
}

function spawnTrainingTarget(sim: Simulation, x: number, y: number): boolean {
  const slot = sim.enemies.spawn();
  if (slot < 0) return false;
  const data = sim.enemies.data;
  data.posX[slot] = x;
  data.posY[slot] = y;
  data.velX[slot] = 0;
  data.velY[slot] = 0;
  data.hp[slot] = LAB_TARGET_HEALTH;
  data.maxHp[slot] = LAB_TARGET_HEALTH;
  data.speed[slot] = 0;
  data.radius[slot] = 3;
  data.touchDamage[slot] = 0;
  data.contactCooldown[slot] = 0;
  data.zoneDamageCooldown[slot] = 0;
  data.archetype[slot] = 0;
  data.xpDrop[slot] = 0;
  data.marked[slot] = 0;
  sim.grid.insert(sim.enemies.idOf(slot), x, y);
  return true;
}

function seedTrainingTargets(sim: Simulation, attackCase: AttackDamageLabCase): void {
  const countToAdd = Math.max(0, LAB_TARGET_COUNT - sim.enemies.data.count);
  for (let index = 0; index < countToAdd; index++) {
    const x = attackCase.requiresMovement
      ? sim.player.x + 8 + (index % 12) * 2
      : sim.player.x + ringOffsetX(index, attackCase.avoidRushRakeNearMisses ? 48 : 12);
    const y = attackCase.requiresMovement
      ? sim.player.y - 28 + Math.floor(index / 12) * 7
      : sim.player.y + ringOffsetY(index, attackCase.avoidRushRakeNearMisses ? 48 : 12);
    if (!spawnTrainingTarget(sim, x, y)) return;
  }
}

/**
 * A movement-trail needs fresh victims at the hero's current footprint. The
 * lab relocates only its inert training dummies before a tick; their movement
 * remains a fixture setup step and is not attributed to utility observations.
 */
function refreshMovingTrainingTargets(sim: Simulation, attackCase: AttackDamageLabCase): void {
  if (!attackCase.requiresMovement) return;
  const data = sim.enemies.data;
  let formationIndex = 0;
  for (let slot = 0; slot < data.capacity; slot++) {
    if (data.alive[slot] === 0) continue;
    data.posX[slot] = sim.player.x + 8 + (formationIndex % 12) * 2;
    data.posY[slot] = sim.player.y - 28 + Math.floor(formationIndex / 12) * 7;
    data.velX[slot] = 0;
    data.velY[slot] = 0;
    sim.grid.update(sim.enemies.idOf(slot), data.posX[slot]!, data.posY[slot]!);
    formationIndex++;
  }
}

function ringOffsetX(index: number, baseRadius: number): number {
  const ring = Math.floor(index / 16);
  const angle = (index % 16) * (Math.PI * 2 / 16) + ring * 0.19;
  return Math.cos(angle) * (baseRadius + ring * 17);
}

function ringOffsetY(index: number, baseRadius: number): number {
  const ring = Math.floor(index / 16);
  const angle = (index % 16) * (Math.PI * 2 / 16) + ring * 0.19;
  return Math.sin(angle) * (baseRadius + ring * 17);
}

function snapshotTargets(sim: Simulation): TargetSnapshot[] {
  const snapshots: TargetSnapshot[] = [];
  const data = sim.enemies.data;
  for (let slot = 0; slot < data.capacity; slot++) {
    if (data.alive[slot] === 0) continue;
    snapshots.push({
      id: sim.enemies.idOf(slot),
      hp: data.hp[slot]!,
      x: data.posX[slot]!,
      y: data.posY[slot]!,
      marked: data.marked[slot] === 1,
    });
  }
  return snapshots;
}

function observeAuthoritativeDamage(sim: Simulation, before: readonly TargetSnapshot[]): StepObservation {
  let damage = 0;
  let affectedTargets = 0;
  let movedOrMarkedTargets = 0;
  const data = sim.enemies.data;
  for (const target of before) {
    const slot = sim.enemies.slotOf(target.id);
    if (slot < 0) {
      // The victim was removed by an authoritative kill callback. Its complete
      // remaining health is effective damage from this exact simulation step.
      damage += target.hp;
      affectedTargets++;
      continue;
    }
    const hp = data.hp[slot]!;
    if (hp < target.hp) {
      damage += target.hp - hp;
      affectedTargets++;
    }
    const dx = data.posX[slot]! - target.x;
    const dy = data.posY[slot]! - target.y;
    if (
      dx * dx + dy * dy > 1e-6
      || (!target.marked && data.marked[slot] === 1)
    ) {
      movedOrMarkedTargets++;
    }
  }
  return { damage, affectedTargets, movedOrMarkedTargets };
}

function inputFor(attackCase: AttackDamageLabCase): TickInput {
  return {
    moveX: attackCase.requiresMovement ? 1 : 0,
    moveY: 0,
    paused: false,
  };
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function runCase(attackCase: AttackDamageLabCase): AttackDamageLabResult {
  const probe: RuntimeProbe = { commandsEmitted: 0 };
  const sim = createSimulation(
    createLabConfig(attackCase.category === 'starter', attackCase.suppressBaseAttack),
    ATTACK_DAMAGE_LAB_SEED,
    {
    runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId: attackCase.heroId, maxHpBonus: 0 },
    ...(attackCase.behavior === null ? {} : { traitRuntimeFactory: createTraitFactory(attackCase, probe) }),
    },
  );
  const durationTicks = DEFAULT_CONFIG.hz * ATTACK_DAMAGE_LAB_DURATION_SECONDS;
  let totalDamage = 0;
  let kills = 0;
  let hitCount = 0;
  let damageTickCount = 0;
  let firstDamageTick: number | null = null;
  let utilityEffectsObserved = 0;

  for (let tick = 0; tick < durationTicks; tick++) {
    seedTrainingTargets(sim, attackCase);
    refreshMovingTrainingTargets(sim, attackCase);
    const before = snapshotTargets(sim);
    const events = sim.step(inputFor(attackCase));
    const observation = observeAuthoritativeDamage(sim, before);
    totalDamage += observation.damage;
    kills += events.kills;
    hitCount += observation.affectedTargets;
    utilityEffectsObserved += observation.movedOrMarkedTargets;
    if (observation.damage > 0) {
      damageTickCount++;
      if (firstDamageTick === null) firstDamageTick = sim.tick;
    }
  }

  const status: AttackDamageLabStatus = attackCase.expectsDamage
    ? totalDamage > 0 ? 'damage-confirmed' : 'damage-missing'
    : probe.commandsEmitted > 0 && utilityEffectsObserved > 0 ? 'utility-confirmed' : 'utility-missing';
  const notes = attackCase.expectsDamage
    ? attackCase.notes
    : `${attackCase.notes} Observed ${utilityEffectsObserved} authoritative utility target changes.`;
  return {
    id: attackCase.id,
    name: attackCase.name,
    category: attackCase.category,
    durationTicks,
    totalDamage: roundMetric(totalDamage),
    damagePerSecond: roundMetric(totalDamage / ATTACK_DAMAGE_LAB_DURATION_SECONDS),
    kills,
    hitCount,
    damageTickCount,
    firstDamageTick,
    commandsEmitted: probe.commandsEmitted,
    utilityEffectsObserved,
    status,
    notes,
    finalStateHash: sim.hash(),
  };
}

function summarize(results: readonly AttackDamageLabResult[]): AttackDamageLabSummary {
  let damageCases = 0;
  let damageConfirmed = 0;
  let utilityCases = 0;
  let utilityConfirmed = 0;
  for (const result of results) {
    if (result.status === 'damage-confirmed' || result.status === 'damage-missing') {
      damageCases++;
      if (result.status === 'damage-confirmed') damageConfirmed++;
    } else {
      utilityCases++;
      if (result.status === 'utility-confirmed') utilityConfirmed++;
    }
  }
  return {
    totalCases: results.length,
    damageCases,
    damageConfirmed,
    utilityCases,
    utilityConfirmed,
    failures: damageCases - damageConfirmed + utilityCases - utilityConfirmed,
  };
}

/**
 * Run every launch starter, independent trait stage, and Mythic in isolation.
 * This is synchronous and deterministic by design, intended for an opt-in
 * developer panel or CI test rather than the player-facing render loop.
 */
export function runAttackDamageLab(): readonly AttackDamageLabResult[] {
  return runAttackDamageLabReport().results;
}

/** Full metadata companion to `runAttackDamageLab()` for CI and issue reports. */
export function runAttackDamageLabReport(): AttackDamageLabReport {
  const results = CASES.map((attackCase) => runCase(attackCase));
  return {
    version: ATTACK_DAMAGE_LAB_VERSION,
    seed: ATTACK_DAMAGE_LAB_SEED,
    durationSeconds: ATTACK_DAMAGE_LAB_DURATION_SECONDS,
    durationTicks: DEFAULT_CONFIG.hz * ATTACK_DAMAGE_LAB_DURATION_SECONDS,
    targetHealth: LAB_TARGET_HEALTH,
    targetCount: LAB_TARGET_COUNT,
    results,
    summary: summarize(results),
  };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/** Readable text for a dev console, copied issue report, or headless CI log. */
export function formatAttackDamageLabReport(report: AttackDamageLabReport = runAttackDamageLabReport()): string {
  const header = [
    `Attack Damage Proof Lab v${report.version}`,
    `seed ${report.seed} • ${report.durationSeconds}s / ${report.durationTicks} ticks per case`,
    `training targets: ${report.targetCount} × ${report.targetHealth} HP`,
  ].join('\n');
  const lines = report.results.map((result) => {
    const state = result.status === 'damage-confirmed' || result.status === 'utility-confirmed'
      ? 'PASS'
      : 'FAIL';
    return [
      state,
      result.category.toUpperCase(),
      result.name,
      `${formatNumber(result.totalDamage)} dmg`,
      `${result.kills} kills`,
      `${result.hitCount} hits`,
      result.status,
    ].join(' | ');
  });
  const summary = report.summary;
  return [
    header,
    ...lines,
    `Summary: ${summary.damageConfirmed}/${summary.damageCases} damage cases, ${summary.utilityConfirmed}/${summary.utilityCases} utility cases, ${summary.failures} failures.`,
  ].join('\n');
}
