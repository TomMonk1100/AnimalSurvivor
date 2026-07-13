import * as pc from 'playcanvas';

/**
 * Curated CC0 props from Quaternius Stylized Nature MegaKit. They are kept in
 * Vite's public directory because each glTF intentionally references a small
 * sibling buffer and texture set. The asset provenance/trim record lives in
 * the runtime asset ledger; this module owns only renderer-side presentation.
 */
const GLTF_ROOT = '/art/quaternius/glade';

const PROP_URLS = Object.freeze({
  treeTall: `${GLTF_ROOT}/CommonTree_3.gltf`,
  treeWide: `${GLTF_ROOT}/CommonTree_5.gltf`,
  rockA: `${GLTF_ROOT}/Rock_Medium_2.gltf`,
  rockB: `${GLTF_ROOT}/Rock_Medium_3.gltf`,
  flowerBush: `${GLTF_ROOT}/Bush_Common_Flowers.gltf`,
});

type PropKey = keyof typeof PROP_URLS;

interface ContainerResource {
  instantiateRenderEntity(options?: object): pc.Entity;
}

interface LoadedContainer {
  readonly asset: pc.Asset;
  readonly resource: ContainerResource;
}

interface PropPlacement {
  readonly key: PropKey;
  readonly angle: number;
  /** Distance is measured from the centered start clearing. */
  readonly radius: number;
  readonly scale: number;
  readonly y: number;
  readonly rotation: number;
}

export interface QuaterniusGladePresentation {
  readonly ready: boolean;
  dispose(): void;
}

/**
 * A sparse but authored perimeter vignette. The denser procedural ground art
 * provides world-wide continuity; these high-detail assets establish the
 * close-camera "hero shot" around the opening clearing without adding any
 * collision, game state, or frame-loop work.
 */
const START_CLEARING_PLACEMENTS: readonly PropPlacement[] = Object.freeze([
  { key: 'treeTall', angle: 0.25, radius: 238, scale: 6.6, y: -4.4, rotation: 12 },
  { key: 'treeWide', angle: 1.06, radius: 254, scale: 6.1, y: -4.1, rotation: 168 },
  { key: 'treeTall', angle: 2.21, radius: 226, scale: 5.8, y: -3.9, rotation: 302 },
  { key: 'treeWide', angle: 3.15, radius: 262, scale: 6.3, y: -4.25, rotation: 230 },
  { key: 'treeTall', angle: 4.34, radius: 241, scale: 6.15, y: -4.1, rotation: 88 },
  { key: 'treeWide', angle: 5.31, radius: 250, scale: 5.9, y: -3.9, rotation: 348 },
  { key: 'rockA', angle: 0.72, radius: 151, scale: 8.6, y: -0.72, rotation: 48 },
  { key: 'rockB', angle: 1.72, radius: 165, scale: 7.2, y: -0.72, rotation: 292 },
  { key: 'rockA', angle: 2.72, radius: 147, scale: 6.5, y: -0.72, rotation: 196 },
  { key: 'rockB', angle: 3.83, radius: 172, scale: 7.8, y: -0.72, rotation: 18 },
  { key: 'rockA', angle: 4.95, radius: 145, scale: 7.1, y: -0.72, rotation: 151 },
  { key: 'flowerBush', angle: 0.04, radius: 122, scale: 8.8, y: -0.72, rotation: 102 },
  { key: 'flowerBush', angle: 1.33, radius: 138, scale: 7.5, y: -0.72, rotation: 218 },
  { key: 'flowerBush', angle: 2.95, radius: 127, scale: 8.1, y: -0.72, rotation: 328 },
  { key: 'flowerBush', angle: 4.16, radius: 142, scale: 7.2, y: -0.72, rotation: 54 },
  { key: 'flowerBush', angle: 5.57, radius: 130, scale: 7.8, y: -0.72, rotation: 276 },
]);

function isContainerResource(value: unknown): value is ContainerResource {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { instantiateRenderEntity?: unknown }).instantiateRenderEntity === 'function';
}

function loadContainer(app: pc.Application, name: string, url: string): Promise<LoadedContainer> {
  const asset = new pc.Asset(name, 'container', { url });
  app.assets.add(asset);
  return new Promise<LoadedContainer>((resolve, reject) => {
    const onLoad = (): void => {
      asset.off('error', onError);
      if (!isContainerResource(asset.resource)) {
        asset.unload();
        app.assets.remove(asset);
        reject(new Error(`${name} loaded without a renderable container`));
        return;
      }
      resolve({ asset, resource: asset.resource });
    };
    const onError = (reason: unknown): void => {
      asset.off('load', onLoad);
      asset.unload();
      app.assets.remove(asset);
      reject(reason instanceof Error ? reason : new Error(String(reason)));
    };
    asset.once('load', onLoad);
    asset.once('error', onError);
    app.assets.load(asset);
  });
}

function placeEntity(entity: pc.Entity, placement: PropPlacement, worldWidth: number, worldHeight: number): void {
  const maximumRadius = Math.max(0, Math.min(worldWidth, worldHeight) * 0.42);
  const radius = Math.min(placement.radius, maximumRadius);
  entity.setLocalPosition(
    Math.cos(placement.angle) * radius,
    placement.y,
    Math.sin(placement.angle) * radius,
  );
  entity.setLocalScale(placement.scale, placement.scale, placement.scale);
  entity.setLocalEulerAngles(0, placement.rotation, 0);
}

function configureStaticRender(entity: pc.Entity): void {
  entity.forEach((node) => {
    if (!(node instanceof pc.Entity) || node.render === undefined) return;
    for (const instance of node.render.meshInstances) {
      instance.castShadow = false;
      instance.receiveShadow = false;
    }
  });
}

/**
 * Asynchronously loads a deliberately small, CC0 glTF prop set. Loading
 * failure is nonfatal: the existing procedural clearing remains fully
 * playable and authoritative simulation never observes this work.
 */
export function createQuaterniusGladePresentation(
  app: pc.Application,
  parent: pc.Entity,
  worldWidth: number,
  worldHeight: number,
): QuaterniusGladePresentation {
  const root = new pc.Entity('quaternius-glade-props');
  parent.addChild(root);
  const loaded: LoadedContainer[] = [];
  const created: pc.Entity[] = [];
  let disposed = false;
  let ready = false;

  const keys = Object.keys(PROP_URLS) as PropKey[];
  void Promise.all(keys.map(async (key) => {
    const container = await loadContainer(app, `Wildguard glade — ${key}`, PROP_URLS[key]);
    loaded.push(container);
    return [key, container] as const;
  })).then((entries) => {
    if (disposed) return;
    const containers = new Map(entries);
    for (const placement of START_CLEARING_PLACEMENTS) {
      const container = containers.get(placement.key);
      if (container === undefined) continue;
      const entity = container.resource.instantiateRenderEntity({ castShadows: false, receiveShadows: false });
      entity.name = `glade-${placement.key}`;
      placeEntity(entity, placement, worldWidth, worldHeight);
      configureStaticRender(entity);
      root.addChild(entity);
      created.push(entity);
    }
    ready = true;
  }).catch(() => {
    // Asset-network failure only omits the optional high-detail props. It must
    // never block the renderer, the deterministic run, or the fallback art.
  });

  return {
    get ready() {
      return ready;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entity of created) entity.destroy();
      root.destroy();
      for (const container of loaded) {
        container.asset.unload();
        app.assets.remove(container.asset);
      }
      loaded.length = 0;
      created.length = 0;
    },
  };
}
