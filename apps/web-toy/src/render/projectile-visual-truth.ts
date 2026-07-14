/**
 * Renderer-only ownership for player projectile artwork.
 *
 * The simulation intentionally stores only a compact damage-source code on a
 * projectile. That is enough for combat, but it is not enough to paint a
 * Porcupine quill as an Owl feather. This bridge never writes to simulation
 * state: it recognizes an authored command, validates it against the actual
 * copied projectile position/heading, then retains the resulting family by
 * generation-safe projectile id for the life of that visual projectile.
 */
import { COMBAT_DAMAGE_SOURCE, idSlot, type TraitPresentationEventView } from '@sim';
import type { CategorySnapshot } from '../contracts';

export const PLAYER_PROJECTILE_VISUAL_FAMILY = Object.freeze({
  generic: 0,
  gracieSpit: 1,
  porcupineQuills: 2,
  owlPinions: 3,
  thornstorm: 4,
} as const);

export type PlayerProjectileVisualFamily =
  (typeof PLAYER_PROJECTILE_VISUAL_FAMILY)[keyof typeof PLAYER_PROJECTILE_VISUAL_FAMILY];

/** The narrow command copy required to prove an authored launch family. */
export type ProjectileVisualTraitEvent = Pick<
  TraitPresentationEventView,
  'kind' | 'sourceId' | 'tick' | 'originX' | 'originY' | 'dirX' | 'dirY' | 'count'
>;

export interface ProjectileVisualTruth {
  /**
   * Associates only high-confidence authored events with real live snapshot
   * identities. Unknown/ambiguous trait projectiles deliberately remain
   * generic instead of pretending to be a different attack family.
   */
  update(
    current: CategorySnapshot,
    traitEvents: readonly ProjectileVisualTraitEvent[],
    currentTick: number,
  ): void;
  /** Returns the retained art family for this exact generation-safe id. */
  familyFor(projectileId: number, source: number): PlayerProjectileVisualFamily;
  reset(): void;
}

const MAX_COMMAND_AGE_TICKS = 16;
const MIN_LAUNCH_TOLERANCE = 18;
const DIRECTED_MINIMUM_DOT = 0.32;

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function finitePositiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function familyForEvent(event: ProjectileVisualTraitEvent): PlayerProjectileVisualFamily {
  if (event.kind === 'spawnProjectileBurst') {
    if (event.sourceId === 'gracie-spit') return PLAYER_PROJECTILE_VISUAL_FAMILY.gracieSpit;
    if (event.sourceId === 'porcupine-quills') return PLAYER_PROJECTILE_VISUAL_FAMILY.porcupineQuills;
    if (event.sourceId === 'owl-pinions') return PLAYER_PROJECTILE_VISUAL_FAMILY.owlPinions;
  }
  if (event.kind === 'radialProjectileBurst' && event.sourceId === 'thornstorm-mantle') {
    return PLAYER_PROJECTILE_VISUAL_FAMILY.thornstorm;
  }
  return PLAYER_PROJECTILE_VISUAL_FAMILY.generic;
}

function isDirected(event: ProjectileVisualTraitEvent): boolean {
  return event.kind === 'spawnProjectileBurst';
}

/**
 * Keeps matching deliberately conservative. The snapshot tells us the actual
 * motion. We back-project it through the small frame/catch-up window to the
 * event origin and reject a directed command whose real heading disagrees.
 */
function matchScore(
  event: ProjectileVisualTraitEvent,
  snapshot: CategorySnapshot,
  index: number,
  currentTick: number,
  ticksPerSecond: number,
): number | null {
  const age = currentTick - finitePositiveInteger(event.tick, currentTick);
  if (age < 0 || age > MAX_COMMAND_AGE_TICKS) return null;
  const velocityX = finite(snapshot.velocityX[index]!);
  const velocityY = finite(snapshot.velocityY[index]!);
  const x = finite(snapshot.x[index]!);
  const y = finite(snapshot.y[index]!);
  const originX = finite(event.originX);
  const originY = finite(event.originY);
  const perTickX = velocityX / ticksPerSecond;
  const perTickY = velocityY / ticksPerSecond;
  // Simulation commands can be captured just before or just after their
  // first movement step. Accept either adjacent boundary, never a fabricated
  // long travel path.
  const beforeX = x - perTickX * age;
  const beforeY = y - perTickY * age;
  const afterX = x - perTickX * (age + 1);
  const afterY = y - perTickY * (age + 1);
  const error = Math.min(
    Math.hypot(beforeX - originX, beforeY - originY),
    Math.hypot(afterX - originX, afterY - originY),
  );
  const tolerance = Math.max(
    MIN_LAUNCH_TOLERANCE,
    Math.hypot(perTickX, perTickY) * 2.5,
    finite(snapshot.radius[index]!) * 4,
  );
  if (error > tolerance) return null;

  let headingPenalty = 0;
  if (isDirected(event)) {
    const eventLength = Math.hypot(finite(event.dirX), finite(event.dirY));
    const projectileLength = Math.hypot(velocityX, velocityY);
    if (eventLength > 1e-6 && projectileLength > 1e-6) {
      const dot = (finite(event.dirX) * velocityX + finite(event.dirY) * velocityY)
        / (eventLength * projectileLength);
      if (dot < DIRECTED_MINIMUM_DOT) return null;
      headingPenalty = (1 - dot) * 0.25;
    }
  }
  return error / tolerance + headingPenalty;
}

/**
 * Creates a bounded, allocation-stable id-to-family bridge. The caller owns
 * all snapshot traversal; no gameplay pool or replay state is mutated.
 */
export function createProjectileVisualTruth(
  projectileCapacity: number,
  ticksPerSecond: number,
): ProjectileVisualTruth {
  const capacity = Math.max(1, Math.floor(finite(projectileCapacity, 1)));
  const safeTicksPerSecond = Math.max(1, finite(ticksPerSecond, 1));
  const idsBySlot = new Int32Array(capacity);
  const presentBySlot = new Uint8Array(capacity);
  const familyBySlot = new Uint8Array(capacity);
  // A renderer frame may carry several fixed ticks worth of events. Retain a
  // fixed command counter instead of allocating per frame; any excess simply
  // remains a generic projectile rather than guessing its source.
  const assignedByEvent = new Uint16Array(256);

  function remember(projectileId: number, family: PlayerProjectileVisualFamily): void {
    const slot = idSlot(projectileId);
    if (slot < 0 || slot >= capacity) return;
    idsBySlot[slot] = projectileId;
    familyBySlot[slot] = family;
    presentBySlot[slot] = 1;
  }

  return {
    update(current, traitEvents, currentTick): void {
      assignedByEvent.fill(0);
      const eventLimit = Math.min(traitEvents.length, assignedByEvent.length);
      for (let eventIndex = 0; eventIndex < eventLimit; eventIndex++) {
        const event = traitEvents[eventIndex]!;
        const family = familyForEvent(event);
        if (family === PLAYER_PROJECTILE_VISUAL_FAMILY.generic) continue;
        const requested = Math.min(
          current.count,
          Math.max(1, finitePositiveInteger(event.count, 1)),
        );
        // Pick the best remaining *actual* live projectile for each authored
        // emission. Snapshot order cannot influence the chosen family when
        // positions/ids differ, and a stale command can never overwrite an
        // existing exact id attribution.
        while (assignedByEvent[eventIndex]! < requested) {
          let bestIndex = -1;
          let bestScore = Infinity;
          let bestId = 0;
          for (let projectileIndex = 0; projectileIndex < current.count; projectileIndex++) {
            if (current.role[projectileIndex] !== 0) continue;
            if (current.source[projectileIndex] !== COMBAT_DAMAGE_SOURCE.traitProjectile) continue;
            const projectileId = current.id[projectileIndex]!;
            const slot = idSlot(projectileId);
            if (
              slot < 0
              || slot >= capacity
              || (presentBySlot[slot] === 1 && idsBySlot[slot] === projectileId)
            ) continue;
            const score = matchScore(event, current, projectileIndex, currentTick, safeTicksPerSecond);
            if (
              score !== null
              && (score < bestScore || (score === bestScore && projectileId < bestId))
            ) {
              bestIndex = projectileIndex;
              bestScore = score;
              bestId = projectileId;
            }
          }
          if (bestIndex < 0) break;
          remember(current.id[bestIndex]!, family);
          assignedByEvent[eventIndex] = assignedByEvent[eventIndex]! + 1;
        }
      }
    },
    familyFor(projectileId, source): PlayerProjectileVisualFamily {
      if (source === COMBAT_DAMAGE_SOURCE.heroSpit) return PLAYER_PROJECTILE_VISUAL_FAMILY.gracieSpit;
      if (source !== COMBAT_DAMAGE_SOURCE.traitProjectile) return PLAYER_PROJECTILE_VISUAL_FAMILY.generic;
      const slot = idSlot(projectileId);
      if (slot < 0 || slot >= capacity) return PLAYER_PROJECTILE_VISUAL_FAMILY.generic;
      return presentBySlot[slot] === 1 && idsBySlot[slot] === projectileId
        ? familyBySlot[slot]! as PlayerProjectileVisualFamily
        : PLAYER_PROJECTILE_VISUAL_FAMILY.generic;
    },
    reset(): void {
      idsBySlot.fill(0);
      presentBySlot.fill(0);
      familyBySlot.fill(PLAYER_PROJECTILE_VISUAL_FAMILY.generic);
      assignedByEvent.fill(0);
    },
  };
}
