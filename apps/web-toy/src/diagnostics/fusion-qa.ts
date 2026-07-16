/**
 * Explicit debug-only fixture for manual Wild Splice browser QA.
 *
 * It creates real rank-five parents through the normal TraitRuntime API and
 * deliberately leaves the fusion unresolved. The app still presents and
 * resolves the live offer, so the card, toast, attachment seam, and build row
 * remain on the same production-facing path used by a normal run.
 */
import type { TraitRuntimeFactory } from '@sim';
import { GREG_FOREST_ARSENAL_CATALOG, TraitRuntime } from '@traits';

export const FUSION_QA_SCENARIOS = Object.freeze({
  wild: Object.freeze({
    label: 'Wild · Static Acupuncture',
    ingredients: Object.freeze(['porcupine-quills', 'electric-eel-coil'] as const),
    evolutionId: 'chimera:porcupine-quills+electric-eel-coil',
  }),
  perfect: Object.freeze({
    label: 'Perfect · Thornstorm Mantle',
    ingredients: Object.freeze(['porcupine-quills', 'puffer-pouch'] as const),
    evolutionId: 'thornstorm-mantle',
  }),
  support: Object.freeze({
    label: 'Support · The Polite Kidnapping',
    ingredients: Object.freeze(['puffer-pouch', 'bat-ears'] as const),
    evolutionId: 'chimera:puffer-pouch+bat-ears',
  }),
} as const);

export type FusionQaScenarioId = keyof typeof FUSION_QA_SCENARIOS;

export function parseFusionQaScenario(value: string | null): FusionQaScenarioId | null {
  return value !== null && Object.hasOwn(FUSION_QA_SCENARIOS, value)
    ? value as FusionQaScenarioId
    : null;
}

function master(runtime: TraitRuntime, traitId: string): void {
  for (let rank = 1; rank <= 5; rank++) {
    const result = runtime.applyUpgrade(traitId);
    if (!result.outcome.ok) {
      throw new Error(`Fusion QA could not Master ${traitId} at rank ${rank}: ${result.outcome.kind}`);
    }
  }
}

/** Construct one real runtime with a visible-but-unresolved fusion offer. */
export function createFusionQaRuntime(
  scenario: FusionQaScenarioId | null,
  seed: number,
  initialTick: number,
): TraitRuntime {
  const runtime = new TraitRuntime({ seed, initialTick, catalog: GREG_FOREST_ARSENAL_CATALOG });
  if (scenario === null) return runtime;
  const fixture = FUSION_QA_SCENARIOS[scenario];
  for (const traitId of fixture.ingredients) master(runtime, traitId);
  if (!runtime.availableFusions().some((offer) => offer.evolutionId === fixture.evolutionId)) {
    throw new Error(`Fusion QA fixture did not expose ${fixture.evolutionId}`);
  }
  return runtime;
}

/** Factory shape accepted by the simulation; use only behind `debug=1`. */
export function createFusionQaTraitRuntimeFactory(
  scenario: FusionQaScenarioId | null,
): TraitRuntimeFactory {
  return ({ seed, initialTick }) => createFusionQaRuntime(scenario, seed, initialTick);
}
