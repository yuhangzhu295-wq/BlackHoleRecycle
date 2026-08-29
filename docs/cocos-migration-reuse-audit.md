# Cocos Creator 3.8.x 迁移复用审计报告 (Cocos Migration Reuse Audit)

## 1. 审计概述
为从 Three.js Web 原型正式迁移至 Cocos Creator 3.8.x + TypeScript 正式小游戏工程，对 GitHub、Gitee、Cocos 官方仓库及开源项目进行了新一轮系统性检索与复用评估。

## 2. 候选项目复用矩阵
| 项目名称 | 来源/仓库 | 引擎版本 | 语言 | License | 核心复用价值 | 评估动作 (Decision) | 风险与说明 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Cocos Engine Physics Examples (Engulfing Black Hole)** | `cocos/cocos-engine` & `cocos-example-projects` | Cocos 3.8.x | TypeScript | MIT | 官方 3D Trigger 引力吸附与吞噬范例 | **REFERENCE_ONLY (算法参考)** | 官方 3.8.x 规范，参考 Trigger 触发与受控引力加速度 |
| **Cocos Official MiniGame Template & Build Pipeline** | `cocos/cocos-example-projects` | Cocos 3.8.x | TypeScript | MIT | 3.8.x 标准工程目录结构、`build-templates`、平台构建预设 | **REFERENCE_ONLY (规范标准)** | 遵循官方 3.8.x 标准工程目录组织 `assets/`, `settings/` |
| **Cocos Pulse MiniGame Framework** | `yuezhimin03/cocos-pulse-mini-game` | Cocos 3.8+ | TypeScript | MIT | 强类型 EventBus、FSM、ObjectPool、TelemetryQueue | **MODULE_REUSE (结构迁移)** | 严格重构为 Cocos 3.8 TS 规范模块 |
| **WeChat MiniGame API Typings** | `wechat-miniprogram/minigame-api-typings` | Any | TypeScript | MIT | 微信原生 API 强类型定义 | **DIRECT_USE (直接依赖)** | 抹平编译期类型检查 |

## 3. 工程底座决策 (Architecture Decision)
- **结论**：由于开源社区暂无 100% 匹配《黑洞回收站》双模式、无尽分块流式加载、5 阶外观进化与特定数值体系的单一完整可商用 Fork 库，采用 **基于 Cocos Creator 3.8.x 官方标准工程架构新建 `cocos/` 独立目录**。
- **基准复用原则**：将已验证的 Three.js 原型数值 (`GameConfig`)、存档架构 (`SaveSchema`)、切向贝塞尔螺旋引力动力学、分块流式管理及 24 项埋点数据 100% TypeScript 强类型化迁移到 `cocos/assets/scripts/` 中。
