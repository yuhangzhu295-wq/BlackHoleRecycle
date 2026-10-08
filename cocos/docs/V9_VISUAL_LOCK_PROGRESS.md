# V9 COMMERCIAL VISUAL LOCK — 进度与交接

分支：`dev/product-finalization-20260929`
日期：2026-10-07

**状态：V9 主体已完成，剩两项需 Owner。** 本文档记录已完成的部分、已用证据关闭的问题、以及剩余工作，供下一轮冷启动使用。

**仅剩**：音频资产（§42，需购买）与剩余 6 个 Kit prefab 的页面消费（需重构已签字页面，属设计决策）。

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

#### 已交付：7 个新 Kit prefab（`npm run verify:machine-archive` 有运行时证据）

`UIModeCard`(5 节点，含**可编辑** Title/Subtitle/BadgeLabel 三个真 Label) / `UIBrandHeader` / `UICurrencyPill` / `UILevelPill` / `UIProgressBar`(Track+Fill 双 Sprite) / `UIHudStat` / `UILeaderboardRow`。全部位于 `game_art/ui/prefabs/`，由 `scripts/generate_ui_kit_prefabs.mjs` **生成而非手写**——`.prefab` 是对象图，`__id__` 引用与"每节点一个 `cc.UITransform` + 一个 `cc.PrefabInfo`"的计数必须严丝合缝，而 Cocos 对不上时只报静默导入失败。生成器同时是纹理 uuid 变化的唯一同步点。

已注册进 `UIAssetLibrary.UI_PREFAB_PATHS`（7 个新 key），并扩展 `test_ui_prefab_library_contract.mjs` 锁住各 Kit 的槽位名与关键形状（ModeCard 必须有 3 个 Label，否则又变成"烘焙文案"那个坑；ProgressBar 的 Fill 颜色必须与 Track 不同，否则显示不出进度）。契约现报 **12 个真 prefab、9 张纹理、21 条声明路径**。

**不生成"按钮的 Button+Label 状态封装"**：`UIButton` 已存在且已被 Ready 页消费，再加一层封装只会产生第二个真源。

**7 个 Kit 里只有 `UIProgressBar` 被页面消费，其余 6 个尚未接线**——但"已声明未加载"这个缺口已用运行时证据关掉：`npm run verify:ui-kit` 断言 12 个 prefab 与 9 张纹理全部**驻留**（`uiAssets.boundPrefabs` / `boundFrames` 齐全、`lastError` 为 null）。只靠契约（文件存在 + 结构合法）和构建（被打包）都证明不了 Cocos 真的**导入**成功——对象图被 Creator 拒绝时 prefab 只是从 bundle 里消失，而库会把调用方静默降级。这个门禁做反向证明时还暴露一个细节：**一个 prefab 加载失败会让整批都报缺失**，所以它对单点失败同样敏感。

#### 顺带修掉一个真实缺陷：机器档案页永远显示 0 kg

接线 ProgressBar 时发现：`MachineInfoPageController` 只从**实时场景**的 `BlackHoleMachine` 取质量，而该页从 Home 进入——那里根本没有机器实例。于是"当前质量"和"下一等级"永久显示 0 kg / 0，**而同一页的等级行读的是存档**，页面自相矛盾。存档里本来就有 `machineMass`（`setMachineProgression` 在每次 `addMass` 时写入），所以改为：场景里有机器就用它，否则回落到存档。

这条有真实游玩证据（`scripts/verify_machine_archive_progress.mjs`）：跑 30s 真实 Endless 写入 `machineMass=3945`，随后页面显示 `3,945 kg`，进度条填充 131.5/500 = 26.3% = 3945/15000，与文字完全一致。该门禁**先断言"这一局真的写入了非零质量"**，否则整段检查是空洞的——第一版用固定绕圈驱动（摇杆偏移 33px，低于标定的 ~88px），玩家几乎没动、质量始终为 0，门禁如实报了 FAIL 而不是放过。

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
| **浅底卡片 + 深字** | Home、ModeSelect、Endless/Arena Ready、Pause、Revive、Settlement、Machine、Skin | ⚠️ **部分**：实测场景里 **51 种 Label 颜色只有 6 种有 token**；其中 **11 种是 token 的近重复**（同角色的肉眼不可辨漂移，ΔRGB ≤27/765），已用 `PAGE_TEXT_DRIFT` + `applyPageTextTokens` 在运行时归并到 token，并由 `verify:page-tokens` 断言。**其余 40 种距离 ≥33，是真正不同的颜色**（危险红、金色、蓝色），归并它们属于重新设计，需 Owner 决定 |

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

### 3.2.2 AUDIO：已接线并有机器证据；**资产是临时合成音，授权资产仍需 Owner**（§42）

原状态是 `AUDIO_ASSET_REQUIRED`——音频**完全不存在**（0 处代码引用、0 个音频文件）。现在音频路径已经打通并有端到端证据，但**必须分清两件事**：

| | 状态 |
|---|---|
| 音频代码（`AudioSource` / `AudioClip` / `playOneShot`） | ✅ 已实现（`AudioAssetLibrary` + `AudioDirector`） |
| 六类音效（吸附/吞噬/升级/击杀/死亡/按钮） | ✅ 六个真实可听的 WAV，`test_audio_asset_contract` 逐个断言"非静音 + 格式正确 + 音高走向符合设计" |
| 播放路径 | ✅ `verify:audio`：30s 真实游玩 60 次吸收 → **68 次播放、0 次缺资源** |
| 静音开关 | ✅ 尊重存档里**早已声明却从未被读取**的 `settings.sfx`；预置已静音存档实测 65 次吸收 → **0 次播放** |
| 触觉开关 | ✅ 同样接上 `settings.vibration`（此前触觉无视该字段） |
| **授权/商用音频资产** | ❌ **仍需 Owner 采购**（§46）。当前是脚本合成的临时音效 |

**为什么是合成音而不是静音占位**：§42 禁止"用假静音资源宣称完成"。合成音是**真实发声**的，所以它不违反那条；但它是**临时资产**，不是授权素材。`AudioDirector.getDiagnostics()` 因此把 `missingPlays` 与 `plays` 并列报告——一个没有音频的构建不能看起来和一个正常构建一样。

**接线方式**：音效映射集中在 `AudioDirector` 一处（订阅事件总线），`GameManager` / `CompressionSystem` 不需要长出任何 `if (audio)` 分支。为此补了两个**当时并不存在的领域事件**：`OBJECT_ABSORBED`（在真正完成一次吸收处发出）与 `ARENA_LOCAL_DEFEATED`（在死亡节拍开始处发出）。其余四类直接复用已有事件：`COMPRESSION_STARTED`、`MACHINE_EVOLVED`、`ARENA_LOCAL_KILL`、以及 UI 按钮事件（显式白名单，不用后缀匹配，免得新玩法事件意外变成按钮音）。

音效与**已有的触觉在同一批时刻**配对：`CompressionSystem` 的 medium/light 与 `GameManager` 的 heavy/light 四个调用点。

**顺带发现并修掉**：存档里 `settings: { music, sfx, vibration, quality }` 四个字段**全项目无人读取**。我一开始给静音加了顶层 `audioMuted` 字段——那是给同一个事实造了第二个真源，已撤回，改用 `settings.sfx`；`settings.vibration` 也一并接上。

**仍未做**：没有正式的设置页，所以玩家目前**没有开关音效的入口**。`HomePageController` 的注释已经说明了原因（设置按钮没有 Creator 页面支撑时不能作为灰色假按钮出现），所以我没有把齿轮按钮改造成静音开关——那只会用一个图标不匹配的按钮换一个假设置页。开关入口需要一张作者产出的设置页，属设计/Owner 项。

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

**已由几何门禁取代**：逐张人工复核性价比低，且本阶段证明「看截图」在间距/裁切类问题上会给出错误结论。改为 `npm run verify:layout` 对 8 页 × 2 档做机器断言（§3.5.7），另有两个 gameplay 视觉门禁（§3.5.8）。

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

**`Logo` 的溢出已用贴图实测证清**：`home_logo.png` 是 600×180，**不透明图形只在 x 183..532**（宽 350，占贴图 58%；左留白 183、右留白 67）。Logo 节点尺寸就是整张贴图的 600×180，所以 412×915 下被裁的 8.5 px **全部是透明留白**——可见字形实际横跨屏幕 122..372 px，左侧还有约 130 px、右侧约 40 px 余量。因此这不是用户可见缺陷，但**不是"放宽断言"**：门禁改为对不透明矩形断言（`TRANSPARENT_PADDING` 记录了测量值，可复核），而不是把这一页从断言里摘出去。`HomePage`/`Background`/`SafeAreaRoot` 的溢出是刻意的满幅底图。

**验证**：`npm run typecheck:cocos` ✅、`npm run test:contracts` ✅（406 项）、`npm run test:cocos` ✅、`npm run test:authoring` ✅、`npm run acceptance:v2` ✅（375/390/430 三视口全过）。`test_home_layout_contract.mjs` **未被放宽**——它锁的是"布局表 = V4 参考稿"，所以布局表回退成参考值，响应式适配放在 `fitActionRow` 里做。

### 3.5.5 其余 7 页：同一根因，**但同一套钳制修不了**（已实测）

探针已接上导航（`--page=<home|mode|ready|machine|skin|pause|settlement|revive>`，默认跑最紧的 412×915）。412×915（可用半宽 288.2）实测：

| 页面 | 被裁节点 | 越界 | 面板设计宽 |
|---|---|---|---|
| mode | `BtnBack` | **左 37.0 px** | — |
| mode | `BtnArena` / `BtnEndless` | 左右各 12.0 px | 610（`_type=0` 简单图） |
| machine | `MachineCard` | 左右各 29.9 px | 660 |
| skin | `SkinPageCard` | 左右各 29.9 px | 660 |
| settlement | `SettlementCard` | 左右各 29.9 px | 660 |
| settlement | `SettlementCoinLeft` / `Right` | 各 7.7 px | — |
| pause | `PauseCard` | 左右各 15.6 px | 620 |
| revive | `ReviveCard` | 左右各 15.6 px | 620 |
| ready | `StatPanelTop` / `StatPanelBottom` | 各 1.3 px | — |

**这更像一个系统性问题，而不是 7 个独立决策**：除 mode 外，每页都有一块 610–660 设计宽的主面板，而 412×915 只能显示 576.3。经查，`MachineCard` / `SkinPageCard` / `PauseCard` / `SettlementCard` / `ReviveCard` **五块面板共用同一个 `_type=1`（9-slice）资源**（`spriteFrame` uuid `4307ce08-910…`），所以收窄它们的宽度对边框是无损的。

**但仍不是一次批量改**：`MachineCard` 内部的等级行本身宽 564 设计单位，比收窄后的卡片（531.6）还宽——只收卡片会让行戳出面板。所以每页都要像 Home 的 `fitActionRow` 那样，**把面板和它的内部行一起做响应式**，规则由该页自己的构图决定。mode 的两张大卡是 `_type=0` 简单图，收窄会压坏美术，属于设计决策。

已目视确认不是"刻意的满幅面板"：412 下 `BtnBack` 被切掉一半（左上角只剩一块残片），两张模式大卡的圆角和右侧白色箭头指示器被切；`MachineCard` 的圆角被切、退化成满幅矩形，而 375 下圆角是可见的——**同一页在不同设备上结构不一致**。

**我试过的最省事做法，已回滚**：给这 7 个页面的控制器各加一行 `applyHudSafeAreaInset(this.node)`（放在 `onEnable` 末尾，晚于各自的 `applyLayout`）。412×915 实测结果：

- `BtnArena`/`BtnEndless` **一点没变**（仍各裁 12 px）——卡片比屏幕还宽，钳制只能平移，会走"超出安全跨度→居中"分支，位移恰好为 0；
- `BtnBack` 只从 37 px 改善到 4.9 px；
- **`Header` 被新引入裁切 4.9 px**（此前完全正常）——它与 `BtnBack` 矩形重叠被归为一组，一起右移后被推出右边缘。

即：**没有修好任何一页，却弄坏了一页**，故整体回滚（`git checkout` 7 个控制器文件，已确认 mode 回到基线且 `Header` 恢复正常）。

**正确做法**（与 Home 同构，逐页做，不要无脑套）：每页需要"先按可用设计宽收缩面板及其内部行 → 再钳制"两步，收缩规则由该页自己的构图决定。

### 3.5.6 已修 4 页 / 3 页被设计决策阻塞 / 1 页低于阈值

**已修并实测通过**（`PageSafeArea.ts` 提供 `pageSafeHalfWidth` / `clampNodeIntoSafeSpan` / `fitNodeIntoSafeSpan` / `fitSlicedPanelToSafeSpan` 四个原语，每页自己声明构图规则）：

| 页面 | 修法 | 412×915 结果 |
|---|---|---|
| home | 钳制 + 动作行等比缩放 | 无裁切，卡片余量 ≥24 px |
| mode | `BtnBack` 单节点钳制 + 两张卡等比缩放 | 无裁切；`BtnBack` 24 px、卡片 24 px |
| machine | 卡片 + `CurrentPanel` + 5 条等级行收窄（sliced 无损） | 卡片 x 16..396（531.6），行 507.6，行文字 333.6 在行内 |
| skin | 卡片 + `PreviewPanel` + 5 张皮肤卡收窄 | 卡片 531.6，内卡 507.6，标签最大 323 在卡内 |
| pause | `PauseCard` 收窄（sliced 无损） | 卡片 x 16..396，缎带在内 |
| settlement | 卡片 + 统计行 + 排行行收窄；两枚金币等比跟随 | 卡片 531.6，缎带 492 在卡内 |
| revive | `ReviveCard` 收窄（sliced 无损） | 无裁切 |

mode 的 `BtnBack` **必须单节点钳制**，不能走 `applyHudSafeAreaInset`：它与 `Header` 纵向重叠 4 设计单位会被归为一组，整组重新居中后按钮仍被裁、而原本正确的 `Header` 被推出右边缘（这正是 §3.5.5 那次回滚的原因）。pause/revive 只需收窄卡片一处——这两页所有兄弟节点都 ≤500 设计宽，最宽的 `ReviveAccentOrange`(500) 仍在收窄后的 509.2 面板内。

**⚠️ 更正**：上一版这里写着 machine / skin / settlement "被字号决策阻塞、不能机械修"。**那个结论是错的，已作废。** 我当时按**场景里的作者宽度**判断（`LevelRowText1` 记为 530 设计单位，宽于收窄后的行），但那些 Label 是 `overflow=NONE` **自动撑开**的，运行时实测只有 **467 设计单位**（333.6 px）——完全放得下。又是同一条教训：量运行时，不要按作者表推断。

修正后这三页可修且已修：面板收窄到 16 px 边距（与作者注释里"面板从画布边缘内移 16px"一致），内部行/卡片再内缩 12 设计单位。

**`ready` 也已修**：`BtnBack` 设计 x=−285，可用半宽 288.2 → 距边仅 2.3 px，按交互规则钳到 24 px；`StatPanelTop`/`StatPanelBottom` 580 设计宽（±290）各裁 1.3 px，收窄到 531.6 / 16 px 边距。`MapPreview`/`PreviewCard` 停在 5.8 px **未动**——它们由 `MapPreviewGraphic`（Graphics）绘制，改节点尺寸会裁掉绘制内容而不是缩放它；两者未被裁切，按项目规则"面板只需不被裁"保留。

**至此 8 页全部无裁切。**

**面板用 16 px 而不是 24 px 交互边距**：24 px 是"交互元素"的锁定规则，面板只是背景，只需不贴边；对装饰面板套用交互边距会把它收得比必要更窄，并在一本已放得下的页面上无谓改动 375 参考构图（实测：用 24 px 时 machine 卡片在 375 从 660 收到 627.5；用 16 px 后为 658.2，即 0.9 px 的差别）。所以 `PageSafeArea` 提供 `pageSafeHalfWidth`（交互）与 `pagePanelHalfWidth`（面板）两个入口。

**简单图不缩放**：`SettlementRibbon`(492) / `MachineRibbon`(500) 是 `_type=0`，收窄会压坏美术——它们本来就在收窄后的面板内（492 < 531.6），无需处理。结算页两枚金币也是简单图，按面板收窄系数**等比跟随**位置（`trackPanelNarrowing`），保持它们在卡片角上的相对位置。

**已全部完成**：machine / skin / settlement 三页已修并纳入 `verify:layout` 断言（见下表）。

### 3.5.7 几何已落成门禁：`npm run verify:layout`

一次性的测量会腐坏——后来任何一次布局改动都可能把已修的页面悄悄推回屏幕外。所以把它变成可重复的门禁（`scripts/verify_page_layout_geometry.mjs`，共享逻辑在 `scripts/lib/page_layout_geometry.mjs`）：

- **断言全部 8 页**在 **375×667 / 390×844 / 412×915** 三档下无节点被裁（24 项）。375 是布局表所依据的 16:9 参考档，用它顺带抓住"修窄屏却改坏了参考稿"；390 是最常见的 iPhone 比例、也是验收截图用的尺寸；412 是最紧的 20:9。
- **余量阈值按项目自己的规则分层**：交互节点（带 `Button`）要求留白 ≥8 px（项目锁定规则是 24 px，8 px 是保守底线）；非交互的面板与文本**只要求不被裁**。一开始我用了统一的 8 px 底线，那比项目规则更严，会把一个 5.8 px 边距的装饰面板也判红。全屏底图（720 宽）单独归类，它们本就该被裁。
- 空节点列表会**显式失败**（`FAIL_LAYOUT_PROBE_EMPTY`）。本阶段出过一次 `cc.UITransform` 取不到导致遍历为空、却读成"无越界"的假绿，这条断言就是为了堵住它。

运行：`npm run verify:layout`（可选 `--pages=home,mode` 只跑部分）。

### 3.5.8 两个 gameplay 视觉门禁已补上：`npm run verify:gameplay-visuals`

此前 `ENDLESS/ARENA_GAMEPLAY_VISUAL_PASS` 一直挂着"未正式跑"——**数据其实一直被采集，只是没人断言**：桥里已有 `ui.safeArea`/`ui.pills`/`ui.pillPanels`（RT-08 药丸投影）和 `playerVisibility`（归一化屏幕位置 + 屏上半径），而验收脚本一个都没读。现在补上门禁：真实跑 Endless 与 Arena，全程采样，断言

- **HUD 任何节点都不被裁**（含瞬时节点：升级横幅、锁定提示条、机器人方向箭头、排行榜行）；
- **玩家始终在屏内**且屏上半径 ≥40 px（§37 在 375 上实测最差 62 px；40 是回归底线而非复述测量值）。

补这个门禁当场抓出**三个此前未记录的缺陷**，全部同一类（按 720 宽授权 / 按屏幕边缘定位）：

| 缺陷 | 实测 | 修法 |
|---|---|---|
| 升级横幅 | `BANNER_WIDTH = 600` 设计宽 → 412 下各裁 **8.5 px** | 按 `pagePanelHalfWidth` 运行时收窄（sliced 无损） |
| 锁定提示条 | `CHIP_WIDTH = 210`，跟随物体投影点 → 右裁 **29 px** | 改为**钳到安全边**，不再在近边时直接隐藏 |
| Arena 右侧机器人箭头 / 排行榜 | `BotArrowRight` 右裁 **12 px**、`TopRow*` 各 1.9 px | 见下 |

**锁定提示条那处是 §40 的同类问题**：它的守卫只检查**锚点**是否在边缘内，没检查提示条自身宽度；而且注释还写着"与拾取反馈同一套守卫"——但拾取反馈在 §40 已改成钳到安全边，注释早已腐坏。现在两边一致：钳到安全边，不丢反馈。

**Arena 箭头那处是一个顺序 bug**：`updateMatch` 把钳制放在**开头**，而箭头和排行榜行是在它**后面**才被激活的；钳制又跳过未激活节点（我为修 Home 分组问题加的），于是这些节点在每一帧真正需要钳制时都被跳过，靠近边缘的箭头就永久停在框外 12 px。钳制移到 `updateMatch` **末尾**即解决。同一个"顺序"陷阱本阶段已踩到第三次（Home 的 layout-before-clamp、mode 的 clamp-before-applyLayout、这次的 clamp-before-activate）。


### 3.5.9 页面文字颜色的 token 归并：`npm run verify:page-tokens`

§17/§22 的「样式标记」此前只做了一半：HUD 走 `HUD_SEMANTIC`，而**页面的文字颜色仍直接序列化在场景里**。实测 `Game.scene`：**51 种不同的 Label 颜色，只有 6 种与 token 相同**。

其中 **11 种是 token 的近重复**——同一语义角色被反复微调，例如正文紫有 `#4e3a68` / `#463562` / `#4a3863` / `#493763` / `#4d366d` 五个值，相互距离 ≤27/765，肉眼不可辨。这类是**漂移**，不是意图。已用 `PAGE_TEXT_DRIFT` 列出（每个值都注明来自哪个节点）并在页面可见时由 `applyPageTextTokens` 归并到 token，使 token 文件成为**实际绘制颜色**的来源。

**其余 40 种不动**：它们与最近 token 的距离 ≥33，是真正不同的颜色（危险红 `#eb2323`/`#d23030`、金色、Arena 的蓝与绿）。归并它们等于重新设计配色，需要 Owner 决定，所以门禁只断言漂移已清除。

**挂载点踩了一个坑**：我先把它挂在 `UIPageRouter.show()` 上，以为是中心点——结果门禁立刻报出 skin 页仍有 `SkinName_* = #463562`。查下来 **`UIPageRouter.show()` 全项目没有任何调用者**（它的 `pages` 是编辑器拖入的序列化属性），真正切换页面的是各控制器与 `HUDView.showScreen`。钩子挂在死路径上，等于没做。改为逐控制器 `onEnable`（与布局钳制同一套模式）后才真正生效。

**门禁本身就是反向证明**：在补上逐控制器挂载之前，它以 `SkinName_1=#463562` 真实失败过，比合成注入更强。`verify:page-tokens` 从 `RenderProfile.ts` 解析漂移表而非复制一份，所以脚本与源码不会各自腐坏；并断言每页「检查到的标签数 >0」，避免空遍历被读成「干净」。

**门禁带覆盖度断言，防止"没出现"被读成"没被裁"**：Endless 必须真的观察到升级横幅与锁定提示条（新存档 LV1 打 1v7 通常在窗口内升不到级，所以 Arena 只断言 HUD 本体被投影过）。加这条之前做过一次反向证明——关掉横幅收窄后门禁**没有失败**，因为那一局根本没触发升级；补上覆盖度断言后同样的关掉操作立刻以 `TierUpgradeBanner_1 L8.5 R8.5` 失败。

---

## 4. V9 门禁状态（§37 对照）

| 门禁 | 状态 | 依据 |
|---|---|---|
| PLAYER_HERO_PASS | ✅ | 五级实测，从未出屏，最小在屏半径 62 px |
| GAME_FEEDBACK_PASS | ✅ | 六类反馈全部实现且都在真实游玩中被观测到 |
| 375 / 390 / 430 PASS | ✅ | `npm run verify:layout` 在 **375×667 / 390×844 / 412×915** 三档对 8 页逐节点断言无裁切（24 项全过）；24 张稳定截图仍在 `artifacts/qa/settled/`（§3.5.7） |
| HOME_PASS（几何） | ✅ | 五档视口实测：顶栏内缩 16 px、外圈卡余量 ≥24 px、375 参考构图零变化（§3.5） |
| MODE_PASS（几何） | ✅ | 五档视口无裁切；`BtnBack` 与两张模式卡均回到 24 px 交互边距（§3.5.6） |
| PAUSE_PASS（几何） | ✅ | 412×915 无裁切，卡片 x 16..396、内部缎带在卡内（§3.5.6） |
| REVIVE_PASS（几何） | ✅ | 412×915 无裁切（§3.5.6） |
| MACHINE / SKIN / SETTLEMENT_PASS（几何） | ✅ | 412×915 无裁切；卡片 531.6、内部面板 507.6（§3.5.6） |
| READY_PASS（几何） | ✅ | 412×915 无裁切；`BtnBack` 24 px、状态面板 16 px 边距（§3.5.6） |
| 逐页几何门禁 | ✅ | `npm run verify:layout`：8 页 × 2 档全部通过（§3.5.7） |
| UI Kit 组件化（§17/§22） | ✅ | 7 个新 prefab 生成 + 注册 + 契约锁定；`UIProgressBar` 已在机器档案页真实运行（§3.1） |
| 机器档案数据源 | ✅ | 页面改为读存档，`npm run verify:machine-archive` 以真实游玩写入的 3945 kg 验证（§3.1） |
| ENDLESS_GAMEPLAY_VISUAL_PASS | ✅ | `npm run verify:gameplay-visuals`：全程采样 0 裁切、玩家半径 ≥99 px、升级横幅与锁定提示条均被触发（§3.5.8） |
| ARENA_GAMEPLAY_VISUAL_PASS | ✅ | 同上：0 裁切、玩家半径 ≥52 px、HUD 本体被投影验证（§3.5.8） |
| consoleErrors = 0 | ✅ | 每次验收 0 |
| invalidMesh = 0 / invalidSprite = 0 | ✅ | 每次验收 0 |
| AUDIO（§42） | ⚠️ **路径已通，资产待购** | `verify:audio` + `test_audio_asset_contract` 覆盖播放与静音；**授权音频资产仍需 Owner**（§3.2.2） |
| 三平台构建 | ✅ | `build:web` 269 文件 / `build:wx` 273 文件（AppID 已配置）/ `build:tt` 272 文件，三者均含 `world-construction` + `world-city` 两个分包（§3.6） |
| 发布预检 | ❌ **阻塞在 Owner 项** | `npm run preflight:release` 如实失败：`bytedance-mini-game requires a real AppID for release preflight; found testappId`。微信侧已配置真实 AppID |

**结论：V9 主体已完成。** 资产边界（回退后回到原状）、颜色/尺寸 token、八页审查、PLAYER_HERO、GAME_FEEDBACK 盘点、§39/§40/§41/§42、8 页响应式布局、UI Kit（7 个新 prefab）、两个 gameplay 视觉门禁均已交付并有机器证据。

**仅剩两项，都不是本轮能单方面完成的**：

1. **授权音频资产**（§42）：播放路径、六个音效、静音开关均已实现并有机器证据，但当前音效是**脚本合成的临时资产**；商用授权素材仍需 Owner 采购（§3.2.2）。
2. **剩余 6 个 Kit prefab 的页面消费**：它们是通用件，而现有页面各有定制美术，替换等于重构已签字页面并改变观感——属设计决策。其加载路径与已被消费的 `UIProgressBar` 完全相同，且 7 个的运行时驻留都由 `verify:ui-kit` 逐个断言。

**粒子/动画资产**（§26）同属 §46 的「购买付费资产」，需要 Owner。

### 3.6 三平台构建：本轮全部重跑

V9 改动了 UI（7 个新 prefab、5 个页面控制器、`HUDView`、颜色 token 归并），而此前只验证过 web-mobile 一条构建路径。小游戏包可能失败在 web 成功的地方（包体、分包、API 差异），所以三条都重跑了：

| 平台 | 结果 | AppID |
|---|---|---|
| web-mobile | ✅ 269 文件 | n/a |
| wechatgame | ✅ 273 文件 | `wx6ac3f5090a6b99c5`（已配置） |
| bytedance-mini-game | ✅ 272 文件 | `testappId`（**占位符**） |

三者都产出 `world-construction` + `world-city` 两个分包，启动场景与 boot 区域一致。

`npm run preflight:release` 以 **EXIT=1 如实失败**，且信息精确：`bytedance-mini-game requires a real AppID for release preflight; found testappId`。也就是说发布路径上唯一的阻塞是**抖音 AppID 未配置**——这是 §35 的"不要猜 AppID"正确执行的结果（项目用占位符而不是编一个值），属 Owner 项。

**已完成且已实测**：**全部 8 页**（home / mode / ready / machine / skin / pause / settlement / revive）在 375×667 / 390×844 / 412×915 三档下均无节点裁切，Home 另测 360×780 与 430×932 共五档；375 参考构图保留（§3.5.4、§3.5.6、§3.5.7）。

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
9. **"同一个根因"不等于"同一套修法"**。7 个页面与 Home 同根因，但把 Home 用过的钳制批量套上去，一页没修好、还新弄坏一页（§3.5.5）。凡是"顺手批量套"的改动，**必须逐对象量前后**（本阶段探针已支持 `--page=`），没改善就整体回滚，不要留着"至少部分改善"的改动。
