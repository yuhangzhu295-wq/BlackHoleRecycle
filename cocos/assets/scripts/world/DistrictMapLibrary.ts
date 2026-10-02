/**
 * V7 PHASE 3: authored district map library.
 *
 * The world is an infinite streaming X/Z grid, so an authored "map" is a cell
 * prefab, not a static scene. This module owns loading those prefabs out of the
 * `game-art` bundle and handing them to the streamer by district kind.
 *
 * Same contract as `MaterialLibrary`: it never blocks, it reuses the project's
 * `RegionBundleService` (retries, de-duplication, terminal failure), and a
 * missing or failed prefab returns `null` so the caller keeps the existing
 * procedural path instead of rendering an empty world.
 */
import { Prefab } from 'cc';

import { RegionBundleService } from './RegionBundleService';
import type { DistrictKind } from './DistrictTemplates';

const BUNDLE = 'game-art';

/**
 * Bundle resource paths, relative to the bundle root. The brief's six names are
 * used where they map; `PARK` is the seventh `DistrictKind` and gets its own
 * authored map rather than being left on the procedural path.
 */
const MAP_PATHS: Readonly<Record<DistrictKind, string>> = {
  RESIDENTIAL: 'maps/Residential',
  PARK: 'maps/Park',
  SUPERMARKET: 'maps/Supermarket',
  WAREHOUSE: 'maps/Warehouse',
  PARKING: 'maps/Parking',
  CONSTRUCTION: 'maps/Construction',
  DOWNTOWN: 'maps/CityCenter',
};

const DISTRICT_KINDS = Object.keys(MAP_PATHS) as DistrictKind[];

export class DistrictMapLibrary {
  private static readonly bundles = new RegionBundleService({ maxAttempts: 3, retryDelayMs: 200 });
  private static readonly prefabs = new Map<DistrictKind, Prefab>();
  /** True while the bundle or the prefab batch is still in flight. */
  private static pending = false;
  private static requested = false;
  private static lastError: string | null = null;

  /**
   * Begin loading once. Repeated calls are free, and a cell created while this
   * is pending waits a frame rather than committing to the procedural path.
   */
  public static ensure(): void {
    if (DistrictMapLibrary.requested) return;
    DistrictMapLibrary.requested = true;
    DistrictMapLibrary.pending = true;

    DistrictMapLibrary.bundles.ensureLoaded(BUNDLE).then(() => {
      const bundle = DistrictMapLibrary.bundles.getBundle(BUNDLE);
      if (!bundle) {
        DistrictMapLibrary.fail('bundle reported resident but is not in memory: ' + BUNDLE);
        return;
      }
      const paths = DISTRICT_KINDS.map((kind) => MAP_PATHS[kind]);
      bundle.load(paths, Prefab, (error: Error | null, assets: Prefab[]) => {
        if (error || !assets) {
          DistrictMapLibrary.fail('load failed: ' + (error?.message || 'no prefabs'));
          return;
        }
        const byPath = new Map<string, Prefab>();
        assets.forEach((asset, index) => {
          if (asset) byPath.set(paths[index], asset);
        });
        const missing: string[] = [];
        for (const kind of DISTRICT_KINDS) {
          const prefab = byPath.get(MAP_PATHS[kind]);
          if (prefab) DistrictMapLibrary.prefabs.set(kind, prefab);
          else missing.push(MAP_PATHS[kind]);
        }
        DistrictMapLibrary.lastError = missing.length ? 'missing map prefabs: ' + missing.join(', ') : null;
        DistrictMapLibrary.pending = false;
      });
    }).catch((error: unknown) => {
      DistrictMapLibrary.fail('bundle error: ' + (error instanceof Error ? error.message : String(error)));
    });
  }

  private static fail(message: string): void {
    DistrictMapLibrary.lastError = message;
    DistrictMapLibrary.pending = false;
    // A failed batch is terminal for this session. `requested` stays true so a
    // per-frame `ensure()` cannot turn a broken download into a request storm.
  }

  /** The authored map for a district, or null while it is unavailable. */
  public static get(kind: DistrictKind): Prefab | null {
    return DistrictMapLibrary.prefabs.get(kind) || null;
  }

  /**
   * True while an authored map may still arrive. A cell that would otherwise be
   * procedural waits instead of committing to the fallback, so the authored map
   * is the normal path and the procedural path only runs when the library is
   * terminally unavailable.
   */
  public static isPending(): boolean {
    return DistrictMapLibrary.pending;
  }

  public static isReady(): boolean {
    return DistrictMapLibrary.prefabs.size > 0;
  }

  /** Districts with a resident authored map, for acceptance evidence. */
  public static boundDistricts(): readonly DistrictKind[] {
    const bound: DistrictKind[] = [];
    DistrictMapLibrary.prefabs.forEach((_prefab, kind) => { bound.push(kind); });
    return bound;
  }

  public static getLastError(): string | null {
    return DistrictMapLibrary.lastError;
  }

  /** Test hook. */
  public static reset(): void {
    DistrictMapLibrary.prefabs.clear();
    DistrictMapLibrary.pending = false;
    DistrictMapLibrary.requested = false;
    DistrictMapLibrary.lastError = null;
  }
}
