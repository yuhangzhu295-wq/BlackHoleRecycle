# 《黑洞回收站》 (BlackHoleRecycle) — 3D 跨平台小游戏

> **宣传语**：吸走一切，压个痛快！
> **支持平台**：微信小游戏、抖音小游戏、现代 Web 浏览器

---

## 🎮 游戏核心玩法与特性
- **3D 无尽吸附体验**：通过单指滑动 / 虚拟摇杆控制黑洞吸尘机，利用高效引力贝塞尔螺旋算法自动吸附吞噬场景杂物。
- **5 级真实 3D 外观与性能进化**：
  - **LV1 回收小车 (Small Core)**：轻型工业底盘，吞噬易拉罐、矿泉水瓶、碎纸等 T1 杂物。
  - **LV2 吸附卡车 (Magnetic Turbine)**：加装双旋转引力涡轮，吸附中型书本、餐具、塑料盒。
  - **LV3 回收压路车 (Compression Engine)**：加装后置重型液压冲压机，吞噬大型纸箱、转椅、微波炉。
  - **LV4 巨型回收机 (Gravity Harvester)**：展开双悬浮稳定翼，吞噬沙发、双门冰箱、水泥管。
  - **LV5 歼星奇点车 (Singularity Core)**：悬浮白色奇点天体光环，吞噬报废汽车、叉车与整个集装箱！
- **无尽地图分块流式加载 (Chunk Streaming)**：涵盖卧室、仓库、超市、停车场、工地、城市 6 大主题分块，高效复用对象池，低端机保持 60FPS。
- **动态连击与磁暴技能**：阶梯式连击积分倍率（x5~x40），释放磁暴模式激发全屏引力冲击波。
- **压缩装车与经济闭环**：吸附垃圾积累质量，进入液压压缩机装车运往仓库，变现金币奖励。
- **15 页全套 UI 系统**：启动页、首页、模式选择、新手引导、操作 HUD、升级三选一、压缩回收、技能释放、区域解锁、车库进化、皮肤装扮、任务系统、结算页、商店与设置。
- **商业化与数据分析**：真实接入微信/抖音激励视频与插屏广告接口、防刷幂等账本 `RewardLedger`、24 项全生命周期埋点。

---

## 🛠️ 快速上手与构建

### 1. 安装依赖
```bash
npm install
```

### 2. 本地开发预览
```bash
npm run dev
```

### 3. 一键跨平台打包
```bash
# 一键生成全部平台产物 (微信 dist/wx + 抖音 dist/tt + Web dist/web)
npm run build:all
```

### 4. 自动化端到端测试
```bash
node scripts/test_game.js
```

---

## 📁 核心工程架构
```
ji/
├── docs/                     # 完整工程与游戏设计规范文档
│   ├── reuse-audit.md        # 开源复用审计报告
│   ├── game-design.md        # 玩法与核心系统设计
│   ├── endless-world.md      # 无尽 Chunk 流式加载说明
│   ├── machine-evolution.md  # 机器 5 级进化规范
│   ├── monetization.md       # 商业化与广告策略
│   ├── ad-placements.md      # 广告位矩阵表
│   ├── analytics.md          # 24 项数据埋点规范
│   ├── performance.md        # 性能与画质分级说明
│   ├── physics-benchmark.md  # 物理与引力基准测试
│   ├── platform-wechat.md    # 微信小游戏平台适配说明
│   ├── platform-douyin.md    # 抖音小游戏平台适配说明
│   ├── build.md              # 多端构建与打包指南
│   ├── testing.md            # 测试与质量验收体系
│   └── known-issues.md       # 已知环境与待配置项
├── platform/                 # 平台原生配置文件模板
│   ├── wx/                   # 微信小游戏配置 (game.json, project.config.json)
│   └── tt/                   # 抖音小游戏配置 (game.json, microapp.json, project.config.json)
├── src/                      # 游戏核心源代码
│   ├── 3d/                   # 3D 渲染与物理系统 (Three.js WebGL)
│   │   ├── BlackHoleGame3D.js # 3D 游戏主控制器
│   │   ├── machine/          # 黑洞机器与进化
│   │   ├── chunks/           # 地图分块流式管理器
│   │   ├── objects/          # 场景可吸附物体实体
│   │   └── vfx/              # 粒子特效与引力光环
│   ├── adapter/              # 跨平台适配层 (微信 / 抖音 / Web)
│   ├── analytics/            # 数据埋点服务
│   ├── core/                 # EventBus, FSM, ObjectPool
│   ├── data/                 # GameConfig, SaveManager
│   ├── engine/               # 程序化音频合成器 (WebAudio)
│   ├── monetization/         # 广告服务与幂等账本
│   ├── ui/                   # 15 页全套 UI 视图管理器
│   └── main.js               # 统一跨平台游戏启动入口
├── scripts/
│   ├── build.js              # 跨端打包构建脚本
│   └── test_game.js          # Playwright 自动化测试脚本
├── THIRD_PARTY_NOTICES.md    # 第三方开源许可证声明
└── index.html                # Web H5 启动页
```
