# 《黑洞回收站》 / BlackHoleRecycle

基于 **Cocos Creator 3.8.3、TypeScript 与 3D** 的竖屏回收吞噬小游戏。正式 Cocos 工程位于 [`cocos/`](cocos/)，微信小游戏、抖音小游戏和 Web Mobile 都从该工程构建。

## 已实现且已验收的玩法

- 真实 3D 回收场景、流式城市街区、可移动玩家黑洞与 7 个离线竞技机器人。
- 垂直切片：LV1 吸收 T1 → T2 等级锁 → LV2 涡轮外观与半径升级 → 吸收 T2。
- 无尽模式与 8 人本地竞技模式；竞技流程包含排行榜、被击败、复活倒计时、触控摇杆、结算与真实金币入账。
- 五个已由 Cocos Creator 保存的正式页面：首页、模式选择、竞技 HUD、复活、结算。页面视觉以 `cocos/docs/design-reference/` 的 2026-09-01 五张设计图为准。
- Cocos Web Mobile 真实运行时自动验收：375×667、390×844、430×932 竖屏；CDP 触控验证移动、吸收、升级、竞技、复活、结算和四向长距离流式移动。

## 真实状态与发布边界

- 竞技模式是**本地离线 1 人 + 7 AI**，不宣称在线多人。
- 没有可用广告单元时，复活页显示普通“立即复活”，不会伪造激励广告完成。
- 微信与抖音构建已通过 Cocos Creator 3.8.3 产物校验；尚未等同于各自开发者工具或真机验收。
- 抖音构建当前使用 Creator 默认 `testappId`。发布、登录和真机验收需要项目所有者提供真实抖音小游戏 AppID；不会在代码中猜测或伪造 AppID。
- `arena-server/` 包含经双客户端集成测试的 Colyseus 本地权威房间（输入序号校验与服务器位置积分）。它尚未承载吸收、战斗、复活与奖励，也没有公网 `wss://` 地址；Cocos 客户端仍不将它标为在线匹配。
- 商城、任务、签到、抽奖等未实现系统不应被视为可用功能。

## 环境

- 工程：`C:\Users\zyu33\Documents\Codex\2026-08-28\ji\cocos`
- Cocos Creator：`C:\ProgramData\cocos\editors\Creator\3.8.3\CocosCreator.exe`
- Node.js 与项目根依赖：工程根目录执行 `npm install`

## 验证命令

```powershell
# TypeScript：必须为 0 errors
npm run typecheck:cocos

# 6/6 垂直切片逻辑回归（明确不是 Cocos 运行时）
npm run test:cocos

# 官方 Cocos Creator 3.8.3 Web Mobile 构建 + 真实 WebGL/CDP 触控验收
npm run acceptance:v2 -- --scope=full

# 仅用于快速页面视觉与交互检查
npm run acceptance:v2 -- --scope=pages

# 生产发布前置检查：会拒绝占位 AppID
npm run preflight:release

# 本地 Colyseus 多客户端权威移动集成测试（独立于 Cocos 客户端）
cd arena-server
npm install
npm test
```

最近一次完整 Web Mobile 验收的报告与截图位于 `cocos/docs/evidence/v2/portrait/`（构建证据不纳入 Git）。

## 小游戏构建

在项目根目录使用 Cocos Creator CLI：

```powershell
$creator = 'C:\ProgramData\cocos\editors\Creator\3.8.3\CocosCreator.exe'
$project = 'C:\Users\zyu33\Documents\Codex\2026-08-28\ji\cocos'

& $creator --project $project --build 'platform=wechatgame;debug=false;orientation=portrait;'
& $creator --project $project --build 'platform=bytedance-mini-game;debug=false;orientation=portrait;'
```

产物分别生成于 `cocos/build/wechatgame/` 和 `cocos/build/bytedance-mini-game/`，它们是本地构建输出，已被 Git 忽略。

## 设计与第三方资源

- 设计图清单：[`cocos/docs/design-reference/design-reference-manifest.json`](cocos/docs/design-reference/design-reference-manifest.json)
- 页面契约：[`cocos/docs/design-contracts/`](cocos/docs/design-contracts/)
- 第三方资源与许可证：[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
