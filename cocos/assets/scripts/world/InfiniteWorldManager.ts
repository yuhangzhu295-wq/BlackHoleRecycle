/**
 * Production endless-world streamer.  Unlike the retained legacy
 * WorldChunkManager, this owns a real two-dimensional X/Z grid around the
 * player and keeps logical world coordinates separate from rendered ones.
 */
import { _decorator, Component, director, Node, Vec3 } from 'cc';
import { IRegionThemeConfig, ObjectTier, REGION_THEMES } from '../data/GameConfig';
import { ObjectPool } from '../core/ObjectPool';
import { eventBus } from '../core/EventBus';
import { CompressibleObject } from '../gameplay/CompressibleObject';
import { CellItemGenerator, IChunkSpawnItem } from './ChunkConfig';
import { WorldArtKind, WorldArtLibrary } from './WorldArtLibrary';

const { ccclass } = _decorator;
const V3 = (x: number, y: number, z: number): Vec3 => new Vec3(x, y, z);
const ONE = new Vec3(1, 1, 1);

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

function cellKey(coord: WorldCellCoord): string {
  return `${coord.x}:${coord.z}`;
}

function positiveMod(value: number, divisor: number): number {
  const result = value % divisor;
  return result < 0 ? result + divisor : result;
}

/** One generated cell with its own Creator-imported environment and pooled loot. */
class InfiniteWorldCell {
  public readonly objects: CompressibleObject[] = [];

  public constructor(
    public readonly coord: WorldCellCoord,
    public readonly node: Node,
    public readonly theme: IRegionThemeConfig,
    private readonly art: WorldArtLibrary,
    private readonly cellSize: number,
  ) {
    this.buildEnvironment();
  }

  public populate(
    items: readonly IChunkSpawnItem[],
    objectPool: ObjectPool<CompressibleObject>,
    logicalOrigin: Readonly<Vec3>,
  ): void {
    const centerX = this.coord.x * this.cellSize;
    const centerZ = this.coord.z * this.cellSize;
    for (const item of items) {
      const object = objectPool.get();
      object.spawn(
        item.template,
        centerX + item.localX - logicalOrigin.x,
        centerZ + item.localZ - logicalOrigin.z,
        0.35,
        item.customId,
      );
      this.objects.push(object);
    }
  }

  public recycle(objectPool: ObjectPool<CompressibleObject>): void {
    this.objects.forEach((object) => {
      object.recycle();
      objectPool.release(object);
    });
    this.objects.length = 0;
    this.node.destroy();
  }

  private spawn(
    kind: WorldArtKind,
    x: number,
    z: number,
    scale: Readonly<Vec3> = ONE,
    yaw: number = 0,
    name: string = kind,
    height: number = 0,
  ): void {
    this.art.spawn(kind, this.node, V3(x, height, z), scale, yaw, name);
  }

  /**
   * Deterministic district geometry in local cell space.  Cells are deliberately
   * composed on both axes: roads leave through all cardinal boundaries and
   * landmarks occupy the four corners, so east/west travel never reaches a void.
   */
  private buildEnvironment(): void {
    const half = this.cellSize * 0.5;
    const variant = positiveMod(this.coord.x * 31 + this.coord.z * 17, 6);

    // Four grass quadrants keep the cell visually continuous during streaming.
    // They sit fractionally below the imported asphalt to avoid mobile depth
    // fighting at road edges.
    for (const x of [-half * 0.5, half * 0.5]) {
      for (const z of [-half * 0.5, half * 0.5]) {
        this.spawn('terrainTile', x, z, V3(16, 1, 16), 0, 'DistrictGround', -0.04);
      }
    }

    if (variant === 0 || variant === 3) {
      this.spawn('roadCrossroad', 0, 0, V3(12, 1, 12), 0, 'FourWayRoad', 0.02);
    } else {
      this.spawn('roadStraight', 0, 0, V3(12, 1, 22), variant % 2 === 0 ? 0 : 90, 'DistrictRoad', 0.02);
    }

    // Keep the street's landmark silhouette within the narrow 9:16 camera,
    // rather than only in the distant corners of the 64 m streaming cell.
    // The central roadway remains unobstructed for the black-hole machine.
    const buildingA: WorldArtKind = variant % 2 === 0 ? 'buildingB' : 'buildingC';
    const buildingB: WorldArtKind = buildingA === 'buildingB' ? 'buildingC' : 'buildingB';
    this.spawn(buildingA, -8.7, -8.8, V3(2.35, 2.35, 2.35), 90, 'DistrictResidenceNW');
    this.spawn(buildingB, 8.7, -11.2, V3(2.35, 2.35, 2.35), -90, 'DistrictResidenceSE');
    this.spawn('commercialBuildingA', -9.1, -17.4, V3(2.4, 2.4, 2.4), 90, 'DistrictShopSW');
    this.spawn('commercialBuildingD', 9.1, -18.2, V3(2.4, 2.4, 2.4), -90, 'DistrictShopNE');

    for (const [x, z] of [[-5.3, -5.5], [5.3, -7.5], [-5.3, -15.5], [5.3, -17.5]]) {
      this.spawn('streetLight', x, z, V3(3.8, 3.8, 3.8), 0, 'DistrictStreetLight');
    }
    this.spawn('treeLarge', -7.2, -3.3, V3(3.5, 3.5, 3.5), 0, 'DistrictTreeLarge');
    this.spawn('treeSmall', 7.5, -5.0, V3(3.7, 3.7, 3.7), 0, 'DistrictTreeSmall');
    this.spawn('pathStones', -7.3, -14.5, V3(3.2, 1, 4.6), 90, 'DistrictPath');
    this.spawn('fence', 7.3, -15.5, V3(3.2, 1.5, 3.8), 90, 'DistrictFence');

    if (variant === 1) this.spawn('deliveryVan', -3.1, -9.0, V3(1.1, 1.1, 1.1), 90, 'DistrictDeliveryVan');
    if (variant === 2) this.spawn('sedan', 3.1, -10.0, V3(1.2, 1.2, 1.2), -90, 'DistrictParkedSedan');
    if (variant === 4) this.spawn('garbageTruck', 3.3, -6.5, V3(1.15, 1.15, 1.15), 90, 'DistrictGarbageTruck');
    if (variant === 5) this.spawn('constructionCone', -3.3, -6.0, V3(5.5, 5.5, 5.5), 0, 'DistrictRoadCone');
  }
}

@ccclass('InfiniteWorldManager')
export class InfiniteWorldManager extends Component {
  public static readonly CELL_SIZE = 64;
  public static readonly ACTIVE_RADIUS = 1;
  public static readonly ACTIVE_CELL_COUNT = 9;
  public static readonly REBASE_THRESHOLD = 192;

  public currentTheme: IRegionThemeConfig = REGION_THEMES[0];
  public currentRegionIndex: number = 0;
  public readonly activeCells: Map<string, InfiniteWorldCell> = new Map();
  public readonly logicalOrigin: Vec3 = new Vec3();
  public readonly currentCell: Vec3 = new Vec3();
  public rebaseCount: number = 0;

  private objectPool: ObjectPool<CompressibleObject> | null = null;
  private objectRoot: Node | null = null;
  private artLibrary: WorldArtLibrary | null = null;
  private initialized: boolean = false;

  public init(objectFactory: () => CompressibleObject): void {
    if (this.initialized) return;
    this.artLibrary = director.getScene()?.getComponentInChildren(WorldArtLibrary) || null;
    if (!this.artLibrary) throw new Error('[InfiniteWorldManager] Missing editor-saved WorldArtLibrary.');
    this.artLibrary.validateTemplates();

    this.objectRoot = new Node('InfiniteWorldObjectPool');
    this.node.addChild(this.objectRoot);
    this.objectPool = new ObjectPool<CompressibleObject>(
      () => {
        const object = objectFactory();
        if (this.objectRoot && object.node.parent !== this.objectRoot) this.objectRoot.addChild(object.node);
        return object;
      },
      (object) => object.recycle(),
      48,
      288,
    );
    this.initialized = true;
    this.updateCells(Vec3.ZERO);
  }

  /** Streams the 3×3 active grid for both X and Z; returns a rebase when needed. */
  public updateCells(renderPlayerPosition: Readonly<Vec3>): WorldRebase | null {
    if (!this.initialized || !this.objectPool || !this.artLibrary) return null;
    const logicalPosition = V3(
      renderPlayerPosition.x + this.logicalOrigin.x,
      0,
      renderPlayerPosition.z + this.logicalOrigin.z,
    );
    const coord = this.toCellCoord(logicalPosition.x, logicalPosition.z);
    this.currentCell.set(coord.x, 0, coord.z);

    const requiredKeys = new Set<string>();
    for (let x = coord.x - InfiniteWorldManager.ACTIVE_RADIUS; x <= coord.x + InfiniteWorldManager.ACTIVE_RADIUS; x++) {
      for (let z = coord.z - InfiniteWorldManager.ACTIVE_RADIUS; z <= coord.z + InfiniteWorldManager.ACTIVE_RADIUS; z++) {
        const cellCoord = { x, z };
        const key = cellKey(cellCoord);
        requiredKeys.add(key);
        if (!this.activeCells.has(key)) this.createCell(cellCoord);
      }
    }

    for (const [key, cell] of this.activeCells) {
      if (requiredKeys.has(key)) continue;
      cell.recycle(this.objectPool);
      this.activeCells.delete(key);
    }

    this.updateCurrentTheme(coord);
    return this.tryRebase(renderPlayerPosition);
  }

  public updateObjects(
    dt: number,
    machinePos: Readonly<Vec3>,
    suctionRadius: number,
    machineMaxTier: ObjectTier,
    isMagnetStorm: boolean,
    onAbsorb: (object: CompressibleObject) => void,
  ): void {
    for (const cell of this.activeCells.values()) {
      for (const object of cell.objects) {
        const state = object.getState();
        if (state !== 'ABSORBED' && state !== 'RECYCLED'
          && object.updateMotion(dt, machinePos, suctionRadius, machineMaxTier, isMagnetStorm)) {
          onAbsorb(object);
        }
      }
    }
  }

  public getAllObjects(): CompressibleObject[] {
    const objects: CompressibleObject[] = [];
    for (const cell of this.activeCells.values()) {
      objects.push(...cell.objects.filter((object) => object.node?.isValid));
    }
    return objects;
  }

  public getVisibleObjectCount(): number {
    return this.getAllObjects().filter((object) => {
      const state = object.getState();
      return state !== 'ABSORBED' && state !== 'RECYCLED';
    }).length;
  }

  public getRegionIndex(): number {
    return this.currentRegionIndex;
  }

  public getSnapshot(): Record<string, unknown> {
    return {
      mode: '2D_GRID',
      cellSize: InfiniteWorldManager.CELL_SIZE,
      activeCellCount: this.activeCells.size,
      expectedActiveCellCount: InfiniteWorldManager.ACTIVE_CELL_COUNT,
      currentCell: { x: this.currentCell.x, z: this.currentCell.z },
      logicalOrigin: { x: this.logicalOrigin.x, z: this.logicalOrigin.z },
      rebaseCount: this.rebaseCount,
      // Do not spread Map.values(): Cocos' ES5 build transform emits a single
      // iterator element for that form. Array.from preserves all real cells in
      // the Web Mobile runtime and keeps QA strictly read-only.
      activeCells: Array.from(this.activeCells.values(), (cell) => ({ x: cell.coord.x, z: cell.coord.z })),
    };
  }

  private createCell(coord: WorldCellCoord): void {
    if (!this.artLibrary || !this.objectPool) return;
    const logicalCenterX = coord.x * InfiniteWorldManager.CELL_SIZE;
    const logicalCenterZ = coord.z * InfiniteWorldManager.CELL_SIZE;
    const cellNode = new Node(`WorldCell_${coord.x}_${coord.z}`);
    this.node.addChild(cellNode);
    cellNode.setPosition(
      logicalCenterX - this.logicalOrigin.x,
      0,
      logicalCenterZ - this.logicalOrigin.z,
    );
    const theme = this.themeFor(coord);
    const cell = new InfiniteWorldCell(coord, cellNode, theme, this.artLibrary, InfiniteWorldManager.CELL_SIZE);
    const stableIndex = positiveMod(coord.x * 73856093 ^ coord.z * 19349663, 2147483647);
    cell.populate(
      CellItemGenerator.generateCellItems(theme, coord.x, coord.z, stableIndex, InfiniteWorldManager.CELL_SIZE),
      this.objectPool,
      this.logicalOrigin,
    );
    this.activeCells.set(cellKey(coord), cell);
  }

  private updateCurrentTheme(coord: WorldCellCoord): void {
    const theme = this.activeCells.get(cellKey(coord))?.theme || this.themeFor(coord);
    if (this.currentTheme.id === theme.id) return;
    this.currentTheme = theme;
    this.currentRegionIndex = REGION_THEMES.findIndex((candidate) => candidate.id === theme.id);
    eventBus.emit('UI_REGION_CHANGED', { region: theme.name, regionId: theme.id });
  }

  private tryRebase(renderPlayerPosition: Readonly<Vec3>): WorldRebase | null {
    if (Math.abs(renderPlayerPosition.x) < InfiniteWorldManager.REBASE_THRESHOLD
      && Math.abs(renderPlayerPosition.z) < InfiniteWorldManager.REBASE_THRESHOLD) return null;

    const shiftX = Math.trunc(renderPlayerPosition.x / InfiniteWorldManager.CELL_SIZE) * InfiniteWorldManager.CELL_SIZE;
    const shiftZ = Math.trunc(renderPlayerPosition.z / InfiniteWorldManager.CELL_SIZE) * InfiniteWorldManager.CELL_SIZE;
    if (shiftX === 0 && shiftZ === 0) return null;
    const shift = V3(shiftX, 0, shiftZ);
    this.logicalOrigin.add(shift);
    this.rebaseCount++;

    for (const cell of this.activeCells.values()) {
      cell.node.setPosition(
        cell.coord.x * InfiniteWorldManager.CELL_SIZE - this.logicalOrigin.x,
        0,
        cell.coord.z * InfiniteWorldManager.CELL_SIZE - this.logicalOrigin.z,
      );
      for (const object of cell.objects) object.applyWorldRebase(shift);
    }
    return { shift, logicalOrigin: this.logicalOrigin.clone() };
  }

  private toCellCoord(logicalX: number, logicalZ: number): WorldCellCoord {
    const half = InfiniteWorldManager.CELL_SIZE * 0.5;
    return {
      x: Math.floor((logicalX + half) / InfiniteWorldManager.CELL_SIZE),
      z: Math.floor((logicalZ + half) / InfiniteWorldManager.CELL_SIZE),
    };
  }

  private themeFor(coord: WorldCellCoord): IRegionThemeConfig {
    const ring = Math.max(Math.abs(coord.x), Math.abs(coord.z));
    return REGION_THEMES[Math.min(REGION_THEMES.length - 1, Math.floor(ring / 3))] || REGION_THEMES[0];
  }
}
