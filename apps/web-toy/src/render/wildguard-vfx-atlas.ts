/**
 * Authored, animated Wildguard VFX artwork.
 *
 * These sheets are the primary illustrated combat language, not a color-tinted
 * decorative overlay. Every animation is renderer-owned and samples only
 * fixed simulation ticks, so art never affects combat, replays, or RNG.
 */
import * as pc from 'playcanvas';
import {
  createAnimatedVfxAtlasSample,
  writeAnimatedVfxAtlasSample,
  writeAnimatedVfxAtlasUv,
  type AnimatedVfxAtlasFrame,
  type AnimatedVfxAtlasSample,
  type AnimatedVfxAtlasSequence,
} from './animated-vfx-atlas';

export const WILDGUARD_VFX_SHEET = Object.freeze({
  signature: 'signature',
  world: 'world',
  fields: 'fields',
  melee: 'melee',
  projectile: 'projectile',
  aura: 'aura',
} as const);

export type WildguardVfxSheet = (typeof WILDGUARD_VFX_SHEET)[keyof typeof WILDGUARD_VFX_SHEET];

export const WILDGUARD_VFX_SHEET_URLS: Readonly<Record<WildguardVfxSheet, string>> = Object.freeze({
  signature: new URL(
    '../../../../assets/ui/vfx/wildguard-signature-frames-v2.png',
    import.meta.url,
  ).href,
  world: new URL(
    '../../../../assets/ui/vfx/wildguard-world-frames-v2.png',
    import.meta.url,
  ).href,
  fields: new URL(
    '../../../../assets/ui/vfx/wildguard-fields-frames-v3.png',
    import.meta.url,
  ).href,
  melee: new URL(
    '../../../../assets/ui/vfx/wildguard-melee-frames-v3.png',
    import.meta.url,
  ).href,
  projectile: new URL(
    '../../../../assets/ui/vfx/wildguard-projectile-frames-v3.png',
    import.meta.url,
  ).href,
  aura: new URL(
    '../../../../assets/ui/vfx/wildguard-aura-frames-v3.png',
    import.meta.url,
  ).href,
});

export const WILDGUARD_VFX_CLIP = Object.freeze({
  foxSwipe: 'foxSwipe',
  earthWave: 'earthWave',
  spitComet: 'spitComet',
  normalImpact: 'normalImpact',
  criticalImpact: 'criticalImpact',
  playerImpact: 'playerImpact',
  shieldRecharge: 'shieldRecharge',
  xpOrbit: 'xpOrbit',
  xpCollect: 'xpCollect',
  hostileThorn: 'hostileThorn',
  fluffyShield: 'fluffyShield',
  bomb: 'bomb',
  magnet: 'magnet',
  food: 'food',
  masterXp: 'masterXp',
  pufferPulse: 'pufferPulse',
  geckoPad: 'geckoPad',
  skunkCloud: 'skunkCloud',
  royalStink: 'royalStink',
  mantisSweep: 'mantisSweep',
  crabCrush: 'crabCrush',
  armadilloRoll: 'armadilloRoll',
  meteorImpact: 'meteorImpact',
  quillVolley: 'quillVolley',
  owlPinions: 'owlPinions',
  thornstorm: 'thornstorm',
  thunderbug: 'thunderbug',
  fireflyOrbit: 'fireflyOrbit',
  monarchOrbit: 'monarchOrbit',
  batSonar: 'batSonar',
  midnightRadar: 'midnightRadar',
} as const);

export type WildguardVfxClip = (typeof WILDGUARD_VFX_CLIP)[keyof typeof WILDGUARD_VFX_CLIP];

export interface WildguardVfxClipDefinition {
  readonly sheet: WildguardVfxSheet;
  readonly sequence: AnimatedVfxAtlasSequence;
}

function frame(column: number, row: number): AnimatedVfxAtlasFrame {
  return Object.freeze({ column, row });
}

function sequence(
  name: WildguardVfxClip,
  frames: readonly AnimatedVfxAtlasFrame[],
  ticksPerFrame: number,
  loop = false,
): AnimatedVfxAtlasSequence {
  return Object.freeze({
    name,
    frames: Object.freeze(frames),
    ticksPerFrame,
    loop,
  });
}

const SIGNATURE_FOX = Object.freeze([frame(0, 0), frame(1, 0), frame(2, 0), frame(3, 0)]);
const SIGNATURE_EARTH = Object.freeze([frame(0, 1), frame(1, 1), frame(2, 1), frame(3, 1)]);
const SIGNATURE_SPIT = Object.freeze([frame(0, 2), frame(1, 2), frame(2, 2), frame(3, 2)]);
const WORLD_XP = Object.freeze([frame(0, 0), frame(1, 0), frame(2, 0), frame(3, 0)]);
const WORLD_HOSTILE = Object.freeze([frame(0, 1), frame(1, 1), frame(2, 1), frame(3, 1)]);
const WORLD_SHIELD = Object.freeze([frame(0, 2), frame(1, 2), frame(2, 2), frame(3, 2)]);
const FIELDS_PUFFER = Object.freeze([frame(0, 0), frame(1, 0), frame(2, 0), frame(3, 0)]);
const FIELDS_GECKO = Object.freeze([frame(0, 1), frame(1, 1), frame(2, 1), frame(3, 1)]);
const FIELDS_SKUNK = Object.freeze([frame(0, 2), frame(1, 2), frame(2, 2), frame(3, 2)]);
const FIELDS_ROYAL_STINK = Object.freeze([frame(0, 3), frame(1, 3), frame(2, 3), frame(3, 3)]);
const MELEE_MANTIS = Object.freeze([frame(0, 0), frame(1, 0), frame(2, 0), frame(3, 0)]);
const MELEE_CRAB = Object.freeze([frame(0, 1), frame(1, 1), frame(2, 1), frame(3, 1)]);
const MELEE_ARMADILLO = Object.freeze([frame(0, 2), frame(1, 2), frame(2, 2), frame(3, 2)]);
const MELEE_METEOR = Object.freeze([frame(0, 3), frame(1, 3), frame(2, 3), frame(3, 3)]);
const PROJECTILE_QUILL = Object.freeze([frame(0, 0), frame(1, 0), frame(2, 0), frame(3, 0)]);
const PROJECTILE_OWL = Object.freeze([frame(0, 1), frame(1, 1), frame(2, 1), frame(3, 1)]);
const PROJECTILE_THORNSTORM = Object.freeze([frame(0, 2), frame(1, 2), frame(2, 2), frame(3, 2)]);
const PROJECTILE_THUNDERBUG = Object.freeze([frame(0, 3), frame(1, 3), frame(2, 3), frame(3, 3)]);
const AURA_FIREFLY = Object.freeze([frame(0, 0), frame(1, 0), frame(2, 0), frame(3, 0)]);
const AURA_MONARCH = Object.freeze([frame(0, 1), frame(1, 1), frame(2, 1), frame(3, 1)]);
const AURA_BAT = Object.freeze([frame(0, 2), frame(1, 2), frame(2, 2), frame(3, 2)]);
const AURA_MIDNIGHT = Object.freeze([frame(0, 3), frame(1, 3), frame(2, 3), frame(3, 3)]);

/**
 * The frame order follows the authored sheets left-to-right. One-frame clips
 * intentionally still use the same sequence contract, which keeps impact and
 * pickup routing as explicit as animated hero signatures.
 */
export const WILDGUARD_VFX_CLIPS: Readonly<Record<WildguardVfxClip, WildguardVfxClipDefinition>> = Object.freeze({
  foxSwipe: Object.freeze({ sheet: 'signature', sequence: sequence('foxSwipe', SIGNATURE_FOX, 3) }),
  earthWave: Object.freeze({ sheet: 'signature', sequence: sequence('earthWave', SIGNATURE_EARTH, 5) }),
  spitComet: Object.freeze({ sheet: 'signature', sequence: sequence('spitComet', SIGNATURE_SPIT, 3) }),
  normalImpact: Object.freeze({ sheet: 'signature', sequence: sequence('normalImpact', [frame(0, 3)], 8) }),
  criticalImpact: Object.freeze({ sheet: 'signature', sequence: sequence('criticalImpact', [frame(1, 3)], 12) }),
  playerImpact: Object.freeze({ sheet: 'signature', sequence: sequence('playerImpact', [frame(2, 3)], 9) }),
  shieldRecharge: Object.freeze({ sheet: 'signature', sequence: sequence('shieldRecharge', [frame(3, 3)], 12) }),
  xpOrbit: Object.freeze({ sheet: 'world', sequence: sequence('xpOrbit', WORLD_XP.slice(0, 2), 6, true) }),
  xpCollect: Object.freeze({ sheet: 'world', sequence: sequence('xpCollect', WORLD_XP.slice(2), 4) }),
  hostileThorn: Object.freeze({ sheet: 'world', sequence: sequence('hostileThorn', WORLD_HOSTILE, 3) }),
  fluffyShield: Object.freeze({ sheet: 'world', sequence: sequence('fluffyShield', WORLD_SHIELD, 6) }),
  bomb: Object.freeze({ sheet: 'world', sequence: sequence('bomb', [frame(0, 3)], 10) }),
  magnet: Object.freeze({ sheet: 'world', sequence: sequence('magnet', [frame(1, 3)], 10) }),
  food: Object.freeze({ sheet: 'world', sequence: sequence('food', [frame(2, 3)], 10) }),
  masterXp: Object.freeze({ sheet: 'world', sequence: sequence('masterXp', [frame(3, 3)], 10) }),
  pufferPulse: Object.freeze({ sheet: 'fields', sequence: sequence('pufferPulse', FIELDS_PUFFER, 5, true) }),
  geckoPad: Object.freeze({ sheet: 'fields', sequence: sequence('geckoPad', FIELDS_GECKO, 5) }),
  skunkCloud: Object.freeze({ sheet: 'fields', sequence: sequence('skunkCloud', FIELDS_SKUNK, 6, true) }),
  royalStink: Object.freeze({ sheet: 'fields', sequence: sequence('royalStink', FIELDS_ROYAL_STINK, 6, true) }),
  mantisSweep: Object.freeze({ sheet: 'melee', sequence: sequence('mantisSweep', MELEE_MANTIS, 3) }),
  crabCrush: Object.freeze({ sheet: 'melee', sequence: sequence('crabCrush', MELEE_CRAB, 4) }),
  armadilloRoll: Object.freeze({ sheet: 'melee', sequence: sequence('armadilloRoll', MELEE_ARMADILLO, 3) }),
  meteorImpact: Object.freeze({ sheet: 'melee', sequence: sequence('meteorImpact', MELEE_METEOR, 5) }),
  quillVolley: Object.freeze({ sheet: 'projectile', sequence: sequence('quillVolley', PROJECTILE_QUILL, 3) }),
  owlPinions: Object.freeze({ sheet: 'projectile', sequence: sequence('owlPinions', PROJECTILE_OWL, 4) }),
  thornstorm: Object.freeze({ sheet: 'projectile', sequence: sequence('thornstorm', PROJECTILE_THORNSTORM, 3) }),
  thunderbug: Object.freeze({ sheet: 'projectile', sequence: sequence('thunderbug', PROJECTILE_THUNDERBUG, 4) }),
  fireflyOrbit: Object.freeze({ sheet: 'aura', sequence: sequence('fireflyOrbit', AURA_FIREFLY, 5, true) }),
  monarchOrbit: Object.freeze({ sheet: 'aura', sequence: sequence('monarchOrbit', AURA_MONARCH, 5, true) }),
  batSonar: Object.freeze({ sheet: 'aura', sequence: sequence('batSonar', AURA_BAT, 6, true) }),
  midnightRadar: Object.freeze({ sheet: 'aura', sequence: sequence('midnightRadar', AURA_MIDNIGHT, 6, true) }),
});

export function wildguardVfxClipDefinition(clip: WildguardVfxClip): WildguardVfxClipDefinition {
  return WILDGUARD_VFX_CLIPS[clip];
}

/** A finite material bank shared by pooled hero art and instanced world art. */
export interface WildguardVfxMaterialBank {
  /** Samples a clip at deterministic age ticks without making a material per event. */
  materialFor(clip: WildguardVfxClip, ageTicks: number): pc.StandardMaterial;
  /** Retrieves a particular authored frame, useful for a static semantic lane. */
  materialForFrame(clip: WildguardVfxClip, frameIndex?: number): pc.StandardMaterial;
  dispose(): void;
}

interface TextureBinding {
  dispose(): void;
}

function cellKey(sheet: WildguardVfxSheet, cell: AnimatedVfxAtlasFrame): string {
  return `${sheet}:${cell.column}:${cell.row}`;
}

function createNativeArtMaterial(cell: AnimatedVfxAtlasFrame): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  const uv = { uMin: 0, vMin: 0, uMax: 0, vMax: 0 };
  writeAnimatedVfxAtlasUv(cell, uv);
  material.useLighting = false;
  // Native white preserves the painted shadows, outlines, and color hierarchy
  // in the source art. Do not globally tint or additive-blend this layer.
  material.diffuse.set(1, 1, 1);
  material.emissive.set(0, 0, 0);
  material.opacity = 1;
  material.diffuseMapTiling.set(uv.uMax - uv.uMin, uv.vMax - uv.vMin);
  material.diffuseMapOffset.set(uv.uMin, uv.vMin);
  material.opacityMapTiling.set(uv.uMax - uv.uMin, uv.vMax - uv.vMin);
  material.opacityMapOffset.set(uv.uMin, uv.vMin);
  material.blendType = pc.BLEND_NORMAL;
  material.depthWrite = false;
  material.cull = pc.CULLFACE_NONE;
  material.update();
  return material;
}

function bindSheetTexture(
  device: pc.GraphicsDevice,
  url: string,
  materials: readonly pc.StandardMaterial[],
): TextureBinding {
  const texture = new pc.Texture(device, { mipmaps: true });
  texture.addressU = pc.ADDRESS_CLAMP_TO_EDGE;
  texture.addressV = pc.ADDRESS_CLAMP_TO_EDGE;
  texture.minFilter = pc.FILTER_LINEAR_MIPMAP_LINEAR;
  texture.magFilter = pc.FILTER_LINEAR;
  for (const material of materials) {
    material.diffuseMap = texture;
    material.diffuseMapChannel = 'rgb';
    material.opacityMap = texture;
    material.opacityMapChannel = 'a';
    material.update();
  }

  let disposed = false;
  if (typeof Image !== 'undefined') {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (disposed) return;
      texture.setSource(image);
      for (const material of materials) material.update();
    };
    image.src = url;
  }

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      texture.destroy();
    },
  };
}

/**
 * Creates the finite native-color material family once. Every cell is shared
 * between all entities and instanced lanes; clips select a prebuilt material
 * by tick, rather than allocating one during combat.
 */
export function createWildguardVfxMaterialBank(device: pc.GraphicsDevice): WildguardVfxMaterialBank {
  const materialByCell = new Map<string, pc.StandardMaterial>();
  const materialsBySheet: Record<WildguardVfxSheet, pc.StandardMaterial[]> = {
    signature: [],
    world: [],
    fields: [],
    melee: [],
    projectile: [],
    aura: [],
  };
  const sampleByClip = new Map<WildguardVfxClip, AnimatedVfxAtlasSample>();
  const allMaterials: pc.StandardMaterial[] = [];

  for (const clip of Object.values(WILDGUARD_VFX_CLIP)) {
    const definition = WILDGUARD_VFX_CLIPS[clip];
    sampleByClip.set(clip, createAnimatedVfxAtlasSample());
    for (const cell of definition.sequence.frames) {
      const key = cellKey(definition.sheet, cell);
      if (materialByCell.has(key)) continue;
      const material = createNativeArtMaterial(cell);
      materialByCell.set(key, material);
      materialsBySheet[definition.sheet].push(material);
      allMaterials.push(material);
    }
  }

  const sheetBindings = (Object.values(WILDGUARD_VFX_SHEET) as WildguardVfxSheet[]).map((sheet) => bindSheetTexture(
    device,
    WILDGUARD_VFX_SHEET_URLS[sheet],
    materialsBySheet[sheet],
  ));
  let disposed = false;

  function materialForFrame(clip: WildguardVfxClip, frameIndex = 0): pc.StandardMaterial {
    const definition = WILDGUARD_VFX_CLIPS[clip];
    const frames = definition.sequence.frames;
    const safeIndex = Math.min(frames.length - 1, Math.max(0, Math.floor(frameIndex)));
    const cell = frames[safeIndex]!;
    return materialByCell.get(cellKey(definition.sheet, cell))!;
  }

  return {
    materialFor(clip, ageTicks): pc.StandardMaterial {
      const definition = WILDGUARD_VFX_CLIPS[clip];
      const sample = sampleByClip.get(clip)!;
      writeAnimatedVfxAtlasSample(definition.sequence, ageTicks, sample);
      return materialForFrame(clip, sample.frameIndex);
    },
    materialForFrame,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const binding of sheetBindings) binding.dispose();
      for (const material of allMaterials) material.destroy();
    },
  };
}
