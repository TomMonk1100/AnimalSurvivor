/**
 * Renderer-only enemy threat language.
 *
 * The simulation remains the authority for enemies, shots, and attack timing.
 * This module only reads the app-owned snapshots and the already-emitted
 * director / trait cues, then distils them into a small, fixed-budget set of
 * high-contrast descriptors for a renderer to draw.  Every animation value is
 * a function of simulation ticks, never wall-clock time or presentation RNG.
 */
import { COMBAT_DAMAGE_SOURCE, idSlot, RUN_ENEMY_ROLE } from '@sim';
import type { RunDirectorEventView, TraitPresentationEventView } from '@sim';
import type { CategorySnapshot, RenderSnapshot } from '../contracts';
import { lerp } from './interpolation';

/** The compact simulation faction copied into projectile snapshot roles. */
export const HOSTILE_PROJECTILE_ROLE = 1;

/**
 * Threats must communicate direction and imminence without becoming a rapid
 * luminance beacon. At the 60 Hz simulation rate this is exactly 0.5 Hz, the
 * global maximum for any persistent VFX breathing loop.
 */
export const ENEMY_THREAT_BREATH_PERIOD_TICKS = 120;

/** The combined fixed descriptor budget for this renderer-only presenter. */
export const MAX_ENEMY_THREAT_PRESENTATION_CAPACITY = 128;

/** Shooter cues are intentionally few; more would turn a swarm into UI noise. */
export const MAX_SHOOTER_WINDUPS = 12;
export const MAX_HOSTILE_PROJECTILE_MUZZLE_POPS = 12;
export const MAX_ENEMY_TELEGRAPHS = 16;
export const MAX_CONTACT_THREAT_RINGS = 8;
export const MAX_ELITE_BOSS_AURAS = 4;

export const SHOOTER_WINDUP_CHARGE_THRESHOLD = 0.55;
export const SHOOTER_INHALE_CHARGE_THRESHOLD = 0.85;
export const SHOOTER_WINDUP_MIN_LENGTH = 26;
export const SHOOTER_WINDUP_MAX_LENGTH = 46;
export const SHOOTER_WINDUP_MIN_THICKNESS = 1.2;
export const SHOOTER_WINDUP_MAX_THICKNESS = 2.1;
export const SHOOTER_WINDUP_MIN_OPACITY = 0.42;
export const SHOOTER_WINDUP_MAX_OPACITY = 0.82;
export const SHOOTER_INHALE_START_RADIUS_PADDING = 14;
export const SHOOTER_INHALE_END_RADIUS_PADDING = 3;
export const SHOOTER_INHALE_MIN_OPACITY = 0.5;
export const SHOOTER_INHALE_MAX_OPACITY = 0.8;
/** Mirrors DEFAULT_CONFIG's 290 preferred range plus its 55 outer band. */
export const DEFAULT_SHOOTER_OUTER_RANGE = 345;

/**
 * The shared scene currently multiplies descriptor head radii by 2.1. Keep
 * that integration stable while asking this presenter for the intended 3.8x
 * effective visual scale.
 */
export const HOSTILE_PROJECTILE_SCENE_CORE_MULTIPLIER = 2.1;
export const HOSTILE_PROJECTILE_TARGET_CORE_MULTIPLIER = 3.8;
export const HOSTILE_PROJECTILE_DESCRIPTOR_HEAD_RADIUS_MULTIPLIER =
  HOSTILE_PROJECTILE_TARGET_CORE_MULTIPLIER / HOSTILE_PROJECTILE_SCENE_CORE_MULTIPLIER;
export const HOSTILE_PROJECTILE_TAIL_MINIMUM_SCENE_WIDTH = 2.4;
export const HOSTILE_PROJECTILE_OPACITY_FLOOR = 0.85;
export const HOSTILE_PROJECTILE_MUZZLE_LIFETIME_TICKS = 8;
export const HOSTILE_PROJECTILE_MUZZLE_GROW_TICKS = 2;
export const HOSTILE_PROJECTILE_MUZZLE_MIN_SCALE = 0.7;
export const HOSTILE_PROJECTILE_MUZZLE_GROW_SCALE = 0.55;
export const HOSTILE_PROJECTILE_MUZZLE_SHRINK_FRACTION = 0.55;

export const CHARGER_PREWARNING_START_TICKS = 150;
export const CHARGER_LUNGE_END_TICKS = 60;
export const CHARGER_LUNGE_TRAVEL_DISTANCE = 88;
export const CHARGER_PREWARNING_MIN_OPACITY = 0.22;
export const CHARGER_PREWARNING_MAX_OPACITY = 0.48;
export const CHARGER_WINDUP_MIN_OPACITY = 0.62;
export const CHARGER_LUNGE_MIN_OPACITY = 0.86;
export const CHARGER_LUNGE_MAX_OPACITY = 0.96;

export const BOSS_TELEGRAPH_SCALE_MULTIPLIER = 1.3;
export const BOSS_TELEGRAPH_OUTLINE_SCALE = 1.08;
export const BOSS_TELEGRAPH_OUTLINE_OPACITY = 0.78;
export const BOSS_TELEGRAPH_OUTLINE_THICKNESS_MULTIPLIER = 0.34;
/** Tick-driven easing prevents a full-arena cue from popping on or off. */
export const STORED_TELEGRAPH_ENTRY_TICKS = 8;
export const STORED_TELEGRAPH_RELEASE_TICKS = 8;
export const ELITE_AURA_OUTLINE_SCALE = 1.08;
export const ELITE_AURA_OUTLINE_OPACITY = 0.64;
export const BOSS_AURA_OUTLINE_OPACITY = 0.76;
export const ELITE_AURA_OUTLINE_THICKNESS = 2.5;
export const BOSS_AURA_OUTLINE_THICKNESS = 3.5;

export const CONTACT_THREAT_DISTANCE_MULTIPLIER = 1.2;
export const CONTACT_THREAT_MAX_OPACITY = 0.48;
export const CONTACT_THREAT_BASE_OPACITY = 0.12;
export const CONTACT_THREAT_URGENCY_OPACITY = 0.3;
export const CONTACT_THREAT_PULSE_OPACITY = 0.03;
export const CONTACT_THREAT_STANDARD_THICKNESS = 2;
export const CONTACT_THREAT_ELITE_THICKNESS = 2.5;
export const CONTACT_THREAT_BOSS_THICKNESS = 3;

export type EnemyThreatPaletteId =
  | 'hostile'
  | 'charger'
  | 'elite'
  | 'boss'
  | 'saltwind'
  | 'support';

/**
 * Bright centers plus near-black outlines keep hazards legible over both the
 * forest and Saltwind floors.  The palette is intentionally independent of
 * cosmetic palettes: red/orange remains reserved for hostile danger.
 */
export interface EnemyThreatPalette {
  readonly core: string;
  readonly primary: string;
  readonly accent: string;
  readonly outline: string;
}

export const ENEMY_THREAT_PALETTES: Readonly<Record<EnemyThreatPaletteId, EnemyThreatPalette>> = Object.freeze({
  hostile: Object.freeze({
    core: '#fff3c9', primary: '#ff5a36', accent: '#ff8b3d', outline: '#3b0b16',
  }),
  charger: Object.freeze({
    core: '#fff0bd', primary: '#ff9d2d', accent: '#ff4d25', outline: '#3a1011',
  }),
  elite: Object.freeze({
    core: '#fff6ce', primary: '#ffc14d', accent: '#ff772f', outline: '#43200c',
  }),
  boss: Object.freeze({
    core: '#fff0d7', primary: '#ff4438', accent: '#ff1f67', outline: '#350711',
  }),
  saltwind: Object.freeze({
    core: '#fff6d2', primary: '#ffb52f', accent: '#ff6e2c', outline: '#452008',
  }),
  support: Object.freeze({
    core: '#e7ffd9', primary: '#55f27d', accent: '#b9ff56', outline: '#10371a',
  }),
});

export type EnemyThreatSeverity = 'contact' | 'charger' | 'elite' | 'boss' | 'support';
export type EnemyTelegraphStyle = 'lane' | 'radial' | 'arrival';
export type EnemyTelegraphSource = 'trait' | 'director' | 'charger';

/** The short, scale-animated source flash attached to a hostile launch. */
export interface HostileProjectileMuzzlePopDescriptor {
  readonly entityId: number;
  readonly x: number;
  readonly y: number;
  readonly ageTicks: number;
  readonly lifetimeTicks: number;
  readonly scale: number;
  readonly palette: 'hostile';
}

/** A projectile is one head and one tail; render them as a ribbon plus core. */
export interface HostileProjectileThreatDescriptor {
  readonly entityId: number;
  /** Optional renderer-side source/family label supplied by the integration. */
  readonly family: string | null;
  /** Optional renderer-side critical flag; it only enlarges the visual core. */
  readonly critical: boolean;
  readonly headX: number;
  readonly headY: number;
  readonly tailX: number;
  readonly tailY: number;
  readonly headingRadians: number;
  readonly headRadius: number;
  readonly tailWidth: number;
  /** Final scene-space width floor for the directional tail. */
  readonly tailMinimumSceneWidth: number;
  readonly opacity: number;
  readonly pulse: number;
  /** Null after the retained, scale-only launch pop expires. */
  readonly muzzlePop: HostileProjectileMuzzlePopDescriptor | null;
  readonly palette: 'hostile';
}

/**
 * One bounded shooter record feeds both a coral aim wedge and, near firing,
 * a contracting inhale ring. It contains no gameplay timing beyond the
 * authoritative snapshot charge.
 */
export interface ShooterWindupDescriptor {
  readonly entityId: number;
  readonly role: number;
  readonly x: number;
  readonly y: number;
  readonly dirX: number;
  readonly dirY: number;
  readonly charge: number;
  readonly wedgeLength: number;
  readonly wedgeThickness: number;
  readonly wedgeOpacity: number;
  readonly inhaleRadius: number;
  readonly inhaleOpacity: number;
  readonly hasInhale: boolean;
  readonly pulse: number;
  readonly palette: 'hostile';
}

/**
 * Optional enrichment for integrations that already project projectile source,
 * crit, or velocity data. It is deliberately read-only and keyed by the
 * generation-safe snapshot entity id, so it cannot affect combat or replay.
 */
export interface HostileProjectileThreatMetadata {
  readonly family?: string;
  readonly critical?: boolean;
  readonly velocityX?: number;
  readonly velocityY?: number;
}

/** A world-space attack warning. A lane uses dir + length; radial/arrival do not. */
export interface EnemyAttackTelegraphDescriptor {
  readonly key: string;
  readonly source: EnemyTelegraphSource;
  readonly severity: EnemyThreatSeverity;
  readonly style: EnemyTelegraphStyle;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly dirX: number;
  readonly dirY: number;
  readonly radius: number;
  readonly length: number;
  readonly thickness: number;
  readonly progress: number;
  readonly opacity: number;
  readonly pulse: number;
  /** Zero means no renderer outline should be emitted for this descriptor. */
  readonly outlineScale: number;
  readonly outlineOpacity: number;
  readonly outlineThickness: number;
  readonly startTick: number;
  readonly expiresAtTick: number;
  readonly palette: EnemyThreatPaletteId;
}

/** A near-contact cue. It is deliberately bounded to avoid outlining a whole swarm. */
export interface EnemyContactThreatRingDescriptor {
  readonly entityId: number;
  readonly severity: EnemyThreatSeverity;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly thickness: number;
  readonly urgency: number;
  readonly opacity: number;
  readonly pulse: number;
  readonly palette: EnemyThreatPaletteId;
}

/** A persistent silhouette distinction for the few enemies that must read first. */
export interface EliteBossThreatAuraDescriptor {
  readonly entityId: number;
  readonly severity: 'elite' | 'boss';
  readonly x: number;
  readonly y: number;
  readonly innerRadius: number;
  readonly outerRadius: number;
  readonly thickness: number;
  readonly healthFraction: number;
  readonly opacity: number;
  readonly pulse: number;
  readonly outlineScale: number;
  readonly outlineOpacity: number;
  readonly outlineThickness: number;
  readonly palette: 'elite' | 'boss';
}

/**
 * Returned buffers are reused on the next update. Renderers should consume
 * them synchronously, exactly as they do trait-presentation event buffers.
 */
export interface EnemyThreatFrame {
  readonly tick: number;
  readonly hostileProjectiles: readonly HostileProjectileThreatDescriptor[];
  readonly shooterWindups: readonly ShooterWindupDescriptor[];
  readonly telegraphs: readonly EnemyAttackTelegraphDescriptor[];
  readonly contactRings: readonly EnemyContactThreatRingDescriptor[];
  readonly eliteBossAuras: readonly EliteBossThreatAuraDescriptor[];
}

export interface EnemyThreatPresentationInput {
  readonly previous: RenderSnapshot;
  readonly current: RenderSnapshot;
  readonly alpha: number;
  readonly directorEvents?: readonly RunDirectorEventView[];
  readonly traitPresentationEvents?: readonly TraitPresentationEventView[];
  /** Optional app-side projectile source/crit/motion projection. */
  readonly hostileProjectileMetadata?: ReadonlyMap<number, HostileProjectileThreatMetadata>;
}

/** Tunable presentation-only budgets; no option can change simulation state. */
export interface EnemyThreatPresentationOptions {
  readonly maxProjectileTrails?: number;
  readonly maxMuzzlePops?: number;
  readonly maxShooterWindups?: number;
  readonly maxTelegraphs?: number;
  readonly maxContactRings?: number;
  readonly maxEliteBossAuras?: number;
  /** Mirrors the current charger's fixed visual wind-up cycle. */
  readonly chargerCycleTicks?: number;
  /** Mirrors the current charger's stationary wind-up duration. */
  readonly chargerWindupTicks?: number;
  /** Current center-to-center firing band for elite, ranged, and denial enemies. */
  readonly shooterOuterRange?: number;
  /** Used only to back-project an authored hostile muzzle by one fixed tick. */
  readonly ticksPerSecond?: number;
  /** Approximate current charger travel during its 36-tick lunge. */
  readonly chargerLungeTravelDistance?: number;
}

export interface EnemyThreatPresentation {
  readonly capacities: Readonly<Required<EnemyThreatPresentationOptions>>;
  /**
   * Reads one render frame and returns bounded, renderer-native descriptors.
   * It never mutates either snapshot or any director/trait event record.
   */
  update(input: EnemyThreatPresentationInput): EnemyThreatFrame;
  /** Clears only renderer-owned cached telegraphs, useful on a run restart. */
  reset(): void;
}

export const DEFAULT_ENEMY_THREAT_CAPACITIES: Readonly<Required<EnemyThreatPresentationOptions>> = Object.freeze({
  maxProjectileTrails: 72,
  maxMuzzlePops: MAX_HOSTILE_PROJECTILE_MUZZLE_POPS,
  maxShooterWindups: MAX_SHOOTER_WINDUPS,
  maxTelegraphs: MAX_ENEMY_TELEGRAPHS,
  maxContactRings: MAX_CONTACT_THREAT_RINGS,
  maxEliteBossAuras: MAX_ELITE_BOSS_AURAS,
  chargerCycleTicks: 180,
  chargerWindupTicks: 24,
  shooterOuterRange: DEFAULT_SHOOTER_OUTER_RANGE,
  ticksPerSecond: 60,
  chargerLungeTravelDistance: CHARGER_LUNGE_TRAVEL_DISTANCE,
});

const EMPTY_DIRECTOR_EVENTS: readonly RunDirectorEventView[] = Object.freeze([]);
const EMPTY_TRAIT_EVENTS: readonly TraitPresentationEventView[] = Object.freeze([]);
const ENTITY_SLOT_COUNT = 0x1_0000;
const EPSILON = 1e-5;

interface TelegraphProfile {
  readonly severity: EnemyThreatSeverity;
  readonly style: EnemyTelegraphStyle;
  readonly label: string;
  readonly lifetimeTicks: number;
  readonly palette: EnemyThreatPaletteId;
}

const TRAIT_TELEGRAPH_PROFILES: Readonly<Record<string, TelegraphProfile>> = Object.freeze({
  'boss-charge': Object.freeze({
    severity: 'boss', style: 'lane', label: 'CHARGE', lifetimeTicks: 36, palette: 'boss',
  }),
  'boss-volley': Object.freeze({
    severity: 'boss', style: 'radial', label: 'VOLLEY', lifetimeTicks: 24, palette: 'boss',
  }),
  'saltwind-charge': Object.freeze({
    severity: 'boss', style: 'lane', label: 'SAND CHARGE', lifetimeTicks: 36, palette: 'saltwind',
  }),
  'saltwind-sandstorm': Object.freeze({
    severity: 'boss', style: 'radial', label: 'SANDSTORM', lifetimeTicks: 24, palette: 'saltwind',
  }),
  'support-pulse': Object.freeze({
    severity: 'support', style: 'radial', label: 'HEAL PULSE', lifetimeTicks: 18, palette: 'support',
  }),
});

const DIRECTOR_TELEGRAPH_PROFILES: Readonly<Record<string, TelegraphProfile>> = Object.freeze({
  eliteWarning: Object.freeze({
    severity: 'elite', style: 'arrival', label: 'ELITE INBOUND', lifetimeTicks: 150, palette: 'elite',
  }),
  eliteRequested: Object.freeze({
    severity: 'elite', style: 'arrival', label: 'ELITE ARRIVED', lifetimeTicks: 72, palette: 'elite',
  }),
  bossWarning: Object.freeze({
    severity: 'boss', style: 'arrival', label: 'APEX INBOUND', lifetimeTicks: 240, palette: 'boss',
  }),
  bossRequested: Object.freeze({
    severity: 'boss', style: 'arrival', label: 'APEX ARRIVED', lifetimeTicks: 120, palette: 'boss',
  }),
});

interface StoredTelegraph {
  active: boolean;
  key: string;
  source: EnemyTelegraphSource;
  severity: EnemyThreatSeverity;
  style: EnemyTelegraphStyle;
  label: string;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  radius: number;
  length: number;
  startTick: number;
  expiresAtTick: number;
  palette: EnemyThreatPaletteId;
}

interface CandidateBuffer {
  readonly indexes: Int32Array;
  readonly scores: Float64Array;
  readonly ids: Int32Array;
  count: number;
}

/** Internal records are reused each frame; public descriptor fields stay readonly. */
type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothRamp(progress: number): number {
  const value = clamp(progress, 0, 1);
  return value * value * (3 - 2 * value);
}

/**
 * Stored events can enter or leave between two rendered frames. Ease both
 * edges from their authoritative tick bounds so the threat remains truthful
 * without becoming a full-screen luminance step.
 */
function storedTelegraphEnvelope(tick: number, startTick: number, expiresAtTick: number): number {
  const entry = smoothRamp((tick - startTick + 1) / STORED_TELEGRAPH_ENTRY_TICKS);
  const release = smoothRamp((expiresAtTick - tick + 1) / STORED_TELEGRAPH_RELEASE_TICKS);
  return Math.min(entry, release);
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function safeInteger(value: number, fallback: number): number {
  return Number.isSafeInteger(value) ? value : fallback;
}

function boundedCapacity(
  value: number | undefined,
  fallback: number,
  maximum = MAX_ENEMY_THREAT_PRESENTATION_CAPACITY,
): number {
  const numeric = value === undefined ? fallback : value;
  return clamp(Math.floor(finite(numeric, fallback)), 1, maximum);
}

function boundedPositive(value: number | undefined, fallback: number, maximum: number): number {
  const numeric = value === undefined ? fallback : value;
  return clamp(Math.floor(finite(numeric, fallback)), 1, maximum);
}

/** A deterministic triangle pulse: expressive without a wall-clock dependency. */
function trianglePulse(tick: number, seed: number, period: number): number {
  const safePeriod = Math.max(1, Math.floor(period));
  const raw = ((safeInteger(tick, 0) + safeInteger(seed, 0)) % safePeriod + safePeriod) % safePeriod;
  const normalized = raw / safePeriod;
  return 1 - Math.abs(normalized * 2 - 1);
}

function roleSeverity(role: number): EnemyThreatSeverity {
  if (role === RUN_ENEMY_ROLE.boss) return 'boss';
  if (role === RUN_ENEMY_ROLE.elite) return 'elite';
  if (role === RUN_ENEMY_ROLE.charger) return 'charger';
  if (role === RUN_ENEMY_ROLE.support) return 'support';
  return 'contact';
}

function paletteForRole(role: number): EnemyThreatPaletteId {
  if (role === RUN_ENEMY_ROLE.boss) return 'boss';
  if (role === RUN_ENEMY_ROLE.elite) return 'elite';
  if (role === RUN_ENEMY_ROLE.charger) return 'charger';
  if (role === RUN_ENEMY_ROLE.support) return 'support';
  return 'hostile';
}

/**
 * The render snapshot carries only the compact, authoritative source code.
 * Keep the translation here rather than teaching the simulation about a
 * renderer vocabulary. Integrations may still override it with a richer
 * cosmetic family map when one is available.
 */
function projectileFamilyFromSource(source: number): string | null {
  if (source === COMBAT_DAMAGE_SOURCE.heroSpit) return 'gracie-spit';
  if (source === COMBAT_DAMAGE_SOURCE.traitProjectile) return 'trait-projectile';
  if (source === COMBAT_DAMAGE_SOURCE.enemyProjectile) return 'enemy-projectile';
  return null;
}

function priorityForRole(role: number): number {
  if (role === RUN_ENEMY_ROLE.boss) return 6;
  if (role === RUN_ENEMY_ROLE.elite) return 5;
  if (role === RUN_ENEMY_ROLE.charger) return 4;
  if (role === RUN_ENEMY_ROLE.ranged || role === RUN_ENEMY_ROLE.denial) return 3;
  if (role === RUN_ENEMY_ROLE.flanker || role === RUN_ENEMY_ROLE.support) return 2;
  return 1;
}

function isShooterRole(role: number): boolean {
  return role === RUN_ENEMY_ROLE.elite
    || role === RUN_ENEMY_ROLE.ranged
    || role === RUN_ENEMY_ROLE.denial;
}

function insertCandidate(buffer: CandidateBuffer, index: number, score: number, id: number): void {
  let insertion = buffer.count;
  for (let cursor = 0; cursor < buffer.count; cursor++) {
    const existingScore = buffer.scores[cursor]!;
    const existingId = buffer.ids[cursor]!;
    if (score < existingScore || (score === existingScore && id < existingId)) {
      insertion = cursor;
      break;
    }
  }
  if (insertion >= buffer.indexes.length) return;
  const end = Math.min(buffer.count, buffer.indexes.length - 1);
  for (let cursor = end; cursor > insertion; cursor--) {
    buffer.indexes[cursor] = buffer.indexes[cursor - 1]!;
    buffer.scores[cursor] = buffer.scores[cursor - 1]!;
    buffer.ids[cursor] = buffer.ids[cursor - 1]!;
  }
  buffer.indexes[insertion] = index;
  buffer.scores[insertion] = score;
  buffer.ids[insertion] = id;
  if (buffer.count < buffer.indexes.length) buffer.count++;
}

function resetCandidates(buffer: CandidateBuffer): void {
  buffer.count = 0;
}

function makeStoredTelegraph(): StoredTelegraph {
  return {
    active: false,
    key: '',
    source: 'trait',
    severity: 'contact',
    style: 'radial',
    label: '',
    x: 0,
    y: 0,
    dirX: 1,
    dirY: 0,
    radius: 0,
    length: 0,
    startTick: 0,
    expiresAtTick: 0,
    palette: 'hostile',
  };
}

function makeProjectileDescriptor(): Mutable<HostileProjectileThreatDescriptor> {
  return {
    entityId: 0,
    family: null,
    critical: false,
    headX: 0,
    headY: 0,
    tailX: 0,
    tailY: 0,
    headingRadians: 0,
    headRadius: 0,
    tailWidth: 0,
    tailMinimumSceneWidth: HOSTILE_PROJECTILE_TAIL_MINIMUM_SCENE_WIDTH,
    opacity: 0,
    pulse: 0,
    muzzlePop: null,
    palette: 'hostile',
  };
}

function makeMuzzlePopDescriptor(): Mutable<HostileProjectileMuzzlePopDescriptor> {
  return {
    entityId: 0,
    x: 0,
    y: 0,
    ageTicks: 0,
    lifetimeTicks: HOSTILE_PROJECTILE_MUZZLE_LIFETIME_TICKS,
    scale: 0,
    palette: 'hostile',
  };
}

function makeShooterWindupDescriptor(): Mutable<ShooterWindupDescriptor> {
  return {
    entityId: 0,
    role: RUN_ENEMY_ROLE.ranged,
    x: 0,
    y: 0,
    dirX: 1,
    dirY: 0,
    charge: 0,
    wedgeLength: SHOOTER_WINDUP_MIN_LENGTH,
    wedgeThickness: SHOOTER_WINDUP_MIN_THICKNESS,
    wedgeOpacity: SHOOTER_WINDUP_MIN_OPACITY,
    inhaleRadius: 0,
    inhaleOpacity: 0,
    hasInhale: false,
    pulse: 0,
    palette: 'hostile',
  };
}

function makeTelegraphDescriptor(): Mutable<EnemyAttackTelegraphDescriptor> {
  return {
    key: '',
    source: 'trait',
    severity: 'contact',
    style: 'radial',
    label: '',
    x: 0,
    y: 0,
    dirX: 1,
    dirY: 0,
    radius: 0,
    length: 0,
    thickness: 0,
    progress: 0,
    opacity: 0,
    pulse: 0,
    outlineScale: 0,
    outlineOpacity: 0,
    outlineThickness: 0,
    startTick: 0,
    expiresAtTick: 0,
    palette: 'hostile',
  };
}

function makeContactDescriptor(): Mutable<EnemyContactThreatRingDescriptor> {
  return {
    entityId: 0,
    severity: 'contact',
    x: 0,
    y: 0,
    radius: 0,
    thickness: 0,
    urgency: 0,
    opacity: 0,
    pulse: 0,
    palette: 'hostile',
  };
}

function makeAuraDescriptor(): Mutable<EliteBossThreatAuraDescriptor> {
  return {
    entityId: 0,
    severity: 'elite',
    x: 0,
    y: 0,
    innerRadius: 0,
    outerRadius: 0,
    thickness: 0,
    healthFraction: 1,
    opacity: 0,
    pulse: 0,
    outlineScale: 0,
    outlineOpacity: 0,
    outlineThickness: 0,
    palette: 'elite',
  };
}

/**
 * Builds the full threat presentation from data that has already crossed the
 * simulation-to-renderer boundary.  It intentionally has no simulation object
 * parameter and exposes no callback back into gameplay.
 */
export function createEnemyThreatPresentation(
  options: EnemyThreatPresentationOptions = {},
): EnemyThreatPresentation {
  const capacities: Required<EnemyThreatPresentationOptions> = Object.freeze({
    maxProjectileTrails: boundedCapacity(
      options.maxProjectileTrails,
      DEFAULT_ENEMY_THREAT_CAPACITIES.maxProjectileTrails,
    ),
    maxMuzzlePops: boundedCapacity(
      options.maxMuzzlePops,
      DEFAULT_ENEMY_THREAT_CAPACITIES.maxMuzzlePops,
      MAX_HOSTILE_PROJECTILE_MUZZLE_POPS,
    ),
    maxShooterWindups: boundedCapacity(
      options.maxShooterWindups,
      DEFAULT_ENEMY_THREAT_CAPACITIES.maxShooterWindups,
      MAX_SHOOTER_WINDUPS,
    ),
    maxTelegraphs: boundedCapacity(
      options.maxTelegraphs,
      DEFAULT_ENEMY_THREAT_CAPACITIES.maxTelegraphs,
      MAX_ENEMY_TELEGRAPHS,
    ),
    maxContactRings: boundedCapacity(
      options.maxContactRings,
      DEFAULT_ENEMY_THREAT_CAPACITIES.maxContactRings,
      MAX_CONTACT_THREAT_RINGS,
    ),
    maxEliteBossAuras: boundedCapacity(
      options.maxEliteBossAuras,
      DEFAULT_ENEMY_THREAT_CAPACITIES.maxEliteBossAuras,
      MAX_ELITE_BOSS_AURAS,
    ),
    chargerCycleTicks: boundedPositive(
      options.chargerCycleTicks,
      DEFAULT_ENEMY_THREAT_CAPACITIES.chargerCycleTicks,
      4096,
    ),
    chargerWindupTicks: boundedPositive(
      options.chargerWindupTicks,
      DEFAULT_ENEMY_THREAT_CAPACITIES.chargerWindupTicks,
      1024,
    ),
    shooterOuterRange: boundedPositive(
      options.shooterOuterRange,
      DEFAULT_ENEMY_THREAT_CAPACITIES.shooterOuterRange,
      4096,
    ),
    ticksPerSecond: boundedPositive(
      options.ticksPerSecond,
      DEFAULT_ENEMY_THREAT_CAPACITIES.ticksPerSecond,
      4096,
    ),
    chargerLungeTravelDistance: boundedPositive(
      options.chargerLungeTravelDistance,
      DEFAULT_ENEMY_THREAT_CAPACITIES.chargerLungeTravelDistance,
      4096,
    ),
  });
  const totalDescriptorCapacity =
    capacities.maxProjectileTrails
    + capacities.maxMuzzlePops
    + capacities.maxShooterWindups
    + capacities.maxTelegraphs
    + capacities.maxContactRings
    + capacities.maxEliteBossAuras;
  if (totalDescriptorCapacity > MAX_ENEMY_THREAT_PRESENTATION_CAPACITY) {
    throw new RangeError(
      `enemy threat descriptor capacity ${totalDescriptorCapacity} exceeds ${MAX_ENEMY_THREAT_PRESENTATION_CAPACITY}`,
    );
  }
  const reservedChargerTelegraphs = Math.min(
    8,
    Math.max(1, Math.floor(capacities.maxTelegraphs / 4)),
  );
  // Stored cues keep the full fixed pool, while output assembly spends the
  // reserved charger quota first. That protects an active lunge warning
  // without wasting a slot on frames where no charger is winding up.
  const storedTelegraphCapacity = capacities.maxTelegraphs;
  const storedTelegraphs = Array.from(
    { length: storedTelegraphCapacity },
    makeStoredTelegraph,
  );
  // Projectile ids are generation-packed, so slot-indexed stamps give us the
  // same previous-snapshot lookup without allocating/churning a Map each
  // render frame. The full id comparison below rejects a recycled slot.
  const previousProjectileSlotStamp = new Uint32Array(ENTITY_SLOT_COUNT);
  const previousProjectileSlotIndex = new Int32Array(ENTITY_SLOT_COUNT);
  let previousProjectileVersion = 0;
  // Full generation-packed projectile ids retain an eight-tick muzzle pop.
  // A recycled pool slot gets a new pop rather than inheriting stale state.
  const projectileMuzzleSeen = new Uint8Array(ENTITY_SLOT_COUNT);
  const projectileMuzzleIdBySlot = new Int32Array(ENTITY_SLOT_COUNT);
  const projectileMuzzleSpawnTickBySlot = new Int32Array(ENTITY_SLOT_COUNT);
  const previousEnemySlotStamp = new Uint32Array(ENTITY_SLOT_COUNT);
  const previousEnemySlotIndex = new Int32Array(ENTITY_SLOT_COUNT);
  let previousEnemyVersion = 0;
  const projectileCandidates: CandidateBuffer = {
    indexes: new Int32Array(capacities.maxProjectileTrails),
    scores: new Float64Array(capacities.maxProjectileTrails),
    ids: new Int32Array(capacities.maxProjectileTrails),
    count: 0,
  };
  const shooterCandidates: CandidateBuffer = {
    indexes: new Int32Array(capacities.maxShooterWindups),
    scores: new Float64Array(capacities.maxShooterWindups),
    ids: new Int32Array(capacities.maxShooterWindups),
    count: 0,
  };
  const contactCandidates: CandidateBuffer = {
    indexes: new Int32Array(capacities.maxContactRings),
    scores: new Float64Array(capacities.maxContactRings),
    ids: new Int32Array(capacities.maxContactRings),
    count: 0,
  };
  const auraCandidates: CandidateBuffer = {
    indexes: new Int32Array(capacities.maxEliteBossAuras),
    scores: new Float64Array(capacities.maxEliteBossAuras),
    ids: new Int32Array(capacities.maxEliteBossAuras),
    count: 0,
  };
  const projectileStorage = Array.from({ length: capacities.maxProjectileTrails }, makeProjectileDescriptor);
  const muzzlePopStorage = Array.from({ length: capacities.maxProjectileTrails }, makeMuzzlePopDescriptor);
  const shooterWindupStorage = Array.from({ length: capacities.maxShooterWindups }, makeShooterWindupDescriptor);
  const telegraphStorage = Array.from({ length: capacities.maxTelegraphs }, makeTelegraphDescriptor);
  const contactStorage = Array.from({ length: capacities.maxContactRings }, makeContactDescriptor);
  const auraStorage = Array.from({ length: capacities.maxEliteBossAuras }, makeAuraDescriptor);
  const hostileProjectiles: HostileProjectileThreatDescriptor[] = [];
  const shooterWindups: ShooterWindupDescriptor[] = [];
  const telegraphs: EnemyAttackTelegraphDescriptor[] = [];
  const contactRings: EnemyContactThreatRingDescriptor[] = [];
  const eliteBossAuras: EliteBossThreatAuraDescriptor[] = [];
  const frame: Mutable<EnemyThreatFrame> = {
    tick: 0,
    hostileProjectiles,
    shooterWindups,
    telegraphs,
    contactRings,
    eliteBossAuras,
  };
  // Charger descriptors are rebuilt each frame and no renderer consumes their
  // key. Keep a stable constant rather than allocating a template string in
  // the fixed render loop; source/startTick supply the deterministic identity.
  const chargerTelegraphKey = 'charger';
  let lastTick = -1;

  function clearCachedTelegraphs(): void {
    for (let index = 0; index < storedTelegraphs.length; index++) {
      storedTelegraphs[index]!.active = false;
    }
  }

  function queueTelegraph(
    key: string,
    source: EnemyTelegraphSource,
    severity: EnemyThreatSeverity,
    style: EnemyTelegraphStyle,
    label: string,
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    radius: number,
    length: number,
    startTick: number,
    expiresAtTick: number,
    palette: EnemyThreatPaletteId,
  ): void {
    for (let index = 0; index < storedTelegraphs.length; index++) {
      const current = storedTelegraphs[index]!;
      if (current.active && current.key === key) return;
    }
    let selected = -1;
    let earliestExpiry = Number.POSITIVE_INFINITY;
    for (let index = 0; index < storedTelegraphs.length; index++) {
      const current = storedTelegraphs[index]!;
      if (!current.active) {
        selected = index;
        break;
      }
      if (current.expiresAtTick < earliestExpiry) {
        earliestExpiry = current.expiresAtTick;
        selected = index;
      }
    }
    if (selected < 0) return;
    const destination = storedTelegraphs[selected]!;
    destination.active = true;
    destination.key = key;
    destination.source = source;
    destination.severity = severity;
    destination.style = style;
    destination.label = label;
    destination.x = x;
    destination.y = y;
    destination.dirX = dirX;
    destination.dirY = dirY;
    destination.radius = radius;
    destination.length = length;
    destination.startTick = startTick;
    destination.expiresAtTick = expiresAtTick;
    destination.palette = palette;
  }

  function pruneTelegraphs(tick: number): void {
    for (let index = 0; index < storedTelegraphs.length; index++) {
      const stored = storedTelegraphs[index]!;
      if (stored.active && tick > stored.expiresAtTick) stored.active = false;
    }
  }

  function queueTraitTelegraphs(events: readonly TraitPresentationEventView[]): void {
    for (let index = 0; index < events.length; index++) {
      const event = events[index]!;
      if (event.kind !== 'telegraph') continue;
      const tag = event.tag ?? '';
      const profile = TRAIT_TELEGRAPH_PROFILES[tag];
      if (profile === undefined) continue;
      const startTick = safeInteger(event.tick, 0);
      const duration = boundedPositive(event.durationTicks, profile.lifetimeTicks, 240);
      let dirX = finite(event.dirX, 1);
      let dirY = finite(event.dirY, 0);
      const directionLength = Math.hypot(dirX, dirY);
      if (directionLength <= EPSILON) {
        dirX = 1;
        dirY = 0;
      } else {
        dirX /= directionLength;
        dirY /= directionLength;
      }
      const radius = clamp(finite(event.radius, 96), 18, 480);
      queueTelegraph(
        `trait|${event.sourceId}|${tag}|${startTick}|${finite(event.originX, 0)}|${finite(event.originY, 0)}`,
        'trait', profile.severity, profile.style, profile.label,
        finite(event.originX, 0), finite(event.originY, 0), dirX, dirY,
        radius, profile.style === 'lane' ? clamp(radius * 1.5, 80, 480) : radius,
        startTick, startTick + duration, profile.palette,
      );
    }
  }

  function queueDirectorTelegraphs(
    events: readonly RunDirectorEventView[],
    current: RenderSnapshot,
  ): void {
    for (let index = 0; index < events.length; index++) {
      const event = events[index]!;
      const profile = DIRECTOR_TELEGRAPH_PROFILES[event.kind];
      if (profile === undefined) continue;
      const startTick = safeInteger(event.tick, current.tick);
      const radius = profile.severity === 'boss' ? 154 : 96;
      queueTelegraph(
        `director|${event.seq}|${event.kind}|${startTick}`,
        'director', profile.severity, profile.style, profile.label,
        finite(current.playerX, 0), finite(current.playerY, 0), 1, 0,
        radius, radius, startTick, startTick + profile.lifetimeTicks, profile.palette,
      );
    }
  }

  function nextPreviousProjectileVersion(): number {
    previousProjectileVersion = (previousProjectileVersion + 1) >>> 0;
    if (previousProjectileVersion === 0) {
      previousProjectileSlotStamp.fill(0);
      previousProjectileVersion = 1;
    }
    return previousProjectileVersion;
  }

  function indexPreviousProjectileSlots(snapshot: CategorySnapshot): number {
    const version = nextPreviousProjectileVersion();
    for (let index = 0; index < snapshot.count; index++) {
      const id = snapshot.id[index]!;
      const slot = idSlot(id);
      previousProjectileSlotStamp[slot] = version;
      previousProjectileSlotIndex[slot] = index;
    }
    return version;
  }

  function previousProjectileIndexFor(
    snapshot: CategorySnapshot,
    id: number,
    version: number,
  ): number {
    const slot = idSlot(id);
    if (previousProjectileSlotStamp[slot] !== version) return -1;
    const index = previousProjectileSlotIndex[slot]!;
    return snapshot.id[index] === id ? index : -1;
  }

  function clearProjectileMuzzleHistory(): void {
    projectileMuzzleSeen.fill(0);
    projectileMuzzleIdBySlot.fill(0);
    projectileMuzzleSpawnTickBySlot.fill(0);
  }

  /**
   * Observe all current hostile projectiles before the visible nearest-N
   * selection. That makes projectile admission order unable to fabricate a
   * late muzzle pop when a far shot eventually moves into the render budget.
   */
  function observeHostileProjectileMuzzles(snapshot: CategorySnapshot, tick: number): void {
    for (let index = 0; index < snapshot.count; index++) {
      if (snapshot.role[index] !== HOSTILE_PROJECTILE_ROLE) continue;
      const id = snapshot.id[index]!;
      const slot = idSlot(id);
      if (projectileMuzzleSeen[slot] === 1 && projectileMuzzleIdBySlot[slot] === id) continue;
      projectileMuzzleSeen[slot] = 1;
      projectileMuzzleIdBySlot[slot] = id;
      projectileMuzzleSpawnTickBySlot[slot] = tick;
    }
  }

  function muzzleAgeTicksFor(id: number, tick: number): number {
    const slot = idSlot(id);
    if (projectileMuzzleSeen[slot] !== 1 || projectileMuzzleIdBySlot[slot] !== id) return -1;
    return Math.max(0, tick - projectileMuzzleSpawnTickBySlot[slot]!);
  }

  function nextPreviousEnemyVersion(): number {
    previousEnemyVersion = (previousEnemyVersion + 1) >>> 0;
    if (previousEnemyVersion === 0) {
      previousEnemySlotStamp.fill(0);
      previousEnemyVersion = 1;
    }
    return previousEnemyVersion;
  }

  function indexPreviousEnemySlots(snapshot: CategorySnapshot): number {
    const version = nextPreviousEnemyVersion();
    for (let index = 0; index < snapshot.count; index++) {
      const id = snapshot.id[index]!;
      const slot = idSlot(id);
      previousEnemySlotStamp[slot] = version;
      previousEnemySlotIndex[slot] = index;
    }
    return version;
  }

  function previousEnemyIndexFor(
    snapshot: CategorySnapshot,
    id: number,
    version: number,
  ): number {
    const slot = idSlot(id);
    if (previousEnemySlotStamp[slot] !== version) return -1;
    const index = previousEnemySlotIndex[slot]!;
    return snapshot.id[index] === id ? index : -1;
  }

  function fillShooterWindups(current: RenderSnapshot): void {
    shooterWindups.length = 0;
    resetCandidates(shooterCandidates);
    const playerX = finite(current.playerX, 0);
    const playerY = finite(current.playerY, 0);
    const outerRangeSquared = capacities.shooterOuterRange * capacities.shooterOuterRange;
    const enemies = current.enemies;
    for (let index = 0; index < enemies.count; index++) {
      const role = enemies.role[index]!;
      if (!isShooterRole(role)) continue;
      const charge = clamp(finite(enemies.attackCharge[index]!, 0), 0, 1);
      if (charge < SHOOTER_WINDUP_CHARGE_THRESHOLD) continue;
      const x = finite(enemies.x[index]!, playerX);
      const y = finite(enemies.y[index]!, playerY);
      const dx = x - playerX;
      const dy = y - playerY;
      const distanceSquared = dx * dx + dy * dy;
      // The combat cooldown freezes outside this exact outer firing band.
      // Without this guard an old high charge would become an orphan cue.
      if (distanceSquared > outerRangeSquared) continue;
      insertCandidate(shooterCandidates, index, distanceSquared, enemies.id[index]!);
    }
    for (let candidate = 0; candidate < shooterCandidates.count; candidate++) {
      const index = shooterCandidates.indexes[candidate]!;
      const id = enemies.id[index]!;
      const role = enemies.role[index]!;
      const x = finite(enemies.x[index]!, playerX);
      const y = finite(enemies.y[index]!, playerY);
      const aimX = playerX - x;
      const aimY = playerY - y;
      const aimLength = Math.hypot(aimX, aimY);
      const dirX = aimLength > EPSILON ? aimX / aimLength : 1;
      const dirY = aimLength > EPSILON ? aimY / aimLength : 0;
      const charge = clamp(finite(enemies.attackCharge[index]!, 0), 0, 1);
      const normalizedCharge = clamp(
        (charge - SHOOTER_WINDUP_CHARGE_THRESHOLD)
          / Math.max(EPSILON, 1 - SHOOTER_WINDUP_CHARGE_THRESHOLD),
        0,
        1,
      );
      const inhaleProgress = clamp(
        (charge - SHOOTER_INHALE_CHARGE_THRESHOLD)
          / Math.max(EPSILON, 1 - SHOOTER_INHALE_CHARGE_THRESHOLD),
        0,
        1,
      );
      const hasInhale = charge >= SHOOTER_INHALE_CHARGE_THRESHOLD;
      const radius = Math.max(0, finite(enemies.radius[index]!, 0));
      const descriptor = shooterWindupStorage[candidate]!;
      descriptor.entityId = id;
      descriptor.role = role;
      descriptor.x = x;
      descriptor.y = y;
      descriptor.dirX = dirX;
      descriptor.dirY = dirY;
      descriptor.charge = charge;
      descriptor.wedgeLength = lerp(
        SHOOTER_WINDUP_MIN_LENGTH,
        SHOOTER_WINDUP_MAX_LENGTH,
        normalizedCharge,
      );
      descriptor.wedgeThickness = lerp(
        SHOOTER_WINDUP_MIN_THICKNESS,
        SHOOTER_WINDUP_MAX_THICKNESS,
        normalizedCharge,
      );
      descriptor.wedgeOpacity = lerp(
        SHOOTER_WINDUP_MIN_OPACITY,
        SHOOTER_WINDUP_MAX_OPACITY,
        normalizedCharge,
      );
      descriptor.inhaleRadius = hasInhale
        ? radius + lerp(
          SHOOTER_INHALE_START_RADIUS_PADDING,
          SHOOTER_INHALE_END_RADIUS_PADDING,
          inhaleProgress,
        )
        : 0;
      descriptor.inhaleOpacity = hasInhale
        ? lerp(SHOOTER_INHALE_MIN_OPACITY, SHOOTER_INHALE_MAX_OPACITY, inhaleProgress)
        : 0;
      descriptor.hasInhale = hasInhale;
      descriptor.pulse = trianglePulse(current.tick, id, ENEMY_THREAT_BREATH_PERIOD_TICKS);
      descriptor.palette = 'hostile';
      shooterWindups.push(descriptor);
    }
  }

  function fillProjectileDescriptors(
    previous: RenderSnapshot,
    current: RenderSnapshot,
    alpha: number,
    metadataById: ReadonlyMap<number, HostileProjectileThreatMetadata> | undefined,
  ): void {
    hostileProjectiles.length = 0;
    resetCandidates(projectileCandidates);
    const previousVersion = indexPreviousProjectileSlots(previous.projectiles);
    observeHostileProjectileMuzzles(current.projectiles, current.tick);
    const playerX = finite(current.playerX, 0);
    const playerY = finite(current.playerY, 0);
    for (let index = 0; index < current.projectiles.count; index++) {
      if (current.projectiles.role[index] !== HOSTILE_PROJECTILE_ROLE) continue;
      const dx = finite(current.projectiles.x[index]!, playerX) - playerX;
      const dy = finite(current.projectiles.y[index]!, playerY) - playerY;
      insertCandidate(projectileCandidates, index, dx * dx + dy * dy, current.projectiles.id[index]!);
    }
    const blend = clamp(finite(alpha, 1), 0, 1);
    let activeMuzzlePops = 0;
    for (let candidate = 0; candidate < projectileCandidates.count; candidate++) {
      const index = projectileCandidates.indexes[candidate]!;
      const id = current.projectiles.id[index]!;
      const previousIndex = previousProjectileIndexFor(previous.projectiles, id, previousVersion);
      const currentX = finite(current.projectiles.x[index]!, 0);
      const currentY = finite(current.projectiles.y[index]!, 0);
      const priorX = previousIndex === -1 ? currentX : finite(previous.projectiles.x[previousIndex]!, currentX);
      const priorY = previousIndex === -1 ? currentY : finite(previous.projectiles.y[previousIndex]!, currentY);
      const headX = lerp(priorX, currentX, blend);
      const headY = lerp(priorY, currentY, blend);
      const metadata = metadataById?.get(id);
      const projectedVelocityX = metadata?.velocityX ?? current.projectiles.velocityX[index];
      const projectedVelocityY = metadata?.velocityY ?? current.projectiles.velocityY[index];
      const hasProjectedVelocity = Number.isFinite(projectedVelocityX) && Number.isFinite(projectedVelocityY);
      const velocityX = hasProjectedVelocity ? projectedVelocityX! : currentX - priorX;
      const velocityY = hasProjectedVelocity ? projectedVelocityY! : currentY - priorY;
      const velocityLength = Math.hypot(velocityX, velocityY);
      const directionX = velocityLength > EPSILON ? velocityX / velocityLength : 0;
      const directionY = velocityLength > EPSILON ? velocityY / velocityLength : 0;
      const tailLength = velocityLength > EPSILON ? clamp(velocityLength * 2.8, 5, 30) : 0;
      const descriptor = projectileStorage[candidate]!;
      const baseRadius = Math.max(2.8, finite(current.projectiles.radius[index]!, 3) * 1.32);
      const pulse = trianglePulse(current.tick, id, ENEMY_THREAT_BREATH_PERIOD_TICKS);
      const family = metadata?.family?.trim()
        || projectileFamilyFromSource(current.projectiles.source[index] ?? 0);
      const critical = metadata?.critical ?? current.projectiles.critical[index] === 1;
      descriptor.entityId = id;
      descriptor.family = family;
      descriptor.critical = critical;
      descriptor.headX = headX;
      descriptor.headY = headY;
      descriptor.tailX = headX - directionX * tailLength;
      descriptor.tailY = headY - directionY * tailLength;
      descriptor.headingRadians = velocityLength > EPSILON ? Math.atan2(directionY, directionX) : 0;
      descriptor.headRadius = baseRadius
        * HOSTILE_PROJECTILE_DESCRIPTOR_HEAD_RADIUS_MULTIPLIER
        * (critical ? 1.24 : 1)
        * (0.98 + pulse * 0.04);
      descriptor.tailWidth = baseRadius * 0.72;
      descriptor.tailMinimumSceneWidth = HOSTILE_PROJECTILE_TAIL_MINIMUM_SCENE_WIDTH;
      descriptor.opacity = HOSTILE_PROJECTILE_OPACITY_FLOOR + pulse * 0.06;
      descriptor.pulse = pulse;
      const muzzleAgeTicks = muzzleAgeTicksFor(id, current.tick);
      if (
        muzzleAgeTicks >= 0
        && muzzleAgeTicks < HOSTILE_PROJECTILE_MUZZLE_LIFETIME_TICKS
        && activeMuzzlePops < capacities.maxMuzzlePops
      ) {
        const muzzle = muzzlePopStorage[candidate]!;
        const growProgress = clamp(
          (muzzleAgeTicks + 1) / HOSTILE_PROJECTILE_MUZZLE_GROW_TICKS,
          0,
          1,
        );
        const shrinkProgress = clamp(
          (muzzleAgeTicks - HOSTILE_PROJECTILE_MUZZLE_GROW_TICKS)
            / Math.max(1, HOSTILE_PROJECTILE_MUZZLE_LIFETIME_TICKS - HOSTILE_PROJECTILE_MUZZLE_GROW_TICKS),
          0,
          1,
        );
        const backtrackTicks = 1 / capacities.ticksPerSecond;
        muzzle.entityId = id;
        muzzle.x = currentX - velocityX * backtrackTicks;
        muzzle.y = currentY - velocityY * backtrackTicks;
        muzzle.ageTicks = muzzleAgeTicks;
        muzzle.lifetimeTicks = HOSTILE_PROJECTILE_MUZZLE_LIFETIME_TICKS;
        muzzle.scale = baseRadius
          * (HOSTILE_PROJECTILE_MUZZLE_MIN_SCALE + HOSTILE_PROJECTILE_MUZZLE_GROW_SCALE * growProgress)
          * (1 - HOSTILE_PROJECTILE_MUZZLE_SHRINK_FRACTION * shrinkProgress);
        muzzle.palette = 'hostile';
        descriptor.muzzlePop = muzzle;
        activeMuzzlePops++;
      } else {
        descriptor.muzzlePop = null;
      }
      descriptor.palette = 'hostile';
      hostileProjectiles.push(descriptor);
    }
  }

  function appendStoredTelegraphs(tick: number): void {
    for (let index = 0; index < storedTelegraphs.length; index++) {
      const stored = storedTelegraphs[index]!;
      if (!stored.active || telegraphs.length >= capacities.maxTelegraphs) continue;
      const duration = Math.max(1, stored.expiresAtTick - stored.startTick);
      const progress = clamp((tick - stored.startTick) / duration, 0, 1);
      const pulse = trianglePulse(tick, stored.startTick, ENEMY_THREAT_BREATH_PERIOD_TICKS);
      const isBossAttack = stored.severity === 'boss'
        && (stored.style === 'lane' || stored.style === 'radial');
      const envelope = storedTelegraphEnvelope(tick, stored.startTick, stored.expiresAtTick);
      const scaleMultiplier = isBossAttack ? BOSS_TELEGRAPH_SCALE_MULTIPLIER : 1;
      const baseRadius = stored.radius
        * (stored.style === 'arrival' ? 0.72 + progress * 0.42 : 0.86 + progress * 0.14);
      const baseThickness = clamp(
        stored.radius * (stored.severity === 'boss' ? 0.056 : 0.045),
        2,
        14,
      );
      const descriptor = telegraphStorage[telegraphs.length]!;
      descriptor.key = stored.key;
      descriptor.source = stored.source;
      descriptor.severity = stored.severity;
      descriptor.style = stored.style;
      descriptor.label = stored.label;
      descriptor.x = stored.x;
      descriptor.y = stored.y;
      descriptor.dirX = stored.dirX;
      descriptor.dirY = stored.dirY;
      descriptor.radius = baseRadius * scaleMultiplier;
      descriptor.length = stored.length * scaleMultiplier;
      descriptor.thickness = baseThickness * scaleMultiplier;
      descriptor.progress = progress;
      descriptor.opacity = clamp(
        (stored.severity === 'boss' ? 0.7 : 0.58)
          * (0.94 + pulse * 0.06)
          * (1 - progress * 0.08)
          * envelope,
        0,
        1,
      );
      descriptor.pulse = pulse;
      descriptor.outlineScale = isBossAttack ? BOSS_TELEGRAPH_OUTLINE_SCALE : 0;
      descriptor.outlineOpacity = isBossAttack ? BOSS_TELEGRAPH_OUTLINE_OPACITY * envelope : 0;
      descriptor.outlineThickness = isBossAttack
        ? descriptor.thickness * BOSS_TELEGRAPH_OUTLINE_THICKNESS_MULTIPLIER
        : 0;
      descriptor.startTick = stored.startTick;
      descriptor.expiresAtTick = stored.expiresAtTick;
      descriptor.palette = stored.palette;
      telegraphs.push(descriptor);
    }
  }

  function appendChargerTelegraphs(current: RenderSnapshot, maximum: number): void {
    const tick = current.tick;
    for (let index = 0; index < current.enemies.count && telegraphs.length < maximum; index++) {
      if (current.enemies.role[index] !== RUN_ENEMY_ROLE.charger) continue;
      const id = current.enemies.id[index]!;
      const phase = ((tick + (id & 31)) % capacities.chargerCycleTicks + capacities.chargerCycleTicks) % capacities.chargerCycleTicks;
      const prewarning = phase >= CHARGER_PREWARNING_START_TICKS;
      const windup = phase < capacities.chargerWindupTicks;
      const lunge = phase >= capacities.chargerWindupTicks && phase < CHARGER_LUNGE_END_TICKS;
      if (!prewarning && !windup && !lunge) continue;
      const x = finite(current.enemies.x[index]!, 0);
      const y = finite(current.enemies.y[index]!, 0);
      const playerX = finite(current.playerX, x);
      const playerY = finite(current.playerY, y);
      const distanceX = playerX - x;
      const distanceY = playerY - y;
      const distance = Math.hypot(distanceX, distanceY);
      const directionX = distance > EPSILON ? distanceX / distance : 1;
      const directionY = distance > EPSILON ? distanceY / distance : 0;
      const prewarningDuration = Math.max(
        1,
        capacities.chargerCycleTicks - CHARGER_PREWARNING_START_TICKS,
      );
      const cueElapsed = prewarning ? phase - CHARGER_PREWARNING_START_TICKS : prewarningDuration + phase;
      const cueDuration = prewarningDuration + CHARGER_LUNGE_END_TICKS;
      const progress = clamp(cueElapsed / cueDuration, 0, 1);
      let opacity = CHARGER_PREWARNING_MIN_OPACITY;
      if (prewarning) {
        opacity = lerp(
          CHARGER_PREWARNING_MIN_OPACITY,
          CHARGER_PREWARNING_MAX_OPACITY,
          clamp((phase - CHARGER_PREWARNING_START_TICKS) / prewarningDuration, 0, 1),
        );
      } else if (windup) {
        opacity = lerp(
          CHARGER_WINDUP_MIN_OPACITY,
          CHARGER_LUNGE_MIN_OPACITY,
          clamp(phase / capacities.chargerWindupTicks, 0, 1),
        );
      } else {
        opacity = lerp(
          CHARGER_LUNGE_MIN_OPACITY,
          CHARGER_LUNGE_MAX_OPACITY,
          clamp(
            (phase - capacities.chargerWindupTicks)
              / Math.max(1, CHARGER_LUNGE_END_TICKS - capacities.chargerWindupTicks),
            0,
            1,
          ),
        );
      }
      const pulse = trianglePulse(tick, id, ENEMY_THREAT_BREATH_PERIOD_TICKS);
      const descriptor = telegraphStorage[telegraphs.length]!;
      descriptor.key = chargerTelegraphKey;
      descriptor.source = 'charger';
      descriptor.severity = 'charger';
      descriptor.style = 'lane';
      descriptor.label = 'LUNGE';
      descriptor.x = x;
      descriptor.y = y;
      descriptor.dirX = directionX;
      descriptor.dirY = directionY;
      descriptor.radius = clamp(finite(current.enemies.radius[index]!, 10) * 1.4, 12, 42);
      descriptor.length = capacities.chargerLungeTravelDistance;
      descriptor.thickness = 4 + pulse * 0.5;
      descriptor.progress = progress;
      descriptor.opacity = opacity;
      descriptor.pulse = pulse;
      descriptor.outlineScale = 0;
      descriptor.outlineOpacity = 0;
      descriptor.outlineThickness = 0;
      descriptor.startTick = tick - cueElapsed;
      descriptor.expiresAtTick = tick - cueElapsed + cueDuration;
      descriptor.palette = 'charger';
      telegraphs.push(descriptor);
    }
  }

  function fillContactDescriptors(previous: RenderSnapshot, current: RenderSnapshot): void {
    contactRings.length = 0;
    resetCandidates(contactCandidates);
    const playerX = finite(current.playerX, 0);
    const playerY = finite(current.playerY, 0);
    const previousPlayerX = finite(previous.playerX, playerX);
    const previousPlayerY = finite(previous.playerY, playerY);
    const playerRadius = Math.max(0, finite(current.playerRadius, 0));
    const enemies = current.enemies;
    const previousVersion = indexPreviousEnemySlots(previous.enemies);
    for (let index = 0; index < enemies.count; index++) {
      const id = enemies.id[index]!;
      const previousIndex = previousEnemyIndexFor(previous.enemies, id, previousVersion);
      // A fresh enemy has no movement history, so it cannot truthfully claim
      // to be closing. This also suppresses a ring on a recycled pool slot.
      if (previousIndex === -1) continue;
      const role = enemies.role[index]!;
      const x = finite(enemies.x[index]!, playerX);
      const y = finite(enemies.y[index]!, playerY);
      const radius = Math.max(0, finite(enemies.radius[index]!, 0));
      const dx = x - playerX;
      const dy = y - playerY;
      const distanceSquared = dx * dx + dy * dy;
      const previousX = finite(previous.enemies.x[previousIndex]!, x);
      const previousY = finite(previous.enemies.y[previousIndex]!, y);
      const previousDx = previousX - previousPlayerX;
      const previousDy = previousY - previousPlayerY;
      const previousDistanceSquared = previousDx * previousDx + previousDy * previousDy;
      if (distanceSquared + EPSILON >= previousDistanceSquared) continue;
      // Contact damage is authoritative only at collision distance. Keep the
      // ring at a narrow 1.2x perimeter rather than reusing legacy role-wide
      // proximity ranges, or ordinary enemies become louder than projectiles.
      const threatRange = (playerRadius + radius) * CONTACT_THREAT_DISTANCE_MULTIPLIER;
      if (distanceSquared > threatRange * threatRange) continue;
      // Priority dominates distance without relying on iteration order; nearest
      // threats within a class still win the remaining fixed slots.
      const score = distanceSquared - priorityForRole(role) * 1_000_000;
      insertCandidate(contactCandidates, index, score, id);
    }
    for (let candidate = 0; candidate < contactCandidates.count; candidate++) {
      const index = contactCandidates.indexes[candidate]!;
      const role = enemies.role[index]!;
      const x = finite(enemies.x[index]!, playerX);
      const y = finite(enemies.y[index]!, playerY);
      const radius = Math.max(0, finite(enemies.radius[index]!, 0));
      const dx = x - playerX;
      const dy = y - playerY;
      const distance = Math.hypot(dx, dy);
      const threatRange = (playerRadius + radius) * CONTACT_THREAT_DISTANCE_MULTIPLIER;
      const urgency = clamp(1 - distance / Math.max(1, threatRange), 0, 1);
      const id = enemies.id[index]!;
      const severity = roleSeverity(role);
      const pulse = trianglePulse(current.tick, id, ENEMY_THREAT_BREATH_PERIOD_TICKS);
      const descriptor = contactStorage[candidate]!;
      descriptor.entityId = id;
      descriptor.severity = severity;
      descriptor.x = x;
      descriptor.y = y;
      descriptor.radius = radius + (severity === 'boss' ? 16 : severity === 'elite' ? 12 : 8) + pulse * 0.8;
      descriptor.thickness = severity === 'boss'
        ? CONTACT_THREAT_BOSS_THICKNESS
        : severity === 'elite'
          ? CONTACT_THREAT_ELITE_THICKNESS
          : CONTACT_THREAT_STANDARD_THICKNESS;
      descriptor.urgency = urgency;
      descriptor.opacity = clamp(
        CONTACT_THREAT_BASE_OPACITY
          + urgency * CONTACT_THREAT_URGENCY_OPACITY
          + pulse * CONTACT_THREAT_PULSE_OPACITY,
        0,
        CONTACT_THREAT_MAX_OPACITY,
      );
      descriptor.pulse = pulse;
      descriptor.palette = paletteForRole(role);
      contactRings.push(descriptor);
    }
  }

  function fillEliteBossAuras(current: RenderSnapshot): void {
    eliteBossAuras.length = 0;
    resetCandidates(auraCandidates);
    const playerX = finite(current.playerX, 0);
    const playerY = finite(current.playerY, 0);
    const enemies = current.enemies;
    for (let index = 0; index < enemies.count; index++) {
      const role = enemies.role[index]!;
      if (role !== RUN_ENEMY_ROLE.elite && role !== RUN_ENEMY_ROLE.boss) continue;
      const dx = finite(enemies.x[index]!, playerX) - playerX;
      const dy = finite(enemies.y[index]!, playerY) - playerY;
      const score = dx * dx + dy * dy - (role === RUN_ENEMY_ROLE.boss ? 10_000_000 : 5_000_000);
      insertCandidate(auraCandidates, index, score, enemies.id[index]!);
    }
    for (let candidate = 0; candidate < auraCandidates.count; candidate++) {
      const index = auraCandidates.indexes[candidate]!;
      const role = enemies.role[index]!;
      const boss = role === RUN_ENEMY_ROLE.boss;
      const radius = Math.max(0, finite(enemies.radius[index]!, 0));
      const hp = Math.max(0, finite(enemies.hp[index]!, 0));
      const maxHp = Math.max(1, finite(enemies.maxHp[index]!, 1));
      const id = enemies.id[index]!;
      const pulse = trianglePulse(current.tick, id, ENEMY_THREAT_BREATH_PERIOD_TICKS);
      const descriptor = auraStorage[candidate]!;
      descriptor.entityId = id;
      descriptor.severity = boss ? 'boss' : 'elite';
      descriptor.x = finite(enemies.x[index]!, 0);
      descriptor.y = finite(enemies.y[index]!, 0);
      descriptor.innerRadius = radius * (boss ? 1.26 : 1.15) + 7;
      descriptor.outerRadius = radius * (boss ? 1.86 : 1.5) + 15 + pulse * (boss ? 2 : 1.2);
      descriptor.thickness = boss ? 6 : 4;
      descriptor.healthFraction = clamp(hp / maxHp, 0, 1);
      descriptor.opacity = boss ? 0.46 + pulse * 0.06 : 0.34 + pulse * 0.05;
      descriptor.pulse = pulse;
      descriptor.outlineScale = ELITE_AURA_OUTLINE_SCALE;
      descriptor.outlineOpacity = boss ? BOSS_AURA_OUTLINE_OPACITY : ELITE_AURA_OUTLINE_OPACITY;
      descriptor.outlineThickness = boss
        ? BOSS_AURA_OUTLINE_THICKNESS
        : ELITE_AURA_OUTLINE_THICKNESS;
      descriptor.palette = boss ? 'boss' : 'elite';
      eliteBossAuras.push(descriptor);
    }
  }

  return {
    capacities,
    update(input) {
      const currentTick = safeInteger(input.current.tick, 0);
      if (currentTick < lastTick) {
        clearCachedTelegraphs();
        clearProjectileMuzzleHistory();
      }
      lastTick = currentTick;
      pruneTelegraphs(currentTick);
      queueTraitTelegraphs(input.traitPresentationEvents ?? EMPTY_TRAIT_EVENTS);
      queueDirectorTelegraphs(input.directorEvents ?? EMPTY_DIRECTOR_EVENTS, input.current);
      fillProjectileDescriptors(
        input.previous,
        input.current,
        input.alpha,
        input.hostileProjectileMetadata,
      );
      fillShooterWindups(input.current);
      telegraphs.length = 0;
      appendChargerTelegraphs(input.current, reservedChargerTelegraphs);
      appendStoredTelegraphs(currentTick);
      fillContactDescriptors(input.previous, input.current);
      fillEliteBossAuras(input.current);
      // `EnemyThreatFrame` is intentionally a reusable presentation buffer.
      frame.tick = currentTick;
      return frame;
    },
    reset() {
      clearCachedTelegraphs();
      previousProjectileSlotStamp.fill(0);
      previousProjectileVersion = 0;
      clearProjectileMuzzleHistory();
      previousEnemySlotStamp.fill(0);
      previousEnemyVersion = 0;
      hostileProjectiles.length = 0;
      shooterWindups.length = 0;
      telegraphs.length = 0;
      contactRings.length = 0;
      eliteBossAuras.length = 0;
      lastTick = -1;
      frame.tick = 0;
    },
  };
}

/**
 * Small pure helper for integrations that want to classify a snapshot role
 * before deciding which bounded renderer batch receives its descriptor.
 */
export function isHostileProjectileSnapshot(snapshot: CategorySnapshot, index: number): boolean {
  return index >= 0 && index < snapshot.count && snapshot.role[index] === HOSTILE_PROJECTILE_ROLE;
}
