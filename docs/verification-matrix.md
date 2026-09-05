# 《黑洞回收站》当前验证矩阵

| 范围 | 当前证据 | 状态 | 结论边界 |
| :--- | :--- | :--- | :--- |
| 引擎与类型 | `npm run typecheck:cocos`，真实 `cc` 导入 | PASS | 0 TypeScript errors；不等同于编辑器 GUI Console 检查。 |
| 垂直切片逻辑 | `npm run test:cocos` | PASS | 6/6；这是 Node 逻辑回归，不能代替 Cocos 运行时。 |
| 竖屏真实运行时 | `npm run acceptance:v2 -- --scope=full` | PASS | Cocos Creator 3.8.3 Web Mobile 构建、WebGL 与 CDP 触控覆盖 T1→LV2→T2、四向流式移动、竞技、复活与结算。 |
| 微信小游戏导出 | `npm run build:all` | PASS | Creator 产物与已配置 AppID；尚未在微信开发者工具或真机验收。 |
| 抖音小游戏导出 | `npm run build:all` | PASS（构建） | 产物可生成；`testappId` 表明尚不可发布或真机登录。 |
| 网络竞技 | `npm run acceptance:v2 -- --scope=network` | PASS（本地房间） | 使用真实 Colyseus 本地服务；线上部署、身份与服务端奖励账本尚未完成。 |
| 广告 | `AdService` 行为契约 + 平台导出 | SAFE-UNCONFIGURED | 未提供真实 AdUnitId 时明确不可用，绝不调用占位广告位。 |
| 商业美术一致性 | 最新竖屏截图与设计图人工对比 | IN PROGRESS | 页面与玩法结构已对齐；模型与 UI 尚未达到概念图的商业级逐像素还原。 |

当前运行证据由命令实时写入 `cocos/docs/evidence/v2/`，该目录不纳入 Git，避免提交过时 PASS 报告。
