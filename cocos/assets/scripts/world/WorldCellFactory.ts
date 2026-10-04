import { instantiate, Node, Prefab, Vec3 } from 'cc';

import type { WorldCellCoord } from './WorldTypes';

export interface WorldCellPrefabEntry {
  readonly district: string;
  readonly prefab: Prefab;
  /** Optional placement gate for authored one-off landmarks/cells. */
  readonly matches?: (coord: WorldCellCoord) => boolean;
}

export interface WorldCellFactoryOptions {
  readonly cellSize: number;
  readonly parent: Node;
  readonly resolvePrefab?: (district: string, coord?: WorldCellCoord) => Prefab | null;
  readonly origin?: Readonly<Vec3>;
  readonly getOrigin?: () => Readonly<Vec3>;
}

/**
 * Narrow authoring/runtime boundary for streamed cells.
 *
 * The factory owns only prefab selection and placement. District content,
 * traffic, collectibles and QA remain outside this class. A missing authored
 * prefab is reported as `null` so callers can keep the existing strangler
 * path while the Creator-authored registry is migrated cell by cell.
 */
export class WorldCellFactory {
  private readonly registry = new Map<string, WorldCellPrefabEntry>();

  public constructor(private readonly options: WorldCellFactoryOptions) {}

  public register(entry: WorldCellPrefabEntry): void {
    this.registry.set(entry.district, entry);
  }

  public resolve(district: string, coord?: WorldCellCoord): Prefab | null {
    const entry = this.registry.get(district);
    if (entry && (!entry.matches || (coord && entry.matches(coord)))) return entry.prefab;
    return this.options.resolvePrefab?.(district, coord) || null;
  }

  public instantiateAuthoredCell(
    coord: WorldCellCoord,
    district: string,
    prefabOverride?: Prefab | null,
    name = `WorldCell_${coord.x}_${coord.z}`,
    origin?: Readonly<Vec3>,
  ): Node | null {
    const prefab = prefabOverride || this.resolve(district, coord);
    if (!prefab) return null;
    const node = instantiate(prefab);
    node.name = name;
    const effectiveOrigin = origin || this.options.getOrigin?.() || this.options.origin || Vec3.ZERO;
    node.setPosition(new Vec3(
      coord.x * this.options.cellSize - effectiveOrigin.x,
      0,
      coord.z * this.options.cellSize - effectiveOrigin.z,
    ));
    this.options.parent.addChild(node);
    return node;
  }

  /**
   * V7 PHASE 3: place an authored district map. This is deliberately the same
   * placement maths as `instantiateAuthoredCell` — a district map is an authored
   * cell like Golden City, just selected by district rather than by coordinate —
   * so cell size, coordinate maths and the streaming lifecycle stay identical.
   * A missing prefab returns `null` so the caller keeps the procedural fallback.
   */
  public instantiateAuthoredDistrictMap(
    coord: WorldCellCoord,
    district: string,
    prefab: Prefab | null,
    origin?: Readonly<Vec3>,
  ): Node | null {
    if (!prefab) return null;
    return this.instantiateAuthoredCell(coord, district, prefab, `WorldCell_${coord.x}_${coord.z}`, origin);
  }
}
