# 《黑洞回收站》抖音小游戏说明

- 正式 Creator 工程：`cocos/`
- 官方导出目录：`cocos/build/bytedance-mini-game/`
- 构建命令：`npm run build:tt`
- 发布前门禁：`npm run preflight:release`

当前抖音包可由 Creator 3.8.3 构建，但 AppID 是 `testappId` 占位值。必须由项目所有者提供真实抖音小游戏 AppID 后，`preflight:release` 才会通过；在此之前不得声称已发布、已登录或真机可用。

广告 SDK 仅接受由 `configureAdUnitConfiguration` 注入的真实 ID；未配置时服务明确不可用，不会发放假广告奖励。
