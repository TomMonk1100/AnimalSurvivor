/**
 * Browser-local copy projection for the planned Wild Splice surface.
 *
 * The simulation may still send the older FusionOfferView shape, so every
 * reader below is structural and intentionally optional. This keeps copy
 * presentation independent from gameplay truth and makes the UI safe to ship
 * alongside a staged simulation rollout.
 */

export type ChimeraPairKind = 'perfect' | 'wild' | 'support';

export const FUSION_SLOT_DETAIL = 'Fuses 2 Master attacks into 1 slot. Free. Permanent. Enthusiastic.';

export interface ChimeraFusionOffer {
  readonly evolutionId: string | null;
  readonly ingredients: readonly [string, string] | null;
  readonly displayName: string | null;
  readonly rarity: string | null;
  readonly temperamentId: string | null;
  readonly pairKind: ChimeraPairKind | null;
  readonly flavorIndex: number | null;
}

export interface ChimeraPairRoles {
  readonly chassisId: string;
  readonly chassisName: string;
  readonly donorId: string;
  readonly donorName: string;
}

export interface ChimeraFusionCopy {
  readonly evolutionId: string | null;
  readonly title: string;
  readonly ingredients: string;
  readonly description: string;
  readonly detail: string;
  readonly rarity: string | null;
  readonly temperament: string | null;
  readonly temperamentAside: string | null;
  readonly pairKind: ChimeraPairKind | null;
  /** True when an older offer has no Wild Splice classification yet. */
  readonly usesLegacyFallback: boolean;
}

interface ChimeraTraitDefinition {
  readonly id: string;
  readonly name: string;
  readonly priority: number;
  readonly chassisLine: string;
  readonly donorLine: string;
}

interface TemperamentCopy {
  readonly label: string;
  readonly aside: string;
}

interface ResolvedChimeraPairRoles {
  readonly chassis: ChimeraTraitDefinition;
  readonly donor: ChimeraTraitDefinition;
}

const CHIMERA_TRAITS: Readonly<Record<string, ChimeraTraitDefinition>> = Object.freeze({
  'mantis-scythes': {
    id: 'mantis-scythes',
    name: 'Mantis Scythes',
    priority: 90,
    chassisLine: 'Sweeping melee arcs lead each cycle.',
    donorLine: 'Razor graft adds a scythe sweep to the attack cycle.',
  },
  'porcupine-quills': {
    id: 'porcupine-quills',
    name: 'Porcupine Quills',
    priority: 85,
    chassisLine: 'Piercing quill volleys lead each cycle.',
    donorLine: 'Pierce graft adds a piercing quill follow-up.',
  },
  'owl-pinions': {
    id: 'owl-pinions',
    name: 'Owl Pinions',
    priority: 80,
    chassisLine: 'Wide feather volleys lead each cycle.',
    donorLine: 'Fan graft widens and doubles the volley.',
  },
  'electric-eel-coil': {
    id: 'electric-eel-coil',
    name: 'Electric Eel Coil',
    priority: 75,
    chassisLine: 'Chain lightning leads each cycle.',
    donorLine: 'Arc graft chains a follow-up through nearby threats.',
  },
  'skunk-brush': {
    id: 'skunk-brush',
    name: 'Skunk Brush',
    priority: 70,
    chassisLine: 'Lingering miasma leads each cycle.',
    donorLine: 'Miasma graft leaves a lingering hazard behind the payload.',
  },
  'gecko-pads': {
    id: 'gecko-pads',
    name: 'Gecko Pads',
    priority: 65,
    chassisLine: 'Damage pads lead each cycle.',
    donorLine: 'Residue graft plants damage pads at the impact point.',
  },
  'crab-pincers': {
    id: 'crab-pincers',
    name: 'Crab Pincers',
    priority: 60,
    chassisLine: 'Close-range crunches lead each cycle.',
    donorLine: 'Impact graft adds an area crunch at contact.',
  },
  'firefly-colony': {
    id: 'firefly-colony',
    name: 'Firefly Colony',
    priority: 55,
    chassisLine: 'Orbiting contact motes lead each cycle.',
    donorLine: 'Satellite graft adds a refreshed orbiting damage ring.',
  },
  'monarch-brood': {
    id: 'monarch-brood',
    name: 'Monarch Brood',
    priority: 50,
    chassisLine: 'Wide guardian escorts lead each cycle.',
    donorLine: 'Escort graft adds two wide-orbit guardian attacks.',
  },
  'puffer-pouch': {
    id: 'puffer-pouch',
    name: 'Puffer Pouch',
    priority: 40,
    chassisLine: 'A crowd-pulling undertow leads each cycle.',
    donorLine: 'Undertow graft gathers a crowd before the payload lands.',
  },
  'armadillo-greaves': {
    id: 'armadillo-greaves',
    name: 'Armadillo Greaves',
    priority: 35,
    chassisLine: 'Radial recoil shoves lead each cycle.',
    donorLine: 'Recoil graft shoves the survivors away after the payload.',
  },
  'bat-ears': {
    id: 'bat-ears',
    name: 'Bat Ears',
    priority: 30,
    chassisLine: 'Marked targets lead the hunt.',
    donorLine: 'Lock-On graft marks the densest cluster for the payload.',
  },
});

const TEMPERAMENT_COPY: Readonly<Record<string, TemperamentCopy>> = Object.freeze({
  steady: { label: 'Steady', aside: 'It does exactly what it says. Suspicious, frankly.' },
  twitchy: { label: 'Twitchy', aside: 'It has had nine espressos. It is not sorry.' },
  hearty: { label: 'Hearty', aside: 'Big-boned. Built different. Swings like a vending machine.' },
  'long-arm': { label: 'Long-Arm', aside: "Personal space is other people's problem now." },
  compact: { label: 'Compact', aside: "We shrank it in the wash. It's furious and efficient." },
  echo: { label: 'Echo', aside: 'Comes with a free understudy. The understudy is trying its best.' },
  'magnet-hearted': { label: 'Magnet-Hearted', aside: 'Clingy. Enemies find this out too late.' },
  skittish: { label: 'Skittish', aside: 'It would prefer if everyone just... backed up. Thanks.' },
  gilded: { label: 'Gilded', aside: 'The luxury trim package. Heated seats not included.' },
  'doubled-down': { label: 'Doubled-Down', aside: 'Two of everything. The accountant fainted.' },
  bulwark: { label: 'Bulwark', aside: 'It worries about you. Aggressively.' },
  seismic: { label: 'Seismic', aside: 'Terms and conditions now apply to the floor.' },
  prismatic: { label: 'Prismatic', aside: 'It contains multitudes. The multitudes take turns. Mostly.' },
  colossus: { label: 'Colossus', aside: 'We fed it. We may have overfed it.' },
  'apex-whisper': {
    label: 'Apex Whisper',
    aside: 'The committee has merged with the other committee. Pray for the minutes-taker.',
  },
  'show-off': { label: 'Show-Off', aside: 'It will not stop posing. The posing is load-bearing.' },
});

function readText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function readRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Readonly<Record<string, unknown>>;
}

function readIngredientPair(value: unknown): readonly [string, string] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const first = readText(value[0]);
  const second = readText(value[1]);
  if (first === null || second === null) return null;
  return Object.freeze([first, second]);
}

function readPairKind(value: unknown): ChimeraPairKind | null {
  const kind = readText(value)?.toLowerCase();
  if (kind === 'perfect' || kind === 'wild' || kind === 'support') return kind;
  return null;
}

function readFlavorIndex(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}

function titleCaseIdentifier(value: string): string {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter((part) => part.length > 0);
  const title = words
    .map((part) => {
      const lower = part.toLowerCase();
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(' ');
  return title.length > 0 ? title : 'Master Fusion';
}

function resolvePairRoles(ingredients: readonly [string, string]): ResolvedChimeraPairRoles | null {
  const first = CHIMERA_TRAITS[ingredients[0]];
  const second = CHIMERA_TRAITS[ingredients[1]];
  if (first === undefined || second === undefined || first.id === second.id) return null;
  return first.priority >= second.priority
    ? { chassis: first, donor: second }
    : { chassis: second, donor: first };
}

function describeProceduralPair(
  kind: Extract<ChimeraPairKind, 'wild' | 'support'>,
  ingredients: readonly [string, string] | null,
): string {
  const roles = ingredients === null ? null : resolvePairRoles(ingredients);
  const prefix = kind === 'support' ? 'Support Chimera.' : 'Wild Splice.';
  if (roles === null) {
    return kind === 'support'
      ? `${prefix} Two utility Master attacks gain control strength and a damage rider.`
      : `${prefix} Two Master attacks combine into one new attack pattern.`;
  }
  return `${prefix} ${roles.chassis.name} chassis: ${roles.chassis.chassisLine} ${roles.donor.name} donor: ${roles.donor.donorLine}`;
}

/**
 * Normalizes both present-day FusionOfferView values and the planned future
 * fields without requiring the renderer to own a simulation contract.
 */
export function readChimeraFusionOffer(value: unknown): ChimeraFusionOffer {
  const record = readRecord(value);
  const temperamentId = readText(record?.temperamentId)?.toLowerCase() ?? null;
  return Object.freeze({
    evolutionId: readText(record?.evolutionId),
    ingredients: readIngredientPair(record?.ingredients),
    displayName: readText(record?.displayName),
    rarity: readText(record?.rarity),
    temperamentId,
    pairKind: readPairKind(record?.pairKind),
    flavorIndex: readFlavorIndex(record?.flavorIndex),
  });
}

/** Formats known trait ids cleanly while preserving a useful unknown fallback. */
export function formatChimeraTraitName(id: string): string {
  return CHIMERA_TRAITS[id]?.name ?? titleCaseIdentifier(id);
}

/** Returns the deterministic chassis/donor split when both ingredients are known traits. */
export function getChimeraPairRoles(ingredients: unknown): ChimeraPairRoles | null {
  const pair = readIngredientPair(ingredients);
  const roles = pair === null ? null : resolvePairRoles(pair);
  if (roles === null) return null;
  return Object.freeze({
    chassisId: roles.chassis.id,
    chassisName: roles.chassis.name,
    donorId: roles.donor.id,
    donorName: roles.donor.name,
  });
}

/**
 * Builds renderer-only card/detail copy. It never makes gameplay decisions;
 * unknown or older offers receive a deliberately generic, accurate fallback.
 */
export function presentChimeraCopy(value: unknown): ChimeraFusionCopy {
  const offer = readChimeraFusionOffer(value);
  const temperament = offer.temperamentId === null ? undefined : TEMPERAMENT_COPY[offer.temperamentId];
  const title = offer.displayName
    ?? (offer.evolutionId === null ? 'Master Fusion' : titleCaseIdentifier(offer.evolutionId));
  const ingredients = offer.ingredients === null
    ? 'Two Master attacks'
    : `${formatChimeraTraitName(offer.ingredients[0])} + ${formatChimeraTraitName(offer.ingredients[1])}`;

  let description: string;
  if (offer.pairKind === 'wild' || offer.pairKind === 'support') {
    description = describeProceduralPair(offer.pairKind, offer.ingredients);
  } else if (offer.pairKind === 'perfect') {
    description = 'Perfect Pair. This authored fusion combines two Master attacks into one signature attack.';
  } else {
    description = 'A free fusion combines two Master attacks into one permanent attack slot.';
  }

  return Object.freeze({
    evolutionId: offer.evolutionId,
    title,
    ingredients,
    description,
    detail: FUSION_SLOT_DETAIL,
    rarity: offer.rarity === null ? null : titleCaseIdentifier(offer.rarity),
    temperament: temperament?.label ?? (offer.temperamentId === null ? null : titleCaseIdentifier(offer.temperamentId)),
    temperamentAside: temperament?.aside ?? null,
    pairKind: offer.pairKind,
    usesLegacyFallback: offer.pairKind === null,
  });
}
