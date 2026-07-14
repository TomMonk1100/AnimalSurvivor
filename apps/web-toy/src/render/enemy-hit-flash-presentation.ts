/**
 * Renderer-only white enemy hit flash policy.
 *
 * The simulation owns damage and enemy lifetime. This projection merely
 * retains already-resolved enemy-hit events for three fixed ticks, matches
 * them back to a still-live snapshot id, and supplies a bounded instanced
 * overlay descriptor. No gameplay state is read back or mutated.
 */
import { idSlot } from '@sim';
import type { CategorySnapshot } from '../contracts';
import type { CombatPresentationEventView } from '../presentation/combat-presentation-events';

export const ENEMY_HIT_FLASH_LIFETIME_TICKS = 3;
export const ENEMY_HIT_FLASH_PER_ENEMY_RATE_LIMIT_TICKS = 4;
export const DEFAULT_ENEMY_HIT_FLASH_CAPACITY = 48;
/** At most two fresh white overlays may start on any render tick. */
export const DEFAULT_ENEMY_HIT_FLASH_MAX_NEW_PER_TICK = 2;
/** Three fixed flash ticks times two starts keeps the white-overlay budget at six. */
export const DEFAULT_ENEMY_HIT_FLASH_MAX_CONCURRENT = 6;
/**
 * Quantized contact-to-release samples. Age zero must read as an unambiguous
 * white target silhouette at normal play scale; the terminal sample stays
 * faint-but-shaped instead of disappearing into the sprite's edge feather.
 * Its energy is moved out of the peak rather than added as a new flash: the
 * peak is lower than the original contact and the three samples total 1.52.
 * The unchanged two-start/six-concurrent budgets still prevent a swarm-wide
 * white wash. The scene uses these prebuilt age batches without making one
 * material per enemy.
 */
export const ENEMY_HIT_FLASH_AGE_OPACITY = Object.freeze([0.84, 0.44, 0.24] as const);

const ENTITY_SLOT_COUNT = 0x1_0000;
const MAX_CAPACITY = 96;
const SEEN_CAPACITY_MULTIPLIER = 4;

export interface EnemyHitFlashDescriptorBuffer {
  count: number;
  readonly entityId: Int32Array;
  readonly ageTicks: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly radius: Float32Array;
  readonly archetype: Uint8Array;
  readonly role: Uint8Array;
  readonly opacity: Float32Array;
}

export interface EnemyHitFlashFrame {
  tick: number;
  readonly flashes: EnemyHitFlashDescriptorBuffer;
}

export interface EnemyHitFlashPresentation {
  readonly capacity: number;
  /** Global visual budget, independent of the backing pool capacity. */
  readonly maxConcurrent: number;
  /** Global admission cap that prevents a same-tick swarm hit from strobing. */
  readonly maxNewPerTick: number;
  update(
    events: readonly CombatPresentationEventView[],
    enemies: CategorySnapshot,
    renderTick: number,
  ): EnemyHitFlashFrame;
  reset(): void;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedCapacity(value: number | undefined): number {
  const fallback = DEFAULT_ENEMY_HIT_FLASH_CAPACITY;
  const numeric = value === undefined ? fallback : value;
  return clamp(Number.isFinite(numeric) ? Math.floor(numeric) : fallback, 1, MAX_CAPACITY);
}

function normalizedBound(value: number | undefined, fallback: number, maximum: number): number {
  const numeric = value === undefined ? fallback : value;
  return clamp(Number.isFinite(numeric) ? Math.floor(numeric) : fallback, 1, maximum);
}

function normalizedTick(value: number): number {
  return Math.max(0, Number.isFinite(value) ? Math.floor(value) : 0);
}

function usableEnemyHit(event: CombatPresentationEventView): event is CombatPresentationEventView & { readonly targetId: number } {
  return event.kind === 'enemyHit'
    && typeof event.targetId === 'number'
    && Number.isFinite(event.targetId)
    && Number.isFinite(event.tick);
}

/**
 * Source strings are folded only for duplicate suppression. The bounded ring
 * avoids retaining a string or allocating a key for every rAF replay.
 */
function sourceHash(sourceId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < sourceId.length; index++) {
    hash = Math.imul(hash ^ sourceId.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash;
}

function identityHash(event: CombatPresentationEventView & { readonly targetId: number }): number {
  let hash = sourceHash(event.sourceId);
  hash = Math.imul(hash ^ normalizedTick(event.tick), 0x45d9f3b) >>> 0;
  hash = Math.imul(hash ^ (event.targetId >>> 0), 0x45d9f3b) >>> 0;
  hash = Math.imul(hash ^ Math.round(event.amount * 1000), 0x45d9f3b) >>> 0;
  return (hash ^ (event.critical ? 0x9e3779b9 : 0)) >>> 0;
}

function admissionPriority(event: CombatPresentationEventView): number {
  // Criticals retain the limited white-overlay budget before routine contacts.
  return event.critical ? 1 : 0;
}

function admissionComesBefore(
  candidatePriority: number,
  candidateIdentity: number,
  existingPriority: number,
  existingIdentity: number,
): boolean {
  if (candidatePriority !== existingPriority) return candidatePriority > existingPriority;
  return (candidateIdentity >>> 0) < (existingIdentity >>> 0);
}

/**
 * Fixed-capacity presentation pool. The update path owns only typed-array
 * state and never allocates materials, entities, arrays, or Maps per hit.
 */
export function createEnemyHitFlashPresentation(
  options: {
    readonly capacity?: number;
    readonly maxConcurrent?: number;
    readonly maxNewPerTick?: number;
  } = {},
): EnemyHitFlashPresentation {
  const capacity = normalizedCapacity(options.capacity);
  const maxConcurrent = normalizedBound(
    options.maxConcurrent,
    Math.min(DEFAULT_ENEMY_HIT_FLASH_MAX_CONCURRENT, capacity),
    capacity,
  );
  const maxNewPerTick = normalizedBound(
    options.maxNewPerTick,
    Math.min(DEFAULT_ENEMY_HIT_FLASH_MAX_NEW_PER_TICK, maxConcurrent),
    maxConcurrent,
  );
  const active = new Uint8Array(capacity);
  const entityId = new Int32Array(capacity);
  const startTick = new Int32Array(capacity);

  const lookupIndexBySlot = new Int32Array(ENTITY_SLOT_COUNT);
  const lookupStampBySlot = new Uint32Array(ENTITY_SLOT_COUNT);
  let lookupStamp = 0;

  const lastFlashEntityBySlot = new Int32Array(ENTITY_SLOT_COUNT);
  const lastFlashTickBySlot = new Int32Array(ENTITY_SLOT_COUNT);
  const lastFlashValidBySlot = new Uint8Array(ENTITY_SLOT_COUNT);

  const seenCapacity = Math.max(32, capacity * SEEN_CAPACITY_MULTIPLIER);
  const seenIdentities = new Uint32Array(seenCapacity);
  let seenCount = 0;
  let nextSeen = 0;

  // Selection buffers are fixed at construction and let the projector choose
  // the same small set of high-priority contacts even if an input event list
  // arrives in a different order. They are renderer-owned bookkeeping only.
  const candidateEventIndex = new Int32Array(maxNewPerTick);
  const candidateIdentity = new Uint32Array(maxNewPerTick);
  const candidateTargetId = new Int32Array(maxNewPerTick);
  const candidatePriority = new Uint8Array(maxNewPerTick);

  const flashes: EnemyHitFlashDescriptorBuffer = {
    count: 0,
    entityId: new Int32Array(capacity),
    ageTicks: new Uint8Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    radius: new Float32Array(capacity),
    archetype: new Uint8Array(capacity),
    role: new Uint8Array(capacity),
    opacity: new Float32Array(capacity),
  };
  const frame: EnemyHitFlashFrame = { tick: 0, flashes };
  let lastRenderTick = -1;

  function nextLookupStamp(): number {
    lookupStamp = (lookupStamp + 1) >>> 0;
    if (lookupStamp === 0) {
      lookupStampBySlot.fill(0);
      lookupStamp = 1;
    }
    return lookupStamp;
  }

  function buildEnemyLookup(enemies: CategorySnapshot): number {
    const stamp = nextLookupStamp();
    for (let index = 0; index < enemies.count; index++) {
      const id = enemies.id[index]!;
      const slot = idSlot(id);
      lookupIndexBySlot[slot] = index;
      lookupStampBySlot[slot] = stamp;
    }
    return stamp;
  }

  function enemyIndexFor(id: number, enemies: CategorySnapshot, stamp: number): number {
    const slot = idSlot(id);
    if (lookupStampBySlot[slot] !== stamp) return -1;
    const index = lookupIndexBySlot[slot]!;
    return enemies.id[index] === id ? index : -1;
  }

  function hasSeen(identity: number): boolean {
    for (let index = 0; index < seenCount; index++) {
      if (seenIdentities[index] === identity) return true;
    }
    return false;
  }

  function remember(identity: number): void {
    seenIdentities[nextSeen] = identity;
    nextSeen = (nextSeen + 1) % seenCapacity;
    if (seenCount < seenCapacity) seenCount++;
  }

  function releaseExpired(tick: number): void {
    for (let index = 0; index < capacity; index++) {
      if (active[index] === 0) continue;
      const age = tick - startTick[index]!;
      if (age < 0 || age >= ENEMY_HIT_FLASH_LIFETIME_TICKS) active[index] = 0;
    }
  }

  function activeCount(): number {
    let count = 0;
    for (let index = 0; index < capacity; index++) count += active[index]!;
    return count;
  }

  function findOpenSlot(): number {
    for (let index = 0; index < capacity; index++) {
      if (active[index] === 0) return index;
    }
    return -1;
  }

  function writeCandidate(
    slot: number,
    eventIndex: number,
    identity: number,
    targetId: number,
    priority: number,
  ): void {
    candidateEventIndex[slot] = eventIndex;
    candidateIdentity[slot] = identity;
    candidateTargetId[slot] = targetId;
    candidatePriority[slot] = priority;
  }

  function sortCandidates(count: number): void {
    // Tiny insertion sort keeps chosen output order stable without allocating
    // a temporary array in the steady-state render path.
    for (let index = 1; index < count; index++) {
      const eventIndex = candidateEventIndex[index]!;
      const identity = candidateIdentity[index]!;
      const targetId = candidateTargetId[index]!;
      const priority = candidatePriority[index]!;
      let cursor = index - 1;
      while (
        cursor >= 0
        && admissionComesBefore(
          priority,
          identity,
          candidatePriority[cursor]!,
          candidateIdentity[cursor]!,
        )
      ) {
        writeCandidate(
          cursor + 1,
          candidateEventIndex[cursor]!,
          candidateIdentity[cursor]!,
          candidateTargetId[cursor]!,
          candidatePriority[cursor]!,
        );
        cursor--;
      }
      writeCandidate(cursor + 1, eventIndex, identity, targetId, priority);
    }
  }

  function addEvents(
    events: readonly CombatPresentationEventView[],
    enemies: CategorySnapshot,
    renderTick: number,
    lookupStampForFrame: number,
  ): void {
    const admissionLimit = Math.min(maxNewPerTick, Math.max(0, maxConcurrent - activeCount()));
    let candidateCount = 0;

    for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
      const event = events[eventIndex]!;
      if (!usableEnemyHit(event)) continue;
      const eventTick = normalizedTick(event.tick);
      const age = renderTick - eventTick;
      if (age < 0 || age >= ENEMY_HIT_FLASH_LIFETIME_TICKS) continue;

      const identity = identityHash(event);
      if (hasSeen(identity)) continue;
      remember(identity);

      const targetId = event.targetId;
      const enemyIndex = enemyIndexFor(targetId, enemies, lookupStampForFrame);
      // The target may have died in the same tick. Do not fabricate a flash
      // at the last event coordinate when no enemy silhouette remains.
      if (enemyIndex < 0) continue;

      const slot = idSlot(targetId);
      if (
        lastFlashValidBySlot[slot] === 1
        && lastFlashEntityBySlot[slot] === targetId
        && eventTick - lastFlashTickBySlot[slot]! < ENEMY_HIT_FLASH_PER_ENEMY_RATE_LIMIT_TICKS
      ) continue;

      if (admissionLimit === 0) continue;
      const priority = admissionPriority(event);
      let sameTargetCandidate = -1;
      for (let candidate = 0; candidate < candidateCount; candidate++) {
        if (candidateTargetId[candidate] === targetId) {
          sameTargetCandidate = candidate;
          break;
        }
      }
      if (sameTargetCandidate >= 0) {
        if (admissionComesBefore(
          priority,
          identity,
          candidatePriority[sameTargetCandidate]!,
          candidateIdentity[sameTargetCandidate]!,
        )) {
          writeCandidate(sameTargetCandidate, eventIndex, identity, targetId, priority);
        }
        continue;
      }

      if (candidateCount < admissionLimit) {
        writeCandidate(candidateCount, eventIndex, identity, targetId, priority);
        candidateCount++;
        continue;
      }

      let lowestPriorityCandidate = 0;
      for (let candidate = 1; candidate < candidateCount; candidate++) {
        if (admissionComesBefore(
          candidatePriority[lowestPriorityCandidate]!,
          candidateIdentity[lowestPriorityCandidate]!,
          candidatePriority[candidate]!,
          candidateIdentity[candidate]!,
        )) {
          lowestPriorityCandidate = candidate;
        }
      }
      if (admissionComesBefore(
        priority,
        identity,
        candidatePriority[lowestPriorityCandidate]!,
        candidateIdentity[lowestPriorityCandidate]!,
      )) {
        writeCandidate(lowestPriorityCandidate, eventIndex, identity, targetId, priority);
      }
    }

    sortCandidates(candidateCount);
    for (let candidate = 0; candidate < candidateCount; candidate++) {
      const event = events[candidateEventIndex[candidate]!]!;
      if (!usableEnemyHit(event)) continue;
      const eventTick = normalizedTick(event.tick);
      const targetId = event.targetId;
      const slot = idSlot(targetId);
      // Candidate selection collapses same-target contacts, but retain this
      // defensive check so a malformed feed cannot violate the per-enemy rule.
      if (
        lastFlashValidBySlot[slot] === 1
        && lastFlashEntityBySlot[slot] === targetId
        && eventTick - lastFlashTickBySlot[slot]! < ENEMY_HIT_FLASH_PER_ENEMY_RATE_LIMIT_TICKS
      ) continue;
      const flashSlot = findOpenSlot();
      if (flashSlot < 0) break;
      lastFlashValidBySlot[slot] = 1;
      lastFlashEntityBySlot[slot] = targetId;
      lastFlashTickBySlot[slot] = eventTick;
      active[flashSlot] = 1;
      entityId[flashSlot] = targetId;
      startTick[flashSlot] = eventTick;
    }
  }

  function packActive(enemies: CategorySnapshot, renderTick: number, lookupStampForFrame: number): void {
    let count = 0;
    for (let index = 0; index < capacity; index++) {
      if (active[index] === 0) continue;
      const activeEntityId = entityId[index]!;
      const enemyIndex = enemyIndexFor(activeEntityId, enemies, lookupStampForFrame);
      if (enemyIndex < 0) {
        active[index] = 0;
        continue;
      }
      const age = renderTick - startTick[index]!;
      if (age < 0 || age >= ENEMY_HIT_FLASH_LIFETIME_TICKS) {
        active[index] = 0;
        continue;
      }

      flashes.entityId[count] = activeEntityId;
      flashes.ageTicks[count] = age;
      flashes.x[count] = enemies.x[enemyIndex]!;
      flashes.y[count] = enemies.y[enemyIndex]!;
      flashes.radius[count] = Math.max(0, enemies.radius[enemyIndex]!);
      flashes.archetype[count] = enemies.archetype[enemyIndex]!;
      flashes.role[count] = enemies.role[enemyIndex]!;
      // Three retained samples preserve the ordinary hit confirmation while
      // the global admission budget prevents a swarm-wide white strobe.
      flashes.opacity[count] = ENEMY_HIT_FLASH_AGE_OPACITY[age]!;
      count++;
    }
    flashes.count = count;
  }

  function reset(): void {
    active.fill(0);
    entityId.fill(0);
    startTick.fill(0);
    lookupIndexBySlot.fill(0);
    lookupStampBySlot.fill(0);
    lookupStamp = 0;
    lastFlashEntityBySlot.fill(0);
    lastFlashTickBySlot.fill(0);
    lastFlashValidBySlot.fill(0);
    seenIdentities.fill(0);
    seenCount = 0;
    nextSeen = 0;
    flashes.count = 0;
    frame.tick = 0;
    lastRenderTick = -1;
  }

  return {
    capacity,
    maxConcurrent,
    maxNewPerTick,
    update(events, enemies, renderTick) {
      const tick = normalizedTick(renderTick);
      if (tick < lastRenderTick) reset();
      lastRenderTick = tick;
      const lookupStampForFrame = buildEnemyLookup(enemies);
      releaseExpired(tick);
      addEvents(events, enemies, tick, lookupStampForFrame);
      packActive(enemies, tick, lookupStampForFrame);
      frame.tick = tick;
      return frame;
    },
    reset,
  };
}
