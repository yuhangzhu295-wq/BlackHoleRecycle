# 《黑洞回收站》测试与验收

```bash
npm run typecheck:cocos
npm run test:cocos
npm run acceptance:v2 -- --scope=full
npm run build:all
```

测试范围必须如实区分：

1. `test:cocos` 是 6 项 Node 逻辑回归，只证明规则和资源契约；它不是 Cocos 运行时 PASS。
2. `acceptance:v2` 使用 Cocos Creator 3.8.3 生成 Web Mobile 包，以 Playwright CDP 的真实触控事件验证竖屏运行时。
3. `build:all` 校验 Creator 的 Web Mobile、微信小游戏与抖音小游戏输出；不等同于微信/抖音开发者工具或真机验收。
4. `preflight:release` 要求两个小游戏的 AppID 为真实值；当前抖音 AppID 未配置，因此该门禁预期不通过。

已覆盖的核心门禁为：启动页→模式页→拖拽移动→T1 吸收→质量增长→T2 锁定→LV2 涡轮与半径提升→T2 吸收，以及竞技、复活、结算和四向流式移动。
