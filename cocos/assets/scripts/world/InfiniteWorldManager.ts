/**
 * Production endless-world streamer.  Unlike the retained legacy
 * WorldChunkManager, this owns a real two-dimensional X/Z grid around the
 * player and keeps logical world coordinates separate from rendered ones.
 */
import { _decorator, Color, Component, director, MeshRenderer, Node, Vec3 } from 'cc';
import { IObjectTemplate, IRegionThemeConfig, OBJECT_TEMPLATES, ObjectTier, REGION_THEMES } from '../data/GameConfig';
import { ObjectPool } from '../core/ObjectPool';
import { eventBus } from '../core/EventBus';
import { CompressibleObject } from '../gameplay/CompressibleObject';
import { CellItemGenerator, IChunkSpawnItem } from './ChunkConfig';
import { DistrictKind, DistrictTemplate, getDistrictTemplateForCell } from './DistrictTemplates';
import { DynamicVehicle } from './DynamicVehicle';
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
  public readonly dynamicVehicles: DynamicVehicle[] = [];
  public readonly district: DistrictTemplate;

  public constructor(
    public readonly coord: WorldCellCoord,
    public readonly node: Node,
    public readonly theme: IRegionThemeConfig,
    private readonly art: WorldArtLibrary,
    private readonly cellSize: number,
  ) {
    this.district = getDistrictTemplateForCell(coord.x, coord.z);
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
    this.populateDynamicTraffic(objectPool, logicalOrigin);
  }

  public recycle(objectPool: ObjectPool<CompressibleObject>): void {
    this.objects.forEach((object) => {
      object.recycle();
      objectPool.release(object);
    });
    this.objects.length = 0;
    this.dynamicVehicles.length = 0;
    this.node.destroy();
  }

  public updateDynamicTraffic(dt: number): void {
    this.dynamicVehicles.forEach((vehicle) => vehicle.update(dt));
  }

  public applyWorldRebase(shift: Readonly<Vec3>): void {
    this.objects.forEach((object) => object.applyWorldRebase(shift));
    this.dynamicVehicles.forEach((vehicle) => vehicle.applyWorldRebase(shift.x));
  }

  /**
   * Read-only evidence for the opening-cell environment. It makes a Web
   * Mobile visual failure diagnosable without altering a scene or prefab at
   * runtime: QA can prove whether the grass mesh exists, is active and has a
   * valid material before judging the captured frame.
   */
  public getVisualDiagnostics(): ReadonlyArray<Record<string, unknown>> {
    const rows: Array<Record<string, unknown>> = [];
    for (const child of this.node.children) {
      const renderers: Array<Record<string, unknown>> = [];
      const visit = (node: Node): void => {
        const renderer = node.getComponent(MeshRenderer);
        if (renderer) {
          const primitiveCount = renderer.mesh?.struct.primitives.length || 0;
          const slotCount = Math.max(1, renderer.sharedMaterials.length, primitiveCount);
          const bounds = renderer.model?.worldBounds || null;
          const materials = Array.from({ length: slotCount }, (_, index) => {
            const material = renderer.getRenderMaterial(index);
            const rawColor = material?.getProperty('mainColor');
            const color = rawColor instanceof Color
              ? { r: rawColor.r, g: rawColor.g, b: rawColor.b, a: rawColor.a }
              : null;
            return {
              effect: material?.effectName || null,
              valid: material?.validate() || false,
              color,
            };
          });
          renderers.push({
            name: node.name,
            primitiveCount,
            materialCount: materials.length,
            bounds: bounds ? {
              center: { x: bounds.center.x, y: bounds.center.y, z: bounds.center.z },
              halfExtents: { x: bounds.halfExtents.x, y: bounds.halfExtents.y, z: bounds.halfExtents.z },
            } : null,
            materials,
          });
        }
        node.children.forEach(visit);
      };
      visit(child);
      rows.push({
        name: child.name,
        active: child.activeInHierarchy,
        meshRendererCount: renderers.length,
        worldPosition: { x: child.worldPosition.x, y: child.worldPosition.y, z: child.worldPosition.z },
        renderers,
      });
    }
    return rows;
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

  private populateDynamicTraffic(objectPool: ObjectPool<CompressibleObject>, logicalOrigin: Readonly<Vec3>): void {
    const dynamicType: 'car' | 'delivery_van' | 'garbage_truck' | null = (() => {
      switch (this.district.kind) {
        case 'SUPERMARKET': return 'delivery_van';
        case 'WAREHOUSE': return 'garbage_truck';
        case 'PARKING': return 'car';
        case 'CONSTRUCTION': return 'garbage_truck';
        case 'DOWNTOWN': return 'car';
        default: return null;
      }
    })();
    if (!dynamicType) return;
    const template = OBJECT_TEMPLATES.find((candidate) => candidate.type === dynamicType);
    if (!template) throw new Error(`[InfiniteWorldCell] Missing dynamic vehicle template: ${dynamicType}`);
    const visualKind = dynamicType === 'car' ? 'sedan' : dynamicType;

    const centerX = this.coord.x * this.cellSize - logicalOrigin.x;
    const centerZ = this.coord.z * this.cellSize - logicalOrigin.z;
    const startX = centerX - 12;
    const routeZ = centerZ + (this.district.kind === 'CONSTRUCTION' ? 10 : -4);
    const object = objectPool.get();
    object.spawn(template as IObjectTemplate, startX, routeZ, 0.35, `traffic_${this.coord.x}_${this.coord.z}_${visualKind}`);
    object.setRoutePosition(startX, routeZ, 90);
    this.objects.push(object);
    this.dynamicVehicles.push(new DynamicVehicle(
      `traffic_${this.coord.x}_${this.coord.z}_${visualKind}`,
      visualKind,
      object,
      centerX - 12,
      centerX + 12,
      visualKind === 'sedan' ? 4.0 : visualKind === 'delivery_van' ? 3.2 : 2.6,
    ));
  }

  /**
   * Deterministic district geometry in local cell space.  Cells are deliberately
   * composed on both axes: roads leave through all cardinal boundaries and
   * landmarks occupy the four corners, so east/west travel never reaches a void.
   */
  private buildEnvironment(): void {
    const half = this.cellSize * 0.5;

    // Four 32m grass quadrants cover the full 64m cell. `tile-low` is a 1m
    // source mesh: scale 16 here previously left a 16×16m hole at the cell
    // centre, exposing the scene skybox's neutral ground exactly where the
    // player spawns. The authored scene's legacy neutral floor is at y=0, so
    // streamed terrain is slightly above it and asphalt above the grass.
    for (const x of [-half * 0.5, half * 0.5]) {
      for (const z of [-half * 0.5, half * 0.5]) {
        this.spawn('terrainTile', x, z, V3(32, 1, 32), 0, 'DistrictGround', 0.01);
      }
    }

    // The spawn cell begins on grass with the road ahead of the player.  The
    // previous 12x crossroad occupied the whole portrait view and hid the
    // district landmarks, so it read as an empty asphalt test pad rather
    // than a navigable city neighbourhood.
    const isOpeningCell = this.coord.x === 0 && this.coord.z === 0;
    const roadZ = isOpeningCell ? -11 : 0;
    if (this.district.kind === 'RESIDENTIAL' || this.district.kind === 'PARK' || this.district.kind === 'DOWNTOWN') {
      this.spawn('roadCrossroad', 0, roadZ, V3(5.6, 1, 5.6), 0, 'FourWayRoad', 0.05);
    } else {
      this.spawn('roadStraight', 0, roadZ, V3(5.6, 1, 10), this.district.kind === 'PARKING' ? 90 : 0, 'DistrictRoad', 0.05);
    }

    this.buildDistrictLandmarks(this.district.kind);
  }

  /** Each branch uses only audited semantic glTF templates, never primitives. */
  private buildDistrictLandmarks(kind: DistrictKind): void {
    const lights = (): void => {
      for (const [x, z] of [[-5.3, -5.5], [5.3, -7.5], [-5.3, -15.5], [5.3, -17.5]]) {
        this.spawn('streetLight', x, z, V3(3.8, 3.8, 3.8), 0, 'DistrictStreetLight');
      }
    };
    const homes = (): void => {
      // The 9:16 camera's visible street corridor is narrower than a whole
      // 64m cell. Keep homes beside the opening road rather than at the far
      // corners so the first playable frame reads as a neighbourhood.
      this.spawn('buildingB', -6.5, -7.4, V3(1.8, 1.8, 1.8), 90, 'ResidentialHouseWest');
      this.spawn('buildingC', 6.5, -7.4, V3(1.8, 1.8, 1.8), -90, 'ResidentialHouseEast');
    };
    const trees = (): void => {
      this.spawn('treeLarge', -6.8, -2.5, V3(2.15, 2.15, 2.15), 0, 'DistrictTreeLarge');
      this.spawn('treeSmall', 6.8, -3.2, V3(2.25, 2.25, 2.25), 0, 'DistrictTreeSmall');
    };
    switch (kind) {
      case 'RESIDENTIAL':
        homes(); trees(); lights();
        this.spawn('pathStones', -7.3, -14.5, V3(3.2, 1, 4.6), 90, 'ResidentialWalkway');
        this.spawn('fence', 7.3, -15.5, V3(3.2, 1.5, 3.8), 90, 'ResidentialFence');
        this.spawn('sedan', 3.1, -8.5, V3(1.2, 1.2, 1.2), -90, 'ResidentialParkedSedan');
        break;
      case 'PARK':
        lights();
        for (const [x, z] of [[-9, -8], [9, -8], [-9, 8], [9, 8]]) this.spawn('treeLarge', x, z, V3(2.2, 2.2, 2.2), 0, 'ParkTree');
        this.spawn('treeSmall', 0, -13, V3(2.35, 2.35, 2.35), 0, 'ParkTreeCenter');
        this.spawn('pathStones', -8, 0, V3(3.5, 1, 7.5), 90, 'ParkWalkwayWest');
        this.spawn('pathStones', 8, 0, V3(3.5, 1, 7.5), 90, 'ParkWalkwayEast');
        this.spawn('fence', 0, 15, V3(4.5, 1.5, 4.5), 0, 'ParkFence');
        break;
      case 'SUPERMARKET':
        lights();
        this.spawn('commercialBuildingA', -8.8, -12, V3(2.5, 2.5, 2.5), 90, 'SupermarketBuilding');
        this.spawn('commercialBuildingD', 8.8, -12, V3(2.5, 2.5, 2.5), -90, 'SupermarketAnnex');
        this.spawn('deliveryVan', -3.2, -7.6, V3(1.15, 1.15, 1.15), 90, 'SupermarketDeliveryVan');
        this.spawn('sedan', 3.2, -7.6, V3(1.2, 1.2, 1.2), -90, 'SupermarketCustomerSedan');
        this.spawn('recyclingBox', -8, 8, V3(1.1, 1.1, 1.1), 0, 'SupermarketBoxStack');
        break;
      case 'WAREHOUSE':
        this.spawn('shippingContainer', -9, -10, V3(1.3, 1.3, 1.3), 90, 'WarehouseContainerWest');
        this.spawn('shippingContainer', 9, -10, V3(1.3, 1.3, 1.3), -90, 'WarehouseContainerEast');
        this.spawn('shelf', -8, 8, V3(1.15, 1.15, 1.15), 0, 'WarehouseShelf');
        this.spawn('crate', 8, 8, V3(1.15, 1.15, 1.15), 0, 'WarehouseCrateStack');
        this.spawn('deliveryVan', -3.3, -4.5, V3(1.15, 1.15, 1.15), 90, 'WarehouseDeliveryVan');
        this.spawn('garbageTruck', 3.3, -4.5, V3(1.15, 1.15, 1.15), -90, 'WarehouseGarbageTruck');
        this.spawn('fence', 0, 15, V3(4.5, 1.5, 4.5), 0, 'WarehouseFence');
        break;
      case 'PARKING':
        lights();
        this.spawn('sedan', -8, -9, V3(1.2, 1.2, 1.2), 90, 'ParkingSedanWest');
        this.spawn('sedan', 8, -9, V3(1.2, 1.2, 1.2), -90, 'ParkingSedanEast');
        this.spawn('deliveryVan', -8, 8, V3(1.15, 1.15, 1.15), 90, 'ParkingDeliveryVan');
        this.spawn('garbageTruck', 8, 8, V3(1.15, 1.15, 1.15), -90, 'ParkingGarbageTruck');
        this.spawn('commercialBuildingD', 0, -17, V3(2.2, 2.2, 2.2), 0, 'ParkingServiceBuilding');
        break;
      case 'CONSTRUCTION':
        this.spawn('bulldozer', -7, -8, V3(1.2, 1.2, 1.2), 90, 'ConstructionBulldozer');
        this.spawn('shippingContainer', 8, -10, V3(1.3, 1.3, 1.3), -90, 'ConstructionContainer');
        this.spawn('crate', -8, 8, V3(1.2, 1.2, 1.2), 0, 'ConstructionCrateStack');
        this.spawn('garbageTruck', 7, 8, V3(1.15, 1.15, 1.15), -90, 'ConstructionHauler');
        this.spawn('fence', -3, 13, V3(3.8, 1.5, 3.8), 90, 'ConstructionFence');
        for (const [x, z] of [[3, 12], [6, 12], [3, -4], [6, -4]]) this.spawn('constructionCone', x, z, V3(4.5, 4.5, 4.5), 0, 'ConstructionCone');
        break;
      case 'DOWNTOWN':
        lights();
        this.spawn('commercialBuildingA', -9, -12, V3(2.65, 2.65, 2.65), 90, 'DowntownShopWest');
        this.spawn('commercialBuildingD', 9, -12, V3(2.65, 2.65, 2.65), -90, 'DowntownShopEast');
        this.spawn('commercialBuildingD', -9, 10, V3(2.45, 2.45, 2.45), 90, 'DowntownTowerWest');
        this.spawn('commercialBuildingA', 9, 10, V3(2.45, 2.45, 2.45), -90, 'DowntownTowerEast');
        this.spawn('sedan', -3.5, -5, V3(1.2, 1.2, 1.2), 90, 'DowntownSedan');
        this.spawn('deliveryVan', 3.5, -5, V3(1.15, 1.15, 1.15), -90, 'DowntownDeliveryVan');
        break;
    }
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

  /**
   * Begin an independent playable session without carrying absorbed objects,
   * arena mass fragments, traffic positions or origin rebases into the next
   * mode. This is deliberately a world lifecycle operation, not a test-only
   * respawn: both Endless and Arena call it from their visible Start action.
   */
  public resetSession(renderPlayerPosition: Readonly<Vec3> = Vec3.ZERO): void {
    if (!this.initialized || !this.objectPool) return;
    for (const cell of this.activeCells.values()) cell.recycle(this.objectPool);
    this.activeCells.clear();
    this.logicalOrigin.set(0, 0, 0);
    this.currentCell.set(0, 0, 0);
    this.rebaseCount = 0;
    this.updateCells(renderPlayerPosition);
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
    this.updateDynamicTraffic(dt);
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

  /** Arena owns resource selection, while streamed traffic remains shared. */
  public updateDynamicTraffic(dt: number): void {
    for (const cell of this.activeCells.values()) cell.updateDynamicTraffic(dt);
  }

  /**
   * Drop real, absorbable recyclable bundles after an arena defeat. They are
   * allocated from the same Creator-backed object pool and use the same
   * CompressibleObject FSM as every ordinary world pickup.
   */
  public spawnArenaMassFragments(position: Readonly<Vec3>, totalMass: number, sourceId: string): number {
    if (!this.objectPool) return 0;
    const cell = this.activeCells.get(cellKey({ x: this.currentCell.x, z: this.currentCell.z }));
    if (!cell) return 0;
    const count = Math.max(2, Math.min(6, Math.round(totalMass / 250)));
    const fragmentMass = Math.max(25, Math.round(totalMass / count));
    const base = OBJECT_TEMPLATES[0];
    const fragmentTemplate: IObjectTemplate = {
      ...base,
      type: 'arena_mass_fragment',
      name: 'Compressed Mass Fragment',
      tier: ObjectTier.T1,
      mass: fragmentMass,
      value: Math.max(1, Math.round(fragmentMass / 10)),
      radius: 0.34,
    };
    for (let index = 0; index < count; index++) {
      const angle = (Math.PI * 2 * index) / count;
      const object = this.objectPool.get();
      object.spawn(
        fragmentTemplate,
        position.x + Math.cos(angle) * (1.1 + (index % 2) * 0.35),
        position.z + Math.sin(angle) * (1.1 + (index % 2) * 0.35),
        0.35,
        `arena_fragment_${sourceId}_${this.rebaseCount}_${index}`,
      );
      cell.objects.push(object);
    }
    return count;
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

  /** The visible district label is separate from the progression theme. */
  public getCurrentDistrictName(): string {
    return this.activeCells.get(cellKey({ x: this.currentCell.x, z: this.currentCell.z }))?.district.label
      || this.currentTheme.name;
  }

  public getSnapshot(): Record<string, unknown> {
    return {
      mode: '2D_GRID',
      cellSize: InfiniteWorldManager.CELL_SIZE,
      activeCellCount: this.activeCells.size,
      expectedActiveCellCount: InfiniteWorldManager.ACTIVE_CELL_COUNT,
      currentCell: { x: this.currentCell.x, z: this.currentCell.z },
      currentDistrict: this.getCurrentDistrictName(),
      logicalOrigin: { x: this.logicalOrigin.x, z: this.logicalOrigin.z },
      rebaseCount: this.rebaseCount,
      // Do not spread Map.values(): Cocos' ES5 build transform emits a single
      // iterator element for that form. Array.from preserves all real cells in
      // the Web Mobile runtime and keeps QA strictly read-only.
      activeCells: Array.from(this.activeCells.values(), (cell) => ({
        x: cell.coord.x,
        z: cell.coord.z,
        district: cell.district.kind,
      })),
      dynamicVehicles: Array.from(this.activeCells.values(), (cell) => cell.dynamicVehicles.map((vehicle) => vehicle.getSnapshot())).flat(),
      visualDiagnostics: this.activeCells.get(cellKey({ x: this.currentCell.x, z: this.currentCell.z }))?.getVisualDiagnostics() || [],
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
      cell.applyWorldRebase(shift);
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
