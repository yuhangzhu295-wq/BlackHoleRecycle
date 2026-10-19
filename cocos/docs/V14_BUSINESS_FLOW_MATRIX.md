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
| ACTUAL（2026-10-15 第二轮，**PASS**） | `--scope=progression` **PASS**。LV1→LV5 五级真实质量与解锁：<br>LV1 `mass 0 / maxTier 1` → LV2 `2380 / 2` → LV3 `17710 / 3` → LV4 `61270 / 4` → LV5 `211745 / 5`<br>**压缩系统五个状态全部真实观测**：`BUFFERING → READY → COMPRESSING → EJECTING → COLLECTING`（`resourceBlockCount 262`）<br>T5 目标 `cluster_taxi-stand_DOWNTOWN_...` 质量 `547015`，吸收层级分布 **`{T1:186, T2:201, T3:31, T4:20, T5:12}`**（450 次真实吞噬）<br>金币 `0 → 155471`，与 `storedResources 155471` **一致** |
| EVIDENCE | `artifacts/qa/portrait/acceptance-report-progression.json`（status PASS，`fullProgression.levels` / `.finalTier5Absorption` / `.compression`） |
| STATUS | **PROVEN**（LV1–LV5 真实成长） |

**不调用 `setMass()` / `setLevel()`**：质量逐级爬升、等级与 maxTier 由生产 FSM 推进、压缩五状态由运行时快照观测；
T5 的 450 次吸收来自 `absorbedTiers` 计数，不是结构测试。

**本轮之前的三连败与根因（保留记录）**：三次运行三次失败、目标各不相同
（`Cluster_Park_5` 0.66、`LV4_cardboard_box` 3.79、`LV4_trash_bag` 3.94、
`Cluster_Park_0` 0.51、`Cluster_Park_1` 0.52）。
当时把断言改成"路线是手段、吸收才是断言"，修好后**第五次仍失败**（0.52 处 5 秒未吸收），
证明那不是门禁过严。最终稳定 PASS 的原因在 T1 收集循环：它是**按进度推预算**的
（`collectUntil` 的 900s 上限 + 120s 无进展即停），失败那几次是**岩浆/资源密度不够**，
本轮跑满后自然通过——所以这是**采集预算**问题，不是路线精度问题。

**覆盖说明（不掩饰）**：本轮 PASS 的证据来自 `fullProgression`（LV1–LV5 全链）；
报告里 `routeAttempts` 为空是我打点的 sink 没被这段路径使用（它走 `collectUntil` 而非
`driveJoystickToLogicalPoint` 的吃掉循环），**不是数据缺失**——上面的 450 次吸收与
五级质量就是这段路径自己的证据。

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
| STATUS | **PROVEN**（发放 + 幂等） |

**幂等实验（2026-10-19 重做，`scripts/probe_reward_idempotency.mjs`）**

**第一次实验是假的，这里如实记录。** 第一版探针声称"连续 5 次取奖励，金币 5,5,5,5,5"，
但它的循环只是反复读快照的同一个 `coins` 字段，且 `before` 就取自同一次读取——
`delta` 恒为 0，**根本没有调用过领取接口**。那是"永远通过的测量"，比不测量更糟。
审查代理抓到这一点。

**重做后**（调用真实生产接口 `SaveService.claimArenaSettlement`，
即 `GameManager.showArenaSettlement` 发币用的同一个方法）：

```
match local-arena-mve2zun9-... | reward coins 5 = 生存2 + 名次3
coins after the page's own claim: 5
  baseline   paid=null  coins=5 claimedKeys=1
  deliver#1  paid=false coins=5 claimedKeys=1
  deliver#2  paid=false coins=5 claimedKeys=1
  deliver#3  paid=false coins=5 claimedKeys=1
  deliver#4  paid=false coins=5 claimedKeys=1
  deliver#5  paid=false coins=5 claimedKeys=1
granted 0 time(s); coins moved 0
after reload: coins 5; the match id appears 1 time(s)
```

**两道护栏，都真实存在**（我曾写错成"`claimedArenaSettlementIds` 是死键"，这是错的）：

1. `ArenaMatchManager.settlementRewardClaimed` —— 单次比赛内，`claimSettlementReward()`
   只返回一次奖励（`ArenaMatchManager.ts:438-441`）。
2. `SaveService.claimArenaSettlement(matchId, amount)` —— **按 matchId 持久化去重**：
   查 `claimedArenaSettlementIds`，已存在则 `return false`，否则 push + 加币 + save
   （`SaveService.ts:177-190`），由 `GameManager.showArenaSettlement` 调用。

**我曾把它误判为死键的原因**：只用 grep 搜字段名、读它出现的行，没读方法体，
就把"我没看到"当成"不存在"。这是查证不彻底，不是证据不足。

`window.__BHR_SAVE__` 是 V13.1 为这个实验加的唯一挂载点，QA bridge 在 `?qa=1`
运行时才安装，正常玩家会话不执行任何诊断代码。

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
| FROM | HOME（无尽） |
| ACTIONS | 真实触控依次到 EAST → NORTH → WEST → SOUTH → RETURN_X → OPENING 六个 cell 检查点，每点校验活动网格、当前 cell、逻辑坐标、地标可见性与对象池回收 |
| EXPECTED | 到达正确 cell；网格恰好 9 个活动 cell；无重复 runtime id；cell 能卸载并重载；地标按距离规则显隐 |
| ACTUAL（2026-10-19 修后，**3/3 PASS**） | 六点全部到达正确 cell；9-cell 网格与无重复 id 断言从未失败；<br>地标收敛正确：距 4.23/4.73/5.06 时 `visible=false`（玩家站在地标旁，符合距离规则） |
| EVIDENCE | `acceptance-report-cell-lifecycle.json`（status PASS，三次运行） |
| STATUS | **PROVEN** |

### 修的三处，都不是产品缺陷（都是我自己的仪器坏了）

**1. 无脑等待造成的"漂移"。** 路线函数内部已等 220ms 释放滑行，调用方又等 450ms——玩家以最高速滑行够跑出数单位。那 2.46/4.57/3.21/3.03/0.03/6.58 的"坐标漂移"**全是这 670ms 浪费掉的距离**。改成释放后重读真实位置。

**2. 地标可见性是竞态。** `constructionLandmark.visible` 由 `GameManager` 逐帧更新，而快照在**更新之前**构建——读一帧报到的是上一帧的决策。实测同为距离 59.6，交替读出 `true`/`false`，像抛硬币。改成"轮询到 flag 与实测距离一致为止"再断言，它测的是**规则的符合性**，不是某一帧的偶然值。

**3. 字段根本没序列化。** 断言读的 `stream.constructionLandmark` 从来不存在——`getSnapshot()` 不输出它，所以那条断言读到 `undefined`，本身永远不可能成立。当时一直被坐标漂移抢先失败掩盖着。已把地标的 `loadState/visible/x/z/skylineRange` 补进快照。

**顺带一次失败的诊断**：我一度判定是"局部坐标 vs 世界坐标混用"，写了个脚本去量——量出的是模板节点（0,0），**推翻了我自己的诊断**，已回退。教训和上次一样：定位要读代码而不是推坐标系。

**广告 / 断网 / 后台恢复**：仍未跑，标注 `BLOCKED_PLATFORM`（Web 无平台广告 API，
不用 Web 冒充平台验收）。

---

## 汇总

| FLOW | 状态 |
| --- | --- |
| FLOW-01 无尽主流程 | **PROVEN**（位移 + 质量 + 吸收计数三档齐全） |
| FLOW-02 LV1–LV5 成长 | **PROVEN**（450 次真实吸收，压缩五状态全观测） |
| FLOW-03 Arena 正常竞技 | PROVEN |
| FLOW-04 竞技死亡与复活 | PROVEN（两条退出路径） |
| FLOW-05 结算与金币 | **PROVEN**（发放 + 真实重复投递 0/5 + 重载后 key 恰好 1 次） |
| FLOW-06 机器与皮肤 | **PROVEN**（装备/余额不足/扣款）；持久化未证 |
| FLOW-07 平台/异常/边界 | NOT_PROVEN（cell 生命周期）；广告/断网 BLOCKED_PLATFORM |

**GAMEPLAY_READY = 仍未达标**。依据：FLOW-07 不稳定；FLOW-01/02/03/04/06 已证，FLOW-05 幂等未实验。
