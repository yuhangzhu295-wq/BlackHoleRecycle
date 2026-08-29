# 《黑洞回收站》广告位矩阵表 (Ad Placements Specification)

| 广告位代码 (Placement) | 类型 | 触发时机 | 玩家收益 | 展示策略 |
| :--- | :--- | :--- | :--- | :--- |
| **`REGION_DOUBLE_REWARD`** | 激励视频 (Rewarded) | 区域清理完成转场时 | 本区域结算金币翻倍 | 玩家主动点击按钮 |
| **`UPGRADE_REFRESH`** | 激励视频 (Rewarded) | Roguelike 三选一免费刷新耗尽后 | 获得额外 1 次刷新机会 | 玩家主动点击 |
| **`MAGNET_RECHARGE`** | 激励视频 (Rewarded) | 局内磁暴技能次数为 0 时 | 立即回复 1 次磁暴充能 | 玩家主动点击 |
| **`OFFLINE_DOUBLE`** | 激励视频 (Rewarded) | 登录或重返首页领取离线金币 | 离线收益 × 2 | 玩家主动点击 |
| **`MILESTONE_DOUBLE`** | 激励视频 (Rewarded) | 结算页面 (Game Over) | 本局结算金币 × 2 | 玩家主动点击 |
| **`SESSION_INTERSTITIAL`** | 插屏广告 (Interstitial) | 连续游玩 3 个区域且位于自然停顿点 | 无直接奖励 | 保守展示，游玩中绝不打断 |
