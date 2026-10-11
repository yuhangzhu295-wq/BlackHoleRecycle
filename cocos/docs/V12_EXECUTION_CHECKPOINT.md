# V12 执行断点 (EXECUTION CHECKPOINT)

- CURRENT_HEAD：见本文件提交后的 `git log -1`
- CURRENT_PHASE：**PHASE A 收尾 → 即将进入 PHASE B**
- LAST_UPDATED：2026-10-12

## PHASE A 逐项状态（全部有运行时证据）

| # | 项 | 状态 | 实测证据 |
| --- | --- | --- | --- |
| 1 | 尺寸与质量关联 | **PASS** | 7 个对手：2 个跨过等级阈值并放大到 `1.25`（620→1985、565→1455），其余 5 个只涨质量未升级、正确地不放大；无任何一具"涨质量却缩小" |
| 2 | 玩家与 Bot 吸附表现一致 | **部分 / 已定性** | 物体层反馈（ATTRACTED→SUCKING→ABSORBED 的位移、缩小、消失）**双方共用**（bot 走同一 capture 路径）。**差异只在那一下闪光**：`AbsorbFeedbackPool.emit` 只由 `GameManager` 为玩家调用。见下方"未改原因" |
| 3 | 独立材质颜色 | **PASS** | 7/7 颜色互异，从**活材质**读出：`#4e9af1 #54c985 #e7a545 #b26ae8 #4bbfd2 #f07171 #d7bd53`，与配置的 `BOT_TINTS` 完全一致 |
| 4 | 名牌与模型坐标一致 | **PASS** | 8/8 行一致。名牌位置源自 `getLeaderboard()` 的 `competitor.node.position`——**就是模型自己那个节点**，结构上无法错位 |
| 5 | 遮挡 / 离屏 / 孤立名字 | **PASS** | 8/8 一致：在屏的有名牌，离屏的（bot-1 nx=1.069、bot-2、bot-7）**没有**名牌，无孤立名字 |
| 6 | 各等级装配稳定 | **部分** | 实测到 LV1 与 LV2（scale 1 与 1.25）装配正常。**LV3/LV5 未实测**——需要一局足够长的对局 |
| 7 | 多次启动稳定性 | **PASS** | 连续 3 次独立运行，结果完全一致（每次都是 7/7 颜色互异、全部 PASS） |

## 本轮修掉的（都有前后对比）

**对手不再叠成一个**（DETECT→ROOT CAUSE→FIX→REGRESSION 全做完）
- 根因：`COLLECT` 选"最近的 IDLE 拾取物"且**无独占、无避让**，两个 bot 选同一个；
  `ROAM` 与出生点圆环都已排除（前者按 slot 偏移相位，后者是正确的 7 等分环）
- 修法：3.2 单位内的朝向混合避让，**只用于非战斗状态**（COLLECT/ROAM）；
  CHASE/FLEE 保持原朝向，不让低质量 bot 白拿距离
- 实测：Bot_5|6 从 33/40 采样贴近 → **1/40**；Bot_4|6、Bot_4|5 从 26/40 → **0/40**
- 回归：`test_arena_ai_contract` PASS（5 种状态齐全、仍会成长/拾取/淘汰）、`acceptance:v2 --scope=arena-ai` PASS

## 记录但**故意未改**的一项（附理由，非"留给下一轮"）

**Bot 没有玩家那一下吸收闪光。** `ArenaMatchManager.consumeObject()` 里，
玩家走 `callbacks.onLocalObjectAbsorbed` → 闪光池；bot 只 `addMass`。

**量完之后决定不补，因为补法是错的**（这就是"先测再决定"的结果）：

| 事实 | 值 |
| --- | --- |
| `ABSORB_FEEDBACK.poolSize` | **6** 个槽位（轮转，不是无限） |
| `burstDurationSeconds` | **0.6 s** |
| 池子上限 | 6 ÷ 0.6 = **约 10 次/秒** |
| bot 吸收频率（估） | 7 个 bot 合计约 **3–20 次/秒** |

七个 bot 一起往同一个 6 槽池里发，会把槽位快速轮掉——**玩家自己那一下闪光
（0.6 s 的可见崩塌）会在播完之前被回收**。为了"两边一致"而削弱玩家的关键反馈，
是净损失。若真要做，正确形式是给 bot 一条**独立且更便宜**的提示，而不是共用这个池。

**物体层反馈本来就是共用的**：bot 通过同一 capture 路径认领物体，
所以 ATTRACTED→SUCKING→ABSORBED 的位移、缩小、消失双方一样。
**这不影响"看得见吞噬正在发生"。**

## PHASE B 现状（before-state，已拍三档）

三档实测截图：`artifacts/qa/v12/arena/arena-{375x667,390x844,430x932}.png`
（由 `node scripts/probe_arena_competitors.mjs <WxH>` 直接产出，不必跑完整 acceptance scope）。

**已经在的（PHASE A 的成果肉眼可见）**：7 个对手全部是有色环的黑洞
（流光/雪球/火花/哨兵/风暴/矿石/蓝莓），玩家紫洞居中，排行榜/计时/暂停/安全准备齐全，
场上有公交车、红色轿车、木箱、树、长椅、人行横道。

**PHASE B 要解决的（对着用户列的清单核过）**：

| 用户列的问题 | 实测 |
| --- | --- |
| 大面积单色地面 | ✅ 命中。整个画面是一大片平灰蓝"路面"，读作空停车场 |
| 道路不连续 / 无街区结构 | ✅ 命中。只有一处十字路口标线，没有街区网格 |
| 建筑集中在边缘 | ⚠️ 更糟：**几乎没有建筑**，只有边缘几个木箱和车 |
| 可吞目标太小 | ✅ 命中。T1/T2 小物零散，T3 基本不可见 |
| 对手位置不清楚 | ⚠️ 八个参赛者全挤在中上三分之一，下方一条空带 |
| 上下密度失衡 | ✅ 命中。上方 HUD + 对手，下方大片空路 |

**根因（已定位到行）**：竞技场用的是**流式世界的出生 cell**（`ArenaMatchManager` 拿的是
`infiniteWorldManager`），不是专门设计的竞技地图。所以"地图"实际上是出生点恰好落在的
那个街区，稀疏与否全看流式内容——**这不是构图问题，是缺内容**。

**关键一行**：`GameManager.ts:621` —— `this.infiniteWorldManager.resetSession(Vec3.ZERO)`。
竞技场**永远在世界原点**开赛，也就是开场 cell。而 `DistrictTemplates` 里其实有
**六套已授权的街区**（住宅/公园/超市/仓库/停车场/工地），每套都有 4 个设计好的资源簇
（`center` 在 ±12~14，正好落在相机可见的 ±20 内）。**内容存在，只是竞技场没去用。**

### 追到更深一层：开场构图根本没落地（这是竞技场显得空白的直接原因）

`test:full` 的日志里刷了几百行同一条警告：

```
[InfiniteWorldManager] Opening composition entry not found: ParkTreeSmall_1
  ... ParkTreeLarge_3 / FlowerbedWest / ParkPathStonesWest / ParkPathStonesEast
  ... ParkHedgeNorth / POI_CentralSquare / POI_ParkFountain
```

`RenderProfile.OPENING_CELL_COMPOSITION` 声明了一份**授权好的开场构图**
（要隐藏哪些树、把中央广场挪到 (-9,-9)、放喷泉等）——
这正是 DESIGN_07 要的"设计过的开场区域"。它**有 8 条找不到目标**。

已排除的：

| 检查 | 结果 |
| --- | --- |
| 这些节点是否存在？ | **存在**，在 `cocos/assets/prefabs/world/GoldenCityCell.prefab` 里（场景里 0 个） |
| 预制体有没有接上？ | **接上了**。`InfiniteWorldRoot` 的 `goldenCityCellPrefab` = `2cf2305d-…`，与 `GoldenCityCell.prefab.meta` 的 uuid **完全一致** |
| 构图在哪跑？ | `InfiniteWorldCell` 构造函数 `:386`，`byName` 搜的是 **`this.node`（cell 自己的节点）** |
| cell 节点从哪来？ | `InfiniteWorldManager.ts:1913` → `worldCellFactory.instantiateAuthoredCell(coord, district.kind, goldenCityCellPrefab, undefined, logicalOrigin)` |

**下一个要看的就是 `WorldCellFactory.instantiateAuthoredCell`**：
它带了 `district.kind` 参数，很可能是**按街区种类挑了变体**，于是实例出来的节点树
不是 `GoldenCityCell.prefab` 原树，`byName` 自然找不到那 8 个名字。
修好它 = 开场构图真正落地 = 竞技场开场不再是空路口。

**这一步的判据很明确**：跑 `test:full`，看 `Opening composition entry not found` 是否归零；
再看 `artifacts/qa/v12/arena/` 三张截图是否出现广场/喷泉/花坛。

### ⚠️ 上面这段推断是错的，已实测推翻（同日）

`instantiateAuthoredCell` 第 50 行是 `const prefab = prefabOverride || this.resolve(district, coord);`
—— 传进来的 `goldenCityCellPrefab` **非空，直接胜出**，`district.kind` 不参与选择。
第 52-53 行只重命名**根节点**，子节点保留预制体原名。

然后用探针直接问场景（`probe_arena_competitors.mjs` 新增 `[opening]` 段）：

```
[opening] WorldCell_* nodes in the live tree: 9
  POI_CentralSquare: present x1     POI_ParkFountain: present x1
  ParkTreeSmall_1:   present x1     FlowerbedWest:    present x1
  ParkHedgeNorth:    present x1     ParkTreeLarge_3:  present x1
```

**六个全都在，各一个。开场构图是真的落地了。**

所以 `test:full` 里那几百行 `Opening composition entry not found` 来自**无头测试环境**
（golden-city 契约测试），**不是真实竞技场**。

**因此 PHASE B 的判断要改**：竞技场不是"缺内容"——广场、喷泉、花坛、公园树都在场上。
画面显得空，是因为**这些东西在相机里的尺寸和对比度太小**，以及大片平灰路面的视觉占比过大。
这是**取景与尺度**问题，不是内容缺失。修法方向随之改变：
不是"补内容"，而是让已有的内容在画面里读得出来（尺度、对比、路面占比）。

**为什么不能直接改这一行**：紧邻的 `GameManager.ts:618` 把玩家也钉在
`this.machine.node.setPosition(0, 0, 0)`。只改 `resetSession` 的入参会**让世界原点与玩家错位**，
玩家会掉进另一个 cell。要做得对，必须同时决定"世界原点"与"玩家落点"，
并验证流式加载、相机、出生环、边界（`ARENA_RADIUS = 44`）都跟着走。
**这是 PHASE B 的第一件事**，不是一行能了结的改动，所以本轮没有贸然动它。

**下一步（PHASE B 的真实工作量）**：按 DESIGN_07 的真实内容（竞技场场景构图：
玩家出生点在下、AI 出生点分列上/左/右、中央 T3 高危区、道路成网、建筑只做边界、
T1–T3 分层）做一个**专门的竞技场开场街区**，优先在现有 Authored District Cell 上改，
复用 `WorldStreamer` / `WorldCellFactory` / `DistrictMapLibrary` / `WorldArtLibrary`，
不新建第二套 WorldManager。

**注意一个已测出的约束**：`ARENA_RADIUS = 44`，但相机可见地面只有约 ±20 单位。
当前出生环半径 5.8，实测已有 3 个对手（bot-1 nx=1.069、bot-2、bot-7）落在屏幕外。
所以"把对手铺开"不是免费的——铺得越开，开场可见的对手越少。这个权衡要在地图设计里一起解，
不能单独调半径。

## 命令

```bash
node scripts/probe_arena_competitors.mjs   # PHASE A 全部运行时判据（#1/3/4/5/7）
npm run build:web                          # 改完先构建再跑探针
npm start                                  # http://127.0.0.1:8080/
npm run acceptance:v2 -- --scope=arena-ai  # 竞技 AI 回归
```

## 已完成（有实测证据）

| TASK_ID | 内容 | 证据 |
| --- | --- | --- |
| A-0 | 七张设计图逐张打开核对、备份、SHA256、修正五处命名错配 | `V12_DESIGN_REFERENCE_MANIFEST.md` |
| A-core | **对手不再是染色推土机**：`BOT` 不再隐藏黑洞核心、不再挂 crawler；染色改到黑洞自身环 | `BlackHoleMachine.ts` 755 / 785 / applyArenaBotTint / applyLevelAppearance |
| A-core-v | 运行时实测：`ArenaMatchRoot` 7 个对手 `core=true crawler=false visible=true` | `scripts/probe_arena_competitors.mjs` PASS |

## PHASE A 剩余七项：当前实测状态

探针已能给出其中四项的直接读数（`coreScale` / `worldPos` / `visible` / `core`）。

| # | 项 | 状态 | 实测 |
| --- | --- | --- | --- |
| 1 | Bot 外观尺寸与真实质量关联 | **部分** | 开局 7 个 `coreScale` 全为 `1.32`（一致，符合同一起始质量）。**尚未验证升级后是否随之变化** |
| 2 | 玩家与 Bot 吸附表现一致 | **未测** | 需在真实对局里对比双方吸附/吞噬 |
| 3 | Bot 染色与核心稳定显示 | **部分** | 核心稳定激活；**染色颜色值尚未逐一读出**（探针未取材质色） |
| 4 | 名字与真实模型屏幕坐标一致 | **未测** | 需读 `ArenaHUDController` 名牌定位来源 |
| 5 | 遮挡、屏幕外目标、名字显示 | **未测** | 需验证屏幕外不残留孤立名字 |
| 6 | 各等级/状态视觉装配稳定性 | **未测** | 需 LV1→LV5 逐级截图 |
| 7 | 多次启动可见性回归 | **未测** | 需多轮真实对局 |

## 本轮新发现（真实、但未修）

**对手之间没有分离约束，会叠在一起。** 实测 2.5 秒后：
`ArenaBot_4 (-3.3,-5)` 与 `ArenaBot_5 (-3.4,-5)` 相距 0.1，`ArenaBot_6 (-4.5,-3.1)` 也在 2 单位内
——三个对手在屏幕上读作一个实体。

**已排除**"出生点重叠"这个解释：`spawnPosition()` 是正确的 7 等分圆环
（`angle = 2π(slot-1)/7 + 0.13π`，半径 5.8），出生点是分散的。**这是 AI 巡游后的漂移**，
不是出生缺陷——所以**没有**把它当出生 bug 去"修"。

修法应是给 Bot 加一个分离/避让约束，但那是 gameplay 改动，会影响 `arena-ai` 验收，
需要独立的验证预算，本轮没有仓促改。

## 下一步（下个会话直接接这里）

1. 扩展 `probe_arena_competitors.mjs`：读出每个 Bot 的**实际材质色**（验证 #3）、
   以及**名牌的屏幕坐标 vs 模型屏幕坐标**（验证 #4/#5）。
2. 读 `cocos/assets/scripts/ui/ArenaHUDController.ts`，确认名牌位置来源是否同一个
   世界坐标（这是 #4/#5 的判据所在）。
3. 跑一次完整 Arena，在 LV1 与 LV5 各截一张，验证 #1/#6。
4. 然后进 PHASE B（竞技场开场样板区），参考 `V12_DESIGN_REFERENCE_MANIFEST.md`
   §1 里 **07**（竞技场场景构图）与 **04**（竞技场 Gameplay + HUD）的真实内容。

## 命令

```bash
npm start                                  # 看当前构建 http://127.0.0.1:8080/
node scripts/probe_arena_competitors.mjs   # PHASE A 运行时判据
npm run build:web                          # 改完先构建再跑探针
npm run acceptance:v2 -- --scope=arena-ai  # 竞技 AI 回归
```
