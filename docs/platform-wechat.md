# 《黑洞回收站》微信小游戏说明

- 正式 Creator 工程：`cocos/`
- 官方导出目录：`cocos/build/wechatgame/`
- 构建命令：`npm run build:wx`
- 发布前门禁：`npm run preflight:release`

微信开发者工具导入时选择 `cocos/build/wechatgame/`，使用项目所有者的真实 AppID。构建成功仅证明 Creator 已生成有效小游戏包；登录、支付、广告填充和真机性能必须在开发者工具/实机上单独验证。

广告适配器只在启动代码调用 `configureAdUnitConfiguration` 提供真实广告位 ID 后才会请求 `wx.createRewardedVideoAd` 或 `wx.createInterstitialAd`；缺少配置时没有替代广告或假奖励。
