# V10 — 性能基线（FrameTime / NodeCount / DrawCall / Memory）

- 运行器：`node scripts/test_s11_performance_benchmark.mjs`（`npm run test:perf`）
- 证据：`cocos/docs/evidence/s11/s11-performance-evidence.json`（本轮重跑覆盖）
- 平台：**`web-mobile` release 构建 + 无头 Chromium + SwiftShader 软件光栅**
- 视口：390×844（9:16）；丢弃 30 帧预热，采样 120 帧；帧时长取运行时 `requestAnimationFrame` 差值
- 计数来源：只读 `window.__BHR_QA__.snapshot().performance.{cocos,world}`（不注入、不改场景）

---

## 1. 观测结果

| 场景 | fps | avg 帧时长 | p95 帧时长 | 场景节点 | 活跃节点 | 活跃 MeshRenderer | 活跃 collectible | 活跃 vehicle |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `home_ui_scene` | 110.3 | 9.06 ms | 18.2 ms | 834 | 152 | 10 | – | – |
| `endless_gameplay_moving` | 96.6 | 10.35 ms | 18.1 ms | 3096 | 2145 | 710 | 129 | 21 |
| `endless_gameplay_sustained_travel` | 96.1 | 10.41 ms | 18.3 ms | 3428 | 2160 | 714 | 133 | 21 |

- `consoleErrors`：**0**
- 场景完成度：声明 3 / 执行 3 / 完整 3，无缺项、无中断
- 活跃 cell：9

## 2. ⚠️ 这些数字**不能**当作"手机上的帧率"

运行器自己在 `measurement.frameTimingCaveat` 里写明：

> Headless software rasterization can still be ceiling limited, and rAF can include rapid polling bursts.
> **Observed fps is a scenario observation, not a GPU headroom or presentation-rate verdict.**

并且 `performanceBudgetVerdict = **NOT_EVALUATED**`：

> The repository defines no agreed numeric FPS or frame-time budget, so this runner records observations and enforces no threshold.

⇒ 本基线的用途是**纵向可比性**（同一构建、同一场景、同一口径下的回归对照），
**不是**"达标"声明，也不是真机性能承诺。真机性能见 §4。

## 3. 不可读取的指标（如实标注）

`blockedMetrics`（引擎在本构建中不暴露）：

| 指标 | 状态 |
| --- | --- |
| DrawCall / batch 数 | **`BLOCKED_UNEXPOSED`** |
| 不同 Mesh 资源数 | **`BLOCKED_UNEXPOSED`** |
| GPU 帧内耗时拆分 | **`BLOCKED_UNEXPOSED`** |
| GC 停顿归因 | **`BLOCKED_UNEXPOSED`** |
| **内存（JS 堆 / 纹理 / 网格 / 常驻）** | **`NOT_MEASURABLE`** —— QA 桥只暴露节点与渲染器计数，没有任何内存计数器。用 CDP 读 JS 堆只能给出 JS 一侧的数字，会**严重低估**引擎侧（纹理/网格/GPU）占用，属"能读但会误导"，故不报 |

`notCovered`（本轮未覆盖，非缺陷）：

- 按密度的 30 / 60 / 100 物体分档：`NOT_APPLICABLE_NO_RUNTIME_DENSITY_CONTROL`
  —— `InfiniteWorldManager` 用固定上限（`MAX_ACTIVE_COLLECTIBLES = 240`、`MAX_ACTIVE_VEHICLES = 24`）
  流式加载，运行期与 QA 层都无法请求别的密度，因此场景按**真实玩法状态**命名并报实测数量。
- 长时 soak（超出采样窗）。

## 4. 真机性能

**未测量**（`DEVICE_BLOCKED_EXTERNAL`）：本机无可用真机链路，且微信侧实测需登录该小游戏的开发者账号（见 V11 报告 §阻塞项）。
`web-mobile` 无头软件光栅的 fps 与真机 GPU 无可比性，**不得**据此声称真机达标。

## 5. 复现

```bash
npm run build:web
npm run test:perf
```

---

## 6. 稳定性 soak（新增，6 分钟 Endless）

- 运行器：`node scripts/probe_soak_stability.mjs 6`（逐样本重新转向，按只读计数器采样）
- 证据：`artifacts/qa/v95/soak-stability.json`
- 结果：**123 个采样、6 分钟、0 条 console error**

| 计数器 | 前 1/3 均值 | 后 1/3 均值 | 变化 |
| --- | ---: | ---: | ---: |
| `cocos.sceneNodeCount` | 3095.4 | 3428.6 | **+10.8%** |
| `cocos.activeNodeCount` | ~2160 | ~2190 | 持平 |
| `cocos.activeMeshRendererCount` | ~717 | ~724 | 持平 |

**唯一增长的计数器是「场景节点总数」，而且它是阶跃不是渐增**：t=60（等级 3）约 3090，
t=80 直接到 3429，之后持平。同一区间内**活跃节点数与活跃 MeshRenderer 数都没动**。

⇒ 读作**世界流式加载**（玩家走得更远、更多 cell 载入）而非逐帧泄漏；
但**这不能证明没有泄漏**：引擎不暴露内存，6 分钟的窗口也无法区分
「流式池增长后到顶」与「泄漏尚未撞到上限（`MAX_ACTIVE_COLLECTIBLES = 240`）」。
要证伪需要更长窗口与内存计数，两者当前都不可得（见 §3）。
