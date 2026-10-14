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

### PHASE B 的可量化基线（已测，供改动前后对比）

对三档截图做像素统计（排除上下 HUD 带，只看游玩视野）：

| 尺寸 | 采样点 | 单一最多颜色 `(109,119,151)` 占比 | 近中性色占比 |
| --- | --- | --- | --- |
| 375×667 | 43,804 | **23.7%** | 28.1% |
| 390×844 | 57,720 | **28.1%** | 27.0% |
| 430×932 | 70,305 | **27.8%** | 26.8% |

`(109,119,151)` 就是那片平路面。**约 27% 的游玩画面是同一块没有细节的颜色**，
三档高度一致——这就是"大面积单色地面"的量化值，也是 PHASE B 要往下压的数。

**注意**：27% 本身不算灾难（城市街道里路面占三成是合理的）。
所以 PHASE B 的判据不该是"把它压到很低"，而是**同尺寸前后对比有没有实质下降**，
以及**广场/喷泉/花坛这些已有内容有没有变得读得出来**。

### 竞技场相机受不受契约约束？——查清了，**不受**

一度以为被钉住：`test_cocos_portrait_acceptance.mjs:2194` 有
`atLeast('PLAYER_WIDTH_RATIO_MIN', …, camera.playerWidthRatioMin)`，
而在 `cocos/assets/scripts` 里搜 `playerWidthRatioMin` **只搜到一条注释**
（`BlackHoleMachine.ts:783`），常量本身不存在——看起来像"对着 undefined 断言"的空门禁。

**这个怀疑是错的。** 直接读验收报告 JSON 就清楚了：

```
PLAYER_WIDTH_RATIO_MIN  actual=0.22577  required=0.22  pass=true
PLAYER_WIDTH_RATIO_MAX  actual=0.22577  required=0.30  pass=true
```

常量在运行时确实存在（0.22 / 0.30），0.2258 与 LV1 基线 ~0.2255 吻合。

**但这两条检查跑在 `--scope=golden-city`，量的是无尽/黄金城相机，不是竞技场。**
所以 `arena: { offset: (0,44,27), pitch: -55 }` **不在这个契约的覆盖范围内**，
收紧竞技场相机是允许的。动之前只需确认没有别的门禁依赖它。

（顺带记一条方法论：`grep` 搜不到常量名**不等于**常量不存在——
它可能是运行时拼出来的。下结论前要读报告里的实际数值，而不是只读代码。）

### 那为什么不直接收紧竞技场相机？——因为它和更高优先级的 P0 冲突

看似最顺手的修法：把 `arena` 相机从 `(0,44,27)`（距离 51.6）收到比如 `(0,36,22)`（距离 42.2），
场上道具立刻大约放大 22%，可见地面缩小约三分之一，"路面占比"自然下降。

**但这一轮已经量过它的代价**：当前 5.8 的出生环、51.6 的相机距离下，
**已经有 3 个对手落在屏幕外**（实测 bot-1 `nx=1.069`、bot-2 `nx=0.918`、bot-7 `nx=0.862`）。
相机再收紧，屏幕外的对手只会更多。

而 §2 的优先级是明确的：

> P0：竞技角色实际可见性与互动。
> P0：竞技场地图构图和真实可玩空间。

**"玩家能不能看见对手"排在"道具够不够大"前面。** 收紧相机会直接违反上面那条 P0，
所以**这不是可用的修法**——哪怕它能让那个 27% 立刻下降。

**结论**：PHASE B 的正确杠杆不是相机，而是**已有道具在场上呈现的尺度与对比**
（以及出生环与相机的联合设计：把对手铺开会让更多对手出屏，两者必须一起解）。
这条约束在动任何相机参数之前必须先解掉，否则就是用可见性换画面密度。

### ★ PHASE B 的真正根因：**竞技场打的是一张公园图，而设计图要的是城市街区**

上面几轮都在"怎么让画面变密"里找办法，方向都不对。真正的原因是**场地本身选错了**。

直接数 `cocos/assets/prefabs/world/GoldenCityCell.prefab` 的节点（144 个）：

| 类别 | 数量 |
| --- | --- |
| `Park*` 前缀（ParkTreeSmall ×6、ParkTreeLarge ×6、长椅、垃圾桶、花坛） | **27** |
| tree | 12 |
| fountain | 4 |
| bench / trashcan / flower | 各 4 |
| **building 类** | **只有 3** |
| road | 5 |
| SpawnPoint / CompetitorSpawn | 20 / **3** |

**这是一张公园。** 而 DESIGN_07 要的是：连续街道、建筑做边界、T1–T3 分层、
功能分区（商业/公园/施工）的**紧凑城市街区竞技场**。

所以：

- "大面积单色地面" = 公园的广场与步道，**不是渲染问题**
- "道具零散" = 12 棵树摊在 64×64 m 里，**这是公园该有的样子**
- 前面四次施工里我量的那些数（平路面 27%、小道具挪不动画面）**都对，但都不是病根**

**顺带发现**：这张 cell 里授权了 **3 个 `CompetitorSpawn` 点**，而
`ArenaMatchManager.spawnPosition()` 自己算圆环、**完全没用它们**。授权好的出生点一直闲置。

**因此 PHASE B 的正解有两条**，都不是调参：

1. **让竞技场不开在开场公园 cell 上**——即改掉 `resetSession(Vec3.ZERO)` 那个硬编码原点，
   并且**同时**移动 `GameManager:618` 钉住的玩家落点（两者必须一起动，否则玩家掉进另一个 cell）。
   街区归属由 `getDistrictTemplateForRegion(regionId, cellX, cellZ)` 决定，
   取决于**区域**，所以换 cell 是否会换到城市街区，要先读 `PROGRESSION_DISTRICT_BY_REGION` 确认。
2. **为竞技场授权一张专门的 cell**（Creator 场景工作），并复用那 3 个闲置的 `CompetitorSpawn`。

在选之前必须先确认方案 1 能否真的换到城市街区——否则就是又一次盲改。

### 已确认：方案 1 **能**换到城市街区（DOWNTOWN）

`DistrictTemplates.ts:115` 的区域→街区映射：

| region | district |
| --- | --- |
| bedroom | RESIDENTIAL |
| warehouse | WAREHOUSE |
| supermarket | SUPERMARKET |
| parking | PARKING |
| construction | CONSTRUCTION |
| **city** | **DOWNTOWN** |

`city → DOWNTOWN`，正是 DESIGN_07 要的紧凑城市街区。街区由 `getDistrictTemplateForRegion`
按**区域**决定（`:141`），所以竞技场只要开在 **`city` 区域**的 cell 上，
拿到的就是 DOWNTOWN，而不是现在这张公园。

**所以 PHASE B 的下一步是明确的三步**：

1. 找到 `city` 区域在世界里的位置（`GameConfig.ts:259` 定义了 `id: 'city'` 的区域，
   还需要读区域如何按坐标推进，才能选出一个落在 city 区域的 cell 坐标）。
2. 把竞技场的会话原点从 `Vec3.ZERO` 改到该 cell，
   **同时**改 `GameManager:618` 钉住的玩家落点——两者必须一起动。
3. 判据：竞技场开局 cell 的节点构成应从"27 个 Park* + 3 个 building"
   变成 DOWNTOWN 街区的内容；三档截图对照，并跑 `acceptance:v2 --scope=arena-ai` 回归。

**注意**：开场公园 cell 是**特判**的（`isOpeningCell`），换坐标后它不再被选中，
这正是我们要的；但要确认流式加载、相机、出生环（现在是 14）、
边界（`ARENA_RADIUS = 44`）在新区块上仍然成立。

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


---

## PHASE C / F 审计结果（2026-10-12）

### PHASE C Arena HUD：**已经基本符合 DESIGN_04 的元素清单**

逐项核对（节点尺寸/位置取自 Game.scene 的 ArenaHUD 子树）：

| DESIGN_04 要求 | 现状 |
| --- | --- |
| 排行榜 Top3 + 我 | ✅ 4 行（Top1..4 激活，Top5 未激活），LeaderboardPanel 236x195 |
| 倒计时 | ✅ TimerPanel 160x62 @ (0,492) |
| 排名 + 质量 | ✅ StatusPanel 208x54（RankValue / MassValue / KillCaption+KillValue） |
| 暂停 | ✅ BtnPause 58x58 @ (274,492) |
| 虚拟摇杆 | ✅ 196x196 @ (232,-470) —— **在右侧**，设计图在左下 |
| 危险 / 可追 标签 | ✅ 名牌上的文字标签 |
| 屏外方向提示 | ✅ BotArrowLeft/Right/Top/Bottom |
| **不要永久显示巨大 Logo** | ✅ **已经满足**：ArenaTitle 停 2.0s 后 0.8s 淡出并 deactivate（TITLE_HOLD_SECONDS / TITLE_FADE_SECONDS） |

**我差点改错一处**：本来准备按「不要永久显示巨大 Logo」把 ArenaTitle 隐藏。先查了一下，发现**它本来就是临时标题**（2 秒后淡出），所以那条规则**已经被满足**——改了反而是错的。

**剩下两个缺口都是产品决定，不是视觉保真**：

1. **摇杆在右，设计图在左**。两个模式（Endless / Arena）**一致**都是 x=+232，所以这不是不一致，是**操作手感的既有选择**。改它是改操控，不是修视觉。
2. **技能按钮**（吸收加速）：查证 triggerMagnetStorm **从未被任何地方调用**——机制是**死代码**，没有输入、没有充能/冷却。给它加按钮 = **新增一个玩法技能**，会改变比赛规则（违反「不得为视觉还原破坏正式两模式规则」）。

### PHASE F 吸附状态：**已有实现**

CompressibleObject 维护 IDLE → ATTRACTED → SUCKING → ABSORBED → RECYCLED，
各状态用 registerState 注册了进入/退出表现；并且已经有**可吞脉冲**
（pulse = 1.0 + sin(t*5)*0.08 作用于 visualNode）——即 DESIGN_03 的「可吞物体高亮」。
逐状态表现细节未逐项读，但**不是从零开始**。

---

## PHASE H 审计结果：**结构、材质、密度已经是统一的**

对 `cocos/assets/game_art/maps/` 下全部七张街区 prefab 做了三项核对。

**一、顶层结构完全一致**——七张图的根节点子节点集合**逐一相同**：

```
(Buildings, CollectibleSpawnPoints, Ground, Park, Props, Roads, TrafficRoutes)
-> CityCenter, Construction, Park, Parking, Residential, Supermarket, Warehouse
```

**二、材质是同一族**——除 Park 外六张图用的是**完全相同的 6 个材质 uuid**
（`3741ee22 / 5031a894 / 71f7d10e / 75891bac / dd4e65bf / ffc92b80`）；
Park 用其中 4 个（它没有建筑，所以少了 2 个）。

**三、密度可比**：

| 地图 | 节点 | 建筑 | 树/灌木 | 道路 | 道具 |
| --- | --- | --- | --- | --- | --- |
| CityCenter | 123 | 23 | 18 | 11 | 8 |
| Construction | 128 | 9 | 14 | 11 | 28 |
| **Park** | 189 | **1** | **71** | 15 | 26 |
| Parking | 137 | 17 | 22 | 13 | 11 |
| Residential | 132 | 21 | 22 | 14 | 13 |
| Supermarket | 153 | 25 | 18 | 11 | 16 |
| Warehouse | 135 | 9 | 14 | 11 | 22 |

**Park 的 1 建筑 / 71 树是它的主题，不是缺陷**——DESIGN_07 明确把「公园广场」
列为竞技场的三个功能区之一，也明确要求「不同地区有主题区别，
但**共享道路风格、材质、黑洞身份、阴影和美术语言**」。三项核对下来，
**共享的那部分已经共享，该有区别的那部分有区别**。

**结论：PHASE H 无需改动。** 这是审计结果，不是回避——判据是上面三张表，
不是"我觉得统一了"。

---

## PHASE E 完成（提交 `a28d96b`、`5c4c38d`）

结算榜每一行现在是 DESIGN_06 的四列：**名次徽章 + 彩色黑洞头像 + 名字 + 称号 + 质量**。

**头像是一张白色圆环贴图按行染色**，用的是缎带已经在用的"一图多染"手法。颜色随
`ArenaLeaderboardEntry.tint` 走，不在页面里二次推导，所以结算榜不可能与玩家刚追过的
那个洞颜色不一致；权威服务器那条路径的对手没有本地机器可读，按场上序号取色。

**称号改为按名次为底、击杀可越级**：只按击杀时，一局低击杀的比赛里每行都是"萌新黑洞"，
那一列什么也没说。名次是这张榜的排序依据，按它做阶梯才读得出层级。

**行内不再显示每个对手的淘汰数**：设计图右列只有质量，五行都带"N 淘汰"正是让它们读成
一整块文字的原因。玩家自己的淘汰数仍在"击败对手"统计卡上。

### 深色看板（DESIGN_06）

参考图的名次面板是深海军蓝、文字浅色，奖励面板同样，三张统计卡仍是浅色。本产品此前
整页浅色。四个值都是从参考图自己的像素里取**中位数**（`scripts/sample_settlement_reference.py`）：

| 区域 | 取值 |
| --- | --- |
| 名次面板 | `#1a2e58` |
| 行 | `#192c53` |
| 奖励面板 | `#1d2b51` |
| 统计卡 | `#edf4fd`（未改，参考图也是浅色） |

**页面本身保持浅色**——只有参考图画成深色的那两个面板变深。无尽结算没有 V12 参考图，
沿用同一套语言，两个模式不会各自漂移。

`ArenaResult` 是唯一跨两个表面的行：竞技里它落在深色面板内，无尽里面板隐藏、它落在浅色
卡上。一个序列化颜色不可能在两边都可读，所以按模式在运行时设色。**它原来就是"深色文字
落在深色面板上"**——这正是重新着色后肉眼发现的那处缺陷。

### 两个断言工具

- `scripts/probe_settlement_rows.mjs`：四列是否都在、是否激活、是否绑了值，头像颜色是否
  互异、是否共用同一张贴图，以及**每个画在看板上的标签对背景的对比度必须 ≥ 3.0**。
  反向证明过：去掉 `ArenaResult` 的修复后它报 `contrast 1.36 against its surface is
  below 3` 并以 1 退出。
- `scripts/lib/scene_edit.py`：场景手术的公共机器，被调试两次后抽出来的。抽出后**证明过
  行为不变**——从加头像之前的场景重新生成，与已提交的场景逐字节相同。

### 这一轮踩到的四个静默失败（都写进了提交信息）

1. 场景元素定位按"换行+缩进+花括号"前缀计数，**只要有一个元素写成一行就会错位**
   （1376 个元素只有 1355 个这种前缀），错位不会报错，只会把改动写进错误的元素。
2. 替换区间返回了整个元素而不是值本身，同一组件上的两次编辑区间相同，**后者会把前者
   悄悄改回去**。
3. 子节点列表用**替换**而不是追加，把页面的 81 个子节点全删了——卡片、遮罩、所有文字
   一起消失，只剩 3D 场景和十二个孤儿头像。
4. 头像和称号挂在了"行"下、却用行的页面坐标定位，**整整高出一行**。

## 结算榜的权威服务器路径

`GameManager.toNetworkArenaSnapshot` 也构造 `ArenaLeaderboardEntry`，类型检查抓到了它缺
`tint`。远端玩家没有本地机器可读色，`arenaTintForFieldIndex` 按场上序号取机器人色，
本地玩家仍取玩家紫。

## 一个必须记住的构建陷阱：`[...set]` 在本项目里不成立

Cocos 构建把 `[...someSet]` 转译成 `[].concat(someSet)`——**不是展开，而是把整个 Set 当成
一个元素塞进数组**。序列化后是 `[{}]`。

我为威胁诊断写的 `[...threatIds]` 就是这样，导致一次正确的检查连续 6 次失败：诊断给出的
id 是个空对象。改成直接取 `snapshot.localThreatIds`（本来就是数组）后正常。
**本项目没有 downlevelIteration，只对数组用展开。**

已用带自检的扫描确认 `cocos/assets/scripts` 下**没有第二处**展开或 `for...of` 作用于 Set
（扫描器先用合成样例自证能命中，再报 0 命中——否则"0 命中"可能只是它看不见）。

## 竞技威胁检查的两个偶发红：根因是**配对**，不是采样率

`acceptance:v2 --scope=revive` 里的 `FAIL_ARENA_THREAT_NOT_MARKED` 曾约 1/3 概率失败。

**根因不是采样太慢，是把两帧配成了一对**：QA 快照里的 `arena.localThreatIds` 是**读取时
实时重算**的，而 `ui.arenaHUD.nameplates` 是 HUD **每帧一次**从上一帧快照写出来的。一次
快照读到的这两个值可以差一帧，于是"某个对手被报成威胁、但它的名牌还是上一帧的文字"。

修法是让 HUD 自己记下**它这一帧被喂进去的威胁 id**（`ArenaHUDController.lastThreatIds`，
经 `getThreatDiagnostics()` 暴露为 `ui.arenaHUD.threats`），断言改成**拿名牌去对它自己的
输入**。同时把测试的观察循环搬进页面里跑 `requestAnimationFrame`——每次 CDP 往返约一秒，
而威胁窗口只有击杀前那段牵引（0.8 s），从外面轮询本来就可能整个跨过去。

**顺带纠正一条我先前的错误推断**：`FAIL_ARENA_THREAT_NEVER_OBSERVED`（13 次采样后
DEFEATED）我一度归因于"采样间隔长于威胁窗口"。查过规则后这条不成立——`COMBAT_WARMUP_SECONDS
= 15`，且击杀要求 `pullSeconds >= 0.8`，所以**威胁至少存在 0.8 秒**，从外面按秒轮询确实会
漏，但页面内按帧观察不会。

## PHASE B 审计：六条设计要点逐条量过，五条已成立，一条需要专门授权 cell

DESIGN_07 的「场景设计要点六条」逐条核对（都是量出来的，不是感觉）：

| # | 要点 | 状态 | 判据 |
| --- | --- | --- | --- |
| ① | 减少大片空地 | **部分** | 平路面占比 27–32%，但该指标**只对纯视觉改动有效**，跨构建会因 AI 路径变化而漂移（见上文） |
| ② | 出生点附近必有可吞目标 | **成立** | 4 个簇在 ±7；实测对手开局即在成长（355/350/320 kg） |
| ③ | 道路形成追击路线 | **成立** | 街区 prefab 的 `Roads` + `TrafficRoutes` 子节点，七张地图都有 |
| ④ | 建筑只做边界、不挡核心视线 | **成立** | 量 `Supermarket.prefab` 的 `Buildings`：13 栋，距 cell 中心半径 **15–40**，**12 单位内 0 栋** |
| ⑤ | 可吞物层级丰富 | **成立** | 近场簇全是 T1/T2，角簇含 T3；区域开放 T1–T4 |
| ⑥ | 功能区域明确（住宅/商业/停车/工地/水域） | **未成立** | 竞技场只打**一个**街区（超市）。相机只看到 ±20，cell 是 64 单位，多分区需要一张专门授权的 cell |

**⑤ 的具体依据**（对象 tier 取自 `GameConfig.OBJECT_TEMPLATES`）：

- 近场 ±7：`soda_can`/`paper_ball`/`water_bottle`/`apple` = **T1**，`cardboard_box`/`trash_bag` = **T2**
- 角 ±13~14：`delivery-boxes` 全 T2；`cart-return-litter`/`produce-discard`/`parking-recycling` 含 **T3**（chair / monitor / small_table / tire）

即「开局区 T1/T2 → 中段 T2/T3」这条分层**已经由授权簇的 `preferredTypes` 表达出来了**。

## ★ 一个必须先知道的机制：**簇系统是抽签，不是保证**

我按 DESIGN_07 的「中段争夺区 T2/T3 密集」又加了 4 个 ±11 的 T2/T3 簇，**构建通过、探针通过**，
差一点就提交了。先去看 `ChunkConfig.generateCellItems` 才拦住：

```
const count = 20 + positive(seed, 5);              // 每 cell 20–24 件
const clusterBudget = Math.max(2, Math.round(count * 0.15));   // = 3 或 4 件
```

**一个 cell 里"簇物件"的总数是 3–4 件，与声明了多少个簇无关。** 循环是
`district.resourceClusters[(i + seedOffset) % clusterCount]`——簇越多，每个簇被抽中的概率越低：

| 声明簇数 | 每簇被抽中的概率 |
| --- | --- |
| 8（现状） | 38–50% |
| 12（我加的） | **25–33%** |

所以**加簇不但没有加密中段，反而稀释了已有簇**。已回滚。

**这条同时推翻了更早那次 PHASE B 改动**：上一轮给超市加 4 个 ±7 簇（"出生点附近必有可吞目标"）
时，用的证据是"对手仍在吃 355/350/320 kg"。但对手成长是**默认行为**，那 4 个簇是否真的被抽中
是**概率事件**——那次改动是"提高概率"，不是"保证覆盖"，而当时的报告写成了后者。

**要让授权布局真正落地**，正确改法是让 `clusterBudget` 至少覆盖簇数
（例如 `max(clusterCount, round(count * 0.15))`），保持总件数不变、只改配比。
**但这会改变全部街区的物件构成**，是全局平衡改动，超出"按设计图修视觉"的范围，
**留给所有者决定**，本轮不擅自做。

## 玩法页核对与修理（DESIGN_03 / DESIGN_04，2026-10-13，提交 `6959630`）

判据不是看截图，而是**把两个 HUD 的每个节点从运行时树里 dump 出来**，再用真实 CDP 触摸
把黑洞开起来。新增 `scripts/probe_gameplay_hud.mjs`：抓图 + dump 节点（位置/尺寸/文字/
渲染尺寸）+ 四方向实拖 + 密度分带 + 吸附拒绝原因。

### 改了什么

| 问题 | 依据 | 处理 |
| --- | --- | --- |
| 摇杆在右下 | 两张参考图**都**画在左下 | 改左下。**不是一行改动**：`JoystickVisual` 用自己常量设可见位置，`PlayerController` 用硬编码右侧比例决定哪些触摸算摇杆输入——分开改会做出"看得见却点不动"的摇杆。现在都读 `JOYSTICK_ZONE`，并复验新侧拖拽有效 |
| 竞技排名/质量块在左侧、压在排行榜上方 | DESIGN_04 画在右侧 | 整块（面板 + 4 个标签）同位移 `+452`，**保持内部顺序**（名次在质量左）；逐轴取反会把顺序翻成"质量 名次" |
| 无尽进度条压住等级面板 | — | 间距必须按 **Track** 算（节点 26 高、Track 子节点 38 高，画的是 Track）：y=392 时顶部 13 单位藏在面板后。条改为**居中 x=0**，因为跟随等级面板（x=62）会把 500 宽的 Track 推出右边缘 13.9px，`verify:gameplay-visuals` 直接报 `Track w500 R13.9` |
| 名牌压在 HUD 面板上 | — | 名牌最后添加所以画在最上层；排名块一挪到右侧就出现"雪球 240kg"穿过"第 4 / 8"。两个约束（互相避让 + 避开面板）要**一起松弛**，各跑一次会留下两个 bot 叠在同一 y |
| 竞技场出生点附近没东西吃 | DESIGN_07「出生点附近必有可吞目标」 | 见下 |

### ★ 这一轮最值钱的发现：**`DistrictTemplates` 管 WHAT，prefab 管 WHERE**

实测出生点 32 单位内只有 14 件物体、T1 只有 6 件（32 单位外有 178 件），四方向实拖
**一件都吃不到**。

根因不是簇表。`populateAuthoredDistrictContent` 遍历的是 **prefab 的
`CollectibleSpawnPoints/<clusterId>/SpawnPoint_*`**，拿组名去 `DistrictTemplates` 里查；
**它从不反向遍历**。而 `Supermarket.prefab` 只声明了**四个角**的组，每个 SpawnPoint 都在
半径 16–21——**上一轮 PHASE B 往 `DistrictTemplates` 加的四个 ±7 簇根本没有对应的
SpawnPoint，一件都没放出来**。那次改动补了 WHAT 没补 WHERE，而它的证据
（"对手仍在吃"）是对手默认就会有的成长。

**同类教训的形状**：改动通过门禁、探针还绿，但**改动根本没接到执行路径上**。判据应该是
"这份数据被谁读、读完变成什么"，不是"改完测试还绿"。

修法：给 prefab 补上那四个组，并把点**铺开在整个象限**（半径 4.5/6.5/8.5，象限内角度
20°/45°/70°）而不是挤在对角线上——第一版全放在对角线，2.4 的吸附半径下四方向实拖仍然
一件都吃不到。`entrance-litter` 的 `preferredTypes` 也调了顺序让 index 0 是 T1，因为最内圈
的点取 index 0，而它原本以 T2 开头——**离出生点最近的那件恰好是新手吃不了的**。

结果：出生点 10 单位内从 1 件变成 11–13 件（其中 5–7 件 T1）。玩家开起来能吃到东西
（两次跑分别 240→280、240→330 kg），吸附 trace 显示剩下的拒绝都是
`OUT_OF_RANGE`（5–9 单位 vs 2.4 半径）——也就是"要瞄准"，这正是玩法本身。

### 故意没做

- **不加 `加速`/`磁吸`/`吸收加速` 按钮**：两张图都画了，但清单 §3 明说"不要因为图里有就加
  功能"；`triggerMagnetStorm` 仍是死代码、从未被调用。
- **无尽顶栏保留金币与地区药丸**（DESIGN_03 没有）：图里画的四件（等级/质量/进度/暂停）
  都在且可读；去掉另外两件是**丢信息**，属于产品决定，不是保真修复。
- **名牌仍只显示名字**（DESIGN_04 是名字+质量）：质量已在排行榜和排名块里。

### 契约更新（位置被钉住，改被钉住的节点是**刻意行为**）

- `endless-hud.json`：RegionPanel/RegionValue y 346→316、Joystick x 232→−148。
  契约原先钉的 232 **没有任何东西在渲染**——`JoystickVisual` 运行时覆盖成 148，
  于是场景、契约、可见控件三者各说一个位置。现在三者一致。
- `arena-hud.json`：排名块五项改到右侧、Joystick x→−148，理由写进 invariants。

## 仍未完成

**已完成并验证**（2026-10-13）：

- **PHASE D 端到端**：`ui-full-flow`（两模式 Home→…→Settlement→Home）、`arena-timer`（自然
  时间结束）、`revive`（**修好后 6/6 PASS**）、`arena-ai`、`pages`、`settlement` 全部 PASS；
  `test:full` **529 PASS / 0 FAIL**。
- **PHASE J**：八个页面 × 三档尺寸的截图与展板已生成（`cocos/docs/evidence/v95/pages/`）并
  **逐页看过**，无裁切；`verify:layout` 独立复核同样三档 PASS。
- **PHASE B 审计**：六条设计要点逐条量过，五条成立（见上）；第六条需要专门授权的 cell。

**留给所有者决定的四件事**（都不是我能单方面完成的）：

1. **摇杆位置**：现在右下 `x=+232`，两张设计图都画在左下。改它是改操控，不是修视觉。
2. **技能按钮**：`triggerMagnetStorm` 机制在代码里但**从未被调用**，加按钮＝新增玩法技能。
3. **簇预算改法**：让 `clusterBudget` 覆盖簇数（`max(clusterCount, round(count*0.15))`）
   能让授权布局真正落地，**但会改变全部街区的物件构成**，是全局平衡改动。
4. **微信 AppID 访问权限 / 抖音真实 AppID（需扫码）**——外部阻塞，如实标注，不冒充 PASS。

**未复现的一项**：`FAIL_TRAFFIC_REPLENISHMENT` 在 4 次 `progression` 里出现过 1 次，
此后未复现也未证伪。

**推送**：GitHub 443 间歇不可达，本地领先远端 4 个提交，恢复后重试。
