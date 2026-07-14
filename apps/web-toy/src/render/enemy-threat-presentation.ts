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
  readonly opacity: number;
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
  readonly palette: 'elite' | 'boss';
}

/**
 * Returned buffers are reused on the next update. Renderers should consume
 * them synchronously, exactly as they do trait-presentation event buffers.
 */
export interface EnemyThreatFrame {
  readonly tick: number;
  readonly hostileProjectiles: readonly HostileProjectileThreatDescriptor[];
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
  readonly maxTelegraphs?: number;
  readonly maxContactRings?: number;
  readonly maxEliteBossAuras?: number;
  /** Mirrors the current charger's fixed visual wind-up cycle. */
  readonly chargerCycleTicks?: number;
  /** Mirrors the current charger's stationary wind-up duration. */
  readonly chargerWindupTicks?: number;
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
  maxTelegraphs: 24,
  maxContactRings: 16,
  maxEliteBossAuras: 6,
  chargerCycleTicks: 180,
  chargerWindupTicks: 24,
});

const EMPTY_DIRECTOR_EVENTS: readonly RunDirectorEventView[] = Object.freeze([]);
const EMPTY_TRAIT_EVENTS: readonly TraitPresentationEventView[] = Object.freeze([]);
const MAX_PRESENTATION_CAPACITY = 128;
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

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function safeInteger(value: number, fallback: number): number {
  return Number.isSafeInteger(value) ? value : fallback;
}

function boundedCapacity(value: number | undefined, fallback: number): number {
  const numeric = value === undefined ? fallback : value;
  return clamp(Math.floor(finite(numeric, fallback)), 1, MAX_PRESENTATION_CAPACITY);
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

function contactRangeForRole(role: number): number {
  if (role === RUN_ENEMY_ROLE.boss) return 150;
  if (role === RUN_ENEMY_ROLE.elite) return 108;
  if (role === RUN_ENEMY_ROLE.charger) return 88;
  if (role === RUN_ENEMY_ROLE.ranged) return 66;
  if (role === RUN_ENEMY_ROLE.denial || role === RUN_ENEMY_ROLE.flanker || role === RUN_ENEMY_ROLE.support) return 58;
  return 42;
}

function priorityForRole(role: number): number {
  if (role === RUN_ENEMY_ROLE.boss) return 6;
  if (role === RUN_ENEMY_ROLE.elite) return 5;
  if (role === RUN_ENEMY_ROLE.charger) return 4;
  if (role === RUN_ENEMY_ROLE.ranged || role === RUN_ENEMY_ROLE.denial) return 3;
  if (role === RUN_ENEMY_ROLE.flanker || role === RUN_ENEMY_ROLE.support) return 2;
  return 1;
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
    opacity: 0,
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
    maxProjectileTrails: boundedCapacity(options.maxProjectileTrails, DEFAULT_ENEMY_THREAT_CAPACITIES.maxProjectileTrails),
    maxTelegraphs: boundedCapacity(options.maxTelegraphs, DEFAULT_ENEMY_THREAT_CAPACITIES.maxTelegraphs),
    maxContactRings: boundedCapacity(options.maxContactRings, DEFAULT_ENEMY_THREAT_CAPACITIES.maxContactRings),
    maxEliteBossAuras: boundedCapacity(options.maxEliteBossAuras, DEFAULT_ENEMY_THREAT_CAPACITIES.maxEliteBossAuras),
    chargerCycleTicks: boundedPositive(options.chargerCycleTicks, DEFAULT_ENEMY_THREAT_CAPACITIES.chargerCycleTicks, 4096),
    chargerWindupTicks: boundedPositive(options.chargerWindupTicks, DEFAULT_ENEMY_THREAT_CAPACITIES.chargerWindupTicks, 1024),
  });
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
  const projectileCandidates: CandidateBuffer = {
    indexes: new Int32Array(capacities.maxProjectileTrails),
    scores: new Float64Array(capacities.maxProjectileTrails),
    ids: new Int32Array(capacities.maxProjectileTrails),
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
  const telegraphStorage = Array.from({ length: capacities.maxTelegraphs }, makeTelegraphDescriptor);
  const contactStorage = Array.from({ length: capacities.maxContactRings }, makeContactDescriptor);
  const auraStorage = Array.from({ length: capacities.maxEliteBossAuras }, makeAuraDescriptor);
  const hostileProjectiles: HostileProjectileThreatDescriptor[] = [];
  const telegraphs: EnemyAttackTelegraphDescriptor[] = [];
  const contactRings: EnemyContactThreatRingDescriptor[] = [];
  const eliteBossAuras: EliteBossThreatAuraDescriptor[] = [];
  const frame: Mutable<EnemyThreatFrame> = {
    tick: 0,
    hostileProjectiles,
    telegraphs,
    contactRings,
    eliteBossAuras,
  };
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

  function fillProjectileDescriptors(
    previous: RenderSnapshot,
    current: RenderSnapshot,
    alpha: number,
    metadataById: ReadonlyMap<number, HostileProjectileThreatMetadata> | undefined,
  ): void {
    hostileProjectiles.length = 0;
    resetCandidates(projectileCandidates);
    const previousVersion = indexPreviousProjectileSlots(previous.projectiles);
    const playerX = finite(current.playerX, 0);
    const playerY = finite(current.playerY, 0);
    for (let index = 0; index < current.projectiles.count; index++) {
      if (current.projectiles.role[index] !== HOSTILE_PROJECTILE_ROLE) continue;
      const dx = finite(current.projectiles.x[index]!, playerX) - playerX;
      const dy = finite(current.projectiles.y[index]!, playerY) - playerY;
      insertCandidate(projectileCandidates, index, dx * dx + dy * dy, current.projectiles.id[index]!);
    }
    const blend = clamp(finite(alpha, 1), 0, 1);
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
      descriptor.headRadius = baseRadius * (critical ? 1.24 : 1) * (0.98 + pulse * 0.04);
      descriptor.tailWidth = baseRadius * 0.72;
      descriptor.opacity = 0.72 + pulse * 0.06;
      descriptor.pulse = pulse;
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
      descriptor.radius = stored.radius * (stored.style === 'arrival' ? 0.72 + progress * 0.42 : 0.86 + progress * 0.14);
      descriptor.length = stored.length;
      descriptor.thickness = clamp(stored.radius * (stored.severity === 'boss' ? 0.056 : 0.045), 2, 14);
      descriptor.progress = progress;
      descriptor.opacity = clamp((stored.severity === 'boss' ? 0.7 : 0.58) * (0.94 + pulse * 0.06) * (1 - progress * 0.08), 0, 1);
      descriptor.pulse = pulse;
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
      if (phase >= capacities.chargerWindupTicks) continue;
      const x = finite(current.enemies.x[index]!, 0);
      const y = finite(current.enemies.y[index]!, 0);
      const playerX = finite(current.playerX, x);
      const playerY = finite(current.playerY, y);
      const distanceX = playerX - x;
      const distanceY = playerY - y;
      const distance = Math.hypot(distanceX, distanceY);
      const directionX = distance > EPSILON ? distanceX / distance : 1;
      const directionY = distance > EPSILON ? distanceY / distance : 0;
      const progress = clamp(phase / capacities.chargerWindupTicks, 0, 1);
      const pulse = trianglePulse(tick, id, ENEMY_THREAT_BREATH_PERIOD_TICKS);
      const descriptor = telegraphStorage[telegraphs.length]!;
      descriptor.key = `charger|${id}|${tick - phase}`;
      descriptor.source = 'charger';
      descriptor.severity = 'charger';
      descriptor.style = 'lane';
      descriptor.label = 'LUNGE';
      descriptor.x = x;
      descriptor.y = y;
      descriptor.dirX = directionX;
      descriptor.dirY = directionY;
      descriptor.radius = clamp(finite(current.enemies.radius[index]!, 10) * 1.4, 12, 42);
      descriptor.length = clamp(distance, 72, 230);
      descriptor.thickness = 4 + pulse * 0.5;
      descriptor.progress = progress;
      descriptor.opacity = 0.52 + progress * 0.14 + pulse * 0.04;
      descriptor.pulse = pulse;
      descriptor.startTick = tick - phase;
      descriptor.expiresAtTick = tick - phase + capacities.chargerWindupTicks;
      descriptor.palette = 'charger';
      telegraphs.push(descriptor);
    }
  }

  function fillContactDescriptors(current: RenderSnapshot): void {
    contactRings.length = 0;
    resetCandidates(contactCandidates);
    const playerX = finite(current.playerX, 0);
    const playerY = finite(current.playerY, 0);
    const playerRadius = Math.max(0, finite(current.playerRadius, 0));
    const enemies = current.enemies;
    for (let index = 0; index < enemies.count; index++) {
      const role = enemies.role[index]!;
      const x = finite(enemies.x[index]!, playerX);
      const y = finite(enemies.y[index]!, playerY);
      const radius = Math.max(0, finite(enemies.radius[index]!, 0));
      const dx = x - playerX;
      const dy = y - playerY;
      const distanceSquared = dx * dx + dy * dy;
      const threatRange = playerRadius + radius + contactRangeForRole(role);
      if (distanceSquared > threatRange * threatRange) continue;
      // Priority dominates distance without relying on iteration order; nearest
      // threats within a class still win the remaining fixed slots.
      const score = distanceSquared - priorityForRole(role) * 1_000_000;
      insertCandidate(contactCandidates, index, score, enemies.id[index]!);
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
      const threatRange = playerRadius + radius + contactRangeForRole(role);
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
      descriptor.thickness = severity === 'boss' ? 5 : severity === 'elite' ? 4 : 3;
      descriptor.urgency = urgency;
      descriptor.opacity = clamp(0.24 + urgency * 0.35 + pulse * 0.05, 0, 0.64);
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
      descriptor.palette = boss ? 'boss' : 'elite';
      eliteBossAuras.push(descriptor);
    }
  }

  return {
    capacities,
    update(input) {
      const currentTick = safeInteger(input.current.tick, 0);
      if (currentTick < lastTick) clearCachedTelegraphs();
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
      telegraphs.length = 0;
      appendChargerTelegraphs(input.current, reservedChargerTelegraphs);
      appendStoredTelegraphs(currentTick);
      fillContactDescriptors(input.current);
      fillEliteBossAuras(input.current);
      // `EnemyThreatFrame` is intentionally a reusable presentation buffer.
      frame.tick = currentTick;
      return frame;
    },
    reset() {
      clearCachedTelegraphs();
      previousProjectileSlotStamp.fill(0);
      previousProjectileVersion = 0;
      hostileProjectiles.length = 0;
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
