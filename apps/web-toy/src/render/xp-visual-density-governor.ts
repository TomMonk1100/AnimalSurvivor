/**
 * Deterministic density governor for the optional illustrated reward accents.
 *
 * The simulation retains every XP pickup. The renderer keeps every physical
 * marker while the field is calm, then retains a stable representative set
 * once a pile becomes dense. That preserves a visible reward trail without a
 * cyan carpet competing with attacks and enemy silhouettes. Illustrated
 * accents and halos use smaller independent budgets on top of that base lane.
 */
import { idSlot } from '@sim';

// Rewards must remain easy to collect by sight, but a late-run carpet of
// cyan cannot outrank an attack body or an enemy silhouette. These are
// decorative-card budgets only: every authoritative pickup still has its
// physical mint marker.
export const XP_PHYSICAL_MARKER_CAP = 96;
export const XP_ILLUSTRATED_ACCENT_CAP = 36;
export const XP_ILLUSTRATED_HALO_CAP = 12;

function normalizedLiveCount(value: number): number {
  return Math.max(0, Number.isFinite(value) ? Math.floor(value) : 0);
}

function retained(id: number, liveCount: number, cap: number): boolean {
  const count = normalizedLiveCount(liveCount);
  if (count <= cap) return true;
  const stride = Math.ceil(count / cap);
  return idSlot(id) % stride === 0;
}

/** Keeps all nearby-looking physical markers until a true pickup carpet forms. */
export function shouldRenderXpPhysicalMarker(id: number, liveCount: number): boolean {
  return retained(id, liveCount, XP_PHYSICAL_MARKER_CAP);
}

/** Keeps at most approximately 36 painted XP accents at high density. */
export function shouldRenderXpIllustratedAccent(id: number, liveCount: number): boolean {
  return retained(id, liveCount, XP_ILLUSTRATED_ACCENT_CAP);
}

/** Halos are more expensive in the brightness budget than body accents. */
export function shouldRenderXpIllustratedHalo(id: number, liveCount: number): boolean {
  return retained(id, liveCount, XP_ILLUSTRATED_HALO_CAP);
}
