# V12 执行断点 (EXECUTION CHECKPOINT)

- CURRENT_HEAD：见本文件提交后的 `git log -1`
- CURRENT_PHASE：**PHASE A**（竞技角色完成度）
- CURRENT_TASK：`A-1..A-7` 验证进行中
- LAST_UPDATED：2026-10-11

## 已完成（有实测证据）

| TASK_ID | 内容 | 证据 |
| --- | --- | --- |
| A-0 | 七张设计图逐张打开核对、备份、SHA256、修正五处命名错配 | `V12_DESIGN_REFERENCE_MANIFEST.md` |
| A-core | **对手不再是染色推土机**：`BOT` 不再隐藏黑洞核心、不再挂 crawler；染色改到黑洞自身环 | `BlackHoleMachine.ts` 755 / 785 / applyArenaBotTint / applyLevelAppearance |
| A-core-v | 运行时实测：`ArenaMatchRoot` 7 个对手 `core=true crawler=false visible=true` | `scripts/probe_arena_competitors.mjs` PASS |

## PHASE A 剩余七项：当前实测状态

探针已能给出其中四项的直接读数（`coreScale` / `worldPos` / `visible` / `core`）。

| # | 项 | 状态 | 实测 |
| --- | --- | --- | --- |
| 1 | Bot 外观尺寸与真实质量关联 | **部分** | 开局 7 个 `coreScale` 全为 `1.32`（一致，符合同一起始质量）。**尚未验证升级后是否随之变化** |
| 2 | 玩家与 Bot 吸附表现一致 | **未测** | 需在真实对局里对比双方吸附/吞噬 |
| 3 | Bot 染色与核心稳定显示 | **部分** | 核心稳定激活；**染色颜色值尚未逐一读出**（探针未取材质色） |
| 4 | 名字与真实模型屏幕坐标一致 | **未测** | 需读 `ArenaHUDController` 名牌定位来源 |
| 5 | 遮挡、屏幕外目标、名字显示 | **未测** | 需验证屏幕外不残留孤立名字 |
| 6 | 各等级/状态视觉装配稳定性 | **未测** | 需 LV1→LV5 逐级截图 |
| 7 | 多次启动可见性回归 | **未测** | 需多轮真实对局 |

## 本轮新发现（真实、但未修）

**对手之间没有分离约束，会叠在一起。** 实测 2.5 秒后：
`ArenaBot_4 (-3.3,-5)` 与 `ArenaBot_5 (-3.4,-5)` 相距 0.1，`ArenaBot_6 (-4.5,-3.1)` 也在 2 单位内
——三个对手在屏幕上读作一个实体。

**已排除**"出生点重叠"这个解释：`spawnPosition()` 是正确的 7 等分圆环
（`angle = 2π(slot-1)/7 + 0.13π`，半径 5.8），出生点是分散的。**这是 AI 巡游后的漂移**，
不是出生缺陷——所以**没有**把它当出生 bug 去"修"。

修法应是给 Bot 加一个分离/避让约束，但那是 gameplay 改动，会影响 `arena-ai` 验收，
需要独立的验证预算，本轮没有仓促改。

## 下一步（下个会话直接接这里）

1. 扩展 `probe_arena_competitors.mjs`：读出每个 Bot 的**实际材质色**（验证 #3）、
   以及**名牌的屏幕坐标 vs 模型屏幕坐标**（验证 #4/#5）。
2. 读 `cocos/assets/scripts/ui/ArenaHUDController.ts`，确认名牌位置来源是否同一个
   世界坐标（这是 #4/#5 的判据所在）。
3. 跑一次完整 Arena，在 LV1 与 LV5 各截一张，验证 #1/#6。
4. 然后进 PHASE B（竞技场开场样板区），参考 `V12_DESIGN_REFERENCE_MANIFEST.md`
   §1 里 **07**（竞技场场景构图）与 **04**（竞技场 Gameplay + HUD）的真实内容。

## 命令

```bash
npm start                                  # 看当前构建 http://127.0.0.1:8080/
node scripts/probe_arena_competitors.mjs   # PHASE A 运行时判据
npm run build:web                          # 改完先构建再跑探针
npm run acceptance:v2 -- --scope=arena-ai  # 竞技 AI 回归
```
