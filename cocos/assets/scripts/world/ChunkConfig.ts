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
    chunkLength: number = 50.0
  ): IChunkSpawnItem[] {
    const items: IChunkSpawnItem[] = [];
    const available = OBJECT_TEMPLATES.filter(t => theme.availableTiers.includes(t.tier));

    // 每个分块生成 32~42 个物品，分布于开放区域
    const count = 35 + (chunkIndex % 5);
    const halfLen = chunkLength / 2;

    // 分布在 3 大区域：左侧物品簇 (-12 ~ -4)、中心游玩区 (-3 ~ 3)、右侧物品簇 (4 ~ 12)
    const clusterOffsets = [-8.0, -3.0, 0.0, 3.0, 8.0, -11.0, 11.0];

    for (let i = 0; i < count; i++) {
      let template: IObjectTemplate;
      let localX: number;
      let localZ: number;

      if (chunkIndex === 0 && i === 0 && available.some(t => t.tier === ObjectTier.T2)) {
        // Chunk 0 首个特定物体：T2 中型纸箱 (用于 Tier Lock 验收)
        template = available.find(t => t.tier === ObjectTier.T2) || available[0];
        localX = 0.0;
        localZ = -8.0;
      } else {
        // 保证前几个分块中 75% 为 T1 基础可吸附物，25% 为高 Tier 目标
        const isHighTier = (i % 4 === 0) && available.some(t => t.tier >= ObjectTier.T2);
        const candidates = isHighTier
          ? available.filter(t => t.tier >= ObjectTier.T2)
          : available.filter(t => t.tier === ObjectTier.T1);

        template = candidates[i % candidates.length] || available[0];
        
        const clusterBaseX = clusterOffsets[i % clusterOffsets.length];
        const jitterX = ((i * 1.7) % 3.0) - 1.5;
        localX = Math.max(-14.0, Math.min(14.0, clusterBaseX + jitterX));
        localZ = -halfLen + 3.0 + ((i * 1.35) % (chunkLength - 6.0));
      }

      items.push({
        template,
        localX,
        localZ
      });
    }

    return items;
  }
}
