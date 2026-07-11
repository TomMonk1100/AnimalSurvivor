import { describe, expect, it } from 'vitest';
import type { HudStats } from '../src/contracts';
import { formatHud } from '../src/diagnostics/debug-hud';

function stats(overrides: Partial<HudStats> = {}): HudStats {
  return {
    fps: 60,
    frameTimeMs: 16.67,
    frameP95Ms: 18,
    frameP99Ms: 20,
    playerHp: 76,
    playerMaxHp: 100,
    playerXp: 22,
    playerLevel: 3,
    playerNextXp: 30,
    simTick: 120,
    ticksLastFrame: 1,
    droppedAccumSec: 0,
    enemiesLive: 4,
    enemiesHigh: 5,
    projLive: 6,
    projHigh: 8,
    pickupsLive: 2,
    pickupsHigh: 3,
    drawCalls: 7,
    stateHash: '0123456789abcdef',
    paused: false,
    autopilot: false,
    ...overrides,
  };
}

describe('debug HUD player-facing status', () => {
  it('puts health, level, cumulative XP, and controls ahead of diagnostics', () => {
    const lines = formatHud(stats()).split('\n');

    expect(lines[0]).toBe('GREG  HP 76/100  LV 3  XP 22/30');
    expect(lines[1]).toBe('Move: WASD / Arrow Keys • auto-fire');
  });

  it('reports max level without inventing another XP threshold', () => {
    expect(formatHud(stats({ playerXp: 380, playerNextXp: null }))).toContain('XP 380 • MAX LEVEL');
  });
});
