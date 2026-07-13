import { describe, expect, it } from 'vitest';
import { createUnavailableRenderer } from '../src/render/unavailable-renderer';

describe('unsupported WebGL renderer fallback', () => {
  it('never reports readiness or presentation work and keeps stable diagnostics', () => {
    const renderer = createUnavailableRenderer();
    expect(renderer.ready).toBe(false);
    expect(renderer.stats()).toEqual({ drawCalls: -1, liveViews: 0, highWaterViews: 0, contextLost: 0 });
    renderer.render({} as never, {} as never, 0, [], { tick: 0, cues: [] }, []);
    renderer.resize();
    renderer.setQualityTier?.('reduced');
    renderer.setPalette?.('forest');
    renderer.dispose();
    expect(renderer.ready).toBe(false);
  });
});
