/**
 * Deterministic legacy socket projection.
 *
 * Wild Splice permits multiple acquired traits to share a visual socket so
 * every unordered Master pair remains reachable. `RuntimeState.sockets` keeps
 * its public one-owner shape as a stable *primary* projection: the earliest
 * active record claiming a socket wins. Full visual claims are derived from
 * active trait/evolution records by renderer-facing code.
 */

import type { Catalog, RuntimeState } from './contracts.js';
import type { SocketId } from './ids.js';

function claim(
  projected: Partial<Record<SocketId, string>>,
  socket: SocketId,
  ownerId: string,
): void {
  if (projected[socket] === undefined) projected[socket] = ownerId;
}

/** Returns the stable primary socket projection without mutating runtime state. */
export function socketProjectionFor(
  catalog: Catalog,
  state: RuntimeState,
): Partial<Record<SocketId, string>> {
  const projected: Partial<Record<SocketId, string>> = {};
  for (const owned of state.owned) {
    if (owned.disabled) continue;
    const trait = catalog.traits.find((candidate) => candidate.id === owned.id);
    if (trait === undefined) continue;
    for (const socket of trait.sockets) claim(projected, socket, owned.id);
  }
  for (const evolution of state.evolutions) {
    // Every generated and authored fusion occupies the union of its parents;
    // resolving by ingredients makes this projection independent of dynamic
    // synthesis availability during defensive save recovery.
    for (const ingredient of evolution.ingredients) {
      const trait = catalog.traits.find((candidate) => candidate.id === ingredient);
      if (trait === undefined) continue;
      for (const socket of trait.sockets) claim(projected, socket, evolution.id);
    }
  }
  return projected;
}

/** Rebuilds the legacy primary projection after an ownership transition. */
export function rebuildSocketProjection(catalog: Catalog, state: RuntimeState): void {
  state.sockets = socketProjectionFor(catalog, state);
}
