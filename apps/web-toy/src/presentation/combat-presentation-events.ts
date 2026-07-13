/**
 * App-owned read-only view of transient combat feedback.
 *
 * The simulation may reuse its event storage on the next fixed step. The
 * simulation driver copies validated records into this shape for the renderer;
 * no renderer is ever allowed to feed these values back into gameplay.
 */
export const COMBAT_PRESENTATION_EVENT_KINDS = [
  'enemyHit',
  'playerHit',
  'heal',
  'shieldAbsorb',
  'shieldBreak',
  'armorBlock',
  'dodge',
  'pickup',
] as const;

export type CombatPresentationEventKind = (typeof COMBAT_PRESENTATION_EVENT_KINDS)[number];

export interface CombatPresentationEventView {
  readonly kind: CombatPresentationEventKind;
  readonly tick: number;
  readonly x: number;
  readonly y: number;
  readonly amount: number;
  readonly critical: boolean;
  readonly sourceId: string;
  /** Simulation ids are numeric; small legacy feeds may use string ids. */
  readonly targetId: string | number;
  readonly pickupKind: string | null;
}

const EVENT_KIND_SET: ReadonlySet<string> = new Set(COMBAT_PRESENTATION_EVENT_KINDS);

/**
 * Keeps a missing or partially deployed simulation event stream harmless. This
 * lets the presentation ship ahead of the V1.1 combat implementation without
 * inventing hits from snapshots or altering deterministic game state.
 */
export function isCombatPresentationEventView(value: unknown): value is CombatPresentationEventView {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return EVENT_KIND_SET.has(event.kind as string)
    && typeof event.tick === 'number' && Number.isFinite(event.tick)
    && typeof event.x === 'number' && Number.isFinite(event.x)
    && typeof event.y === 'number' && Number.isFinite(event.y)
    && typeof event.amount === 'number' && Number.isFinite(event.amount)
    && typeof event.critical === 'boolean'
    && typeof event.sourceId === 'string'
    && (typeof event.targetId === 'string' || (typeof event.targetId === 'number' && Number.isFinite(event.targetId)))
    && (typeof event.pickupKind === 'string' || event.pickupKind === null);
}
