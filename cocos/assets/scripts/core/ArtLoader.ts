/**
 * V7 asset loader: resolves an ArtRegistry id to a real Prefab at runtime.
 *
 * The brief's chain is Gameplay -> Art Registry -> Prefab -> Mesh -> Material ->
 * Texture. ArtRegistry holds the identity map; this module performs the load, so
 * gameplay code never names a path or a bundle.
 *
 * Two rules make this safe to adopt incrementally:
 *
 *   1. **It never blocks.** A caller asks for art and keeps rendering whatever it
 *      already has. If the asset arrives, the caller swaps it in; if it never
 *      arrives, the existing visuals keep working. That is what lets the
 *      singularity migrate without a frame where the player is missing.
 *
 *   2. **It normalises the effect.** glTF materials import as
 *      `builtin-standard`, which was measured on this build to make the entire 3D
 *      world disappear (Error 3804 plus about a thousand localSetLayout
 *      failures). Every material this loader hands back is therefore rebound to
 *      the profile's unlit effect before use. The mesh and the authored colours
 *      come from the asset; only the effect is normalised, because the project
 *      renders unlit by decision.
 */
import { Color, Material, MeshRenderer, Node, Prefab, instantiate, type AssetManager } from 'cc';
import { getArtEntry } from './ArtRegistry';
import { RENDER_DEFINES, RENDER_EFFECT } from './RenderProfile';
import { RegionBundleService } from '../world/RegionBundleService';

export interface LoadedArt {
  readonly node: Node;
  /** Renderers whose material was normalised, for diagnostics. */
  readonly reboundRenderers: number;
  /** Renderers that already used the profile effect and were left alone. */
  readonly alreadyCorrectRenderers: number;
}

export class ArtLoader {
  private static readonly prefabCache = new Map<string, Prefab>();
  private static readonly inFlight = new Set<string>();
  /**
   * Reuses the project's existing bundle service instead of a second loader.
   * That service already owns retries, de-duplicates concurrent requests and
   * reports a terminal failure rather than hanging, which is exactly what a
   * non-blocking art swap needs.
   */
  private static readonly bundles = new RegionBundleService({ maxAttempts: 3, retryDelayMs: 200 });

  /** True once this art id's prefab is resident. */
  public static isResident(artId: string): boolean {
    return ArtLoader.prefabCache.has(artId);
  }

  /**
   * Load the prefab behind an art id and instantiate it.
   *
   * @param artId   a dotted id from ArtRegistry
   * @param bundle  the bundle the asset ships in
   * @param onReady called once with the instantiated, effect-normalised node
   * @param onError called once if the asset cannot be produced
   */
  public static instantiateArt(
    artId: string,
    bundle: string,
    onReady: (art: LoadedArt) => void,
    onError?: (reason: unknown) => void,
  ): void {
    const entry = getArtEntry(artId);
    if (!entry) {
      onError?.(new Error('[ArtLoader] Unknown art id: ' + artId));
      return;
    }
    if (entry.prefab === null) {
      onError?.(new Error('[ArtLoader] Art id is not migrated yet: ' + artId));
      return;
    }

    const cached = ArtLoader.prefabCache.get(artId);
    if (cached) {
      onReady(ArtLoader.materialise(cached));
      return;
    }
    if (ArtLoader.inFlight.has(artId)) return;
    ArtLoader.inFlight.add(artId);

    // Bundle resource paths are relative to the bundle root and omit the file
    // extension. A glTF scene registers its Prefab at
    // `blackhole/SingularityVortex/SingularityVortex` (directory + basename
    // twice); a plain `.prefab` asset registers at its own path. Loading a path
    // that still carries `.glb`/`.prefab` fails with "bundle does not contain",
    // which is what silently kept the machine on its runtime fallback until this
    // was found. The candidates are tried in order so an importer change cannot
    // disable the asset without a diagnostic.
    const relative = entry.prefab.replace(/^game_art\//, '').replace(/\.(glb|gltf|fbx|prefab)$/i, '');
    const basename = relative.split('/').pop()!;
    const candidates = [relative + '/' + basename, relative, basename];

    const finish = (prefab: Prefab | null, error?: unknown): void => {
      ArtLoader.inFlight.delete(artId);
      if (!prefab) {
        onError?.(error || new Error('[ArtLoader] Could not load ' + artId));
        return;
      }
      ArtLoader.prefabCache.set(artId, prefab);
      onReady(ArtLoader.materialise(prefab));
    };

    ArtLoader.bundles.ensureLoaded(bundle).then(() => {
      const loaded = ArtLoader.bundles.getBundle(bundle);
      if (!loaded) {
        finish(null, new Error('[ArtLoader] bundle reported resident but is not in memory: ' + bundle));
        return;
      }
      const tryNext = (index: number, lastError: unknown): void => {
        if (index >= candidates.length) {
          finish(null, lastError || new Error('[ArtLoader] no candidate path resolved for ' + artId));
          return;
        }
        loaded.load(candidates[index], Prefab, (prefabError: Error | null, prefab: Prefab) => {
          if (!prefabError && prefab) finish(prefab);
          else tryNext(index + 1, prefabError);
        });
      };
      tryNext(0, null);
    }).catch((bundleError: unknown) => {
      // A missing bundle is not fatal: the caller keeps its current visuals.
      finish(null, bundleError);
    });
  }

  /** Instantiate and normalise the effect on every renderer in the subtree. */
  private static materialise(prefab: Prefab): LoadedArt {
    const node = instantiate(prefab);
    let reboundRenderers = 0;
    let alreadyCorrectRenderers = 0;

    const visit = (current: Node): void => {
      const renderer = current.getComponent(MeshRenderer);
      if (renderer) {
        const primitiveCount = renderer.mesh?.struct.primitives.length || 0;
        const slotCount = Math.max(1, renderer.sharedMaterials.length, primitiveCount);
        for (let slot = 0; slot < slotCount; slot += 1) {
          const source = renderer.getRenderMaterial(slot);
          if (source && source.effectName === RENDER_EFFECT) {
            alreadyCorrectRenderers += 1;
            continue;
          }
          // Carry the authored colour across; replace only the effect. This is
          // what keeps the asset's own look while satisfying the unlit decision.
          const material = new Material();
          material.initialize({
            effectName: RENDER_EFFECT,
            defines: { ...RENDER_DEFINES, USE_TEXTURE: false },
          });
          const raw = source ? source.getProperty('mainColor') : null;
          if (raw instanceof Color) {
            // glTF baseColorFactor is linear; the profile's colours are sRGB.
            material.setProperty('mainColor', new Color(raw.r, raw.g, raw.b, raw.a));
          }
          renderer.setMaterial(material, slot);
          reboundRenderers += 1;
        }
      }
      current.children.forEach(visit);
    };
    visit(node);

    return { node, reboundRenderers, alreadyCorrectRenderers };
  }

  /** Test hook. */
  public static reset(): void {
    ArtLoader.prefabCache.clear();
    ArtLoader.inFlight.clear();
  }
}
