import { describe, expect, it } from 'vitest';
import type { TraitVisualAttachmentView } from '@sim';
import { createGregAttachmentSockets } from '../src/hero/greg-attachment-sockets';
import type { AttachmentNode, AttachmentRequest } from '../src/hero/greg-attachment-sockets';
import { createGregTraitVisualProjector } from '../src/hero/greg-trait-visual-projector';

interface View { readonly request: AttachmentRequest }

function fixture() {
  const events: string[] = [];
  const root: AttachmentNode = { name: 'Greg' };
  const sockets = createGregAttachmentSockets(root, {
    create(request): View { events.push(`create:${request.socket}:${request.visualKey}`); return { request }; },
    mount(): void {},
    unmount(view): void { events.push(`unmount:${view.request.socket}:${view.request.visualKey}`); },
    destroy(): void {},
  });
  return { events, sockets, projector: createGregTraitVisualProjector(sockets) };
}

function visual(overrides: Partial<TraitVisualAttachmentView>): TraitVisualAttachmentView {
  return {
    sourceId: 'porcupine-quills', stage: 'bud', sockets: ['back'],
    visualKey: 'porcupine-quills:bud', enabled: true, ...overrides,
  };
}

describe('Greg trait visual projector', () => {
  it('mounts authoritative visuals once and replaces changed stages', () => {
    const { events, projector } = fixture();
    projector.sync([visual({})]);
    projector.sync([visual({})]);
    projector.sync([visual({ stage: 'adapted', visualKey: 'porcupine-quills:adapted' })]);

    expect(events).toEqual([
      'create:back:porcupine-quills:bud',
      'unmount:back:porcupine-quills:bud',
      'create:back:porcupine-quills:adapted',
    ]);
  });

  it('replaces two independent attachments with one anchored Mythic', () => {
    const { events, sockets, projector } = fixture();
    projector.sync([
      visual({ stage: 'adapted', visualKey: 'porcupine-quills:adapted' }),
      visual({ sourceId: 'puffer-pouch', stage: 'adapted', sockets: ['head'], visualKey: 'puffer-pouch:adapted' }),
    ]);
    projector.sync([
      visual({ sourceId: 'thornstorm-mantle', stage: 'mythic', sockets: ['head', 'back'], visualKey: 'thornstorm-mantle:mythic' }),
    ]);

    expect(sockets.attachmentCount).toBe(1);
    expect(events.slice(-3)).toEqual([
      'unmount:back:porcupine-quills:adapted',
      'unmount:head:puffer-pouch:adapted',
      'create:back:thornstorm-mantle:mythic',
    ]);
  });

  it('hides disabled and malformed or socket-conflicting entries', () => {
    const { events, projector } = fixture();
    projector.sync([
      visual({ enabled: false }),
      visual({ stage: 'adapted' }),
      visual({ sourceId: 'other', sockets: ['back'], visualKey: 'puffer-pouch:bud' }),
    ]);
    expect(events).toEqual([]);
  });
});
