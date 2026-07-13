/** Presentation-only palettes unlocked by discovering Mythic final forms. */

export const PALETTE_IDS = Object.freeze([
  'forest',
  'thornstorm-mantle',
  'thunderbug-dynamo',
  'razorstep-chimera',
  'midnight-radar',
  'meteor-mauler',
  'royal-stinkcloud',
] as const);

export type PaletteId = (typeof PALETTE_IDS)[number];

export interface PaletteDefinition {
  readonly id: PaletteId;
  readonly displayName: string;
  readonly primary: string;
  readonly accent: string;
  readonly glow: string;
}

const PALETTE_CATALOG: Readonly<Record<PaletteId, PaletteDefinition>> = Object.freeze({
  forest: Object.freeze({
    id: 'forest',
    displayName: 'Forest Arsenal',
    primary: '#254f3d',
    accent: '#8bd8bb',
    glow: '#c9f26b',
  }),
  'thornstorm-mantle': Object.freeze({
    id: 'thornstorm-mantle',
    displayName: 'Thornstorm Mantle',
    primary: '#57401c',
    accent: '#f1c27d',
    glow: '#f7e08b',
  }),
  'thunderbug-dynamo': Object.freeze({
    id: 'thunderbug-dynamo',
    displayName: 'Thunderbug Dynamo',
    primary: '#174b70',
    accent: '#8ee8ff',
    glow: '#d9ff8f',
  }),
  'razorstep-chimera': Object.freeze({
    id: 'razorstep-chimera',
    displayName: 'Razorstep Chimera',
    primary: '#5c2347',
    accent: '#ff8fc4',
    glow: '#b9f7ff',
  }),
  'midnight-radar': Object.freeze({
    id: 'midnight-radar',
    displayName: 'Midnight Radar',
    primary: '#2d2253',
    accent: '#c4a6ff',
    glow: '#8cf4ff',
  }),
  'meteor-mauler': Object.freeze({
    id: 'meteor-mauler',
    displayName: 'Meteor Mauler',
    primary: '#5b2c24',
    accent: '#ffb15b',
    glow: '#ffe38a',
  }),
  'royal-stinkcloud': Object.freeze({
    id: 'royal-stinkcloud',
    displayName: 'Royal Stinkcloud',
    primary: '#4e2a57',
    accent: '#ef9dff',
    glow: '#ffc067',
  }),
});

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && (PALETTE_IDS as readonly string[]).includes(value);
}

export function getPaletteDefinition(paletteId: PaletteId): PaletteDefinition {
  return PALETTE_CATALOG[paletteId];
}

export function presentPaletteName(paletteId: string): string {
  return isPaletteId(paletteId) ? PALETTE_CATALOG[paletteId].displayName : paletteId;
}
