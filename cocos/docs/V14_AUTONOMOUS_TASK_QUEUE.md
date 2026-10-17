# V14 全自动开发任务队列

TASK ID: BLACKHOLE_V14_AUTONOMOUS_PRODUCT_COMPLETION
分支：`dev/product-finalization-20260929`
起始 HEAD：`2f8a911`（本地==远端）
状态约定：`TODO` / `IN_PROGRESS` / `VERIFYING` / `PASS` / `FAIL` / `BLOCKED_EXTERNAL` / `NOT_RUN`

**本次授权范围**：可做本地提交；**不推送远端**。禁止 reset --hard / clean -fdx / 强推 / 合并 main。

---

## 0. 基线核对（已执行）

| 项 | 结果 |
| --- | --- |
| 分支 / HEAD | `dev/product-finalization-20260929` / `2f8a911` |
| 本地 vs 远端 | `0 0`（一致） |
| 工作区 | 干净 |
| 七张设计图 | Downloads 原件与仓库 `art-source/references/v12/01..07` **md5 完全相同**，Manifest 映射成立 |
| 复活页数据 | `RevivePageController` 已绑定真实攻击者名、双方质量、排名、倒计时、自动放弃 |

---

## 任务表

| ID | 任务 | 依赖 | 优先级 | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- |
| A1 | 复活页：真实竞技场背景 + 与 gameplay 一致的黑洞造型 | — | P0 | PASS | `artifacts/qa/portrait/portrait-390x844-revive-{hold,give-up,expiry}.png` |
| A2 | 复活页视觉 QA（独立） | A1 | P0 | TODO | 审查意见 |
| A3 | 复活页业务 QA（真实倒计时/复活/放弃） | A1 | P0 | TODO | 步骤日志 |
| B1 | 18 张关键状态真实截图（6 状态 × 3 档） | A1 | P0 | TODO | `artifacts/qa/v14/states/` |
| B2 | 18 张逐张视觉 QA | B1 | P0 | TODO | 审查意见 |
| C1 | 六个城区清单（从 DistrictMapLibrary 读，不靠旧报告） | — | P1 | TODO | 区域列表 |
| C2 | 逐城区构图施工 | C1 | P1 | TODO | 每城区前后对比 |
| C3 | 逐城区真实移动/收集/车辆/生命周期验收 | C2 | P1 | TODO | 探针输出 |
| D1 | 模型质量审计复跑（不重改已修项） | — | P1 | PASS | 1 条（推土机，待所有者） |
| D2 | 推土机只读引用分析 + 合法替代方案准备 | — | P2 | TODO | 引用清单 |
| E1 | 页面清单（从 UIPageRouter/Game.scene 读） | — | P0 | TODO | 页面表 |
| E2 | 逐页真实交互验收（点完看状态变化） | E1 | P0 | TODO | 每控件结果 |
| F1 | FLOW-01 无尽主流程 | E2 | P0 | TODO | 步骤日志 + 快照 |
| F2 | FLOW-02 LV1–LV5 真实成长 | F1 | P0 | TODO | 等级证据 |
| F3 | FLOW-03 Arena 正常竞技 | F1 | P0 | TODO | 排名/击杀/结算 |
| F4 | FLOW-04 竞技死亡与复活 | F3 | P0 | TODO | 三种退出路径 |
| F5 | FLOW-05 结算与金币幂等 | F1,F3 | P0 | TODO | 账本对比 |
| F6 | FLOW-06 机器与皮肤 | E2 | P1 | TODO | 余额/装备/持久化 |
| F7 | FLOW-07 平台/广告/异常/边界 | E2 | P1 | TODO | 逐项结果 |
| G1 | 性能：节点/渲染器/帧时间/内存趋势 | B1 | P1 | TODO | 实测值 |
| G2 | 微信主包压缩后尺寸 | — | P1 | BLOCKED_EXTERNAL | 需开发者工具权威口径 |
| G3 | 抖音真实 AppID | — | P1 | BLOCKED_EXTERNAL | 需账号 |
| H1 | 最终报告 `V14_FINAL_PRODUCT_ACCEPTANCE_REPORT.md` | 全部 | P0 | TODO | — |
| H2 | 业务流矩阵 `V14_BUSINESS_FLOW_MATRIX.md` | F1–F7 | P0 | TODO | — |
| H3 | 视觉矩阵 `V14_VISUAL_ACCEPTANCE_MATRIX.md` | B2,C3 | P0 | TODO | — |

---

## 五项完成判定（当前）

| 判定 | 状态 | 依据 |
| --- | --- | --- |
| GAMEPLAY_READY | NOT_RUN | FLOW-01..07 未跑 |
| VISUAL_READY | NOT_RUN | 18 张状态图未采集 |
| DATA_READY | NOT_RUN | 金币幂等/存档未验 |
| ENGINEERING_READY | PASS（历史） | 529 测试 + 四道 review + 构建，本阶段未改动相关代码 |
| RELEASE_READY | BLOCKED_EXTERNAL | 抖音 AppID；微信压缩包体未测 |

---

## 变更日志

### A1 PASS（2026-10-15）

**问题（实测）**：`ReviveBlackHoleHero` 是 246×246 的小方块，卡片 620×900 的上半部
是一大片米色 + 一张贴纸；正是指令点名的"大片单色面板加一张很小的黑洞图片"。

**修改**：
- `cocos/assets/game_art/ui/v95/revive_hero_absorbing.png` — 换成 560×200 的城市街道场景
  （大街、两侧建筑、**大洞=攻击者 / 小洞=玩家 + 牵引轨迹**），与模式卡同一套等距语言；
  源文件 `art-source/vector/ui/revive-hero.svg`，工具 `scripts/author_revive_hero.py`
- `cocos/assets/scenes/Game.scene` — `ReviveBlackHoleHero` 尺寸 246×246 → 560×200、y 164 → 172
  （底部距 `LossValue` 14px，顶部距缎带 24px）
- 契约未改：`ReviveCard` 620×900 是授权布局，hero 不在契约里

**证据**：`artifacts/qa/portrait/portrait-390x844-revive-hold.png`（真实竞技场死亡后、
真实攻击者"风暴 650 / 你 240"、倒计时 2s、第 8/8）。`acceptance:v2 --scope=revive` PASS，
含 `FORFEIT` 与 `expiryReason` 证据。

**顺带修**：`visual-reference` 的色桶底线 380 落在实测离散带 376–402 **之内**，会随对局抖动。
按 8 次采样把底线设到 360，并在基线里写明它只是粗粒度回归告警（降幅 >40 才算），
不是美术质量判据——指令也明确禁止用色桶数判定合格。

