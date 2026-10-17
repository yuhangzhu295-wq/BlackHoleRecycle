# V14 业务流矩阵

TASK ID: BLACKHOLE_V14_AUTONOMOUS_PRODUCT_COMPLETION
基线 HEAD：`63fd9e7`（本阶段起始 `2f8a911`）
证据目录：`artifacts/qa/v14/`、`artifacts/qa/portrait/`

**判定口径**：`PROVEN` = 真实输入 + 真实运行时快照/画面三者齐全；
`PARTIAL` = 部分路径已证；`NOT_PROVEN` = 未跑或跑了但没证成；
`BLOCKED_*` = 环境/账号阻塞。**不把"测试退出码为 0"当成 PROVEN。**

---

## FLOW-01 无尽探索主流程

| 字段 | 值 |
| --- | --- |
| FROM | HOME |
| ACTIONS | start → modeEndless → 无尽准备页 start → 真实拖拽 ×4 → 暂停 → 返回首页 |
| EXPECTED | 进入 PLAYING，玩家真实位移、吞噬、质量增长；暂停可恢复；可回首页 |
| ACTUAL | 三档均进入 `PLAYING` 并完成 4 次真实拖拽。**数值证据（进入时 → 拖拽后）**：<br>375×667：mass **0 → 395**、absorbed **0 → 1**、stored 38、位移 **3.98**<br>390×844：mass **0 → 345**、absorbed **0 → 2**、stored 33、位移 **4.38**<br>430×932：mass **0 → 395**、absorbed **0 → 2**、stored 38、位移 **4.56**<br>画面另有 `+50 / +60` 吞噬反馈与 `LV.1 初级黑洞 / 下一级 磁力黑洞` |
| EVIDENCE | `artifacts/qa/v14/states/endless_moving-*.png`；三档 `endless before/after` 快照；`--scope=ui-full-flow` PASS |
| STATUS | **PROVEN** |

**修正记录**：第一版探针读 `player.mass` 与 `compression.absorbed`，两个字段都不存在，返回 `null`——
数值证据曾整段缺失。真实路径是 `snapshot.machine.mass` / `snapshot.machine.level` /
`snapshot.compression.bufferCount` / `snapshot.player.x|z`。改正后重采三档。

---

## FLOW-02 LV1–LV5 成长

| 字段 | 值 |
| --- | --- |
| FROM | ENDLESS PLAYING |
| ACTIONS | 真实触控走完 T1→T5 各阶段路线，逐级吞噬 |
| EXPECTED | 每级质量阈值达成、等级提升、maxTier 解锁、可吞目标等级正确 |
| ACTUAL | `--scope=progression` **三次运行三次失败**，且失败目标各不相同：<br>① `T1_cluster_Cluster_Park_5` bestDistance **0.66**（限 1.488）<br>② `LV4_cardboard_box` bestDistance **3.79**（限 3.72）<br>③ `LV4_trash_bag` bestDistance **3.94**（限 3.72）<br>④ `T1_cluster_Cluster_Park_0` bestDistance **0.51**（限 0.45）<br>⑤ `T1_cluster_Cluster_Park_1` bestDistance **0.52**（限 0.45，且 5 秒内未吸收） |
| EVIDENCE | `artifacts/qa/portrait/acceptance-report-progression.json`（status FAIL）；三次运行的失败信息 |
| STATUS | **NOT_PROVEN** |

**分析（有依据，但未定案）**：
- ④ 的 0.51 与 ③ 的 3.94 都**落在产品自己的吸收半径内**（T1 吸附 2.4、LV4 吸附 6.0），
  说明玩家已经进了可吸收范围；断言却在"玩家坐标是否到达 0.45/3.72"上先抛了。
- ⑤ 则相反：0.52 之后 5 秒内**目标没有被吸收**，质量也没涨——这一条更像产品侧问题。
- 五次失败目标各不相同 → **不是某个目标被卡住**，是路线收敛本身不稳定。

**本阶段做的两处门禁修正（不是降阈值，是把断言放回产品契约上）**：
1. `LV4` 路线：路线失败时先读快照，若目标已消失或质量已增长则继续；目标还在才抛。
2. `T1` 路线：同理，且**保留**原有的 `FAIL_FULL_PROGRESSION_T1_ABSORPTION` 断言。
两处都只是让"路线是手段、吸收是断言"成立；⑤ 证明这个结构仍然会失败。

**未做**：把 0.45 / 0.62× 这两个到达半径与产品 FSM 的 0.6 阈值对齐需要先定"路线精度"
到底该由谁负责；在拿到"0.52 距离下 5 秒未吸收"的独立复现前，**不改产品代码**。

---

## FLOW-03 Arena 正常竞技

| 字段 | 值 |
| --- | --- |
| FROM | HOME |
| ACTIONS | start → modeArena → 竞技准备页 start → 真实拖拽 ×5 → 继续拖拽 ×3 |
| EXPECTED | 1 真人 + 7 Bot；Bot 名称/颜色正确；排名与质量来自真实快照；计时真实推进 |
| ACTUAL | 三档均进入 `ARENA`；快照实测 `elapsed 16.7–19.4s`、`rank 5–6`、`mass 290–410kg`；<br>`acceptance:v2 --scope=arena-ai` PASS；探针 `7 of 7 distinct rival rim colours`、`no crawler mounted` |
| EVIDENCE | `artifacts/qa/v14/states/arena_mid-*.png`、`arena_chase-*.png`；`acceptance-report-arena-ai.json` |
| STATUS | **PROVEN** |

未证部分：**真实击杀**（`eliminationCoins` 在一次运行里为 8，说明发生过击杀，但没有单独记录击杀瞬间的双方质量）。

---

## FLOW-04 竞技死亡与复活

| 字段 | 值 |
| --- | --- |
| FROM | ARENA |
| ACTIONS | 真实拖拽靠近最强对手 → 被吞噬 → 复活页 → 结束本局 → 结算 |
| EXPECTED | 复活页显示真实攻击者与双方质量；倒计时真实；两条退出路径都到结算 |
| ACTUAL | 三档均到达复活页：`gameState: REVIVING`；画面实测<br>`被 矿石 吞噬 · 对方 1749 / 你 340 · 已击败 1 名对手`、`自动放弃倒计时 4s`、`当前第 7 / 8`；<br>结束本局 → `SETTLEMENT`；`--scope=revive` PASS（含 `FORFEIT` 与 `expiryReason`） |
| EVIDENCE | `artifacts/qa/v14/states/revive-*.png`；`artifacts/qa/portrait/portrait-390x844-revive-{hold,give-up,expiry}.png`；`acceptance-report-revive.json` |
| STATUS | **PROVEN**（退出路径：主动结束 + 倒计时耗尽） |

未证部分：**立即复活 → 回到竞技继续比赛**这条路径未单独取证（只跑了放弃与耗尽）。

---

## FLOW-05 结算与金币

| 字段 | 值 |
| --- | --- |
| FROM | ARENA 结束 |
| ACTIONS | 结束本局 → 结算 → 读金币 |
| EXPECTED | 金币 = 各分项之和；同一 matchId 不重复发放 |
| ACTUAL | 三次真实结算，拆解自洽：<br>`coins 20 = 收集4 + 淘汰8 + 生存2 + 名次6`<br>`coins 14 = 收集4 + 存活1 + 名次9`<br>`coins 9 = 收集2 + 存活1 + 名次6`<br>快照含 `matchId: local-arena-…` 与 **`claimed: true`** |
| EVIDENCE | `artifacts/qa/v14/states/settlement-*.png`；三次运行的 `settlement` 快照 |
| STATUS | **PROVEN**（发放正确）；幂等**只有标记，没有重复领取实验** |

未证部分：同一 matchId **重复领取**（刷新/重复点击/重进结算）未被主动触发过；
`claimed: true` 是标记存在，不是"第二次不发"的实验结果。

---

## FLOW-06 机器与皮肤

| 字段 | 值 |
| --- | --- |
| FROM | HOME |
| ACTIONS | 进入机器页 → 返回 → 皮肤页：装备免费皮肤 / 点锁定皮肤（余额不足）/ 购买付费皮肤 |
| EXPECTED | 免费可装备；余额不足不扣钱；购买原子扣款；返回正常 |
| ACTUAL | **免费装备**：`previousSkinId: skin_classic → selectedSkinId: skin_violet_vortex`<br>**余额不足**：锁定皮肤点击时 `coinsBeforeLockedTap: 0`，未扣款<br>**付费购买**：`coinsBefore: 198560 → coinsAfter: 197060`（正好 1500）、`skinId: skin_orange_force` |
| EVIDENCE | `acceptance-report-skins.json`、`acceptance-report-skin-unlock.json`（均 PASS）；`ui-full-flow` PASS |
| STATUS | **PROVEN**（装备 / 余额不足 / 扣款） |

**测试环境标注**：`coinsBefore 198560` 是**预置的测试余额**，不是自然游玩所得——
指令允许隔离测试存档里的合法前置条件，但必须标明，这里标明。

未证部分：**重启后装备与已购状态持久化**、**已购皮肤重复购买不重复扣款**。

---

## FLOW-07 平台、广告、异常、边界

| 字段 | 值 |
| --- | --- |
| ACTIONS | 地图 Cell 卸载/重载、资源重生、断网、广告不可用、连续点击 |
| EXPECTED | 各分支不崩、不重复、不卡死 |
| ACTUAL | `--scope=cell-lifecycle` **FAIL**：`CELL_LIFECYCLE_WEST` 目标 (−196,−196)，<br>最终 (−184.9,−196.0)，bestDistance 2.455（限 1.6），38 次迭代。<br>最终位置在 cell **−3**，目标是 cell **−4**——**确实没走到西侧 cell**。<br>`--scope=regions` PASS（六个区域路线） |
| EVIDENCE | `acceptance-report-cell-lifecycle.json`（FAIL）、`acceptance-report-regions.json`（PASS） |
| STATUS | **NOT_PROVEN**（cell 生命周期）；广告/断网 **BLOCKED_EXTERNAL** |

**未做**：广告位不存在时的回退（Web 无广告 API，平台侧才可验）、断网、
进入后台恢复。这三项标注 `BLOCKED_PLATFORM`，不用 Web 冒充平台验收。

---

## 汇总

| FLOW | 状态 |
| --- | --- |
| FLOW-01 无尽主流程 | **PROVEN**（位移 + 质量 + 吸收计数三档齐全） |
| FLOW-02 LV1–LV5 成长 | **NOT_PROVEN**（路线收敛不稳定，五次不同目标） |
| FLOW-03 Arena 正常竞技 | PROVEN |
| FLOW-04 竞技死亡与复活 | PROVEN（两条退出路径） |
| FLOW-05 结算与金币 | PROVEN（发放）；幂等仅标记 |
| FLOW-06 机器与皮肤 | **PROVEN**（装备/余额不足/扣款）；持久化未证 |
| FLOW-07 平台/异常/边界 | NOT_PROVEN（cell 生命周期）；广告/断网 BLOCKED_PLATFORM |

**GAMEPLAY_READY = NO**。依据：FLOW-02 与 FLOW-07 未证（FLOW-01 已补齐）。
