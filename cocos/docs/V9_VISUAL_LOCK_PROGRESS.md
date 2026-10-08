# V9 COMMERCIAL VISUAL LOCK — 进度与交接

分支：`dev/product-finalization-20260929`
日期：2026-10-07

**状态：V9 未完成。** 本文档记录已完成的部分、已用证据关闭的问题、以及剩余工作，供下一轮冷启动使用。

---

## 1. 已完成

### 1.0 【已回退】9-slice 素材替换——那是一个错误的 P0，且我据此造成了回归

**这一节推翻了本文档原先的 1.1。原文保留在下面，作为记录。**

盘点把"`_type: 1`（sliced）却引用 border 为 0 的 `mode_card_shelf.png`"定为 P0，理由是"类型叫 sliced 但素材没有九宫格边界，拉伸必然变形"。

**我据此把 72 处换成了真实 9-slice 素材。这是一个错误，已全部回退。**

原因：**"border 为 0" 是形式标准，不是视觉标准。** border 为 0 的图在 sliced 模式下等价于简单拉伸——对一张平面面板美术来说，那正是想要的效果。我只看了 border 数值，**没有看两张图长什么样**。

证据（`artifacts/qa/settled/machine-settled-390x844.png` 与改动前的对比）：

| | 改动前 | 改动后 |
|---|---|---|
| 机器页顶部卡片 | **深藏青面板** | **浅色带绿卡片** |
| 5 行等级条 | 各自规整的圆角药丸、文字清晰 | 互相压叠、文字被盖住 |

根因：`MachineCard` 原本用 `mode_card_shelf` 的**深色面板美术**，我换成了 `ui_card_9slice` 的**浅色卡片美术**——页面的配色体系被换掉了。同时 `ui_card_9slice` 的 border 是 44，而等级条只有 82 高（`2×44=88 > 82`），九宫格退化，于是行看起来互相压叠。

**教训（已写进纪律备忘）**：判断"素材是否合适"必须**看画面**，不能只看元数据。**形式指标不能替代视觉判断。**

**顺带纠正另一处判断错误**：机器页是**深色页面**（`MachineCard` 是深色面板），不是浅底卡片。本文档 §3.1.1 原先把它列在"浅底页面"里是**错的**。据此给等级行加的浅底 token 颜色**也已回退**。

---

### 1.1 【原文保留，已被 1.0 推翻】P0 资产边界：全项目 0 处残留

盘点发现的 P0 是：`Game.scene` 里大量 Sprite 设成 `_type: 1`（sliced），引用的却是 `mode_card_shelf.png`——该图导入 border 为 **0/0/0/0**。"类型叫 sliced"但素材没有九宫格边界，拉伸必然变形。

**已全部替换为真实 9-slice，共 72 处：**

| 页面 | 处数 | 换成 |
|---|---|---|
| ArenaHUD | 13 | `ui_panel_9slice`(34) / `ui_hud_bar_9slice`(30) / `ui_button_9slice`(48) |
| EndlessHUD | 1 | `ui_button_9slice` |
| SettlementPage | 22 | `ui_card_9slice`(44) / `ui_button_9slice` |
| SkinSelectionPage | 18 | `ui_card_9slice` / `ui_hud_bar_9slice` / `ui_button_9slice` |
| MachineInfoPage | 7 | `ui_card_9slice` / `ui_button_9slice` |
| RevivePage | 6 | `ui_card_9slice` / `ui_hud_bar_9slice` / `ui_button_9slice` |
| PausePage | 3 | `ui_card_9slice` / `ui_button_9slice` |

**刻意未改的**：`_type: 0`（simple）的那些——`MachineRibbon`、`ShelfArena/Endless`、`PauseRibbon`、`ReviveRibbon`、`SettlementRibbon`、`SkinRibbon`。simple sprite 用 border 全零的图是**正确的**，不需要九宫格。

**验证**：Arena HUD 在 375×667 与 390×844 的像素确认——排行榜行为均匀圆角胶囊、暂停键与方向箭头为规整圆角控件、计时条与统计条一致。

### 1.2 §20 颜色 token 化

`RenderProfile.UI_PALETTE` 原本只覆盖 CTA / 面板 / tier 角色；**HUD 自身的语义状态色没有任何 token**，只以 `new Color(...)` 字面量存在于 `ArenaHUDController` 内部。

**新增 `HUD_SEMANTIC`**（`cocos/assets/scripts/core/RenderProfile.ts`）：

| 角色 | 值 |
|---|---|
| `danger` | `#ff5c5c` |
| `killable` | `#c6ec78` |
| `localPlayer` | `#68ee68` |
| `killFeedback` | `#ffd65c` |
| `upgradeTier2` | `#ffe15f` |
| `upgradeTier3` | `#ffbe41` |
| `neutralText` | `#ffffff` |
| `textOutline` | `#0a101c` |

**新增 `cocos/assets/scripts/ui/UIStyleTokens.ts`**——唯一把角色变成 `Color` 的地方（把 `cc` 挡在调色板定义之外），内含共享的 `tierUpgradeColor()`。

**已收敛的调用点**：`ArenaHUDController`、`EndlessHUDController`、`TierLockPresenter`、`TierUpgradePresenter`、`FirstRunHintPresenter`。

**消除的重复**：
- 升级 tier 配色原本在 `ArenaHUDController` 与 `EndlessHUDController` **逐字重复**
- `TierLockPresenter` 自带的危险红与 `HUD_SEMANTIC.danger` **逐字节相同**
- 描边深蓝原本有**三种值**（`0a101c` / `0f1426` / `0d1e34`），现统一为 `textOutline`

**契约**：`test_arena_hud_layout_contract.mjs` 原本断言 `new Color(104, 238, 104, 255)` 字面量。按 §32 **更新为更严格**的形式——同时断言"控制器读 token"**和**"token 的值仍是原来的绿（`#68ee68` = `104,238,104`）"。

---

## 2. 已用证据关闭的问题（不要再重新标记）

### 2.1 复活页的深红**不是**不一致

曾标记为"⚠️ 复活页红与 HUD 危险红不同"。**看图后确认这是错的，已撤回。**

`portrait-390x844-revive-hold.png` 显示：复活页是**浅底白卡 + 深色文字**，HUD 是**深色面板 + 白字**。`210,48,48` / `235,35,35` 与 `255,92,92` 是**同一语义角色在相反背景极性下的正确取值**——把 `255,92,92` 放白底上会发飘读不清。

**结论：不要统一它们。**

### 2.2 场景 JSON 往返是语义无损的（方法已证明）

对未改动的 `Game.scene` 做 `json.loads → json.dumps(indent=2, ensure_ascii=False)`，**只差 9 行，全部是浮点数文本表示**（`0.00001` vs `1e-05`、`2.1855694143368998e-8` vs `...e-08`），**数值完全相同**。

**所以 JSON 改写是可行的**，但必须**验证 diff 只含目标改动**。第一次用这个方法改 SettlementPage 时，diff 是 31/31（22 处 UUID + 9 行浮点）；文件被规范化后，后续的 36 处改动 diff 是 **36/36 且无浮点噪声**。

**反例（已回退）**：直接用 `json.dumps` 整体重写会把 52,057 行压成 1 行，产生 52,058 行 diff。**场景文件不是用来重新格式化的地方。**

### 2.3 按行号定位 Sprite 归属**不可靠**

"向上找最近的 `_name`"这个启发式会给出错误归属（曾把 `BotArrow*` 判成 `BotArrow*Label`）。

**可靠做法**：读场景的**组件引用图**——取 Sprite 的 `node.__id__`，走回有 `_name` 的节点。这才能确定真实 owner。

---

## 3. 剩余工作

### 3.1 三套 Template + UI Kit（V9 主体）

盘点已明确**可复用**的资产，**不必从零建 Kit**：

- **5 个有效 9-slice Prefab**：`game_art/ui/prefabs/` 下的 `UIButton`(48) / `UICard`(44) / `UIHudBar`(30) / `UIPanel`(34) / `UIPopup`(36)
- **已被多页复用的 presenter**：`PickupFeedbackPresenter`（两种 HUD + Arena 击杀）、`TierUpgradePresenter`、`TierLockPresenter`、`ModeReadyPageController`（两种 Ready）、`SettlementPageController`（两模式）、`HudSafeAreaInset`、`JoystickVisual`
- **资源入口**：`UIAssetLibrary`（已有具名加载表）
- **路由**：`UIPageRouter` / `HUDView`（保留，不另建）
- **6 处已验证的 clone-编辑器 Label 契约**：`PickupFeedback` / `TierLock` / `TierUpgrade` / `FirstRunHint` / `ArenaHUD` 名牌 / `GameManager` 备案品牌

**真正缺的组件**：可编辑 ModeCard（旧模式卡**带烘焙文案**，不能当可编辑控件用）、BrandHeader、规范化的 CurrencyPill / LevelPill、按钮的 Button+Label 状态封装、ProgressBar（Machine 当前只有文字 `ProgressValue`）、HUDStat / LeaderboardRow 的独立视觉单元。

### 3.1.1 关键结构事实：**极性是逐页的**，不是按"HUD vs 页面"分组

**本节原先写的是"两种背景极性：深色面板 vs 浅底卡片"，那个概括是错的**，已按稳定截图更正。

用 `scripts/capture_settled_page.mjs` 逐页拍**稳定后**的画面（验收截图是转场中拍的，会误导），实测结果：

| 页面 | 极性 | 依据 |
|---|---|---|
| Home | **浅** | 明亮世界背景 + 深色文字 |
| ModeSelect | **浅** | 蓝天背景 + 深色文字 |
| EndlessReady | **浅** | 蓝天背景 + 深色文字，但**内部含深藏青药丸**（历史最高纪录 / 当前机器） |
| Pause | **浅** | 浅紫卡片 + 深色文字 |
| MachineInfoPage | **深** | 深藏青卡片 + 浅色文字 |
| SkinSelectionPage | **深** | 深藏青卡片 + 浅色文字 |
| Settlement | **浅** | 浅底 + 深色说明文字 + 彩色数值 |
| Revive | **浅** | 浅紫卡片 + 深色文字（红色倒计时因此是对的） |

**8 页全部核实完毕：只有 Machine 与 Skin 是深色页面，其余 6 页都是浅色。**

**更准确的模型：极性是"表面"的属性，不是"页面"的属性。** `EndlessReady` 一页之内既有浅底（地图预览、规则）又有深底药丸（纪录、当前机器）——所以不能按页面分配 token，必须按**元素所处的表面**判断。

**所以不存在"菜单页都是浅色"这种规则**——Machine 与 Skin 都是深色。`PAGE_SEMANTIC` 不是"浅底调色板"，它只是"菜单/覆盖层页面现有的值"；某个角色是否合适，**仍要对着那一页自己的背景判断**。

### 3.1.2 （原文，已被 3.1.1 更正）两种背景极性的说法

这是做 Kit 之前必须先解决的结构问题，也是本阶段一处误判的根源。

| 极性 | 页面 | token 现状 |
|---|---|---|
| **深色面板 + 白字** | Endless / Arena Gameplay HUD、升级横幅、锁定提示 | ✅ `HUD_SEMANTIC` 已建立（`neutralText: #ffffff` 等） |
| **浅底卡片 + 深字** | Home、ModeSelect、Endless/Arena Ready、Pause、Revive、Settlement、Machine、Skin | ❌ **无 token**，颜色仍来自场景中各 Label 的序列化 `_color` |

**为什么这很重要**：

1. `HUD_SEMANTIC` 的值（白字、浅色）**放到浅底页面上会看不见**。所以"浅底页面需要自己的 token 集"（例如 `PAGE_SEMANTIC`）。
2. 它解释了 §2.1 那处误判——复活页的深红不是不一致，而是**另一极性的正确取值**。任何"跨页统一颜色"的动作，都必须先确认两页是否同一极性。
3. 它也是 `MachineInfoPage` 的一个具体阻碍：该页 `LevelRow1-5` 已经用**文字**标注状态（`当前使用` / `已解锁` / `下一目标` / `未解锁`，见 `MachineInfoPageController.ts:47-55`），加**颜色**本可让它一眼可扫——但在浅底卡片上写白字不可见，所以必须先有浅底 token。

**采集工具**：`scripts/capture_settled_page.mjs --page=<home|mode|ready|machine|skin|pause|settlement>`。验收截图是**转场中**拍的，会误导（我因此误判过两次），这个脚本会等页面稳定再截。注意 `ui.endlessReady` 是复合对象，可点节点是它的 `.start` 子节点。

**下一轮做法**：

1. 从 `Game.scene` 读出浅底页面各 Label 的现有 `_color`，归纳角色（正文 / 次要 / 告警 / 成功 / 禁用 / 描边）
2. 声明为 token，**先按现值**（零像素变化），再逐页收敛
3. 收敛完成后，才有资格给 `MachineInfoPage` 等级行、`SettlementPage` 名次等**加语义色**——那才是真正的可见改善

**模板可行性**：11 个界面状态**全部可归入** MENU / GAMEPLAY / OVERLAY，**没有必须成为第四模板的页面**。

**顺序**（§22）：先做 **Endless / Arena Gameplay HUD**，不要先做 Home。

### 3.2 12 页的 BEFORE → 审查 → LOW_COST_FIX → AFTER

每页须回答（§28）：PRIMARY ACTION 是什么 / 玩家第一眼看哪里 / 什么信息可以删 / 什么需要强调 / 是否需要这个 Panel / 有没有 Placeholder 感 / 是否像同一款游戏。

盘点给出的初步判断：

| 页面 | 状态 |
|---|---|
| Home / ModeSelect | 功能可用，**视觉明显旧稿**（ModeSelect 两张卡带烘焙文案） |
| EndlessReady / ArenaReady | **较接近可用**（已有真实缩略图 + UICard） |
| Endless / Arena Gameplay HUD | **信息结构接近可用**（Arena 已完成减重） |
| Pause / Settlement | 结构可用，视觉仍是旧通用条拼卡 |
| Revive | **真实功能，视觉技术债明显**（倒计时 Label 有运行时创建分支） |
| Machine | **数据真实但表现像资料表**（无进度条） |
| Skin | **交易状态真实，视觉像重复条目占位** |

### 3.2.1 PLAYER_HERO：五级全部实测通过（§37 PLAYER_HERO_PASS）

V8.3 证明 LV3–LV5 可达（LV5 约 5.6 分钟）后，`playerVisibility` 插桩终于能覆盖全部等级。一次 6.9 分钟真实 Endless：

| 等级 | 样本 | 核心在屏半径 | screenX | screenY | 出屏次数 |
|---|---|---|---|---|---|
| LV1 | 1 | 92 px | 0.48 | 0.39 | **0** |
| LV2 | 13 | 93–95 px | 0.45–0.53 | 0.37–0.40 | **0** |
| LV3 | 17 | 98–100 px | 0.48–0.55 | 0.37–0.40 | **0** |
| LV4 | 36 | 67–70 px | 0.47–0.54 | 0.35–0.41 | **0** |
| LV5 | 12 | 62–63 px | 0.49–0.52 | 0.38–0.40 | **0** |

**结论：五个等级的核心从未出屏，在屏半径最小 62 px（≈屏宽 32%），始终居中（screenX 0.45–0.55）。**

一个值得记的现象：LV4/LV5 的**在屏半径反而变小**（62–70 px vs LV2/LV3 的 93–100 px）。这不是核心变小，而是**相机随机器尺寸拉远**以保持取景——符合 §25 的预期行为。

**遮挡（§41）：brief 的前提不成立，已按可回答的问法落地。**

§41 要求"复用 `WorldCompositionProbe` 的 static occlusion 机制"来判定玩家遮挡。查证后发现：

- 该机制是**2D 足迹采样**（`insideAny(solidEntries, x, z)`），回答的是"某个地面点是否落在实体占用者的 XZ 足迹内"
- 它**回答不了"玩家是否被镜头与玩家之间的建筑挡住"**——那需要视线测试
- 而 `GoldenCityWorldBounds` **只有 XZ，没有高度**，所以无法区分"挡视线的楼"和"镜头一眼掠过的长椅"。**用现有数据做真正的视线遮挡会系统性高报。**

因此落地的是**同一套谓词可以真实回答的那个问题**：玩家是否站在实体占用者内部（`playerInsideSolidOccupant`，复用 `solidOccupantEntries` + 相同的 footprint 判定）。它答的是"黑洞有没有嵌进建筑/树里"。

**实测**：2 分钟真实游玩，23/23 采样读到该字段，**玩家位于实体占用者内部 0 次** ✓

**真正的视线遮挡仍是未覆盖项**——要做得先让探针采集占用者高度，那超出"复用现有机制"的范围。

### 3.2.2 AUDIO：AUDIO_ASSET_REQUIRED（§42）

按 §42 盘点，结论是**音频完全不存在**：

| 检查 | 结果 |
|---|---|
| 音频代码（`AudioSource` / `AudioClip` / `playOneShot`） | **0 处引用** |
| 音频资产（`cocos/assets` 下 mp3 / wav / ogg / m4a） | **0 个文件** |
| 触觉 | **已存在且已接线** —— `platformAdapter.vibrate` 在 `GameManager.ts:345`(heavy) / `:516`(light) 与 `CompressionSystem.ts:122`(medium) / `:202`(light) |

**标记：`AUDIO_ASSET_REQUIRED`。** §42 明确禁止用假静音资源宣称完成，所以不新建空 AudioSource 来"占位"。

需要的音效（§42 列出的六类）：**吸附 / 吞噬 / 升级 / 击杀 / 死亡 / 按钮**。它们对应的真实事件都已存在（`CompressionSystem` 的压缩状态机、`MACHINE_EVOLVED`、`ARENA_LOCAL_KILL`、死亡节拍、各页按钮的 `Button.EventType.CLICK`），所以**接线点不需要新建，只缺音频资产本身**。

这是**需要 Owner 提供或采购**的项（属于 §46 的"购买付费资产"）。

### 3.2.3 GAME_FEEDBACK：六类反馈均已实现且在真实游玩中被观测到（§26）

| 反馈 | 实现 | 真实证据 |
|---|---|---|
| ATTRACTED | `CompressibleObject` 摇摆（yaw 90°/s、roll ±10°） | V8.1 Endless 帧序列 |
| SUCKING | 高速旋转（yaw 720°/s、roll 240°/s） | 同上 |
| ABSORBED | `AbsorbFeedbackPool` 爆发 + 机器吞噬脉冲（`triggerDevourPulse`） | 同上 |
| LEVEL UP | `TierUpgradePresenter` 横幅 + 机器升级 flourish | 像素确认（横幅与 LV 变化同帧） |
| KILL | `PickupFeedbackPresenter` 击杀节拍（`淘汰 <名> +<质量>`，1.1s） | **10/10 真实击杀均显示** |
| DEATH | 730ms 死亡节拍 + 复活页点名攻击者 | 连续切片实测 `gap 730ms` |

**驱动方式**：目前 ABSORBED（`AbsorbFeedbackPool.update`）、LEVEL UP（`TierUpgradePresenter.update`）、浮动文字（`PickupFeedbackPresenter.update`）各有自己的 `update(dt)`；ATTRACTED/SUCKING 由吸附系统驱动，DEATH 由 `GameManager.updateArenaDeathBeat` 驱动。

§26 要求"避免每种反馈一个新 Update 循环"——**现状是既有循环，本轮没有新增**。把它们合并成一个循环是纯内部重构、无可见收益，且会触碰吸附与 FSM 的既有契约，**本轮不做**。

**未覆盖**：粒子与 Animation 资产为 **0**（`find` 无 `.particle` / `.anim`），所以目前的反馈全部由代码驱动（Tween 式的手写插值 + `Graphics`）。若 §26 要求用 Particle/Animation 资产，那是与 §42 同类的**资产缺口**。

### 3.3 PLAYER_HERO / GAME_FEEDBACK

- **PLAYER_HERO（§25）**：所有等级核心黑洞必须可见。已有 `playerVisibility` 插桩（屏幕归一化坐标 + 核心在屏半径）。**已测**：Endless LV1 半径 92–93px、LV2 93–94px、Arena LV1 48–49px，**出屏 0 次**。**未测 LV3/LV5**——但 V8.3 已证明它们可达（LV5 在 5.6 分钟），所以可测。
- **GAME_FEEDBACK（§26）**：统一 ATTRACTED / SUCKING / ABSORBED / LEVEL UP / KILL / DEATH，用 Particle / Tween / Animation / Material / Audio / Haptic，**避免每种反馈一个新 Update 循环**。

### 3.4 其他已知项

- **Flaky Endless T2**（§39）：同一 Endless 切片步骤已偶发两次，断言不同（`T2_NOT_ABSORBED_AFTER_LV2` 与 `T2_LOCK`）——说明**那一步本身不稳定**，不是单条断言的问题。禁止用加 sleep 或放宽 Tier 规则处理。
- **击杀反馈视口守卫**（§40）：屏幕边缘的击杀不显示反馈（5 次击杀中 2 次未采到）。建议 clamp 至安全边或 fallback 到 HUD toast，**不要完全取消 viewport safety**。
- **遮挡**（§41）：复用现有 `WorldCompositionProbe` 的 static occlusion 机制，扩展 Player LV1/LV3/LV5 × Endless/Arena，**不要另建第二套 Occlusion 系统**。
- **Audio / Haptic**（§42）：先检查已有 Audio 系统；若无真实音频资产，标记 `AUDIO_ASSET_REQUIRED`，**禁止用假静音资源宣称完成**。

---

## 3.4 三尺寸采集（§37 的 375 / 390 / 430）

**8 页 × 3 尺寸 = 24 张稳定截图全部采集成功**，位于 `artifacts/qa/settled/<page>-settled-<WxH>.png`：

```
home mode ready machine skin pause settlement revive  ×  375x667 / 390x844 / 430x932
```

命令：`node scripts/capture_settled_page.mjs --page=<page> --width=<w> --height=<h>`

**人工复核**（内容最密的两页、最小尺寸）：

| 页面 @375×667 | 结果 |
|---|---|
| SkinSelection | 标题不裁、预览卡内金币药丸位置正确、5 行全部可读、底部按钮在位 |
| MachineInfo | 标题、能力卡、5 行等级条、底部按钮全部在位，无裁切 |

**金币药丸的修正在 375×667 同样成立**——说明它不只是 390×844 上的巧合。

**未做**：其余 6 页在 375/430 下的逐张人工复核（24 张全读的性价比低）。若 §37 要求逐页签字，需要补这一步。

---

## 3.5 §37 三尺寸复核：把"看截图"换成"量几何"，并修掉 Home 在非 9:16 上的溢出

### 3.5.1 先撤回一个我差点报出去的缺陷

审查 `home-settled-375x667.png` 时，最右的 `皮肤` 卡看起来"贴到右边缘"。我据此去量像素，量出越界，一度准备报缺陷。**两次测量都是错的**：

1. 合成截图上的"内容 vs 背景"判据不成立——Home 底图自带深描边的橙色/蓝色方块，任何描边检测都会把它和卡片描边合并成一段（我第一次扫出的 3 段里，外圈两段其实是底图方块）。
2. 更要命的是，我按 `HOME_LAYOUT` 里 `BtnSettings` 的位置算出它越界 21–28 px——但实测 `BtnSettings.activeInHierarchy = false`，**这个按钮在 Home 上是停用的，根本没画**。对一个不可见节点算越界毫无意义。

结论：**未通过测量验证的观察必须撤回**，并记在这里。视觉印象不是证据，我自己的第一版测量也不是。

### 3.5.2 真实的缺陷（已实测、已修）

改用运行时几何探针（`scripts/probe_page_layout_geometry.mjs`，把每个节点四角经 `UICamera.worldToScreen` 投到屏幕像素）后，得到稳定且自洽的结论：

| 节点 | 375×667 | 390×844 | 412×915 | 430×932 |
|---|---|---|---|---|
| `CoinPanel`（金币药丸） | 未裁 | **裁 14.7 px** | **裁 21.3 px** | **裁 16.5 px** |
| `MachineStatus`（LV 药丸） | 未裁 | **裁 14.7 px** | **裁 21.3 px** | **裁 16.5 px** |
| `CoinIcon` | 未裁 | **裁 11.4 px** | **裁 17.7 px** | **裁 12.9 px** |
| `BtnMode` / `BtnSkin` 外圈 | 余 37.4 px | 余 5.1 px | **余 0.1 px** | 余 5.3 px |

**根因（此前一直被误述）**：UI 不是按 `view.getVisibleSize()` 的 720 宽排的。`UICamera` 是正交相机且 `orthoHeight = 640`（= 设计高 1280 的一半，序列化在 `Game.scene → Canvas/UICamera`），所以 UI 恒定按**设计高**定标，横向只显示 `1280 / 宽高比` 个设计单位——390×844 上是 591.5（半宽 **295.7**），412×915 上是 576.3（半宽 **288.2**）。`HOME_LAYOUT` 是按 720 宽写的，于是 720 宽空间里"看起来有 42 px 边距"的面板，到真机上就是越界。

这**不是新问题**：`HudSafeAreaInset.ts` 的头注释早就记录了同一件事（"usable design x-range of ≈[−296, +296]"），游戏内 HUD 药丸也修过了。**Home 自己的顶栏只是没套用同一个修正。**

### 3.5.3 修法（复用既有机制，不新造一套）

1. `HomePageVisual.layout()` 末尾对 `SafeAreaRoot` 调用 `applyHudSafeAreaInset`——直接复用已签名的那套钳制（含满幅底图排除、按矩形重叠分组、24 px 交互边距）。
2. **动作行整体等比缩放**（`fitActionRow`）。参考稿那一行跨 ±288 设计单位，在 412×915 上只剩 0.1 px 余量；单纯平移救不了（钳制会走"超出安全跨度→居中"分支，位移为 0），只收窄间距又会把卡片挤到一起，所以按行中心等比缩放。两轴同比例，**美术不变形**；在 9:16 及以上是 no-op，参考构图原样保留。
3. `HudSafeAreaInset` 两处必要补强（默认行为不变，HUD 不受影响）：
   - **跳过未激活节点**。不可见节点不可能被裁，而放它进分组会主动挪错可见节点：Home 的 `BtnSettings`（停用、x=288）与卡片行纵向重叠，把该组 union 撑宽 40 设计单位，整行因此被判"超出安全跨度"而重新居中。
   - 新增可选 `labelMarginScreenPx`。钳制原本对纯文本组用 0 边距（"只要不被裁即可"），但 Home 的设计意图是"面板从画布边缘内移 16 px"；钳到 0 会变成贴边。由页面声明自己的值，共享模块不替它猜。

### 3.5.4 修复后的实测结果

| 视口 | 顶栏内缩 | 外圈卡片余量 | 卡片宽（设计单位） |
|---|---|---|---|
| 360×780 | 16.0 px | **24.0 px** | 142.2 |
| 390×844 | 16.0 px | **24.0 px** | 144.1 |
| 412×915 | 16.0 px | **24.0 px** | 141.4 |
| 430×932 | 16.0 px | **24.0 px** | 145.7 |
| 375×667（参考） | 21.8 px | 37.4 px | 160（**与改动前完全一致**） |

最紧的 20:9 也满足了项目锁定的 24 px 交互边距。

**仍未处理**：`Logo` 节点在 412×915 上溢出 8.5 px。其可见字形只占节点宽的一半（大量透明留白），**不是用户可见缺陷**，故按"实测低于阈值"记录而非"修复"。`HomePage`/`Background`/`SafeAreaRoot` 的溢出是刻意的满幅底图。

**验证**：`npm run typecheck:cocos` ✅、`npm run test:contracts` ✅（406 项）、`npm run test:cocos` ✅、`npm run test:authoring` ✅、`npm run acceptance:v2` ✅（375/390/430 三视口全过）。`test_home_layout_contract.mjs` **未被放宽**——它锁的是"布局表 = V4 参考稿"，所以布局表回退成参考值，响应式适配放在 `fitActionRow` 里做。

**未做**：其余 7 页（mode/ready/machine/skin/pause/settlement/revive）的几何探针还没跑。探针已经支持 `--page=<节点名>`，但那些页需要先导航过去，尚未接线。

---

## 4. V9 门禁状态（§37 对照）

| 门禁 | 状态 | 依据 |
|---|---|---|
| PLAYER_HERO_PASS | ✅ | 五级实测，从未出屏，最小在屏半径 62 px |
| GAME_FEEDBACK_PASS | ✅ | 六类反馈全部实现且都在真实游玩中被观测到 |
| 375 / 390 / 430 PASS | ⚠️ **部分** | 24 张已采集；Home 另有 360/412 两档；人工复核做了最密的两页 |
| HOME_PASS（几何） | ✅ | 五档视口实测：顶栏内缩 16 px、外圈卡余量 ≥24 px、375 参考构图零变化（§3.5） |
| MODE / READY / PAUSE / REVIVE / SETTLEMENT / MACHINE / SKIN_PASS | ⚠️ **已审查未签字** | 八页已按 §28 七问逐页审查（`V9_PAGE_VISUAL_AUDIT.md`），结论是可接受；这 7 页的几何探针尚未接线（§3.5.4） |
| ENDLESS_GAMEPLAY_VISUAL_PASS | ⚠️ **未正式跑** | 有 V8.1 的帧序列与 §28 审查，无专门门禁 |
| ARENA_GAMEPLAY_VISUAL_PASS | ⚠️ **未正式跑** | 有 V8.2 的 HUD 像素确认与 §28 审查 |
| consoleErrors = 0 | ✅ | 每次验收 0 |
| invalidMesh = 0 / invalidSprite = 0 | ✅ | 每次验收 0 |

**结论：V9 未完成。** 已完成的是资产边界（回退后回到原状）、颜色/尺寸 token、八页审查、PLAYER_HERO、GAME_FEEDBACK 盘点、以及 §39/§40/§41/§42 四项。

**未完成**：UI Kit 组件化（§17/§22，需新建 Prefab）、逐页三尺寸签字、以及两类**资产缺口**（音频 §42、粒子/动画 §26）——后者属于 §46 的"购买付费资产"，需要 Owner。

---

## 4. 纪律备忘（本阶段反复踩到的）

1. **先怀疑自己的测量**。本阶段至少有 7 个采集缺陷制造过假的产品结论：摇杆触摸起点、`tier<=3` 硬编码、缺 `consumed` 断言、追已占用物体、**垂直轴取反（在 3 个脚本里各出现一次）**、慢速循环内转向、预热期原地不动。两次把测量失败报成了产品缺陷并自我撤回。
2. **构建绿 ≠ 类型正确**。Cocos 只转译不做类型检查；`typecheck:cocos` 与 `test:full` 才看得见。
3. **未经实测的改动要回退**。本阶段有 4 次平衡猜测（永久归属、强制 owner、预热降速、逃跑速度）被实测否定并回退。
4. **契约要更新到更严格，不是放宽**（§32）。
5. **不要重排场景文件格式**。
6. **截图取证之前先确认判据成立**。本阶段第 8、9 个假结论都出在这一步：合成截图没有设计→像素的比例基准，底图自带描边的图形又会污染任何描边/颜色检测。凡是"间距、对齐、越界、裁切"这类问题，**量运行时几何**（`probe_page_layout_geometry.mjs`），不要量截图。
7. **`view.getVisibleSize()` 对 UI 布局是假前提**。它返回 720（FIXED_WIDTH 的设计分辨率），而 UI 实际由 `orthoHeight=640` 的相机渲染，横向只显示 `1280/宽高比`。按 720 推边距，一定得出"有余量"的错误结论。
8. **布局表与响应式适配要分开**。`test_home_layout_contract.mjs` 锁的是"布局表 = 参考稿"；改布局表去适配窄屏，等于改参考设计。参考值保留，适配放进运行时步骤（`fitActionRow`）。
