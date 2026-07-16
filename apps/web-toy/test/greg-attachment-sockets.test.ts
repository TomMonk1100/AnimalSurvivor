import { describe, expect, it } from 'vitest';
import { createGregAttachmentSockets } from '../src/hero/greg-attachment-sockets';
import type {
  AttachmentNode,
  AttachmentRequest,
  GregAttachmentFactory,
  SocketTransform,
} from '../src/hero/greg-attachment-sockets';

interface Node extends AttachmentNode {
  readonly children: readonly Node[];
}

interface View {
  readonly number: number;
  readonly request: AttachmentRequest;
}

interface Event {
  readonly action: 'create' | 'mount' | 'unmount' | 'destroy';
  readonly view: number;
  readonly parent?: string;
  readonly transform?: SocketTransform;
}

function node(name: string, children: readonly Node[] = []): Node {
  return { name, children };
}

function fixture(): { factory: GregAttachmentFactory<Node, View>; events: Event[] } {
  let next = 1;
  const events: Event[] = [];
  return {
    events,
    factory: {
      create(request) {
        const view = { number: next++, request };
        events.push({ action: 'create', view: view.number });
        return view;
      },
      mount(view, parent, transform) {
        events.push({ action: 'mount', view: view.number, parent: parent.name, transform });
      },
      unmount(view) {
        events.push({ action: 'unmount', view: view.number });
      },
      destroy(view) {
        events.push({ action: 'destroy', view: view.number });
      },
    },
  };
}

function auditedSkeleton(): Node {
  return node('GregRoot', [
    node('Body', [
      node('Back'),
      node('Neck1', [node('Neck2', [node('Neck3', [node('Head')])])]),
      node('FrontShoulder.L'),
      node('FrontShoulder.R'),
      node('Tail1', [node('Tail2', [node('Tail3', [node('Tail4')])])]),
    ]),
  ]);
}

describe('Greg attachment sockets', () => {
  it('resolves all six stable socket names to audited skeleton nodes', () => {
    const { factory } = fixture();
    const manager = createGregAttachmentSockets(auditedSkeleton(), factory);

    expect(Object.keys(manager.sockets)).toEqual([
      'head', 'back', 'leftShoulder', 'rightShoulder', 'tail', 'bodyOrbit',
    ]);
    expect(manager.sockets.head.parent.name).toBe('Head');
    expect(manager.sockets.back.parent.name).toBe('Back');
    expect(manager.sockets.leftShoulder.parent.name).toBe('FrontShoulder.L');
    expect(manager.sockets.rightShoulder.parent.name).toBe('FrontShoulder.R');
    expect(manager.sockets.tail.parent.name).toBe('Tail4');
    expect(manager.sockets.bodyOrbit.parent.name).toBe('Body');
    expect(Object.values(manager.sockets).every((socket) => !socket.usedHeroRootFallback)).toBe(true);
  });

  it('falls back to the hero root when named bones are absent', () => {
    const root = node('PlaceholderGreg');
    const { factory } = fixture();
    const manager = createGregAttachmentSockets(root, factory);

    for (const socket of Object.values(manager.sockets)) {
      expect(socket.parent).toBe(root);
      expect(socket.resolvedBoneName).toBeNull();
      expect(socket.usedHeroRootFallback).toBe(true);
    }
    manager.attach('head', 'primitive:sphere');
    expect(manager.attachmentCount).toBe(1);
  });

  it('permits multiple retained visuals on a shared Wild Splice socket', () => {
    const { factory, events } = fixture();
    const manager = createGregAttachmentSockets(auditedSkeleton(), factory);
    const oldId = manager.attach('head', 'acorn-cap');
    const newId = manager.attach('head', 'owl-crown');

    expect(newId).not.toBe(oldId);
    expect(manager.attachmentCount).toBe(2);
    expect(manager.detach(oldId)).toBe(true);
    expect(manager.attachmentCount).toBe(1);
    expect(events.map((event) => event.action)).toEqual([
      'create', 'mount', 'create', 'mount', 'unmount', 'destroy',
    ]);
    expect(events[1]?.parent).toBe('Head');
  });

  it('detaches only the exact live logical id and cleans up once', () => {
    const { factory, events } = fixture();
    const manager = createGregAttachmentSockets(auditedSkeleton(), factory);
    const id = manager.attach('tail', 'primitive:cone');

    expect(manager.detach(id)).toBe(true);
    expect(manager.detach(id)).toBe(false);
    expect(manager.attachmentCount).toBe(0);
    expect(events.filter((event) => event.action === 'unmount')).toHaveLength(1);
    expect(events.filter((event) => event.action === 'destroy')).toHaveLength(1);
  });

  it('clear releases every attachment while leaving empty sockets alone', () => {
    const { factory, events } = fixture();
    const manager = createGregAttachmentSockets(auditedSkeleton(), factory);
    manager.attach('head', 'one');
    manager.attach('back', 'two');
    manager.attach('bodyOrbit', 'three');

    manager.clear();
    manager.clear();

    expect(manager.attachmentCount).toBe(0);
    expect(events.filter((event) => event.action === 'unmount')).toHaveLength(3);
    expect(events.filter((event) => event.action === 'destroy')).toHaveLength(3);
  });

  it('uses frozen, stable local transforms across attachments', () => {
    const { factory, events } = fixture();
    const manager = createGregAttachmentSockets(auditedSkeleton(), factory);
    const stableTransform = manager.sockets.head.transform;
    manager.attach('head', 'first');
    manager.attach('head', 'second');

    const mounts = events.filter((event) => event.action === 'mount');
    expect(mounts[0]?.transform).toBe(stableTransform);
    expect(mounts[1]?.transform).toBe(stableTransform);
    expect(Object.isFrozen(stableTransform)).toBe(true);
    expect(Object.isFrozen(stableTransform.position)).toBe(true);
    expect(stableTransform.position).toEqual([0, 0.12, 0]);
  });
});
