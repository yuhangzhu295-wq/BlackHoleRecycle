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
  readonly resolvePrefab?: (district: string) => Prefab | null;
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
    return this.options.resolvePrefab?.(district) || null;
  }

  public instantiateAuthoredCell(coord: WorldCellCoord, district: string, name = `WorldCell_${coord.x}_${coord.z}`): Node | null {
    const prefab = this.resolve(district, coord);
    if (!prefab) return null;
    const node = instantiate(prefab);
    node.name = name;
    node.setPosition(new Vec3(coord.x * this.options.cellSize, 0, coord.z * this.options.cellSize));
    this.options.parent.addChild(node);
    return node;
  }
}
