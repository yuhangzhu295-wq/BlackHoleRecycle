# V9 COMMERCIAL VISUAL LOCK — 进度与交接

分支：`dev/product-finalization-20260929`
日期：2026-10-07

**状态：V9 未完成。** 本文档记录已完成的部分、已用证据关闭的问题、以及剩余工作，供下一轮冷启动使用。

---

## 1. 已完成

### 1.1 P0 资产边界：全项目 0 处残留

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

### 3.3 PLAYER_HERO / GAME_FEEDBACK

- **PLAYER_HERO（§25）**：所有等级核心黑洞必须可见。已有 `playerVisibility` 插桩（屏幕归一化坐标 + 核心在屏半径）。**已测**：Endless LV1 半径 92–93px、LV2 93–94px、Arena LV1 48–49px，**出屏 0 次**。**未测 LV3/LV5**——但 V8.3 已证明它们可达（LV5 在 5.6 分钟），所以可测。
- **GAME_FEEDBACK（§26）**：统一 ATTRACTED / SUCKING / ABSORBED / LEVEL UP / KILL / DEATH，用 Particle / Tween / Animation / Material / Audio / Haptic，**避免每种反馈一个新 Update 循环**。

### 3.4 其他已知项

- **Flaky Endless T2**（§39）：同一 Endless 切片步骤已偶发两次，断言不同（`T2_NOT_ABSORBED_AFTER_LV2` 与 `T2_LOCK`）——说明**那一步本身不稳定**，不是单条断言的问题。禁止用加 sleep 或放宽 Tier 规则处理。
- **击杀反馈视口守卫**（§40）：屏幕边缘的击杀不显示反馈（5 次击杀中 2 次未采到）。建议 clamp 至安全边或 fallback 到 HUD toast，**不要完全取消 viewport safety**。
- **遮挡**（§41）：复用现有 `WorldCompositionProbe` 的 static occlusion 机制，扩展 Player LV1/LV3/LV5 × Endless/Arena，**不要另建第二套 Occlusion 系统**。
- **Audio / Haptic**（§42）：先检查已有 Audio 系统；若无真实音频资产，标记 `AUDIO_ASSET_REQUIRED`，**禁止用假静音资源宣称完成**。

---

## 4. 纪律备忘（本阶段反复踩到的）

1. **先怀疑自己的测量**。本阶段至少有 7 个采集缺陷制造过假的产品结论：摇杆触摸起点、`tier<=3` 硬编码、缺 `consumed` 断言、追已占用物体、**垂直轴取反（在 3 个脚本里各出现一次）**、慢速循环内转向、预热期原地不动。两次把测量失败报成了产品缺陷并自我撤回。
2. **构建绿 ≠ 类型正确**。Cocos 只转译不做类型检查；`typecheck:cocos` 与 `test:full` 才看得见。
3. **未经实测的改动要回退**。本阶段有 4 次平衡猜测（永久归属、强制 owner、预热降速、逃跑速度）被实测否定并回退。
4. **契约要更新到更严格，不是放宽**（§32）。
5. **不要重排场景文件格式**。
