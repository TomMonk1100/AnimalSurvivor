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
import type { ChimeraSeamAttachmentPresentation } from './chimera-seam-presentation';

const GREG_SOCKETS = new Set<string>([
  'head', 'back', 'leftShoulder', 'rightShoulder', 'tail', 'bodyOrbit',
]);

const ANCHOR_BY_VISUAL_KEY: Readonly<Record<string, GregSocketName>> = Object.freeze({
  'porcupine-quills:bud': 'back',
  'porcupine-quills:adapted': 'back',
  'puffer-pouch:bud': 'head',
  'puffer-pouch:adapted': 'head',
  'thornstorm-mantle:mythic': 'back',
  'electric-eel-coil:bud': 'tail',
  'electric-eel-coil:adapted': 'tail',
  'firefly-colony:bud': 'bodyOrbit',
  'firefly-colony:adapted': 'bodyOrbit',
  'mantis-scythes:bud': 'leftShoulder',
  'mantis-scythes:adapted': 'leftShoulder',
  'gecko-pads:bud': 'rightShoulder',
  'gecko-pads:adapted': 'rightShoulder',
  'thunderbug-dynamo:mythic': 'tail',
  // The combined form owns both shoulders but has one stable root: the left
  // shoulder, which avoids mount churn while still reserving the right one.
  'razorstep-chimera:mythic': 'leftShoulder',
  'owl-pinions:bud': 'leftShoulder',
  'owl-pinions:adapted': 'leftShoulder',
  'bat-ears:bud': 'head',
  'bat-ears:adapted': 'head',
  'midnight-radar:mythic': 'leftShoulder',
  'crab-pincers:bud': 'leftShoulder',
  'crab-pincers:adapted': 'leftShoulder',
  'armadillo-greaves:bud': 'back',
  'armadillo-greaves:adapted': 'back',
  'meteor-mauler:mythic': 'leftShoulder',
  'skunk-brush:bud': 'tail',
  'skunk-brush:adapted': 'tail',
  'monarch-brood:bud': 'bodyOrbit',
  'monarch-brood:adapted': 'bodyOrbit',
  'royal-stinkcloud:mythic': 'tail',
  'chimera-seam:mythic': 'bodyOrbit',
});

interface MountedVisual {
  readonly socket: GregSocketName;
  readonly id: AttachmentId;
  readonly visualKey: string;
  /** Recreate a seam only when its published parent/temperament projection changes. */
  readonly presentationKey: string | null;
}

interface DesiredVisual {
  readonly socket: GregSocketName;
  readonly visualKey: string;
  readonly chimeraSeam?: ChimeraSeamAttachmentPresentation;
  readonly presentationKey: string | null;
}

function seamPresentationFor(
  visual: TraitVisualAttachmentView,
): ChimeraSeamAttachmentPresentation | null {
  if (visual.stage !== 'mythic' || visual.chimeraParents === undefined) return null;
  const [first, second] = visual.chimeraParents;
  if (
    typeof first !== 'string'
    || typeof second !== 'string'
    || first.length === 0
    || second.length === 0
    || first === second
  ) {
    return null;
  }
  return Object.freeze({
    sourceId: visual.sourceId,
    parents: Object.freeze([first, second]) as unknown as readonly [string, string],
    temperamentId: typeof visual.temperamentId === 'string' && visual.temperamentId.length > 0
      ? visual.temperamentId
      : null,
  });
}

function seamPresentationKey(presentation: ChimeraSeamAttachmentPresentation): string {
  return [
    presentation.sourceId,
    presentation.parents[0],
    presentation.parents[1],
    presentation.temperamentId ?? '',
  ].join('\u0000');
}

/**
 * Projects immutable simulation-owned trait state onto Greg's renderer-only
 * sockets. Wild Splice deliberately permits visual socket sharing, so every
 * valid read-only attachment is mounted independently at its authored anchor.
 */
export function createGregTraitVisualProjector<N>(
  sockets: Pick<GregAttachmentSockets<N & { readonly name: string }>, 'attach' | 'detach'>,
): { sync(state: readonly TraitVisualAttachmentView[]): void; clear(): void } {
  const mounted = new Map<string, MountedVisual>();

  function clear(): void {
    for (const visual of mounted.values()) sockets.detach(visual.id);
    mounted.clear();
  }

  return {
    sync(state) {
      const desired = new Map<string, DesiredVisual>();

      for (const visual of state) {
        if (!visual.enabled || visual.sourceId.length === 0) continue;
        if (isGregAttachmentVisualKey(visual.visualKey)) {
          const recipe = getGregAttachmentVisualRecipe(visual.visualKey);
          const anchor = ANCHOR_BY_VISUAL_KEY[visual.visualKey];
          const expectedSource = visual.visualKey.slice(0, visual.visualKey.lastIndexOf(':'));
          if (
            anchor === undefined
            || recipe.stage !== visual.stage
            || !visual.sockets.includes(anchor)
            || (!visual.visualOnly && visual.chimeraParents === undefined && visual.sourceId !== expectedSource)
          ) {
            continue;
          }
          const declaredSockets = visual.sockets.filter(
            (socket): socket is GregSocketName => GREG_SOCKETS.has(socket),
          );
          if (declaredSockets.length !== visual.sockets.length) continue;
          const signature = `${visual.sourceId}\u0000${visual.stage}\u0000${visual.visualKey}\u0000${visual.visualOnly === true ? 'parent' : 'main'}`;
          desired.set(signature, {
            socket: anchor,
            visualKey: visual.visualKey,
            presentationKey: null,
          });
        }

        // Generated Chimeras have no finite per-pair attachment atlas. Their
        // retained parent views carry the silhouettes; this one reusable seam
        // supplies the visible splice connection and temperament cadence cue.
        if (visual.visualOnly !== true) {
          const seam = seamPresentationFor(visual);
          if (seam !== null) {
            const presentationKey = seamPresentationKey(seam);
            const signature = `${visual.sourceId}\u0000chimera-seam\u0000${presentationKey}`;
            desired.set(signature, {
              socket: 'bodyOrbit',
              visualKey: 'chimera-seam:mythic',
              chimeraSeam: seam,
              presentationKey,
            });
          }
        }
      }

      for (const [signature, current] of mounted) {
        const next = desired.get(signature);
        if (
          next === undefined
          || next.socket !== current.socket
          || next.visualKey !== current.visualKey
          || next.presentationKey !== current.presentationKey
        ) {
          sockets.detach(current.id);
          mounted.delete(signature);
        }
      }
      for (const [signature, next] of desired) {
        if (mounted.has(signature)) continue;
        mounted.set(signature, {
          id: sockets.attach(next.socket, next.visualKey, next.chimeraSeam),
          socket: next.socket,
          visualKey: next.visualKey,
          presentationKey: next.presentationKey,
        });
      }
    },
    clear,
  };
}
