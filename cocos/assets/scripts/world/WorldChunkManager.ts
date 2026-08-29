/**
 * 无尽分块世界流式管理器 (WorldChunk.ts & WorldChunkManager.ts)
 */
import { _decorator, Component, Node, Vec3 } from 'cc';
import { IRegionThemeConfig, REGION_THEMES, ObjectTier } from '../data/GameConfig';
import { ChunkItemGenerator, IChunkSpawnItem } from './ChunkConfig';
import { CompressibleObject } from '../gameplay/CompressibleObject';
import { ObjectPool } from '../core/ObjectPool';

const { ccclass, property } = _decorator;

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
  public static readonly ACTIVE_CHUNK_COUNT = 4;

  public activeChunks: WorldChunk[] = [];
  public currentTheme: IRegionThemeConfig = REGION_THEMES[0];
  private nextChunkIndex: number = 0;
  private objectPool: ObjectPool<CompressibleObject> | null = null;

  public init(objectFactory: () => CompressibleObject): void {
    this.objectPool = new ObjectPool<CompressibleObject>(
      objectFactory,
      (obj) => obj.recycle(),
      40,
      250
    );

    // 初始生成前 3 个分块
    for (let i = 0; i < 3; i++) {
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
    if (playerZ < forwardMostChunk.centerZ + WorldChunkManager.CHUNK_LENGTH) {
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
