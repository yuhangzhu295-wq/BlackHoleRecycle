/**
 * 地图分块生成配置 (ChunkConfig.ts)
 */
import { IRegionThemeConfig, OBJECT_TEMPLATES, IObjectTemplate, ObjectTier } from '../data/GameConfig';
import { DistrictTemplate, getDistrictTemplateForRegion } from './DistrictTemplates';

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

      // Keep procedural chunks generic. Golden City's tutorial placement is
      // authored under CollectibleSpawnPoints, never selected by chunk index.
      const isHighTier = (i % 4 === 0) && available.some(t => t.tier >= ObjectTier.T2);
      const candidates = isHighTier
        ? available.filter(t => t.tier >= ObjectTier.T2)
        : available.filter(t => t.tier === ObjectTier.T1);

      template = candidates[i % candidates.length] || available[0];

      const clusterBaseX = clusterOffsets[i % clusterOffsets.length];
      const jitterX = ((i * 1.7) % 3.0) - 1.5;
      localX = Math.max(-14.0, Math.min(14.0, clusterBaseX + jitterX));
      localZ = -halfLen + 3.0 + ((i * 1.35) % (chunkLength - 6.0));

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
  /**
   * 正式空间节奏：开放区域为主，可吞目标散布而不是堆叠。
   * - 约 55% 单个散落目标、约 30% 2~3 件小组合、约 15% 明显资源点；
   * - T1 相邻 ≥2.5m，T2/T3 ≥4m，T4/T5 ≥8m；
   * - 每个 cell 额外放置 0~2 个超出当前区域 Tier 的远景大目标，
   *   低等级玩家能同时看到"现在能吃"与"将来能吃"（锁定反馈已存在）。
   */
  public static generateCellItems(
    theme: IRegionThemeConfig,
    cellX: number,
    cellZ: number,
    seed: number,
    cellSize: number,
    suppliedDistrict?: DistrictTemplate,
  ): IChunkSpawnItem[] {
    const available = OBJECT_TEMPLATES.filter((template) => theme.availableTiers.includes(template.tier));
    const district = suppliedDistrict || getDistrictTemplateForRegion(theme.id, cellX, cellZ);
    let state = (seed >>> 0) || 1;
    const random = (): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };

    const count = 20 + positive(seed, 5);
    const half = cellSize * 0.5 - 5;
    const minSpacingFor = (tier: ObjectTier): number =>
      tier <= ObjectTier.T1 ? 2.5 : tier <= ObjectTier.T3 ? 4.0 : 8.0;

    interface PlacedPoint { readonly x: number; readonly z: number; readonly tier: ObjectTier; }
    const placed: PlacedPoint[] = [];
    const fitsSpacing = (x: number, z: number, tier: ObjectTier): boolean => placed.every((point) => {
      const needed = Math.max(minSpacingFor(tier), minSpacingFor(point.tier));
      const dx = point.x - x;
      const dz = point.z - z;
      return dx * dx + dz * dz >= needed * needed;
    });
    const claim = (x: number, z: number, tier: ObjectTier): PlacedPoint | null => {
      const clampedX = Math.max(-half, Math.min(half, x));
      const clampedZ = Math.max(-half, Math.min(half, z));
      for (let attempt = 0; attempt < 12; attempt++) {
        const candidateX = attempt === 0 ? clampedX : Math.max(-half, Math.min(half, clampedX + (random() - 0.5) * 6 * attempt));
        const candidateZ = attempt === 0 ? clampedZ : Math.max(-half, Math.min(half, clampedZ + (random() - 0.5) * 6 * attempt));
        if (fitsSpacing(candidateX, candidateZ, tier)) {
          const point = { x: candidateX, z: candidateZ, tier };
          placed.push(point);
          return point;
        }
      }
      return null;
    };

    // Tier 权重：T1 多、T2 较少、T3 更少、T4/T5 零星（过滤到区域允许范围）。
    const tierWeights: ReadonlyArray<readonly [ObjectTier, number]> = [
      [ObjectTier.T1, 50],
      [ObjectTier.T2, 25],
      [ObjectTier.T3, 15],
      [ObjectTier.T4, 8],
      [ObjectTier.T5, 2],
    ];
    const pickTemplate = (pool: readonly IObjectTemplate[]): IObjectTemplate | null => {
      if (pool.length === 0) return null;
      const weighted = tierWeights
        .map(([tier, weight]) => ({ tier, weight, candidates: pool.filter((template) => template.tier === tier) }))
        .filter((entry) => entry.candidates.length > 0);
      if (weighted.length === 0) return pool[Math.floor(random() * pool.length)];
      const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
      let roll = random() * total;
      for (const entry of weighted) {
        roll -= entry.weight;
        if (roll <= 0) return entry.candidates[Math.floor(random() * entry.candidates.length)];
      }
      const last = weighted[weighted.length - 1];
      return last.candidates[Math.floor(random() * last.candidates.length)];
    };

    const items: IChunkSpawnItem[] = [];
    const addItem = (template: IObjectTemplate, anchorX: number, anchorZ: number, tag: string): boolean => {
      const point = claim(anchorX, anchorZ, template.tier);
      if (!point) return false;
      items.push({
        template,
        localX: point.x,
        localZ: point.z,
        customId: `${tag}_${district.kind}_${cellX}_${cellZ}_${items.length}`,
      });
      return true;
    };

    // 1. 明显资源点（约 15%）：沿用区域语义簇中心，但每点仅 2~3 件。
    const clusterBudget = Math.max(2, Math.round(count * 0.15));
    const clusterCount = district.resourceClusters.length;
    let clusterPlaced = 0;
    for (let i = 0; i < clusterBudget * 2 && clusterPlaced < clusterBudget && clusterCount > 0; i++) {
      const cluster = district.resourceClusters[(i + positive(seed, clusterCount)) % clusterCount];
      const semantic = cluster.preferredTypes
        .map((type) => available.find((template) => template.type === type))
        .filter((template): template is IObjectTemplate => Boolean(template));
      const template = (semantic.length > 0 && random() < 0.7)
        ? semantic[Math.floor(random() * semantic.length)]
        : pickTemplate(available);
      if (!template) break;
      if (addItem(template, cluster.center[0] + (random() - 0.5) * 5.6, cluster.center[1] + (random() - 0.5) * 5.6, `cluster_${cluster.id}`)) {
        clusterPlaced += 1;
      }
    }

    // 2. 小组合（约 30%）：随机锚点周围 2~3 件，组内保持 2.5~5m 呼吸感。
    const groupBudget = Math.round(count * 0.30);
    let groupPlaced = 0;
    for (let g = 0; g < 8 && groupPlaced < groupBudget; g++) {
      const anchorX = (random() * 2 - 1) * half;
      const anchorZ = (random() * 2 - 1) * half;
      const groupSize = 2 + Math.floor(random() * 2);
      for (let member = 0; member < groupSize && groupPlaced < groupBudget; member++) {
        const template = pickTemplate(available);
        if (!template) break;
        const angle = random() * Math.PI * 2;
        const distance = 2.5 + random() * 2.5;
        if (addItem(template, anchorX + Math.cos(angle) * distance, anchorZ + Math.sin(angle) * distance, `group_${g}`)) {
          groupPlaced += 1;
        }
      }
    }

    // 3. 单个散落目标（其余全部）：整 cell 均匀散布，形成探索路线。
    let guard = 0;
    while (items.length < count && guard < count * 14) {
      guard += 1;
      const template = pickTemplate(available);
      if (!template) break;
      addItem(template, (random() * 2 - 1) * half, (random() * 2 - 1) * half, 'scatter');
    }

    // 4. 远景大目标：让低等级视野里始终存在"将来能吃"的 T4/T5。
    const maxRegionTier = theme.availableTiers.reduce((max, tier) => Math.max(max, tier), ObjectTier.T1);
    const aspirational = OBJECT_TEMPLATES.filter((template) => template.tier > maxRegionTier);
    const aspirationalCount = Math.min(aspirational.length > 0 ? 1 + positive(seed >>> 3, 2) : 0, 2);
    for (let i = 0; i < aspirationalCount; i++) {
      const template = aspirational[Math.floor(random() * aspirational.length)];
      // 放在离 cell 中心较远的边缘带，避免堵住出生点主路。
      const angle = random() * Math.PI * 2;
      const distance = half * (0.55 + random() * 0.4);
      addItem(template, Math.cos(angle) * distance, Math.sin(angle) * distance, 'aspirational');
    }

    return items;
  }
}

function positive(value: number, divisor: number): number {
  const result = value % divisor;
  return result < 0 ? result + divisor : result;
}
