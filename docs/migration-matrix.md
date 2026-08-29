# 《黑洞回收站》资产与代码模块迁移矩阵 (Migration Matrix)

| 原 Three.js 原型文件 | 目标 Cocos Creator 3.8.x 文件 | 迁移分类 (Classification) | 迁移策略与改动说明 |
| :--- | :--- | :--- | :--- |
| `src/data/GameConfig.js` | `cocos/assets/scripts/data/GameConfig.ts` | **A. DIRECT_LOGIC_PORT** | 重写为严格 TypeScript `interface`, `enum` 与 `readonly config`，禁止 `any` |
| `src/data/SaveManager.js` | `cocos/assets/scripts/data/SaveService.ts` | **A. DIRECT_LOGIC_PORT** | 移植为 `SaveService`，统一持久化 Schema 与版本迁移 |
| `src/analytics/AnalyticsService.js` | `cocos/assets/scripts/analytics/AnalyticsService.ts` | **A. DIRECT_LOGIC_PORT** | 24 项全生命周期埋点事件完整强类型化 |
| `src/monetization/AdService.js` | `cocos/assets/scripts/monetization/AdService.ts` | **A. DIRECT_LOGIC_PORT** | 移植广告频控 `AdFrequencyController` 与防刷账本 `RewardLedger` |
| `src/core/EventBus.js` | `cocos/assets/scripts/core/EventBus.ts` | **A. DIRECT_LOGIC_PORT** | 重写为泛型类型安全事件总线 |
| `src/core/FSM.js` | `cocos/assets/scripts/core/FSM.ts` | **A. DIRECT_LOGIC_PORT** | 重写为支持生命周期钩子的 TypeScript 状态机 |
| `src/3d/objects/TrashObject.js` | `cocos/assets/scripts/gameplay/CompressibleObject.ts` | **B. REWRITE_FOR_COCOS** | 废弃 Three.Mesh，改用 Cocos `Node` + `MeshRenderer` + `SuctionMotion.ts` 切向螺旋下潜算法 |
| `src/3d/machine/BlackHoleMachine.js` | `cocos/assets/scripts/machine/BlackHoleMachine.ts` | **B. REWRITE_FOR_COCOS** | 废弃 Three.Group，改为 `MachineRoot` + 子 Node 模块（Core, Turbine, Crusher, Wings, Halo）显隐与材质控制 |
| `src/3d/chunks/WorldChunkManager.js` | `cocos/assets/scripts/world/WorldChunkManager.ts` | **B. REWRITE_FOR_COCOS** | 移植固定活跃 Chunk 上限与旧 Chunk 回池调度，管理 Cocos `Prefab` |
| `src/3d/BlackHoleGame3D.js` | `cocos/assets/scripts/gameplay/GameManager.ts` | **B. REWRITE_FOR_COCOS** | 转换为 Cocos `Component`，驱动 Touch/Mouse 射线投射与场景生命周期 |
| `src/ui/UIManager.js` | `cocos/assets/scripts/ui/HUDView.ts` | **B. REWRITE_FOR_COCOS** | 阶段一仅实现 Minimal HUD（Mass, Level, Coins, Pause, MagnetStorm）与 Bootstrap/Home 界面 |
| `src/3d/vfx/VFXManager.js` | `cocos/assets/scripts/vfx/VFXController.ts` | **B. REWRITE_FOR_COCOS** | 对接 Cocos 粒子系统 / 动态动效 |
| `index.html` / `vite.config.js` | N/A (保留在根目录与 `legacy-threejs/`) | **C. REFERENCE_ONLY** | 作为玩法基准与回归对照保留，不删除 |
