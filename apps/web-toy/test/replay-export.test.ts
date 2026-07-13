import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, deserializeReplay, serializeReplay } from '@sim';
import { createSimDriver } from '../src/sim/simulation-driver';
import type { InputSource, TickInput } from '../src/contracts';

class StillInput implements InputSource {
  sample(_tick: number, _paused: boolean): TickInput { return { moveX: 0, moveY: 0, paused: false }; }
  clear(): void {}
  dispose(): void {}
}

describe('replay export', () => {
  it('round-trips a driver export through the canonical stable serializer', () => {
    const driver = createSimDriver(DEFAULT_CONFIG, 77);
    driver.frame(0, new StillInput(), false);
    driver.frame(1000 / DEFAULT_CONFIG.hz, new StillInput(), false);

    const serialized = serializeReplay(driver.replay());
    expect(serializeReplay(deserializeReplay(serialized))).toBe(serialized);
  });
});
