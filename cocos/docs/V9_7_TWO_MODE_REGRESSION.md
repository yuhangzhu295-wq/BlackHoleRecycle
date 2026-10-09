# V9.7 — 两条模式玩法回归（含门禁可靠性发现）

- 目的：在**不改平衡**的前提下，对 Endless 与 Arena 做一次真实运行时回归，并如实记录门禁本身的表现。
- 门禁：`npm run verify:gameplay-visuals`（CDP 触控驱动真实 WebGL 运行时，采样 HUD 几何 + 英雄可见性）
- 构建：`cocos/build/web-mobile`（02:00–02:17 产物，本轮未改任何玩法/数值/布局）
- 结论：**没有发现玩法或平衡回归的证据**；但**门禁本身不稳定**，且发现一个**真实的间歇性 HUD 溢出**。两者都必须如实记录，不能把一次 PASS 当成通过。

---

## 1. 本次没有改动任何玩法数值

`git diff` 对 `cocos/assets/scripts` 的改动仅为**注释**（V9.6 的死数据标注）与本次的门禁脚本修正。没有任何 `GameConfig` 数值、平衡参数、模式流程、AI 规则的变更 ⇒ 按"无证据不动平衡"的要求，本轮**不动平衡**。

---

## 2. 玩法回归证据

| 项 | 结果 |
| --- | --- |
| Endless 匹配可跑满观察窗 | ✅ 28–139 samples（`levels seen 1,2` / `1,2,3`） |
| Arena 匹配可跑并自然进入 REVIVING | ✅ 5–131 samples |
| 英雄在框内、不低于 40 px | ✅ 全部 run PASS（Endless min 98.8–99.5 px；Arena min 52.5 px） |
| 英雄横向/纵向留白 0.04 | ✅ 全部 run PASS |
| HUD 覆盖：`TierLockChip`、`TimerValue`、`Joystick` 被真实投影过 | ✅ |
| `npm run test:contracts`（含 arena AI、mode-ready flow、suction progression、collectible production、traffic/resource replenishment 等 28 项） | ✅ PASS |
| `npm run typecheck:cocos` | ✅ PASS |

⇒ **两条模式都能真实跑起来、HUD 覆盖到位、英雄可找到、玩法契约全绿。没有回归证据。**

---

## 3. ⚠️ 门禁本身不稳定（必须先说，否则 PASS 会被高估）

同一个构建（02:00–02:17 产物）上连跑 **12 次** `verify:gameplay-visuals`：

| 失败项 | 出现次数 | 说明 |
| --- | ---: | --- |
| `Endless exercised ^TierUpgradeBanner_ (0 samples)` | ≥3 | 覆盖类断言 |
| `no ArenaHUD node is clipped at any sample` | 2 | 见 §4，真实缺陷 |
| 未识别（我的过滤器丢了明细） | 1 次报"2 assertions"，Arena 该轮只采到 5 samples | 未能定位 |

**⇒ 单次 PASS 对 Arena HUD 是弱证据。** 这份记录不把某一次 PASS 当作"两条模式 HUD 干净"的证明。

### 3.1 已修：横幅覆盖断言读错了快照路径（根因已实测确认）

**根因**：`tierUpgrade` 的计数器位于 **`ui.tierUpgrade.<endless|arena>.emittedCount`**
（桥把它按 HUD 分了两份，不是一个扁平对象）。而门禁读的是**顶层** `live.tierUpgrade` —— 该键**根本不存在**，
`Number(undefined ?? 0)` 恒为 0。

于是门禁注释里写的「桥自己的 emitted 计数器说明横幅何时出现，几何就在那一刻采样」
**从未执行过一次**：横幅只能靠周期性采样（偶数迭代，约 2.4 s 一次）偶然落进它的存活窗口。
实测该横幅**存活不足 900 ms**（探针 +0 ms / +300 ms 能看到节点，+900 ms 已经没了），
远小于 2.4 s 的采样间隔 ⇒ 约 1/3 的概率被撞上，这就是"12 跑 6 败"的来源。

**修法**（两处，均已实测）：
1. 路径改为 `ui.tierUpgrade[<mode>].emittedCount`；
2. 计数器一旦增加，就在**横幅整个存活窗口内逐迭代采样**（2.2 s），而不是只采一帧 ——
   因为 presenter 是「先建容器、下一帧才激活」，单帧采样可能采到未激活的节点。

**修后实测**（`node scripts/probe_tier_banner.mjs`）：
```
t=10 level=2 emitted=1 suppressed=0 active=1
emitted=1 +0ms   -> 1 banner node(s) of 24
emitted=1 +300ms -> 1 banner node(s) of 24
emitted=1 +900ms -> 0 banner node(s) of 23
```

**走过的两次弯路（记录以免重犯）**：
- 第一次以为竞态在「种子取自循环首次快照」→ 改成比赛前取种子。**是真实改进但不是根因**。
- 第二次以为竞态在「检测太晚」→ 加了 2.2 s 逐帧窗口。**仍失败**，由此**反证**了采样时序不是原因，
  才回头去核对快照路径。
- 期间我的探针**复制了门禁的同一个错误路径**，一度让我以为"这一局根本没升级"。用
  `scripts/dump_qa_snapshot.mjs` 直接把快照结构打出来才定位。**同一个路径错误被复制了两次** —— 这正是它值得留一个 dumper 的原因。

顺带新增 `TierUpgradePresenter` 的 `suppressedCount` / `lastSuppressReason`（进 QA 快照）：
`show()` 在宿主未激活或缺模板 Label 时会**静默 return**（连 `emittedCount` 都不动），
从外部看与"没发过横幅"完全一样。有了这两个字段，"被抑制"与"画了但没采到"才分得开。

---

## 4. 真实缺陷：Arena 排行榜面板间歇性溢出左边缘 12 px

**观测**（2 次，同一构建）：

```
LeaderboardPanel w236 x-12..156.8 L12 R0
TopRow1 w208 x-1.9..146.7 L1.9 R0
TopRow2/3/4 同上
```

即 `LeaderboardPanel` 左边缘超出屏幕 **12 px**，四行标签超出 **1.9 px**（面板比行宽 28 设计单位，换算后正好是两者差值 ≈10 px，互相印证）。

**这不是随机的像素噪声，场景里能查到来源**（`Game.scene`）：

| 节点 | `_lpos.x` | 宽 | 锚点 | 设计空间左边缘 |
| --- | ---: | ---: | --- | ---: |
| `LeaderboardPanel` | −226 | 236 | 0.5 | **−344** |
| `TopRow1..4` | −226 | 208 | 0.5 | −330 |
| `TopShade` | 0 | 720 | 0.5 | 满幅（钳制明确跳过） |

390×844 下**可见半宽只有 295.7 设计单位**（UICamera `orthoHeight=640` ⇒ UI 按设计**高度**缩放），
所以 `LeaderboardPanel` 天生比可见区左边界多出 **48.3 设计单位 ≈ 32 屏幕 px**，
**完全依赖运行时 `applyHudSafeAreaInset` 把它推回来**。

**为什么偶发 —— 已实测抓到失败帧**（`node scripts/probe_arena_hud_clip.mjs 6 70`，第 2 次尝试、14 个采样、玩家等级 2）：

```
clipped:
  LeaderboardPanel  w236   x-7.9..147.7  L7.9 R0
  TierUpgradeBanner_1 w542.9 x39.9..397.9 L0 R7.9
  UIPopup           w542.9 x39.9..397.9  L0 R7.9
  MassValue         w538   x41.5..396.3  L0 R6.3
clamp pass:
  visibleHalfWidth=295.73  safeHalfWidth=259.34  scale=0.659  frame=390x844  children=36
  groups:
    shift=+36.3  left=-344.0  right=271.5  safeHalf=295.7
      names=[LeaderboardPanel, TopRow1..4, Top1..4, TierUpgradeBanner_1]   ← 关键
    shift=+34.3  left=-330.0  right=-122.0  names=[StatusPanel, RankValue, MassValue, ...]
    shift=-43.7  left=245.0   right=303.0   names=[BtnPause]
```

**机制（数字完全吻合）**：钳制按**矩形重叠**分组。**升级横幅**（600 设计单位宽、按设备收窄到 542.9）
在这一帧与排行榜面板重叠，于是**两者被并成一组**：

- 合并后 union = `-344.0 … 271.5` = **615.5 设计单位**
- 安全跨度 = `2 × 295.73` = **591.5 设计单位** ⇒ 组比安全跨度**更宽**
- 于是走「**居中而不是单边裁切**」分支：`shift = -(unionLeft + unionRight)/2 = +36.25`
- 居中**并不容纳**：两侧各溢出 `(615.5 − 591.5)/2 = 12` 设计单位 × 0.659 = **7.9 屏幕 px** ✓

⇒ 溢出量、两侧对称、面板 7.9 与横幅 7.9 —— 三个数字都对上了。

**触发条件**：**Arena 玩家升到 LV2、升级横幅出现的那些帧**。这也解释了为什么
6 次"直线行走"的探针（玩家始终 LV1、共 ~870 个采样）一次都没复现 —— 是夹具没走到那个状态，
不是缺陷罕见。**同一类夹具假象本轮出现了两次**，两次都是"探针没有像门禁那样持续转向"。

**修法**：让**瞬时覆盖层不参与钳制分组**。

- 新增 `HudSafeAreaInset.HUD_TRANSIENT_OVERLAY_PREFIXES = ['TierUpgradeBanner_']`，
  在宽度判定**之前**跳过；QA pass 新增 `skippedOverlay` 记录，改名漏配会以"又出现裁切"的形式暴露。
- 理由：横幅**本身就是按帧宽构造的**（`TierUpgradePresenter` 收窄到 `pagePanelHalfWidth(host) * 2`），
  钳制对它毫无收益；但它一旦并入面板组，就会把整组推过安全跨度，
  让一个**本来不需要帮助的节点**把面板一起带偏。
- 同时给「居中」分支补了注释，写明它**按定义仍会两侧裁切** `(width − 2·safeHalf)/2` ——
  这是有意为之（宁可对称裁切也不要单边贴边），所以**已经能容纳的元素不该被并进去**。

**修后实测（机制级，确定性）**：横幅出现那一帧，钳制自己的记录变成
`clamp skippedOverlay=[TierUpgradeBanner_1]`、`mergedIntoGroups=0` ——
即它**已被跳过、且不在任何组里**（修前它就在排行榜组的 `names` 里）。见 §6。

---

## 5. 复现

```bash
npm run build:web
node scripts/verify_gameplay_visuals.mjs              # 45s 窗口，观察期较短
node scripts/verify_gameplay_visuals.mjs --seconds=150 # 长窗口：Arena 可达 131 samples、等级 3
```

> 长窗口（150 s）**没有**复现 Arena 溢出（131 samples、等级 1/2/3、0 溢出），
> 说明触发条件不是"比赛更长/等级更高"，而是某一帧的分组构成。这进一步支持 §4 的结论。

---

## 6. 修后验证

| 项 | 修前 | 修后 |
| --- | --- | --- |
| `verify:gameplay-visuals` 升级横幅覆盖断言 | 12 跑 6 败 | **4 跑 4 过** |
| `verify:gameplay-visuals` Arena 裁切断言 | 12 跑 2 败（8 clipped samples） | **4 跑 4 过（0 clipped）** |
| 横幅是否并入排行榜组 | 是（实测 `names=[...,TierUpgradeBanner_1]`，union 615.5 > 591.5） | **否**（`skippedOverlay=[TierUpgradeBanner_1]`、`mergedIntoGroups=0`） |
| `verify:layout`（8 页 × 3 视口） | PASS | PASS（钳制改动只新增对 `TierUpgradeBanner_*` 的跳过，页面不受影响） |
| `test:contracts` / `typecheck:cocos` | PASS | PASS |

> ⚠️ 诚实边界：Arena 那条断言的"修后 4 跑全过"**样本量小**，而且触发条件（Arena 玩家升到 LV2）
> 在 45 s 窗口里只有约 1/3 的 run 会出现。真正确定性的证据是上表的**机制级**一行 ——
> 横幅已不再进入任何分组，而修前的溢出量正好等于"横幅并入后组宽超出安全跨度"的那一半。

### 6.1 本轮走过的两次夹具假象（同类，记录以免重犯）

`probe_arena_hud_clip.mjs` 第一次只发一次 `touchMove`、之后不再转向，玩家直线走、始终 LV1，
6 次尝试 ~870 个采样**一次都没复现**，一度看起来像"缺陷很罕见"。改成**逐迭代转向**后，
**第 2 次尝试就抓到了**（14 samples、等级 2）。同一份夹具在 `probe_tier_banner.mjs` 上也犯过一次同样的错。

⇒ 教训：**探针必须像门禁一样持续操作**，否则"没复现"只说明探针没走到那个状态。
