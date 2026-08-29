/**
 * 地图分块生成配置 (ChunkConfig.ts)
 */
import { IRegionThemeConfig, OBJECT_TEMPLATES, IObjectTemplate, ObjectTier } from '../data/GameConfig';

export interface IChunkSpawnItem {
  readonly template: IObjectTemplate;
  readonly localX: number;
  readonly localZ: number;
}

export class ChunkItemGenerator {
  public static generateChunkItems(
    theme: IRegionThemeConfig,
    chunkIndex: number,
    chunkLength: number = 40.0
  ): IChunkSpawnItem[] {
    const items: IChunkSpawnItem[] = [];
    const available = OBJECT_TEMPLATES.filter(t => theme.availableTiers.includes(t.tier));

    // 每个分块生成 25~35 个物品
    const count = 28 + (chunkIndex % 5);
    const halfLen = chunkLength / 2;

    for (let i = 0; i < count; i++) {
      // 保证至少 70% 为 T1 基础物品，30% 为高 Tier 物品
      const isHighTier = i % 4 === 0 && available.some(t => t.tier >= ObjectTier.T2);
      const candidates = isHighTier
        ? available.filter(t => t.tier >= ObjectTier.T2)
        : available.filter(t => t.tier === ObjectTier.T1);

      const template = candidates[i % candidates.length] || available[0];
      const localX = -5.0 + ((i * 3.7) % 10.0);
      const localZ = -halfLen + 2.0 + ((i * 1.3) % (chunkLength - 4.0));

      items.push({
        template,
        localX,
        localZ
      });
    }

    return items;
  }
}
