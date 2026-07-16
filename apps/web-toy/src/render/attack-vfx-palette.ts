/**
 * Palette law for the renderer-only attack underpainting.
 *
 * Painted attack cards keep their native art. This module governs only the
 * quiet procedural geometry that sits behind them, so a dense run has one
 * coherent colour language instead of a separate neon colour for every trait.
 */

export const ATTACK_VFX_FAMILY = Object.freeze({
  physical: 'physical',
  earth: 'earth',
  venom: 'venom',
  arcane: 'arcane',
  storm: 'storm',
  fire: 'fire',
} as const);

export type AttackVfxFamily = (typeof ATTACK_VFX_FAMILY)[keyof typeof ATTACK_VFX_FAMILY];

export const ATTACK_VFX_RESERVED_LANE = Object.freeze({
  /** Threats aimed at the player only. Player attacks must never resolve here. */
  danger: 'danger',
  /** Map rewards and XP only. Attack underlays must never resolve here. */
  reward: 'reward',
} as const);

export type AttackVfxPaletteLane = AttackVfxFamily
  | (typeof ATTACK_VFX_RESERVED_LANE)[keyof typeof ATTACK_VFX_RESERVED_LANE];

/** Primary chassis lane plus donor-accent lane for a generated Wild Splice. */
export interface ChimeraPaletteLanes {
  readonly primary: AttackVfxFamily;
  readonly accent: AttackVfxFamily;
}

export interface AttackVfxRgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export const PROCEDURAL_UNDERLAY_OPACITY_CAP = 0.35;
export const PROCEDURAL_ACCENT_OPACITY_CAP = 0.45;
export const PROCEDURAL_UNDERLAY_SATURATION_MULTIPLIER = 0.65;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Converts one sRGB triplet to HSL without introducing renderer dependencies. */
function rgbToHsl(color: AttackVfxRgb): readonly [number, number, number] {
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  const lightness = (max + min) * 0.5;
  const delta = max - min;
  if (delta < 1e-8) return [0, 0, lightness] as const;

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === color.r) {
    hue = ((color.g - color.b) / delta) % 6;
  } else if (max === color.g) {
    hue = (color.b - color.r) / delta + 2;
  } else {
    hue = (color.r - color.g) / delta + 4;
  }
  return [((hue * 60) + 360) % 360, saturation, lightness] as const;
}

function hueComponent(p: number, q: number, t: number): number {
  let wrapped = t;
  if (wrapped < 0) wrapped += 1;
  if (wrapped > 1) wrapped -= 1;
  if (wrapped < 1 / 6) return p + (q - p) * 6 * wrapped;
  if (wrapped < 1 / 2) return q;
  if (wrapped < 2 / 3) return p + (q - p) * (2 / 3 - wrapped) * 6;
  return p;
}

function hslToRgb(hue: number, saturation: number, lightness: number): AttackVfxRgb {
  if (saturation < 1e-8) return Object.freeze({ r: lightness, g: lightness, b: lightness });
  const normalizedHue = ((hue % 360) + 360) % 360 / 360;
  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  return Object.freeze({
    r: hueComponent(p, q, normalizedHue + 1 / 3),
    g: hueComponent(p, q, normalizedHue),
    b: hueComponent(p, q, normalizedHue - 1 / 3),
  });
}

/** Exported for palette-reservation tests and future art-direction tooling. */
export function saturationForRgb(color: AttackVfxRgb): number {
  return rgbToHsl(color)[1];
}

/**
 * Produces the shared muted underpaint version of an authored family colour.
 * The visible cards remain untouched; only additive/procedural geometry gets
 * this 35% saturation reduction.
 */
export function desaturateAttackVfxColor(color: AttackVfxRgb, multiplier = PROCEDURAL_UNDERLAY_SATURATION_MULTIPLIER): AttackVfxRgb {
  const [hue, saturation, lightness] = rgbToHsl(color);
  return hslToRgb(hue, clamp(saturation * multiplier, 0, 1), lightness);
}

const FAMILY_BASE_COLORS: Readonly<Record<AttackVfxFamily, AttackVfxRgb>> = Object.freeze({
  physical: Object.freeze({ r: 0.98, g: 0.76, b: 0.38 }), // ivory / amber
  earth: Object.freeze({ r: 0.72, g: 0.42, b: 0.16 }), // ochre / umber
  venom: Object.freeze({ r: 0.36, g: 0.72, b: 0.2 }), // moss / chartreuse
  arcane: Object.freeze({ r: 0.48, g: 0.32, b: 0.78 }), // dusk violet
  storm: Object.freeze({ r: 0.24, g: 0.62, b: 0.8 }), // slate cyan
  fire: Object.freeze({ r: 0.9, g: 0.34, b: 0.14 }), // ember orange
});

const RESERVED_BASE_COLORS: Readonly<Record<keyof typeof ATTACK_VFX_RESERVED_LANE, AttackVfxRgb>> = Object.freeze({
  danger: Object.freeze({ r: 0.94, g: 0.24, b: 0.2 }), // hostile-to-player coral
  reward: Object.freeze({ r: 0.22, g: 0.9, b: 0.7 }), // mint; gold stays reward/critical only
});

/**
 * Every procedural colour used by attack geometry. These are already
 * desaturated so a family cannot accidentally reintroduce neon just by using
 * the shared lookup.
 */
export const PROCEDURAL_UNDERPAINT_COLORS: Readonly<Record<AttackVfxPaletteLane, AttackVfxRgb>> = Object.freeze({
  physical: desaturateAttackVfxColor(FAMILY_BASE_COLORS.physical),
  earth: desaturateAttackVfxColor(FAMILY_BASE_COLORS.earth),
  venom: desaturateAttackVfxColor(FAMILY_BASE_COLORS.venom),
  arcane: desaturateAttackVfxColor(FAMILY_BASE_COLORS.arcane),
  storm: desaturateAttackVfxColor(FAMILY_BASE_COLORS.storm),
  fire: desaturateAttackVfxColor(FAMILY_BASE_COLORS.fire),
  danger: desaturateAttackVfxColor(RESERVED_BASE_COLORS.danger),
  reward: desaturateAttackVfxColor(RESERVED_BASE_COLORS.reward),
});

/** Full-saturation gold is intentionally reserved for critical-impact art. */
export const CRITICAL_IMPACT_GOLD: AttackVfxRgb = Object.freeze({ r: 1, g: 0.78, b: 0.12 });

/**
 * Authoritative source-id ownership for every currently emitted trait or
 * renderer-owned hero instinct. These are source IDs, never command tags:
 * tags such as `gecko-pad` and `thunderbug-charge` resolve through their
 * effect-material lane below. Unknown future player traits fall back to
 * physical in `paletteLaneForTraitSource`; they never borrow danger coral or
 * reward mint/gold by accident.
 */
export const TRAIT_COMMAND_PALETTE_FAMILY_BY_SOURCE: Readonly<Record<string, AttackVfxPaletteLane>> = Object.freeze({
  'greg-fox-swipe': 'physical',
  'greg-rush-rake': 'physical',
  'porcupine-quills': 'physical',
  'mantis-scythes': 'physical',
  'crab-pincers': 'physical',
  'armadillo-greaves': 'earth',
  'benny-trample': 'earth',
  'benny-brace': 'earth',
  'gracie-spit': 'venom',
  'gracie-scout': 'venom',
  'puffer-pouch': 'venom',
  'skunk-brush': 'venom',
  'royal-stinkcloud': 'venom',
  'gecko-pads': 'venom',
  'razorstep-chimera': 'venom',
  'thornstorm-mantle': 'arcane',
  'bat-ears': 'arcane',
  'midnight-radar': 'arcane',
  'owl-pinions': 'storm',
  'thunderbug-dynamo': 'storm',
  'electric-eel-coil': 'storm',
  'firefly-colony': 'storm',
  'monarch-brood': 'physical',
  'meteor-mauler': 'fire',
  'fluffy-shield': 'physical',
  'armor-block': 'physical',
  'fox-dodge': 'physical',
  'boss-charge': 'danger',
  'boss-volley': 'danger',
  'saltwind-charge': 'danger',
  'saltwind-sandstorm': 'danger',
  'support-pulse': 'danger',
});

const CHIMERA_TRAIT_FAMILY: Readonly<Record<string, AttackVfxFamily>> = Object.freeze({
  'porcupine-quills': 'physical',
  'puffer-pouch': 'venom',
  'electric-eel-coil': 'storm',
  'firefly-colony': 'storm',
  'mantis-scythes': 'physical',
  'gecko-pads': 'venom',
  'owl-pinions': 'storm',
  'bat-ears': 'arcane',
  'crab-pincers': 'physical',
  'armadillo-greaves': 'earth',
  'skunk-brush': 'venom',
  'monarch-brood': 'physical',
});

const CHIMERA_CHASSIS_PRIORITY: Readonly<Record<string, number>> = Object.freeze({
  'mantis-scythes': 90,
  'porcupine-quills': 85,
  'owl-pinions': 80,
  'electric-eel-coil': 75,
  'skunk-brush': 70,
  'gecko-pads': 65,
  'crab-pincers': 60,
  'firefly-colony': 55,
  'monarch-brood': 50,
  'puffer-pouch': 40,
  'armadillo-greaves': 35,
  'bat-ears': 30,
});

const PERFECT_CHIMERA_PARENTS: Readonly<Record<string, readonly [string, string]>> = Object.freeze({
  'thornstorm-mantle': ['porcupine-quills', 'puffer-pouch'],
  'thunderbug-dynamo': ['electric-eel-coil', 'firefly-colony'],
  'razorstep-chimera': ['mantis-scythes', 'gecko-pads'],
  'midnight-radar': ['owl-pinions', 'bat-ears'],
  'meteor-mauler': ['crab-pincers', 'armadillo-greaves'],
  'royal-stinkcloud': ['skunk-brush', 'monarch-brood'],
});

function chimeraParentsForSource(sourceId: string): readonly [string, string] | null {
  const authored = PERFECT_CHIMERA_PARENTS[sourceId];
  if (authored !== undefined) return authored;
  const match = /^chimera:([^+:]+)\+([^:]+)$/.exec(sourceId);
  if (match === null || match[1] === undefined || match[2] === undefined) return null;
  return [match[1], match[2]];
}

/**
 * Resolves a safe chassis/donor duotone without introducing a new colour lane.
 * Unknown or malformed ids deliberately return null so existing physical
 * fallback behaviour remains unchanged.
 */
export function paletteLaneForChimeraSource(sourceId: string): ChimeraPaletteLanes | null {
  const parents = chimeraParentsForSource(sourceId);
  if (parents === null) return null;
  const [first, second] = parents;
  const firstFamily = CHIMERA_TRAIT_FAMILY[first];
  const secondFamily = CHIMERA_TRAIT_FAMILY[second];
  if (firstFamily === undefined || secondFamily === undefined) return null;
  const firstPriority = CHIMERA_CHASSIS_PRIORITY[first] ?? -1;
  const secondPriority = CHIMERA_CHASSIS_PRIORITY[second] ?? -1;
  const firstIsChassis = firstPriority >= secondPriority;
  return Object.freeze({
    primary: firstIsChassis ? firstFamily : secondFamily,
    accent: firstIsChassis ? secondFamily : firstFamily,
  });
}

/**
 * The trait-command renderer works in effect-material names after projecting
 * source events. Keeping this lookup alongside the source table makes every
 * fallback route obey the same palette law.
 */
export const EFFECT_MATERIAL_PALETTE_FAMILY: Readonly<Record<string, AttackVfxPaletteLane>> = Object.freeze({
  telegraph: 'arcane',
  'thornstorm-telegraph': 'arcane',
  'thunderbug-telegraph': 'storm',
  'boss-charge': 'danger',
  'boss-volley': 'danger',
  'saltwind-charge': 'danger',
  'saltwind-sandstorm': 'danger',
  'support-pulse': 'danger',
  'directed-burst': 'physical',
  'rush-rake': 'physical',
  'greg-fox-swipe': 'physical',
  'greg-rush-rake': 'physical',
  'benny-trample-wave': 'earth',
  'gracie-spit': 'venom',
  'fluffy-shield': 'physical',
  'armor-block': 'physical',
  'fox-dodge': 'physical',
  'quill-volley': 'physical',
  'owl-volley': 'storm',
  'radial-burst': 'arcane',
  'thornstorm-volley': 'arcane',
  'orbiting-damage': 'storm',
  'firefly-contact': 'storm',
  'monarch-brood-orbit': 'physical',
  gather: 'arcane',
  knockback: 'physical',
  'puffer-blast': 'venom',
  'armadillo-roll': 'earth',
  'benny-brace': 'earth',
  'area-damage': 'fire',
  'crab-crush': 'physical',
  'meteor-impact': 'fire',
  'melee-arc': 'physical',
  'gecko-zone-spawn': 'venom',
  'razorstep-zone-spawn': 'venom',
  'skunk-cloud': 'venom',
  'royal-stink-cloud': 'venom',
  'trait-cue': 'physical',
  'chain-lightning': 'storm',
  'mark-pulse': 'arcane',
  'bat-ears-sonar': 'arcane',
  'midnight-radar-sonar': 'arcane',
  'gracie-scout': 'venom',
});

export function paletteLaneForTraitSource(sourceId: string): AttackVfxPaletteLane {
  return paletteLaneForChimeraSource(sourceId)?.primary
    ?? TRAIT_COMMAND_PALETTE_FAMILY_BY_SOURCE[sourceId]
    ?? ATTACK_VFX_FAMILY.physical;
}

export function hasExplicitTraitSourcePaletteLane(sourceId: string): boolean {
  return paletteLaneForChimeraSource(sourceId) !== null
    || Object.prototype.hasOwnProperty.call(TRAIT_COMMAND_PALETTE_FAMILY_BY_SOURCE, sourceId);
}

export function paletteLaneForEffectMaterial(material: string): AttackVfxPaletteLane {
  return EFFECT_MATERIAL_PALETTE_FAMILY[material] ?? ATTACK_VFX_FAMILY.physical;
}

/**
 * Shared material factories take a lane, not a command role. This is the
 * runtime boundary that lets an explicit source family select its genuinely
 * matching prebuilt render material while keeping unknown roles on their
 * safe effect-material fallback.
 */
export function proceduralColorForPaletteLane(lane: AttackVfxPaletteLane): AttackVfxRgb {
  return PROCEDURAL_UNDERPAINT_COLORS[lane];
}

export function proceduralColorForEffectMaterial(material: string): AttackVfxRgb {
  return proceduralColorForPaletteLane(paletteLaneForEffectMaterial(material));
}

export function proceduralUnderlayOpacity(requestedOpacity: number): number {
  return clamp(Number.isFinite(requestedOpacity) ? requestedOpacity : 0, 0, PROCEDURAL_UNDERLAY_OPACITY_CAP);
}

export function proceduralAccentOpacity(requestedOpacity: number): number {
  return clamp(Number.isFinite(requestedOpacity) ? requestedOpacity : 0, 0, PROCEDURAL_ACCENT_OPACITY_CAP);
}

/** Player attack paths are forbidden from the danger and reward reservations. */
export function isPlayerAttackPaletteLane(lane: AttackVfxPaletteLane): lane is AttackVfxFamily {
  return lane !== ATTACK_VFX_RESERVED_LANE.danger && lane !== ATTACK_VFX_RESERVED_LANE.reward;
}
