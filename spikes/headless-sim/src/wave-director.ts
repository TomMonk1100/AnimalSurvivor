/**
 * Agent C — wave director.
 * Pure, deterministic scheduler against the frozen WaveDirector interface.
 */
import type { Rng, WaveDirector, WaveSegment } from './types.js';

class WaveDirectorImpl implements WaveDirector {
  private readonly waves: readonly WaveSegment[];
  spawnAttempts = 0;
  spawnRejections = 0;

  constructor(waves: readonly WaveSegment[]) {
    this.waves = waves;
  }

  private findSegment(tick: number): WaveSegment | undefined {
    for (const seg of this.waves) {
      if (tick >= seg.startTick && tick < seg.endTick) return seg;
    }
    return undefined;
  }

  step(
    tick: number,
    rng: Rng,
    aliveEnemies: number,
    spawnFn: (archetype: number, hpMultiplier: number) => boolean,
  ): void {
    const segment = this.findSegment(tick);
    if (segment !== undefined) {
      const elapsed = tick - segment.startTick;
      if (segment.spawnIntervalTicks > 0 && elapsed % segment.spawnIntervalTicks === 0) {
        if (aliveEnemies < segment.maxAlive) {
          const archetype = rng.pickWeighted(segment.archetypeWeights);
          this.spawnAttempts++;
          const ok = spawnFn(archetype, 1);
          if (!ok) this.spawnRejections++;
        }
        // aliveEnemies >= maxAlive: skip WITHOUT consuming rng.
      }

      if (segment.elites !== undefined) {
        for (const elite of segment.elites) {
          if (elite.tick === tick) {
            this.spawnAttempts++;
            const ok = spawnFn(elite.archetype, elite.hpMultiplier);
            if (!ok) this.spawnRejections++;
          }
        }
      }
    }
  }
}

export function createWaveDirector(waves: readonly WaveSegment[]): WaveDirector {
  return new WaveDirectorImpl(waves);
}
