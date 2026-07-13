import { describe, expect, it, vi } from 'vitest';
import { createContextLossController } from '../src/render/context-loss-controller';

describe('WebGL context-loss controller', () => {
  it('prevents default loss handling and exposes a paused state until restore', () => {
    const controller = createContextLossController();
    const preventDefault = vi.fn();

    expect(controller.lost).toBe(false);
    controller.handleLost({ preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(controller.lost).toBe(true);

    controller.handleRestored();
    expect(controller.lost).toBe(false);
  });

  it('is idempotent across duplicate loss and restore notifications', () => {
    const controller = createContextLossController();
    const preventDefault = vi.fn();

    controller.handleLost({ preventDefault });
    controller.handleLost({ preventDefault });
    controller.handleRestored();
    controller.handleRestored();

    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(controller.lost).toBe(false);
  });
});
