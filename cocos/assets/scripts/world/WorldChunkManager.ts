/**
 * 无尽分块世界流式管理器与开放区域场景构建 (WorldChunkManager.ts)
 */
import { _decorator, Component, Node, Vec3 } from 'cc';
import { IRegionThemeConfig, REGION_THEMES, ObjectTier } from '../data/GameConfig';
import { ChunkItemGenerator, IChunkSpawnItem } from './ChunkConfig';
import { CompressibleObject } from '../gameplay/CompressibleObject';
import { ObjectPool } from '../core/ObjectPool';
import { MeshFactory } from '../core/MeshFactory';

const { ccclass } = _decorator;

export class WorldChunk {
  public index: number = 0;
  public theme: IRegionThemeConfig;
  public centerZ: number = 0;
  public length: number = 50.0;
  public objects: CompressibleObject[] = [];
  public chunkNode: Node;

  constructor(chunkNode: Node, theme: IRegionThemeConfig, index: number, centerZ: number, length: number = 50.0) {
    this.chunkNode = chunkNode;
    this.theme = theme;
    this.index = index;
    this.centerZ = centerZ;
    this.length = length;
    this.buildVisibleEnvironment();
  }

  /**
   * 构建 36m 宽开放片区式 3D 地面、低矮边界与多区域特征大型装饰物
   */
  private buildVisibleEnvironment(): void {
    // 1. 宽阔主地面 (Ground - 36m 宽)
    const ground = new Node('Ground');
    ground.setPosition(0, 0, this.centerZ);
    this.chunkNode.addChild(ground);
    MeshFactory.attachMesh(ground, MeshFactory.getBoxMesh(36.0, 0.1, this.length), this.theme.groundColor, 0.8, 0.05);

    // 2. 地形边缘低矮路沿/缓冲带 (非遮挡高墙)
    const curbL = new Node('Boundary_Left');
    curbL.setPosition(-18.0, 0.2, this.centerZ);
    this.chunkNode.addChild(curbL);
    MeshFactory.attachMesh(curbL, MeshFactory.getBoxMesh(0.6, 0.4, this.length), '#334155', 0.6, 0.2);

    const curbR = new Node('Boundary_Right');
    curbR.setPosition(18.0, 0.2, this.centerZ);
    this.chunkNode.addChild(curbR);
    MeshFactory.attachMesh(curbR, MeshFactory.getBoxMesh(0.6, 0.4, this.length), '#334155', 0.6, 0.2);

    // 3. 根据主题生成区域大型场景装饰物 (开放摆放，留出宽裕移动通道)
    if (this.theme.id === 'bedroom') {
      // 卧室大型双人床 (靠左侧)
      const bed = new Node('Decor_Bed');
      bed.setPosition(-10.0, 0.5, this.centerZ - 8.0);
      this.chunkNode.addChild(bed);
      MeshFactory.attachMesh(bed, MeshFactory.getBoxMesh(4.0, 0.9, 5.0), '#475569');

      // 学习书桌与书架 (靠右侧)
      const desk = new Node('Decor_Desk');
      desk.setPosition(10.5, 0.6, this.centerZ + 6.0);
      this.chunkNode.addChild(desk);
      MeshFactory.attachMesh(desk, MeshFactory.getBoxMesh(3.0, 1.2, 5.0), '#64748b');

      // 地毯
      const carpet = new Node('Decor_Carpet');
      carpet.setPosition(0, 0.06, this.centerZ);
      this.chunkNode.addChild(carpet);
      MeshFactory.attachMesh(carpet, MeshFactory.getBoxMesh(10.0, 0.02, 12.0), '#94a3b8');

    } else if (this.theme.id === 'warehouse') {
      // 重型货物托盘
      const pallet = new Node('Decor_Pallet');
      pallet.setPosition(-10.5, 0.4, this.centerZ - 10.0);
      this.chunkNode.addChild(pallet);
      MeshFactory.attachMesh(pallet, MeshFactory.getBoxMesh(4.5, 0.8, 4.5), '#8b5a2b');

      // 高耸仓储货架
      const shelves = new Node('Decor_Shelves');
      shelves.setPosition(11.0, 2.5, this.centerZ + 8.0);
      this.chunkNode.addChild(shelves);
      MeshFactory.attachMesh(shelves, MeshFactory.getBoxMesh(3.0, 5.0, 8.0), '#475569');

      // 中间叉车通道警示条纹
      const stripe = new Node('Decor_Stripe');
      stripe.setPosition(0, 0.06, this.centerZ);
      this.chunkNode.addChild(stripe);
      MeshFactory.attachMesh(stripe, MeshFactory.getBoxMesh(6.0, 0.02, this.length), '#eab308');

    } else if (this.theme.id === 'supermarket') {
      // 收银台通道
      const counter = new Node('Decor_Counter');
      counter.setPosition(-9.0, 0.6, this.centerZ - 12.0);
      this.chunkNode.addChild(counter);
      MeshFactory.attachMesh(counter, MeshFactory.getBoxMesh(8.0, 1.2, 2.5), '#f1f5f9');

      // 饮料堆头与促销展示台
      const promo = new Node('Decor_PromoDisplay');
      promo.setPosition(9.5, 1.0, this.centerZ + 6.0);
      this.chunkNode.addChild(promo);
      MeshFactory.attachMesh(promo, MeshFactory.getBoxMesh(3.5, 2.0, 7.0), '#38bdf8');
    }
  }

  public populate(items: IChunkSpawnItem[], objectPool: ObjectPool<CompressibleObject>): void {
    for (const item of items) {
      const obj = objectPool.get();
      const worldZ = this.centerZ + item.localZ;
      obj.spawn(item.template, item.localX, worldZ, 0.35);
      this.objects.push(obj);
    }
  }

  public clear(objectPool: ObjectPool<CompressibleObject>): void {
    for (const obj of this.objects) {
      obj.recycle();
      objectPool.release(obj);
    }
    this.objects = [];
  }
}

@ccclass('WorldChunkManager')
export class WorldChunkManager extends Component {
  public static readonly CHUNK_LENGTH = 50.0;
  public static readonly ACTIVE_CHUNK_COUNT = 4;

  public activeChunks: WorldChunk[] = [];
  public currentTheme: IRegionThemeConfig = REGION_THEMES[0];
  public currentRegionIndex: number = 0;
  private nextChunkIndex: number = 0;
  private objectPool: ObjectPool<CompressibleObject> | null = null;
  private objectRootNode: Node | null = null;

  public init(objectFactory: () => CompressibleObject): void {
    this.objectRootNode = new Node('TrashObjectPoolRoot');
    this.node.addChild(this.objectRootNode);

    this.objectPool = new ObjectPool<CompressibleObject>(
      () => {
        const obj = objectFactory();
        if (this.objectRootNode && obj.node.parent !== this.objectRootNode) {
          this.objectRootNode.addChild(obj.node);
        }
        return obj;
      },
      (obj) => obj.recycle(),
      40,
      350
    );

    // 初始生成前 3 个分块
    for (let i = 0; i < 3; i++) {
      this.spawnNextChunk();
    }
    this.currentTheme = REGION_THEMES[0];
    this.currentRegionIndex = 0;
  }

  public spawnNextChunk(): WorldChunk {
    // 区域序列：Chunk 0-1 (Bedroom), Chunk 2-3 (Warehouse), Chunk 4+ (Supermarket)
    let chunkThemeIndex = 0;
    if (this.nextChunkIndex >= 4) {
      chunkThemeIndex = 2; // Supermarket
    } else if (this.nextChunkIndex >= 2) {
      chunkThemeIndex = 1; // Warehouse
    } else {
      chunkThemeIndex = 0; // Bedroom
    }

    const chunkTheme = REGION_THEMES[chunkThemeIndex] || REGION_THEMES[0];

    const centerZ = -this.nextChunkIndex * WorldChunkManager.CHUNK_LENGTH;
    const chunkNode = new Node(`Chunk_${this.nextChunkIndex}`);
    this.node.addChild(chunkNode);

    const chunk = new WorldChunk(
      chunkNode,
      chunkTheme,
      this.nextChunkIndex,
      centerZ,
      WorldChunkManager.CHUNK_LENGTH
    );

    const items = ChunkItemGenerator.generateChunkItems(
      this.currentTheme,
      this.nextChunkIndex,
      WorldChunkManager.CHUNK_LENGTH
    );

    if (this.objectPool) {
      chunk.populate(items, this.objectPool);
    }

    this.activeChunks.push(chunk);
    this.nextChunkIndex++;
    return chunk;
  }

  public updateChunks(playerZ: number): void {
    if (this.activeChunks.length === 0) return;

    // 前向检测：当玩家前进到最后一个分块中心前 25m 时，生成新分块
    const forwardMostChunk = this.activeChunks[this.activeChunks.length - 1];
    if (playerZ < forwardMostChunk.centerZ + WorldChunkManager.CHUNK_LENGTH * 0.5) {
      this.spawnNextChunk();
    }

    // 后向回收：当玩家远离最早分块超过 1.5 个分块长度时回收
    if (this.activeChunks.length > WorldChunkManager.ACTIVE_CHUNK_COUNT) {
      const oldestChunk = this.activeChunks[0];
      if (playerZ < oldestChunk.centerZ - WorldChunkManager.CHUNK_LENGTH * 1.5) {
        if (this.objectPool) {
          oldestChunk.clear(this.objectPool);
        }
        oldestChunk.chunkNode.destroy();
        this.activeChunks.shift();
      }
    }

    // 更新当前玩家所在的 Region 主题
    const currentChunk = this.activeChunks.find(c => Math.abs(playerZ - c.centerZ) <= WorldChunkManager.CHUNK_LENGTH * 0.5);
    if (currentChunk && this.currentTheme.id !== currentChunk.theme.id) {
      this.currentTheme = currentChunk.theme;
      this.currentRegionIndex = REGION_THEMES.findIndex(t => t.id === currentChunk.theme.id);
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
    for (const chunk of this.activeChunks) {
      for (const obj of chunk.objects) {
        const state = obj.getState();
        if (state === 'ABSORBED' || state === 'RECYCLED') continue;
        
        const absorbed = obj.updateMotion(
          dt,
          machinePos,
          suctionRadius,
          machineMaxTier,
          isMagnetStorm
        );
        if (absorbed) {
          onAbsorbCallback(obj);
        }
      }
    }
  }

  public getVisibleObjectCount(): number {
    let count = 0;
    for (const chunk of this.activeChunks) {
      for (const obj of chunk.objects) {
        const s = obj.getState();
        if (s !== 'ABSORBED' && s !== 'RECYCLED') {
          count++;
        }
      }
    }
    return count;
  }

  public getRegionIndex(): number {
    return this.currentRegionIndex;
  }
}
