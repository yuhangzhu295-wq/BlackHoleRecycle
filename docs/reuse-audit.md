# 《黑洞回收站》开源与现有项目复用真实性审计报告 (Reuse Audit)

## 1. 审计概述
根据《黑洞回收站》第一最高规则，对项目复用真实性进行逐项核查。核查确认：本项目对开源项目主要采取了**架构设计思想参考与算法借鉴 (REFERENCE_ONLY)**，而非直接在工程中以模块形式引入第三方 TypeScript/Cocos 源码包。

## 2. 候选项目复用真实性核查矩阵
| 项目名称 | 来源/仓库 | 声明 License | 语言/引擎 | 实际使用方式 | 实际复用状态 (Real Reuse Action) | 说明与差异 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Cocos Pulse MiniGame Framework** | yuezhimin03/cocos-pulse-mini-game | MIT | TypeScript / Cocos 3.8+ | 参考其 EventBus、FSM、ObjectPool 与 Telemetry 设计思想 | **REFERENCE_ONLY (架构思想参考)** | 未直接引入其 `.ts` 组件，而是在 ES6 环境中自研轻量级实现 |
| **WeChat MiniGame API Typings** | wechat-miniprogram/minigame-api-typings | MIT | TypeScript | 参考微信原生小游戏 API 规范与生命周期 | **REFERENCE_ONLY (规范参考)** | 当前工程为纯 JavaScript ESM，未直接通过 npm 安装 typings |
| **Hole.io 3D Mechanics Research** | GitHub / Three.js Community Shader Hole | MIT | WebGL / Three.js | 借鉴其 3D 黑洞贝塞尔螺旋下潜引力曲线与切向力算法 | **REFERENCE_ONLY (算法参考与重写)** | 由自研 `TrashObject.js` 程序化实现 |
| **Cross-Platform MiniGame SDK Adapter** | 抖音/微信官方小游戏文档开源片段 | MIT/Apache-2.0 | ES6 | 借鉴微信与抖音双端 API 抹平逻辑 | **REFERENCE_ONLY (适配器参考)** | 在 `src/adapter/platform.js` 中自行封装 |

## 3. 结论
当前工程所有核心模块（3D 渲染、物理引力、状态机、对象池、UI、广告与埋点）均为自研与标准 WebGL/Three.js 组合实现，无未授权代码混入，复用状态真实定级为 **REFERENCE_ONLY**。
