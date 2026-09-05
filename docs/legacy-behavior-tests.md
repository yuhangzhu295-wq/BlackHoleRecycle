# 历史 Three.js 原型与 Cocos Creator 3.8.x 行为基准对照

> 历史原型现位于 `legacy/threejs-prototype/`，本文件只记录迁移意图，不能作为当前 Cocos 运行时验收证据。

## 1. 核心体验指标基准 (Baseline Metrics)
为确保向 Cocos Creator 3.8.x 迁移后核心玩法爽感不退化，确立以下可测量的行为基准：

| 行为指标 (Behavioral Metric) | Three.js 原型表现 (Baseline) | Cocos Creator 3.8.x 目标 (Target) | 验证手段 (Verification) |
| :--- | :--- | :--- | :--- |
| **首吸时间 (First Absorb Time)** | < 3.5 秒内吸入首个 T1 物品 | ≤ 3.0 秒内吸入首个 T1 物品 | 启动后立即拖拽靠近物品 |
| **吸附轨迹特征 (Motion Curve)** | 贝塞尔平滑加速 + 切向螺旋旋转 + 核心体积缩小下潜 | 保持飞入、旋转、加速、下潜全部四维特征，严禁瞬间消失 | 视觉观测与 `SuctionMotion.ts` 计算 |
| **首进化时间 (First Evolve Time)** | 吸入 ~3,500kg 质量（约 15~20 个物品）后触发 | 吸入 3,500kg 触发 LV1 ➔ LV2 进化 | 累计质量阈值事件 |
| **Tier 拦截与解锁反馈** | LV1 靠近 T2 显示 🔒 锁标；LV2 靠近 T2 正常吞噬 | LV1 拦截 T2 并显示锁标；LV2 顺利吞噬 T2 | 分别测试 T1 与 T2 物品交互 |
| **无尽 Chunk 回收 (Chunk Pool)** | 活跃 Chunk 稳定在 3~4 个，旧 Chunk 100% 销毁回池 | 活跃 Chunk 节点数恒定，无内存无限增长 | ChunkManager 统计与 Node 树计数 |
