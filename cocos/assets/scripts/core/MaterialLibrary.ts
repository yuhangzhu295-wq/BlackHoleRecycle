/**
 * V7 PHASE 1: the runtime side of the authored MaterialLibrary.
 *
 * Gameplay never names a path or a bundle. It asks this module for a category
 * and gets back the real imported `cc.Material` asset that Creator wrote into
 * `assets/game_art/materials/`.
 *
 * Two rules keep this safe to adopt incrementally, the same contract ArtLoader
 * already uses for prefabs:
 *
 *   1. **It never blocks.** A caller asks and keeps rendering whatever it
 *      already has. If the library arrives, callers may adopt it; if it never
 *      arrives, `get()` returns null and the existing runtime-built materials
 *      keep working.
 *
 *   2. **It reuses the project's bundle service**, which already owns retries,
 *      de-duplicates concurrent requests and reports a terminal failure instead
 *      of hanging.
 */
import { instantiate, Material, Prefab } from 'cc';
import { ArtMaterialReference, MaterialCategory } from './ArtMaterialReference';
import { RegionBundleService } from '../world/RegionBundleService';

const BUNDLE = 'game-art';
/**
 * Bundle resource paths are relative to the bundle root, and a Creator prefab
 * at `game_art/ArtBootstrap.prefab` registers as `ArtBootstrap`.
 */
const PREFAB_PATH = 'ArtBootstrap';

export class MaterialLibrary {
  private static reference: ArtMaterialReference | null = null;
  private static requested = false;
  private static lastError: string | null = null;
  private static readonly bundles = new RegionBundleService({ maxAttempts: 3, retryDelayMs: 200 });

  /** Why the last load failed, for the acceptance report. Null once resident. */
  public static getLastError(): string | null {
    return MaterialLibrary.lastError;
  }

  /** True once the authored library is resident and categories can be read. */
  public static isReady(): boolean {
    return !!MaterialLibrary.reference;
  }

  /**
   * The authored material for a category, or null when the library has not
   * loaded. Callers must treat null as "keep the current visuals", never as an
   * error.
   */
  public static get(category: MaterialCategory): Material | null {
    return MaterialLibrary.reference ? MaterialLibrary.reference.get(category) : null;
  }

  /** Every bound category, for diagnostics and acceptance reports. */
  public static boundCategories(): readonly MaterialCategory[] {
    return MaterialLibrary.reference ? MaterialLibrary.reference.boundCategories() : [];
  }

  /**
   * Load the library once. Repeated calls are free once resident, and
   * concurrent calls share the single in-flight request.
   *
   * @param onReady called once with the reference, or omitted for fire-and-forget
   */
  public static ensure(onReady?: (reference: ArtMaterialReference) => void): void {
    if (MaterialLibrary.reference) {
      onReady?.(MaterialLibrary.reference);
      return;
    }
    if (MaterialLibrary.requested) return;
    MaterialLibrary.requested = true;

    MaterialLibrary.bundles.ensureLoaded(BUNDLE).then(() => {
      const bundle = MaterialLibrary.bundles.getBundle(BUNDLE);
      if (!bundle) {
        MaterialLibrary.lastError = 'bundle reported resident but is not in memory: ' + BUNDLE;
        MaterialLibrary.requested = false;
        return;
      }
      bundle.load(PREFAB_PATH, Prefab, (error: Error | null, prefab: Prefab) => {
        if (error || !prefab) {
          MaterialLibrary.lastError = 'load failed: ' + (error?.message || 'no prefab at ' + PREFAB_PATH);
          MaterialLibrary.requested = false;
          return;
        }
        const node = instantiate(prefab);
        // Each category child (GrassReference, RoadReference, ...) carries its
        // own ArtMaterialReference with exactly one slot bound, so the library
        // is the UNION of all of them, not the first one found. Collecting into
        // a detached holder also keeps the references alive after the
        // instantiated prefab is discarded.
        const holders = node.getComponentsInChildren(ArtMaterialReference);
        if (!holders.length) {
          MaterialLibrary.lastError = 'prefab has no ArtMaterialReference component';
          MaterialLibrary.requested = false;
          return;
        }
        const merged = holders[0];
        merged.mergeOthers(holders);
        MaterialLibrary.lastError = null;
        MaterialLibrary.reference = merged;
        MaterialLibrary.requested = false;
        onReady?.(merged);
      });
    }).catch((error: unknown) => {
      MaterialLibrary.lastError = 'bundle error: ' + (error instanceof Error ? error.message : String(error));
      MaterialLibrary.requested = false;
    });
  }

  /** Test hook. */
  public static reset(): void {
    MaterialLibrary.reference = null;
    MaterialLibrary.requested = false;
  }
}
