/**
 * 无尽分块世界流式管理器。
 *
 * 正式地表、道路、建筑、植被和围栏全部来自 WorldArtLibrary 中由 Cocos
 * Creator 保存的 glTF 模板；本文件不包含任何程序化 MeshFactory 世界几何体。
 */
import { _decorator, Component, director, Node, Vec3 } from 'cc';
import { IRegionThemeConfig, REGION_THEMES, ObjectTier } from '../data/GameConfig';
import { ObjectPool } from '../core/ObjectPool';
import { eventBus } from '../core/EventBus';
import { CompressibleObject } from '../gameplay/CompressibleObject';
import { ChunkItemGenerator, IChunkSpawnItem } from './ChunkConfig';
import { WorldArtKind, WorldArtLibrary } from './WorldArtLibrary';

const { ccclass } = _decorator;
const V3 = (x: number, y: number, z: number): Vec3 => new Vec3(x, y, z);
const SCALE_ONE = new Vec3(1, 1, 1);

export class WorldChunk {
  public readonly objects: CompressibleObject[] = [];

  constructor(
    public readonly chunkNode: Node,
    public readonly theme: IRegionThemeConfig,
    public readonly index: number,
    public readonly centerZ: number,
    public readonly art: WorldArtLibrary,
    public readonly length: number = 50.0
  ) {
    this.buildVisibleEnvironment();
  }

  private spawn(
    kind: WorldArtKind,
    x: number,
    z: number,
    scale: Readonly<Vec3> = SCALE_ONE,
    yawDegrees: number = 0,
    name: string = kind
  ): Node {
    return this.art.spawn(kind, this.chunkNode, V3(x, 0, z), scale, yawDegrees, name);
  }

  /** 以真实的导入资产构成一段可探索街区，中心保持为垃圾可到达空间。 */
  private buildVisibleEnvironment(): void {
    // 首屏便能读取出完整街区：草坪 - 路面 - 人行区 - 建筑地块。所有单元均为
    // Creator 导入的 glTF mesh，尺寸以手机竖屏相机的可视宽度校准。
    for (const localZ of [-24, 0, 24]) {
      this.spawn('terrainTile', -9, this.centerZ + localZ, V3(11, 1, 24), 0, 'ParkGroundLeft');
      this.spawn('terrainTile', 9, this.centerZ + localZ, V3(11, 1, 24), 180, 'ParkGroundRight');
    }

    if (this.index % 3 === 1) {
      this.spawn('roadCrossroad', 0, this.centerZ, V3(8, 1, 8), 0, 'RoadIntersection');
    } else {
      for (const localZ of [-24, 0, 24]) {
        this.spawn('roadStraight', 0, this.centerZ + localZ, V3(8, 1, 24), 0, 'RoadLane');
      }
    }

    const leftResidential: WorldArtKind = this.index % 2 === 0 ? 'buildingB' : 'buildingC';
    const rightResidential: WorldArtKind = leftResidential === 'buildingB' ? 'buildingC' : 'buildingB';
    // Keep the city landmarks inside a 9:16 camera's narrow side strips.
    // Previous x=6~7 placement made the assets technically spawned yet almost
    // entirely clipped on a phone screen.
    this.spawn(leftResidential, -4.55, this.centerZ - 6.5, V3(2.45, 2.45, 2.45), 90, 'ResidentialLeft');
    this.spawn(rightResidential, 4.55, this.centerZ - 8.5, V3(2.45, 2.45, 2.45), -90, 'ResidentialRight');
    this.spawn('commercialBuildingA', -4.65, this.centerZ - 14.5, V3(2.65, 2.65, 2.65), 90, 'CornerMarket');
    this.spawn('commercialBuildingD', 4.65, this.centerZ - 15.5, V3(2.65, 2.65, 2.65), -90, 'CornerStore');

    // 道路语义与公园簇：路灯、树、步道、围栏和静态车辆均位于首屏可视区。
    for (const localZ of [-17, -5, 7, 19]) {
      this.spawn('streetLight', -4.15, this.centerZ + localZ, V3(4.2, 4.2, 4.2), 0, 'StreetLightLeft');
      this.spawn('streetLight', 4.15, this.centerZ + localZ, V3(4.2, 4.2, 4.2), 180, 'StreetLightRight');
    }
    this.spawn('pathStones', -4.5, this.centerZ - 11, V3(3.8, 1, 4.6), 90, 'ParkWalkway');
    this.spawn('fence', 4.5, this.centerZ - 12, V3(3.8, 1.7, 3.8), 90, 'ParkFence');
    this.spawn('treeLarge', -4.45, this.centerZ - 1.5, V3(3.8, 3.8, 3.8), 0, 'ParkTreeLarge');
    this.spawn('treeSmall', -4.7, this.centerZ - 10.5, V3(3.9, 3.9, 3.9), 0, 'ParkTreeSmallA');
    this.spawn('treeSmall', 4.4, this.centerZ - 2.5, V3(3.9, 3.9, 3.9), 0, 'ParkTreeSmallB');
    this.spawn('treeLarge', 4.8, this.centerZ - 11.5, V3(3.7, 3.7, 3.7), 0, 'ParkTreeLargeRear');
    this.spawn('sedan', 2.25, this.centerZ - 10, V3(1.25, 1.25, 1.25), 0, 'ParkedSedan');
    this.spawn('deliveryVan', -2.25, this.centerZ + 11, V3(1.15, 1.15, 1.15), 180, 'ParkedDeliveryVan');
    this.spawn('constructionCone', 4.8, this.centerZ + 13, V3(7, 7, 7), 0, 'RoadCone');
  }

  public populate(items: IChunkSpawnItem[], objectPool: ObjectPool<CompressibleObject>): void {
    for (const item of items) {
      const obj = objectPool.get();
      obj.spawn(item.template, item.localX, this.centerZ + item.localZ, 0.35, item.customId);
      this.objects.push(obj);
    }
  }

  public clear(objectPool: ObjectPool<CompressibleObject>): void {
    this.objects.forEach((obj) => {
      obj.recycle();
      objectPool.release(obj);
    });
    this.objects.length = 0;
  }
}

@ccclass('WorldChunkManager')
export class WorldChunkManager extends Component {
  public static readonly CHUNK_LENGTH = 50.0;
  public static readonly ACTIVE_CHUNK_COUNT = 4;

  public activeChunks: WorldChunk[] = [];
  public currentTheme: IRegionThemeConfig = REGION_THEMES[0];
  public currentRegionIndex = 0;

  private nextChunkIndex = 0;
  private objectPool: ObjectPool<CompressibleObject> | null = null;
  private objectRootNode: Node | null = null;
  private artLibrary: WorldArtLibrary | null = null;

  public init(objectFactory: () => CompressibleObject): void {
    this.artLibrary = director.getScene()?.getComponentInChildren(WorldArtLibrary) || null;
    if (!this.artLibrary) {
      throw new Error('[WorldChunkManager] Missing editor-saved WorldArtLibrary. The production world cannot use primitive fallback geometry.');
    }
    this.artLibrary.validateTemplates();

    this.objectRootNode = new Node('TrashObjectPoolRoot');
    this.node.addChild(this.objectRootNode);
    this.objectPool = new ObjectPool<CompressibleObject>(
      () => {
        const obj = objectFactory();
        if (this.objectRootNode && obj.node.parent !== this.objectRootNode) this.objectRootNode.addChild(obj.node);
        return obj;
      },
      (obj) => obj.recycle(),
      40,
      350
    );

    for (let i = 0; i < 3; i++) this.spawnNextChunk();
    this.currentTheme = REGION_THEMES[0];
    this.currentRegionIndex = 0;
  }

  public spawnNextChunk(): WorldChunk {
    const chunkThemeIndex = this.nextChunkIndex >= 10 ? 5
      : this.nextChunkIndex >= 8 ? 4
      : this.nextChunkIndex >= 6 ? 3
      : this.nextChunkIndex >= 4 ? 2
      : this.nextChunkIndex >= 2 ? 1 : 0;
    const chunkTheme = REGION_THEMES[chunkThemeIndex] || REGION_THEMES[0];
    const centerZ = -this.nextChunkIndex * WorldChunkManager.CHUNK_LENGTH;
    const chunkNode = new Node(`Chunk_${this.nextChunkIndex}`);
    this.node.addChild(chunkNode);

    if (!this.artLibrary) throw new Error('[WorldChunkManager] World art library was released before chunk spawn.');
    const chunk = new WorldChunk(chunkNode, chunkTheme, this.nextChunkIndex, centerZ, this.artLibrary, WorldChunkManager.CHUNK_LENGTH);
    if (this.objectPool) chunk.populate(ChunkItemGenerator.generateChunkItems(chunkTheme, this.nextChunkIndex, WorldChunkManager.CHUNK_LENGTH), this.objectPool);

    this.activeChunks.push(chunk);
    this.nextChunkIndex++;
    return chunk;
  }

  public updateChunks(playerZ: number): void {
    if (this.activeChunks.length === 0) return;
    const forwardMostChunk = this.activeChunks[this.activeChunks.length - 1];
    if (playerZ < forwardMostChunk.centerZ + WorldChunkManager.CHUNK_LENGTH * 0.5) this.spawnNextChunk();

    if (this.activeChunks.length > WorldChunkManager.ACTIVE_CHUNK_COUNT) {
      const oldestChunk = this.activeChunks[0];
      if (playerZ < oldestChunk.centerZ - WorldChunkManager.CHUNK_LENGTH * 1.5) {
        if (this.objectPool) oldestChunk.clear(this.objectPool);
        oldestChunk.chunkNode.destroy();
        this.activeChunks.shift();
      }
    }

    const currentChunk = this.activeChunks.find((chunk) => Math.abs(playerZ - chunk.centerZ) <= WorldChunkManager.CHUNK_LENGTH * 0.5);
    if (currentChunk && this.currentTheme.id !== currentChunk.theme.id) {
      this.currentTheme = currentChunk.theme;
      this.currentRegionIndex = REGION_THEMES.findIndex((theme) => theme.id === currentChunk.theme.id);
      eventBus.emit('UI_REGION_CHANGED', { region: this.currentTheme.name, regionId: this.currentTheme.id });
    }
  }

  public updateObjects(
    dt: number,
    machinePos: Vec3,
    suctionRadius: number,
    machineMaxTier: ObjectTier,
    isMagnetStorm: boolean,
    onAbsorbCallback: (obj: CompressibleObject) => void
  ): void {
    this.activeChunks.forEach((chunk) => chunk.objects.forEach((obj) => {
      const state = obj.getState();
      if (state !== 'ABSORBED' && state !== 'RECYCLED' && obj.updateMotion(dt, machinePos, suctionRadius, machineMaxTier, isMagnetStorm)) {
        onAbsorbCallback(obj);
      }
    }));
  }

  public getAllObjects(): CompressibleObject[] {
    return this.activeChunks.flatMap((chunk) => chunk.objects.filter((obj) => obj.node?.isValid));
  }

  public getVisibleObjectCount(): number {
    return this.activeChunks.reduce((count, chunk) => count + chunk.objects.filter((obj) => {
      const state = obj.getState();
      return state !== 'ABSORBED' && state !== 'RECYCLED';
    }).length, 0);
  }

  public getRegionIndex(): number {
    return this.currentRegionIndex;
  }
}
