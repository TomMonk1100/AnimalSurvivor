/**
 * Authored, animated Wildguard VFX artwork.
 *
 * These sheets are the primary illustrated combat language, not a color-tinted
 * decorative overlay. Every animation is renderer-owned and samples only
 * fixed simulation ticks, so art never affects combat, replays, or RNG.
 */
import * as pc from 'playcanvas';
import {
  writeAnimatedVfxAtlasUv,
  type AnimatedVfxAtlasFrame,
  type AnimatedVfxAtlasSequence,
} from './animated-vfx-atlas';

export const WILDGUARD_VFX_SHEET = Object.freeze({
  signature: 'signature',
  signatureBodies: 'signatureBodies',
  world: 'world',
  fields: 'fields',
  melee: 'melee',
  projectile: 'projectile',
  aura: 'aura',
  geckoDissolve: 'geckoDissolve',
  skunkDissolve: 'skunkDissolve',
  royalStinkDissolve: 'royalStinkDissolve',
  fluffyShieldDissolve: 'fluffyShieldDissolve',
} as const);

export type WildguardVfxSheet = (typeof WILDGUARD_VFX_SHEET)[keyof typeof WILDGUARD_VFX_SHEET];

export const WILDGUARD_VFX_SHEET_URLS: Readonly<Record<WildguardVfxSheet, string>> = Object.freeze({
  signature: new URL(
    '../../../../assets/ui/vfx/wildguard-signature-frames-v3.png',
    import.meta.url,
  ).href,
  signatureBodies: new URL(
    '../../../../assets/ui/vfx/wildguard-signature-bodies-v1.png',
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
  geckoDissolve: new URL(
    '../../../../assets/ui/vfx/wildguard-gecko-dissolve-frames-v1.png',
    import.meta.url,
  ).href,
  skunkDissolve: new URL(
    '../../../../assets/ui/vfx/wildguard-skunk-dissolve-frames-v1.png',
    import.meta.url,
  ).href,
  royalStinkDissolve: new URL(
    '../../../../assets/ui/vfx/wildguard-royal-stink-dissolve-frames-v1.png',
    import.meta.url,
  ).href,
  fluffyShieldDissolve: new URL(
    '../../../../assets/ui/vfx/wildguard-fluffy-shield-dissolve-frames-v1.png',
    import.meta.url,
  ).href,
});

export const WILDGUARD_VFX_CLIP = Object.freeze({
  foxSwipe: 'foxSwipe',
  earthWave: 'earthWave',
  spitComet: 'spitComet',
  // Hostile Saltwind warnings retain their approved legacy earth glyph rather
  // than borrowing Benny's player-only ridge silhouette from signatureBodies.
  saltwindEarthTelegraph: 'saltwindEarthTelegraph',
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
    // Author-authored grids use related illustrations rather than a true
    // frame-by-frame source. Blending over half of each frame prevents the
    // hard cell swap from becoming a luminance strobe in the card pool.
    crossfadeTicks: frames.length > 1 ? Math.ceil(ticksPerFrame / 2) : undefined,
  });
}

const SIGNATURE_FOX = Object.freeze([frame(0, 0), frame(1, 0), frame(2, 0), frame(3, 0)]);
const SIGNATURE_EARTH = Object.freeze([frame(0, 1), frame(1, 1), frame(2, 1), frame(3, 1)]);
const SIGNATURE_BODY_EARTH = frame(0, 0);
const SIGNATURE_BODY_SPIT = frame(1, 0);
const WORLD_XP = Object.freeze([frame(0, 0), frame(1, 0), frame(2, 0), frame(3, 0)]);
const WORLD_HOSTILE = Object.freeze([frame(0, 1), frame(1, 1), frame(2, 1), frame(3, 1)]);
const FIELDS_PUFFER = Object.freeze([frame(0, 0), frame(1, 0), frame(2, 0), frame(3, 0)]);
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
 * The generator gave us a cohesive visual language, but not coherent
 * frame-by-frame animation. A stable authored body frame plus P1's transform
 * vocabulary is clearer than pretending unrelated illustrations are a
 * flipbook. These one-frame sequences deliberately have no crossfade: their
 * movement is the deterministic card motion, not a hard texture swap.
 */
function bestFrameSequence(
  name: WildguardVfxClip,
  cell: AnimatedVfxAtlasFrame,
  ticksPerFrame: number,
  loop = false,
): AnimatedVfxAtlasSequence {
  return sequence(name, [cell], ticksPerFrame, loop);
}

/**
 * Fluffy's shield owns the one deliberately short dissolve in this atlas. The
 * zone cards below deliberately do not share it: an active damage area needs
 * a stable body for its full readable lifetime, not a terminal scatter frame
 * held after its attack has already disappeared.
 */
const DISSOLVE_SEQUENCE_FRAMES: readonly AnimatedVfxAtlasFrame[] = Object.freeze(
  Array.from({ length: 8 }, (_, index) => frame(index % 4, Math.floor(index / 4))),
);

// Each authored zone sheet begins with its clearest full-body illustration.
// Keep that cell static while the renderer supplies the slow deterministic
// breathing motion. This avoids rapid texture swaps and lets rank-scaled card
// size/opacity remain legible over the whole presentation lifetime.
const GECKO_PAD_BODY = frame(0, 0);
const SKUNK_CLOUD_BODY = frame(0, 0);
const ROYAL_STINK_BODY = frame(0, 0);

/**
 * The frame order follows the authored sheets left-to-right. One-frame clips
 * intentionally still use the same sequence contract, which keeps impact and
 * pickup routing as explicit as animated hero signatures.
 */
export const WILDGUARD_VFX_CLIPS: Readonly<Record<WildguardVfxClip, WildguardVfxClipDefinition>> = Object.freeze({
  foxSwipe: Object.freeze({ sheet: 'signature', sequence: bestFrameSequence('foxSwipe', SIGNATURE_FOX[1]!, 3) }),
  // These two player signatures use P2's dedicated single-body sheet. The
  // stable transform animation prevents unrelated generated frames from
  // strobing while preserving unmistakable rock-ridge and spit-head/tail reads.
  earthWave: Object.freeze({ sheet: 'signatureBodies', sequence: bestFrameSequence('earthWave', SIGNATURE_BODY_EARTH, 5) }),
  spitComet: Object.freeze({ sheet: 'signatureBodies', sequence: bestFrameSequence('spitComet', SIGNATURE_BODY_SPIT, 3) }),
  saltwindEarthTelegraph: Object.freeze({
    sheet: 'signature',
    sequence: bestFrameSequence('saltwindEarthTelegraph', SIGNATURE_EARTH[1]!, 5),
  }),
  normalImpact: Object.freeze({ sheet: 'signature', sequence: sequence('normalImpact', [frame(0, 3)], 8) }),
  criticalImpact: Object.freeze({ sheet: 'signature', sequence: sequence('criticalImpact', [frame(1, 3)], 12) }),
  playerImpact: Object.freeze({ sheet: 'signature', sequence: sequence('playerImpact', [frame(2, 3)], 9) }),
  shieldRecharge: Object.freeze({ sheet: 'signature', sequence: sequence('shieldRecharge', [frame(3, 3)], 12) }),
  xpOrbit: Object.freeze({ sheet: 'world', sequence: bestFrameSequence('xpOrbit', WORLD_XP[1]!, 6, true) }),
  xpCollect: Object.freeze({ sheet: 'world', sequence: bestFrameSequence('xpCollect', WORLD_XP[2]!, 4) }),
  hostileThorn: Object.freeze({ sheet: 'world', sequence: bestFrameSequence('hostileThorn', WORLD_HOSTILE[1]!, 3) }),
  fluffyShield: Object.freeze({
    sheet: 'fluffyShieldDissolve',
    sequence: sequence('fluffyShield', DISSOLVE_SEQUENCE_FRAMES, 2),
  }),
  bomb: Object.freeze({ sheet: 'world', sequence: sequence('bomb', [frame(0, 3)], 10) }),
  magnet: Object.freeze({ sheet: 'world', sequence: sequence('magnet', [frame(1, 3)], 10) }),
  food: Object.freeze({ sheet: 'world', sequence: sequence('food', [frame(2, 3)], 10) }),
  masterXp: Object.freeze({ sheet: 'world', sequence: sequence('masterXp', [frame(3, 3)], 10) }),
  pufferPulse: Object.freeze({ sheet: 'fields', sequence: bestFrameSequence('pufferPulse', FIELDS_PUFFER[1]!, 5, true) }),
  geckoPad: Object.freeze({
    sheet: 'geckoDissolve',
    sequence: bestFrameSequence('geckoPad', GECKO_PAD_BODY, 6),
  }),
  skunkCloud: Object.freeze({
    sheet: 'skunkDissolve',
    sequence: bestFrameSequence('skunkCloud', SKUNK_CLOUD_BODY, 6),
  }),
  royalStink: Object.freeze({
    sheet: 'royalStinkDissolve',
    sequence: bestFrameSequence('royalStink', ROYAL_STINK_BODY, 6),
  }),
  mantisSweep: Object.freeze({ sheet: 'melee', sequence: bestFrameSequence('mantisSweep', MELEE_MANTIS[0]!, 3) }),
  crabCrush: Object.freeze({ sheet: 'melee', sequence: bestFrameSequence('crabCrush', MELEE_CRAB[1]!, 4) }),
  armadilloRoll: Object.freeze({ sheet: 'melee', sequence: bestFrameSequence('armadilloRoll', MELEE_ARMADILLO[1]!, 3) }),
  meteorImpact: Object.freeze({ sheet: 'melee', sequence: bestFrameSequence('meteorImpact', MELEE_METEOR[2]!, 5) }),
  quillVolley: Object.freeze({ sheet: 'projectile', sequence: bestFrameSequence('quillVolley', PROJECTILE_QUILL[1]!, 3) }),
  owlPinions: Object.freeze({ sheet: 'projectile', sequence: bestFrameSequence('owlPinions', PROJECTILE_OWL[1]!, 4) }),
  thornstorm: Object.freeze({ sheet: 'projectile', sequence: bestFrameSequence('thornstorm', PROJECTILE_THORNSTORM[1]!, 3) }),
  thunderbug: Object.freeze({ sheet: 'projectile', sequence: bestFrameSequence('thunderbug', PROJECTILE_THUNDERBUG[1]!, 4) }),
  fireflyOrbit: Object.freeze({ sheet: 'aura', sequence: bestFrameSequence('fireflyOrbit', AURA_FIREFLY[1]!, 5, true) }),
  monarchOrbit: Object.freeze({ sheet: 'aura', sequence: bestFrameSequence('monarchOrbit', AURA_MONARCH[1]!, 5, true) }),
  batSonar: Object.freeze({ sheet: 'aura', sequence: bestFrameSequence('batSonar', AURA_BAT[1]!, 6, true) }),
  midnightRadar: Object.freeze({ sheet: 'aura', sequence: bestFrameSequence('midnightRadar', AURA_MIDNIGHT[1]!, 6, true) }),
});

export function wildguardVfxClipDefinition(clip: WildguardVfxClip): WildguardVfxClipDefinition {
  return WILDGUARD_VFX_CLIPS[clip];
}

/** A finite material bank shared by pooled hero art and instanced world art. */
export interface WildguardVfxMaterialBank {
  /**
   * Returns a stable representative frame for high-volume instanced lanes.
   * Per-slot illustrated cards use `materialForFrame` plus atlas crossfades;
   * one shared instanced material cannot crossfade without doubling every
   * dense projectile/pickup draw, so it intentionally never hard-flips.
   */
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

/**
 * The second authored cell is the stable in-flight/body read for the compact
 * four-cell strips. This is deliberately a single-frame fallback for shared
 * instanced lanes: temporal coherence is more valuable than an unsynchronised
 * hard flip across every on-screen projectile.
 */
function stableFrameIndex(frames: readonly AnimatedVfxAtlasFrame[]): number {
  return frames.length > 1 ? 1 : 0;
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
    signatureBodies: [],
    world: [],
    fields: [],
    melee: [],
    projectile: [],
    aura: [],
    geckoDissolve: [],
    skunkDissolve: [],
    royalStinkDissolve: [],
    fluffyShieldDissolve: [],
  };
  const allMaterials: pc.StandardMaterial[] = [];

  for (const clip of Object.values(WILDGUARD_VFX_CLIP)) {
    const definition = WILDGUARD_VFX_CLIPS[clip];
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
    materialFor(clip, _ageTicks): pc.StandardMaterial {
      const definition = WILDGUARD_VFX_CLIPS[clip];
      // The high-volume batch route has a single material for many instances,
      // so a real blend there would double each lane's draw count; freeze a
      // representative body frame instead.
      return materialForFrame(clip, stableFrameIndex(definition.sequence.frames));
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
