import { describe, expect, it } from 'vitest';
import type { TraitVisualAttachmentView } from '@sim';
import { createGregAttachmentSockets } from '../src/hero/greg-attachment-sockets';
import type { AttachmentNode, AttachmentRequest } from '../src/hero/greg-attachment-sockets';
import { createGregTraitVisualProjector } from '../src/hero/greg-trait-visual-projector';

interface View { readonly request: AttachmentRequest }

function fixture() {
  const events: string[] = [];
  const requests: AttachmentRequest[] = [];
  const root: AttachmentNode = { name: 'Greg' };
  const sockets = createGregAttachmentSockets(root, {
    create(request): View {
      requests.push(request);
      events.push(`create:${request.socket}:${request.visualKey}`);
      return { request };
    },
    mount(): void {},
    unmount(view): void { events.push(`unmount:${view.request.socket}:${view.request.visualKey}`); },
    destroy(): void {},
  });
  return { events, requests, sockets, projector: createGregTraitVisualProjector(sockets) };
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

  it('anchors Mantis Scythes to Greg\'s left shoulder', () => {
    const { events, projector } = fixture();
    projector.sync([
      visual({
        sourceId: 'mantis-scythes',
        stage: 'bud',
        sockets: ['leftShoulder'],
        visualKey: 'mantis-scythes:bud',
      }),
    ]);
    expect(events).toEqual(['create:leftShoulder:mantis-scythes:bud']);
  });

  it('anchors Gecko Pads to Greg\'s right shoulder', () => {
    const { events, projector } = fixture();
    projector.sync([
      visual({
        sourceId: 'gecko-pads',
        stage: 'adapted',
        sockets: ['rightShoulder'],
        visualKey: 'gecko-pads:adapted',
      }),
    ]);
    expect(events).toEqual(['create:rightShoulder:gecko-pads:adapted']);
  });

  it('anchors Razorstep at the left shoulder without hiding a shared-socket attachment', () => {
    const { events, sockets, projector } = fixture();
    projector.sync([
      visual({
        sourceId: 'razorstep-chimera',
        stage: 'mythic',
        sockets: ['leftShoulder', 'rightShoulder'],
        visualKey: 'razorstep-chimera:mythic',
      }),
      visual({
        sourceId: 'gecko-pads',
        stage: 'adapted',
        sockets: ['rightShoulder'],
        visualKey: 'gecko-pads:adapted',
      }),
    ]);

    expect(events).toEqual([
      'create:leftShoulder:razorstep-chimera:mythic',
      'create:rightShoulder:gecko-pads:adapted',
    ]);
    expect(sockets.attachmentCount).toBe(2);
  });

  it('retains both fused Master parents and adds one reusable splice seam', () => {
    const { events, requests, sockets, projector } = fixture();
    projector.sync([
      visual({
        sourceId: 'thornstorm-mantle',
        stage: 'mythic',
        sockets: ['head', 'back'],
        visualKey: 'thornstorm-mantle:mythic',
        chimeraParents: ['porcupine-quills', 'puffer-pouch'],
      }),
      visual({
        sourceId: 'porcupine-quills',
        stage: 'adapted',
        sockets: ['back'],
        visualKey: 'porcupine-quills:adapted',
        visualOnly: true,
      }),
      visual({
        sourceId: 'puffer-pouch',
        stage: 'adapted',
        sockets: ['head'],
        visualKey: 'puffer-pouch:adapted',
        visualOnly: true,
      }),
    ]);

    expect(events).toEqual([
      'create:back:thornstorm-mantle:mythic',
      'create:bodyOrbit:chimera-seam:mythic',
      'create:back:porcupine-quills:adapted',
      'create:head:puffer-pouch:adapted',
    ]);
    expect(requests.find((request) => request.visualKey === 'chimera-seam:mythic')?.chimeraSeam)
      .toEqual({
        sourceId: 'thornstorm-mantle',
        parents: ['porcupine-quills', 'puffer-pouch'],
        temperamentId: null,
      });
    expect(sockets.attachmentCount).toBe(4);
  });

  it('rebinds a generated seam when immutable temperament metadata changes', () => {
    const { events, requests, projector } = fixture();
    const generated = visual({
      sourceId: 'chimera:porcupine-quills+electric-eel-coil',
      stage: 'mythic',
      sockets: ['back', 'tail'],
      visualKey: 'chimera:porcupine-quills+electric-eel-coil:mythic',
      chimeraParents: ['porcupine-quills', 'electric-eel-coil'],
      temperamentId: 'steady',
    });
    projector.sync([generated]);
    projector.sync([{ ...generated, temperamentId: 'apex-whisper' }]);

    expect(events).toEqual([
      'create:bodyOrbit:chimera-seam:mythic',
      'unmount:bodyOrbit:chimera-seam:mythic',
      'create:bodyOrbit:chimera-seam:mythic',
    ]);
    expect(requests.map((request) => request.chimeraSeam?.temperamentId)).toEqual([
      'steady',
      'apex-whisper',
    ]);
  });

  it('does not synthesize a seam from malformed parent metadata', () => {
    const { events, projector } = fixture();
    projector.sync([
      visual({
        sourceId: 'chimera:puffer-pouch+bat-ears',
        stage: 'mythic',
        sockets: ['head'],
        visualKey: 'chimera:puffer-pouch+bat-ears:mythic',
        chimeraParents: ['puffer-pouch', 'puffer-pouch'],
      }),
    ]);
    expect(events).toEqual([]);
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
