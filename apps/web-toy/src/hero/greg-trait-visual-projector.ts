import type { TraitVisualAttachmentView } from '@sim';
import type {
  AttachmentId,
  GregAttachmentSockets,
  GregSocketName,
} from './greg-attachment-sockets';
import {
  getGregAttachmentVisualRecipe,
  isGregAttachmentVisualKey,
} from './greg-attachment-visuals';

const GREG_SOCKETS = new Set<string>([
  'head', 'back', 'leftShoulder', 'rightShoulder', 'tail', 'bodyOrbit',
]);

const ANCHOR_BY_VISUAL_KEY: Readonly<Record<string, GregSocketName>> = Object.freeze({
  'porcupine-quills:bud': 'back',
  'porcupine-quills:adapted': 'back',
  'puffer-pouch:bud': 'head',
  'puffer-pouch:adapted': 'head',
  'thornstorm-mantle:mythic': 'back',
});

interface MountedVisual {
  readonly id: AttachmentId;
  readonly signature: string;
}

/**
 * Projects immutable simulation-owned trait state onto Greg's renderer-only
 * sockets. Multi-socket sources reserve every declared socket but mount their
 * single combined recipe at its authored anchor.
 */
export function createGregTraitVisualProjector<N>(
  sockets: Pick<GregAttachmentSockets<N & { readonly name: string }>, 'attach' | 'detach'>,
): { sync(state: readonly TraitVisualAttachmentView[]): void; clear(): void } {
  const mounted = new Map<GregSocketName, MountedVisual>();

  function clear(): void {
    for (const visual of mounted.values()) sockets.detach(visual.id);
    mounted.clear();
  }

  return {
    sync(state) {
      const occupied = new Map<GregSocketName, string>();
      const desired = new Map<GregSocketName, string>();

      for (const visual of state) {
        if (!visual.enabled || visual.sourceId.length === 0 || !isGregAttachmentVisualKey(visual.visualKey)) continue;
        const recipe = getGregAttachmentVisualRecipe(visual.visualKey);
        const anchor = ANCHOR_BY_VISUAL_KEY[visual.visualKey];
        if (anchor === undefined || recipe.stage !== visual.stage || !visual.sockets.includes(anchor)) continue;

        const declaredSockets = visual.sockets.filter(
          (socket): socket is GregSocketName => GREG_SOCKETS.has(socket),
        );
        if (declaredSockets.length !== visual.sockets.length) continue;
        if (declaredSockets.some((socket) => occupied.has(socket))) continue;
        for (const socket of declaredSockets) occupied.set(socket, visual.sourceId);
        desired.set(anchor, `${visual.sourceId}\u0000${visual.stage}\u0000${visual.visualKey}`);
      }

      for (const [socket, current] of mounted) {
        if (desired.get(socket) !== current.signature || !occupied.has(socket)) {
          sockets.detach(current.id);
          mounted.delete(socket);
        }
      }
      for (const [socket, signature] of desired) {
        if (mounted.get(socket)?.signature === signature) continue;
        const visualKey = signature.slice(signature.lastIndexOf('\u0000') + 1);
        mounted.set(socket, { id: sockets.attach(socket, visualKey), signature });
      }
    },
    clear,
  };
}
