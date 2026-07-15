/**
 * Public API surface for the deterministic simulation package.
 */
export type * from './types.js';
export { makeId, idSlot, idGeneration, NO_ENTITY } from './types.js';

export * from './config.js';
export { createRng } from './rng.js';
export { createClock } from './clock.js';
export { createReplayRecorder, serializeReplay, deserializeReplay } from './replay.js';
export { createHashWriter } from './state-hash.js';
export {
  ATTACK_DAMAGE_LAB_CASE_COUNT,
  ATTACK_DAMAGE_LAB_DURATION_SECONDS,
  ATTACK_DAMAGE_LAB_SEED,
  ATTACK_DAMAGE_LAB_VERSION,
  formatAttackDamageLabReport,
  runAttackDamageLab,
  runAttackDamageLabReport,
  type AttackDamageLabCategory,
  type AttackDamageLabReport,
  type AttackDamageLabResult,
  type AttackDamageLabStatus,
  type AttackDamageLabSummary,
} from './attack-damage-lab.js';
export {
  createEnemyPool,
  createProjectilePool,
  createPickupPool,
  createPowerPickupPool,
  createZonePool,
} from './pools.js';
export {
  ZONE_TAG,
  zoneTagFromCommandTag,
  createZoneStepper,
  type ZoneStepContext,
  type ZoneStepStats,
  type ZoneStepper,
  type ZoneTag,
} from './zones.js';
export {
  ENEMY_BEHAVIOR_KIND,
  createEnemyBehaviorState,
  resetEnemyBehavior,
} from './enemy-behavior.js';
export type { EnemyBehaviorKind, EnemyBehaviorState } from './enemy-behavior.js';
export { createSpatialGrid } from './spatial-grid.js';
export { selectTarget } from './targeting.js';
export { createWaveDirector } from './wave-director.js';
export {
  stepEnemies,
  stepProjectiles,
  collectPickups,
  attractPickups,
  applyXpThresholds,
  spawnProjectile,
  spawnProjectileWithStats,
  xpRequiredForNextLevel,
} from './combat.js';
export {
  COMBAT_DAMAGE_SOURCE,
  COMBAT_PRESENTATION_EVENT_KIND,
  MAX_COMBAT_PRESENTATION_EVENTS,
  armorDamageMultiplier,
  combatDamageSourceIdFromCode,
  createCombatDamageResolver,
  createCombatPresentationEventBuffer,
  type CombatDamageResolver,
  type CombatDamageResolverOptions,
  type CombatPresentationEventBuffer,
  type CombatPresentationEventKind,
  type CombatPresentationEventView,
  type ResolvedOutgoingDamage,
  type ResolvedPlayerDamage,
} from './combat-resolution.js';
export {
  DEFAULT_BOMB_BOSS_MAX_HP_FRACTION,
  DEFAULT_FOOD_HEAL_FRACTION,
  DEFAULT_POWER_PICKUP_RADIUS,
  POWER_PICKUP_DROP_ROLL_RANGE,
  POWER_PICKUP_KIND,
  collectPowerPickups,
  powerPickupCapacityForXpCap,
  powerPickupKindForDeathRoll,
  powerPickupKindFromCode,
  spawnPowerPickup,
  type PowerPickupCollectionContext,
  type PowerPickupKind,
} from './power-pickups.js';
export {
  createSimulation,
  runReplay,
  type Simulation,
  type SimulationOptions,
  type TraitPresentationEventView,
} from './simulation.js';
export {
  assertTraitRuntimePort,
  createTraitRuntimePort,
  type TraitRuntimeCommandSource,
  type TraitRuntimeCommandView,
  type TraitRuntimeFactory,
  type TraitRuntimeFactoryOptions,
  type TraitRuntimePort,
  type TraitRuntimeUpdateContext,
  type TraitUpgradeApplyResultView,
  type TraitUpgradeOfferView,
  type TraitUpgradeOutcomeView,
  type TraitUpgradeRank,
  type TraitUpgradeStage,
  type TraitFusionOfferView,
  type TraitFuseOutcomeView,
  type TraitFuseResultView,
  type TraitVisualAttachmentView,
} from './trait-runtime-port.js';
export {
  createTraitUpgradeQueue,
  type TraitUpgradeQueue,
  type TraitUpgradeQueueOptions,
  type TraitUpgradeSelection,
} from './trait-upgrade-queue.js';
export {
  createRunUpgradeQueue,
  PASSIVE_SLOT_CAPACITY,
  type EssenceRunUpgradeOffer,
  type RunUpgradeOfferView,
  type RunUpgradeQueue,
  type RunUpgradeQueueOptions,
  type RunUpgradeSelection,
  type TraitRunUpgradeOffer,
  type UniversalRunUpgradeOffer,
} from './run-upgrade-queue.js';
export {
  DEFAULT_RUN_START_LOADOUT,
  BIOME_IDS,
  HERO_CATALOG,
  HERO_BASIC_ATTACK_CATALOG,
  HERO_IDS,
  RUN_START_LOADOUT_VERSION,
  RUN_START_BONUS_LIMITS,
  fingerprintRunStartLoadout,
  getHeroBasicAttackDefinition,
  getHeroDefinition,
  normalizeRunStartLoadout,
  type HeroDefinition,
  type HeroBasicAttackDefinition,
  type HeroBasicAttackPattern,
  type HeroBasicAttackTargeting,
  type HeroId,
  type BiomeId,
  type RunStartLoadout,
  type NormalizedRunStartLoadout,
  type NormalizedRunStartBonuses,
} from './run-start-loadout.js';
export {
  SHARPENED_INSTINCT,
  STURDY_HIDE,
  SWIFT_PAWS,
  RAPID_INSTINCT,
  GROWTH,
  HERO_BASIC_ATTACK_UPGRADES,
  UNIVERSAL_UPGRADE_CATALOG,
  UNIVERSAL_UPGRADE_CATALOG_VERSION,
  UNIVERSAL_UPGRADE_IDS,
  XP_MAGNET,
  applyUniversalUpgrade,
  availableUniversalUpgradeOffers,
  createUniversalUpgradeState,
  fingerprintUniversalUpgradeCatalog,
  getUniversalUpgrade,
  getUniversalUpgradeCatalogForHero,
  resolveUniversalUpgradeStats,
  universalUpgradeRank,
  validateUniversalUpgradeCatalog,
  validateUniversalUpgradeState,
  type UniversalUpgradeApplyResult,
  type UniversalUpgradeCatalog,
  type UniversalUpgradeDefinition,
  type UniversalUpgradeEffect,
  type UniversalUpgradeId,
  type UniversalUpgradeOffer,
  type UniversalUpgradeState,
  type UniversalUpgradeStats,
} from './universal-upgrades.js';
export * from './run-director-port.js';
export * from './run-spawn-adapter.js';
export * from './instincts/greg-rush-rake.js';
export * from './instincts/benny-brace.js';
export * from './instincts/gracie-scout.js';
export {
  createTraitCommandExecutor,
  type TraitCombatCommand,
  type TraitCommandSource,
  type TraitCommandExecutionContext,
  type TraitCommandExecutionStats,
  type TraitCommandExecutor,
  type TraitCommandExecutorOptions,
} from './trait-command-executor.js';
