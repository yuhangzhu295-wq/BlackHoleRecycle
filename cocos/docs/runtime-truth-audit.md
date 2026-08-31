# Runtime Truth Audit

**Audit Date**: 2026-08-31
**Base SHA**: `eebc1a31b1a4d4a2769601ba7af2f8b761f99df9`

## 模块真实性评估矩阵 (Truthfulness Matrix)

| 模块 / 脚本 | 状态分类 | 实际代码行为与审计发现 | 纠偏措施 |
| :--- | :--- | :--- | :--- |
| `GameManager.ts` | **BROKEN** | `update(dt)` 中仅执行了相机平滑跟随 (`math.lerp`)，**完全遗漏了** `chunkManager.updateChunks(mPos.z)` 与 `chunkManager.updateObjects(...)` 的调用；导致物体动力学在运行时无法被驱动。同时暂停状态 `isPaused` 未真正切断主更新。 | 重构 `update(dt)`：加入暂停短路判定，按顺序驱动 Chunk 流式更新、可压缩物体吸附与状态机更新、吸收回调、相机跟随。 |
| `PlayerController.ts` | **REAL** | 监听了 `TOUCH_START/MOVE/END` 与鼠标事件，通过 `screenPointToRay` 计算与地面相交点并驱动机器 `setTargetPosition`。 | 保持并优化，确保多点触控与暂停时输入阻断。 |
| `WorldChunkManager.ts` | **REAL** | 实现了基于对象池的流式 Chunk 生成与回收、多区域 Sequence (`bedroom` -> `warehouse` -> `supermarket`) 与场景装饰物构建；`updateObjects` 方法逻辑完备。 | 确保与 `GameManager` 正确对接并在运行时被持续调用。 |
| `CompressibleObject.ts` | **REAL** | 具备完整的状态机 (`IDLE` -> `ATTRACTED` -> `SUCKING` -> `ABSORBED` -> `RECYCLED`)、多 Tier 低模程序化复合几何体构建、等级锁标高亮指示器。 | 保持逻辑，确保在 `updateMotion` 中严格校验 Tier 限制。 |
| `CompressionSystem.ts` | **REAL** | 状态机 (`IDLE` -> `BUFFERING` -> `READY` -> `COMPRESSING` -> `EJECTING` -> `COLLECTING`) 真实存在；生成 3D `ResourceBlock`，动画结束后增加金币并向机器喂入 `Mass`。 | 保持并在运行时提供严密的只读 QA 数据快照。 |
| `BlackHoleMachine.ts` | **REAL** | 包含 5 级结构演进 (双涡轮、冲压机、稳定翼、奇点光环) 与黑洞视界视觉构建；升级通过 `addMass` 真实触发。 | 保持真实升级链路，严禁任何后门注入。 |
| `HUDView.ts` | **PARTIAL** | 原生 Canvas 与 2D 节点树动态构建（Home、ModeSelect、Gameplay、Pause、Settlement），但需要确保真实触控事件响应与坐标精确对齐。 | 完善按钮交互回调与页面切换逻辑，支持真实点击与 Session 数据统计。 |
| `run-full-acceptance.mjs` | **BROKEN** | 包含硬编码性能数据、缺少真实 HTTP 超时处理导致进程挂起、部分断言未能完全遍历真实触控。 | 彻底重写：支持自动环境探测/预览启动、真实 Touch 事件、多分辨率 (375/390/430)、真实断言与逐项截图/录像。 |
| `e2e-cocos-game.mjs` | **FAKE** | 仍残留 `triggerEvolve()` 等测试后门，不符合只读 QA 原则。 | 彻底废除并删除。 |
| `final-acceptance-matrix.md` | **FAKE** | 此前存在预填的假 PASS 数据。 | 重建为基于自动化测试真实运行结果输出的动态验收打分表。 |
