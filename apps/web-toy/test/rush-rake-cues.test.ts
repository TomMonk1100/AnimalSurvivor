import { describe, expect, it } from 'vitest';
import {
  projectRushRakeCues,
  type RushRakeCueInput,
  type RushRakeThreeWaves,
} from '../src/hero/rush-rake-cues';

const WAVES: RushRakeThreeWaves = [
  { delayTicks: 0, durationTicks: 6, startRadius: 2, endRadius: 14, halfAngleRadians: 0.5 },
  { delayTicks: 2, durationTicks: 6, startRadius: 4, endRadius: 20, halfAngleRadians: 0.65 },
  { delayTicks: 4, durationTicks: 6, startRadius: 6, endRadius: 28, halfAngleRadians: 0.8 },
];

function input(tick: number): RushRakeCueInput {
  return { tick, issuedTick: 100, x: 12.5, y: 9, headingRadians: 1.25, waves: WAVES };
}

describe('projectRushRakeCues', () => {
  it('is deterministic and depends only on explicit input', () => {
    const first = projectRushRakeCues(input(104));
    const second = projectRushRakeCues(input(104));
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  it('keeps active arcs in authored wave order', () => {
    const snapshot = projectRushRakeCues(input(104));
    expect(snapshot.arcs.map((arc) => arc.waveIndex)).toEqual([0, 1, 2]);
    expect(snapshot.arcs.map((arc) => arc.startTick)).toEqual([100, 102, 104]);
    expect(snapshot.arcs[0]?.radius).toBe(10);
    expect(snapshot.arcs[2]?.progress).toBe(0);
  });

  it('does not emit waves before they start and expires at the exact end tick', () => {
    expect(projectRushRakeCues(input(99)).arcs).toEqual([]);
    expect(projectRushRakeCues(input(100)).arcs.map((arc) => arc.waveIndex)).toEqual([0]);
    expect(projectRushRakeCues(input(106)).arcs.map((arc) => arc.waveIndex)).toEqual([1, 2]);
    expect(projectRushRakeCues(input(110)).arcs).toEqual([]);
  });

  it('copies explicit pose into every cue without mutating command data', () => {
    const before = JSON.stringify(WAVES);
    const snapshot = projectRushRakeCues(input(104));
    for (const arc of snapshot.arcs) {
      expect([arc.x, arc.y, arc.headingRadians]).toEqual([12.5, 9, 1.25]);
    }
    expect(JSON.stringify(WAVES)).toBe(before);
  });

  it('returns deeply immutable snapshots', () => {
    const snapshot = projectRushRakeCues(input(104));
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.arcs)).toBe(true);
    expect(snapshot.arcs.every(Object.isFrozen)).toBe(true);
    expect(() => {
      (snapshot.arcs as unknown as { waveIndex: number }[])[0]!.waveIndex = 9;
    }).toThrow();
  });

  it('rejects malformed wave order and non-finite pose values', () => {
    const unordered = [WAVES[0], WAVES[2], WAVES[1]] as RushRakeThreeWaves;
    expect(() => projectRushRakeCues({ ...input(104), waves: unordered })).toThrow('authored order');
    const negativeDelay = [{ ...WAVES[0], delayTicks: -1 }, WAVES[1], WAVES[2]] as RushRakeThreeWaves;
    expect(() => projectRushRakeCues({ ...input(104), waves: negativeDelay })).toThrow('non-negative');
    expect(() => projectRushRakeCues({ ...input(104), x: Number.NaN })).toThrow('x must be finite');
  });
});
