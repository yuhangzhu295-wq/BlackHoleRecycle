# 《黑洞回收站》商业化与广告设计文档 (Monetization & Ad Strategy)

## 1. 商业化核心原则
- **单一货币经济**：V1 阶段仅使用唯一基础货币「金币 (Coins)」，坚决杜绝多重代币/体力/积分混乱体系。
- **真实平台 SDK 接入**：通过 `AdService` 与 `PlatformAdapter` 封装微信与抖音官方广告 API，无假广告与假状态。
- **幂等发奖保护**：通过 `RewardLedger` 对每次激励视频生成唯一 `rewardTransactionId`，防止重复领奖与断网重试刷量。

## 2. 广告频控与 RemoteConfig
- `minimumSessionSeconds`: 启动前 15 秒内不弹出非主动广告。
- `cooldownSeconds`: 插屏广告冷却时间 20 秒。
- `sessionCap`: 单局最多展示 15 次广告。
- `dailyCap`: 单日最高 30 次上限。
