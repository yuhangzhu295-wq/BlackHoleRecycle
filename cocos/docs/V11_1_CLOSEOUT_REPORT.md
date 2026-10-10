# V11.1 → V11.3 收口报告

- 分支：`dev/product-finalization-20260929`
- 本轮起止：`c93bc9f` → `44169af`
- 报告日期：2026-10-10
- 构建：Cocos Creator 3.8.3，`web-mobile` / `wechatgame` / `bytedance-mini-game`

---

## 1. 状态冻结

| 字段 | 值 |
| --- | --- |
| `CURRENT_HEAD` | `44169af` |
| `REMOTE_HEAD` | `44169af` |
| `UNPUSHED_COMMITS` | **0**（`git rev-list --left-right --count` = `0 0`） |
| 本轮提交 | `e4ae1c6`、`0d54005`、`44169af` |

GitHub 同步：上一轮的推送被 `github.com:443` 超时挡住。本轮用有限退避重试
（30s/60s/120s/240s，共 4 次）在**第 4 次成功**，远端从 `9945d7b` 快进到
`c93bc9f`，随后两次提交也正常推送。全程普通 push，无 force、无 merge main。
日志：`artifacts/qa/v111/push-retry.log`。

## 2. 分平台发布结论

**不再压成单一的 `READY_FOR_STORE`。** 三个平台各自独立成立：

| 平台 | 结论 | 依据 |
| --- | --- | --- |
| **Web** | `READY_FOR_WEB_CANDIDATE` | `build:web` PASS（318 文件）；全部 Web 侧门禁 PASS |
| **微信小游戏** | `READY_FOR_WECHAT_SUBMISSION = NO`（唯一原因：账号权限） | `build:wx` PASS（392 文件）；主包 3.57 MB ≤ 4.00 MB PASS；分包 `[game-art, world-construction, art-machines, world-city]`。但本机登录账号无权打开该 AppID，**平台侧上传验收与真机验证未做** |
| **抖音小游戏** | `READY_FOR_DOUYIN_SUBMISSION = NO`（唯一原因：无真实 AppID） | `build:tt` PASS（321 文件）；AppID 仍是占位 `testappId` |

工程侧没有任何一项把这两个平台挡在门外——挡住的都是账号/凭据。

## 3. V11.1-A 六页 UI 审查

| 页面 | 参考图 | 结果 |
| --- | --- | --- |
| **Machine** | 无专用参考图（按语言审查） | **发现并修复 1 个真实缺陷**：进度条文字不可读（见 §4） |
| **Pause** | 无专用参考图 | 逐页看过，无缺陷 |
| **Skin** | 无专用参考图 | 记录 1 处**潜在**碰撞，未改（见 §7） |
| **Endless HUD** | `ui-v4-expanded/08-endless-gameplay.png` | `verify:gameplay-visuals` PASS：56 采样、0 裁切、主角始终可辨（min 99.1 px） |
| **Arena Ready** | `ui-v4-expanded/07-arena-ready.png` | 首次可截图（本轮新增 `arenaReady` 页面键）；标题层级修复已生效 |
| **Arena HUD** | `ui-v3/arena-hud-reference.png`、`v2-03-arena-hud.png` | `verify:gameplay-visuals` PASS：50 采样、0 裁切、主角 min 52.5 px |

**必须先说明的一件事**：`Pause / Machine / Skin` 在**任何**参考图集合里都没有专用渲染图。
这一点是逐目录核对过的（`find . -name "*.png"` 列出全部 32 张），不是推断。
canonical 文档 §3 也把这三页写成「`ui-v4-expanded` renders + 本文档的 field/card/HUD 规则」。
所以这三页只能对**语言**审查，不能对图审查，报告里不冒充有图可比。

三档视口：`verify:layout` 覆盖 8 页 × 3 视口（375×667 / 390×844 / 412×915），
全部 PASS，无节点被裁切，可交互节点均 ≥ 8 px 内缩。

## 4. V11.1-B Ready 两处修复

### A. 标题层级 — 已修复并验证

上一轮记为「品牌板压过页面标题」。本轮查清了它**到底是什么**，结论与上一轮的描述不同：

那行大字 **不是** Ready 页自己的品牌块，也不是属于该页的 Label 或 Sprite。
它是 `RegistrationBranding`——`GameManager.createRegistrationBranding()` 为**所有非 Home 页面**
在 Canvas 层建的合规水印（design y 553..607，fontSize 30）。
而页面标题 `HeaderTitle` 序列化值是 **19px**：页面上最响的一行是水印，不是告诉玩家
「你要开始哪个模式」的那一行。

参考稿 `ui-v9.5-adopted/03-endless-ready.png` 里标题约为品牌行的 2.4 倍，
按本设计宽度即 66px。已改为 `fontSize 66 / lineHeight 74`，标题框 520×74 @ design 512。

**中间踩过一次坑并已修正**：第一版把 `MapPreview` 下移 24 单位来腾空间，
结果把「地图预览」说明条压进 `StatPanelTop` 20.5 单位。原因是 UICard 自带的说明条
位于预览原点**下方 152 设计单位**。改为预览不动、只调标题。实测间隙全部为正：
标题 1115..1189、预览 850..1110、说明条 808..848、卡片 673..803、标语 459..609。

### B. 并排图标统计卡 — 已实现并验证

参考稿把两项统计做成一条并排的图标卡，我们原本是两条通栏行。现在：

- 两张卡复用同一个 `UIHudBar` 预制件，缩到 284、移到 x ∓146（**没有引入新面板**）
- 卡内加一个图标子节点，`Caption`/`Value` 叠放并统一左对齐（需要 `anchorX = 0`，
  否则两个自动宽度的居中锚点标签起点不齐）
- 两个新图标由既有的 `generate_stat_icons.py` 生成：金色奖杯（历史最高纪录）与
  游戏自己的黑洞标识（紫环包近黑圆盘，当前机器）
- `mountStatCards` 在图标帧未到达时是 no-op，退回预制件原有排布，不会留空图标位

## 5. 门禁结果（全部在本轮修改之后重跑）

| 门禁 | 结果 |
| --- | --- |
| `npm run typecheck:cocos` | PASS |
| `npm run test:full` | **PASS，567 项 `[PASS]`，0 `[FAIL]`** |
| `npm run verify:layout` | PASS（8 页 × 3 视口） |
| `npm run verify:gameplay-visuals` | PASS（Endless 56 采样 + Arena 50 采样，0 裁切） |
| `npm run verify:ui-kit` | PASS |
| `npm run verify:audio` | PASS |
| `npm run acceptance:v2`（默认 scope 即 `full`） | **flaky**：同一次构建、同一份代码，第 1 次 FAIL、第 2 次 PASS |
| `npm run test:perf` | PASS（**仅证据完整性**；预算 `NOT_EVALUATED`） |
| `npm run build:web` | PASS（318 文件） |
| `npm run build:wx` | PASS（392 文件） |
| `npm run build:tt` | PASS（321 文件） |

不继承上一轮的 529 PASS：本轮 567 项是重跑得到的，且**包含本轮新增/修改的路径**。

**关于 `acceptance:v2` 的诚实结论**：它不是稳定绿。失败项是
`FAIL_VERTICAL_SLICE_T2_NOT_ABSORBED_AFTER_LV2`——脚本把摇杆推到指定的 T2 点后
等 6 秒看 `session.absorbedTiers[2] > 0`，第一次超时、第二次通过。
本轮的改动（UI 文字颜色、Ready 页布局、两个图标）触及不到吸收逻辑，
但「触及不到」不等于「已证明无关」；这里只报告实测的 1 失败 / 1 通过。

## 6. 性能

- **已测得**：`test:perf` 证据完整性 PASS；`verify:gameplay-visuals` 的 HUD/主角几何全部 PASS。
- **未测得，标 `NOT_MEASURABLE`**：真机 FPS、真机内存、发热、真机首包。
- **`BLOCKED_UNEXPOSED`**：DrawCall / batch / GPU 帧内拆分 / GC 归因（Cocos 3.8 本构建不暴露）。
- 性能预算 `NOT_EVALUATED`（仓库未定义预算）——**不把未定义预算判为 PASS**。

## 7. 已记录但**故意未改**的两项

1. **Skin 页 `CoinPanel` 与 `PreviewNameValue` 的框重叠**
   （x 74..274 / y 350..394 与 x −107..203 / y 334..366，重叠 129×16 设计单位）。
   实测字形目前不碰（8× 放大后仍完整可读），所以是**潜在**碰撞而非可见缺陷。
   改它会把居中标题一起挪动，而这一页没有参考图可以验证改完是对的。
2. **Arena Ready「对局规则」行左端一处淡痕**。与 Endless 行同几何位置逐像素对比：
   峰值通道差 **16 / 255**，均值 2.2。只在 6× 放大下可见，**不是缺陷**。

## 8. 未完成项与断点

以下按优先级排列，可直接由下一次会话接续。当前工作树干净、分支与远端同步。

| # | 未完成 | 状态 / 下一步 |
| --- | --- | --- |
| 1 | **V11.1-C 模式卡预览 A/B** | 未开始。已具备的前提：Blender 管线可用（`render_map_previews.py` 能出图）、`probe_glb_textures.py` 与 `probe_glb_sizes.py` 给出素材与尺寸事实、卡片 560×260 = 2.15:1 与 35° 等距相机上限 1.74:1 的约束已量化 |
| 2 | **V11.1-D LV5 远景** | 未开始。上一轮 Occupancy 46.8% / 大片空地 53.2%。**第一步应是判断空白性质**（合理可玩空间 vs 流式未覆盖），而不是填满 |
| 3 | **V11.1-E 音效与设置完整回归** | 只跑了 `verify:audio`（PASS）。用户点名的「开局/吸附/吞噬/升级/击杀/死亡/结算奖励/静音/重进持久化」逐项听测未做 |
| 4 | **V11.2-A Endless 完整流程** | 未跑本轮要求的端到端链路（Home→…→Settlement→Home，真实操作） |
| 5 | **V11.2-A Arena 完整流程** | 同上（含 Revive 段） |
| 6 | **V11.2-C 微信开发者工具** | 工具已安装（`C:\Program Files (x86)\Tencent\微信web开发者工具`），当前**未运行**。需要的是有权打开该 AppID 的账号 |
| 7 | **V11.2-D 抖音** | IDE 已安装（`AppData\Local\Programs\@bytedminiprogram-ide`），当前**未运行**。需要扫码登录后读取真实 AppID |
| 8 | `acceptance:v2` 的 flaky 步骤 | 建议给 `FAIL_VERTICAL_SLICE_T2_NOT_ABSORBED_AFTER_LV2` 的 6 秒窗口加失败重试或提高采样，否则每次全量验收都有假红风险 |

**真机 / 设备**：`DEVICE_BLOCKED_EXTERNAL`。本机没有真机链路，也没有该小游戏的开发者权限。

## 9. 本报告不主张的事

- 不主张 UI 已全部对齐参考稿：**Pause / Machine / Skin 没有参考图可比**，只有语言审查。
- 不主张 `acceptance:v2` 通过：它在同一构建上失败过一次。
- 不主张微信或抖音可以提交：两者的缺口都是账号凭据，不是工程。
- 不主张性能达标：预算未定义，真机指标 `NOT_MEASURABLE`。
