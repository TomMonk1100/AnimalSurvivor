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
    expect(lines[1]).toBe('Move: WASD / Arrow Keys • auto-fire • Esc pause');
  });

  it('reports max level without inventing another XP threshold', () => {
    expect(formatHud(stats({ playerXp: 380, playerNextXp: null }))).toContain('XP 380 • MAX LEVEL');
  });

  it('can keep diagnostics out of the player-facing default', () => {
    expect(formatHud(stats(), false)).toBe(
      'GREG  HP 76/100  LV 3  XP 22/30\nMove: WASD / Arrow Keys • auto-fire • Esc pause',
    );
  });

  it('explains the first visible XP mote until Greg collects one', () => {
    expect(formatHud(stats({ playerXp: 0, pickupsLive: 1 }), false)).toContain(
      'Green motes = XP — collect them to level up.',
    );
    expect(formatHud(stats({ playerXp: 0, pickupsLive: 0 }), false)).not.toContain('Green motes');
    expect(formatHud(stats({ playerXp: 1, pickupsLive: 1 }), false)).not.toContain('Green motes');
  });

  it('leaves the diagnostic variant focused on engineering data', () => {
    const output = formatHud(stats({ playerXp: 0, pickupsLive: 1 }));

    expect(output).not.toContain('Green motes');
    expect(output).toContain('enemies: 4/5  proj: 6/8  pickups: 1/3');
  });
});
