/**
 * Public API surface for the headless-sim spike.
 */
export type * from './types.js';
export { makeId, idSlot, idGeneration, NO_ENTITY } from './types.js';

export * from './config.js';
export { createRng } from './rng.js';
export { createClock } from './clock.js';
export { createReplayRecorder, serializeReplay, deserializeReplay } from './replay.js';
export { createHashWriter } from './state-hash.js';
export { createEnemyPool, createProjectilePool, createPickupPool, createZonePool } from './pools.js';
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
  xpRequiredForNextLevel,
} from './combat.js';
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
  type TraitUpgradeStage,
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
  RUN_START_LOADOUT_VERSION,
  fingerprintRunStartLoadout,
  normalizeRunStartLoadout,
  type RunStartLoadout,
} from './run-start-loadout.js';
export {
  SHARPENED_INSTINCT,
  STURDY_HIDE,
  SWIFT_PAWS,
  RAPID_INSTINCT,
  GROWTH,
  UNIVERSAL_UPGRADE_CATALOG,
  UNIVERSAL_UPGRADE_CATALOG_VERSION,
  UNIVERSAL_UPGRADE_IDS,
  XP_MAGNET,
  applyUniversalUpgrade,
  availableUniversalUpgradeOffers,
  createUniversalUpgradeState,
  fingerprintUniversalUpgradeCatalog,
  getUniversalUpgrade,
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
export {
  createTraitCommandExecutor,
  type TraitCombatCommand,
  type TraitCommandSource,
  type TraitCommandExecutionContext,
  type TraitCommandExecutionStats,
  type TraitCommandExecutor,
  type TraitCommandExecutorOptions,
} from './trait-command-executor.js';
