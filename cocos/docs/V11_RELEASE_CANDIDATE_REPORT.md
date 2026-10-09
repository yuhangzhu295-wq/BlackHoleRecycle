# V11 — 发布候选（RC）完整回归与评估报告

- 分支：`dev/product-finalization-20260929`；`HEAD` = `73016f4`（**本轮改动尚未提交**，见 §7）
- 构建：Cocos Creator 3.8.3，`web-mobile` / `wechatgame` / `bytedance-mini-game`
- 报告日期：2026-10-09

---

## 1. 结论

> # `READY_FOR_STORE = NO`

**不是"还差一点"，而是三件硬阻塞各自独立成立**：

| # | 阻塞 | 性质 |
| --- | --- | --- |
| B1 | **微信首包 7,394 KB，上限 4,096 KB（1.81×）；把 `assets/main` 载荷全部搬空后下界仍有 5,488 KB（1.34×）** | **产品决策**（`main` 包分包 or 远程 CDN），二者都改变首屏下载行为 |
| B2 | **抖音 AppID 仍是 `testappId`** | 业主提供 AppID；`preflight:release` 因此失败 |
| B3 | **微信侧权威体积实测与真机验证不可得** | 外部：本机登录账号不是该小游戏的开发者 |

本轮另外修掉了 §5 的两项：一个**会被玩家看到的真实缺陷**（Arena 排行榜面板被裁切）与一处**门禁自身不稳定**（升级横幅覆盖断言 12 跑 6 败）。两者都不是发布阻塞项。

---

## 2. 本程序交付了什么（V9.5 → V11）

| 阶段 | 内容 | 主要提交 |
| --- | --- | --- |
| V9.5 PHASE A–E | 采纳一套参考美术并锁定语言；Home / Settlement / Mode / Pause / Revive / Machine / Skin / Ready 与两个玩法 HUD **全部换皮到 v95 美术**；UI Kit 统一到同一美术族 | `18a8d3c`…`3438847`、`cb10af2` |
| STEP 6 | 8 页 × 375/390/430 共 24 张截图 + 8 张并排对照图，逐张人工目视 | `cocos/docs/V9_5_STEP6_PAGE_SHEETS.md` |
| V9.6 | gameplay 美术统一审计（结论：结构上已统一，活色源唯一；标记 4 处死数据） | `cocos/docs/V9_6_GAMEPLAY_ART_UNIFICATION.md` |
| V9.7 | 两模式玩法回归（无平衡改动） | `cocos/docs/V9_7_TWO_MODE_REGRESSION.md` |
| V10 | 性能基线（3 场景帧时长 + 节点/渲染器计数；4 项不可读已标注） | `cocos/docs/V10_PERFORMANCE_BASELINE.md` |
| V10.1 | 微信包体：`configPath` 机制修正、`separateEngine` 真正生效、引擎特性裁剪、移除未使用 skybox（−850 KB）、**修掉一个会白屏的发布级缺陷** | `cocos/docs/V10_1_WECHAT_PACKAGE_REPORT.md` |

### 2.1 本轮最重要的修复：一个"构建全绿但跑起来白屏"的缺陷

把 `cocos/assets/game_art` 声明为小游戏分包后，`web-mobile` **进不了首屏**：
`Please load bundle game-art first`。原因：`Game.scene` 直接序列化了 **20 个** `game_art` 资源，
而小游戏分包**永远不会**进入 `settings.assets.preloadBundles`。
构建退出码、文件清单、启动场景断言**全都看不出来**。

已修（`BOOT_BUNDLES` 增加 `game-art`，三平台模板同步），并新增
`scripts/test_boot_bundle_residency.mjs`（接入 `test:contracts`）**并做了反向证明**
（删掉该项后守卫必须失败）。同时把 `REQUIRED_BOOT_BUNDLES` 扩到 `['world-city','game-art']`。

---

## 3. 门禁结果（本机、本轮实跑）

| 门禁 | 结果 | 说明 |
| --- | --- | --- |
| `npm run test:full`（cocos + contracts 28 项 + authoring） | **PASS** | 含新增 `test_boot_bundle_residency` |
| `npm run typecheck:cocos` | **PASS** | |
| `npm run verify:layout`（8 页 × 3 视口） | **PASS** | 无节点被屏幕裁切 |
| `npm run verify:gameplay-visuals` | **PASS** | 修掉两个缺陷后 4 连跑全过（修前 12 跑 6 败），详见 §5 |
| `npm run verify:page-tokens` / `verify:ui-kit` / `verify:audio` | **PASS** | |
| `npm run test:perf`（S11 证据完整性） | **PASS** | `performanceBudgetVerdict = NOT_EVALUATED`（仓库未定义预算） |
| `node scripts/test_cocos_p0b_runtime.mjs` | **PASS** | `status: PASS`，`consoleErrors: []` |
| `npm run build:web` | **PASS** | 297 文件；`boot=world-city+game-art` |
| `npm run build:wx` | **PASS**（构建） | 371 文件；分包 `game-art,world-construction,world-city`；**但包体超限，见 B1** |
| `npm run build:tt` | **PASS**（构建） | 300 文件；`boot=world-city+game-art`；分包 `game-art,world-construction,world-city`；AppID 为占位 `testappId` ⇒ 见 B2 |
| `npm run preflight:release` | **FAIL** | 因 B2（`found testappId`） |

---

## 4. 阻塞项

### B1 微信首包上限（产品决策）

实测口径＝**未被声明为分包的全部文件**（含引擎插件本地镜像）。Cocos 官方 FAQ 原文：
*"After the engine plugin is enabled, will the engine code still be counted into the first package?
A: According to WeChat's rules, it will still be counted."* ⇒ `separateEngine` 省的是**启动**，不是包体。

| 组成 | KB |
| --- | ---: |
| `cocos/`（引擎插件镜像） | 2,530 |
| `assets/internal`（内置 effect） | 1,036 |
| `cocos-js/`（插件入口 + wasm） | 969 |
| `assets/main`（场景及其依赖） | 2,323 |
| `src/` | 370 |
| 根启动文件 | 163 |
| **首包合计** | **7,394（上限 4,096）** |
| 搬空 `assets/main` 后的**下界** | **5,488（1.34×）** |

**唯一两条路**（都改变首屏下载行为 ⇒ 业主拍板）：内置 `main` 包整体设为小游戏分包；或把 Bundle 移到已备案 HTTPS 的 CDN。
次选（`art/machines` 1,389 KB + `textures/home` 970 KB 各自分包）**仍过不了**（下界 5,488 KB），只把超限从 1.81× 压到 1.24×。

### B2 抖音 AppID 仍是占位

`cocos/build/bytedance-mini-game/project.config.json` → `"appid": "testappId"`。
**不得**把抖音版本当作可发布。`preflight:release` 会因此失败，这是**预期行为**。

### B3 微信侧实测与真机验证不可得（外部）

- 本机已装微信开发者工具，但其 CLI 无本地体积查询命令；`preview`/`upload` 需登录。
- 且已记录**登录账号不是该小游戏（`wx6ac3f5090a6b99c5`）的开发者**（`WECHAT_SUBPACKAGE_PLAN.md` §6.3）。
- ⇒ §4 B1 的数字是**文件系统口径**，非 DevTools 口径；真机帧率、真机内存、真机首包均 **`NOT_MEASURABLE`**。

---

## 5. 本轮修掉的两个问题（修前均实测复现）

### 5.1 Arena 排行榜面板被裁切（真实缺陷，已修）

**症状**：Arena 玩家升到 LV2 时，`LeaderboardPanel` 左边缘溢出 7.9–12 px，升级横幅右边缘同样溢出。
**实测抓到的失败帧**（`node scripts/probe_arena_hud_clip.mjs`）：

```
LeaderboardPanel w236 x-7.9..147.7 L7.9 R0
TierUpgradeBanner_1 w542.9 x39.9..397.9 L0 R7.9
clamp groups: shift=+36.3 left=-344.0 right=271.5 safeHalf=295.7
  names=[LeaderboardPanel, TopRow1..4, Top1..4, TierUpgradeBanner_1]   ← 关键
```

**机制（数字吻合）**：钳制按矩形重叠分组，**升级横幅与排行榜面板重叠 ⇒ 并成一组**；
合并后 union = 615.5 设计单位 > 安全跨度 591.5 ⇒ 走「居中而非单边裁切」分支，
居中后两侧各溢出 `(615.5 − 591.5)/2 = 12` 设计单位 × 0.659 = **7.9 屏幕 px** ✓

**修法**：`HudSafeAreaInset.HUD_TRANSIENT_OVERLAY_PREFIXES` —— 瞬时覆盖层（横幅）**不参与钳制分组**。
横幅本就按帧宽构造（收窄到 `pagePanelHalfWidth(host) * 2`），钳制对它无收益，
但并入面板组会把整组推过安全跨度。QA pass 新增 `skippedOverlay` 记录，改名漏配会以"又出现裁切"暴露。

**机制级验证**（确定性，不依赖复现）：横幅出现那一帧
`skippedOverlay=[TierUpgradeBanner_1]`、`mergedIntoGroups=0`（修前它在排行榜组的 `names` 里）。

### 5.2 升级横幅覆盖断言 12 跑 6 败（门禁自身，已修）

**根因**：计数器位于 **`ui.tierUpgrade.<endless|arena>.emittedCount`**，门禁读的是**顶层** `live.tierUpgrade`
—— 该键不存在，`Number(undefined ?? 0)` 恒为 0。于是注释里写的「计数器一变就采样」**从未执行过一次**；
横幅实测**存活不足 900 ms**，远小于周期性采样间隔（约 2.4 s）⇒ 约 1/3 概率被撞上。

**修法**：路径改为 `ui.tierUpgrade[<mode>].emittedCount`；计数器一变即在横幅存活窗口内**逐迭代采样**（2.2 s）。
另给 `TierUpgradePresenter` 加 `suppressedCount` / `lastSuppressReason`（进 QA 快照）——
`show()` 在宿主未激活或缺模板 Label 时会静默 return（连 `emittedCount` 都不动），
有了这两个字段才能区分"被抑制"与"画了没采到"。

**修后**：4 连跑全过（横幅 1 sample/次）。

> 走过的弯路与两次夹具假象记录在 `V9_7_TWO_MODE_REGRESSION.md` §3.1 / §6.1，
> 其中一次是我自己的探针**复制了门禁的同一个错误路径**，另一次是探针不像门禁那样持续转向、
> 因此 870 个采样都没走到目标状态。两者都差点被当成产品结论。

## 6. 明确"未验证"清单（不得当作已验证）

| 项 | 状态 |
| --- | --- |
| 微信开发者工具实测首包 / 真机启动 | `NOT_MEASURABLE`（账号权限，见 B3） |
| 真机帧率 / 真机内存 / 发热 | `NOT_MEASURABLE`（无真机链路） |
| 引擎侧内存（纹理/网格/常驻） | `NOT_MEASURABLE`（QA 桥无内存计数器；用 CDP 读 JS 堆会严重低估，故不报） |
| DrawCall / batch / GPU 帧内拆分 / GC 归因 | `BLOCKED_UNEXPOSED`（Cocos 3.8 本构建不暴露） |
| 抖音端可发布性 | 阻塞（B2） |
| 授权音频素材 | 待业主（见 `verify:audio` 与音频资产契约） |
| 长时 soak | **部分覆盖**：6 分钟 Endless、123 采样、0 console error；仅「场景节点总数」阶跃 +10.8%（与世界流式加载同时发生，活跃节点/网格持平）。**不足以证伪内存泄漏** —— 见 `V10_PERFORMANCE_BASELINE.md` §6 |
| 竞技模式"公网真人匹配" | **不存在**：仍为本地真人 + AI，**不得**对外如此宣传 |
| 区域主题与世界美术不一致 | 已记录为内容决策（`e73125c`），未改 |

---

## 7. 工作区状态

- **本轮全部改动尚未提交**：48 个文件变更（+270 / −1852，其中 −1852 主要是 13 个未引用资源移到 `art-source/inputs/`）。
- 未推送任何内容；未合并 `main`；未做 `reset --hard` / `clean -fdx` / 强推。
- 新增文档：`V9_5_STEP6_PAGE_SHEETS.md`、`V9_6_GAMEPLAY_ART_UNIFICATION.md`、`V9_7_TWO_MODE_REGRESSION.md`、`V10_PERFORMANCE_BASELINE.md`、`V10_1_WECHAT_PACKAGE_REPORT.md`、本报告。
- 新增工具：`test_boot_bundle_residency.mjs`（门禁）、`engine_feature_crop.py`、`measure_wechat_package.py`、`audit_gameplay_palette.py`、`capture_v95_page_sheets.mjs` + `build_v95_page_sheets.py`、`probe_boot.mjs`、`probe_tier_banner.mjs`、`probe_arena_hud_clip.mjs`、`dump_qa_snapshot.mjs`。

---

## 8. 复现

```bash
npm run test:full                  # 契约 + 授权（含 test_boot_bundle_residency）
npm run typecheck:cocos
npm run build:web && npm run verify:layout && npm run verify:gameplay-visuals
npm run test:perf
node scripts/test_cocos_p0b_runtime.mjs
npm run build:wx && python scripts/measure_wechat_package.py
python scripts/engine_feature_crop.py
npm run preflight:release          # 预期因 B2 失败
```
