/**
 * Public API surface for the headless-sim spike.
 */
export type * from './types.js';

export * from './config.js';
export { createRng } from './rng.js';
export { createClock } from './clock.js';
export { createReplayRecorder, serializeReplay, deserializeReplay } from './replay.js';
export { createHashWriter } from './state-hash.js';
export { createEnemyPool, createProjectilePool, createPickupPool } from './pools.js';
export { createSpatialGrid } from './spatial-grid.js';
export { selectTarget } from './targeting.js';
export { createWaveDirector } from './wave-director.js';
export {
  stepEnemies,
  stepProjectiles,
  collectPickups,
  applyXpThresholds,
  spawnProjectile,
} from './combat.js';
export {
  createSimulation,
  runReplay,
  type Simulation,
  type SimulationOptions,
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
