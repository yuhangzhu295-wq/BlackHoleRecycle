import type { Vec3 } from 'cc';

/** Logical X/Z coordinate for an authored or streamed world cell. */
export interface WorldCellCoord {
  readonly x: number;
  readonly z: number;
}

export interface WorldRebase {
  /** Render-space amount removed from the player and every active object. */
  readonly shift: Readonly<Vec3>;
  /** Logical offset that is subsequently added to render coordinates. */
  readonly logicalOrigin: Readonly<Vec3>;
}
