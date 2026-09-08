import { Vec3 } from 'cc';

import type { WorldCellCoord, WorldRebase } from './InfiniteWorldManager';

export interface WorldStreamerOptions {
  readonly cellSize: number;
  readonly activeRadius: number;
  readonly rebaseThreshold: number;
}

export type WorldCellKeySet = ReadonlySet<string>;

/**
 * Narrow world streaming coordinator. It knows only coordinates, active-cell
 * membership and origin rebasing; cell content remains owned by the manager's
 * existing Creator-backed cell implementation.
 */
export class WorldStreamer {
  public readonly logicalOrigin = new Vec3();
  public readonly currentCell = new Vec3();
  public rebaseCount = 0;

  public constructor(private readonly options: WorldStreamerOptions) {}

  public stream(
    renderPlayerPosition: Readonly<Vec3>,
    activeKeys: WorldCellKeySet,
    onLoad: (coord: WorldCellCoord) => void,
    onUnload: (key: string) => void,
  ): void {
    const logicalX = renderPlayerPosition.x + this.logicalOrigin.x;
    const logicalZ = renderPlayerPosition.z + this.logicalOrigin.z;
    const coord = this.toCellCoord(logicalX, logicalZ);
    this.currentCell.set(coord.x, 0, coord.z);

    const requiredKeys = new Set<string>();
    for (let x = coord.x - this.options.activeRadius; x <= coord.x + this.options.activeRadius; x++) {
      for (let z = coord.z - this.options.activeRadius; z <= coord.z + this.options.activeRadius; z++) {
        const cellCoord = { x, z };
        const key = this.key(cellCoord);
        requiredKeys.add(key);
        if (!activeKeys.has(key)) onLoad(cellCoord);
      }
    }
    activeKeys.forEach((key) => {
      if (!requiredKeys.has(key)) onUnload(key);
    });
  }

  public rebaseIfNeeded(renderPlayerPosition: Readonly<Vec3>, onRebase: (rebase: WorldRebase) => void): WorldRebase | null {
    if (Math.abs(renderPlayerPosition.x) < this.options.rebaseThreshold
      && Math.abs(renderPlayerPosition.z) < this.options.rebaseThreshold) return null;

    const shiftX = Math.trunc(renderPlayerPosition.x / this.options.cellSize) * this.options.cellSize;
    const shiftZ = Math.trunc(renderPlayerPosition.z / this.options.cellSize) * this.options.cellSize;
    if (shiftX === 0 && shiftZ === 0) return null;

    const shift = new Vec3(shiftX, 0, shiftZ);
    this.logicalOrigin.add(shift);
    this.rebaseCount++;
    const rebase = { shift, logicalOrigin: this.logicalOrigin.clone() };
    onRebase(rebase);
    return rebase;
  }

  public key(coord: WorldCellCoord): string {
    return `${coord.x}:${coord.z}`;
  }

  private toCellCoord(logicalX: number, logicalZ: number): WorldCellCoord {
    const half = this.options.cellSize * 0.5;
    return {
      x: Math.floor((logicalX + half) / this.options.cellSize),
      z: Math.floor((logicalZ + half) / this.options.cellSize),
    };
  }
}
