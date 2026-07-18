import * as pc from 'playcanvas';
import {
  hasExplicitTraitSourcePaletteLane,
  isPlayerAttackPaletteLane,
  paletteLaneForChimeraSource,
  paletteLaneForEffectMaterial,
  paletteLaneForTraitSource,
  proceduralAccentOpacity,
  proceduralColorForPaletteLane,
  proceduralUnderlayOpacity,
  type AttackVfxPaletteLane,
} from './attack-vfx-palette';
import { envelope } from './vfx-easing';

/**
 * Read-only, renderer-facing copy of a trait command.  It intentionally stays
 * structural so the browser layer does not depend on the trait-runtime package
 * (or mutate its reusable command buffer).
 */
export interface TraitCommandPresentationEvent {
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
  /**
   * Angular width in radians for an authoritative melee sweep. Optional while
   * older command producers are still structurally compatible.
   */
  readonly arc?: number;
  readonly facing: number;
  readonly spread: number;
  readonly range: number;
  /**
   * True only after the authoritative executor acquired and resolved a real
   * melee target. This must not be inferred from authored fallback direction.
   */
  readonly meleeArcResolved?: boolean;
  /**
   * Authoritative chain-lightning impact endpoints. They are optional so this
   * renderer remains compatible with older command producers, but a
   * `chainDamage` effect never renders until it has at least one resolved hit.
   */
  readonly resolvedHitCount?: number;
  readonly resolvedHitX?: Float32Array;
  readonly resolvedHitY?: Float32Array;
  /**
   * Authoritative orbit/contact results. They are optional so this renderer
   * remains compatible with older command producers; a visible contact flash
   * is never fabricated when the executor did not resolve a victim.
   */
  readonly resolvedOrbitHitCount?: number;
  readonly resolvedOrbitHitX?: Float32Array;
  readonly resolvedOrbitHitY?: Float32Array;
  readonly resolvedOrbitSourceX?: Float32Array;
  readonly resolvedOrbitSourceY?: Float32Array;
  /** Present when the producer has access to the full trait-runtime command. */
  readonly tag?: string;
  /** Present when the producer has access to the full trait-runtime command. */
  readonly durationTicks?: number;
}

export type TraitCommandEffectKind =
  | 'telegraph'
  | 'directed-burst'
  | 'radial-burst'
  | 'orbiting-damage'
  | 'gather'
  | 'knockback'
  | 'area-damage'
  | 'melee-arc'
  | 'zone-spawn'
  | 'trait-cue'
  | 'chain-lightning'
  | 'mark-pulse';

type EffectMotion = 'expand' | 'contract' | 'pulse';
type EffectMaterial = Exclude<TraitCommandEffectKind, 'zone-spawn'>
  | 'rush-rake'
  | 'greg-fox-swipe'
  | 'greg-rush-rake'
  | 'benny-trample-wave'
  | 'gracie-spit'
  | 'fluffy-shield'
  | 'armor-block'
  | 'fox-dodge'
  | 'quill-volley'
  | 'owl-volley'
  | 'puffer-blast'
  | 'crab-crush'
  | 'meteor-impact'
  | 'armadillo-roll'
  | 'skunk-cloud'
  | 'royal-stink-cloud'
  | 'thornstorm-volley'
  | 'firefly-contact'
  | 'benny-brace'
  | 'gracie-scout'
  | 'monarch-brood-orbit'
  | 'thornstorm-telegraph'
  | 'thunderbug-telegraph'
  | 'boss-charge'
  | 'boss-volley'
  | 'saltwind-charge'
  | 'saltwind-sandstorm'
  | 'support-pulse'
  | 'bat-ears-sonar'
  | 'midnight-radar-sonar'
  | 'gecko-zone-spawn'
  | 'razorstep-zone-spawn';

type OrbitingVisualMaterial = 'orbiting-damage' | 'monarch-brood-orbit';

/**
 * A compact library of reusable accent silhouettes.  These are deliberately
 * shared across every trait rather than allocating a bespoke particle system
 * for each command.  The authored base mesh still owns a trait's identity;
 * the accent supplies the readable cast, travel, impact, and afterglow beat.
 */
export type TraitCommandVisualAccent = 'crown' | 'comet' | 'slash' | 'ridge' | 'halo' | 'rune';

/** Visual stage names are public so presentation behaviour stays focused-testable. */
export type TraitCommandVisualStage = 'cast' | 'travel' | 'impact' | 'aftermath';

/**
 * Renderer-only choreography for a command family. None of these values
 * influence simulation hitboxes, timing, or targeting.
 */
export interface TraitCommandVisualBlueprint {
  readonly accent: TraitCommandVisualAccent;
  readonly castScale: number;
  readonly travelDistance: number;
  readonly impactScale: number;
  readonly aftermathOpacity: number;
}

export interface TraitCommandEffectProfile {
  readonly kind: TraitCommandEffectKind;
  readonly material: EffectMaterial;
  readonly motion: EffectMotion;
  readonly lifetimeTicks: number;
  readonly fallbackRadius: number;
  readonly minimumRadius: number;
  readonly maximumRadius: number;
  readonly directed: boolean;
}

export interface TraitCommandPresentation {
  readonly capacity: number;
  readonly overflowCount: number;
  /**
   * Consume commands newly emitted since the previous render call. Effects
   * remain visible after the input stream is empty, until their tick lifetime
   * expires. `currentTick` comes from the rendered simulation snapshot.
   */
  update(
    currentTick: number,
    events: readonly TraitCommandPresentationEvent[],
    /** Interpolated Scout position; primitives avoid a steady-state allocation. */
    heroX?: number,
    heroY?: number,
  ): void;
  /** Clear all renderer-only effects, useful for an explicit run restart. */
  reset(): void;
  dispose(): void;
}

export const DEFAULT_TRAIT_COMMAND_PRESENTATION_CAPACITY = 32;
/** A compact family-hued origin cue; never a second attack body. */
export const HERO_CAST_CUE_LIFETIME_TICKS = 8;
export const HERO_CAST_CUE_RADIUS = 14;
export const HERO_CAST_CUE_UNDERLAY_OPACITY = 0.22;
export const HERO_CAST_CUE_ACCENT_OPACITY = 0.28;

const PROFILES: Readonly<Record<EffectMaterial, TraitCommandEffectProfile>> = Object.freeze({
  telegraph: {
    kind: 'telegraph', material: 'telegraph', motion: 'pulse', lifetimeTicks: 22,
    fallbackRadius: 88, minimumRadius: 18, maximumRadius: 240, directed: false,
  },
  'thornstorm-telegraph': {
    kind: 'telegraph', material: 'thornstorm-telegraph', motion: 'pulse', lifetimeTicks: 26,
    fallbackRadius: 140, minimumRadius: 24, maximumRadius: 280, directed: false,
  },
  'thunderbug-telegraph': {
    kind: 'telegraph', material: 'thunderbug-telegraph', motion: 'pulse', lifetimeTicks: 18,
    fallbackRadius: 150, minimumRadius: 24, maximumRadius: 280, directed: false,
  },
  'boss-charge': {
    kind: 'telegraph', material: 'boss-charge', motion: 'pulse', lifetimeTicks: 36,
    fallbackRadius: 220, minimumRadius: 60, maximumRadius: 360, directed: true,
  },
  'boss-volley': {
    kind: 'telegraph', material: 'boss-volley', motion: 'pulse', lifetimeTicks: 24,
    fallbackRadius: 260, minimumRadius: 80, maximumRadius: 420, directed: false,
  },
  'saltwind-charge': {
    kind: 'telegraph', material: 'saltwind-charge', motion: 'pulse', lifetimeTicks: 36,
    fallbackRadius: 220, minimumRadius: 60, maximumRadius: 360, directed: true,
  },
  'saltwind-sandstorm': {
    kind: 'telegraph', material: 'saltwind-sandstorm', motion: 'pulse', lifetimeTicks: 24,
    fallbackRadius: 250, minimumRadius: 80, maximumRadius: 420, directed: false,
  },
  'support-pulse': {
    kind: 'telegraph', material: 'support-pulse', motion: 'pulse', lifetimeTicks: 18,
    fallbackRadius: 110, minimumRadius: 28, maximumRadius: 190, directed: false,
  },
  'directed-burst': {
    kind: 'directed-burst', material: 'directed-burst', motion: 'expand', lifetimeTicks: 9,
    fallbackRadius: 34, minimumRadius: 10, maximumRadius: 100, directed: true,
  },
  'rush-rake': {
    kind: 'directed-burst', material: 'rush-rake', motion: 'expand', lifetimeTicks: 12,
    fallbackRadius: 78, minimumRadius: 24, maximumRadius: 220, directed: true,
  },
  // V1.1 keeps the original Rush Rake source id but turns it into a close
  // three-cut combo. Its arc profile deliberately differs from the old
  // projectile-burst compatibility treatment above.
  'greg-rush-rake': {
    kind: 'melee-arc', material: 'greg-rush-rake', motion: 'expand', lifetimeTicks: 10,
    fallbackRadius: 76, minimumRadius: 22, maximumRadius: 220, directed: true,
  },
  'gracie-spit': {
    kind: 'directed-burst', material: 'gracie-spit', motion: 'expand', lifetimeTicks: 12,
    fallbackRadius: 66, minimumRadius: 16, maximumRadius: 190, directed: true,
  },
  'quill-volley': {
    // The individual simulation projectiles already carry the long-range
    // read. Keep this renderer-only source cue close to Greg as a sharp
    // muzzle volley; treating its fallback radius like an area effect turned
    // rapid quills into giant translucent yellow panels over the arena.
    kind: 'directed-burst', material: 'quill-volley', motion: 'expand', lifetimeTicks: 7,
    fallbackRadius: 18, minimumRadius: 7, maximumRadius: 28, directed: true,
  },
  'owl-volley': {
    kind: 'directed-burst', material: 'owl-volley', motion: 'expand', lifetimeTicks: 14,
    fallbackRadius: 66, minimumRadius: 16, maximumRadius: 180, directed: true,
  },
  'radial-burst': {
    kind: 'radial-burst', material: 'radial-burst', motion: 'expand', lifetimeTicks: 14,
    fallbackRadius: 62, minimumRadius: 16, maximumRadius: 180, directed: false,
  },
  'thornstorm-volley': {
    kind: 'radial-burst', material: 'thornstorm-volley', motion: 'expand', lifetimeTicks: 18,
    fallbackRadius: 88, minimumRadius: 22, maximumRadius: 230, directed: false,
  },
  'orbiting-damage': {
    kind: 'orbiting-damage', material: 'orbiting-damage', motion: 'pulse', lifetimeTicks: 30,
    fallbackRadius: 50, minimumRadius: 20, maximumRadius: 120, directed: false,
  },
  // Contact flashes are fed only from executor-resolved orbit victims below,
  // not directly from a trait command. Keeping a profile lets them share the
  // bounded material/mesh lifecycle with the rest of the presentation.
  'firefly-contact': {
    kind: 'trait-cue', material: 'firefly-contact', motion: 'pulse', lifetimeTicks: 12,
    fallbackRadius: 24, minimumRadius: 8, maximumRadius: 72, directed: false,
  },
  // Monarch Brood shares the authoritative orbit/contact command with
  // Firefly Colony, but reads as a regal gold companion swarm in the renderer.
  'monarch-brood-orbit': {
    kind: 'orbiting-damage', material: 'monarch-brood-orbit', motion: 'pulse', lifetimeTicks: 30,
    fallbackRadius: 50, minimumRadius: 20, maximumRadius: 120, directed: false,
  },
  gather: {
    kind: 'gather', material: 'gather', motion: 'contract', lifetimeTicks: 15,
    fallbackRadius: 80, minimumRadius: 18, maximumRadius: 260, directed: false,
  },
  knockback: {
    kind: 'knockback', material: 'knockback', motion: 'expand', lifetimeTicks: 13,
    fallbackRadius: 90, minimumRadius: 20, maximumRadius: 280, directed: false,
  },
  'puffer-blast': {
    kind: 'knockback', material: 'puffer-blast', motion: 'expand', lifetimeTicks: 16,
    fallbackRadius: 140, minimumRadius: 28, maximumRadius: 280, directed: false,
  },
  'armadillo-roll': {
    kind: 'knockback', material: 'armadillo-roll', motion: 'expand', lifetimeTicks: 16,
    fallbackRadius: 90, minimumRadius: 22, maximumRadius: 260, directed: false,
  },
  'benny-brace': {
    kind: 'knockback', material: 'benny-brace', motion: 'expand', lifetimeTicks: 16,
    fallbackRadius: 92, minimumRadius: 20, maximumRadius: 180, directed: false,
  },
  // Each Trample impact owns a real forward origin in the simulation. Keep
  // the command's telegraph lifetime so sequential earth waves remain visible
  // as a line instead of collapsing into one generic area pulse.
  'benny-trample-wave': {
    kind: 'telegraph', material: 'benny-trample-wave', motion: 'expand', lifetimeTicks: 20,
    fallbackRadius: 48, minimumRadius: 18, maximumRadius: 190, directed: true,
  },
  'area-damage': {
    kind: 'area-damage', material: 'area-damage', motion: 'expand', lifetimeTicks: 10,
    fallbackRadius: 52, minimumRadius: 14, maximumRadius: 220, directed: false,
  },
  'crab-crush': {
    kind: 'area-damage', material: 'crab-crush', motion: 'expand', lifetimeTicks: 13,
    fallbackRadius: 62, minimumRadius: 16, maximumRadius: 230, directed: false,
  },
  'meteor-impact': {
    kind: 'area-damage', material: 'meteor-impact', motion: 'expand', lifetimeTicks: 17,
    fallbackRadius: 100, minimumRadius: 24, maximumRadius: 260, directed: false,
  },
  'melee-arc': {
    // Mantis owns a wide cleave, but this ground sector is a presentation
    // flourish—not a literal hitbox. A full authored range made repeated
    // scythes reach the screen edge and obscure the combat space.
    kind: 'melee-arc', material: 'melee-arc', motion: 'expand', lifetimeTicks: 6,
    fallbackRadius: 42, minimumRadius: 16, maximumRadius: 52, directed: true,
  },
  'greg-fox-swipe': {
    kind: 'melee-arc', material: 'greg-fox-swipe', motion: 'expand', lifetimeTicks: 10,
    fallbackRadius: 90, minimumRadius: 26, maximumRadius: 210, directed: true,
  },
  'gecko-zone-spawn': {
    kind: 'zone-spawn', material: 'gecko-zone-spawn', motion: 'pulse', lifetimeTicks: 18,
    fallbackRadius: 38, minimumRadius: 14, maximumRadius: 160, directed: false,
  },
  'razorstep-zone-spawn': {
    kind: 'zone-spawn', material: 'razorstep-zone-spawn', motion: 'pulse', lifetimeTicks: 20,
    fallbackRadius: 58, minimumRadius: 16, maximumRadius: 180, directed: false,
  },
  'skunk-cloud': {
    kind: 'zone-spawn', material: 'skunk-cloud', motion: 'pulse', lifetimeTicks: 24,
    fallbackRadius: 72, minimumRadius: 18, maximumRadius: 220, directed: false,
  },
  'royal-stink-cloud': {
    kind: 'zone-spawn', material: 'royal-stink-cloud', motion: 'pulse', lifetimeTicks: 28,
    fallbackRadius: 110, minimumRadius: 28, maximumRadius: 280, directed: false,
  },
  'trait-cue': {
    kind: 'trait-cue', material: 'trait-cue', motion: 'pulse', lifetimeTicks: 12,
    fallbackRadius: 28, minimumRadius: 10, maximumRadius: 90, directed: false,
  },
  'fluffy-shield': {
    kind: 'trait-cue', material: 'fluffy-shield', motion: 'pulse', lifetimeTicks: 22,
    fallbackRadius: 46, minimumRadius: 18, maximumRadius: 120, directed: false,
  },
  'armor-block': {
    kind: 'trait-cue', material: 'armor-block', motion: 'pulse', lifetimeTicks: 14,
    fallbackRadius: 38, minimumRadius: 14, maximumRadius: 100, directed: false,
  },
  'fox-dodge': {
    kind: 'trait-cue', material: 'fox-dodge', motion: 'expand', lifetimeTicks: 10,
    fallbackRadius: 42, minimumRadius: 14, maximumRadius: 110, directed: true,
  },
  'chain-lightning': {
    kind: 'chain-lightning', material: 'chain-lightning', motion: 'pulse', lifetimeTicks: 8,
    fallbackRadius: 36, minimumRadius: 12, maximumRadius: 120, directed: false,
  },
  // A mark is deliberately an information pulse rather than a hit-area
  // preview. The authoritative executor owns which enemies were marked.
  'mark-pulse': {
    kind: 'mark-pulse', material: 'mark-pulse', motion: 'pulse', lifetimeTicks: 20,
    fallbackRadius: 140, minimumRadius: 32, maximumRadius: 360, directed: false,
  },
  'bat-ears-sonar': {
    kind: 'mark-pulse', material: 'bat-ears-sonar', motion: 'pulse', lifetimeTicks: 24,
    fallbackRadius: 200, minimumRadius: 48, maximumRadius: 320, directed: false,
  },
  'midnight-radar-sonar': {
    kind: 'mark-pulse', material: 'midnight-radar-sonar', motion: 'pulse', lifetimeTicks: 28,
    fallbackRadius: 320, minimumRadius: 64, maximumRadius: 400, directed: false,
  },
  'gracie-scout': {
    kind: 'telegraph', material: 'gracie-scout', motion: 'pulse', lifetimeTicks: 24,
    fallbackRadius: 100, minimumRadius: 20, maximumRadius: 260, directed: false,
  },
});

/**
 * This one small glyph is emitted at Scout's live render position before a
 * player world-effect starts. It intentionally reuses the prebuilt
 * `trait-cue` mesh/material bank, so no cast allocates geometry or materials.
 */
const HERO_CAST_CUE_PROFILE: TraitCommandEffectProfile = Object.freeze({
  ...PROFILES['trait-cue'],
  lifetimeTicks: HERO_CAST_CUE_LIFETIME_TICKS,
  fallbackRadius: HERO_CAST_CUE_RADIUS,
  minimumRadius: HERO_CAST_CUE_RADIUS,
  maximumRadius: HERO_CAST_CUE_RADIUS,
});

// `PROFILES` is the authoritative list of current procedural material roles.
// The palette module maps each one into one of six weapon families (or an
// explicitly reserved hostile lane); no role gets an ad-hoc neon RGB value.
const EFFECT_MATERIALS: readonly EffectMaterial[] = Object.freeze(
  Object.keys(PROFILES) as EffectMaterial[],
);

type PaletteMaterialKey = string;

/**
 * Every role has one default material lane. The only historical compatibility
 * route whose canonical source lane differs is Razorstep's older generic
 * melee-arc command: modern Razorstep emits its venom zone profile, while an
 * old replay can still carry its melee command. Both variants are built once
 * at startup, so source-aware colour never allocates during a cast.
 */
const EXTRA_PREBUILT_PALETTE_LANES: Readonly<Partial<Record<EffectMaterial, readonly AttackVfxPaletteLane[]>>> = Object.freeze({
  'melee-arc': Object.freeze(['venom'] as const),
});

const PLAYER_ATTACK_PALETTE_LANES: readonly AttackVfxPaletteLane[] = Object.freeze([
  'physical', 'earth', 'venom', 'arcane', 'storm', 'fire',
]);

function paletteMaterialKey(material: EffectMaterial, lane: AttackVfxPaletteLane): PaletteMaterialKey {
  return `${material}:${lane}`;
}

function prebuiltPaletteLanesForEffectMaterial(material: EffectMaterial): readonly AttackVfxPaletteLane[] {
  const defaultLane = paletteLaneForEffectMaterial(material);
  const extras = EXTRA_PREBUILT_PALETTE_LANES[material] ?? [];
  return [...new Set([defaultLane, ...extras, ...PLAYER_ATTACK_PALETTE_LANES])];
}

const OPACITY: Readonly<Record<EffectMaterial, number>> = Object.freeze({
  telegraph: 0.28,
  'thornstorm-telegraph': 0.34,
  'thunderbug-telegraph': 0.34,
  'boss-charge': 0.42,
  'boss-volley': 0.38,
  'saltwind-charge': 0.42,
  'saltwind-sandstorm': 0.4,
  'support-pulse': 0.48,
  'directed-burst': 0.72,
  'rush-rake': 0.82,
  'greg-fox-swipe': 0.98,
  'greg-rush-rake': 0.96,
  'benny-trample-wave': 0.96,
  'gracie-spit': 0.94,
  'fluffy-shield': 0.82,
  'armor-block': 0.9,
  'fox-dodge': 0.84,
  // A bright needle burst should punctuate the spawned quills, not blanket
  // the hero whenever a high-cadence volley refreshes.
  'quill-volley': 0.58,
  'owl-volley': 0.86,
  'radial-burst': 0.62,
  'thornstorm-volley': 0.84,
  'orbiting-damage': 0.9,
  'firefly-contact': 1,
  'monarch-brood-orbit': 0.96,
  gather: 0.42,
  knockback: 0.5,
  'puffer-blast': 0.82,
  'armadillo-roll': 0.76,
  'benny-brace': 0.72,
  'area-damage': 0.66,
  'crab-crush': 0.86,
  'meteor-impact': 0.96,
  // The scythe arc stays bright at its leading edge through the accent, while
  // the broad floor sector remains transparent enough to preserve targets.
  'melee-arc': 0.68,
  'gecko-zone-spawn': 0.58,
  'razorstep-zone-spawn': 0.66,
  'skunk-cloud': 0.72,
  'royal-stink-cloud': 0.82,
  'trait-cue': 0.55,
  'chain-lightning': 0.9,
  'mark-pulse': 0.62,
  'bat-ears-sonar': 0.78,
  'midnight-radar-sonar': 0.84,
  'gracie-scout': 0.72,
});

/**
 * Source profiles may ask for a strong timing cue, but the shared procedural
 * layer is strictly an underpaint. These guards apply at both material setup
 * and every dynamic mesh-parameter write below.
 */
function resolveProceduralUnderlayOpacity(material: EffectMaterial): number {
  return proceduralUnderlayOpacity(OPACITY[material]);
}

function resolveProceduralAccentOpacity(material: EffectMaterial): number {
  return proceduralAccentOpacity(OPACITY[material]);
}

// Every authored ground glyph is built in a normalized one-unit footprint, so
// command radii remain the readable outside edge even though the silhouettes
// are no longer interchangeable circular toruses.
const EFFECT_UNIT_RADIUS = 1;
const GROUND_EFFECT_HEIGHT = 0.28;
const CHAIN_LIGHTNING_LIFETIME_TICKS = 8;
// The direct endpoint line stays clear at camera distance, but a narrower
// ribbon prevents rapid chain resolutions from reading as a white bar.
const CHAIN_LIGHTNING_THICKNESS = 1.45;
const CHAIN_LIGHTNING_HEIGHT = 1.05;
const TRAIT_COMMAND_ENVELOPE_ATTACK = 0.08;
const TRAIT_COMMAND_ENVELOPE_RELEASE = 0.52;

/**
 * These exactly mirror the authored Bud/Adapted Mantis widths. They are not a
 * generic arc quantizer: other valid combat arcs deliberately use the fixed
 * directional-slash fallback below, so a future weapon is never silently
 * shown as one of Mantis's narrower/wider hit sectors.
 */
const MELEE_ARC_VARIANTS = Object.freeze([
  Object.freeze({ arcRadians: 1.2, sectorAngleDegrees: 68.75 }),
  Object.freeze({ arcRadians: 1.6, sectorAngleDegrees: 91.67 }),
] as const);
const MELEE_ARC_VARIANT_TOLERANCE = 0.025;
const MELEE_ARC_UNIT_RADIUS = 1;
const MELEE_ARC_HEIGHT = 1.18;
// The orbit must read from the same distant camera as a dense enemy pack.
// These are intentionally much larger than the old spark strokes: Firefly
// Colony is an orbit/contact weapon, not a barely visible status buff.
const FIREFLY_ORBIT_HEIGHT = 3.25;
const FIREFLY_ORBIT_SIZE = 4.8;
const FIREFLY_ORBIT_MAX_COUNT = 16;
const FIREFLY_CONTACT_LIFETIME_TICKS = 12;
const GENERIC_MELEE_SLASH_HEIGHT = 1.22;

/**
 * Each complete current chain needs at most eight segments (Greg → first hit,
 * then seven hops). The pool scales to that requirement for small custom
 * capacities and remains globally capped so visual stress stays bounded.
 */
export const DEFAULT_CHAIN_LIGHTNING_SEGMENT_CAPACITY = 96;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function positiveOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

const VISUAL_BLUEPRINTS = Object.freeze({
  /** Broad claw language: a bright authored arc followed by a moving rake echo. */
  heroSlash: Object.freeze({
    accent: 'slash', castScale: 0.42, travelDistance: 0.58, impactScale: 1.34, aftermathOpacity: 0.24,
  } satisfies TraitCommandVisualBlueprint),
  /** Benny's signature is a traveling ridge, never a generic round explosion. */
  earthWave: Object.freeze({
    accent: 'ridge', castScale: 0.46, travelDistance: 0.7, impactScale: 1.42, aftermathOpacity: 0.32,
  } satisfies TraitCommandVisualBlueprint),
  /** Projectile families get a compact muzzle/comet punctuation before the real projectile takes over. */
  projectile: Object.freeze({
    accent: 'comet', castScale: 0.34, travelDistance: 0.74, impactScale: 1.2, aftermathOpacity: 0.22,
  } satisfies TraitCommandVisualBlueprint),
  /** Quills are a compact launch punctuation; the real projectiles own range. */
  quillVolley: Object.freeze({
    accent: 'comet', castScale: 0.24, travelDistance: 0.38, impactScale: 0.72, aftermathOpacity: 0.08,
  } satisfies TraitCommandVisualBlueprint),
  /** Mantis keeps a broad directional scythe, confined to a crisp close cleave. */
  mantisCleave: Object.freeze({
    accent: 'slash', castScale: 0.28, travelDistance: 0.32, impactScale: 0.8, aftermathOpacity: 0.1,
  } satisfies TraitCommandVisualBlueprint),
  /** Area weapons earn a sharp impact crown, readable through a dense swarm. */
  impact: Object.freeze({
    accent: 'crown', castScale: 0.38, travelDistance: 0.18, impactScale: 1.5, aftermathOpacity: 0.28,
  } satisfies TraitCommandVisualBlueprint),
  /** Telegraphs are held runes that resolve into a single brighter warning pulse. */
  telegraph: Object.freeze({
    accent: 'halo', castScale: 0.58, travelDistance: 0.42, impactScale: 1.04, aftermathOpacity: 0.46,
  } satisfies TraitCommandVisualBlueprint),
  /** Shields and sonar have a controlled, non-damaging information language. */
  aura: Object.freeze({
    accent: 'rune', castScale: 0.5, travelDistance: 0.08, impactScale: 1.08, aftermathOpacity: 0.48,
  } satisfies TraitCommandVisualBlueprint),
});

/**
 * Selects a compact shared accent without giving every trait a separate VFX
 * system. The base mesh remains source-specific; this only choreographs its
 * readable second layer.
 */
export function resolveTraitCommandVisualBlueprint(
  profile: TraitCommandEffectProfile,
): TraitCommandVisualBlueprint {
  switch (profile.material) {
    case 'greg-fox-swipe':
    case 'greg-rush-rake':
      return VISUAL_BLUEPRINTS.heroSlash;
    case 'melee-arc':
      return VISUAL_BLUEPRINTS.mantisCleave;
    case 'benny-trample-wave':
      return VISUAL_BLUEPRINTS.earthWave;
    case 'gracie-spit':
    case 'directed-burst':
    case 'rush-rake':
    case 'owl-volley':
    case 'thornstorm-volley':
      return VISUAL_BLUEPRINTS.projectile;
    case 'quill-volley':
      return VISUAL_BLUEPRINTS.quillVolley;
    case 'telegraph':
    case 'thornstorm-telegraph':
    case 'thunderbug-telegraph':
    case 'boss-charge':
    case 'boss-volley':
    case 'saltwind-charge':
    case 'saltwind-sandstorm':
    case 'support-pulse':
    case 'gracie-scout':
      return VISUAL_BLUEPRINTS.telegraph;
    case 'fluffy-shield':
    case 'armor-block':
    case 'fox-dodge':
    case 'gather':
    case 'orbiting-damage':
    case 'firefly-contact':
    case 'monarch-brood-orbit':
    case 'trait-cue':
    case 'mark-pulse':
    case 'bat-ears-sonar':
    case 'midnight-radar-sonar':
    case 'gecko-zone-spawn':
    case 'razorstep-zone-spawn':
    case 'skunk-cloud':
    case 'royal-stink-cloud':
      return VISUAL_BLUEPRINTS.aura;
    default:
      return VISUAL_BLUEPRINTS.impact;
  }
}

/**
 * A deterministic four-beat timeline. Pulse/telegraph effects hold their
 * cast warning longer; attacks reach their impact beat much faster.
 */
export function resolveTraitCommandVisualStage(
  progress: number,
  profile: TraitCommandEffectProfile,
): TraitCommandVisualStage {
  const bounded = clamp(finiteOr(progress, 0), 0, 1);
  // Trample is structurally emitted as a telegraph so sequential simulation
  // waves can share that command family, but visually it is an immediate
  // attacking earth front—not a slow enemy warning.
  const heldWarning = profile.material !== 'benny-trample-wave'
    && (profile.kind === 'telegraph'
    || profile.kind === 'mark-pulse'
    || profile.kind === 'zone-spawn'
    || profile.kind === 'trait-cue');
  if (heldWarning) {
    if (bounded < 0.3) return 'cast';
    if (bounded < 0.72) return 'travel';
    if (bounded < 0.9) return 'impact';
    return 'aftermath';
  }
  if (bounded < 0.16) return 'cast';
  if (bounded < 0.58) return 'travel';
  if (bounded < 0.82) return 'impact';
  return 'aftermath';
}

/**
 * Upgrade rank is not part of the render snapshot. Existing authored command
 * signals are, so this safely scales only the presentation silhouette from
 * count, strength, and damage while keeping every effect bounded.
 */
export function resolveTraitCommandVisualIntensity(
  event: TraitCommandPresentationEvent,
  profile: TraitCommandEffectProfile,
): number {
  const countSignal = clamp((Math.max(0, finiteOr(event.count, 0)) - 1) / 10, 0, 1);
  const strengthSignal = clamp(Math.max(0, finiteOr(event.strength, 0)) / 8, 0, 1);
  const damageSignal = clamp(Math.max(0, finiteOr(event.damage, 0)) / 80, 0, 1);
  const commandSignal = Math.max(countSignal, strengthSignal, damageSignal);
  const heroSignature = profile.material === 'greg-fox-swipe'
    || profile.material === 'greg-rush-rake'
    || profile.material === 'benny-trample-wave'
    || profile.material === 'gracie-spit';
  return clamp(1 + commandSignal * 0.3 + (heroSignature ? 0.06 : 0), 1, 1.36);
}

/**
 * Palette routing remains renderer-only and is deliberately source-aware for
 * the named weapon roster. Generic/legacy commands fall back to their effect
 * material family, so a missing source id cannot accidentally become danger
 * coral or a reward colour.
 */
export function resolveTraitCommandPaletteLane(
  event: Pick<TraitCommandPresentationEvent, 'sourceId'>,
  profile: TraitCommandEffectProfile,
): AttackVfxPaletteLane {
  return paletteLaneForChimeraSource(event.sourceId)?.primary
    ?? (hasExplicitTraitSourcePaletteLane(event.sourceId)
    ? paletteLaneForTraitSource(event.sourceId)
    : paletteLaneForEffectMaterial(profile.material));
}

/** The accent half of a Chimera duotone; ordinary effects preserve one lane. */
export function resolveTraitCommandAccentPaletteLane(
  event: Pick<TraitCommandPresentationEvent, 'sourceId'>,
  profile: TraitCommandEffectProfile,
): AttackVfxPaletteLane {
  return paletteLaneForChimeraSource(event.sourceId)?.accent
    ?? resolveTraitCommandPaletteLane(event, profile);
}

/**
 * A cue belongs to player-authored world effects only. Direct defensive cues
 * already occur at Scout and would become a redundant second pulse; hostile
 * lanes never pass this guard.
 */
export function shouldEmitHeroCastCue(
  event: Pick<TraitCommandPresentationEvent, 'sourceId'>,
  profile: TraitCommandEffectProfile,
): boolean {
  if (profile.kind === 'trait-cue' || !hasExplicitTraitSourcePaletteLane(event.sourceId)) return false;
  return isPlayerAttackPaletteLane(resolveTraitCommandPaletteLane(event, profile));
}

/**
 * The half-tick sample shows a new command on its emitting render while still
 * reaching exact progress 1 on the retained terminal tick. That gives every
 * pooled primitive a real zero-opacity frame instead of a late hard reset.
 */
function traitCommandVisualProgress(tick: number, startTick: number, expiresAtTick: number): number {
  const duration = Math.max(1, expiresAtTick - startTick);
  return clamp((tick - startTick + 0.5) / (duration + 0.5), 0, 1);
}

function traitCommandFade(progress: number): number {
  return envelope(progress, TRAIT_COMMAND_ENVELOPE_ATTACK, TRAIT_COMMAND_ENVELOPE_RELEASE);
}

/**
 * Public and focused-testable proof that the source-family resolver selects
 * the same finite material key consumed by the live renderer below. This is
 * intentionally separate from geometry/profile projection: it governs colour
 * only and cannot change a command's simulation-owned shape or timing.
 */
export function resolveTraitCommandPaletteMaterialKey(
  event: Pick<TraitCommandPresentationEvent, 'sourceId'>,
  profile: TraitCommandEffectProfile,
): string {
  return paletteMaterialKey(profile.material, resolveTraitCommandPaletteLane(event, profile));
}

/**
 * The illustrated cards are the primary read for every authored player attack
 * below. Keep the legacy geometry only as a quiet timing / contact footprint;
 * treating it as a second full-strength effect was the source of the visual
 * pile-up in dense runs. Unknown commands and explicit enemy warnings retain
 * their normal opacity, so this renderer-only choice cannot hide new combat
 * information behind an assumed player-art route.
 */
export function resolveIllustratedHeroUnderlayOpacityMultiplier(
  profile: TraitCommandEffectProfile,
): number {
  switch (profile.material) {
    case 'greg-fox-swipe':
    case 'greg-rush-rake':
      return 0.12;
    case 'benny-trample-wave':
      return 0.14;
    case 'gracie-spit':
      return 0.12;
    case 'fluffy-shield':
      // The illustrated dissolve and BLOCK label are the primary defense
      // read. Keep this ground-field underpaint deliberately quiet so a burst
      // of shield absorbs cannot turn the player center into a second flash.
      return 0.1;
    case 'armor-block':
    case 'fox-dodge':
    case 'trait-cue':
      return 0.16;
    case 'quill-volley':
    case 'owl-volley':
    case 'melee-arc':
    case 'crab-crush':
    case 'meteor-impact':
    case 'skunk-cloud':
    case 'royal-stink-cloud':
      return 0.12;
    case 'puffer-blast':
    case 'armadillo-roll':
    case 'benny-brace':
    case 'thornstorm-volley':
    case 'thornstorm-telegraph':
    case 'thunderbug-telegraph':
    case 'orbiting-damage':
    case 'monarch-brood-orbit':
    case 'gather':
    case 'gecko-zone-spawn':
    case 'razorstep-zone-spawn':
    case 'bat-ears-sonar':
    case 'midnight-radar-sonar':
    case 'gracie-scout':
    case 'mark-pulse':
      return 0.14;
    // The line itself communicates the resolved chain endpoints. It stays
    // legible, but it is deliberately subordinate to Thunderbug's animated
    // primary card and is kept below the flash-audit brightness headroom.
    case 'chain-lightning':
      return 0.24;
    default:
      return 1;
  }
}

/**
 * Most commands keep the presentation pool's natural capacity. Porcupine
 * Quills and Mantis Scythes intentionally coalesce to one live cue: the
 * former already has real projectile meshes, while the latter is a broad
 * floor sweep whose duplicate sectors add noise without new information.
 */
export function resolveTraitCommandVisualConcurrencyCap(
  profile: TraitCommandEffectProfile,
): number | null {
  return profile.material === 'quill-volley' || profile.material === 'melee-arc' ? 1 : null;
}

function resolvedChainHitCount(event: TraitCommandPresentationEvent): number {
  const count = Math.floor(finiteOr(event.resolvedHitCount ?? 0, 0));
  const hitX = event.resolvedHitX;
  const hitY = event.resolvedHitY;
  if (count <= 0 || hitX === undefined || hitY === undefined) return 0;
  return Math.min(count, hitX.length, hitY.length);
}

/**
 * Orbit impacts are presentation-visible only when all four authoritative
 * endpoints exist. This prevents a decorative orbit pulse from ever reading
 * as damage when no enemy was actually touched.
 */
function resolvedOrbitHitCount(event: TraitCommandPresentationEvent): number {
  const count = Math.floor(finiteOr(event.resolvedOrbitHitCount ?? 0, 0));
  const hitX = event.resolvedOrbitHitX;
  const hitY = event.resolvedOrbitHitY;
  const sourceX = event.resolvedOrbitSourceX;
  const sourceY = event.resolvedOrbitSourceY;
  if (
    count <= 0
    || hitX === undefined
    || hitY === undefined
    || sourceX === undefined
    || sourceY === undefined
  ) return 0;
  return Math.min(count, hitX.length, hitY.length, sourceX.length, sourceY.length);
}

/** Public for focused tests: contact flashes require executor-resolved endpoints. */
export function hasResolvedOrbitContact(event: TraitCommandPresentationEvent): boolean {
  return resolvedOrbitHitCount(event) > 0;
}

/**
 * A `meleeArc` is only shown after the authoritative executor has resolved a
 * real target. A non-zero direction alone is not proof: a targetless command
 * can retain authored/fallback direction and must never create a false slash.
 */
export function hasResolvedMeleeArc(event: TraitCommandPresentationEvent): boolean {
  return event.kind === 'meleeArc' && event.meleeArcResolved === true;
}

function hasSourceOrTag(event: Pick<TraitCommandPresentationEvent, 'sourceId' | 'tag'>, identity: string): boolean {
  return event.sourceId === identity || event.tag === identity;
}

/**
 * Maps V1.1 combat feedback independently of command kind. The renderer
 * bridge can reuse this for resolved shield, armor, or dodge outcomes without
 * importing simulation implementation details or inventing a gameplay write.
 */
export function projectHeroCombatFeedbackEffect(
  sourceId: string,
  tag?: string,
): TraitCommandEffectProfile | null {
  if (sourceId === 'fluffy-shield' || tag === 'fluffy-shield') return PROFILES['fluffy-shield'];
  if (sourceId === 'armor-block' || tag === 'armor-block') return PROFILES['armor-block'];
  if (sourceId === 'fox-dodge' || tag === 'fox-dodge') return PROFILES['fox-dodge'];
  return null;
}

/** A compact bridge alias for shield, armor, and the fox's resolved dodge. */
export function projectHeroDefenseEffect(sourceId: string, tag?: string): TraitCommandEffectProfile | null {
  const profile = projectHeroCombatFeedbackEffect(sourceId, tag);
  return profile?.material === 'fluffy-shield'
    || profile?.material === 'armor-block'
    || profile?.material === 'fox-dodge'
    ? profile
    : null;
}

/** Returns a stable visual profile for the supported simulation command kinds. */
export function projectTraitCommandEffect(event: TraitCommandPresentationEvent): TraitCommandEffectProfile | null {
  const combatFeedbackProfile = projectHeroCombatFeedbackEffect(event.sourceId, event.tag);
  if (combatFeedbackProfile !== null) return combatFeedbackProfile;
  switch (event.kind) {
    case 'telegraph':
      return (hasSourceOrTag(event, 'benny-trample-wave') || event.sourceId === 'benny-trample')
        ? PROFILES['benny-trample-wave']
        : hasSourceOrTag(event, 'gracie-spit')
          ? PROFILES['gracie-spit']
        : event.tag === 'gracie-scout'
        ? PROFILES['gracie-scout']
        : event.tag === 'thornstorm-inhale'
      ? PROFILES['thornstorm-telegraph']
      : event.tag === 'thunderbug-charge'
        ? PROFILES['thunderbug-telegraph']
        : event.tag === 'boss-charge'
          ? PROFILES['boss-charge']
          : event.tag === 'boss-volley'
            ? PROFILES['boss-volley']
            : event.tag === 'saltwind-charge'
              ? PROFILES['saltwind-charge']
              : event.tag === 'saltwind-sandstorm'
                ? PROFILES['saltwind-sandstorm']
            : event.tag === 'support-pulse'
              ? PROFILES['support-pulse']
          : PROFILES.telegraph;
    case 'spawnProjectileBurst':
      if (hasSourceOrTag(event, 'gracie-spit')) return PROFILES['gracie-spit'];
      if (event.tag === 'greg-rush-rake') return PROFILES['rush-rake'];
      if (event.sourceId === 'porcupine-quills') return PROFILES['quill-volley'];
      if (event.sourceId === 'owl-pinions') return PROFILES['owl-volley'];
      return PROFILES['directed-burst'];
    case 'radialProjectileBurst': return event.sourceId === 'thornstorm-mantle'
      ? PROFILES['thornstorm-volley']
      : PROFILES['radial-burst'];
    case 'orbitingDamage': return event.sourceId === 'monarch-brood'
      ? PROFILES['monarch-brood-orbit']
      : PROFILES['orbiting-damage'];
    case 'areaGather': return PROFILES.gather;
    case 'areaKnockback':
      if (event.tag === 'benny-brace') return PROFILES['benny-brace'];
      if (event.sourceId === 'puffer-pouch') return PROFILES['puffer-blast'];
      if (event.sourceId === 'armadillo-greaves') return PROFILES['armadillo-roll'];
      return PROFILES.knockback;
    case 'applyAreaDamage':
      if (event.sourceId === 'meteor-mauler') return PROFILES['meteor-impact'];
      if (event.sourceId === 'crab-pincers') return PROFILES['crab-crush'];
      return PROFILES['area-damage'];
    case 'meleeArc':
      if (!hasResolvedMeleeArc(event)) return null;
      return hasSourceOrTag(event, 'greg-fox-swipe')
        ? PROFILES['greg-fox-swipe']
        : hasSourceOrTag(event, 'greg-rush-rake')
          ? PROFILES['greg-rush-rake']
          : PROFILES['melee-arc'];
    case 'spawnZone':
      if (event.tag === 'razorstep-scythe-pad') return PROFILES['razorstep-zone-spawn'];
      if (event.tag === 'royal-stink' || event.sourceId === 'royal-stinkcloud') {
        return PROFILES['royal-stink-cloud'];
      }
      if (event.tag === 'stink-cloud' || event.sourceId === 'skunk-brush') return PROFILES['skunk-cloud'];
      return PROFILES['gecko-zone-spawn'];
    case 'grantShield': return PROFILES['trait-cue'];
    case 'playTraitCue': return PROFILES['trait-cue'];
    case 'chainDamage':
      return resolvedChainHitCount(event) > 0 ? PROFILES['chain-lightning'] : null;
    case 'markTargets':
      return event.sourceId === 'midnight-radar' || event.tag === 'night-vision'
        ? PROFILES['midnight-radar-sonar']
        : event.sourceId === 'bat-ears' || event.tag === 'echo-mark'
          ? PROFILES['bat-ears-sonar']
          : PROFILES['mark-pulse'];
    default: return null;
  }
}

/**
 * Converts authored command numbers to a bounded renderer radius. It is
 * defensive by design: malformed visual data falls back to a readable pulse
 * instead of making a mesh disappear or exploding a camera-facing primitive.
 */
export function resolveTraitCommandEffectRadius(
  event: TraitCommandPresentationEvent,
  profile: TraitCommandEffectProfile,
): number {
  // Mantis uses `range` as its authoritative wedge reach. Do not accidentally
  // render its unused generic `radius` field as a full-radius hit area.
  let radius = profile.kind === 'melee-arc' ? event.range : event.radius;
  if (!(Number.isFinite(radius) && radius > 0)) {
    switch (profile.kind) {
      case 'directed-burst':
      case 'radial-burst':
        radius = profile.fallbackRadius + Math.max(0, finiteOr(event.count, 0)) * 2.5;
        break;
      case 'trait-cue':
        radius = profile.fallbackRadius + Math.max(0, finiteOr(event.strength, 0)) * 2;
        break;
      default:
        radius = profile.fallbackRadius;
        break;
    }
  }
  return clamp(radius, profile.minimumRadius, profile.maximumRadius);
}

function resolveLifetime(event: TraitCommandPresentationEvent, profile: TraitCommandEffectProfile): number {
  if (profile.kind !== 'telegraph') return profile.lifetimeTicks;
  const requested = positiveOr(event.durationTicks ?? 0, profile.lifetimeTicks);
  return Math.round(clamp(requested, 6, 120));
}

function resolveYawDegrees(event: TraitCommandPresentationEvent): number {
  const dirX = finiteOr(event.dirX, 0);
  const dirY = finiteOr(event.dirY, 0);
  if (dirX * dirX + dirY * dirY > 1e-8) {
    // scene direction is (simX, -simY); local +Z is the elongated axis.
    return Math.atan2(dirX, -dirY) * 180 / Math.PI;
  }
  return (Math.PI / 2 + finiteOr(event.facing, 0)) * 180 / Math.PI;
}

/**
 * Resolve an exact Mantis sector only. `null` intentionally selects the
 * generic directional-slash geometry for another valid melee arc, avoiding a
 * misleading nearest-sector substitution.
 */
export function resolveMeleeArcVariantIndex(arc: number | undefined): number | null {
  if (!(Number.isFinite(arc) && arc! > 0)) return null;
  const requested = arc!;
  let winner = 0;
  let bestDelta = Math.abs(requested - MELEE_ARC_VARIANTS[0]!.arcRadians);
  for (let index = 1; index < MELEE_ARC_VARIANTS.length; index++) {
    const delta = Math.abs(requested - MELEE_ARC_VARIANTS[index]!.arcRadians);
    if (delta < bestDelta) {
      winner = index;
      bestDelta = delta;
    }
  }
  return bestDelta <= MELEE_ARC_VARIANT_TOLERANCE ? winner : null;
}

/**
 * Hand-authored scythe crescents are centered on local +Z, matching every
 * other directed effect. Keeping that convention means a resolved target is
 * always in the visual sweep's middle rather than at an old torus seam.
 */
function resolveMeleeArcYawDegrees(event: TraitCommandPresentationEvent): number {
  return resolveYawDegrees(event);
}

function resolveAspect(event: TraitCommandPresentationEvent, profile: TraitCommandEffectProfile): number {
  // Trample is deliberately wider than it is long: it reads as an advancing
  // earth front, not a narrow projectile or a circular explosion.
  if (profile.material === 'benny-trample-wave') return 1.48;
  if (!profile.directed) return 1;
  const spread = Math.abs(finiteOr(event.spread, 0));
  return clamp(0.42 + spread / Math.PI, 0.42, 1);
}

function resolveAccentTravel(progress: number, stage: TraitCommandVisualStage): number {
  switch (stage) {
    case 'cast': return 0;
    case 'travel': return clamp((progress - 0.16) / 0.5, 0.08, 0.86);
    case 'impact': return 1;
    case 'aftermath': return 0.9;
  }
}

function resolveAccentScale(
  radius: number,
  intensity: number,
  blueprint: TraitCommandVisualBlueprint,
  stage: TraitCommandVisualStage,
): number {
  const factor = stage === 'cast'
    ? blueprint.castScale * 0.38
    : stage === 'travel'
      ? 0.18 + blueprint.impactScale * 0.2
      : stage === 'impact'
        ? blueprint.impactScale * 0.42
        : blueprint.impactScale * 0.3;
  return Math.max(1, radius * factor * intensity);
}

function resolveAccentOpacity(
  baseOpacity: number,
  blueprint: TraitCommandVisualBlueprint,
  stage: TraitCommandVisualStage,
): number {
  const stageOpacity = stage === 'cast'
    ? 0.82
    : stage === 'travel'
      ? 0.9
      : stage === 'impact'
        ? 1
        : blueprint.aftermathOpacity;
  return baseOpacity * stageOpacity;
}

function resolveStagedAccent(
  blueprint: TraitCommandVisualBlueprint,
  stage: TraitCommandVisualStage,
): TraitCommandVisualAccent {
  if (stage === 'impact') return 'crown';
  if (
    stage === 'aftermath'
    && (blueprint.accent === 'comet' || blueprint.accent === 'slash' || blueprint.accent === 'ridge')
  ) return 'halo';
  return blueprint.accent;
}

function resolveAccentLateralScale(accent: TraitCommandVisualAccent): number {
  switch (accent) {
    case 'comet': return 0.42;
    case 'slash': return 0.66;
    case 'ridge': return 0.82;
    default: return 1;
  }
}

function resolveAccentLongitudinalScale(accent: TraitCommandVisualAccent): number {
  switch (accent) {
    case 'comet': return 1.22;
    case 'slash': return 1.16;
    case 'ridge': return 1.2;
    default: return 1;
  }
}

function createMaterial(role: EffectMaterial, lane: AttackVfxPaletteLane): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  const color = proceduralColorForPaletteLane(lane);
  material.useLighting = false;
  material.diffuse.set(0, 0, 0);
  material.emissive.set(color.r, color.g, color.b);
  material.opacity = resolveProceduralUnderlayOpacity(role);
  material.blendType = pc.BLEND_ADDITIVEALPHA;
  material.depthWrite = false;
  material.cull = pc.CULLFACE_NONE;
  material.update();
  return material;
}

/**
 * Accent geometry inherits its family's muted colour instead of inventing a
 * brighter neon sibling. Critical-impact art owns the only saturation spike;
 * this retained layer stays a bounded timing/contact underpaint.
 */
function createAccentMaterial(role: EffectMaterial, lane: AttackVfxPaletteLane): pc.StandardMaterial {
  const source = proceduralColorForPaletteLane(lane);
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.diffuse.set(0, 0, 0);
  material.emissive.set(source.r, source.g, source.b);
  material.opacity = resolveProceduralAccentOpacity(role);
  material.blendType = pc.BLEND_ADDITIVEALPHA;
  material.depthWrite = false;
  material.cull = pc.CULLFACE_NONE;
  material.update();
  return material;
}

type GroundPoint = readonly [number, number];

interface GroundMeshBuilder {
  readonly positions: number[];
  readonly indices: number[];
}

function appendGroundVertex(builder: GroundMeshBuilder, point: GroundPoint): number {
  const index = builder.positions.length / 3;
  builder.positions.push(point[0], 0, point[1]);
  return index;
}

function appendGroundQuad(
  builder: GroundMeshBuilder,
  a: GroundPoint,
  b: GroundPoint,
  c: GroundPoint,
  d: GroundPoint,
): void {
  const aIndex = appendGroundVertex(builder, a);
  const bIndex = appendGroundVertex(builder, b);
  const cIndex = appendGroundVertex(builder, c);
  const dIndex = appendGroundVertex(builder, d);
  builder.indices.push(aIndex, bIndex, cIndex, aIndex, cIndex, dIndex);
}

/** A local +Z-forward polar point, shared by every directed visual glyph. */
function polarPoint(angleRadians: number, radius: number): GroundPoint {
  return [Math.sin(angleRadians) * radius, Math.cos(angleRadians) * radius];
}

function appendGroundRay(
  builder: GroundMeshBuilder,
  angleRadians: number,
  innerRadius: number,
  outerRadius: number,
  halfWidth: number,
): void {
  const midpointRadius = innerRadius + (outerRadius - innerRadius) * 0.56;
  const perpendicularX = Math.cos(angleRadians);
  const perpendicularZ = -Math.sin(angleRadians);
  const root = polarPoint(angleRadians, innerRadius);
  const tip = polarPoint(angleRadians, outerRadius);
  const center = polarPoint(angleRadians, midpointRadius);
  const left: GroundPoint = [
    center[0] + perpendicularX * halfWidth,
    center[1] + perpendicularZ * halfWidth,
  ];
  const right: GroundPoint = [
    center[0] - perpendicularX * halfWidth,
    center[1] - perpendicularZ * halfWidth,
  ];
  appendGroundQuad(builder, root, left, tip, right);
}

function appendArcBand(
  builder: GroundMeshBuilder,
  startAngle: number,
  endAngle: number,
  innerRadius: number,
  outerRadius: number,
  segments: number,
): void {
  for (let index = 0; index < segments; index++) {
    const t0 = index / segments;
    const t1 = (index + 1) / segments;
    const angle0 = startAngle + (endAngle - startAngle) * t0;
    const angle1 = startAngle + (endAngle - startAngle) * t1;
    appendGroundQuad(
      builder,
      polarPoint(angle0, innerRadius),
      polarPoint(angle0, outerRadius),
      polarPoint(angle1, outerRadius),
      polarPoint(angle1, innerRadius),
    );
  }
}

function appendRibbon(builder: GroundMeshBuilder, points: readonly GroundPoint[], halfWidth: number): void {
  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index]!;
    const to = points[index + 1]!;
    const deltaX = to[0] - from[0];
    const deltaZ = to[1] - from[1];
    const length = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
    if (!(length > 1e-6)) continue;
    const perpendicularX = -deltaZ / length * halfWidth;
    const perpendicularZ = deltaX / length * halfWidth;
    appendGroundQuad(
      builder,
      [from[0] + perpendicularX, from[1] + perpendicularZ],
      [to[0] + perpendicularX, to[1] + perpendicularZ],
      [to[0] - perpendicularX, to[1] - perpendicularZ],
      [from[0] - perpendicularX, from[1] - perpendicularZ],
    );
  }
}

function appendGroundDiamond(
  builder: GroundMeshBuilder,
  centerX: number,
  centerZ: number,
  halfWidth: number,
  halfLength: number,
): void {
  appendGroundQuad(
    builder,
    [centerX - halfWidth, centerZ],
    [centerX, centerZ + halfLength],
    [centerX + halfWidth, centerZ],
    [centerX, centerZ - halfLength],
  );
}

function createGroundMesh(device: pc.GraphicsDevice, build: (builder: GroundMeshBuilder) => void): pc.Mesh {
  const builder: GroundMeshBuilder = { positions: [], indices: [] };
  build(builder);
  const geometry = new pc.Geometry();
  geometry.positions = builder.positions;
  geometry.normals = Array.from({ length: builder.positions.length }, (_value, index) => index % 3 === 1 ? 1 : 0);
  geometry.indices = builder.indices;
  return pc.Mesh.fromGeometry(device, geometry);
}

function createShardBurstMesh(
  device: pc.GraphicsDevice,
  count: number,
  innerRadius: number,
  outerRadius: number,
  halfWidth: number,
  phase = 0,
): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    for (let index = 0; index < count; index++) {
      const stagger = 0.84 + (index % 3) * 0.065;
      appendGroundRay(
        builder,
        phase + Math.PI * 2 * index / count,
        innerRadius,
        outerRadius * stagger,
        halfWidth * (index % 2 === 0 ? 1 : 0.72),
      );
    }
  });
}

function createCompassMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    for (let index = 0; index < 4; index++) {
      const center = Math.PI * 0.5 * index;
      appendArcBand(builder, center - 0.28, center + 0.28, 0.64, 0.94, 3);
      appendGroundRay(builder, center, 0.72, 1, 0.045);
    }
  });
}

function createBrokenHaloMesh(device: pc.GraphicsDevice, phase = 0): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    for (let index = 0; index < 5; index++) {
      const center = phase + Math.PI * 2 * index / 5;
      appendArcBand(builder, center - 0.22, center + 0.22, 0.68, 0.96, 3);
    }
  });
}

function createArrowFanMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    for (const offset of [-0.2, 0, 0.2]) appendGroundRay(builder, offset, 0.05, 1, 0.1);
  });
}

function createRakeMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    for (const offset of [-0.34, 0, 0.34]) appendGroundRay(builder, offset, 0.08, 1, 0.075);
    appendGroundRay(builder, Math.PI, 0.04, 0.24, 0.06);
  });
}

/**
 * A broad, layered fox claw sweep for Greg's non-projectile starter attack.
 * The thick inner crescent reads as the shoulder cast, the three long curved
 * claws carry the travel beat, and the diamonds catch the terminal impact.
 */
function createFoxSwipeMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    appendArcBand(builder, -1.06, 1.06, 0.18, 0.32, 9);
    appendArcBand(builder, -0.98, 0.98, 0.52, 0.66, 10);
    appendArcBand(builder, -0.88, 0.88, 0.82, 1, 10);
    for (const offset of [-0.42, 0, 0.42]) {
      appendRibbon(builder, [
        [offset * 0.12, 0.16],
        [offset * 0.48, 0.42],
        [offset * 0.78, 0.72],
        [offset * 1.04, 1.08],
      ], 0.055);
      appendGroundDiamond(builder, offset * 1.06, 1.1, 0.075, 0.12);
    }
  });
}

/** Three fast claw lanes stay distinct from one large fox starter swipe. */
function createRushRakeSweepMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    for (const offset of [-0.38, 0, 0.38]) {
      appendRibbon(builder, [
        [offset * 0.12, 0.04],
        [offset * 0.68, 0.32],
        [offset * 0.36, 0.68],
        [offset * 1.16, 1.12],
      ], 0.058);
      appendGroundDiamond(builder, offset * 1.18, 1.12, 0.062, 0.11);
    }
    appendArcBand(builder, -0.52, 0.52, 0.08, 0.2, 5);
  });
}

/** A central glob, long comet tail, and escaping droplets make Gracie's projectile unmistakable. */
function createSpitVolleyMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    appendArcBand(builder, 0, Math.PI * 2, 0.05, 0.28, 8);
    appendGroundRay(builder, 0, 0.12, 1.12, 0.17);
    appendGroundDiamond(builder, 0, 0.88, 0.17, 0.22);
    appendGroundRay(builder, -0.25, 0.26, 0.94, 0.074);
    appendGroundRay(builder, 0.25, 0.26, 0.94, 0.074);
    appendGroundRay(builder, -0.54, 0.44, 0.76, 0.05);
    appendGroundRay(builder, 0.54, 0.44, 0.76, 0.05);
  });
}

/** Wide fractured ridges and stone plates communicate an advancing Trample earth wave. */
function createTrampleWaveMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    appendArcBand(builder, -1.12, 1.12, 0.18, 0.34, 10);
    appendArcBand(builder, -1.02, 1.02, 0.48, 0.64, 11);
    appendArcBand(builder, -0.9, 0.9, 0.78, 1, 10);
    for (const [x, z, width] of [
      [-0.74, 0.72, 0.16], [-0.38, 0.9, 0.13], [0, 0.98, 0.18], [0.38, 0.9, 0.13], [0.74, 0.72, 0.16],
    ] as const) {
      appendGroundDiamond(builder, x, z, width, 0.12);
    }
    for (const offset of [-0.72, -0.36, 0, 0.36, 0.72]) {
      appendGroundRay(builder, offset * 0.46, 0.42, 1.02, 0.046);
    }
  });
}

/** Layered soft arcs keep Fluffy Shield visibly different from metal armor. */
function createFluffyShieldMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    for (let index = 0; index < 6; index++) {
      const center = Math.PI * 2 * index / 6;
      appendArcBand(builder, center - 0.28, center + 0.28, 0.52, 0.88, 4);
    }
    appendArcBand(builder, 0, Math.PI * 2, 0.18, 0.31, 8);
  });
}

/** Hard plates and a forward chevron give Thick Skin a physical block read. */
function createArmorBlockMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    appendArcBand(builder, -1.08, 1.08, 0.34, 0.82, 8);
    appendGroundRay(builder, 0, 0.08, 0.98, 0.09);
    appendGroundRay(builder, -0.74, 0.28, 0.82, 0.07);
    appendGroundRay(builder, 0.74, 0.28, 0.82, 0.07);
    appendArcBand(builder, Math.PI - 0.46, Math.PI + 0.46, 0.48, 0.64, 4);
  });
}

/** Two offset afterimages give a successful fox dodge a direction-free read. */
function createFoxDodgeMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    appendGroundQuad(builder, [-0.72, -0.46], [-0.4, -0.58], [0.28, 0.38], [-0.08, 0.5]);
    appendGroundQuad(builder, [-0.18, -0.5], [0.14, -0.58], [0.78, 0.34], [0.42, 0.48]);
    appendGroundRay(builder, Math.PI, 0.16, 0.72, 0.07);
  });
}

/**
 * A brass thorn volley made of separated needle strokes. There is no filled
 * arc band here: at launch-camera scale a broad additive base read as a flat
 * yellow panel instead of individual quills.
 */
function createQuillVolleyMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    for (const offset of [-0.31, -0.155, 0, 0.155, 0.31]) {
      const length = 0.72 + (offset === 0 ? 0.18 : 0);
      appendGroundRay(builder, offset, 0.06, length, 0.032);
      const tip = polarPoint(offset, length);
      appendGroundDiamond(builder, tip[0], tip[1], 0.034, 0.068);
    }
    appendGroundDiamond(builder, 0, 0.045, 0.06, 0.075);
  });
}

/** Broad blue feather chevrons give Owl Pinions a silhouette unlike quills. */
function createOwlVolleyMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    for (const offset of [-0.34, 0, 0.34]) {
      appendGroundQuad(
        builder,
        [offset - 0.13, -0.42],
        [offset + 0.13, -0.42],
        [offset + 0.28, 0.46],
        [offset, 0.7],
      );
    }
    appendGroundRay(builder, Math.PI, 0.02, 0.24, 0.08);
  });
}

function createBloomMesh(device: pc.GraphicsDevice, petalCount: number, phase = 0): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    for (let index = 0; index < petalCount; index++) {
      appendGroundRay(builder, phase + Math.PI * 2 * index / petalCount, 0.04, 0.9, 0.16);
    }
  });
}

function createPufferBlastMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    for (let index = 0; index < 8; index++) {
      const angle = Math.PI * 2 * index / 8;
      appendGroundRay(builder, angle, 0.12, 1, index % 2 === 0 ? 0.14 : 0.09);
    }
    appendArcBand(builder, 0, Math.PI * 2, 0.22, 0.34, 10);
  });
}

function createArmadilloRollMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    appendArcBand(builder, -2.5, 0.55, 0.28, 0.48, 9);
    appendArcBand(builder, 0.6, 3.2, 0.55, 0.75, 8);
    appendArcBand(builder, -2.8, -0.35, 0.78, 0.96, 8);
    appendGroundRay(builder, 0.18, 0.04, 0.32, 0.075);
  });
}

function createInwardGatherMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    for (let index = 0; index < 6; index++) {
      appendGroundRay(builder, Math.PI * 2 * index / 6, 0.9, 0.1, 0.105);
    }
  });
}

function createSonarWaveMesh(device: pc.GraphicsDevice, phase = 0): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    const bands = [
      { radius: 0.38, halfSpan: 0.62 },
      { radius: 0.66, halfSpan: 0.8 },
      { radius: 0.95, halfSpan: 1.02 },
    ];
    for (let index = 0; index < bands.length; index++) {
      const band = bands[index]!;
      const center = phase + (index - 1) * 0.12;
      appendArcBand(
        builder,
        center - band.halfSpan,
        center + band.halfSpan,
        band.radius - 0.055,
        band.radius + 0.055,
        6,
      );
    }
  });
}

function createChargeLaneMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    appendGroundRay(builder, 0, 0.05, 1, 0.2);
    appendRibbon(builder, [[-0.46, 0.06], [-0.38, 0.84]], 0.035);
    appendRibbon(builder, [[0.46, 0.06], [0.38, 0.84]], 0.035);
    appendGroundRay(builder, Math.PI, 0.02, 0.2, 0.07);
  });
}

function createSandstormMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    appendArcBand(builder, -1.2, 1.05, 0.5, 0.61, 8);
    appendArcBand(builder, 0.35, 2.55, 0.72, 0.83, 8);
    appendArcBand(builder, -2.15, -0.3, 0.9, 1, 7);
    appendGroundRay(builder, 0.55, 0.1, 0.42, 0.07);
  });
}

function createShieldCrestMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    appendArcBand(builder, -1.05, 1.05, 0.42, 0.82, 8);
    appendGroundRay(builder, 0, 0.08, 0.98, 0.08);
    appendGroundRay(builder, -0.7, 0.22, 0.72, 0.06);
    appendGroundRay(builder, 0.7, 0.22, 0.72, 0.06);
  });
}

function createCrabCrushMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    appendArcBand(builder, -1.48, -0.18, 0.36, 0.9, 7);
    appendArcBand(builder, 0.18, 1.48, 0.36, 0.9, 7);
    appendGroundRay(builder, -0.9, 0.08, 0.62, 0.1);
    appendGroundRay(builder, 0.9, 0.08, 0.62, 0.1);
    appendGroundRay(builder, 0, 0.04, 0.46, 0.08);
  });
}

function createMeteorImpactMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    for (let index = 0; index < 10; index++) {
      appendGroundRay(builder, Math.PI * 2 * index / 10 + 0.1, 0.16, 1, 0.095);
    }
    appendGroundRay(builder, 0, 0, 0.42, 0.19);
    appendGroundRay(builder, Math.PI * 0.5, 0, 0.42, 0.19);
  });
}

function createSkunkCloudMesh(device: pc.GraphicsDevice, royal = false): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    const lobes = royal ? 9 : 6;
    const outer = royal ? 1 : 0.88;
    for (let index = 0; index < lobes; index++) {
      const angle = Math.PI * 2 * index / lobes + (royal ? 0.12 : 0);
      appendGroundRay(builder, angle, 0.08, outer * (0.72 + (index % 3) * 0.1), royal ? 0.16 : 0.14);
    }
    appendArcBand(builder, 0, Math.PI * 2, 0.24, 0.4, 9);
    if (royal) {
      appendGroundRay(builder, -0.38, 0.48, 0.94, 0.06);
      appendGroundRay(builder, 0, 0.48, 1.04, 0.06);
      appendGroundRay(builder, 0.38, 0.48, 0.94, 0.06);
    }
  });
}

function createScoutEyeMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    appendArcBand(builder, -1.22, 1.22, 0.58, 0.76, 8);
    appendArcBand(builder, Math.PI - 1.22, Math.PI + 1.22, 0.58, 0.76, 8);
    appendGroundRay(builder, 0, 0, 0.35, 0.08);
  });
}

function createScytheArcMesh(device: pc.GraphicsDevice, sectorAngleDegrees: number): pc.Mesh {
  const halfAngle = sectorAngleDegrees * Math.PI / 360;
  return createGroundMesh(device, (builder) => {
    appendArcBand(builder, -halfAngle, halfAngle, 0.48, 1, 8);
    appendArcBand(builder, -halfAngle * 0.72, halfAngle * 0.72, 0.38, 0.5, 6);
  });
}

function createSlashBladeMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    appendGroundQuad(builder, [-0.28, -0.5], [0.28, -0.5], [0.5, 0.16], [0, 0.58]);
    appendGroundQuad(builder, [-0.16, -0.44], [0.05, -0.32], [0.24, 0.18], [-0.12, 0.32]);
  });
}

function createBoltRibbonMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    appendRibbon(builder, [
      [0, -0.5], [0.28, -0.24], [-0.16, 0.03], [0.22, 0.3], [0, 0.5],
    ], 0.16);
  });
}

/** Shared impact crown: broad enough to survive a crowded launch camera. */
function createImpactCrownMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    appendGroundDiamond(builder, 0, 0, 0.22, 0.22);
    for (let index = 0; index < 10; index++) {
      const angle = Math.PI * 2 * index / 10 + 0.08;
      appendGroundRay(builder, angle, 0.2, index % 2 === 0 ? 1 : 0.74, 0.075);
    }
  });
}

/** A tight launch comet for projectile casts and their authorial travel beat. */
function createCometAccentMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    appendRibbon(builder, [[0, -0.7], [0.12, -0.2], [-0.08, 0.32], [0, 0.88]], 0.12);
    appendGroundDiamond(builder, 0, 0.78, 0.16, 0.2);
    appendGroundRay(builder, Math.PI, 0.14, 0.72, 0.055);
  });
}

/** A small, bright follow-through rake layered above all melee crescents. */
function createSlashAccentMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    appendRibbon(builder, [[-0.34, -0.52], [-0.08, -0.12], [0.16, 0.34], [0.42, 0.72]], 0.075);
    appendRibbon(builder, [[-0.12, -0.62], [0.12, -0.2], [0.34, 0.22], [0.56, 0.55]], 0.055);
    appendGroundDiamond(builder, 0.48, 0.64, 0.09, 0.14);
  });
}

/** Chunky forward fractures turn every Trample beat into a visible earth front. */
function createRidgeAccentMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    appendRibbon(builder, [[-0.68, -0.08], [-0.44, 0.26], [-0.22, 0.16], [0.02, 0.62], [0.24, 0.46], [0.62, 0.9]], 0.08);
    appendRibbon(builder, [[-0.54, 0.36], [-0.2, 0.7], [0.08, 0.56], [0.38, 1]], 0.065);
    appendGroundDiamond(builder, -0.1, 0.72, 0.13, 0.11);
    appendGroundDiamond(builder, 0.44, 0.94, 0.1, 0.12);
  });
}

/** A neutral readable rune for telegraphs, shields, zones, and sonar. */
function createRuneAccentMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    appendArcBand(builder, 0, Math.PI * 2, 0.56, 0.66, 10);
    for (let index = 0; index < 4; index++) {
      const angle = Math.PI * 0.5 * index + Math.PI * 0.25;
      const point = polarPoint(angle, 0.88);
      appendGroundDiamond(builder, point[0], point[1], 0.08, 0.12);
    }
    appendGroundDiamond(builder, 0, 0, 0.16, 0.16);
  });
}

function createAccentMeshes(device: pc.GraphicsDevice): Readonly<Record<TraitCommandVisualAccent, pc.Mesh>> {
  return {
    crown: createImpactCrownMesh(device),
    comet: createCometAccentMesh(device),
    slash: createSlashAccentMesh(device),
    ridge: createRidgeAccentMesh(device),
    halo: createBrokenHaloMesh(device, Math.PI / 10),
    rune: createRuneAccentMesh(device),
  };
}

function createFireflyMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    // A true lantern-wing silhouette: the old three-line spark vanished into
    // busy grass. These broad, asymmetric wings survive the top-down camera
    // while the trailing ray makes the orbit direction instantly legible.
    appendGroundQuad(builder, [-0.08, -0.16], [-1.08, -0.52], [-0.86, 0.58], [-0.14, 0.22]);
    appendGroundQuad(builder, [0.08, -0.16], [1.08, -0.52], [0.86, 0.58], [0.14, 0.22]);
    appendGroundQuad(builder, [-0.16, -0.3], [0.16, -0.3], [0.23, 0.43], [-0.23, 0.43]);
    appendGroundRay(builder, Math.PI, 0.2, 1.24, 0.07);
    appendGroundRay(builder, 0, 0.04, 0.62, 0.09);
    appendGroundRay(builder, -0.62, 0.12, 0.6, 0.055);
    appendGroundRay(builder, 0.62, 0.12, 0.6, 0.055);
  });
}

function createFireflyContactMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    for (let index = 0; index < 8; index++) {
      appendGroundRay(builder, Math.PI * 2 * index / 8, 0.04, index % 2 === 0 ? 1 : 0.66, 0.11);
    }
    appendArcBand(builder, 0, Math.PI * 2, 0.18, 0.31, 8);
  });
}

function createMonarchWingMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    appendGroundQuad(builder, [-0.08, -0.16], [-0.86, -0.62], [-0.62, 0.46], [-0.06, 0.18]);
    appendGroundQuad(builder, [0.08, -0.16], [0.86, -0.62], [0.62, 0.46], [0.06, 0.18]);
    appendGroundQuad(builder, [-0.08, -0.42], [0.08, -0.42], [0.12, 0.46], [-0.12, 0.46]);
  });
}

function createEffectMeshes(device: pc.GraphicsDevice): Readonly<Record<EffectMaterial, pc.Mesh>> {
  return {
    telegraph: createCompassMesh(device),
    'thornstorm-telegraph': createShardBurstMesh(device, 10, 0.28, 1, 0.09, 0.1),
    'thunderbug-telegraph': createBoltRibbonMesh(device),
    'boss-charge': createChargeLaneMesh(device),
    'boss-volley': createBrokenHaloMesh(device, 0.12),
    'saltwind-charge': createChargeLaneMesh(device),
    'saltwind-sandstorm': createSandstormMesh(device),
    'support-pulse': createBloomMesh(device, 5, Math.PI / 10),
    'directed-burst': createArrowFanMesh(device),
    'rush-rake': createRakeMesh(device),
    'greg-fox-swipe': createFoxSwipeMesh(device),
    'greg-rush-rake': createRushRakeSweepMesh(device),
    'benny-trample-wave': createTrampleWaveMesh(device),
    'gracie-spit': createSpitVolleyMesh(device),
    'fluffy-shield': createFluffyShieldMesh(device),
    'armor-block': createArmorBlockMesh(device),
    'fox-dodge': createFoxDodgeMesh(device),
    'quill-volley': createQuillVolleyMesh(device),
    'owl-volley': createOwlVolleyMesh(device),
    'radial-burst': createShardBurstMesh(device, 7, 0.1, 1, 0.1, 0.05),
    'thornstorm-volley': createShardBurstMesh(device, 16, 0.08, 1, 0.075, 0.1),
    'orbiting-damage': createFireflyMesh(device),
    'firefly-contact': createFireflyContactMesh(device),
    'monarch-brood-orbit': createMonarchWingMesh(device),
    gather: createInwardGatherMesh(device),
    knockback: createShardBurstMesh(device, 6, 0.22, 1, 0.125, 0.18),
    'puffer-blast': createPufferBlastMesh(device),
    'armadillo-roll': createArmadilloRollMesh(device),
    'benny-brace': createShieldCrestMesh(device),
    'area-damage': createShardBurstMesh(device, 8, 0.12, 1, 0.115, -0.1),
    'crab-crush': createCrabCrushMesh(device),
    'meteor-impact': createMeteorImpactMesh(device),
    'melee-arc': createScytheArcMesh(device, MELEE_ARC_VARIANTS[1]!.sectorAngleDegrees),
    'gecko-zone-spawn': createBloomMesh(device, 5, 0),
    'razorstep-zone-spawn': createScytheArcMesh(device, 130),
    'skunk-cloud': createSkunkCloudMesh(device),
    'royal-stink-cloud': createSkunkCloudMesh(device, true),
    'trait-cue': createShardBurstMesh(device, 4, 0.05, 0.92, 0.15, Math.PI / 4),
    'chain-lightning': createBoltRibbonMesh(device),
    'mark-pulse': createSonarWaveMesh(device, 0),
    'bat-ears-sonar': createSonarWaveMesh(device, 0.12),
    'midnight-radar-sonar': createSonarWaveMesh(device, -0.12),
    'gracie-scout': createScoutEyeMesh(device),
  };
}

function createOrbitingMeshes(device: pc.GraphicsDevice): Readonly<Record<OrbitingVisualMaterial, pc.Mesh>> {
  return {
    'orbiting-damage': createFireflyMesh(device),
    'monarch-brood-orbit': createMonarchWingMesh(device),
  };
}

function resolveEffectSpinDegrees(material: EffectMaterial, progress: number): number {
  switch (material) {
    case 'mark-pulse':
    case 'bat-ears-sonar':
    case 'midnight-radar-sonar':
      return -10 * progress;
    case 'gather':
    case 'saltwind-sandstorm':
      return -16 * progress;
    case 'radial-burst':
    case 'knockback':
    case 'area-damage':
    case 'thornstorm-telegraph':
      return 11 * progress;
    default:
      return 0;
  }
}

interface EffectSlot {
  readonly entity: pc.Entity;
  readonly meshInstance: pc.MeshInstance;
  readonly accentEntity: pc.Entity;
  readonly accentMeshInstance: pc.MeshInstance;
  active: boolean;
  profile: TraitCommandEffectProfile | null;
  material: EffectMaterial;
  paletteLane: AttackVfxPaletteLane;
  accentPaletteLane: AttackVfxPaletteLane;
  tick: number;
  expiresAtTick: number;
  x: number;
  y: number;
  radius: number;
  aspect: number;
  yawDegrees: number;
  dirX: number;
  dirY: number;
  intensity: number;
  /** A small family-hued Scout-origin punctuation, not a second attack body. */
  isHeroCastCue: boolean;
}

interface ChainLightningSegmentSlot {
  readonly entity: pc.Entity;
  readonly meshInstance: pc.MeshInstance;
  active: boolean;
  tick: number;
  expiresAtTick: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  intensity: number;
  paletteLane: AttackVfxPaletteLane;
}

interface MeleeArcSlot {
  readonly entity: pc.Entity;
  readonly meshInstance: pc.MeshInstance;
  readonly accentEntity: pc.Entity;
  readonly accentMeshInstance: pc.MeshInstance;
  active: boolean;
  tick: number;
  expiresAtTick: number;
  x: number;
  y: number;
  radius: number;
  yawDegrees: number;
  dirX: number;
  dirY: number;
  intensity: number;
  paletteLane: AttackVfxPaletteLane;
  accentPaletteLane: AttackVfxPaletteLane;
}

/**
 * A generic forward blade streak is deliberately not a sector/hitbox preview.
 * It is the safe bounded fallback for arbitrary valid `meleeArc` widths.
 */
interface GenericMeleeSlashSlot {
  readonly entity: pc.Entity;
  readonly meshInstance: pc.MeshInstance;
  readonly accentEntity: pc.Entity;
  readonly accentMeshInstance: pc.MeshInstance;
  active: boolean;
  mesh: pc.Mesh;
  material: EffectMaterial;
  tick: number;
  expiresAtTick: number;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  radius: number;
  yawDegrees: number;
  intensity: number;
  paletteLane: AttackVfxPaletteLane;
  accentPaletteLane: AttackVfxPaletteLane;
}

interface OrbitingDamageSlot {
  readonly entity: pc.Entity;
  readonly meshInstance: pc.MeshInstance;
  active: boolean;
  material: OrbitingVisualMaterial;
  tick: number;
  expiresAtTick: number;
  originX: number;
  originY: number;
  count: number;
  index: number;
  radius: number;
  speed: number;
  facing: number;
  intensity: number;
  paletteLane: AttackVfxPaletteLane;
}

/** One actual firefly-to-enemy contact, captured by the authoritative executor. */
interface OrbitContactSlot {
  readonly linkEntity: pc.Entity;
  readonly linkMeshInstance: pc.MeshInstance;
  readonly impactEntity: pc.Entity;
  readonly impactMeshInstance: pc.MeshInstance;
  active: boolean;
  tick: number;
  expiresAtTick: number;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  paletteLane: AttackVfxPaletteLane;
}

function resetSlot(slot: EffectSlot): void {
  slot.active = false;
  slot.profile = null;
  slot.isHeroCastCue = false;
  slot.entity.enabled = false;
  slot.accentEntity.enabled = false;
}

function resetChainLightningSlot(slot: ChainLightningSegmentSlot): void {
  slot.active = false;
  slot.entity.enabled = false;
}

function resetMeleeArcSlot(slot: MeleeArcSlot): void {
  slot.active = false;
  slot.entity.enabled = false;
  slot.accentEntity.enabled = false;
}

function resetGenericMeleeSlashSlot(slot: GenericMeleeSlashSlot): void {
  slot.active = false;
  slot.entity.enabled = false;
  slot.accentEntity.enabled = false;
}

function resetOrbitingDamageSlot(slot: OrbitingDamageSlot): void {
  slot.active = false;
  slot.entity.enabled = false;
}

function resetOrbitContactSlot(slot: OrbitContactSlot): void {
  slot.active = false;
  slot.linkEntity.enabled = false;
  slot.impactEntity.enabled = false;
}

function normalizedTick(tick: number): number {
  return Math.max(0, Math.floor(finiteOr(tick, 0)));
}

/**
 * Fixed-pool renderer for the trait command stream. Each command becomes a
 * short-lived ground pulse; no command ever feeds back into simulation state.
 * The pool owns all PlayCanvas entities/materials at construction time.
 */
export function createTraitCommandPresentation(
  device: pc.GraphicsDevice,
  parent: pc.Entity,
  worldHalfWidth: number,
  worldHalfHeight: number,
  capacity = DEFAULT_TRAIT_COMMAND_PRESENTATION_CAPACITY,
): TraitCommandPresentation {
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new RangeError('trait command presentation capacity must be a positive safe integer');
  }

  // A tiny finite material bank is built before any render event arrives.
  // Most roles have their one semantic default; the one legacy Razorstep
  // compatibility lane adds a second. This makes source-family selection a
  // real render decision without creating a material during combat.
  const materials = new Map<PaletteMaterialKey, pc.StandardMaterial>();
  const accentMaterials = new Map<PaletteMaterialKey, pc.StandardMaterial>();
  for (const role of EFFECT_MATERIALS) {
    for (const lane of prebuiltPaletteLanesForEffectMaterial(role)) {
      const key = paletteMaterialKey(role, lane);
      materials.set(key, createMaterial(role, lane));
      accentMaterials.set(key, createAccentMaterial(role, lane));
    }
  }
  function materialFor(role: EffectMaterial, lane = paletteLaneForEffectMaterial(role)): pc.StandardMaterial {
    const material = materials.get(paletteMaterialKey(role, lane));
    if (material === undefined) {
      throw new Error(`Missing prebuilt palette material for ${role}:${lane}`);
    }
    return material;
  }
  function accentMaterialFor(role: EffectMaterial, lane = paletteLaneForEffectMaterial(role)): pc.StandardMaterial {
    const material = accentMaterials.get(paletteMaterialKey(role, lane));
    if (material === undefined) {
      throw new Error(`Missing prebuilt accent palette material for ${role}:${lane}`);
    }
    return material;
  }
  const effectMeshes = createEffectMeshes(device);
  const accentMeshes = createAccentMeshes(device);
  const orbitingMeshes = createOrbitingMeshes(device);
  const fireflyContactLinkMesh = createBoltRibbonMesh(device);
  // Mantis uses separate, prebuilt crescent meshes. They retain the exact
  // authored angular widths without falling back to a circular torus.
  const meleeArcMeshes: pc.Mesh[] = MELEE_ARC_VARIANTS.map((variant) => createScytheArcMesh(
    device,
    variant.sectorAngleDegrees,
  ));
  // Arbitrary valid melee widths still need an honest directional read, not a
  // fake sector. This tapered blade is shared by the fallback pool.
  const genericMeleeSlashMesh = createSlashBladeMesh(device);
  // Reuse the regular effect meshes for hero sweeps so their source-specific
  // silhouettes remain a single bounded GPU allocation.
  const foxSwipeMesh = effectMeshes['greg-fox-swipe'];
  const rushRakeSweepMesh = effectMeshes['greg-rush-rake'];
  // A single jagged ribbon is enough for every resolved chain segment and
  // communicates electricity much more cleanly than a stretched cube.
  const chainLightningMesh = createBoltRibbonMesh(device);
  // Slots swap authored silhouettes as new commands arrive. Detached mesh
  // references keep those bounded GPU meshes alive while no visible slot uses
  // a particular trait shape, then release them cleanly on presentation
  // disposal.
  const dynamicMeshKeepers = [
    ...Object.values(effectMeshes),
    ...Object.values(accentMeshes),
    ...Object.values(orbitingMeshes),
    fireflyContactLinkMesh,
    ...meleeArcMeshes,
    genericMeleeSlashMesh,
    chainLightningMesh,
  ].map((mesh) => new pc.MeshInstance(mesh, materialFor('telegraph')));

  const slots: EffectSlot[] = [];
  for (let index = 0; index < capacity; index++) {
    const entity = new pc.Entity(`trait-command-effect-${index}`);
    const accentEntity = new pc.Entity(`trait-command-accent-${index}`);
    const meshInstance = new pc.MeshInstance(effectMeshes.telegraph, materialFor('telegraph'));
    const accentMeshInstance = new pc.MeshInstance(accentMeshes.crown, accentMaterialFor('telegraph'));
    entity.addComponent('render', {
      meshInstances: [meshInstance], castShadows: false, receiveShadows: false,
    });
    accentEntity.addComponent('render', {
      meshInstances: [accentMeshInstance], castShadows: false, receiveShadows: false,
    });
    entity.enabled = false;
    accentEntity.enabled = false;
    parent.addChild(entity);
    parent.addChild(accentEntity);
    slots.push({
      entity, meshInstance, accentEntity, accentMeshInstance,
      active: false, profile: null, material: 'telegraph',
      paletteLane: paletteLaneForEffectMaterial('telegraph'),
      accentPaletteLane: paletteLaneForEffectMaterial('telegraph'),
      tick: 0, expiresAtTick: 0,
      x: 0, y: 0, radius: 0, aspect: 1, yawDegrees: 0, dirX: 1, dirY: 0, intensity: 1,
      isHeroCastCue: false,
    });
  }

  const meleeArcSlotsPerVariant = Math.max(2, Math.min(8, Math.ceil(capacity / 4)));
  const meleeArcSlots: MeleeArcSlot[][] = MELEE_ARC_VARIANTS.map(() => []);
  for (let variantIndex = 0; variantIndex < MELEE_ARC_VARIANTS.length; variantIndex++) {
    const variantSlots = meleeArcSlots[variantIndex]!;
    for (let index = 0; index < meleeArcSlotsPerVariant; index++) {
      const entity = new pc.Entity(`mantis-scythe-arc-${variantIndex}-${index}`);
      const accentEntity = new pc.Entity(`mantis-scythe-accent-${variantIndex}-${index}`);
      const meshInstance = new pc.MeshInstance(meleeArcMeshes[variantIndex]!, materialFor('melee-arc'));
      const accentMeshInstance = new pc.MeshInstance(accentMeshes.slash, accentMaterialFor('melee-arc'));
      entity.addComponent('render', {
        meshInstances: [meshInstance], castShadows: false, receiveShadows: false,
      });
      accentEntity.addComponent('render', {
        meshInstances: [accentMeshInstance], castShadows: false, receiveShadows: false,
      });
      entity.enabled = false;
      accentEntity.enabled = false;
      parent.addChild(entity);
      parent.addChild(accentEntity);
      variantSlots.push({
        entity, meshInstance, accentEntity, accentMeshInstance,
        active: false, tick: 0, expiresAtTick: 0,
        x: 0, y: 0, radius: 0, yawDegrees: 0, dirX: 1, dirY: 0, intensity: 1,
        paletteLane: paletteLaneForEffectMaterial('melee-arc'),
        accentPaletteLane: paletteLaneForEffectMaterial('melee-arc'),
      });
    }
  }
  const genericMeleeSlashSlots: GenericMeleeSlashSlot[] = [];
  for (let index = 0; index < meleeArcSlotsPerVariant; index++) {
    const entity = new pc.Entity(`generic-melee-slash-${index}`);
    const accentEntity = new pc.Entity(`generic-melee-accent-${index}`);
    const meshInstance = new pc.MeshInstance(genericMeleeSlashMesh, materialFor('melee-arc'));
    const accentMeshInstance = new pc.MeshInstance(accentMeshes.slash, accentMaterialFor('melee-arc'));
    entity.addComponent('render', {
      meshInstances: [meshInstance], castShadows: false, receiveShadows: false,
    });
    accentEntity.addComponent('render', {
      meshInstances: [accentMeshInstance], castShadows: false, receiveShadows: false,
    });
    entity.enabled = false;
    accentEntity.enabled = false;
    parent.addChild(entity);
    parent.addChild(accentEntity);
    genericMeleeSlashSlots.push({
      entity, meshInstance, accentEntity, accentMeshInstance,
      active: false, mesh: genericMeleeSlashMesh, material: 'melee-arc', tick: 0, expiresAtTick: 0,
      x: 0, y: 0, dirX: 1, dirY: 0, radius: 0, yawDegrees: 0, intensity: 1,
      paletteLane: paletteLaneForEffectMaterial('melee-arc'),
      accentPaletteLane: paletteLaneForEffectMaterial('melee-arc'),
    });
  }

  const orbitingDamageSlots: OrbitingDamageSlot[] = [];
  const orbitingDamageCapacity = Math.max(4, Math.min(FIREFLY_ORBIT_MAX_COUNT, capacity));
  for (let index = 0; index < orbitingDamageCapacity; index++) {
    const entity = new pc.Entity(`firefly-orbit-${index}`);
    const meshInstance = new pc.MeshInstance(orbitingMeshes['orbiting-damage'], materialFor('orbiting-damage'));
    entity.addComponent('render', {
      meshInstances: [meshInstance], castShadows: false, receiveShadows: false,
    });
    entity.enabled = false;
    parent.addChild(entity);
    orbitingDamageSlots.push({
      entity, meshInstance, active: false, material: 'orbiting-damage', tick: 0, expiresAtTick: 0,
      originX: 0, originY: 0, count: 1, index: 0, radius: 0, speed: 0, facing: 0, intensity: 1,
      paletteLane: paletteLaneForEffectMaterial('orbiting-damage'),
    });
  }

  // Fireflies can touch a different target on the same pulse. Retain a small
  // separate pool for exact, short-lived contact links and impact stars so
  // the player can see that the orbit is dealing real damage, not merely
  // decorating Greg.
  const orbitContactSlots: OrbitContactSlot[] = [];
  const orbitContactCapacity = Math.max(4, Math.min(FIREFLY_ORBIT_MAX_COUNT, capacity));
  for (let index = 0; index < orbitContactCapacity; index++) {
    const linkEntity = new pc.Entity(`firefly-contact-link-${index}`);
    const impactEntity = new pc.Entity(`firefly-contact-impact-${index}`);
    const linkMeshInstance = new pc.MeshInstance(fireflyContactLinkMesh, materialFor('firefly-contact'));
    const impactMeshInstance = new pc.MeshInstance(effectMeshes['firefly-contact'], materialFor('firefly-contact'));
    linkEntity.addComponent('render', {
      meshInstances: [linkMeshInstance], castShadows: false, receiveShadows: false,
    });
    impactEntity.addComponent('render', {
      meshInstances: [impactMeshInstance], castShadows: false, receiveShadows: false,
    });
    linkEntity.enabled = false;
    impactEntity.enabled = false;
    parent.addChild(linkEntity);
    parent.addChild(impactEntity);
    orbitContactSlots.push({
      linkEntity,
      linkMeshInstance,
      impactEntity,
      impactMeshInstance,
      active: false,
      tick: 0,
      expiresAtTick: 0,
      sourceX: 0,
      sourceY: 0,
      targetX: 0,
      targetY: 0,
      paletteLane: paletteLaneForEffectMaterial('firefly-contact'),
    });
  }

  const chainSegmentCapacity = Math.min(
    DEFAULT_CHAIN_LIGHTNING_SEGMENT_CAPACITY,
    Math.max(8, capacity * 8),
  );
  const chainLightningSlots: ChainLightningSegmentSlot[] = [];
  for (let index = 0; index < chainSegmentCapacity; index++) {
    const entity = new pc.Entity(`chain-lightning-segment-${index}`);
    const meshInstance = new pc.MeshInstance(chainLightningMesh, materialFor('chain-lightning'));
    entity.addComponent('render', {
      meshInstances: [meshInstance], castShadows: false, receiveShadows: false,
    });
    entity.enabled = false;
    parent.addChild(entity);
    chainLightningSlots.push({
      entity, meshInstance, active: false, tick: 0, expiresAtTick: 0,
      fromX: 0, fromY: 0, toX: 0, toY: 0, intensity: 1,
      paletteLane: paletteLaneForEffectMaterial('chain-lightning'),
    });
  }

  let overflowCount = 0;
  let lastTick = -1;

  function reset(): void {
    for (const slot of slots) resetSlot(slot);
    for (const variantSlots of meleeArcSlots) {
      for (const slot of variantSlots) resetMeleeArcSlot(slot);
    }
    for (const slot of genericMeleeSlashSlots) resetGenericMeleeSlashSlot(slot);
    for (const slot of orbitingDamageSlots) resetOrbitingDamageSlot(slot);
    for (const slot of orbitContactSlots) resetOrbitContactSlot(slot);
    for (const slot of chainLightningSlots) resetChainLightningSlot(slot);
    overflowCount = 0;
    lastTick = -1;
  }

  function updateSlot(slot: EffectSlot, tick: number): void {
    const profile = slot.profile;
    if (!slot.active || profile === null) return;
    if (tick > slot.expiresAtTick) {
      resetSlot(slot);
      return;
    }

    const progress = traitCommandVisualProgress(tick, slot.tick, slot.expiresAtTick);
    const blueprint = resolveTraitCommandVisualBlueprint(profile);
    const stage = resolveTraitCommandVisualStage(progress, profile);
    const scale = profile.motion === 'expand'
      ? 0.22 + progress * 0.78
      : profile.motion === 'contract'
        ? 1 - progress * 0.7
        : 0.72 + Math.sin(progress * Math.PI) * 0.22;
    // Intensity expands the authored silhouette a little, never the combat
    // area. The simulation still owns radius, damage, and contact timing.
    const radius = Math.max(1, slot.radius * scale * (1 + (slot.intensity - 1) * 0.24));
    const underlayMultiplier = slot.isHeroCastCue ? 1 : resolveIllustratedHeroUnderlayOpacityMultiplier(profile);
    const underlayOpacity = slot.isHeroCastCue
      ? HERO_CAST_CUE_UNDERLAY_OPACITY
      : resolveProceduralUnderlayOpacity(slot.material) * underlayMultiplier;
    const fade = traitCommandFade(progress);
    const opacity = underlayOpacity * fade;
    const radialScale = radius / EFFECT_UNIT_RADIUS;
    const groundHeight = GROUND_EFFECT_HEIGHT + Math.min(0.55, radius * 0.006);
    slot.meshInstance.mesh = effectMeshes[slot.material];
    slot.meshInstance.material = materialFor(slot.material, slot.paletteLane);
    slot.meshInstance.setParameter('material_opacity', opacity);
    slot.entity.setLocalPosition(
      slot.x - worldHalfWidth,
      groundHeight,
      worldHalfHeight - slot.y,
    );
    slot.entity.setLocalEulerAngles(0, slot.yawDegrees + resolveEffectSpinDegrees(slot.material, progress), 0);
    slot.entity.setLocalScale(
      radialScale * slot.aspect,
      1,
      radialScale,
    );
    slot.entity.enabled = opacity > 0.001;

    // The companion layer is an authored flourish rather than a hitbox. It
    // moves from the cast point toward the direction only for directed
    // commands, so it never pretends to know a target that the sim did not
    // resolve.
    const accentTravel = profile.directed
      ? slot.radius * blueprint.travelDistance * resolveAccentTravel(progress, stage)
      : 0;
    const accentRadius = resolveAccentScale(slot.radius, slot.intensity, blueprint, stage);
    const accentOpacity = resolveAccentOpacity(
      slot.isHeroCastCue
        ? HERO_CAST_CUE_ACCENT_OPACITY
        : resolveProceduralAccentOpacity(slot.material) * underlayMultiplier,
      blueprint,
      stage,
    ) * fade;
    const accent = resolveStagedAccent(blueprint, stage);
    slot.accentMeshInstance.mesh = accentMeshes[accent];
    slot.accentMeshInstance.material = accentMaterialFor(slot.material, slot.accentPaletteLane);
    slot.accentMeshInstance.setParameter('material_opacity', accentOpacity);
    slot.accentEntity.setLocalPosition(
      slot.x + slot.dirX * accentTravel - worldHalfWidth,
      groundHeight + 0.14 + (stage === 'impact' ? 0.16 : 0),
      worldHalfHeight - (slot.y + slot.dirY * accentTravel),
    );
    slot.accentEntity.setLocalEulerAngles(
      0,
      slot.yawDegrees + resolveEffectSpinDegrees(slot.material, progress) * 1.45,
      0,
    );
    slot.accentEntity.setLocalScale(
      accentRadius * resolveAccentLateralScale(accent),
      1,
      accentRadius * resolveAccentLongitudinalScale(accent),
    );
    slot.accentEntity.enabled = accentOpacity > 0.01;
  }

  function updateMeleeArcSlot(slot: MeleeArcSlot, tick: number): void {
    if (!slot.active) return;
    if (tick > slot.expiresAtTick) {
      resetMeleeArcSlot(slot);
      return;
    }
    const progress = traitCommandVisualProgress(tick, slot.tick, slot.expiresAtTick);
    const profile = PROFILES['melee-arc'];
    const blueprint = resolveTraitCommandVisualBlueprint(profile);
    const stage = resolveTraitCommandVisualStage(progress, profile);
    // A quick outward sweep reads like a claw cut rather than a stationary
    // defensive aura. The authoritative damage itself remains instantaneous.
    const radius = Math.max(1, slot.radius * (0.32 + progress * 0.68) * (1 + (slot.intensity - 1) * 0.24));
    const radialScale = radius / MELEE_ARC_UNIT_RADIUS;
    const fade = traitCommandFade(progress);
    // Mantis's painted scythe is the attack read; this sector remains only a
    // quiet timing/contact footprint below it, never a second opaque wedge.
    const opacity = resolveProceduralUnderlayOpacity('melee-arc')
      * resolveIllustratedHeroUnderlayOpacityMultiplier(profile)
      * fade;
    slot.meshInstance.material = materialFor('melee-arc', slot.paletteLane);
    slot.meshInstance.setParameter('material_opacity', opacity);
    slot.entity.setLocalPosition(
      slot.x - worldHalfWidth,
      MELEE_ARC_HEIGHT,
      worldHalfHeight - slot.y,
    );
    slot.entity.setLocalEulerAngles(0, slot.yawDegrees, 0);
    slot.entity.setLocalScale(
      radialScale,
      1,
      radialScale,
    );
    slot.entity.enabled = opacity > 0.001;

    const accent = resolveStagedAccent(blueprint, stage);
    const accentTravel = slot.radius * blueprint.travelDistance * resolveAccentTravel(progress, stage);
    const accentRadius = resolveAccentScale(slot.radius, slot.intensity, blueprint, stage);
    const accentOpacity = resolveAccentOpacity(
      resolveProceduralAccentOpacity('melee-arc')
        * resolveIllustratedHeroUnderlayOpacityMultiplier(profile),
      blueprint,
      stage,
    ) * fade;
    slot.accentMeshInstance.mesh = accentMeshes[accent];
    slot.accentMeshInstance.material = accentMaterialFor('melee-arc', slot.accentPaletteLane);
    slot.accentMeshInstance.setParameter('material_opacity', accentOpacity);
    slot.accentEntity.setLocalPosition(
      slot.x + slot.dirX * accentTravel - worldHalfWidth,
      MELEE_ARC_HEIGHT + 0.18 + (stage === 'impact' ? 0.12 : 0),
      worldHalfHeight - (slot.y + slot.dirY * accentTravel),
    );
    slot.accentEntity.setLocalEulerAngles(0, slot.yawDegrees + progress * 16, 0);
    slot.accentEntity.setLocalScale(
      accentRadius * resolveAccentLateralScale(accent),
      1,
      accentRadius * resolveAccentLongitudinalScale(accent),
    );
    slot.accentEntity.enabled = accentOpacity > 0.01;
  }

  function updateGenericMeleeSlashSlot(slot: GenericMeleeSlashSlot, tick: number): void {
    if (!slot.active) return;
    if (tick > slot.expiresAtTick) {
      resetGenericMeleeSlashSlot(slot);
      return;
    }
    const progress = traitCommandVisualProgress(tick, slot.tick, slot.expiresAtTick);
    const profile = PROFILES[slot.material];
    const blueprint = resolveTraitCommandVisualBlueprint(profile);
    const stage = resolveTraitCommandVisualStage(progress, profile);
    const underlayMultiplier = resolveIllustratedHeroUnderlayOpacityMultiplier(profile);
    const fade = traitCommandFade(progress);
    const opacity = resolveProceduralUnderlayOpacity(slot.material)
      * underlayMultiplier
      * fade;
    slot.meshInstance.mesh = slot.mesh;
    slot.meshInstance.material = materialFor(slot.material, slot.paletteLane);
    slot.meshInstance.setParameter('material_opacity', opacity);
    const isHeroSweep = slot.material === 'greg-fox-swipe' || slot.material === 'greg-rush-rake';
    let centerX = slot.x;
    let centerY = slot.y;
    let scaleX: number;
    let scaleZ: number;
    if (isHeroSweep) {
      const radialScale = Math.max(1, slot.radius * (0.28 + progress * 0.72) * (1 + (slot.intensity - 1) * 0.24))
        / MELEE_ARC_UNIT_RADIUS;
      // These authored hero shapes are directional attack cues, not literal
      // hit-sector overlays. They originate at the attacker and expand across
      // the same resolved heading that the simulation used for damage.
      scaleX = radialScale;
      scaleZ = radialScale;
    } else {
      const length = Math.max(2, slot.radius * (0.26 + progress * 0.62) * (1 + (slot.intensity - 1) * 0.18));
      const width = Math.max(1.1, slot.radius * 0.03 * (1 - progress * 0.25) * slot.intensity);
      // Position the streak forward from Greg. Unlike a sector mesh it claims
      // no exact angular coverage, which keeps arbitrary future arc values
      // visually honest while preserving a readable directional attack cue.
      centerX = slot.x + slot.dirX * length * 0.42;
      centerY = slot.y + slot.dirY * length * 0.42;
      scaleX = width;
      scaleZ = length;
    }
    slot.entity.setLocalPosition(
      centerX - worldHalfWidth,
      GENERIC_MELEE_SLASH_HEIGHT,
      worldHalfHeight - centerY,
    );
    slot.entity.setLocalEulerAngles(0, slot.yawDegrees, 0);
    slot.entity.setLocalScale(scaleX, 1, scaleZ);
    slot.entity.enabled = opacity > 0.001;

    const accent = resolveStagedAccent(blueprint, stage);
    const accentTravel = slot.radius * blueprint.travelDistance * resolveAccentTravel(progress, stage);
    const accentRadius = resolveAccentScale(slot.radius, slot.intensity, blueprint, stage);
    const accentOpacity = resolveAccentOpacity(
      resolveProceduralAccentOpacity(slot.material) * underlayMultiplier,
      blueprint,
      stage,
    ) * fade;
    slot.accentMeshInstance.mesh = accentMeshes[accent];
    slot.accentMeshInstance.material = accentMaterialFor(slot.material, slot.accentPaletteLane);
    slot.accentMeshInstance.setParameter('material_opacity', accentOpacity);
    slot.accentEntity.setLocalPosition(
      slot.x + slot.dirX * accentTravel - worldHalfWidth,
      GENERIC_MELEE_SLASH_HEIGHT + 0.18 + (stage === 'impact' ? 0.14 : 0),
      worldHalfHeight - (slot.y + slot.dirY * accentTravel),
    );
    slot.accentEntity.setLocalEulerAngles(0, slot.yawDegrees + progress * 18, 0);
    slot.accentEntity.setLocalScale(
      accentRadius * resolveAccentLateralScale(accent),
      1,
      accentRadius * resolveAccentLongitudinalScale(accent),
    );
    slot.accentEntity.enabled = accentOpacity > 0.01;
  }

  function updateOrbitingDamageSlot(slot: OrbitingDamageSlot, tick: number): void {
    if (!slot.active) return;
    if (tick > slot.expiresAtTick) {
      resetOrbitingDamageSlot(slot);
      return;
    }
    const progress = traitCommandVisualProgress(tick, slot.tick, slot.expiresAtTick);
    const angle = slot.facing
      + (slot.speed % (Math.PI * 2)) * (tick % 1_000_000)
      + Math.PI * 2 * slot.index / slot.count;
    const x = slot.originX + Math.cos(angle) * slot.radius;
    const y = slot.originY + Math.sin(angle) * slot.radius;
    const isMonarch = slot.material === 'monarch-brood-orbit';
    const scale = FIREFLY_ORBIT_SIZE
      * (isMonarch ? 1.28 : 1)
      * slot.intensity
      * (0.86 + Math.sin(progress * Math.PI) * 0.18);
    const tangentYawDegrees = Math.atan2(-Math.sin(angle), -Math.cos(angle)) * 180 / Math.PI;
    slot.meshInstance.mesh = orbitingMeshes[slot.material];
    slot.meshInstance.material = materialFor(slot.material, slot.paletteLane);
    const opacity = resolveProceduralUnderlayOpacity(slot.material)
      * resolveIllustratedHeroUnderlayOpacityMultiplier(PROFILES[slot.material])
      * traitCommandFade(progress);
    slot.meshInstance.setParameter(
      'material_opacity',
      opacity,
    );
    slot.entity.setLocalPosition(
      x - worldHalfWidth,
      FIREFLY_ORBIT_HEIGHT + Math.sin((progress * 2 + slot.index * 0.19) * Math.PI) * (isMonarch ? 0.2 : 0.12),
      worldHalfHeight - y,
    );
    slot.entity.setLocalEulerAngles(0, tangentYawDegrees, 0);
    slot.entity.setLocalScale(scale, 1, scale);
    slot.entity.enabled = opacity > 0.001;
  }

  function updateOrbitContactSlot(slot: OrbitContactSlot, tick: number): void {
    if (!slot.active) return;
    if (tick > slot.expiresAtTick) {
      resetOrbitContactSlot(slot);
      return;
    }
    const progress = traitCommandVisualProgress(tick, slot.tick, slot.expiresAtTick);
    const dx = slot.targetX - slot.sourceX;
    const dy = slot.targetY - slot.sourceY;
    const length = Math.sqrt(dx * dx + dy * dy);
    const opacity = resolveProceduralUnderlayOpacity('firefly-contact')
      * resolveIllustratedHeroUnderlayOpacityMultiplier(PROFILES['firefly-contact'])
      * traitCommandFade(progress);
    const material = materialFor('firefly-contact', slot.paletteLane);

    if (length > 0.001) {
      const midpointX = (slot.sourceX + slot.targetX) * 0.5;
      const midpointY = (slot.sourceY + slot.targetY) * 0.5;
      const yawDegrees = Math.atan2(dx, -dy) * 180 / Math.PI;
      slot.linkMeshInstance.material = material;
      slot.linkMeshInstance.setParameter('material_opacity', opacity * 0.86);
      slot.linkEntity.setLocalPosition(
        midpointX - worldHalfWidth,
        FIREFLY_ORBIT_HEIGHT + 0.22,
        worldHalfHeight - midpointY,
      );
      slot.linkEntity.setLocalEulerAngles(0, yawDegrees, 0);
      slot.linkEntity.setLocalScale(
        Math.max(0.8, 1.45 - progress * 0.34),
        1,
        length,
      );
      slot.linkEntity.enabled = opacity > 0.001;
    } else {
      slot.linkEntity.enabled = false;
    }

    // The star is placed on the executor-resolved enemy endpoint, rather
    // than an inferred nearest hostile. That one visual rule is what makes
    // Firefly Colony's damage feedback trustworthy in a dense swarm.
    const impactScale = 2.7 * (1.08 - progress * 0.3);
    slot.impactMeshInstance.material = material;
    slot.impactMeshInstance.setParameter('material_opacity', opacity);
    slot.impactEntity.setLocalPosition(
      slot.targetX - worldHalfWidth,
      FIREFLY_ORBIT_HEIGHT + 0.36 + Math.sin(progress * Math.PI) * 0.28,
      worldHalfHeight - slot.targetY,
    );
    slot.impactEntity.setLocalEulerAngles(0, progress * 80, 0);
    slot.impactEntity.setLocalScale(impactScale, 1, impactScale);
    slot.impactEntity.enabled = opacity > 0.001;
  }

  function updateChainLightningSlot(slot: ChainLightningSegmentSlot, tick: number): void {
    if (!slot.active) return;
    if (tick > slot.expiresAtTick) {
      resetChainLightningSlot(slot);
      return;
    }
    const dx = slot.toX - slot.fromX;
    const dy = slot.toY - slot.fromY;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (!(length > 0.001)) {
      resetChainLightningSlot(slot);
      return;
    }
    const progress = traitCommandVisualProgress(tick, slot.tick, slot.expiresAtTick);
    const thickness = Math.max(0.7, CHAIN_LIGHTNING_THICKNESS * slot.intensity * (1 - progress * 0.38));
    const midpointX = (slot.fromX + slot.toX) * 0.5;
    const midpointY = (slot.fromY + slot.toY) * 0.5;
    // Scene +Z is simulation -Y; local +Z is the jagged bolt's travel axis.
    const yawDegrees = Math.atan2(dx, -dy) * 180 / Math.PI;
    slot.meshInstance.material = materialFor('chain-lightning', slot.paletteLane);
    slot.meshInstance.setParameter(
      'material_opacity',
      resolveProceduralUnderlayOpacity('chain-lightning')
        * resolveIllustratedHeroUnderlayOpacityMultiplier(PROFILES['chain-lightning'])
        * traitCommandFade(progress),
    );
    slot.entity.setLocalPosition(
      midpointX - worldHalfWidth,
      CHAIN_LIGHTNING_HEIGHT,
      worldHalfHeight - midpointY,
    );
    slot.entity.setLocalEulerAngles(0, yawDegrees, 0);
    slot.entity.setLocalScale(thickness, 1, length);
    slot.entity.enabled = traitCommandFade(progress) > 0.001;
  }

  function start(
    event: TraitCommandPresentationEvent,
    profile: TraitCommandEffectProfile,
    currentTick: number,
    originX = Number.NaN,
    originY = Number.NaN,
    radiusOverride = Number.NaN,
    isHeroCastCue = false,
  ): void {
    const emittedTick = normalizedTick(event.tick);
    const lifetimeTicks = resolveLifetime(event, profile);
    if (emittedTick + lifetimeTicks <= currentTick) return;
    const concurrencyCap = resolveTraitCommandVisualConcurrencyCap(profile);
    let slot: EffectSlot | undefined;
    if (concurrencyCap !== null) {
      let activeCount = 0;
      let oldest: EffectSlot | undefined;
      for (const candidate of slots) {
        if (!candidate.active || candidate.material !== profile.material) continue;
        activeCount++;
        if (oldest === undefined || candidate.tick < oldest.tick) oldest = candidate;
      }
      if (activeCount >= concurrencyCap && oldest !== undefined) {
        // Coalesce an over-eager visual stream into its newest cue. This is
        // presentation-only: the authoritative projectile burst remains
        // untouched and still renders through the regular projectile layer.
        resetSlot(oldest);
        slot = oldest;
      }
    }
    slot ??= slots.find((candidate) => !candidate.active);
    if (slot === undefined) {
      overflowCount++;
      return;
    }
    slot.active = true;
    slot.profile = profile;
    slot.material = profile.material;
    slot.paletteLane = resolveTraitCommandPaletteLane(event, profile);
    slot.accentPaletteLane = resolveTraitCommandAccentPaletteLane(event, profile);
    slot.tick = emittedTick;
    slot.expiresAtTick = emittedTick + lifetimeTicks;
    slot.x = finiteOr(originX, finiteOr(event.originX, 0));
    slot.y = finiteOr(originY, finiteOr(event.originY, 0));
    slot.radius = positiveOr(radiusOverride, resolveTraitCommandEffectRadius(event, profile));
    slot.aspect = resolveAspect(event, profile);
    slot.yawDegrees = resolveYawDegrees(event);
    const rawDirX = finiteOr(event.dirX, 0);
    const rawDirY = finiteOr(event.dirY, 0);
    const directionLength = Math.sqrt(rawDirX * rawDirX + rawDirY * rawDirY);
    // Facing is a safe visual fallback when a directed cue carries no vector.
    const yawRadians = slot.yawDegrees * Math.PI / 180;
    slot.dirX = directionLength > 1e-8 ? rawDirX / directionLength : Math.sin(yawRadians);
    slot.dirY = directionLength > 1e-8 ? rawDirY / directionLength : -Math.cos(yawRadians);
    slot.intensity = resolveTraitCommandVisualIntensity(event, profile);
    slot.isHeroCastCue = isHeroCastCue;
  }

  function startHeroCastCue(
    event: TraitCommandPresentationEvent,
    profile: TraitCommandEffectProfile,
    currentTick: number,
    heroX: number,
    heroY: number,
  ): void {
    if (!shouldEmitHeroCastCue(event, profile) || !Number.isFinite(heroX) || !Number.isFinite(heroY)) return;
    start(
      event,
      HERO_CAST_CUE_PROFILE,
      currentTick,
      heroX,
      heroY,
      HERO_CAST_CUE_RADIUS,
      true,
    );
  }

  /**
   * Exact Mantis sectors and the generic melee fallback use different pools,
   * so apply the shared source cap across both before starting a new sweep.
   * This preserves a wide scythe silhouette while refusing to stack opaque
   * duplicate sectors over the same combat moment.
   */
  function coalesceMeleeArcVisuals(profile: TraitCommandEffectProfile): void {
    const concurrencyCap = resolveTraitCommandVisualConcurrencyCap(profile);
    if (concurrencyCap === null) return;

    let activeCount = 0;
    let oldestMeleeArc: MeleeArcSlot | undefined;
    let oldestGenericSlash: GenericMeleeSlashSlot | undefined;
    for (const variantSlots of meleeArcSlots) {
      for (const candidate of variantSlots) {
        if (!candidate.active) continue;
        activeCount++;
        if (oldestMeleeArc === undefined || candidate.tick < oldestMeleeArc.tick) oldestMeleeArc = candidate;
      }
    }
    for (const candidate of genericMeleeSlashSlots) {
      if (!candidate.active || candidate.material !== profile.material) continue;
      activeCount++;
      if (oldestGenericSlash === undefined || candidate.tick < oldestGenericSlash.tick) {
        oldestGenericSlash = candidate;
      }
    }
    if (activeCount < concurrencyCap) return;
    if (
      oldestMeleeArc !== undefined
      && (oldestGenericSlash === undefined || oldestMeleeArc.tick <= oldestGenericSlash.tick)
    ) {
      resetMeleeArcSlot(oldestMeleeArc);
    } else if (oldestGenericSlash !== undefined) {
      resetGenericMeleeSlashSlot(oldestGenericSlash);
    }
  }

  function startMeleeArc(
    event: TraitCommandPresentationEvent,
    profile: TraitCommandEffectProfile,
    currentTick: number,
  ): void {
    if (!hasResolvedMeleeArc(event)) return;
    const emittedTick = normalizedTick(event.tick);
    const lifetimeTicks = resolveLifetime(event, profile);
    if (emittedTick + lifetimeTicks <= currentTick) return;
    coalesceMeleeArcVisuals(profile);
    const variantIndex = resolveMeleeArcVariantIndex(event.arc);
    if (variantIndex === null) {
      startGenericMeleeSlash(event, profile, emittedTick, lifetimeTicks);
      return;
    }
    const slot = meleeArcSlots[variantIndex]!.find((candidate) => !candidate.active);
    if (slot === undefined) {
      overflowCount++;
      return;
    }
    slot.active = true;
    slot.tick = emittedTick;
    slot.expiresAtTick = emittedTick + lifetimeTicks;
    slot.x = finiteOr(event.originX, 0);
    slot.y = finiteOr(event.originY, 0);
    slot.radius = resolveTraitCommandEffectRadius(event, profile);
    slot.yawDegrees = resolveMeleeArcYawDegrees(event);
    const rawDirX = finiteOr(event.dirX, 0);
    const rawDirY = finiteOr(event.dirY, 0);
    const directionLength = Math.sqrt(rawDirX * rawDirX + rawDirY * rawDirY);
    const yawRadians = slot.yawDegrees * Math.PI / 180;
    slot.dirX = directionLength > 1e-8 ? rawDirX / directionLength : Math.sin(yawRadians);
    slot.dirY = directionLength > 1e-8 ? rawDirY / directionLength : -Math.cos(yawRadians);
    slot.intensity = resolveTraitCommandVisualIntensity(event, profile);
    slot.paletteLane = resolveTraitCommandPaletteLane(event, profile);
    slot.accentPaletteLane = resolveTraitCommandAccentPaletteLane(event, profile);
  }

  function startGenericMeleeSlash(
    event: TraitCommandPresentationEvent,
    profile: TraitCommandEffectProfile,
    emittedTick: number,
    lifetimeTicks: number,
  ): void {
    const slot = genericMeleeSlashSlots.find((candidate) => !candidate.active);
    if (slot === undefined) {
      overflowCount++;
      return;
    }
    const rawDirX = finiteOr(event.dirX, 0);
    const rawDirY = finiteOr(event.dirY, 0);
    const length = Math.sqrt(rawDirX * rawDirX + rawDirY * rawDirY);
    slot.active = true;
    slot.tick = emittedTick;
    slot.expiresAtTick = emittedTick + lifetimeTicks;
    slot.x = finiteOr(event.originX, 0);
    slot.y = finiteOr(event.originY, 0);
    slot.dirX = length > 1e-8 ? rawDirX / length : 1;
    slot.dirY = length > 1e-8 ? rawDirY / length : 0;
    slot.radius = resolveTraitCommandEffectRadius(event, profile);
    slot.yawDegrees = resolveYawDegrees(event);
    slot.intensity = resolveTraitCommandVisualIntensity(event, profile);
    slot.material = profile.material;
    slot.paletteLane = resolveTraitCommandPaletteLane(event, profile);
    slot.accentPaletteLane = resolveTraitCommandAccentPaletteLane(event, profile);
    slot.mesh = profile.material === 'greg-fox-swipe'
      ? foxSwipeMesh
      : profile.material === 'greg-rush-rake'
        ? rushRakeSweepMesh
        : genericMeleeSlashMesh;
  }

  function startOrbitingDamage(
    event: TraitCommandPresentationEvent,
    profile: TraitCommandEffectProfile,
    currentTick: number,
  ): void {
    const emittedTick = normalizedTick(event.tick);
    const lifetimeTicks = resolveLifetime(event, profile);
    if (emittedTick + lifetimeTicks <= currentTick) return;
    const count = Math.max(1, Math.min(
      FIREFLY_ORBIT_MAX_COUNT,
      Math.floor(finiteOr(event.count, 1)),
    ));
    let free = 0;
    for (const slot of orbitingDamageSlots) {
      if (!slot.active) free++;
    }
    if (free < count) {
      overflowCount++;
      return;
    }
    const intensity = resolveTraitCommandVisualIntensity(event, profile);
    let assigned = 0;
    for (const slot of orbitingDamageSlots) {
      if (slot.active) continue;
      slot.active = true;
      slot.material = profile.material === 'monarch-brood-orbit'
        ? 'monarch-brood-orbit'
        : 'orbiting-damage';
      slot.tick = emittedTick;
      slot.expiresAtTick = emittedTick + lifetimeTicks;
      slot.originX = finiteOr(event.originX, 0);
      slot.originY = finiteOr(event.originY, 0);
      slot.count = count;
      slot.index = assigned++;
      slot.radius = resolveTraitCommandEffectRadius(event, profile);
      slot.speed = finiteOr(event.speed, 0);
      slot.facing = finiteOr(event.facing, 0);
      slot.intensity = intensity;
      slot.paletteLane = resolveTraitCommandPaletteLane(event, profile);
      if (assigned >= count) break;
    }
  }

  function startOrbitContacts(
    event: TraitCommandPresentationEvent,
    profile: TraitCommandEffectProfile,
    currentTick: number,
  ): void {
    if (!hasResolvedOrbitContact(event)) return;
    const hitCount = resolvedOrbitHitCount(event);
    const emittedTick = normalizedTick(event.tick);
    if (emittedTick + FIREFLY_CONTACT_LIFETIME_TICKS <= currentTick) return;
    const sourceX = event.resolvedOrbitSourceX!;
    const sourceY = event.resolvedOrbitSourceY!;
    const targetX = event.resolvedOrbitHitX!;
    const targetY = event.resolvedOrbitHitY!;
    for (let index = 0; index < hitCount; index++) {
      const fromX = sourceX[index]!;
      const fromY = sourceY[index]!;
      const toX = targetX[index]!;
      const toY = targetY[index]!;
      if (!(
        Number.isFinite(fromX)
        && Number.isFinite(fromY)
        && Number.isFinite(toX)
        && Number.isFinite(toY)
      )) continue;
      const slot = orbitContactSlots.find((candidate) => !candidate.active);
      if (slot === undefined) {
        overflowCount++;
        break;
      }
      slot.active = true;
      slot.tick = emittedTick;
      slot.expiresAtTick = emittedTick + FIREFLY_CONTACT_LIFETIME_TICKS;
      slot.sourceX = fromX;
      slot.sourceY = fromY;
      slot.targetX = toX;
      slot.targetY = toY;
      slot.paletteLane = resolveTraitCommandPaletteLane(event, profile);
    }
  }

  function startChainLightning(event: TraitCommandPresentationEvent, currentTick: number): void {
    const hitCount = resolvedChainHitCount(event);
    if (hitCount === 0) return;
    const emittedTick = normalizedTick(event.tick);
    if (emittedTick + CHAIN_LIGHTNING_LIFETIME_TICKS <= currentTick) return;
    const hitX = event.resolvedHitX!;
    const hitY = event.resolvedHitY!;
    const intensity = resolveTraitCommandVisualIntensity(event, PROFILES['chain-lightning']);
    const paletteLane = resolveTraitCommandPaletteLane(event, PROFILES['chain-lightning']);
    let fromX = finiteOr(event.originX, 0);
    let fromY = finiteOr(event.originY, 0);
    for (let index = 0; index < hitCount; index++) {
      const toX = hitX[index]!;
      const toY = hitY[index]!;
      if (!(Number.isFinite(toX) && Number.isFinite(toY))) break;
      const dx = toX - fromX;
      const dy = toY - fromY;
      if (dx * dx + dy * dy <= 1e-6) {
        fromX = toX;
        fromY = toY;
        continue;
      }
      const slot = chainLightningSlots.find((candidate) => !candidate.active);
      if (slot === undefined) {
        overflowCount++;
        break;
      }
      slot.active = true;
      slot.tick = emittedTick;
      slot.expiresAtTick = emittedTick + CHAIN_LIGHTNING_LIFETIME_TICKS;
      slot.fromX = fromX;
      slot.fromY = fromY;
      slot.toX = toX;
      slot.toY = toY;
      slot.intensity = intensity;
      slot.paletteLane = paletteLane;
      fromX = toX;
      fromY = toY;
    }
  }

  return {
    capacity,
    get overflowCount() {
      return overflowCount;
    },
    update(currentTick, events, heroX = Number.NaN, heroY = Number.NaN) {
      const tick = normalizedTick(currentTick);
      if (tick < lastTick) reset();
      for (const slot of slots) updateSlot(slot, tick);
      for (const variantSlots of meleeArcSlots) {
        for (const slot of variantSlots) updateMeleeArcSlot(slot, tick);
      }
      for (const slot of genericMeleeSlashSlots) updateGenericMeleeSlashSlot(slot, tick);
      for (const slot of orbitingDamageSlots) updateOrbitingDamageSlot(slot, tick);
      for (const slot of orbitContactSlots) updateOrbitContactSlot(slot, tick);
      for (const slot of chainLightningSlots) updateChainLightningSlot(slot, tick);
      for (const event of events) {
        const profile = projectTraitCommandEffect(event);
        if (profile === null) continue;
        // Start the source cue before the world-side body so a full generic
        // pool still preserves the player's cause→effect attribution.
        startHeroCastCue(event, profile, tick, heroX, heroY);
        if (profile.kind === 'chain-lightning') {
          startChainLightning(event, tick);
        } else if (profile.kind === 'melee-arc') {
          startMeleeArc(event, profile, tick);
        } else if (profile.kind === 'orbiting-damage') {
          startOrbitingDamage(event, profile, tick);
          startOrbitContacts(event, profile, tick);
        } else {
          start(event, profile, tick);
        }
      }
      // Newly started slots need their first transform in the same render.
      for (const slot of slots) updateSlot(slot, tick);
      for (const variantSlots of meleeArcSlots) {
        for (const slot of variantSlots) updateMeleeArcSlot(slot, tick);
      }
      for (const slot of genericMeleeSlashSlots) updateGenericMeleeSlashSlot(slot, tick);
      for (const slot of orbitingDamageSlots) updateOrbitingDamageSlot(slot, tick);
      for (const slot of orbitContactSlots) updateOrbitContactSlot(slot, tick);
      for (const slot of chainLightningSlots) updateChainLightningSlot(slot, tick);
      lastTick = tick;
    },
    reset,
    dispose() {
      for (const slot of slots) {
        slot.entity.destroy();
        slot.accentEntity.destroy();
      }
      for (const variantSlots of meleeArcSlots) {
        for (const slot of variantSlots) {
          slot.entity.destroy();
          slot.accentEntity.destroy();
        }
      }
      for (const slot of genericMeleeSlashSlots) {
        slot.entity.destroy();
        slot.accentEntity.destroy();
      }
      for (const slot of orbitingDamageSlots) slot.entity.destroy();
      for (const slot of orbitContactSlots) {
        slot.linkEntity.destroy();
        slot.impactEntity.destroy();
      }
      for (const slot of chainLightningSlots) slot.entity.destroy();
      for (const keeper of dynamicMeshKeepers) keeper.destroy();
      for (const material of materials.values()) material.destroy();
      for (const material of accentMaterials.values()) material.destroy();
    },
  };
}
