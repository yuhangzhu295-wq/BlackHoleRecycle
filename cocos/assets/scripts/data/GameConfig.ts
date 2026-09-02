/**
 * 《黑洞回收站》强类型游戏核心配置表 (GameConfig.ts)
 * 包含：5 级机器进化、6 大主题分块、物体 Tier 与质量价值、Roguelike 强化词条、任务与皮肤定义
 */

export enum ObjectTier {
  T1 = 1,
  T2 = 2,
  T3 = 3,
  T4 = 4,
  T5 = 5
}

export enum ObjectShape {
  BOX = 'box',
  CYLINDER = 'cylinder',
  SPHERE = 'sphere',
  CONE = 'cone',
  TORUS = 'torus'
}

export interface IMachineEvolutionConfig {
  readonly level: number;
  readonly name: string;
  readonly title: string;
  readonly massThreshold: number;
  readonly suctionRadius: number;
  readonly maxTier: ObjectTier;
  readonly moveSpeed: number;
  readonly compressionEfficiency: number;
  readonly baseColor: string;
  readonly rimColor: string;
  readonly scale: number;
  readonly description: string;
}

export interface IRegionThemeConfig {
  readonly id: string;
  readonly name: string;
  readonly groundColor: string;
  readonly ambientLight: string;
  readonly unlockProgress: number;
  readonly targetMass: number;
  readonly availableTiers: readonly ObjectTier[];
  readonly description: string;
}

export interface IObjectTemplate {
  readonly type: string;
  readonly name: string;
  readonly tier: ObjectTier;
  readonly mass: number;
  readonly value: number;
  readonly radius: number;
  readonly color: string;
  readonly shape: ObjectShape;
  readonly height?: number;
  readonly size?: readonly [number, number, number];
}

export interface IRoguelikePerk {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly desc: string;
  readonly stars: number;
  readonly effectType: 'suction' | 'speed' | 'compress' | 'magnet' | 'combo' | 'force';
  readonly value: number;
}

export interface IDailyTaskConfig {
  readonly id: string;
  readonly title: string;
  readonly target: number;
  readonly metric: 'absorbedCount' | 'compressTimes' | 'maxSingleMass' | 'magnetUses' | 'reachedRegionWarehouse';
  readonly rewardCoins: number;
}

export interface ISkinConfig {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly rimColor: string;
  readonly price: number;
  readonly unlocked: boolean;
  readonly description: string;
}

export const MACHINE_EVOLUTION_CONFIG: readonly IMachineEvolutionConfig[] = [
  {
    level: 1,
    name: 'Small Core (初级核心)',
    title: '初级黑洞',
    massThreshold: 0,
    suctionRadius: 2.4,
    maxTier: ObjectTier.T1,
    moveSpeed: 7.5,
    compressionEfficiency: 1.0,
    baseColor: '#2b7fff',
    rimColor: '#00e5ff',
    scale: 1.0,
    description: '基础黑洞核心，可吸附瓶子、易拉罐、小碎纸'
  },
  {
    level: 2,
    name: 'Magnetic Turbine (磁力涡轮)',
    title: '磁力黑洞',
    massThreshold: 900,
    suctionRadius: 3.4,
    maxTier: ObjectTier.T2,
    moveSpeed: 8.2,
    compressionEfficiency: 1.25,
    baseColor: '#34c759',
    rimColor: '#70ff00',
    scale: 1.25,
    description: '搭载小型磁力涡轮，可吸附中型书本、餐具、塑料盒'
  },
  {
    level: 3,
    name: 'Compression Engine (压缩引擎)',
    title: '压缩黑洞',
    massThreshold: 15000,
    suctionRadius: 4.6,
    maxTier: ObjectTier.T3,
    moveSpeed: 9.0,
    compressionEfficiency: 1.6,
    baseColor: '#ff9500',
    rimColor: '#ffd600',
    scale: 1.55,
    description: '搭载压缩模块的黑洞核心，可吸附大型纸箱、电风扇、小型桌椅'
  },
  {
    level: 4,
    name: 'Gravity Harvester (重力收割者)',
    title: '引力黑洞',
    massThreshold: 55000,
    suctionRadius: 6.0,
    maxTier: ObjectTier.T4,
    moveSpeed: 9.8,
    compressionEfficiency: 2.0,
    baseColor: '#af52de',
    rimColor: '#ff2d55',
    scale: 1.9,
    description: '双环引力收割核心，可吞噬沙发、大型家电、废弃机器'
  },
  {
    level: 5,
    name: 'Singularity Core (奇点终极核心)',
    title: '奇点黑洞',
    massThreshold: 180000,
    suctionRadius: 8.0,
    maxTier: ObjectTier.T5,
    moveSpeed: 10.5,
    compressionEfficiency: 2.8,
    baseColor: '#ff2d55',
    rimColor: '#ffffff',
    scale: 2.3,
    description: '终极微型黑洞奇点发生器，吞噬汽车、集装箱与整个建筑！'
  }
];

export const REGION_THEMES: readonly IRegionThemeConfig[] = [
  {
    id: 'bedroom',
    name: '卧室杂物区',
    groundColor: '#7a5a40',
    ambientLight: '#fff5ea',
    unlockProgress: 0,
    targetMass: 12000,
    availableTiers: [ObjectTier.T1, ObjectTier.T2],
    description: '凌乱的卧室房间，散落着易拉罐、玩具与快递盒。'
  },
  {
    id: 'warehouse',
    name: '废弃仓库区',
    groundColor: '#334155',
    ambientLight: '#d6e4f0',
    unlockProgress: 1,
    targetMass: 35000,
    availableTiers: [ObjectTier.T1, ObjectTier.T2, ObjectTier.T3],
    description: '高耸的工业货架，堆满大型重型纸箱与叉车零件。'
  },
  {
    id: 'supermarket',
    name: '生鲜超市区',
    groundColor: '#1e3a8a',
    ambientLight: '#ffffff',
    unlockProgress: 2,
    targetMass: 80000,
    availableTiers: [ObjectTier.T1, ObjectTier.T2, ObjectTier.T3, ObjectTier.T4],
    description: '大型商超货架，饮料塔与成排推车等待清空！'
  },
  {
    id: 'parking',
    name: '露天停车场',
    groundColor: '#1f2937',
    ambientLight: '#fde047',
    unlockProgress: 3,
    targetMass: 150000,
    availableTiers: [ObjectTier.T2, ObjectTier.T3, ObjectTier.T4, ObjectTier.T5],
    description: '宽阔的沥青地面，停放着成排废弃轿车与充电桩。'
  },
  {
    id: 'construction',
    name: '施工工地',
    groundColor: '#78350f',
    ambientLight: '#fbbf24',
    unlockProgress: 4,
    targetMass: 300000,
    availableTiers: [ObjectTier.T2, ObjectTier.T3, ObjectTier.T4, ObjectTier.T5],
    description: '重型工程管材、砖块堆与大型发电机林立的建筑工地。'
  },
  {
    id: 'city',
    name: '未来都市区',
    groundColor: '#0f172a',
    ambientLight: '#38bdf8',
    unlockProgress: 5,
    targetMass: 600000,
    availableTiers: [ObjectTier.T3, ObjectTier.T4, ObjectTier.T5],
    description: '霓虹闪烁的未来商业街，全息广告牌与豪华超跑等待吞噬！'
  }
];

export const OBJECT_TEMPLATES: readonly IObjectTemplate[] = [
  // T1 (基础轻量垃圾)
  { type: "soda_can", name: "Soda Can", tier: ObjectTier.T1, mass: 50, value: 5, radius: 0.25, color: "#e53935", shape: ObjectShape.CYLINDER, height: 0.5 },
  { type: "water_bottle", name: "Bottle", tier: ObjectTier.T1, mass: 65, value: 6, radius: 0.22, color: "#29b6f6", shape: ObjectShape.CYLINDER, height: 0.6 },
  { type: "battery", name: "Battery", tier: ObjectTier.T1, mass: 80, value: 10, radius: 0.18, color: "#fbc02d", shape: ObjectShape.CYLINDER, height: 0.35 },
  { type: "toy", name: "Toy", tier: ObjectTier.T1, mass: 100, value: 12, radius: 0.3, color: "#ff4081", shape: ObjectShape.BOX, size: [0.4, 0.4, 0.4] },
  { type: "apple", name: "Apple", tier: ObjectTier.T1, mass: 55, value: 5, radius: 0.2, color: "#4caf50", shape: ObjectShape.SPHERE },
  { type: "paper_ball", name: "Paper Ball", tier: ObjectTier.T1, mass: 40, value: 4, radius: 0.2, color: "#ffffff", shape: ObjectShape.SPHERE },

  // T2 (中型物件)
  { type: "book_stack", name: "Books", tier: ObjectTier.T2, mass: 220, value: 25, radius: 0.45, color: "#1e88e5", shape: ObjectShape.BOX, size: [0.5, 0.3, 0.5] },
  { type: "cardboard_box", name: "Cardboard Box", tier: ObjectTier.T2, mass: 320, value: 35, radius: 0.5, color: "#d7ccc8", shape: ObjectShape.BOX, size: [0.6, 0.5, 0.6] },
  { type: "cone", name: "Traffic Cone", tier: ObjectTier.T2, mass: 280, value: 30, radius: 0.4, color: "#ff6f00", shape: ObjectShape.CONE, height: 0.7 },
  { type: "trash_bag", name: "Trash Bag", tier: ObjectTier.T2, mass: 350, value: 40, radius: 0.55, color: "#212121", shape: ObjectShape.SPHERE },
  { type: "paint_bucket", name: "Paint Bucket", tier: ObjectTier.T2, mass: 300, value: 32, radius: 0.35, color: "#00acc1", shape: ObjectShape.CYLINDER, height: 0.55 },

  // T3 (大型家具与家电)
  { type: "chair", name: "Chair", tier: ObjectTier.T3, mass: 950, value: 110, radius: 0.85, color: "#455a64", shape: ObjectShape.BOX, size: [0.8, 1.2, 0.8] },
  { type: "small_table", name: "Table", tier: ObjectTier.T3, mass: 1400, value: 160, radius: 1.0, color: "#795548", shape: ObjectShape.BOX, size: [1.5, 0.6, 1.0] },
  { type: "monitor", name: "Monitor", tier: ObjectTier.T3, mass: 1100, value: 130, radius: 0.8, color: "#111111", shape: ObjectShape.BOX, size: [1.2, 0.8, 0.3] },
  { type: "tire", name: "Tire", tier: ObjectTier.T3, mass: 1200, value: 140, radius: 0.75, color: "#263238", shape: ObjectShape.CYLINDER, height: 0.4 },
  
  // T4 (重型工业与货架)
  { type: "shelf", name: "Shelf", tier: ObjectTier.T4, mass: 5500, value: 500, radius: 2.0, color: "#90a4ae", shape: ObjectShape.BOX, size: [2.5, 3.5, 1.0] },
  { type: "crate", name: "Crate", tier: ObjectTier.T4, mass: 8000, value: 800, radius: 2.5, color: "#388e3c", shape: ObjectShape.BOX, size: [3.0, 3.0, 3.0] },
  { type: "sofa", name: "Sofa", tier: ObjectTier.T4, mass: 6500, value: 650, radius: 2.2, color: "#8d6e63", shape: ObjectShape.BOX, size: [2.8, 1.2, 1.4] },

  // T5 (终极载具与集装箱)
  { type: "car", name: "Car", tier: ObjectTier.T5, mass: 25000, value: 3000, radius: 3.5, color: "#d32f2f", shape: ObjectShape.BOX, size: [2.5, 1.5, 4.5] },
  { type: "container", name: "Container", tier: ObjectTier.T5, mass: 45000, value: 5500, radius: 4.5, color: "#0288d1", shape: ObjectShape.BOX, size: [3.2, 3.2, 7.0] }
];

export const ROGUELIKE_PERKS: readonly IRoguelikePerk[] = [
  { id: 'perk_suction_range', name: '引力扩张', icon: '🧲', desc: '吸附范围 +20%', stars: 3, effectType: 'suction', value: 1.2 },
  { id: 'perk_move_speed', name: '喷射加速', icon: '⚡', desc: '移动速度 +15%', stars: 2, effectType: 'speed', value: 1.15 },
  { id: 'perk_compress_rate', name: '高效压缩', icon: '📦', desc: '压缩金币收益 +25%', stars: 2, effectType: 'compress', value: 1.25 }
];

export const DAILY_TASKS_CONFIG: readonly IDailyTaskConfig[] = [
  { id: 'task_absorb_count', title: '吸附 150 个物品', target: 150, metric: 'absorbedCount', rewardCoins: 200 },
  { id: 'task_mass_reach', title: '单局获得 3000 质量', target: 3000, metric: 'maxSingleMass', rewardCoins: 300 },
  { id: 'task_compress_times', title: '完成 3 次物理压缩', target: 3, metric: 'compressTimes', rewardCoins: 250 },
  { id: 'task_reach_warehouse', title: '探索到达【废弃仓库】', target: 1, metric: 'reachedRegionWarehouse', rewardCoins: 400 }
];

export const SKINS_CONFIG: readonly ISkinConfig[] = [
  { id: 'skin_classic', name: '蔚蓝风暴 (默认)', color: '#2b7fff', rimColor: '#00e5ff', price: 0, unlocked: true, description: '经典的清洁工业涂装' },
  { id: 'skin_orange_force', name: '橙色重力', color: '#ff9500', rimColor: '#ffd600', price: 1500, unlocked: false, description: '活力四射的高能回收涂装' },
  { id: 'skin_emerald_vortex', name: '翡翠漩涡', color: '#10b981', rimColor: '#34d399', price: 3000, unlocked: false, description: '生态环保的超能引力涂装' },
  { id: 'skin_crimson_singularity', name: '猩红奇点', color: '#ef4444', rimColor: '#f43f5e', price: 6000, unlocked: false, description: '撕裂空间的终极奇点涂装' }
];
