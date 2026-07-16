/**
 * Renderer-only attachment sockets for Greg's audited fox skeleton.
 *
 * Socket names are gameplay-facing and stable; imported bone names are not.
 * Each socket resolves its preferred audited bone once, falling back through
 * the listed candidates and ultimately to the supplied hero root. This keeps
 * upgrades visible even when a preview/placeholder model has no skeleton.
 * Nothing in this module reads or writes simulation state.
 */

import type { ChimeraSeamAttachmentPresentation } from './chimera-seam-presentation';

export type GregSocketName =
  | 'head'
  | 'back'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'tail'
  | 'bodyOrbit';

export type AttachmentId = number & { readonly __attachmentId: unique symbol };

export interface AttachmentNode {
  readonly name: string;
  readonly children?: readonly AttachmentNode[];
}

export interface SocketTransform {
  readonly position: readonly [x: number, y: number, z: number];
  readonly euler: readonly [x: number, y: number, z: number];
  readonly scale: readonly [x: number, y: number, z: number];
}

export interface AttachmentRequest {
  /** Data-defined visual key, for example `acorn-crown` or `primitive:sphere`. */
  readonly visualKey: string;
  readonly socket: GregSocketName;
  /**
   * Optional renderer-only metadata for the finite Chimera seam recipe. It is
   * copied from the immutable simulation snapshot and never fed back into it.
   */
  readonly chimeraSeam?: ChimeraSeamAttachmentPresentation;
}

/**
 * Adapter implemented by PlayCanvas (or by a test/preview placeholder).
 * `create` may return a primitive entity while final art is unavailable.
 */
export interface GregAttachmentFactory<N extends AttachmentNode, V> {
  create(request: AttachmentRequest): V;
  mount(view: V, parent: N, transform: SocketTransform): void;
  unmount(view: V): void;
  destroy(view: V): void;
}

export interface ResolvedGregSocket<N extends AttachmentNode> {
  readonly name: GregSocketName;
  readonly parent: N;
  readonly resolvedBoneName: string | null;
  readonly usedHeroRootFallback: boolean;
  readonly transform: SocketTransform;
}

export interface GregAttachmentSockets<N extends AttachmentNode> {
  readonly sockets: Readonly<Record<GregSocketName, ResolvedGregSocket<N>>>;
  /**
   * Mounts one renderer-only attachment. Multiple views may share a gameplay
   * socket: Wild Splice preserves both parent silhouettes on that anchor.
   */
  attach(
    socket: GregSocketName,
    visualKey: string,
    chimeraSeam?: ChimeraSeamAttachmentPresentation,
  ): AttachmentId;
  /** Stale or already-detached ids are harmless and return false. */
  detach(id: AttachmentId): boolean;
  /** Unmount and destroy every currently attached visual. */
  clear(): void;
  readonly attachmentCount: number;
}

interface SocketDefinition {
  readonly name: GregSocketName;
  readonly boneCandidates: readonly string[];
  readonly transform: SocketTransform;
}

function frozenTransform(
  position: readonly [number, number, number],
  euler: readonly [number, number, number] = [0, 0, 0],
  scale: readonly [number, number, number] = [1, 1, 1],
): SocketTransform {
  return Object.freeze({
    position: Object.freeze([...position]) as unknown as readonly [number, number, number],
    euler: Object.freeze([...euler]) as unknown as readonly [number, number, number],
    scale: Object.freeze([...scale]) as unknown as readonly [number, number, number],
  });
}

/** Exactly six gameplay sockets. Offsets are local to the resolved parent. */
const DEFINITIONS: readonly SocketDefinition[] = Object.freeze([
  { name: 'head', boneCandidates: ['Head', 'Neck3', 'Neck2', 'Neck1'], transform: frozenTransform([0, 0.12, 0]) },
  { name: 'back', boneCandidates: ['Back', 'Body'], transform: frozenTransform([0, 0.1, 0]) },
  { name: 'leftShoulder', boneCandidates: ['FrontShoulder.L', 'Body'], transform: frozenTransform([0, 0, 0]) },
  { name: 'rightShoulder', boneCandidates: ['FrontShoulder.R', 'Body'], transform: frozenTransform([0, 0, 0]) },
  { name: 'tail', boneCandidates: ['Tail4', 'Tail3', 'Tail2', 'Tail1', 'Tail5', 'Tail6', 'Tail7', 'Tail8'], transform: frozenTransform([0, 0, 0]) },
  { name: 'bodyOrbit', boneCandidates: ['Body', 'Back'], transform: frozenTransform([0, 0, 0]) },
]);

const SOCKET_NAMES: readonly GregSocketName[] = DEFINITIONS.map((definition) => definition.name);

function findNamedNode<N extends AttachmentNode>(root: N, name: string): N | undefined {
  if (root.name === name) return root;
  for (const child of root.children ?? []) {
    const found = findNamedNode(child as N, name);
    if (found !== undefined) return found;
  }
  return undefined;
}

interface Mounted<V> {
  readonly socket: GregSocketName;
  readonly id: AttachmentId;
  readonly view: V;
}

export function createGregAttachmentSockets<N extends AttachmentNode, V>(
  heroRoot: N,
  factory: GregAttachmentFactory<N, V>,
): GregAttachmentSockets<N> {
  const resolved = {} as Record<GregSocketName, ResolvedGregSocket<N>>;
  for (const definition of DEFINITIONS) {
    let parent: N | undefined;
    let resolvedBoneName: string | null = null;
    for (const candidate of definition.boneCandidates) {
      parent = findNamedNode(heroRoot, candidate);
      if (parent !== undefined) {
        resolvedBoneName = candidate;
        break;
      }
    }
    resolved[definition.name] = Object.freeze({
      name: definition.name,
      parent: parent ?? heroRoot,
      resolvedBoneName,
      usedHeroRootFallback: parent === undefined,
      transform: definition.transform,
    });
  }

  const mounted = new Map<AttachmentId, Mounted<V>>();
  let nextId = 1;

  function allocateId(): AttachmentId {
    // The attachment set is tiny and bounded by presentation state. Still
    // avoid ever issuing zero or colliding after an extremely long session.
    do {
      nextId = (nextId + 1) >>> 0;
      if (nextId === 0) nextId = 1;
    } while (mounted.has(nextId as AttachmentId));
    return nextId as AttachmentId;
  }

  function release(id: AttachmentId): boolean {
    const current = mounted.get(id);
    if (current === undefined) return false;
    factory.unmount(current.view);
    factory.destroy(current.view);
    mounted.delete(id);
    return true;
  }

  return {
    sockets: Object.freeze(resolved),
    attach(socket, visualKey, chimeraSeam) {
      const slot = SOCKET_NAMES.indexOf(socket);
      // SocketName is a closed union; this protects untyped runtime callers.
      if (slot < 0) throw new Error(`Unknown Greg attachment socket: ${String(socket)}`);
      if (visualKey.length === 0) throw new Error('Attachment visualKey must not be empty');

      const view = factory.create({ visualKey, socket, chimeraSeam });
      const id = allocateId();
      try {
        factory.mount(view, resolved[socket].parent, resolved[socket].transform);
      } catch (error) {
        factory.destroy(view);
        throw error;
      }
      mounted.set(id, { id, socket, view });
      return id;
    },
    detach(id) {
      return release(id) === true;
    },
    clear() {
      for (const id of [...mounted.keys()]) release(id);
    },
    get attachmentCount() {
      return mounted.size;
    },
  };
}
