# 《黑洞回收站》微信小游戏平台适配说明 (WeChat MiniGame Platform Spec)

## 1. 平台专属特性
- **入口构建目录**：`dist/wx`
- **配置文件**：`platform/wx/game.json`（设备方向 `portrait`，开启 WebGL 支持）、`platform/wx/project.config.json`
- **API 强类型依赖**：`wechat-miniprogram/minigame-api-typings`
- **生命周期对接**：`wx.onShow`、`wx.onHide`、`wx.onTouchStart`、`wx.onTouchMove`、`wx.onTouchEnd`
- **广告接口对接**：`wx.createRewardedVideoAd`（支持单例缓存与 onClose 回调管理）
- **触感反馈**：`wx.vibrateShort({ style: 'light' | 'medium' | 'heavy' })`
- **云端与本地持久化**：`wx.setStorageSync` / `wx.getStorageSync`

## 2. 微信开发者工具运行说明
1. 执行 `npm run build:wx` 生成 `dist/wx` 产物。
2. 打开微信开发者工具，选择「导入项目」，目录指向工程下 `dist/wx`。
3. 填入测试 AppID 或使用「小游戏测试号」即可直接真机预览与性能调优。
