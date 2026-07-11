import { describe, expect, it, vi } from 'vitest';
import type * as pc from 'playcanvas';
import {
  GREG_FOX_GLTF_URL,
  createGregFoxLoader,
  type GregFoxApp,
  type GregFoxAssetAdapter,
  type GregFoxLoadedContainer,
} from '../src/hero/greg-fox-loader';

function fixture() {
  const entity = { name: '', destroy: vi.fn() } as unknown as pc.Entity;
  const clips = [
    { name: 'Greg — Fox/animation/0', resource: { name: 'Idle' } },
    { name: 'Greg — Fox/animation/1', resource: { name: 'Walk' } },
    { name: 'Greg — Fox/animation/2', resource: { name: 'Attack' } },
  ] as unknown as pc.Asset[];
  const loaded = {
    asset: { name: 'Greg — Fox' } as pc.Asset,
    resource: {
      animations: clips,
      instantiateRenderEntity: vi.fn(() => entity),
    } as unknown as GregFoxLoadedContainer['resource'],
  } satisfies GregFoxLoadedContainer;
  const app = {
    assets: {} as pc.AssetRegistry,
    root: { addChild: vi.fn() },
  } satisfies GregFoxApp;
  const adapter: GregFoxAssetAdapter = {
    load: vi.fn(async () => loaded),
    release: vi.fn(),
  };
  return { app, adapter, loaded, entity, clips };
}

describe('Greg fox loader', () => {
  it('uses the audited local glTF URL', () => {
    expect(GREG_FOX_GLTF_URL).toContain('/assets/vendor/quaternius/ultimate_animated_animals/Fox.gltf');
  });

  it('loads, instantiates, attaches, and exposes animation metadata', async () => {
    const f = fixture();
    const loader = createGregFoxLoader(f.app, f.adapter);

    expect(loader.state).toBe('idle');
    expect(loader.ready).toBe(false);
    const result = await loader.load();

    expect(f.adapter.load).toHaveBeenCalledWith(f.app, GREG_FOX_GLTF_URL);
    expect(f.loaded.resource.instantiateRenderEntity).toHaveBeenCalledWith({
      castShadows: true,
      receiveShadows: true,
    });
    expect(f.app.root.addChild).toHaveBeenCalledWith(f.entity);
    expect(result.entity).toBe(f.entity);
    expect(loader.entity).toBe(f.entity);
    expect(loader.animationClips).toEqual(f.clips);
    expect(loader.animationNames).toEqual(['Idle', 'Walk', 'Attack']);
    expect(loader.ready).toBe(true);
    expect(loader.state).toBe('ready');
    expect(loader.error).toBeNull();
  });

  it('deduplicates concurrent and post-ready load calls', async () => {
    const f = fixture();
    let resolveLoad!: (value: GregFoxLoadedContainer) => void;
    f.adapter.load = vi.fn(() => new Promise<GregFoxLoadedContainer>((resolve) => { resolveLoad = resolve; })) as GregFoxAssetAdapter['load'];
    const loader = createGregFoxLoader(f.app, f.adapter);

    const first = loader.load();
    const second = loader.load();
    expect(first).toBe(second);
    expect(loader.state).toBe('loading');
    resolveLoad(f.loaded);
    const ready = await first;
    expect(await loader.load()).toBe(ready);
    expect(f.adapter.load).toHaveBeenCalledTimes(1);
  });

  it('surfaces errors without attaching an entity, preserving the caller fallback', async () => {
    const f = fixture();
    f.adapter.load = vi.fn(async () => { throw new Error('offline'); }) as GregFoxAssetAdapter['load'];
    const loader = createGregFoxLoader(f.app, f.adapter);

    await expect(loader.load()).rejects.toThrow('offline');
    expect(loader.state).toBe('error');
    expect(loader.error?.message).toBe('offline');
    expect(loader.ready).toBe(false);
    expect(loader.entity).toBeNull();
    expect(f.app.root.addChild).not.toHaveBeenCalled();
  });

  it('disposes the entity and asset exactly once', async () => {
    const f = fixture();
    const loader = createGregFoxLoader(f.app, f.adapter);
    await loader.load();

    loader.dispose();
    loader.dispose();
    expect(f.entity.destroy).toHaveBeenCalledTimes(1);
    expect(f.adapter.release).toHaveBeenCalledTimes(1);
    expect(f.adapter.release).toHaveBeenCalledWith(f.app, f.loaded);
    expect(loader.state).toBe('disposed');
    expect(loader.entity).toBeNull();
    await expect(loader.load()).rejects.toThrow('disposed');
  });

  it('releases an asset that arrives after disposal and never attaches it', async () => {
    const f = fixture();
    let resolveLoad!: (value: GregFoxLoadedContainer) => void;
    f.adapter.load = vi.fn(() => new Promise<GregFoxLoadedContainer>((resolve) => { resolveLoad = resolve; })) as GregFoxAssetAdapter['load'];
    const loader = createGregFoxLoader(f.app, f.adapter);

    const pending = loader.load();
    loader.dispose();
    resolveLoad(f.loaded);

    await expect(pending).rejects.toThrow('after disposal');
    expect(f.adapter.release).toHaveBeenCalledWith(f.app, f.loaded);
    expect(f.app.root.addChild).not.toHaveBeenCalled();
    expect(loader.state).toBe('disposed');
  });
});
