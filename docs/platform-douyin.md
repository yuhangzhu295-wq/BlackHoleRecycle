# 《黑洞回收站》抖音小游戏平台适配说明 (Douyin MiniGame Platform Spec)

## 1. 平台专属特性
- **入口构建目录**：`dist/tt`
- **配置文件**：`platform/tt/game.json`、`platform/tt/microapp.json`、`platform/tt/project.config.json`
- **游戏录屏分享**：`tt.getGameRecorderManager()`（支持高光时刻自动录制 15~60 秒视频并一键挂载话题分享发布至抖音短视频信息流）
- **广告接口对接**：`tt.createRewardedVideoAd`、`tt.createInterstitialAd`
- **震动与触感**：`tt.vibrateShort` / `tt.vibrateLong`
- **存储**：`tt.setStorageSync` / `tt.getStorageSync`

## 2. 抖音开发者工具调试
1. 执行 `npm run build:tt` 生成 `dist/tt`。
2. 打开抖音开发者工具导入 `dist/tt`，即可进行短视频录制与广告模拟测试。
