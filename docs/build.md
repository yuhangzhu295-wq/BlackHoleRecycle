# 《黑洞回收站》官方构建与验证指南

正式工程是 `cocos/`，使用 Cocos Creator 3.8.3；根目录的 `legacy/threejs-prototype/` 仅保留为历史玩法参考，不能用于构建、验收或发布。

```bash
npm run typecheck:cocos
npm run test:cocos
npm run acceptance:v2 -- --scope=full
npm run build:all
npm run preflight:release
```

Creator 输出目录为：

- `cocos/build/web-mobile/`
- `cocos/build/wechatgame/`
- `cocos/build/bytedance-mini-game/`

`test:cocos` 是逻辑回归，不能取代运行时验收。`preflight:release` 在抖音 AppID 仍为 `testappId` 时必须失败；这是发布前的真实配置门禁，不是构建故障。
