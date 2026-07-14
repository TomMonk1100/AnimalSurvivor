/**
 * Per-archetype transform motion for illustrated attack cards.
 *
 * This module deliberately receives only scalar values derived from a live
 * renderer slot. It owns no entities, clocks, random draws, or allocations in
 * its write path: integer simulation ticks and the slot seed fully determine
 * every result.
 */
import {
  WILDGUARD_VFX_CLIP,
  type WildguardVfxClip,
} from './wildguard-vfx-atlas';
import { easeOutBack, easeOutCubic } from './vfx-easing';

/** A zone/aura may breathe no faster than 0.5 Hz at the 60-tick sim rate. */
export const ILLUSTRATED_VFX_BREATH_PERIOD_TICKS = 120;

const BREATH_AMPLITUDE = 0.04;
const IMPACT_ATTACK_PORTION = 0.18;
const IMPACT_SETTLE_SCALE = 0.92;
const BASE_CARD_HEIGHT = 1.56;

export interface IllustratedVfxMotionSample {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleZ: number;
  yawOffsetDegrees: number;
  heightOffset: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function seededAngleDegrees(seed: number): number {
  return Math.abs(Math.imul(Math.floor(seed), 0x45d9f3b)) % 360;
}

function seededBreathPhaseTicks(seed: number): number {
  return Math.abs(Math.imul(Math.floor(seed), 0x27d4eb2d)) % ILLUSTRATED_VFX_BREATH_PERIOD_TICKS;
}

function impactScale(progress: number): number {
  const p = clamp01(progress);
  if (p <= IMPACT_ATTACK_PORTION) {
    return 0.55 + 0.45 * easeOutBack(p / IMPACT_ATTACK_PORTION);
  }
  return 1 - (1 - IMPACT_SETTLE_SCALE) * easeOutCubic(
    (p - IMPACT_ATTACK_PORTION) / (1 - IMPACT_ATTACK_PORTION),
  );
}

function heldScale(progress: number): number {
  return 0.96 + 0.04 * easeOutCubic(clamp01(progress) / IMPACT_ATTACK_PORTION);
}

function breathingScale(progress: number, ageTicks: number, seed: number): number {
  const attack = 0.9 + 0.1 * easeOutCubic(clamp01(progress) / IMPACT_ATTACK_PORTION);
  const phase = (Math.max(0, Math.floor(ageTicks)) + seededBreathPhaseTicks(seed))
    * Math.PI * 2 / ILLUSTRATED_VFX_BREATH_PERIOD_TICKS;
  return attack * (1 + BREATH_AMPLITUDE * Math.sin(phase));
}

function travelDistance(radius: number, progress: number, start: number, end: number): number {
  return radius * (start + (end - start) * easeOutCubic(progress));
}

function reset(out: IllustratedVfxMotionSample, radius: number): void {
  out.offsetX = 0;
  out.offsetY = 0;
  out.scaleX = radius;
  out.scaleZ = radius;
  out.yawOffsetDegrees = 0;
  out.heightOffset = 0;
}

function writeSweep(
  out: IllustratedVfxMotionSample,
  radius: number,
  progress: number,
  dirX: number,
  dirY: number,
  travelStart: number,
  travelEnd: number,
  yawDegrees: number,
  heightOffset: number,
): void {
  const eased = easeOutCubic(progress);
  const travel = travelDistance(radius, progress, travelStart, travelEnd);
  out.offsetX = dirX * travel;
  out.offsetY = dirY * travel;
  out.scaleX = radius * heldScale(progress);
  out.scaleZ = out.scaleX;
  // One continuous directional sweep; no reverse or mid-life oscillation.
  out.yawOffsetDegrees = yawDegrees * eased;
  out.heightOffset = heightOffset;
}

function writeProjectile(
  out: IllustratedVfxMotionSample,
  radius: number,
  progress: number,
  dirX: number,
  dirY: number,
  travelStart: number,
  travelEnd: number,
  heightOffset: number,
): void {
  const travel = travelDistance(radius, progress, travelStart, travelEnd);
  out.offsetX = dirX * travel;
  out.offsetY = dirY * travel;
  // The card's yaw already follows its velocity; local Z is the forward axis.
  out.scaleX = radius * 0.8;
  out.scaleZ = radius * 1.25;
  out.heightOffset = heightOffset;
}

/**
 * Benny's authored ridge is a lateral ground front, not a stretched radial
 * burst. Each real Trample event already supplies its authoritative ground
 * position, and the renderer gives that one ridge a compact forward follow-
 * through so its three stages visibly read as a rolling earth wave rather
 * than as a static sticker. The card widens across the lane while remaining
 * deliberately shallow in its direction of travel: this makes the painted
 * bright rim read as a crest, not a round dirt decal.
 */
function writeEarthWave(
  out: IllustratedVfxMotionSample,
  radius: number,
  progress: number,
  dirX: number,
  dirY: number,
): void {
  const eased = easeOutCubic(progress);
  // The event origin remains simulation-authoritative. A stronger but still
  // bounded follow-through makes one ridge visibly advance in grayscale; it
  // is transform-only anatomy for that exact event, never another hit lane.
  const travel = radius * (0.08 + 1.0 * eased);
  out.offsetX = dirX * travel;
  out.offsetY = dirY * travel;
  const attack = easeOutCubic(Math.min(1, progress / 0.18));
  // Local X is the authored ridge's lateral crest and local Z is its short
  // forward footprint. That asymmetric shape remains a single ground wave,
  // but gives grayscale frames a clear advancing edge instead of a blob.
  out.scaleX = radius * (1 + 0.34 * attack - 0.1 * eased);
  out.scaleZ = radius * (0.52 + 0.16 * attack - 0.1 * eased);
  out.yawOffsetDegrees = -11 * eased;
  out.heightOffset = 0.1 + 0.035 * attack * (1 - eased);
}

/**
 * Gracie's card is the readable body/trail of an already-authoritative real
 * projectile. Linear travel is intentional here: ease-out made the comet
 * stall in the first few compositor frames, which looked like a static dot.
 */
function writeSpitComet(
  out: IllustratedVfxMotionSample,
  radius: number,
  progress: number,
  dirX: number,
  dirY: number,
): void {
  // The P2 body now owns an intentionally compact bright head and a curved
  // teal/magenta tail. It needs enough travel to read as a spit, but not the
  // old stretched 1.4-radius beam that detached head, tail, and contact.
  const travel = radius * (0.12 + 1.2 * progress);
  out.offsetX = dirX * travel;
  out.offsetY = dirY * travel;
  // Local Z follows the yaw-aligned projectile direction. Preserve the
  // authored head/tail ratio rather than re-stretching it into a vertical
  // generic beam; movement supplies the projectile energy.
  out.scaleX = radius * 1.15;
  out.scaleZ = radius * 1.18;
  out.heightOffset = 0.22;
}

function writeImpact(
  out: IllustratedVfxMotionSample,
  radius: number,
  progress: number,
  seed: number,
  yawTravelDegrees: number,
  heightOffset: number,
): void {
  const scale = radius * impactScale(progress);
  out.scaleX = scale;
  out.scaleZ = scale;
  out.yawOffsetDegrees = seededAngleDegrees(seed) + yawTravelDegrees * easeOutCubic(progress);
  out.heightOffset = heightOffset;
}

function writeBreathingField(
  out: IllustratedVfxMotionSample,
  radius: number,
  progress: number,
  ageTicks: number,
  seed: number,
  height: number,
): void {
  const scale = radius * breathingScale(progress, ageTicks, seed);
  out.scaleX = scale;
  out.scaleZ = scale;
  out.heightOffset = height - BASE_CARD_HEIGHT;
}

/** Allocates one slot-owned output; reuse with `writeIllustratedVfxMotion`. */
export function createIllustratedVfxMotionSample(): IllustratedVfxMotionSample {
  return {
    offsetX: 0,
    offsetY: 0,
    scaleX: 1,
    scaleZ: 1,
    yawOffsetDegrees: 0,
    heightOffset: 0,
  };
}

/**
 * Writes the distinct transform vocabulary for one illustrated VFX slot.
 * `progress` and `ageTicks` must be derived from simulation ticks by callers.
 */
export function writeIllustratedVfxMotion(
  clip: WildguardVfxClip,
  progress: number,
  ageTicks: number,
  radius: number,
  dirX: number,
  dirY: number,
  seed: number,
  out: IllustratedVfxMotionSample,
): void {
  const p = clamp01(progress);
  const safeRadius = positive(radius, 1);
  reset(out, safeRadius);

  switch (clip) {
    case WILDGUARD_VFX_CLIP.foxSwipe:
      // Fox needs an unmistakable forward claw path at gameplay zoom. This
      // remains a single directional sweep (not a projectile), but its body
      // now crosses enough ground for live compositor frames to show travel.
      writeSweep(out, safeRadius, p, dirX, dirY, 0.08, 0.82, 44, 0.2);
      return;
    case WILDGUARD_VFX_CLIP.earthWave:
      writeEarthWave(out, safeRadius, p, dirX, dirY);
      return;
    case WILDGUARD_VFX_CLIP.mantisSweep:
      writeSweep(out, safeRadius, p, dirX, dirY, 0.08, 0.42, 34, 0.2);
      return;
    case WILDGUARD_VFX_CLIP.spitComet:
      writeSpitComet(out, safeRadius, p, dirX, dirY);
      return;
    case WILDGUARD_VFX_CLIP.quillVolley:
      writeProjectile(out, safeRadius, p, dirX, dirY, 0.18, 1.1, 0.16);
      return;
    case WILDGUARD_VFX_CLIP.owlPinions:
      writeProjectile(out, safeRadius, p, dirX, dirY, 0.1, 0.78, 0.2);
      return;
    case WILDGUARD_VFX_CLIP.armadilloRoll:
      writeProjectile(out, safeRadius, p, dirX, dirY, 0.05, 0.46, 0.14);
      out.yawOffsetDegrees = 64 * easeOutCubic(p);
      return;
    case WILDGUARD_VFX_CLIP.normalImpact:
      writeImpact(out, safeRadius, p, seed, 26, 0.12);
      return;
    case WILDGUARD_VFX_CLIP.criticalImpact:
      writeImpact(out, safeRadius, p, seed, 42, 0.18);
      return;
    case WILDGUARD_VFX_CLIP.playerImpact:
      writeImpact(out, safeRadius, p, seed, -32, 0.26);
      return;
    case WILDGUARD_VFX_CLIP.crabCrush:
      writeImpact(out, safeRadius, p, seed, 20, 0.16);
      return;
    case WILDGUARD_VFX_CLIP.meteorImpact:
      writeImpact(out, safeRadius, p, seed, -28, 0.3);
      return;
    case WILDGUARD_VFX_CLIP.thornstorm:
      writeImpact(out, safeRadius, p, seed, 58, 0.18);
      return;
    case WILDGUARD_VFX_CLIP.thunderbug:
      writeImpact(out, safeRadius, p, seed, -46, 0.26);
      return;
    case WILDGUARD_VFX_CLIP.bomb:
      writeImpact(out, safeRadius, p, seed, 32, 0.24);
      return;
    case WILDGUARD_VFX_CLIP.food:
      writeImpact(out, safeRadius, p, seed, 0, 0.3);
      return;
    case WILDGUARD_VFX_CLIP.shieldRecharge:
      writeImpact(out, safeRadius, p, seed, 20, 0.28 + 0.12 * easeOutCubic(p));
      return;
    case WILDGUARD_VFX_CLIP.fluffyShield:
      writeBreathingField(out, safeRadius * 0.96, p, ageTicks, seed, BASE_CARD_HEIGHT + 0.24);
      return;
    case WILDGUARD_VFX_CLIP.pufferPulse:
      writeBreathingField(out, safeRadius, p, ageTicks, seed, 0.38);
      return;
    case WILDGUARD_VFX_CLIP.geckoPad:
      writeBreathingField(out, safeRadius, p, ageTicks, seed, 0.32);
      return;
    case WILDGUARD_VFX_CLIP.skunkCloud:
      writeBreathingField(out, safeRadius, p, ageTicks, seed, 0.44);
      return;
    case WILDGUARD_VFX_CLIP.royalStink:
      writeBreathingField(out, safeRadius, p, ageTicks, seed, 0.5);
      return;
    case WILDGUARD_VFX_CLIP.fireflyOrbit: {
      const angle = (seededAngleDegrees(seed) + ageTicks * 3) * Math.PI / 180;
      const orbitRadius = safeRadius * 0.34;
      out.offsetX = Math.cos(angle) * orbitRadius;
      out.offsetY = Math.sin(angle) * orbitRadius;
      const scale = safeRadius * 0.42 * breathingScale(p, ageTicks, seed);
      out.scaleX = scale;
      out.scaleZ = scale;
      out.yawOffsetDegrees = 48 * easeOutCubic(p);
      out.heightOffset = 0.24;
      return;
    }
    case WILDGUARD_VFX_CLIP.monarchOrbit: {
      const angle = (seededAngleDegrees(seed) - ageTicks * 2.25) * Math.PI / 180;
      const orbitRadius = safeRadius * 0.3;
      out.offsetX = Math.cos(angle) * orbitRadius;
      out.offsetY = Math.sin(angle) * orbitRadius;
      const scale = safeRadius * 0.48 * breathingScale(p, ageTicks, seed);
      out.scaleX = scale;
      out.scaleZ = scale;
      out.yawOffsetDegrees = -36 * easeOutCubic(p);
      out.heightOffset = 0.28;
      return;
    }
    case WILDGUARD_VFX_CLIP.batSonar:
      writeBreathingField(out, safeRadius, p, ageTicks, seed, 0.44);
      out.yawOffsetDegrees = -14 * easeOutCubic(p);
      return;
    case WILDGUARD_VFX_CLIP.midnightRadar:
      writeBreathingField(out, safeRadius, p, ageTicks, seed, 0.48);
      out.yawOffsetDegrees = 20 * easeOutCubic(p);
      return;
    case WILDGUARD_VFX_CLIP.magnet:
      out.scaleX = safeRadius * heldScale(p);
      out.scaleZ = out.scaleX;
      out.yawOffsetDegrees = -70 * easeOutCubic(p);
      out.heightOffset = 0.22;
      return;
    default:
      out.scaleX = safeRadius * heldScale(p);
      out.scaleZ = out.scaleX;
  }
}
