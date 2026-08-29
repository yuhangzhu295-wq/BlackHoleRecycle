# 《黑洞回收站》 Cocos Creator 场景与组件绑定关系审计表 (Component Binding)

| 场景/预制体 (Scene / Prefab) | 挂载节点 (Node Name) | 绑定组件 (Component Class) | 脚本路径 (Script Path) | 核心职责 (Responsibilities) |
| :--- | :--- | :--- | :--- | :--- |
| **`assets/scenes/Game.scene`** | `GameManager` | `GameManager` | `assets/scripts/gameplay/GameManager.ts` | 核心主循环驱动、摄像机等轴平滑跟随、吸附与得分/质量结算 |
| **`assets/scenes/Game.scene`** | `GameManager` | `WorldChunkManager` | `assets/scripts/world/WorldChunkManager.ts` | 6大主题分块流式加载、前向生成与后方视距外对象池100%回收 |
| **`assets/scenes/Game.scene`** | `BlackHoleMachine` | `BlackHoleMachine` | `assets/scripts/machine/BlackHoleMachine.ts` | 5阶段结构进化节点控制 (Turbine/Crusher/Wings/Halo)、吸附半径、Tier限制 |
| **`assets/scenes/Game.scene`** | `BlackHoleMachine` | `PlayerController` | `assets/scripts/gameplay/PlayerController.ts` | 触控/鼠标射线投射拾取、黑洞移动目标点解算 |
| **`assets/scenes/Game.scene`** | `Main Camera` | `Camera` | 内置引擎组件 | 45°等轴俯视、射线发射转换 |
| **`assets/prefabs/machine/BlackHoleMachine.prefab`** | `BlackHoleMachine` | `BlackHoleMachine` | `assets/scripts/machine/BlackHoleMachine.ts` | 机器预制体，包含 5 级模块子节点 (Core, Turbine, Crusher, Wings, Halo) |
| **`assets/prefabs/objects/TrashObject.prefab`** | `TrashObject` | `CompressibleObject` | `assets/scripts/gameplay/CompressibleObject.ts` | 可吸附物体状态机 (IDLE ➔ ATTRACTED ➔ SUCKING ➔ ABSORBED ➔ RECYCLED) |
| **`assets/prefabs/chunks/BedroomChunk.prefab`** | `BedroomChunk` | 动态对象容器节点 | `assets/scripts/world/WorldChunk.ts` | 卧室分块容器节点 |
| **`assets/prefabs/ui/HUD.prefab`** | `HUD` | `HUDView` | `assets/scripts/ui/HUDView.ts` | 极简核心 HUD 控制 (Mass, Level, Coins, Pause, MagnetStorm) |
| **`assets/prefabs/ui/HUD.prefab`** | `MassLabel` | `Label` | 内置引擎组件 | 实时质量显示 |
| **`assets/prefabs/ui/HUD.prefab`** | `LevelLabel` | `Label` | 内置引擎组件 | 机器当前等级与称号显示 |
| **`assets/prefabs/ui/HUD.prefab`** | `CoinsLabel` | `Label` | 内置引擎组件 | 金币数量显示 |
| **`assets/prefabs/ui/HUD.prefab`** | `PauseButton` | `Button` | 内置引擎组件 | 暂停触发按键 |
| **`assets/prefabs/ui/HUD.prefab`** | `MagnetStormButton` | `Button` | 内置引擎组件 | 磁暴技能释放按键 |
