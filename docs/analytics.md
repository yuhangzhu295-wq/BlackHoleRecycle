# 《黑洞回收站》数据分析与指标上报 (Analytics Specification)

## 1. 核心打点事件表 (24 Events)
| 事件名 | 触发时机 | 关键参数 | 业务价值 |
| :--- | :--- | :--- | :--- |
| `game_launch` | 游戏加载完成 | platform, duration | 衡量冷启动与留存 |
| `session_start` | 产生有效会话 | sessionId, timestamp | 会话基数统计 |
| `endless_start` | 进入无尽模式 | mode, initialCoins | 模式转化率分析 |
| `first_move` | 玩家首次拖动黑洞 | durationFromStart | 新手上手流畅度 |
| `first_absorb` | 吞噬第一个物体 | time, objectType | 核心爽感第一到达时间 |
| `machine_evolve` | 机器结构进化 | level, mass, duration | 核心成长漏斗 |
| `object_absorb` | 单个物体吞噬 | type, tier, mass | 物品分布热度 |
| `combo_reached` | 达到连击里程碑 | combo, bonusScore | 连击刺激度 |
| `magnet_storm` | 释放磁暴技能 | remaining, duration | 技能使用率 |
| `upgrade_offer` | 弹出三选一卡片 | choices | Roguelike 词条曝光 |
| `upgrade_selected` | 选定三选一卡片 | perkId | 词条流派喜好度 |
| `upgrade_refresh` | 刷新三选一选项 | refreshType | 刷新付费与广告转化 |
| `region_enter` | 进入新区域分块 | theme, index | 关卡推进留存 |
| `rewarded_request` | 发起激励广告 | placement, txId | 广告需求意向 |
| `rewarded_show` | 激励广告成功展示 | placement, txId | 广告展示率 |
| `rewarded_complete` | 激励广告完整看完 | placement, txId | 完播率与转化率 |
| `rewarded_fail` | 广告加载或播放失败 | placement, error | 平台填充与技术监控 |
| `interstitial_show` | 插屏广告展示 | placement | 插屏频次监控 |
| `session_end` | 会话结束/离开 | duration, finalScore | 局长与人均时长分析 |

## 2. 商业看板核心指标
- **First Absorb Time**：首吸时间（目标 < 5 秒）
- **First Evolution Time**：首进化时间（目标 30~60 秒）
- **Rewarded Completion Rate**：激励广告完播率（目标 > 92%）
- **Average Session Duration**：人均单局时长（目标 > 8 分钟）
