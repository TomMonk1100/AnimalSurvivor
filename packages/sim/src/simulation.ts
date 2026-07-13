/**
 * Agent D (integrator) — wires the frozen module layer (Agents A-C) into a
 * single deterministic Simulation. This file, src/index.ts, and the test/
 * bench files that accompany it are the only files this agent owns.
 *
 * ---------------------------------------------------------------------------
 * DETERMINISM CONTRACT
 * ---------------------------------------------------------------------------
 * step(input) executes these sub-steps IN THIS EXACT ORDER, every tick:
 *
 *  1. Validate and clamp `input` components into [-1,1], then record that
 *     canonical input. Paused ticks are recorded too
 *     (so a replay reproduces the exact same paused/unpaused schedule).
 *  2. If input.paused: reset the reusable SimEvents to empty and return it
 *     immediately. The clock, rng, weapon cooldown, enemy contact cooldowns,
 *     and every entity's component data are left completely untouched. No
 *     rng draw happens on a paused tick.
 *  3. clock.advance().
 *  4. Reset the reusable SimEvents in place (clear levelUps, zero counters).
 *     The same object is returned every tick; callers must consume events
 *     before the next non-paused step() call overwrites them.
 *  5. If player.alive: decrement player.invulnTicks (floor 0); compute this
 *     tick's move direction from (input.moveX, input.moveY) — normalized
 *     (scaled to unit length) only if its length exceeds 1, left as-is
 *     (preserving analog magnutide) otherwise; advance player position by
 *     dir * player.speed * dt; clamp position to world bounds. This
 *     direction is reused verbatim as TargetContext.moveDir in step 8.
 *  6. waveDirector.step(clock.tick, rng, enemies.data.count, spawnFn). The
 *     only rng draws here are the director's internal pickWeighted() call
 *     and, inside spawnFn, a single rng.float() draw for the spawn angle —
 *     always in that order, and only when a spawn is actually attempted.
 *  7. stepEnemies(...) — enemy movement, grid.update, contact damage.
 *  8. Weapon: decrement weaponCooldown down to zero; when it is ready AND
 *     player.alive, query the nearest live target in range and, if found,
 *     attempt to fire a projectile at it. The cooldown is reset to
 *     config.weapon.cooldownTicks ONLY on a successful fire (found a target
 *     AND the projectile pool had room) — otherwise it is left <= 0 so the
 *     shot is retried next tick without any extra delay.
 *  9. stepProjectiles(...) — projectile movement/collision. killEnemy(slot)
 *     (passed in as the callback) reads the enemy's position and xpDrop,
 *     removes it from the grid, despawns it from the pool, and then
 *     attempts to spawn a pickup at that position; a full pickup pool
 *     silently drops the xp (counted in a diagnostic-only counter, excluded
 *     from the state hash).
 * 10. While alive, collectPickups(...) then applyXpThresholds(...).
 * 11. Return the (already-populated) events object.
 *
 * RNG CONSUMERS (only these two, always in this relative order per tick):
 *   a) waveDirector's internal weighted archetype pick (only when a regular
 *      spawn slot is due and aliveEnemies < segment.maxAlive).
 *   b) spawnFn's single rng.float() draw for the perimeter spawn angle
 *      (consumed even if the pool turns out to be full, since the angle is
 *      computed before the spawn attempt — see spawnFn below).
 * Nothing else in this module or in the wired-in modules touches rng.
 *
 * GRID INVARIANT: only enemies are ever inserted into `grid` (projectiles and
 * pickups are never gridded in this simulation — collision/collection uses a
 * hitRadius+maxEnemyRadius query against the same enemy grid, and pickups use
 * a linear scan). killEnemy() removes an id from the grid BEFORE despawning
 * the pool slot, so the grid never holds a dead id across a tick boundary,
 * and insert/remove stay strictly paired with spawn/despawn (the grid throws
 * on update/remove of an unknown id).
 *
 * STATE HASH — canonical byte order (see hash() below), all via HashWriter:
 *   u32 CONFIG_VERSION, str configFingerprint
 *   u32 tick
 *   u32 rngState.a, u32 rngState.b, u32 rngState.c, u32 rngState.d
 *   player: f32 x, f32 y, f32 hp, f32 maxHp, f32 speed, f32 radius,
 *           f32 pickupRadius, f64 xp, u32 level, u32 invulnTicks, u8 alive
 *   u32 weaponCooldown, f32 lastMoveDirX, f32 lastMoveDirY
 *   for each pool in order [enemies, projectiles, pickups, zones]:
 *     u32 count
 *     for slot in 0..capacity-1:
 *       u8 alive[slot], u16 generation[slot]
 *       IF alive[slot]: every gameplay component for that slot, in this
 *       fixed order (f32 for float arrays, u16/u8 for int arrays):
 *         enemies:     posX, posY, velX, velY, hp, maxHp, speed, radius,
 *                      touchDamage, contactCooldown(u16),
 *                      zoneDamageCooldown(u16), archetype(u8),
 *                      xpDrop, marked(u8)
 *         projectiles: posX, posY, velX, velY, damage, lifetime(u16),
 *                      hitRadius, pierce(u8), hitCount/history, faction(u8)
 *         pickups:     posX, posY, xp, radius
 *         zones:       posX, posY, radius, damage, lifetime(u16),
 *                      intervalTicks(u16), pulseCooldown(u16), tag(u8)
 * EXCLUDED from the hash (diagnostics only): highWater, queryCount,
 * spawnAttempts/spawnRejections, and this module's xpLostToFullPickupPool
 * counter. Object property iteration is never used for hashing — every
 * field is read positionally off the typed arrays in the fixed order above.
 */
import {
  MAX_PROJECTILE_HIT_HISTORY,
  NO_ENTITY,
  type EntityId,
  type PlayerState,
  type Pool,
  type EnemyPool,
  type ProjectilePool,
  type PickupPool,
  type PowerPickupPool,
  type SimEvents,
  type SpatialGrid,
  type TickInput,
  type ReplayRecord,
  type UpgradeSelection,
  type WaveDirector,
  type ZonePool,
} from './types.js';
import type { SimConfig } from './config.js';
import { CONFIG_VERSION, fingerprintConfig } from './config.js';
import { createRng } from './rng.js';
import { createClock } from './clock.js';
import { createReplayRecorder, deserializeReplay, serializeReplay } from './replay.js';
import { createHashWriter } from './state-hash.js';
import {
  createEnemyPool,
  createProjectilePool,
  createPickupPool,
  createPowerPickupPool,
  createZonePool,
} from './pools.js';
import { createSpatialGrid } from './spatial-grid.js';
import { selectPriorityTarget } from './targeting.js';
import { createWaveDirector } from './wave-director.js';
import {
  applyXpThresholds,
  attractPickups,
  collectPickups,
  spawnProjectile,
  stepEnemies,
  stepProjectiles,
} from './combat.js';
import {
  COMBAT_DAMAGE_SOURCE,
  createCombatDamageResolver,
  createCombatPresentationEventBuffer,
  type CombatDamageResolver,
  type CombatPresentationEventView,
} from './combat-resolution.js';
import {
  collectPowerPickups,
  powerPickupCapacityForXpCap,
  powerPickupKindForDeathRoll,
  POWER_PICKUP_DROP_ROLL_RANGE,
  spawnPowerPickup as spawnWorldPowerPickup,
  type PowerPickupKind,
} from './power-pickups.js';
import {
  MAX_CHAIN_JUMPS,
  MAX_ORBITING_DAMAGE_COUNT,
  createTraitCommandExecutor,
} from './trait-command-executor.js';
import { createZoneStepper } from './zones.js';
import {
  createTraitRuntimePort,
  type TraitRuntimeCommandSource,
  type TraitRuntimeCommandView,
  type TraitRuntimeFactory,
  type TraitFusionOfferView,
  type TraitFuseResultView,
  type TraitVisualAttachmentView,
} from './trait-runtime-port.js';
import {
  createRunUpgradeQueue,
  type RunUpgradeOfferView,
} from './run-upgrade-queue.js';
import type { UniversalUpgradeCatalog } from './universal-upgrades.js';
import {
  fingerprintRunStartLoadout,
  getHeroBasicAttackDefinition,
  getHeroDefinition,
  normalizeRunStartLoadout,
  type RunStartLoadout,
} from './run-start-loadout.js';
import {
  createRunDirectorPort,
  type RunDirectorEventView,
  type RunDirectorFactory,
  type RunOutcomeView,
  type RunPhaseView,
} from './run-director-port.js';
import {
  createRunSpawnAdapter,
  RUN_ENEMY_ROLE,
  type DirectedEnemySpawn,
  type RunEnemyRole,
  type RunSpawnAdapterOptions,
} from './run-spawn-adapter.js';
import { createEnemyBehaviorState, resetEnemyBehavior } from './enemy-behavior.js';
import {
  createBennyBraceState,
  stepBennyBrace as reduceBennyBrace,
  type BennyBraceState,
} from './instincts/benny-brace.js';
import {
  createGracieScoutState,
  stepGracieScout as reduceGracieScout,
  type GracieScoutTarget,
  type GracieScoutState,
} from './instincts/gracie-scout.js';
import {
  createRushRakeState,
  stepRushRake,
  type RushRakeCluster,
  type RushRakeState,
} from './instincts/greg-rush-rake.js';

export interface SimulationOptions {
  readonly traitRuntimeFactory?: TraitRuntimeFactory;
  readonly traitOfferCount?: number;
  /** Optional neutral per-run catalog; omitted keeps legacy trait-only runs. */
  readonly universalUpgradeCatalog?: UniversalUpgradeCatalog;
  /** App-resolved permanent effects, detached before simulation startup. */
  readonly runStartLoadout?: RunStartLoadout;
  readonly runDirectorFactory?: RunDirectorFactory;
  readonly runSpawnAdapterOptions?: RunSpawnAdapterOptions;
}

const EMPTY_RUN_OFFERS: readonly RunUpgradeOfferView[] = Object.freeze([]);
const EMPTY_TRAIT_VISUALS: readonly TraitVisualAttachmentView[] = Object.freeze([]);
const EMPTY_FUSION_OFFERS: readonly TraitFusionOfferView[] = Object.freeze([]);
const EMPTY_UNIVERSAL_RANKS: readonly number[] = Object.freeze([]);
/** Kept in lockstep with the executor so every authoritative hit can render. */
export const MAX_TRAIT_PRESENTATION_CHAIN_HITS = MAX_CHAIN_JUMPS + 1;
/** Kept in lockstep with the executor so every orbit/contact hit can render. */
export const MAX_TRAIT_PRESENTATION_ORBIT_HITS = MAX_ORBITING_DAMAGE_COUNT;

/**
 * A renderer-facing copy of a trait command that was handed to the combat
 * executor. The simulation reuses both the array and its event objects on
 * the next step, so consumers must copy any data they need to retain.
 *
 * Zone metadata is normalized because the structural runtime port keeps it
 * optional for compatibility with lightweight runtimes.
 * This is presentation-only output and is deliberately excluded from hash()
 * and replay state.
 */
export interface TraitPresentationEventView {
  readonly kind: string;
  readonly sourceId: string;
  readonly tick: number;
  readonly targeting: string;
  readonly originX: number;
  readonly originY: number;
  readonly dirX: number;
  readonly dirY: number;
  readonly count: number;
  readonly damage: number;
  readonly speed: number;
  readonly radius: number;
  readonly strength: number;
  readonly durationTicks: number;
  readonly intervalTicks: number;
  readonly amount: number;
  /** Authored directional sweep width; zero for non-arc commands. */
  readonly arc: number;
  /** True only when a targeted melee arc acquired an authoritative aim. */
  readonly meleeArcResolved: boolean;
  readonly facing: number;
  readonly spread: number;
  /** Additional chain targets requested by authored content. */
  readonly jumps: number;
  readonly range: number;
  readonly tag: string;
  /** Actual chain victims captured before any simulation-owned kill cleanup. */
  readonly resolvedHitCount: number;
  /** Fixed-capacity endpoint arrays; only [0, resolvedHitCount) are meaningful. */
  readonly resolvedHitX: Float32Array;
  readonly resolvedHitY: Float32Array;
  /** Actual orbit/contact victims captured before simulation-owned cleanup. */
  readonly resolvedOrbitHitCount: number;
  /** Fixed-capacity victim endpoint arrays; only [0, resolvedOrbitHitCount) are meaningful. */
  readonly resolvedOrbitHitX: Float32Array;
  readonly resolvedOrbitHitY: Float32Array;
  /** The orbit companion location at each corresponding resolved contact. */
  readonly resolvedOrbitSourceX: Float32Array;
  readonly resolvedOrbitSourceY: Float32Array;
}

type MutableTraitPresentationEvent = {
  -readonly [Key in keyof TraitPresentationEventView]: TraitPresentationEventView[Key];
};

export interface Simulation {
  readonly tick: number;
  readonly player: PlayerState;
  readonly enemies: Pool<EnemyPool>;
  readonly projectiles: Pool<ProjectilePool>;
  readonly pickups: Pool<PickupPool>;
  /** Separate bounded world-pickup pool for Bomb, Magnet, and Food tokens. */
  readonly powerPickups: Pool<PowerPickupPool>;
  /** Persistent player damage pads; compact numeric tags are renderer-ready. */
  readonly zones: Pool<ZonePool>;
  readonly grid: SpatialGrid;
  readonly waveDirector: WaveDirector;
  /** XP silently dropped because the pickup pool was full at kill time. Diagnostic only. */
  readonly xpLostToFullPickupPool: number;
  /** Rare world tokens rejected because their separate bounded pool was full. */
  readonly powerPickupsLostToFullPool: number;
  readonly traitCatalogFingerprint: string | null;
  readonly universalUpgradeCatalog: UniversalUpgradeCatalog | null;
  readonly universalUpgradeCatalogFingerprint: string | null;
  readonly runStartLoadoutFingerprint: string;
  readonly runContentFingerprint: string | null;
  readonly runOutcome: RunOutcomeView | null;
  readonly runPhase: RunPhaseView | null;
  readonly directorEvents: readonly RunDirectorEventView[];
  readonly totalKills: number;
  /** Essence earned from fallback cards during this run, before terminal settlement. */
  readonly runEssenceEarned: number;
  /** Immutable universal ranks in the active catalog's canonical order. */
  readonly universalUpgradeRanks: readonly number[];
  /** Five for a neutral-enabled run; zero when neutral upgrades are disabled. */
  readonly universalUpgradeSlotCapacity: number;
  /** Distinct neutral upgrades selected into the current run build. */
  readonly universalUpgradeSlotsUsed: number;
  readonly pendingUpgradeOffers: readonly RunUpgradeOfferView[];
  readonly upgradeSelectionPending: boolean;
  /** Free Master-pair evolutions currently available in deterministic recipe order. */
  readonly availableFusions: readonly TraitFusionOfferView[];
  /**
   * Renderer-only copies of commands executed during the most recent advancing
   * tick. This reusable output is empty after a paused step and excluded from
   * deterministic gameplay state.
   */
  readonly traitPresentationEvents: readonly TraitPresentationEventView[];
  /**
   * Bounded resolved combat feedback from the most recent advancing tick.
   * This is renderer-only output and is empty after a paused tick.
   */
  readonly combatPresentationEvents: readonly CombatPresentationEventView[];
  /** Number of feedback events safely coalesced away this tick due to the cap. */
  readonly combatPresentationEventsDropped: number;
  /**
   * Read-only presentation classification for a live enemy id. This mirrors
   * the run adapter's already-authoritative role and is intentionally not a
   * writable component exposed to callers. Stale/dead ids safely read as a
   * regular enemy so a renderer can discard an obsolete snapshot without
   * affecting simulation state.
   */
  enemyPresentationRole(id: EntityId): RunEnemyRole;
  /** Authoritative, capacity-bounded spawn hook for world pickup directors. */
  spawnPowerPickup(
    kind: Exclude<PowerPickupKind, 'xp'>,
    x: number,
    y: number,
    amount?: number,
    radius?: number,
  ): boolean;
  step(input: TickInput): SimEvents;
  selectUpgrade(id: string): UpgradeSelection;
  /** Resolve a free, explicit V1.1 Master fusion without consuming a level-up. */
  fuseEvolution(evolutionId: string): UpgradeSelection;
  traitVisualState(): readonly TraitVisualAttachmentView[];
  hash(): string;
  getReplay(): ReplayRecord;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function resetEvents(events: SimEvents): void {
  events.levelUps.length = 0;
  events.kills = 0;
  events.pickupsCollected = 0;
  events.enemiesSpawned = 0;
  events.enemyProjectilesFired = 0;
  events.projectilesFired = 0;
  events.powerPickupsCollected = 0;
  events.bombsTriggered = 0;
  events.magnetsTriggered = 0;
  events.foodCollected = 0;
}

export function createSimulation(
  config: SimConfig,
  seed: number,
  options: SimulationOptions = {},
): Simulation {
  if (!Number.isFinite(seed)) throw new RangeError(`createSimulation: seed must be finite (received ${seed})`);
  const configFingerprint = fingerprintConfig(config);
  const rng = createRng(seed);
  // Combat rolls deliberately use a separate deterministic stream. Adding a
  // crit/dodge roll must never perturb wave spawns, offers, or authored run
  // events that consume the legacy simulation RNG.
  const combatRng = createRng((Math.trunc(seed) ^ 0x9e3779b9) >>> 0);
  // Independent from both combat and wave RNG. A rare pickup drop cannot
  // perturb crit/dodge outcomes or authored spawning/offer schedules.
  const powerPickupRng = createRng((Math.trunc(seed) ^ 0x85ebca6b) >>> 0);
  const clock = createClock(config.hz);
  const traitRuntime = options.traitRuntimeFactory === undefined
    ? null
    : createTraitRuntimePort(options.traitRuntimeFactory, { seed, initialTick: 0 });
  const traitCatalogFingerprint = traitRuntime?.fingerprint() ?? null;
  if (
    traitCatalogFingerprint !== null &&
    !/^[0-9a-f]{16}$/.test(traitCatalogFingerprint)
  ) {
    throw new Error('trait runtime fingerprint must be 16 lowercase hexadecimal characters');
  }
  const traitExecutor = createTraitCommandExecutor();
  const runUpgradeQueue = traitRuntime === null && options.universalUpgradeCatalog === undefined
    ? null
    : options.universalUpgradeCatalog === undefined
      ? createRunUpgradeQueue(traitRuntime, { offerCount: options.traitOfferCount ?? 3 })
      : createRunUpgradeQueue(traitRuntime, {
        offerCount: options.traitOfferCount ?? 3,
        universalCatalog: options.universalUpgradeCatalog,
      });
  const universalUpgradeCatalogFingerprint = runUpgradeQueue?.universalCatalogFingerprint ?? null;
  if (
    universalUpgradeCatalogFingerprint !== null &&
    !/^[0-9a-f]{16}$/.test(universalUpgradeCatalogFingerprint)
  ) {
    throw new Error('universal upgrade catalog fingerprint must be 16 lowercase hexadecimal characters');
  }
  const runStartLoadout = normalizeRunStartLoadout(options.runStartLoadout);
  const runStartLoadoutFingerprint = fingerprintRunStartLoadout(runStartLoadout);
  const runDirector = options.runDirectorFactory === undefined
    ? null
    : createRunDirectorPort(options.runDirectorFactory, { seed });
  const runContentFingerprint = runDirector?.contentFingerprint() ?? null;
  if (runContentFingerprint !== null && !/^[0-9a-f]{8}$/.test(runContentFingerprint)) {
    throw new Error('run director content fingerprint must be 8 lowercase hexadecimal characters');
  }
  const runSpawnAdapter = runDirector === null
    ? null
    : createRunSpawnAdapter(options.runSpawnAdapterOptions);
  const replayRecorder = createReplayRecorder(
    seed,
    CONFIG_VERSION,
    configFingerprint,
    traitCatalogFingerprint,
    universalUpgradeCatalogFingerprint,
    runContentFingerprint,
    runStartLoadoutFingerprint,
  );

  const hero = getHeroDefinition(runStartLoadout.heroId ?? 'greg');
  const basicAttack = getHeroBasicAttackDefinition(hero.basicAttackId);
  const basePlayerMaxHp = config.player.maxHp + runStartLoadout.maxHpBonus + hero.maxHpBonus;
  const basePlayerSpeed = config.player.speed * hero.speedMultiplier;
  const basePlayerPickupRadius = config.player.pickupRadius + hero.pickupRadiusBonus;
  const baseWeaponDamage = config.weapon.damage * hero.weaponDamageMultiplier;
  const baseWeaponCooldownTicks = Math.max(
    1,
    Math.round(config.weapon.cooldownTicks * hero.weaponCooldownMultiplier),
  );
  const player: PlayerState = {
    x: config.player.startX,
    y: config.player.startY,
    hp: basePlayerMaxHp,
    maxHp: basePlayerMaxHp,
    speed: basePlayerSpeed,
    radius: config.player.radius,
    pickupRadius: basePlayerPickupRadius,
    xp: 0,
    level: 1,
    invulnTicks: 0,
    alive: true,
    critChance: hero.critChance,
    critMultiplier: hero.critMultiplier,
    dodgeChance: hero.dodgeChance,
    armor: hero.armor,
    shield: hero.shieldMax,
    shieldMax: hero.shieldMax,
    shieldRechargeDelayTicks: hero.shieldRechargeDelayTicks,
    shieldRechargeTicksRemaining: 0,
    shieldRechargePerTick: hero.shieldRechargePerTick,
  };

  const enemies = createEnemyPool(config.enemyCap);
  const projectiles = createProjectilePool(config.projectileCap);
  const pickups = createPickupPool(config.pickupCap);
  const powerPickups = createPowerPickupPool(powerPickupCapacityForXpCap(config.pickupCap));
  const zones = createZonePool(config.zoneCap);
  const grid = createSpatialGrid(config.worldWidth, config.worldHeight, config.gridCellSize, config.enemyCap);
  const waveDirector = createWaveDirector(config.waves);
  // The config is immutable content. A local copy lets an actual run upgrade
  // change projectile damage without mutating caller-owned config state.
  const weapon = { ...config.weapon };
  weapon.damage = baseWeaponDamage;
  weapon.cooldownTicks = baseWeaponCooldownTicks;
  const basicWeapon = { ...config.weapon };
  basicWeapon.damage = baseWeaponDamage * basicAttack.damageMultiplier;
  basicWeapon.cooldownTicks = Math.max(
    1,
    Math.round(config.weapon.cooldownTicks * hero.weaponCooldownMultiplier * basicAttack.cooldownMultiplier),
  );
  basicWeapon.projectileSpeed = config.weapon.projectileSpeed * basicAttack.projectileSpeedMultiplier;
  basicWeapon.range = config.weapon.range * basicAttack.rangeMultiplier;
  basicWeapon.pierce = basicAttack.pierce;
  let basicProjectileCount = basicAttack.projectileCount;
  /** Selected hero starter mastery rank, projected from the universal catalog. */
  let basicAttackMasteryRank = 0;
  if (runDirector !== null && config.archetypes.length < 4) {
    throw new Error('run director integration requires at least four simulation archetypes');
  }
  const enemyRoles = new Uint8Array(config.enemyCap);
  const enemyBehavior = createEnemyBehaviorState(config.enemyCap);

  let maxEnemyRadius = 0;
  for (const a of config.archetypes) {
    if (a.radius > maxEnemyRadius) maxEnemyRadius = a.radius;
  }

  const events: SimEvents = {
    levelUps: [],
    kills: 0,
    pickupsCollected: 0,
    enemiesSpawned: 0,
    enemyProjectilesFired: 0,
    projectilesFired: 0,
    powerPickupsCollected: 0,
    bombsTriggered: 0,
    magnetsTriggered: 0,
    foodCollected: 0,
  };
  const combatPresentationEventBuffer = createCombatPresentationEventBuffer();
  const combat: CombatDamageResolver = createCombatDamageResolver({
    player,
    rng: combatRng,
    eventBuffer: combatPresentationEventBuffer,
    getTick: () => clock.tick,
  });
  const traitPresentationEventStorage: MutableTraitPresentationEvent[] = [];
  const traitPresentationEvents: MutableTraitPresentationEvent[] = [];
  let rushRakeState: RushRakeState = createRushRakeState();
  let bennyBraceState: BennyBraceState = createBennyBraceState();
  let gracieScoutState: GracieScoutState = createGracieScoutState();
  const rushRakePendingTicks = new Int32Array(3);
  const rushRakePendingAimX = new Float32Array(3);
  const rushRakePendingAimY = new Float32Array(3);
  const rushRakePendingOriginX = new Float32Array(3);
  const rushRakePendingOriginY = new Float32Array(3);
  const rushRakeNearMissActive = new Uint8Array(config.enemyCap);
  const rushRakeNearMissGeneration = new Uint16Array(config.enemyCap);
  rushRakePendingTicks.fill(-1);
  /** A bounded Trample cast may carry up to five sequential earth-wave impacts. */
  const groundWavePendingTicks = new Int32Array(8);
  const groundWaveOriginX = new Float32Array(8);
  const groundWaveOriginY = new Float32Array(8);
  const groundWaveDirX = new Float32Array(8);
  const groundWaveDirY = new Float32Array(8);
  const groundWaveRadius = new Float32Array(8);
  const groundWaveDamage = new Float32Array(8);
  const groundWaveCritical = new Uint8Array(8);
  const groundWaveIndex = new Uint8Array(8);
  groundWavePendingTicks.fill(-1);
  const rushRakeClusters: RushRakeCluster[] = [];
  const bennyPulseScratch: EntityId[] = [];
  const heroMeleeScratch: EntityId[] = [];
  const gracieScoutTargets: GracieScoutTarget[] = [];
  let traitPresentationCommandSource: TraitRuntimeCommandSource | null = null;
  // Hero starter cues are emitted before trait commands. Keep the external
  // trait command index separate from its renderer-event slot so a Fox Swipe,
  // Trample, or Spit cue can never be overwritten by command zero.
  let traitPresentationCommandOffset = 0;
  const traitPresentationCommandCapture: TraitRuntimeCommandSource = {
    get length() {
      return traitPresentationCommandSource?.length ?? 0;
    },
    at(index: number): TraitRuntimeCommandView {
      const source = traitPresentationCommandSource;
      if (source === null) {
        throw new Error('trait presentation command capture is not active');
      }
      const command = source.at(index);
      const eventIndex = traitPresentationCommandOffset + index;
      let event = traitPresentationEventStorage[eventIndex];
      if (event === undefined) {
        event = {
          kind: command.kind,
          sourceId: command.sourceId,
          tick: command.tick,
          targeting: command.targeting,
          originX: command.originX,
          originY: command.originY,
          dirX: command.dirX,
          dirY: command.dirY,
          count: command.count,
          damage: command.damage,
          speed: command.speed,
          radius: command.radius,
          strength: command.strength,
          durationTicks: command.durationTicks ?? 0,
          intervalTicks: command.intervalTicks ?? 0,
          amount: command.amount ?? 0,
          arc: command.arc ?? 0,
          meleeArcResolved: false,
          facing: command.facing,
          spread: command.spread,
          jumps: command.jumps ?? 0,
          range: command.range,
          tag: command.tag ?? '',
          resolvedHitCount: 0,
          resolvedHitX: new Float32Array(MAX_TRAIT_PRESENTATION_CHAIN_HITS),
          resolvedHitY: new Float32Array(MAX_TRAIT_PRESENTATION_CHAIN_HITS),
          resolvedOrbitHitCount: 0,
          resolvedOrbitHitX: new Float32Array(MAX_TRAIT_PRESENTATION_ORBIT_HITS),
          resolvedOrbitHitY: new Float32Array(MAX_TRAIT_PRESENTATION_ORBIT_HITS),
          resolvedOrbitSourceX: new Float32Array(MAX_TRAIT_PRESENTATION_ORBIT_HITS),
          resolvedOrbitSourceY: new Float32Array(MAX_TRAIT_PRESENTATION_ORBIT_HITS),
        };
        traitPresentationEventStorage[eventIndex] = event;
      } else {
        event.kind = command.kind;
        event.sourceId = command.sourceId;
        event.tick = command.tick;
        event.targeting = command.targeting;
        event.originX = command.originX;
        event.originY = command.originY;
        event.dirX = command.dirX;
        event.dirY = command.dirY;
        event.count = command.count;
        event.damage = command.damage;
        event.speed = command.speed;
        event.radius = command.radius;
        event.strength = command.strength;
        event.durationTicks = command.durationTicks ?? 0;
        event.intervalTicks = command.intervalTicks ?? 0;
        event.amount = command.amount ?? 0;
        event.arc = command.arc ?? 0;
        event.meleeArcResolved = false;
        event.facing = command.facing;
        event.spread = command.spread;
        event.jumps = command.jumps ?? 0;
        event.range = command.range;
        event.tag = command.tag ?? '';
        event.resolvedHitCount = 0;
        event.resolvedOrbitHitCount = 0;
      }
      traitPresentationEvents[eventIndex] = event;
      return command;
    },
  };

  function resetTraitPresentationEvents(): void {
    traitPresentationEvents.length = 0;
    traitPresentationCommandSource = null;
    traitPresentationCommandOffset = 0;
  }

  /** Records a real resolved swipe for the renderer without granting it writes. */
  function appendHeroMeleeArcPresentationEvent(
    sourceId: string,
    tag: string,
    tick: number,
    originX: number,
    originY: number,
    aimX: number,
    aimY: number,
    arc: number,
    range: number,
    damage: number,
    waveIndex = 0,
  ): void {
    const index = traitPresentationEvents.length;
    let event = traitPresentationEventStorage[index];
    if (event === undefined) {
      event = {
        kind: 'meleeArc',
        sourceId,
        tick,
        targeting: 'none',
        originX,
        originY,
        dirX: aimX,
        dirY: aimY,
        count: 1,
        damage,
        speed: 0,
        radius: range,
        strength: 1,
        durationTicks: 0,
        intervalTicks: 0,
        amount: waveIndex,
        arc,
        meleeArcResolved: true,
        facing: Math.atan2(aimY, aimX),
        spread: 0,
        jumps: 0,
        range,
        tag,
        resolvedHitCount: 0,
        resolvedHitX: new Float32Array(MAX_TRAIT_PRESENTATION_CHAIN_HITS),
        resolvedHitY: new Float32Array(MAX_TRAIT_PRESENTATION_CHAIN_HITS),
        resolvedOrbitHitCount: 0,
        resolvedOrbitHitX: new Float32Array(MAX_TRAIT_PRESENTATION_ORBIT_HITS),
        resolvedOrbitHitY: new Float32Array(MAX_TRAIT_PRESENTATION_ORBIT_HITS),
        resolvedOrbitSourceX: new Float32Array(MAX_TRAIT_PRESENTATION_ORBIT_HITS),
        resolvedOrbitSourceY: new Float32Array(MAX_TRAIT_PRESENTATION_ORBIT_HITS),
      };
      traitPresentationEventStorage[index] = event;
    } else {
      event.kind = 'meleeArc';
      event.sourceId = sourceId;
      event.tick = tick;
      event.targeting = 'none';
      event.originX = originX;
      event.originY = originY;
      event.dirX = aimX;
      event.dirY = aimY;
      event.count = 1;
      event.damage = damage;
      event.speed = 0;
      event.radius = range;
      event.strength = 1;
      event.durationTicks = 0;
      event.intervalTicks = 0;
      event.amount = waveIndex;
      event.arc = arc;
      event.meleeArcResolved = true;
      event.facing = Math.atan2(aimY, aimX);
      event.spread = 0;
      event.jumps = 0;
      event.range = range;
      event.tag = tag;
      event.resolvedHitCount = 0;
      event.resolvedOrbitHitCount = 0;
    }
    traitPresentationEvents.push(event);
  }

  function appendHeroPresentationEvent(
    kind: 'areaKnockback' | 'telegraph',
    sourceId: string,
    tag: string,
    tick: number,
    originX: number,
    originY: number,
    dirX: number,
    dirY: number,
    count: number,
    damage: number,
    radius: number,
    strength: number,
    durationTicks = 24,
  ): void {
    const index = traitPresentationEvents.length;
    let event = traitPresentationEventStorage[index];
    if (event === undefined) {
      event = {
        kind,
        sourceId,
        tick,
        targeting: 'none',
        originX,
        originY,
        dirX,
        dirY,
        count,
        damage,
        speed: 0,
        radius,
        strength,
        durationTicks: kind === 'telegraph' ? durationTicks : 0,
        intervalTicks: 0,
        amount: 0,
        arc: 0,
        meleeArcResolved: false,
        facing: Math.atan2(dirY, dirX),
        spread: 0,
        jumps: 0,
        range: radius,
        tag,
        resolvedHitCount: 0,
        resolvedHitX: new Float32Array(MAX_TRAIT_PRESENTATION_CHAIN_HITS),
        resolvedHitY: new Float32Array(MAX_TRAIT_PRESENTATION_CHAIN_HITS),
        resolvedOrbitHitCount: 0,
        resolvedOrbitHitX: new Float32Array(MAX_TRAIT_PRESENTATION_ORBIT_HITS),
        resolvedOrbitHitY: new Float32Array(MAX_TRAIT_PRESENTATION_ORBIT_HITS),
        resolvedOrbitSourceX: new Float32Array(MAX_TRAIT_PRESENTATION_ORBIT_HITS),
        resolvedOrbitSourceY: new Float32Array(MAX_TRAIT_PRESENTATION_ORBIT_HITS),
      };
      traitPresentationEventStorage[index] = event;
    } else {
      event.kind = kind;
      event.sourceId = sourceId;
      event.tick = tick;
      event.targeting = 'none';
      event.originX = originX;
      event.originY = originY;
      event.dirX = dirX;
      event.dirY = dirY;
      event.count = count;
      event.damage = damage;
      event.speed = 0;
      event.radius = radius;
      event.strength = strength;
      event.durationTicks = kind === 'telegraph' ? durationTicks : 0;
      event.intervalTicks = 0;
      event.amount = 0;
      event.arc = 0;
      event.meleeArcResolved = false;
      event.facing = Math.atan2(dirY, dirX);
      event.spread = 0;
      event.jumps = 0;
      event.range = radius;
      event.tag = tag;
      event.resolvedHitCount = 0;
      event.resolvedOrbitHitCount = 0;
    }
    traitPresentationEvents.push(event);
  }

  /** Resolve one close-range hero sweep against the authoritative spatial grid. */
  function resolveHeroMeleeArc(
    originX: number,
    originY: number,
    aimX: number,
    aimY: number,
    range: number,
    arc: number,
    rawDamage: number,
    sourceId: string,
    tag: string,
    waveIndex = 0,
  ): number {
    const aimLength = Math.hypot(aimX, aimY);
    if (aimLength <= 1e-6 || range <= 0 || arc <= 0) return 0;
    const dirX = aimX / aimLength;
    const dirY = aimY / aimLength;
    const cosineThreshold = Math.cos(Math.min(Math.PI * 2, arc) * 0.5);
    const hitCount = grid.queryRadius(originX, originY, range + maxEnemyRadius, heroMeleeScratch);
    // Greg's Melee Affinity is deliberately applied at the common close-hit
    // boundary: it strengthens Fox Swipe, Rush Rake, and the tagged melee
    // animal attacks handled by the trait executor without touching ranged
    // pickups such as Quills or Spit Volley.
    const meleeAffinity = hero.id === 'greg' ? hero.meleeDamageMultiplier : 1;
    const resolvedDamage = combat.resolveOutgoingDamage(rawDamage * meleeAffinity, sourceId);
    let affected = 0;
    for (let index = 0; index < hitCount; index++) {
      const enemySlot = enemies.slotOf(heroMeleeScratch[index]!);
      if (enemySlot < 0) continue;
      const data = enemies.data;
      const dx = data.posX[enemySlot]! - originX;
      const dy = data.posY[enemySlot]! - originY;
      const distance = Math.hypot(dx, dy);
      if (distance > range + data.radius[enemySlot]!) continue;
      if (distance > 1e-6 && (dx * dirX + dy * dirY) / distance < cosineThreshold) continue;
      const killed = combat.damageEnemy(enemies, enemySlot, resolvedDamage, sourceId);
      affected++;
      if (killed) killEnemy(enemySlot);
    }
    appendHeroMeleeArcPresentationEvent(
      sourceId,
      tag,
      clock.tick,
      originX,
      originY,
      dirX,
      dirY,
      arc,
      range,
      resolvedDamage.amount,
      waveIndex,
    );
    return affected;
  }

  function collectRushRakeClusters(): void {
    rushRakeClusters.length = 0;
    const data = enemies.data;
    for (let slot = 0; slot < data.capacity; slot++) {
      if (data.alive[slot] === 0) continue;
      rushRakeClusters.push({
        id: enemies.idOf(slot),
        centerX: data.posX[slot]!,
        centerY: data.posY[slot]!,
        memberCount: 1,
      });
    }
  }

  function countRushRakeNearMisses(): number {
    const data = enemies.data;
    let nearMisses = 0;
    for (let slot = 0; slot < data.capacity; slot++) {
      if (data.alive[slot] === 0) {
        rushRakeNearMissActive[slot] = 0;
        continue;
      }
      const generation = data.generation[slot]!;
      if (rushRakeNearMissGeneration[slot] !== generation) {
        rushRakeNearMissGeneration[slot] = generation;
        rushRakeNearMissActive[slot] = 0;
      }
      const dx = data.posX[slot]! - player.x;
      const dy = data.posY[slot]! - player.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const contactDistance = player.radius + data.radius[slot]!;
      const inNearMissBand = distance > contactDistance && distance <= contactDistance + 18;
      if (!inNearMissBand) {
        rushRakeNearMissActive[slot] = 0;
      } else if (rushRakeNearMissActive[slot] === 0) {
        rushRakeNearMissActive[slot] = 1;
        nearMisses++;
      }
    }
    return Math.min(nearMisses, 8);
  }

  function scheduleRushRakeBurst(
    command: ReturnType<typeof stepRushRake>['command'],
  ): void {
    if (command === null) return;
    for (const wave of command.waves) {
      const slot = rushRakePendingTicks.findIndex((tick) => tick < 0);
      if (slot < 0) break;
      rushRakePendingTicks[slot] = clock.tick + wave.tickOffset;
      rushRakePendingAimX[slot] = command.aimX;
      rushRakePendingAimY[slot] = command.aimY;
      rushRakePendingOriginX[slot] = command.originX;
      rushRakePendingOriginY[slot] = command.originY;
    }
  }

  function fireRushRakeWave(slot: number): void {
    if (!player.alive) return;
    const aimX = rushRakePendingAimX[slot]!;
    const aimY = rushRakePendingAimY[slot]!;
    // V1.1 turns Rush Rake into the committed close-combo its name promises:
    // three expanding claw arcs, not a second projectile weapon.
    const waveIndex = Math.max(0, Math.min(2, slot));
    const originX = rushRakePendingOriginX[slot]! + aimX * waveIndex * 8;
    const originY = rushRakePendingOriginY[slot]! + aimY * waveIndex * 8;
    resolveHeroMeleeArc(
      originX,
      originY,
      aimX,
      aimY,
      58 + waveIndex * 12,
      1.25 + waveIndex * 0.2,
      basicWeapon.damage * (0.44 + waveIndex * 0.06),
      'greg-rush-rake',
      'greg-rush-rake',
      waveIndex,
    );
    // `resolveHeroMeleeArc` always emits the physical cue, even on a miss.
  }

  function stepGregRushRake(distanceMovedThisTick: number): void {
    if (hero.id !== 'greg') return;
    collectRushRakeClusters();
    const result = stepRushRake(rushRakeState, {
      distanceMovedMilliunits: Math.max(0, Math.round(distanceMovedThisTick * 1000)),
      nearMissCount: countRushRakeNearMisses(),
      originX: player.x,
      originY: player.y,
      moveFacingX: lastMoveDirX,
      moveFacingY: lastMoveDirY,
      clusters: rushRakeClusters,
    });
    rushRakeState = result.state;
    scheduleRushRakeBurst(result.command);
    for (let slot = 0; slot < rushRakePendingTicks.length; slot++) {
      if (rushRakePendingTicks[slot] !== clock.tick) continue;
      fireRushRakeWave(slot);
      rushRakePendingTicks[slot] = -1;
    }
  }

  /** Queue a single Trample cast as several deterministic forward impacts. */
  function scheduleBennyTrample(aimX: number, aimY: number): boolean {
    const length = Math.hypot(aimX, aimY);
    if (length <= 1e-6) return false;
    const dirX = aimX / length;
    const dirY = aimY / length;
    const rank = basicAttackMasteryRank;
    const waveCount = Math.min(
      groundWavePendingTicks.length,
      basicAttack.groundWaveCount + Math.floor((rank + 1) / 2) + (rank === 5 ? 1 : 0),
    );
    const resolved = combat.resolveOutgoingDamage(basicWeapon.damage, 'benny-trample');
    let queued = 0;
    for (let wave = 0; wave < waveCount; wave++) {
      const slot = groundWavePendingTicks.findIndex((tick) => tick < 0);
      if (slot < 0) break;
      groundWavePendingTicks[slot] = clock.tick + wave * basicAttack.groundWaveSpacingTicks;
      groundWaveOriginX[slot] = player.x;
      groundWaveOriginY[slot] = player.y;
      groundWaveDirX[slot] = dirX;
      groundWaveDirY[slot] = dirY;
      groundWaveRadius[slot] = basicAttack.groundWaveRadius + rank * 5 + wave * 2;
      groundWaveDamage[slot] = Math.fround(resolved.amount * (0.88 + wave * 0.1));
      groundWaveCritical[slot] = resolved.critical ? 1 : 0;
      groundWaveIndex[slot] = wave;
      queued++;
    }
    return queued > 0;
  }

  function fireBennyTrampleWave(slot: number): void {
    const wave = groundWaveIndex[slot]!;
    const dirX = groundWaveDirX[slot]!;
    const dirY = groundWaveDirY[slot]!;
    const distance = basicAttack.groundWaveStartDistance
      + wave * (basicAttack.groundWaveStride + basicAttackMasteryRank * 2);
    const originX = groundWaveOriginX[slot]! + dirX * distance;
    const originY = groundWaveOriginY[slot]! + dirY * distance;
    const radius = groundWaveRadius[slot]!;
    const damage = groundWaveDamage[slot]!;
    const hitCount = grid.queryRadius(originX, originY, radius + maxEnemyRadius, heroMeleeScratch);
    let affected = 0;
    for (let index = 0; index < hitCount; index++) {
      const enemySlot = enemies.slotOf(heroMeleeScratch[index]!);
      if (enemySlot < 0) continue;
      const data = enemies.data;
      const dx = data.posX[enemySlot]! - originX;
      const dy = data.posY[enemySlot]! - originY;
      const enemyRadius = data.radius[enemySlot]!;
      if (dx * dx + dy * dy > (radius + enemyRadius) * (radius + enemyRadius)) continue;
      const killed = combat.damageEnemy(enemies, enemySlot, {
        amount: damage,
        critical: groundWaveCritical[slot] === 1,
      }, 'benny-trample');
      affected++;
      if (killed) {
        killEnemy(enemySlot);
        continue;
      }
      // A small deterministic shove makes the line read as a genuine stampede
      // rather than a hidden area-damage circle.
      data.posX[enemySlot] = clamp(data.posX[enemySlot]! + dirX * (5 + wave * 1.5), 0, worldWidth);
      data.posY[enemySlot] = clamp(data.posY[enemySlot]! + dirY * (5 + wave * 1.5), 0, worldHeight);
      grid.update(enemies.idOf(enemySlot), data.posX[enemySlot]!, data.posY[enemySlot]!);
    }
    appendHeroPresentationEvent(
      'telegraph',
      'benny-trample',
      'benny-trample-wave',
      clock.tick,
      originX,
      originY,
      dirX,
      dirY,
      affected,
      damage,
      radius,
      1 + wave * 0.2,
      20,
    );
  }

  function stepBennyTrample(): void {
    for (let slot = 0; slot < groundWavePendingTicks.length; slot++) {
      if (groundWavePendingTicks[slot] !== clock.tick) continue;
      fireBennyTrampleWave(slot);
      groundWavePendingTicks[slot] = -1;
    }
  }

  function applyBennyBracePulse(
    originX: number,
    originY: number,
    radius: number,
    damage: number,
    knockbackStrength: number,
  ): void {
    const hitCount = grid.queryRadius(originX, originY, radius, bennyPulseScratch);
    const resolvedDamage = combat.resolveOutgoingDamage(damage * traitDamageMultiplier, 'benny-brace');
    let affected = 0;
    for (let index = 0; index < hitCount; index++) {
      const enemySlot = enemies.slotOf(bennyPulseScratch[index]!);
      if (enemySlot < 0) continue;
      const data = enemies.data;
      const dx = data.posX[enemySlot]! - originX;
      const dy = data.posY[enemySlot]! - originY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > radius) continue;
      const killed = combat.damageEnemy(enemies, enemySlot, resolvedDamage, 'benny-brace');
      affected++;
      if (killed) {
        killEnemy(enemySlot);
        continue;
      }
      const inverseDistance = distance > 1e-6 ? 1 / distance : 1;
      const push = knockbackStrength * Math.max(0, 1 - distance / radius);
      data.posX[enemySlot] = clamp(data.posX[enemySlot]! + dx * inverseDistance * push, 0, worldWidth);
      data.posY[enemySlot] = clamp(data.posY[enemySlot]! + dy * inverseDistance * push, 0, worldHeight);
      grid.update(enemies.idOf(enemySlot), data.posX[enemySlot]!, data.posY[enemySlot]!);
    }
    appendHeroPresentationEvent(
      'areaKnockback',
      'benny-brace',
      'benny-brace',
      clock.tick,
      originX,
      originY,
      lastMoveDirX,
      lastMoveDirY,
      affected,
      resolvedDamage.amount,
      radius,
      knockbackStrength,
    );
  }

  function stepBennyBrace(playerHpBeforeEnemies: number): void {
    if (hero.id !== 'benny') return;
    const result = reduceBennyBrace(bennyBraceState, {
      contactHits: player.hp < playerHpBeforeEnemies ? 1 : 0,
      originX: player.x,
      originY: player.y,
    });
    bennyBraceState = result.state;
    if (result.pulse !== null && player.alive) {
      applyBennyBracePulse(
        result.pulse.originX,
        result.pulse.originY,
        result.pulse.radius,
        result.pulse.damage,
        result.pulse.knockbackStrength,
      );
    }
  }

  function stepGracieScout(): void {
    if (hero.id !== 'gracie') return;
    gracieScoutTargets.length = 0;
    const data = enemies.data;
    for (let slot = 0; slot < data.capacity; slot++) {
      if (data.alive[slot] === 0) continue;
      gracieScoutTargets.push({
        id: enemies.idOf(slot),
        x: data.posX[slot]!,
        y: data.posY[slot]!,
      });
    }
    const result = reduceGracieScout(gracieScoutState, {
      originX: player.x,
      originY: player.y,
      moveFacingX: lastMoveDirX,
      moveFacingY: lastMoveDirY,
      targets: gracieScoutTargets,
    });
    gracieScoutState = result.state;
    if (result.pulse === null || !player.alive) return;
    let marked = 0;
    for (const id of result.pulse.targetIds) {
      const slot = enemies.slotOf(id);
      if (slot < 0) continue;
      enemies.data.marked[slot] = 1;
      marked++;
    }
    if (marked > 0) {
      appendHeroPresentationEvent(
        'telegraph',
        'gracie-scout',
        'gracie-scout',
        clock.tick,
        player.x,
        player.y,
        gracieScoutState.facingX,
        gracieScoutState.facingY,
        marked,
        0,
        260,
        1,
      );
    }
  }

  let weaponCooldown = 0;
  let lastMoveDirX = 0;
  let lastMoveDirY = 0;
  let xpLostToFullPickupPool = 0;
  let powerPickupsLostToFullPool = 0;
  let totalKills = 0;
  let bossEntityId: EntityId = NO_ENTITY;
  let bossDefeatedThisTick = false;
  let lastDirectorEvents: readonly RunDirectorEventView[] = Object.freeze([]);

  const worldWidth = config.worldWidth;
  const worldHeight = config.worldHeight;
  let pickupAttractionRadius = 0;
  let pickupAttractionSpeed = 0;
  let xpGainMultiplier = 1;
  let traitDamageMultiplier = hero.weaponDamageMultiplier;
  let traitCooldownMultiplier = hero.weaponCooldownMultiplier;
  const zoneStepper = createZoneStepper();

  /** Synchronize concrete authoritative stats after a universal card selection. */
  function applyUniversalStats(): void {
    const stats = runUpgradeQueue?.universalStats;
    if (stats === null || stats === undefined) return;

    player.speed = basePlayerSpeed * stats.speedMultiplier;
    player.pickupRadius = basePlayerPickupRadius + stats.pickupRadiusBonus;
    pickupAttractionRadius = stats.pickupAttractionRadius;
    pickupAttractionSpeed = stats.pickupAttractionSpeed;
    weapon.damage = baseWeaponDamage * stats.weaponDamageMultiplier;
    weapon.cooldownTicks = Math.max(1, Math.round(baseWeaponCooldownTicks * stats.weaponCooldownMultiplier));
    basicWeapon.damage = baseWeaponDamage
      * basicAttack.damageMultiplier
      * stats.weaponDamageMultiplier
      * stats.basicAttackDamageMultiplier;
    basicWeapon.cooldownTicks = Math.max(
      1,
      Math.round(
        config.weapon.cooldownTicks
        * hero.weaponCooldownMultiplier
        * basicAttack.cooldownMultiplier
        * stats.weaponCooldownMultiplier
        * stats.basicAttackCooldownMultiplier,
      ),
    );
    basicWeapon.range = config.weapon.range * basicAttack.rangeMultiplier + stats.basicAttackRangeBonus;
    basicWeapon.projectileSpeed = config.weapon.projectileSpeed * basicAttack.projectileSpeedMultiplier;
    basicWeapon.pierce = basicAttack.pierce + stats.basicAttackPierceBonus;
    basicProjectileCount = basicAttack.projectileCount + stats.basicAttackProjectileCountBonus;
    basicAttackMasteryRank = stats.basicAttackMasteryRank;
    traitDamageMultiplier = hero.weaponDamageMultiplier * stats.weaponDamageMultiplier;
    traitCooldownMultiplier = hero.weaponCooldownMultiplier * stats.weaponCooldownMultiplier;
    xpGainMultiplier = stats.xpMultiplier;

    // Defensive/crit cards modify the selected hero's base identity rather
    // than overwriting it. Dodge has a hard cap so Fox cannot become immune.
    player.critChance = clamp(hero.critChance + stats.critChanceBonus, 0, 0.5);
    player.critMultiplier = hero.critMultiplier;
    player.dodgeChance = clamp(hero.dodgeChance + stats.dodgeChanceBonus, 0, 0.35);
    player.armor = Math.max(0, hero.armor + stats.armorBonus);
    const nextShieldMax = Math.max(0, hero.shieldMax + stats.shieldMaxBonus);
    if (nextShieldMax > (player.shieldMax ?? 0)) {
      player.shield = Math.fround((player.shield ?? 0) + nextShieldMax - (player.shieldMax ?? 0));
    }
    player.shieldMax = nextShieldMax;
    player.shield = Math.min(nextShieldMax, Math.max(0, player.shield ?? 0));
    player.shieldRechargeDelayTicks = hero.shieldRechargeDelayTicks;
    player.shieldRechargePerTick = hero.shieldRechargePerTick + stats.shieldRechargePerTickBonus;

    const nextMaxHp = basePlayerMaxHp + stats.maxHpBonus;
    if (nextMaxHp > player.maxHp) player.hp += nextMaxHp - player.maxHp;
    player.maxHp = nextMaxHp;
    if (player.hp > player.maxHp) player.hp = player.maxHp;
  }

  /**
   * Places one enemy of `archetype` (hp scaled by hpMultiplier) at a
   * deterministic point on the perimeter of a circle of radius
   * config.weapon.range + 100 around the player, angle drawn from rng.
   * The angle draw happens before the spawn attempt, so it is consumed even
   * if the pool turns out to be full (see module-level rng consumer note).
   */
  function spawnEnemy(
    archetype: number,
    hpMultiplier: number,
    x: number,
    y: number,
    role: number,
    xpMultiplier = 1,
  ): boolean {
    if (!Number.isFinite(xpMultiplier) || xpMultiplier <= 0) {
      throw new RangeError('enemy XP multiplier must be finite and positive');
    }
    const slot = enemies.spawn();
    if (slot < 0) return false;

    const arch = config.archetypes[archetype]!;
    const data = enemies.data;
    data.posX[slot] = x;
    data.posY[slot] = y;
    data.velX[slot] = 0;
    data.velY[slot] = 0;
    data.hp[slot] = arch.hp * hpMultiplier;
    data.maxHp[slot] = arch.hp * hpMultiplier;
    data.speed[slot] = arch.speed;
    data.radius[slot] = arch.radius;
    data.touchDamage[slot] = arch.touchDamage;
    data.contactCooldown[slot] = 0;
    data.zoneDamageCooldown[slot] = 0;
    data.archetype[slot] = archetype;
    data.xpDrop[slot] = arch.xpDrop * xpMultiplier;
    data.marked[slot] = 0;
    rushRakeNearMissGeneration[slot] = data.generation[slot]!;
    rushRakeNearMissActive[slot] = 0;
    enemyRoles[slot] = role;
    resetEnemyBehavior(
      enemyBehavior,
      slot,
      arch.name,
      role === RUN_ENEMY_ROLE.elite,
      config.enemyBehavior.eliteInitialFireDelayTicks,
      config.enemyBehavior.spitterInitialFireDelayTicks,
      role === RUN_ENEMY_ROLE.boss,
    );

    grid.insert(enemies.idOf(slot), x, y);
    if (role === RUN_ENEMY_ROLE.boss) bossEntityId = enemies.idOf(slot);
    events.enemiesSpawned++;
    return true;
  }

  function spawnFn(archetype: number, hpMultiplier: number): boolean {
    const spawnRadius = weapon.range + 100;
    const angle = rng.float() * 2 * Math.PI;
    const x = clamp(player.x + Math.cos(angle) * spawnRadius, 0, worldWidth);
    const y = clamp(player.y + Math.sin(angle) * spawnRadius, 0, worldHeight);
    return spawnEnemy(archetype, hpMultiplier, x, y, RUN_ENEMY_ROLE.regular);
  }

  function spawnDirected(request: DirectedEnemySpawn): boolean {
    return spawnEnemy(
      request.archetype,
      request.hpMultiplier,
      request.x,
      request.y,
      request.role,
      request.xpMultiplier,
    );
  }

  function spawnPowerPickup(
    kind: Exclude<PowerPickupKind, 'xp'>,
    x: number,
    y: number,
    amount?: number,
    radius?: number,
  ): boolean {
    return spawnWorldPowerPickup(powerPickups, kind, x, y, amount, radius);
  }

  function killEnemy(eSlot: number, suppressPowerPickupDrop = false): void {
    const x = enemies.data.posX[eSlot]!;
    const y = enemies.data.posY[eSlot]!;
    const xpDrop = enemies.data.xpDrop[eSlot]!;
    const killedId = enemies.idOf(eSlot);
    const role = enemyRoles[eSlot]!;

    grid.remove(killedId);
    enemies.despawn(eSlot);
    enemyRoles[eSlot] = RUN_ENEMY_ROLE.regular;
    resetEnemyBehavior(enemyBehavior, eSlot, '', false, 0, 0);
    if (role === RUN_ENEMY_ROLE.boss && killedId === bossEntityId) {
      bossEntityId = NO_ENTITY;
      bossDefeatedThisTick = true;
    }

    const pSlot = pickups.spawn();
    if (pSlot < 0) {
      xpLostToFullPickupPool++;
    } else {
      pickups.data.posX[pSlot] = x;
      pickups.data.posY[pSlot] = y;
      pickups.data.kind[pSlot] = 0; // POWER_PICKUP_KIND.xp; stays in dense XP pool.
      pickups.data.xp[pSlot] = xpDrop;
      // Rare elite drops are a visibly larger, easier-to-spot XP token while
      // retaining one bounded pickup per kill and the same authoritative XP
      // value. Ordinary 1-XP motes remain at radius 4.
      pickups.data.radius[pSlot] = 4 + Math.min(5, Math.floor(Math.sqrt(xpDrop) / 2));
    }
    if (!suppressPowerPickupDrop) {
      const deathRoll = powerPickupRng.int(0, POWER_PICKUP_DROP_ROLL_RANGE);
      const kind = powerPickupKindForDeathRoll(deathRoll, role === RUN_ENEMY_ROLE.boss);
      if (kind !== null && !spawnWorldPowerPickup(powerPickups, kind, x, y)) {
        powerPickupsLostToFullPool++;
      }
    }
    events.kills++;
    totalKills++;
  }

  function isBossEnemySlot(slot: number): boolean {
    return enemyRoles[slot] === RUN_ENEMY_ROLE.boss;
  }

  if (runDirector !== null) {
    lastDirectorEvents = runDirector.step({
      tick: 0,
      paused: false,
      playerAlive: player.alive,
      playerHp: player.hp,
      playerMaxHp: player.maxHp,
      playerLevel: player.level,
      liveEnemies: enemies.data.count,
      killsTotal: totalKills,
      bossAlive: false,
      bossDefeatedThisTick: false,
    });
    // Tick-zero events are authoritative just like events from later fixed
    // ticks. Execute any authored spawn intents now so custom content cannot
    // silently lose its opening formation before the first input arrives.
    if (runSpawnAdapter !== null && runDirector.outcome === 'running') {
      runSpawnAdapter.execute(lastDirectorEvents, {
        playerX: player.x,
        playerY: player.y,
        worldWidth,
        worldHeight,
        spawn: spawnDirected,
      });
    }
  }

  function step(input: TickInput): SimEvents {
    if (runUpgradeQueue?.blocked) {
      throw new Error('Simulation.step: an upgrade selection is pending');
    }
    if (!Number.isFinite(input.moveX) || !Number.isFinite(input.moveY) || typeof input.paused !== 'boolean') {
      throw new TypeError('Simulation.step: input must contain finite moveX/moveY numbers and a boolean paused');
    }
    if (runDirector !== null && runDirector.outcome !== 'running') {
      // A terminal run is frozen at its final authoritative boundary. This is
      // deliberately a no-op rather than a new replay input: callers that
      // sample once more after a terminal frame cannot add kills, XP, or a
      // post-run upgrade choice.
      resetEvents(events);
      resetTraitPresentationEvents();
      combatPresentationEventBuffer.reset();
      return events;
    }
    // Canonicalize before both recording and simulation so a serialize/deserialize
    // round-trip cannot alter out-of-range controller input.
    const canonicalInput: TickInput = {
      moveX: clamp(input.moveX, -1, 1),
      moveY: clamp(input.moveY, -1, 1),
      paused: input.paused,
    };
    replayRecorder.record(canonicalInput);

    if (canonicalInput.paused) {
      resetEvents(events);
      resetTraitPresentationEvents();
      combatPresentationEventBuffer.reset();
      return events;
    }

    clock.advance();
    resetEvents(events);
    resetTraitPresentationEvents();
    combatPresentationEventBuffer.reset();

    const dt = clock.dt;
    const playerXBeforeMove = player.x;
    const playerYBeforeMove = player.y;

    if (player.alive) {
      if (player.invulnTicks > 0) player.invulnTicks--;
      combat.stepShieldRecharge();

      let mx = canonicalInput.moveX;
      let my = canonicalInput.moveY;
      const len = Math.sqrt(mx * mx + my * my);
      if (len > 1) {
        mx /= len;
        my /= len;
      }
      lastMoveDirX = mx;
      lastMoveDirY = my;

      player.x = clamp(player.x + mx * player.speed * dt, 0, worldWidth);
      player.y = clamp(player.y + my * player.speed * dt, 0, worldHeight);
    }

    if (runDirector === null) {
      waveDirector.step(clock.tick, rng, enemies.data.count, spawnFn);
    }

    const playerHpBeforeEnemies = player.hp;
    stepEnemies(
      enemies,
      grid,
      player,
      dt,
      worldWidth,
      worldHeight,
      config.enemyContactCooldownTicks,
      config.player.invulnTicksOnHit,
      {
        state: enemyBehavior,
        config: config.enemyBehavior,
        tick: clock.tick,
        projectiles,
        events,
        bossVariant: runStartLoadout.biomeId ?? 'forest',
        onBossCue(tag, tick, originX, originY, dirX, dirY, radius, durationTicks): void {
          appendHeroPresentationEvent(
            'telegraph',
            'forest-final-threat',
            tag,
            tick,
            originX,
            originY,
            dirX,
            dirY,
            0,
            0,
            radius,
            1,
            durationTicks,
          );
        },
        onSupportCue(tick, originX, originY, radius, healedCount): void {
          appendHeroPresentationEvent(
            'telegraph',
            'forest-support',
            'support-pulse',
            tick,
            originX,
            originY,
            0,
            0,
            healedCount,
            0,
            radius,
            1,
            18,
          );
        },
      },
      combat,
    );

    const distanceMovedThisTick = Math.hypot(
      player.x - playerXBeforeMove,
      player.y - playerYBeforeMove,
    );
    stepGregRushRake(distanceMovedThisTick);
    stepBennyBrace(playerHpBeforeEnemies);
    stepGracieScout();

    if (weaponCooldown > 0) weaponCooldown--;
    if (weaponCooldown === 0 && player.alive) {
      const ctx = {
        originX: player.x,
        originY: player.y,
        range: basicWeapon.range,
        moveDirX: lastMoveDirX,
        moveDirY: lastMoveDirY,
      };
      const target: EntityId = selectPriorityTarget(
        basicAttack.targeting,
        ctx,
        enemies,
        grid,
        basicWeapon.clusterRadius,
      );
      if (target !== NO_ENTITY) {
        const tSlot = enemies.slotOf(target);
        if (tSlot >= 0) {
          const dirX = enemies.data.posX[tSlot]! - player.x;
          const dirY = enemies.data.posY[tSlot]! - player.y;
          const targetAngle = Math.atan2(dirY, dirX);
          const aimX = Math.cos(targetAngle);
          const aimY = Math.sin(targetAngle);
          let firedAny = false;
          switch (basicAttack.pattern) {
            case 'meleeArc': {
              // Master Fox Swipe is a real two-claw finish, not a copy-only
              // damage scalar. The opposed aim offsets leave two visible
              // arcs in the presentation stream and each sweep resolves
              // through the same authoritative crit/hit path.
              const swipeCount = basicAttackMasteryRank === 5 ? 2 : 1;
              const swipeArc = Math.min(Math.PI * 1.95, basicAttack.arcRadians + basicAttackMasteryRank * 0.12);
              for (let swipeIndex = 0; swipeIndex < swipeCount; swipeIndex++) {
                const offsetRadians = swipeCount === 2 ? (swipeIndex === 0 ? -0.16 : 0.16) : 0;
                const swipeAngle = targetAngle + offsetRadians;
                resolveHeroMeleeArc(
                  player.x,
                  player.y,
                  Math.cos(swipeAngle),
                  Math.sin(swipeAngle),
                  basicWeapon.range,
                  swipeArc,
                  basicWeapon.damage,
                  'greg-fox-swipe',
                  'greg-fox-swipe',
                  swipeIndex,
                );
              }
              firedAny = true;
              break;
            }
            case 'groundWave':
              firedAny = scheduleBennyTrample(aimX, aimY);
              break;
            case 'projectile': {
              // One crit roll per spit cast keeps an upgraded fan readable:
              // every glob is visibly yellow or white together.
              const resolvedDamage = combat.resolveOutgoingDamage(basicWeapon.damage, 'gracie-spit');
              const projectileCount = basicProjectileCount + (basicAttackMasteryRank === 5 ? 1 : 0);
              const spreadDegrees = basicAttack.spreadDegrees + (basicAttackMasteryRank >= 3 ? 14 : 0);
              for (let projectileIndex = 0; projectileIndex < projectileCount; projectileIndex++) {
                const spreadRadians = spreadDegrees * (Math.PI / 180)
                  * (projectileIndex - (projectileCount - 1) / 2);
                const shotAngle = targetAngle + spreadRadians;
                const fired = spawnProjectile(
                  projectiles,
                  player.x,
                  player.y,
                  Math.cos(shotAngle),
                  Math.sin(shotAngle),
                  basicWeapon,
                  0,
                  resolvedDamage.critical,
                  COMBAT_DAMAGE_SOURCE.heroSpit,
                  resolvedDamage.amount,
                );
                if (fired) {
                  events.projectilesFired++;
                  firedAny = true;
                }
              }
              if (firedAny) {
                appendHeroPresentationEvent(
                  'telegraph',
                  'gracie-spit',
                  'gracie-spit',
                  clock.tick,
                  player.x,
                  player.y,
                  aimX,
                  aimY,
                  projectileCount,
                  resolvedDamage.amount,
                  basicWeapon.hitRadius * 2,
                  1,
                  12,
                );
              }
              break;
            }
          }
          if (firedAny) weaponCooldown = basicWeapon.cooldownTicks;
          // no target found or pool full: do NOT reset cooldown, retry next tick
        }
      }
    }

    // This runs after the starter attack schedules its cast, so Trample's
    // first earth-wave lands on the cast tick while subsequent waves retain
    // their deterministic spacing on later ticks.
    stepBennyTrample();

    if (traitRuntime !== null && traitExecutor !== null) {
      const commands = traitRuntime.update({
        tick: clock.tick,
        playerX: player.x,
        playerY: player.y,
        moveDirX: lastMoveDirX,
        moveDirY: lastMoveDirY,
        distanceMovedThisTick,
        weaponDamageMultiplier: traitDamageMultiplier,
        weaponCooldownMultiplier: traitCooldownMultiplier,
      });
      if (player.alive) {
        traitPresentationCommandSource = commands;
        traitPresentationCommandOffset = traitPresentationEvents.length;
        try {
          const traitStats = traitExecutor.execute(traitPresentationCommandCapture, {
            tick: clock.tick,
            moveDirX: lastMoveDirX,
            moveDirY: lastMoveDirY,
            worldWidth,
            worldHeight,
            enemies,
            projectiles,
            zones,
            enemyGrid: grid,
            killEnemy,
            combat,
            meleeDamageMultiplier: hero.id === 'greg' ? hero.meleeDamageMultiplier : 1,
            onChainDamageHit(commandIndex, hitIndex, x, y): void {
              const event = traitPresentationEvents[traitPresentationCommandOffset + commandIndex];
              if (
                event === undefined
                || event.kind !== 'chainDamage'
                || hitIndex < 0
                || hitIndex >= MAX_TRAIT_PRESENTATION_CHAIN_HITS
              ) {
                return;
              }
              event.resolvedHitX[hitIndex] = x;
              event.resolvedHitY[hitIndex] = y;
              event.resolvedHitCount = hitIndex + 1;
            },
            onOrbitingDamageHit(commandIndex, hitIndex, flyX, flyY, targetX, targetY): void {
              const event = traitPresentationEvents[traitPresentationCommandOffset + commandIndex];
              if (
                event === undefined
                || event.kind !== 'orbitingDamage'
                || hitIndex < 0
                || hitIndex >= MAX_TRAIT_PRESENTATION_ORBIT_HITS
              ) {
                return;
              }
              event.resolvedOrbitSourceX[hitIndex] = flyX;
              event.resolvedOrbitSourceY[hitIndex] = flyY;
              event.resolvedOrbitHitX[hitIndex] = targetX;
              event.resolvedOrbitHitY[hitIndex] = targetY;
              event.resolvedOrbitHitCount = hitIndex + 1;
            },
            onMeleeArcResolved(commandIndex, dirX, dirY): void {
              const event = traitPresentationEvents[traitPresentationCommandOffset + commandIndex];
              if (event === undefined || event.kind !== 'meleeArc') return;
              event.dirX = dirX;
              event.dirY = dirY;
              event.meleeArcResolved = true;
            },
          });
          events.projectilesFired += traitStats.projectilesSpawned;
        } catch (error) {
          // Do not leave a partially captured batch visible when validation
          // rejects a malformed runtime command source.
          resetTraitPresentationEvents();
          throw error;
        } finally {
          traitPresentationCommandSource = null;
          traitPresentationCommandOffset = 0;
        }
      }
    }

    // Persistent pads resolve after all new trait commands in the same tick,
    // so a newly placed Gecko/Razorstep pad gets its first damaging pulse
    // immediately. Zones are damage-only and never alter enemy movement.
    zoneStepper.step(zones, {
      enemies,
      enemyGrid: grid,
      killEnemy,
      combat,
    });

    stepProjectiles(
      projectiles,
      enemies,
      grid,
      dt,
      worldWidth,
      worldHeight,
      maxEnemyRadius,
      events,
      killEnemy,
      player,
      config.player.invulnTicksOnHit,
      combat,
    );

    if (player.alive) {
      // Resolve rare world tokens before ordinary XP collection. A same-tick
      // Bomb + Magnet therefore vacuum-collects the Bomb's freshly spawned
      // motes exactly once, all in deterministic power-pool slot order.
      collectPowerPickups({
        powerPickups,
        xpPickups: pickups,
        player,
        enemies,
        killEnemy,
        isBoss: isBossEnemySlot,
        combat,
        events,
        xpMultiplier: xpGainMultiplier,
      });
      attractPickups(pickups, player, dt, pickupAttractionRadius, pickupAttractionSpeed);
      collectPickups(pickups, player, events, xpGainMultiplier);
      applyXpThresholds(player, config.xpThresholds, events);
    }

    if (runDirector !== null && runSpawnAdapter !== null) {
      const bossAlive = bossEntityId !== NO_ENTITY && enemies.isLive(bossEntityId);
      lastDirectorEvents = runDirector.step({
        tick: clock.tick,
        paused: false,
        playerAlive: player.alive,
        playerHp: player.hp,
        playerMaxHp: player.maxHp,
        playerLevel: player.level,
        liveEnemies: enemies.data.count,
        killsTotal: totalKills,
        bossAlive,
        bossDefeatedThisTick,
      });
      bossDefeatedThisTick = false;
      if (runDirector.outcome === 'running') {
        runSpawnAdapter.execute(lastDirectorEvents, {
          playerX: player.x,
          playerY: player.y,
          worldWidth,
          worldHeight,
          spawn: spawnDirected,
        });
      }
    }

    // A same-tick terminal outcome settles the run before any unresolved XP
    // can become a player choice. This prevents an upgrade (including Essence
    // Cache) from appearing after the terminal reward has already been paid.
    if (runDirector === null || runDirector.outcome === 'running') {
      runUpgradeQueue?.enqueueLevels(events.levelUps.length);
    }

    return events;
  }

  function selectUpgrade(id: string): UpgradeSelection {
    if (runUpgradeQueue === null) {
      throw new Error('Simulation.selectUpgrade: run upgrades are not enabled');
    }
    if (runDirector !== null && runDirector.outcome !== 'running') {
      throw new Error('Simulation.selectUpgrade: run has ended');
    }
    const selection = runUpgradeQueue.select(id, clock.tick);
    applyUniversalStats();
    replayRecorder.recordUpgrade(selection);
    return selection;
  }

  function fuseEvolution(evolutionId: string): UpgradeSelection {
    if (typeof evolutionId !== 'string' || evolutionId.length === 0) {
      throw new TypeError('Simulation.fuseEvolution: evolutionId must be a non-empty string');
    }
    if (runDirector !== null && runDirector.outcome !== 'running') {
      throw new Error('Simulation.fuseEvolution: run has ended');
    }
    const action = traitRuntime?.fuseEvolution;
    if (action === undefined) {
      throw new Error('Simulation.fuseEvolution: trait runtime does not support V1.1 fusions');
    }
    const result: TraitFuseResultView = action.call(traitRuntime, evolutionId);
    if (!result.outcome.ok) {
      throw new Error(`Simulation.fuseEvolution: ${result.outcome.kind} (${evolutionId})`);
    }
    const selection: UpgradeSelection = {
      tick: clock.tick,
      kind: 'fusion',
      id: `fusion:${evolutionId}`,
    };
    replayRecorder.recordUpgrade(selection);
    return selection;
  }

  function traitVisualState(): readonly TraitVisualAttachmentView[] {
    return traitRuntime?.visualState() ?? EMPTY_TRAIT_VISUALS;
  }

  function enemyPresentationRole(id: EntityId): RunEnemyRole {
    const slot = enemies.slotOf(id);
    return slot === -1
      ? RUN_ENEMY_ROLE.regular
      : enemyRoles[slot]! as RunEnemyRole;
  }

  function hash(): string {
    const writer = createHashWriter();
    writer.u32(CONFIG_VERSION);
    writer.str(configFingerprint);
    writer.str(runStartLoadoutFingerprint);
    writer.u32(clock.tick);

    const rngState = rng.getState();
    writer.u32(rngState.a);
    writer.u32(rngState.b);
    writer.u32(rngState.c);
    writer.u32(rngState.d);
    const combatRngState = combatRng.getState();
    writer.u32(combatRngState.a);
    writer.u32(combatRngState.b);
    writer.u32(combatRngState.c);
    writer.u32(combatRngState.d);
    const powerPickupRngState = powerPickupRng.getState();
    writer.u32(powerPickupRngState.a);
    writer.u32(powerPickupRngState.b);
    writer.u32(powerPickupRngState.c);
    writer.u32(powerPickupRngState.d);

    writer.f32(player.x);
    writer.f32(player.y);
    writer.f32(player.hp);
    writer.f32(player.maxHp);
    writer.f32(player.speed);
    writer.f32(player.radius);
    writer.f32(player.pickupRadius);
    writer.f64(player.xp);
    writer.u32(player.level);
    writer.u32(player.invulnTicks);
    writer.u8(player.alive ? 1 : 0);
    writer.f32(player.critChance ?? 0.05);
    writer.f32(player.critMultiplier ?? 2);
    writer.f32(player.dodgeChance ?? 0);
    writer.f32(player.armor ?? 0);
    writer.f32(player.shield ?? 0);
    writer.f32(player.shieldMax ?? 0);
    writer.u16(Math.max(0, Math.min(0xffff, Math.floor(player.shieldRechargeDelayTicks ?? 0))));
    writer.u16(Math.max(0, Math.min(0xffff, Math.floor(player.shieldRechargeTicksRemaining ?? 0))));
    writer.f32(player.shieldRechargePerTick ?? 0);

    writer.u32(weaponCooldown);
    writer.f32(weapon.damage);
    writer.u32(weapon.cooldownTicks);
    writer.f32(pickupAttractionRadius);
    writer.f32(pickupAttractionSpeed);
    writer.f64(xpGainMultiplier);
    writer.f32(traitDamageMultiplier);
    writer.f32(traitCooldownMultiplier);
    writer.f32(lastMoveDirX);
    writer.f32(lastMoveDirY);
    writer.u32(basicAttackMasteryRank);
    writer.u8(hero.id === 'greg' ? 1 : 0);
    if (hero.id === 'greg') {
      writer.i32(rushRakeState.tick);
      writer.u32(rushRakeState.chargeMilliunits);
      writer.f32(rushRakeState.facingX);
      writer.f32(rushRakeState.facingY);
      for (let slot = 0; slot < rushRakePendingTicks.length; slot++) {
        writer.i32(rushRakePendingTicks[slot]!);
        writer.f32(rushRakePendingAimX[slot]!);
        writer.f32(rushRakePendingAimY[slot]!);
        writer.f32(rushRakePendingOriginX[slot]!);
        writer.f32(rushRakePendingOriginY[slot]!);
      }
      for (let slot = 0; slot < rushRakeNearMissActive.length; slot++) {
        writer.u8(rushRakeNearMissActive[slot]!);
        writer.u16(rushRakeNearMissGeneration[slot]!);
      }
    }
    writer.u8(hero.id === 'benny' ? 1 : 0);
    if (hero.id === 'benny') {
      writer.i32(bennyBraceState.tick);
      writer.u32(bennyBraceState.charge);
      writer.u32(bennyBraceState.cooldownTicksRemaining);
      for (let slot = 0; slot < groundWavePendingTicks.length; slot++) {
        writer.i32(groundWavePendingTicks[slot]!);
        writer.f32(groundWaveOriginX[slot]!);
        writer.f32(groundWaveOriginY[slot]!);
        writer.f32(groundWaveDirX[slot]!);
        writer.f32(groundWaveDirY[slot]!);
        writer.f32(groundWaveRadius[slot]!);
        writer.f32(groundWaveDamage[slot]!);
        writer.u8(groundWaveCritical[slot]!);
        writer.u8(groundWaveIndex[slot]!);
      }
    }
    writer.u8(hero.id === 'gracie' ? 1 : 0);
    if (hero.id === 'gracie') {
      writer.i32(gracieScoutState.tick);
      writer.u32(gracieScoutState.cooldownTicksRemaining);
      writer.f32(gracieScoutState.facingX);
      writer.f32(gracieScoutState.facingY);
    }

    // enemies
    {
      const data = enemies.data;
      writer.u32(data.count);
      for (let slot = 0; slot < data.capacity; slot++) {
        writer.u8(data.alive[slot]!);
        writer.u16(data.generation[slot]!);
        if (data.alive[slot] === 1) {
          writer.f32(data.posX[slot]!);
          writer.f32(data.posY[slot]!);
          writer.f32(data.velX[slot]!);
          writer.f32(data.velY[slot]!);
          writer.f32(data.hp[slot]!);
          writer.f32(data.maxHp[slot]!);
          writer.f32(data.speed[slot]!);
          writer.f32(data.radius[slot]!);
          writer.f32(data.touchDamage[slot]!);
          writer.u16(data.contactCooldown[slot]!);
          writer.u16(data.zoneDamageCooldown[slot]!);
          writer.u8(data.archetype[slot]!);
          writer.f32(data.xpDrop[slot]!);
          writer.u8(data.marked[slot]!);
          writer.u8(enemyBehavior.kind[slot]!);
          writer.u16(enemyBehavior.hostileShotCooldown[slot]!);
          writer.u16(enemyBehavior.bossPatternTick[slot]!);
        }
      }
    }

    // projectiles
    {
      const data = projectiles.data;
      writer.u32(data.count);
      for (let slot = 0; slot < data.capacity; slot++) {
        writer.u8(data.alive[slot]!);
        writer.u16(data.generation[slot]!);
        if (data.alive[slot] === 1) {
          writer.f32(data.posX[slot]!);
          writer.f32(data.posY[slot]!);
          writer.f32(data.velX[slot]!);
          writer.f32(data.velY[slot]!);
          writer.f32(data.damage[slot]!);
          writer.u16(data.lifetime[slot]!);
          writer.f32(data.hitRadius[slot]!);
          writer.u8(data.pierce[slot]!);
          writer.u16(data.hitCount[slot]!);
          const historyStart = slot * MAX_PROJECTILE_HIT_HISTORY;
          for (let hitIndex = 0; hitIndex < data.hitCount[slot]!; hitIndex++) {
            writer.i32(data.hitHistory[historyStart + hitIndex]!);
          }
          writer.u8(data.faction[slot]!);
          writer.u8(data.critical[slot]!);
          writer.u8(data.source[slot]!);
        }
      }
    }

    // pickups
    {
      const data = pickups.data;
      writer.u32(data.count);
      for (let slot = 0; slot < data.capacity; slot++) {
        writer.u8(data.alive[slot]!);
        writer.u16(data.generation[slot]!);
        if (data.alive[slot] === 1) {
          writer.f32(data.posX[slot]!);
          writer.f32(data.posY[slot]!);
          writer.u8(data.kind[slot]!);
          writer.f32(data.xp[slot]!);
          writer.f32(data.radius[slot]!);
        }
      }
    }

    // rare non-XP world pickups
    {
      const data = powerPickups.data;
      writer.u32(data.count);
      for (let slot = 0; slot < data.capacity; slot++) {
        writer.u8(data.alive[slot]!);
        writer.u16(data.generation[slot]!);
        if (data.alive[slot] === 1) {
          writer.f32(data.posX[slot]!);
          writer.f32(data.posY[slot]!);
          writer.u8(data.kind[slot]!);
          writer.f32(data.amount[slot]!);
          writer.f32(data.radius[slot]!);
        }
      }
    }

    // persistent damage zones
    {
      const data = zones.data;
      writer.u32(data.count);
      for (let slot = 0; slot < data.capacity; slot++) {
        writer.u8(data.alive[slot]!);
        writer.u16(data.generation[slot]!);
        if (data.alive[slot] === 1) {
          writer.f32(data.posX[slot]!);
          writer.f32(data.posY[slot]!);
          writer.f32(data.radius[slot]!);
          writer.f32(data.damage[slot]!);
          writer.u16(data.lifetime[slot]!);
          writer.u16(data.intervalTicks[slot]!);
          writer.u16(data.pulseCooldown[slot]!);
          writer.u8(data.tag[slot]!);
          writer.u8(data.critical[slot]!);
          writer.u8(data.source[slot]!);
        }
      }
    }

    if (traitRuntime !== null) {
      writer.str(traitCatalogFingerprint!);
      writer.str(traitRuntime.hash());
    }

    if (runUpgradeQueue !== null) {
      writer.f64(runUpgradeQueue.queuedLevels);
      writer.f64(runUpgradeQueue.drainedLevels);
      writer.f64(runUpgradeQueue.selectionCount);
      writer.f64(runUpgradeQueue.essenceEarned);
      writer.f64(runUpgradeQueue.universalOfferCursor);
      writer.u32(runUpgradeQueue.universalSlotCapacity ?? 0);
      writer.u32(runUpgradeQueue.universalSlotsUsed ?? 0);
      writer.u32(runUpgradeQueue.pendingOfferCount);
      for (const offer of runUpgradeQueue.pendingOffers) {
        writer.str(offer.kind);
        writer.str(offer.id);
        switch (offer.kind) {
          case 'trait':
            writer.str(offer.traitId);
            writer.str(offer.resultStage);
            writer.u32(offer.resultRank ?? (offer.resultStage === 'bud' ? 1 : 2));
            writer.u8(offer.isMaster === true ? 1 : 0);
            break;
          case 'universal':
            writer.str(offer.upgradeId);
            writer.f64(offer.currentRank);
            writer.f64(offer.nextRank);
            writer.f64(offer.maxRank);
            break;
          case 'essence':
            writer.f64(offer.amount);
            break;
        }
      }
      const universalState = runUpgradeQueue.universalState;
      if (universalState === null) {
        writer.u8(0);
      } else {
        writer.u8(1);
        writer.str(universalState.catalogFingerprint);
        writer.u32(universalState.ranks.length);
        for (const rank of universalState.ranks) writer.f64(rank);
      }
    }

    if (runDirector !== null) {
      const directorHash = runDirector.stateHash();
      if (!/^[0-9a-f]{8}$/.test(directorHash)) {
        throw new Error('run director state hash must be 8 lowercase hexadecimal characters');
      }
      writer.str(runContentFingerprint!);
      writer.str(directorHash);
      writer.f64(totalKills);
      writer.u32(bossEntityId);
      for (let slot = 0; slot < enemies.data.capacity; slot++) {
        if (enemies.data.alive[slot] === 1) writer.u8(enemyRoles[slot]!);
      }
    }

    return writer.digestHex();
  }

  function getReplay(): ReplayRecord {
    return replayRecorder.finish();
  }

  return {
    get tick() {
      return clock.tick;
    },
    player,
    enemies,
    projectiles,
    pickups,
    powerPickups,
    zones,
    grid,
    waveDirector,
    traitCatalogFingerprint,
    universalUpgradeCatalog: runUpgradeQueue?.universalCatalog ?? null,
    universalUpgradeCatalogFingerprint,
    runStartLoadoutFingerprint,
    runContentFingerprint,
    get runOutcome() {
      return runDirector?.outcome ?? null;
    },
    get runPhase() {
      return runDirector?.phase ?? null;
    },
    get directorEvents() {
      return lastDirectorEvents;
    },
    get totalKills() {
      return totalKills;
    },
    get runEssenceEarned() {
      return runUpgradeQueue?.essenceEarned ?? 0;
    },
    get universalUpgradeRanks() {
      return runUpgradeQueue?.universalState?.ranks ?? EMPTY_UNIVERSAL_RANKS;
    },
    get universalUpgradeSlotCapacity() {
      return runUpgradeQueue?.universalSlotCapacity ?? 0;
    },
    get universalUpgradeSlotsUsed() {
      return runUpgradeQueue?.universalSlotsUsed ?? 0;
    },
    get pendingUpgradeOffers() {
      return runUpgradeQueue?.pendingOffers ?? EMPTY_RUN_OFFERS;
    },
    get upgradeSelectionPending() {
      return runUpgradeQueue?.blocked ?? false;
    },
    get availableFusions() {
      return traitRuntime?.availableFusions?.() ?? EMPTY_FUSION_OFFERS;
    },
    get traitPresentationEvents() {
      return traitPresentationEvents;
    },
    get combatPresentationEvents() {
      return combatPresentationEventBuffer.events;
    },
    get combatPresentationEventsDropped() {
      return combatPresentationEventBuffer.dropped;
    },
    get xpLostToFullPickupPool() {
      return xpLostToFullPickupPool;
    },
    get powerPickupsLostToFullPool() {
      return powerPickupsLostToFullPool;
    },
    enemyPresentationRole,
    spawnPowerPickup,
    step,
    selectUpgrade,
    fuseEvolution,
    traitVisualState,
    hash,
    getReplay,
  };
}

/**
 * Reconstructs a fresh Simulation from record.seed and replays every
 * recorded input (including paused ticks) in order. Throws if the record's
 * configVersion or exact config fingerprint differs from the current build —
 * a replay recorded against different gameplay content cannot be trusted to
 * reproduce the same simulation.
 */
export function runReplay(
  config: SimConfig,
  record: ReplayRecord,
  options: SimulationOptions = {},
): { finalHash: string; ticks: number } {
  if (record.configVersion !== CONFIG_VERSION) {
    throw new Error(
      `runReplay: configVersion mismatch (record has ${record.configVersion}, current is ${CONFIG_VERSION})`,
    );
  }
  const currentFingerprint = fingerprintConfig(config);
  if (record.configFingerprint !== currentFingerprint) {
    throw new Error(
      `runReplay: config fingerprint mismatch (record has ${record.configFingerprint}, current is ${currentFingerprint})`,
    );
  }
  const sim = createSimulation(config, record.seed, options);
  if (record.traitCatalogFingerprint !== sim.traitCatalogFingerprint) {
    throw new Error('runReplay: trait catalog fingerprint mismatch');
  }
  if (record.universalUpgradeCatalogFingerprint !== sim.universalUpgradeCatalogFingerprint) {
    throw new Error('runReplay: universal upgrade catalog fingerprint mismatch');
  }
  if (record.runContentFingerprint !== sim.runContentFingerprint) {
    throw new Error('runReplay: run content fingerprint mismatch');
  }
  if (record.runStartLoadoutFingerprint !== sim.runStartLoadoutFingerprint) {
    throw new Error('runReplay: run start loadout fingerprint mismatch');
  }
  let selectionIndex = 0;
  for (const input of record.inputs) {
    sim.step(input);
    while (
      selectionIndex < record.upgradeSelections.length &&
      record.upgradeSelections[selectionIndex]!.tick === sim.tick
    ) {
      const expectedSelection = record.upgradeSelections[selectionIndex]!;
      const appliedSelection = expectedSelection.kind === 'fusion'
        ? (() => {
          const prefix = 'fusion:';
          if (!expectedSelection.id.startsWith(prefix)) {
            throw new Error('runReplay: fusion selection id is missing its prefix');
          }
          return sim.fuseEvolution(expectedSelection.id.slice(prefix.length));
        })()
        : sim.selectUpgrade(expectedSelection.id);
      if (
        appliedSelection.kind !== expectedSelection.kind ||
        appliedSelection.id !== expectedSelection.id
      ) {
        throw new Error('runReplay: upgrade selection no longer matches the pending typed offer');
      }
      selectionIndex++;
    }
    if (
      selectionIndex < record.upgradeSelections.length &&
      record.upgradeSelections[selectionIndex]!.tick < sim.tick
    ) {
      throw new Error('runReplay: upgrade selection tick was not reachable');
    }
  }
  if (selectionIndex !== record.upgradeSelections.length) {
    throw new Error('runReplay: unapplied upgrade selections remain');
  }
  return { finalHash: sim.hash(), ticks: sim.tick };
}

// Re-exported here so callers of simulation.ts alone (rather than index.ts)
// can still round-trip a replay without a second import from replay.js.
export { serializeReplay, deserializeReplay };
