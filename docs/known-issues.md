# 《黑洞回收站》已知外部环境与待配置项 (Known Issues & External Configs)

## 1. 外部依赖与环境说明
1. **真机广告上线前配置**：
   - 当前项目代码已完整对接 `wx.createRewardedVideoAd` 与 `tt.createRewardedVideoAd`。
   - 正式上线前需在微信公众平台及抖音开放平台申请正式广告位 ID（AdUnitId），并在 `src/monetization/AdService.js` 中替换测试占位字符串。
2. **小游戏正式 AppID 绑定**：
   - 构建产物中 `platform/wx/project.config.json` 与 `platform/tt/project.config.json` 默认填入测试通用 AppID。正式提审前填入开发者认证主体真实 AppID 即可。
