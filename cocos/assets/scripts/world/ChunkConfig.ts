/**
 * 地图分块生成配置 (ChunkConfig.ts)
 */
import { IRegionThemeConfig, OBJECT_TEMPLATES, IObjectTemplate, ObjectTier } from '../data/GameConfig';

export interface IChunkSpawnItem {
  readonly template: IObjectTemplate;
  readonly localX: number;
  readonly localZ: number;
  readonly customId?: string;
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
      let customId: string | undefined = undefined;

      if (chunkIndex === 0 && i === 0 && available.some(t => t.tier === ObjectTier.T2)) {
        // Chunk 0 首个特定物体：T2 中型纸箱 (用于 Tier Lock 验收)
        template = available.find(t => t.tier === ObjectTier.T2) || available[0];
        localX = 0.0;
        localZ = -8.0;
        customId = 't2_target_bed_box';
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
        localZ,
        customId
      });
    }

    return items;
  }
}

/** Deterministic two-dimensional resource clusters for InfiniteWorldManager. */
export class CellItemGenerator {
  public static generateCellItems(
    theme: IRegionThemeConfig,
    cellX: number,
    cellZ: number,
    seed: number,
    cellSize: number,
  ): IChunkSpawnItem[] {
    const available = OBJECT_TEMPLATES.filter((template) => theme.availableTiers.includes(template.tier));
    const t1 = available.filter((template) => template.tier === ObjectTier.T1);
    const items: IChunkSpawnItem[] = [];
    let state = (seed >>> 0) || 1;
    const random = (): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    const clusterCenters: ReadonlyArray<readonly [number, number]> = [
      [-17, -14], [16, -12], [-13, 15], [15, 15], [0, -4],
    ];
    const count = 20 + positive(seed, 5);
    const half = cellSize * 0.5 - 5;
    for (let index = 0; index < count; index++) {
      const center = clusterCenters[index % clusterCenters.length];
      const highTier = index % 5 === 0 && available.some((template) => template.tier >= ObjectTier.T2);
      const candidates = highTier
        ? available.filter((template) => template.tier >= ObjectTier.T2)
        : (t1.length > 0 ? t1 : available);
      const template = candidates[index % candidates.length] || available[0];
      const localX = Math.max(-half, Math.min(half, center[0] + (random() - 0.5) * 8));
      const localZ = Math.max(-half, Math.min(half, center[1] + (random() - 0.5) * 8));
      items.push({
        template,
        localX,
        localZ,
        customId: `cell_${cellX}_${cellZ}_${index}`,
      });
    }

    // The initial cell retains a deterministic nearby T2 target for the
    // existing LV1 lock -> LV2 unlock vertical slice.
    if (cellX === 0 && cellZ === 0) {
      const target = available.find((template) => template.tier === ObjectTier.T2);
      if (target) items.unshift({ template: target, localX: 0, localZ: -8, customId: 't2_target_bed_box' });
    }
    return items;
  }
}

function positive(value: number, divisor: number): number {
  const result = value % divisor;
  return result < 0 ? result + divisor : result;
}
