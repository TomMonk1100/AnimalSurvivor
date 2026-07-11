import * as pc from 'playcanvas';

/**
 * Vite rewrites this URL to a fingerprinted, same-origin production asset.
 * The glTF is self-contained (its buffer is embedded), so loading it cannot
 * trigger requests to third-party texture or binary URLs.
 */
export const GREG_FOX_GLTF_URL = new URL(
  '../../../../assets/vendor/quaternius/ultimate_animated_animals/Fox.gltf',
  import.meta.url,
).href;

export type GregFoxLoadState = 'idle' | 'loading' | 'ready' | 'error' | 'disposed';

export interface GregFoxApp {
  readonly assets: pc.AssetRegistry;
  readonly root: {
    addChild(entity: pc.Entity): void;
  };
}

export interface GregFoxContainerResource {
  readonly animations: readonly pc.Asset[];
  instantiateRenderEntity(options?: object): pc.Entity;
}

export interface GregFoxLoadedContainer {
  readonly asset: pc.Asset;
  readonly resource: GregFoxContainerResource;
}

/** Injectable boundary used by unit tests and by a future central asset service. */
export interface GregFoxAssetAdapter {
  load(app: GregFoxApp, url: string): Promise<GregFoxLoadedContainer>;
  release(app: GregFoxApp, loaded: GregFoxLoadedContainer): void;
}

export interface GregFoxReadyResult {
  readonly entity: pc.Entity;
  readonly animationClips: readonly pc.Asset[];
  readonly animationNames: readonly string[];
}

export interface GregFoxLoader {
  readonly state: GregFoxLoadState;
  readonly ready: boolean;
  readonly error: Error | null;
  readonly entity: pc.Entity | null;
  readonly animationClips: readonly pc.Asset[];
  readonly animationNames: readonly string[];
  load(): Promise<GregFoxReadyResult>;
  dispose(): void;
}

function asError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

function isGregFoxContainerResource(value: unknown): value is GregFoxContainerResource {
  if (typeof value !== 'object' || value === null) return false;
  const resource = value as { animations?: unknown; instantiateRenderEntity?: unknown };
  return Array.isArray(resource.animations) && typeof resource.instantiateRenderEntity === 'function';
}

const defaultAssetAdapter: GregFoxAssetAdapter = {
  async load(app, url) {
    const asset = new pc.Asset('Greg — Fox', 'container', { url });
    app.assets.add(asset);

    try {
      await new Promise<void>((resolve, reject) => {
        const onLoad = (): void => {
          asset.off('error', onError);
          resolve();
        };
        const onError = (reason: unknown): void => {
          asset.off('load', onLoad);
          reject(asError(reason));
        };

        asset.once('load', onLoad);
        asset.once('error', onError);
        app.assets.load(asset);
      });

      const resource: unknown = asset.resource;
      if (!isGregFoxContainerResource(resource)) {
        throw new Error('Greg fox asset loaded without renderable animations');
      }
      return { asset, resource };
    } catch (reason) {
      asset.unload();
      app.assets.remove(asset);
      throw reason;
    }
  },

  release(app, loaded) {
    loaded.asset.unload();
    app.assets.remove(loaded.asset);
  },
};

/**
 * Creates a single-owner lifecycle for Greg's fox model.
 *
 * `load()` is idempotent while loading and after success. Callers should keep
 * their current fallback hero visible until `ready` becomes true, then swap in
 * `entity`. A failed load leaves the fallback untouched and exposes `error`.
 */
export function createGregFoxLoader(
  app: GregFoxApp,
  adapter: GregFoxAssetAdapter = defaultAssetAdapter,
): GregFoxLoader {
  let state: GregFoxLoadState = 'idle';
  let error: Error | null = null;
  let loaded: GregFoxLoadedContainer | null = null;
  let result: GregFoxReadyResult | null = null;
  let pending: Promise<GregFoxReadyResult> | null = null;
  let lifecycle = 0;

  const api: GregFoxLoader = {
    get state() {
      return state;
    },
    get ready() {
      return state === 'ready';
    },
    get error() {
      return error;
    },
    get entity() {
      return result?.entity ?? null;
    },
    get animationClips() {
      return result?.animationClips ?? [];
    },
    get animationNames() {
      return result?.animationNames ?? [];
    },

    load() {
      if (state === 'disposed') {
        return Promise.reject(new Error('Cannot load a disposed Greg fox loader'));
      }
      if (result !== null) return Promise.resolve(result);
      if (pending !== null) return pending;

      state = 'loading';
      error = null;
      const loadLifecycle = lifecycle;

      pending = adapter.load(app, GREG_FOX_GLTF_URL).then(
        (nextLoaded) => {
          if (state === 'disposed' || lifecycle !== loadLifecycle) {
            adapter.release(app, nextLoaded);
            throw new Error('Greg fox load completed after disposal');
          }
          let entity: pc.Entity | null = null;
          try {
            entity = nextLoaded.resource.instantiateRenderEntity({
              castShadows: true,
              receiveShadows: true,
            });
            entity.name = 'Greg — Fox';
            const animationClips = Object.freeze([...nextLoaded.resource.animations]);
            // PlayCanvas names glTF animation sub-assets by container index
            // (`Greg — Fox/animation/0`). The authored clip name lives on the
            // AnimTrack resource and is the state name gameplay transitions use.
            const animationNames = Object.freeze(animationClips.map((clip) => {
              const resource = clip.resource as { name?: unknown } | null;
              return typeof resource?.name === 'string' ? resource.name : clip.name;
            }));

            app.root.addChild(entity);
            loaded = nextLoaded;
            result = Object.freeze({ entity, animationClips, animationNames });
            state = 'ready';
            return result;
          } catch (reason) {
            entity?.destroy();
            adapter.release(app, nextLoaded);
            throw reason;
          }
        },
        (reason: unknown) => {
          const loadError = asError(reason);
          if (state !== 'disposed') {
            error = loadError;
            state = 'error';
          }
          throw loadError;
        },
      ).finally(() => {
        pending = null;
      });

      return pending;
    },

    dispose() {
      if (state === 'disposed') return;
      lifecycle++;
      result?.entity.destroy();
      if (loaded !== null) adapter.release(app, loaded);
      loaded = null;
      result = null;
      error = null;
      state = 'disposed';
    },
  };

  return api;
}
