import { describe, expect, it } from 'vitest';
import {
  projectTraitCueCallout,
  type TraitCueCalloutEvent,
} from '../src/presentation/trait-cue-callout';

function event(overrides: Partial<TraitCueCalloutEvent> = {}): TraitCueCalloutEvent {
  return {
    kind: 'spawnProjectileBurst',
    sourceId: 'porcupine-quills',
    tick: 120,
    tag: '',
    ...overrides,
  };
}

describe('trait cue callout projection', () => {
  it('explains Porcupine Quills with a low-priority quills callout', () => {
    const callout = projectTraitCueCallout(event());

    expect(callout).toEqual({
      key: 'trait:120:porcupine-quills:spawnProjectileBurst:',
      title: 'Porcupine Quills',
      detail: 'Quills fire toward the nearest enemy.',
      tone: 'quills',
      expiresAtTick: 156,
    });
  });

  it('distinguishes Puffer Pouch pull and push pulses', () => {
    expect(projectTraitCueCallout(event({
      sourceId: 'puffer-pouch', kind: 'areaGather', tick: 30,
    }))).toMatchObject({
      title: 'Puffer Pouch', detail: 'Inhale pulls nearby enemies toward Greg.', tone: 'gather', expiresAtTick: 102,
    });
    expect(projectTraitCueCallout(event({
      sourceId: 'puffer-pouch', kind: 'areaKnockback', tick: 30,
    }))).toMatchObject({
      title: 'Puffer Pouch', detail: 'Blast pushes nearby enemies away.', tone: 'knockback', expiresAtTick: 102,
    });
  });

  it('shows the authored Thornstorm sequence in plain language', () => {
    expect(projectTraitCueCallout(event({
      sourceId: 'thornstorm-mantle', kind: 'telegraph', tag: 'thornstorm-inhale', tick: 200,
    }))).toMatchObject({
      title: 'Thornstorm Mantle', detail: 'Inhale: enemies will be pulled in.', tone: 'mythic', expiresAtTick: 290,
    });
    expect(projectTraitCueCallout(event({
      sourceId: 'thornstorm-mantle', kind: 'areaGather', tick: 220,
    }))).toMatchObject({
      detail: 'Gathering enemies for the quill storm.', tone: 'gather', expiresAtTick: 292,
    });
    expect(projectTraitCueCallout(event({
      sourceId: 'thornstorm-mantle', kind: 'radialProjectileBurst', tick: 235,
    }))).toMatchObject({
      detail: 'Quill storm bursts in every direction.', tone: 'mythic', expiresAtTick: 325,
    });
  });

  it('uses deterministic keys and ignores commands outside the supported slice', () => {
    const first = projectTraitCueCallout(event({ tick: 77 }));
    const second = projectTraitCueCallout(event({ tick: 77 }));
    expect(first?.key).toBe(second?.key);

    expect(projectTraitCueCallout(event({ sourceId: 'thornstorm-mantle', kind: 'telegraph', tag: 'other' }))).toBeNull();
    expect(projectTraitCueCallout(event({ sourceId: 'puffer-pouch', kind: 'radialProjectileBurst' }))).toBeNull();
    expect(projectTraitCueCallout(event({ sourceId: 'other-trait', kind: 'areaGather' }))).toBeNull();
  });
});
