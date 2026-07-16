import { describe, expect, it } from 'vitest';
import {
  FUSION_ANNOUNCEMENT_HEADING,
  FUSION_ANNOUNCER_FLAVOR_LINES,
  getFusionAnnouncerFlavor,
  presentFusionAnnouncement,
  resolveFusionFlavorIndex,
} from '../src/presentation/fusion-announcer';

describe('fusion announcer copy', () => {
  it('keeps the ten plan-authored family-clean lines intact', () => {
    expect(FUSION_ANNOUNCER_FLAVOR_LINES).toHaveLength(10);
    expect(FUSION_ANNOUNCER_FLAVOR_LINES[0]).toBe('Two attacks entered the chamber. One attack left. Math has been notified.');
    expect(FUSION_ANNOUNCER_FLAVOR_LINES[9]).toBe('Legally, this is still one attack. Physically, it is a situation.');
    expect(Object.isFrozen(FUSION_ANNOUNCER_FLAVOR_LINES)).toBe(true);
  });

  it('uses a deterministic bounded flavor index with a stable legacy fallback', () => {
    expect(resolveFusionFlavorIndex(0)).toBe(0);
    expect(resolveFusionFlavorIndex(11)).toBe(1);
    expect(resolveFusionFlavorIndex(-1)).toBe(9);
    expect(resolveFusionFlavorIndex(2.5)).toBe(0);
    expect(resolveFusionFlavorIndex(undefined)).toBe(0);
    expect(getFusionAnnouncerFlavor(17)).toBe(FUSION_ANNOUNCER_FLAVOR_LINES[7]);
  });

  it('projects toast-ready copy from future fusion fields', () => {
    const announcement = presentFusionAnnouncement({
      evolutionId: 'circuit-breaker',
      ingredients: ['electric-eel-coil', 'crab-pincers'],
      displayName: 'SHOW-OFF CIRCUIT BREAKER (Mythic)',
      pairKind: 'wild',
      flavorIndex: 7,
    });

    expect(announcement).toEqual({
      heading: FUSION_ANNOUNCEMENT_HEADING,
      name: 'SHOW-OFF CIRCUIT BREAKER (Mythic)',
      detail: "SHOW-OFF CIRCUIT BREAKER (Mythic) has joined your body's growing committee of opinions.",
      flavor: 'Spicy. Dangerously, deliciously spicy. The jalapeño of fusions.',
      flavorIndex: 7,
    });
    expect(Object.isFrozen(announcement)).toBe(true);
  });

  it('gives legacy offers deterministic generic announcement copy', () => {
    const announcement = presentFusionAnnouncement({
      evolutionId: 'thornstorm-mantle',
      ingredients: ['porcupine-quills', 'puffer-pouch'],
    });

    expect(announcement).toMatchObject({
      heading: 'FUSION COMPLETE.',
      name: 'Thornstorm Mantle',
      detail: "Thornstorm Mantle has joined your body's growing committee of opinions.",
      flavor: FUSION_ANNOUNCER_FLAVOR_LINES[0],
      flavorIndex: 0,
    });
  });
});
