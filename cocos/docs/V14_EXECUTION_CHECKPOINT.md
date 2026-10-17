# V14 执行断点

最后更新：2026-10-15
分支：`dev/product-finalization-20260929`
本阶段起始 HEAD：`2f8a911`（本地==远端）
本阶段本地提交：`79a2cea`（PHASE A）、`63fd9e7`（PHASE B）

**本次任务授权：只做本地提交，不推送远端。** 因此本地比远端多 2 个提交，这是预期的。

---

## 现在从哪继续

1. 读 `cocos/docs/V14_AUTONOMOUS_TASK_QUEUE.md` 的任务表——状态是唯一的进度来源。
2. 读 `cocos/docs/V14_BUSINESS_FLOW_MATRIX.md` 看 FLOW-02 / FLOW-07 为什么没过。
3. 读 `cocos/docs/V14_VISUAL_ACCEPTANCE_MATRIX.md` 看那 1 项 P1。

## 已完成（本阶段）

| ID | 内容 | 证据 |
| --- | --- | --- |
| A1 | 复活页 hero 从 246×246 贴纸改为 560×200 城市街道场景；卡内成为完整构图 | `artifacts/qa/portrait/portrait-390x844-revive-hold.png` |
| B1 | 18 张真实状态帧（6 状态 × 3 档） | `artifacts/qa/v14/states/` |
| B2 | 18 张逐张审查：5 通过 / 1 项 P1 | `V14_VISUAL_ACCEPTANCE_MATRIX.md` |
| D1 | 模型质量 12 → 1（6 枢轴 + 2 UV 退化 + 电池 UV） | `review:model-quality` |
| F1/F3/F4/F5 | 无尽移动、竞技、复活、结算四条流程取证 | `V14_BUSINESS_FLOW_MATRIX.md` |

## 未完成 / 阻塞

| 项 | 状态 | 卡在哪 |
| --- | --- | --- |
| FLOW-02 成长 | NOT_PROVEN | 路线收敛不稳定，五次跑五个不同目标（0.51–3.94） |
| FLOW-07 cell 生命周期 | NOT_PROVEN | `CELL_LIFECYCLE_WEST` 玩家最终停在 cell −3，目标在 cell −4 |
| FLOW-01 数值证据 | PARTIAL | 探针读的快照字段路径不对（`player.mass` 返回 null） |
| FLOW-06 交易 | PARTIAL | `--scope=skins` / `skin-unlock` 未跑 |
| 竞技场草地 P1 | OPEN | 需"按区域地面变体"功能或 Creator 编辑器会话 |
| PHASE C 六城区推广 | TODO | 依赖上面的地面变体决策 |
| PHASE E 逐页真实交互 | TODO | `ui-full-flow` 已 PASS，逐控件未做 |
| 微信压缩包体 | BLOCKED_EXTERNAL | 需开发者工具权威口径 |
| 抖音 AppID | BLOCKED_EXTERNAL | 需账号 |

## 环境坑（会重复咬人）

- `ui.pauseButton` 在 `ui.runtimeHUD` / `ui.arenaHUD` 下，不在顶层；退出在 `ui.formalPages.pauseHome`。
- 复活页**不是** `gameState === 'REVIVE'`：`REVIVE` 是输入动作名，状态是 `REVIVING`，
  之前一直是 `ARENA`。用 `ui.formalPages.revive.active` 检测。
- 复活倒计时只有 5 秒：长拖拽（9s/轮）会整段跨过它。要短步拖拽 + 每轮轮询。
- `glb_uv_tool.mjs` 的位移/UV 操作必须**按 accessor 去重**：多个 primitive 可能共用一个
  accessor，按 primitive 应用会把同一个位移做多次。
- `visual-reference` 的色桶底线已按 8 次采样设到 360（观测范围 376–402）。它只是粗粒度告警。

## 构建与门禁现状

- `npm run build:web` PASS（326 文件）
- `npm run test:full` 529 PASS / 0 FAIL
- `verify:layout` PASS；`verify:gameplay-visuals` PASS；`verify:ui-kit` PASS
- `review:art` 四道全 PASS（模型质量 1 条、摆放 3 条，均在基线内）
- `acceptance:v2`：`revive` PASS、`settlement` PASS、`ui-full-flow` PASS、`regions` PASS、
  `arena-ai` PASS；**`progression` FAIL**、**`cell-lifecycle` FAIL**
