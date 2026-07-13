import {
  COMMAND_KINDS,
  GREG_FOREST_ARSENAL_CATALOG,
  type Catalog,
  type CommandKind,
  type UpgradeOffer,
} from '@traits';
import type { AudioCue } from '../audio/audio-cue-router';
import {
  getAdaptationPresentationDefinitions,
  type AdaptationPresentationDefinition,
} from '../presentation/active-adaptations';

/** Release-facing result for authored player content, separate from the
 * simulation package's structural catalog validator. */
export interface PlayerContentValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly subjectId?: string;
}

export interface PlayerContentValidationResult {
  readonly ok: boolean;
  readonly issues: readonly PlayerContentValidationIssue[];
}

/** Every executable command kind must have a deliberate audio identity. */
export const COMMAND_AUDIO_CUES: Readonly<Record<CommandKind, AudioCue>> = Object.freeze({
  spawnProjectileBurst: 'attack',
  radialProjectileBurst: 'attack',
  orbitingDamage: 'orbit',
  areaGather: 'attack',
  areaKnockback: 'attack',
  applyAreaDamage: 'attack',
  spawnZone: 'attack',
  markTargets: 'attack',
  chainDamage: 'lightning',
  meleeArc: 'melee',
  grantShield: 'orbit',
  telegraph: 'attack',
  playTraitCue: 'attack',
});

const OWNED_STAGES = ['bud', 'adapted'] as const;

function issue(
  issues: PlayerContentValidationIssue[],
  code: string,
  message: string,
  subjectId?: string,
): void {
  issues.push(subjectId === undefined ? { code, message } : { code, message, subjectId });
}

function behaviorEmits(definition: {
  readonly behavior: {
    readonly emit?: { readonly kind: string };
    readonly phases?: readonly { readonly emit: { readonly kind: string } }[];
  };
}): readonly { readonly kind: string }[] {
  if (definition.behavior.phases !== undefined) {
    return definition.behavior.phases.map((phase) => phase.emit);
  }
  return definition.behavior.emit === undefined ? [] : [definition.behavior.emit];
}

function validatePresentation(
  subjectId: string,
  visualKey: string,
  expectedSourceId: string,
  expectedStage: AdaptationPresentationDefinition['stage'],
  presentationByKey: ReadonlyMap<string, AdaptationPresentationDefinition>,
  issues: PlayerContentValidationIssue[],
): void {
  const presentation = presentationByKey.get(visualKey);
  if (presentation === undefined) {
    issue(issues, 'missingPresentation', `No player card exists for visual key "${visualKey}".`, subjectId);
    return;
  }
  if (presentation.sourceId !== expectedSourceId || presentation.stage !== expectedStage) {
    issue(
      issues,
      'presentationIdentityMismatch',
      `Presentation "${visualKey}" points at ${presentation.sourceId}/${presentation.stage}, expected ${expectedSourceId}/${expectedStage}.`,
      subjectId,
    );
  }
  if (presentation.card.title.trim() === '' || presentation.card.effect.trim() === '' || presentation.card.cadence.trim() === '') {
    issue(issues, 'missingCopy', `Presentation "${visualKey}" must have title, effect, and cadence copy.`, subjectId);
  }
}

function validateCommandAudio(
  subjectId: string,
  definition: {
    readonly behavior: {
      readonly emit?: { readonly kind: string };
      readonly phases?: readonly { readonly emit: { readonly kind: string } }[];
    };
  },
  issues: PlayerContentValidationIssue[],
): void {
  for (const emit of behaviorEmits(definition)) {
    if (!(COMMAND_KINDS as readonly string[]).includes(emit.kind)) {
      issue(issues, 'unsupportedCommandKind', `Command kind "${emit.kind}" is not in the executable command vocabulary.`, subjectId);
      continue;
    }
    if (!(emit.kind in COMMAND_AUDIO_CUES)) {
      issue(issues, 'missingAudioCue', `Command kind "${emit.kind}" has no audio cue mapping.`, subjectId);
    }
  }
}

/**
 * Validates authored trait/evolution content against the player-facing
 * manifest. This catches content that could be offered but has no visual form,
 * copy, or audio identity.
 */
export function validatePlayerContent(
  catalog: Catalog = GREG_FOREST_ARSENAL_CATALOG,
): PlayerContentValidationResult {
  const issues: PlayerContentValidationIssue[] = [];
  const presentationByKey = new Map<string, AdaptationPresentationDefinition>();
  for (const presentation of getAdaptationPresentationDefinitions()) {
    if (presentationByKey.has(presentation.card.id)) {
      issue(issues, 'duplicatePresentation', `Presentation key "${presentation.card.id}" is declared more than once.`, presentation.card.id);
    }
    presentationByKey.set(presentation.card.id, presentation);
  }

  for (const trait of catalog.traits) {
    for (const stage of OWNED_STAGES) {
      const definition = trait.stages[stage];
      const subjectId = `${trait.id}:${stage}`;
      validatePresentation(subjectId, definition.visualKey, trait.id, stage, presentationByKey, issues);
      validateCommandAudio(subjectId, definition, issues);
    }
  }
  for (const evolution of catalog.evolutions) {
    const subjectId = evolution.id;
    const sourceId = evolution.id.replace(/:mythic$/, '');
    validatePresentation(subjectId, evolution.visualKey, sourceId, 'mythic', presentationByKey, issues);
    validateCommandAudio(subjectId, evolution, issues);
  }

  const expectedKeys = new Set<string>();
  for (const trait of catalog.traits) {
    for (const stage of OWNED_STAGES) expectedKeys.add(trait.stages[stage].visualKey);
  }
  for (const evolution of catalog.evolutions) expectedKeys.add(evolution.visualKey);
  for (const [key] of presentationByKey) {
    if (!expectedKeys.has(key)) issue(issues, 'orphanPresentation', `Presentation "${key}" has no catalog definition.`, key);
  }

  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

/** Validate one deterministic offer at the same boundary used by the HUD. */
export function validatePlayerContentOffer(
  offer: UpgradeOffer,
  catalog: Catalog = GREG_FOREST_ARSENAL_CATALOG,
): PlayerContentValidationResult {
  const trait = catalog.traits.find((candidate) => candidate.id === offer.traitId);
  if (trait === undefined) {
    return {
      ok: false,
      issues: [{ code: 'unknownOfferTrait', message: `Offer references unknown trait "${offer.traitId}".`, subjectId: offer.traitId }],
    };
  }
  const stage = trait.stages[offer.resultStage];
  const issues: PlayerContentValidationIssue[] = [];
  const presentationByKey = new Map(getAdaptationPresentationDefinitions().map((presentation) => [presentation.card.id, presentation]));
  validatePresentation(`${offer.traitId}:${offer.resultStage}`, stage.visualKey, trait.id, offer.resultStage, presentationByKey, issues);
  validateCommandAudio(`${offer.traitId}:${offer.resultStage}`, stage, issues);
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

export function assertPlayerContent(catalog: Catalog = GREG_FOREST_ARSENAL_CATALOG): void {
  const result = validatePlayerContent(catalog);
  if (!result.ok) throw new Error(`Invalid player content: ${result.issues.map((entry) => entry.code).join(', ')}`);
}
