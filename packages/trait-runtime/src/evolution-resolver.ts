/**
 * AGENT B — OWNED.
 *
 * Deterministic Mythic recipe resolution.
 *
 * resolvePending scans evolutions in CATALOG order. It resolves AT MOST ONE
 * evolution per call (spec: "emits exactly one evolution event"). An evolution
 * resolves when:
 *   - it is not already in state.evolutions, AND
 *   - both ingredient traits are owned at stage 'adapted' and NOT disabled.
 *
 * On resolution (all mutations atomic; deterministic):
 *   - append { id, ingredients } to state.evolutions (resolution order);
 *   - set both ingredient traits' `disabled = true` (kept inspectable for
 *     save/debug; their behavior loops are dropped by behavior-runtime);
 *   - reassign every socket currently held by either ingredient to the
 *     evolution id (occupiedSockets stays occupied; sockets are not freed);
 *   - return the resolved evolution id.
 *
 * If nothing resolves, return null. Calling again after resolution must NOT
 * re-resolve the same evolution (idempotent), so applying duplicates after
 * Mythic never retriggers.
 */

import type { Catalog, RuntimeState } from './contracts.js';
import type { EvolutionId } from './ids.js';

export function resolvePending(_catalog: Catalog, _state: RuntimeState): EvolutionId | null {
  for (const evoDef of _catalog.evolutions) {
    if (_state.evolutions.some((e) => e.id === evoDef.id)) continue;

    const [ingredientAId, ingredientBId] = evoDef.ingredients;
    const ownedA = _state.owned.find((o) => o.id === ingredientAId);
    const ownedB = _state.owned.find((o) => o.id === ingredientBId);

    if (
      !ownedA ||
      !ownedB ||
      ownedA.stage !== 'adapted' ||
      ownedB.stage !== 'adapted' ||
      ownedA.disabled ||
      ownedB.disabled
    ) {
      continue;
    }

    _state.evolutions.push({ id: evoDef.id, ingredients: [ingredientAId, ingredientBId] });
    ownedA.disabled = true;
    ownedB.disabled = true;

    for (const socket of Object.keys(_state.sockets) as (keyof typeof _state.sockets)[]) {
      const owner = _state.sockets[socket];
      if (owner === ingredientAId || owner === ingredientBId) {
        _state.sockets[socket] = evoDef.id;
      }
    }

    return evoDef.id;
  }

  return null;
}
