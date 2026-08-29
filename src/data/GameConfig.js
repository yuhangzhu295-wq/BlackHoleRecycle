/**
 * 《黑洞回收站》核心数据配置表 (Game Config Tables)
 * 包含：5级机器进化配置、7大主题 Chunk 区域、物体 Tier 与质量价值、Roguelike 强化词条、皮肤与任务体系
 */

export const MACHINE_EVOLUTION_CONFIG = [
  {
    level: 1,
    name: 'Small Core (初级核心)',
    title: '回收小车',
    massThreshold: 0,
    suctionRadius: 2.4,
    maxTier: 1,
    moveSpeed: 7.5,
    compressionEfficiency: 1.0,
    baseColor: '#2b7fff',
    rimColor: '#00e5ff',
    scale: 1.0,
    description: '基础轻巧型吸附车，可吸附瓶子、易拉罐、小碎纸'
  },
  {
    level: 2,
    name: 'Magnetic Turbine (磁力涡轮)',
    title: '吸附卡车',
    massThreshold: 3500,
    suctionRadius: 3.4,
    maxTier: 2,
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
    title: '回收压路车',
    massThreshold: 15000,
    suctionRadius: 4.6,
    maxTier: 3,
    moveSpeed: 9.0,
    compressionEfficiency: 1.6,
    baseColor: '#ff9500',
    rimColor: '#ffd600',
    scale: 1.55,
    description: '重型回收底盘，可吸附大型纸箱、电风扇、小型桌椅'
  },
  {
    level: 4,
    name: 'Gravity Harvester (重力收割者)',
    title: '巨型回收机',
    massThreshold: 55000,
    suctionRadius: 6.0,
    maxTier: 4,
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
    title: '歼星奇点车',
    massThreshold: 180000,
    suctionRadius: 8.0,
    maxTier: 5,
    moveSpeed: 10.5,
    compressionEfficiency: 2.8,
    baseColor: '#ff2d55',
    rimColor: '#ffffff',
    scale: 2.3,
    description: '终极微型黑洞奇点发生器，吞噬汽车、集装箱与整个建筑！'
  }
];

export const REGION_THEMES = [
  {
    id: 'bedroom',
    name: '卧室杂物区',
    color: '#ffefe0',
    groundColor: '#7a5a40',
    ambientLight: '#fff5ea',
    unlockProgress: 0,
    targetMass: 12000,
    availableTiers: [1, 2],
    description: '凌乱的卧室房间，散落着易拉罐、玩具与快递盒。'
  },
  {
    id: 'warehouse',
    name: '仓库区',
    color: '#3a4a58',
    groundColor: '#42484d',
    ambientLight: '#d6e4f0',
    unlockProgress: 1,
    targetMass: 35000,
    availableTiers: [1, 2, 3],
    description: '高耸的货物货架，堆满大型重型纸箱与叉车零件。'
  },
  {
    id: 'supermarket',
    name: '超市区',
    color: '#e8f5e9',
    groundColor: '#4f5d52',
    ambientLight: '#ffffff',
    unlockProgress: 2,
    targetMass: 80000,
    availableTiers: [1, 2, 3, 4],
    description: '大型商超货架，饮料塔与成排推车等待清空！'
  },
  {
    id: 'parking',
    name: '停车场',
    color: '#424242',
    groundColor: '#2b2d30',
    ambientLight: '#cfd8dc',
    unlockProgress: 3,
    targetMass: 150000,
    availableTiers: [2, 3, 4, 5],
    description: '宽阔的露天停车场，废弃轮胎与报废汽车！'
  },
  {
    id: 'construction',
    name: '工地区',
    color: '#fff3e0',
    groundColor: '#594a38',
    ambientLight: '#ffe0b2',
    unlockProgress: 4,
    targetMass: 250000,
    availableTiers: [2, 3, 4, 5],
    description: '尘土飞扬的建筑工地，钢筋、水泥管与机械残骸。'
  },
  {
    id: 'city',
    name: '城市区',
    color: '#e0f7fa',
    groundColor: '#2d3748',
    ambientLight: '#e0f2fe',
    unlockProgress: 5,
    targetMass: 400000,
    availableTiers: [3, 4, 5],
    description: '繁华都市街道，路灯、公交站亭与大型集装箱！'
  }
];

export const OBJECT_TEMPLATES = [
  // T1: 小型物品 (Lv1 可吸)
  { type: 'soda_can', name: '易拉罐', tier: 1, mass: 50, value: 5, radius: 0.25, color: '#e53935', shape: 'cylinder', height: 0.5 },
  { type: 'water_bottle', name: '矿泉水瓶', tier: 1, mass: 65, value: 6, radius: 0.22, color: '#29b6f6', shape: 'cylinder', height: 0.6 },
  { type: 'paper_ball', name: '纸团/杂物', tier: 1, mass: 30, value: 3, radius: 0.2, color: '#eceff1', shape: 'sphere' },
  { type: 'sock', name: '旧袜子', tier: 1, mass: 40, value: 4, radius: 0.25, color: '#b0bec5', shape: 'box', size: [0.3, 0.1, 0.4] },
  { type: 'battery', name: '干电池', tier: 1, mass: 80, value: 10, radius: 0.18, color: '#fbc02d', shape: 'cylinder', height: 0.35 },

  // T2: 中小型物品 (Lv2 可吸)
  { type: 'book_stack', name: '一叠书本', tier: 2, mass: 220, value: 25, radius: 0.45, color: '#1e88e5', shape: 'box', size: [0.5, 0.3, 0.5] },
  { type: 'small_box', name: '小快递盒', tier: 2, mass: 320, value: 35, radius: 0.5, color: '#d7ccc8', shape: 'box', size: [0.6, 0.5, 0.6] },
  { type: 'football', name: '足球', tier: 2, mass: 180, value: 20, radius: 0.38, color: '#ffffff', shape: 'sphere' },
  { type: 'traffic_cone', name: '路锥', tier: 2, mass: 280, value: 30, radius: 0.4, color: '#ff6f00', shape: 'cone', height: 0.7 },
  { type: 'kettle', name: '电水壶', tier: 2, mass: 350, value: 40, radius: 0.42, color: '#78909c', shape: 'cylinder', height: 0.6 },

  // T3: 中大型物品 (Lv3 可吸)
  { type: 'large_box', name: '重型瓦楞纸箱', tier: 3, mass: 950, value: 110, radius: 0.85, color: '#8d6e63', shape: 'box', size: [1.1, 0.9, 1.1] },
  { type: 'wooden_crate', name: '木质货箱', tier: 3, mass: 1400, value: 160, radius: 1.0, color: '#a1887f', shape: 'box', size: [1.2, 1.0, 1.2] },
  { type: 'office_chair', name: '电脑转椅', tier: 3, mass: 1100, value: 130, radius: 0.9, color: '#37474f', shape: 'cylinder', height: 1.1 },
  { type: 'tire', name: '汽车轮胎', tier: 3, mass: 850, value: 100, radius: 0.75, color: '#212121', shape: 'torus', height: 0.4 },
  { type: 'microwave', name: '微波炉', tier: 3, mass: 1200, value: 140, radius: 0.8, color: '#cfd8dc', shape: 'box', size: [0.9, 0.6, 0.7] },

  // T4: 大型物品 (Lv4 可吸)
  { type: 'sofa', name: '双人沙发', tier: 4, mass: 3600, value: 420, radius: 1.6, color: '#455a64', shape: 'box', size: [2.0, 1.1, 1.2] },
  { type: 'fridge', name: '双门冰箱', tier: 4, mass: 4500, value: 550, radius: 1.5, color: '#b0bec5', shape: 'box', size: [1.2, 2.2, 1.2] },
  { type: 'pallet_cargo', name: '托盘整堆货物', tier: 4, mass: 5200, value: 650, radius: 1.8, color: '#6d4c41', shape: 'box', size: [1.8, 1.6, 1.8] },
  { type: 'concrete_pipe', name: '水泥排水管', tier: 4, mass: 6000, value: 750, radius: 1.7, color: '#757575', shape: 'cylinder', height: 2.2 },

  // T5: 巨型/终极物品 (Lv5 可吸)
  { type: 'sedan_car', name: '废弃家用轿车', tier: 5, mass: 16000, value: 2000, radius: 2.6, color: '#1565c0', shape: 'box', size: [3.6, 1.4, 2.0] },
  { type: 'forklift', name: '仓储叉车', tier: 5, mass: 22000, value: 2800, radius: 2.8, color: '#f57f17', shape: 'box', size: [3.2, 2.2, 2.0] },
  { type: 'shipping_container', name: '巨型集装箱', tier: 5, mass: 45000, value: 6000, radius: 4.0, color: '#c62828', shape: 'box', size: [5.5, 2.5, 2.4] }
];

export const ROGUELIKE_PERKS = [
  {
    id: 'perk_suction_range',
    name: '吸力提升',
    icon: '🧲',
    desc: '吸附范围 +20%',
    stars: 3,
    apply: (machine) => { machine.perks.suctionMultiplier = (machine.perks.suctionMultiplier || 1.0) * 1.2; }
  },
  {
    id: 'perk_move_speed',
    name: '移动速度',
    icon: '⚡',
    desc: '移动速度 +15%',
    stars: 2,
    apply: (machine) => { machine.perks.speedMultiplier = (machine.perks.speedMultiplier || 1.0) * 1.15; }
  },
  {
    id: 'perk_compress_rate',
    name: '压缩效率',
    icon: '📦',
    desc: '压缩获得金币 +25%',
    stars: 2,
    apply: (machine) => { machine.perks.compressMultiplier = (machine.perks.compressMultiplier || 1.0) * 1.25; }
  },
  {
    id: 'perk_magnet_duration',
    name: '磁暴延长',
    icon: '🌀',
    desc: '磁暴技能持续时间 +3秒',
    stars: 3,
    apply: (machine) => { machine.perks.magnetExtraDuration = (machine.perks.magnetExtraDuration || 0) + 3; }
  },
  {
    id: 'perk_combo_sustain',
    name: '连击维持',
    icon: '🔥',
    desc: '连击倒计时延长 +1.5秒',
    stars: 1,
    apply: (machine) => { machine.perks.comboExtraTime = (machine.perks.comboExtraTime || 0) + 1.5; }
  },
  {
    id: 'perk_gravity_surge',
    name: '引力激增',
    icon: '🌌',
    desc: '靠近黑洞时物体吸引加速度 +30%',
    stars: 3,
    apply: (machine) => { machine.perks.forceMultiplier = (machine.perks.forceMultiplier || 1.0) * 1.3; }
  }
];

export const DAILY_TASKS_CONFIG = [
  {
    id: 'task_absorb_count',
    title: '吸附 200 个物品',
    target: 200,
    metric: 'absorbedCount',
    rewardCoins: 300
  },
  {
    id: 'task_compress_times',
    title: '完成 5 次压缩装车',
    target: 5,
    metric: 'compressTimes',
    rewardCoins: 500
  },
  {
    id: 'task_mass_reach',
    title: '在单局获得 5000 质量',
    target: 5000,
    metric: 'maxSingleMass',
    rewardCoins: 400
  },
  {
    id: 'task_magnet_use',
    title: '使用磁暴模式 3 次',
    target: 3,
    metric: 'magnetUses',
    rewardCoins: 450
  },
  {
    id: 'task_reach_region_2',
    title: '成功解锁并进入仓库区',
    target: 1,
    metric: 'reachedRegionWarehouse',
    rewardCoins: 600
  }
];

export const SKINS_CONFIG = [
  {
    id: 'skin_classic',
    name: '蔚蓝风暴 (默认)',
    color: '#2b7fff',
    rimColor: '#00e5ff',
    price: 0,
    unlocked: true,
    description: '经典的清洁工业涂装'
  },
  {
    id: 'skin_orange_force',
    name: '橙色重力',
    color: '#ff9500',
    rimColor: '#ffd600',
    price: 1500,
    unlocked: false,
    description: '活力四射的高能回收涂装'
  },
  {
    id: 'skin_toxic_green',
    name: '极客卫士',
    color: '#34c759',
    rimColor: '#70ff00',
    price: 3000,
    unlocked: false,
    description: '环保先锋荧光高亮配色'
  },
  {
    id: 'skin_cyber_purple',
    name: '闪电灾变',
    color: '#af52de',
    rimColor: '#ff2d55',
    price: 6000,
    unlocked: false,
    description: '赛博朋克深紫能量核心'
  },
  {
    id: 'skin_gold_singularity',
    name: '暗黑装甲',
    color: '#1c1c1e',
    rimColor: '#ffd700',
    price: 12000,
    unlocked: false,
    description: '尊贵黑金复合装甲外壳'
  }
];

export const SHOP_ITEMS_CONFIG = [
  { id: 'coin_small', name: '一小堆金币', amount: 500, priceCny: 6, tag: '热销' },
  { id: 'coin_medium', name: '一大箱金币', amount: 2500, priceCny: 25, tag: '+20%加量' },
  { id: 'coin_large', name: '一车金币', amount: 8000, priceCny: 68, tag: '超值' },
  { id: 'coin_huge', name: '一库金币', amount: 20000, priceCny: 128, tag: '首充双倍' }
];
