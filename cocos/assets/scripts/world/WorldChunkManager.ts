/**
 * 无尽分块世界流式管理器与 3D 卧室场景构建 (WorldChunkManager.ts)
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
  public length: number = 40.0;
  public objects: CompressibleObject[] = [];
  public chunkNode: Node;

  constructor(chunkNode: Node, theme: IRegionThemeConfig, index: number, centerZ: number, length: number = 40.0) {
    this.chunkNode = chunkNode;
    this.theme = theme;
    this.index = index;
    this.centerZ = centerZ;
    this.length = length;
    this.buildVisibleEnvironment();
  }

  /**
   * 构建真实可见的 3D 地面、墙壁与卧室家具装饰
   */
  private buildVisibleEnvironment(): void {
    // 1. 地面 (Ground)
    const ground = new Node('Ground');
    ground.setPosition(0, 0, this.centerZ);
    this.chunkNode.addChild(ground);
    MeshFactory.attachMesh(ground, MeshFactory.getBoxMesh(24.0, 0.1, this.length), this.theme.groundColor, 0.8, 0.05);

    // 2. 两侧无边界视觉墙 (隐形限制，或者较远的边界墙)
    const wallL = new Node('Wall_Left');
    wallL.setPosition(-12.0, 1.2, this.centerZ);
    this.chunkNode.addChild(wallL);
    MeshFactory.attachMesh(wallL, MeshFactory.getBoxMesh(0.4, 2.4, this.length), '#e2e8f0');

    const wallR = new Node('Wall_Right');
    wallR.setPosition(12.0, 1.2, this.centerZ);
    this.chunkNode.addChild(wallR);
    MeshFactory.attachMesh(wallR, MeshFactory.getBoxMesh(0.4, 2.4, this.length), '#e2e8f0');

    // 3. 根据主题生成区域装饰物 (RegionSequence)
    if (this.theme.id === 'bedroom') {
      const bed = new Node('Bed');
      bed.setPosition(-8.0, 0.4, this.centerZ - 10.0);
      this.chunkNode.addChild(bed);
      MeshFactory.attachMesh(bed, MeshFactory.getBoxMesh(3.0, 0.7, 4.5), '#64748b');

      const desk = new Node('Desk');
      desk.setPosition(8.5, 0.5, this.centerZ + 5.0);
      this.chunkNode.addChild(desk);
      MeshFactory.attachMesh(desk, MeshFactory.getBoxMesh(2.2, 1.0, 4.0), '#475569');
    } else if (this.theme.id === 'warehouse') {
      const pallet = new Node('Pallet');
      pallet.setPosition(-8.0, 0.2, this.centerZ - 10.0);
      this.chunkNode.addChild(pallet);
      MeshFactory.attachMesh(pallet, MeshFactory.getBoxMesh(3.0, 0.4, 3.0), '#8b5a2b');

      const shelves = new Node('Shelves');
      shelves.setPosition(8.5, 2.0, this.centerZ + 5.0);
      this.chunkNode.addChild(shelves);
      MeshFactory.attachMesh(shelves, MeshFactory.getBoxMesh(2.0, 4.0, 6.0), '#708090');
    } else if (this.theme.id === 'supermarket') {
      const counter = new Node('Counter');
      counter.setPosition(0.0, 0.5, this.centerZ - 15.0);
      this.chunkNode.addChild(counter);
      MeshFactory.attachMesh(counter, MeshFactory.getBoxMesh(6.0, 1.0, 2.0), '#ffffff');

      const shelf = new Node('Shelf');
      shelf.setPosition(8.5, 1.5, this.centerZ + 5.0);
      this.chunkNode.addChild(shelf);
      MeshFactory.attachMesh(shelf, MeshFactory.getBoxMesh(2.0, 3.0, 8.0), '#f0e68c');
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
  public static readonly CHUNK_LENGTH = 40.0;
  public static readonly ACTIVE_CHUNK_COUNT = 3;

  public activeChunks: WorldChunk[] = [];
  public currentTheme: IRegionThemeConfig = REGION_THEMES[0];
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
      250
    );

    // 初始生成前 2 个分块
    for (let i = 0; i < 2; i++) {
      this.spawnNextChunk();
    }
  }

  public spawnNextChunk(): WorldChunk {
    const centerZ = -this.nextChunkIndex * WorldChunkManager.CHUNK_LENGTH;
    const chunkNode = new Node(`Chunk_${this.nextChunkIndex}`);
    this.node.addChild(chunkNode);

    const chunk = new WorldChunk(
      chunkNode,
      this.currentTheme,
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

    // 1. 检查前方生成
    const forwardMostChunk = this.activeChunks[this.activeChunks.length - 1];
    if (playerZ < forwardMostChunk.centerZ + WorldChunkManager.CHUNK_LENGTH * 0.5) {
      this.spawnNextChunk();
    }

    // 2. 检查后方超出视距的旧分块回收
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
        if (obj.getState() === 'ABSORBED' || obj.getState() === 'RECYCLED') continue;
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
}
