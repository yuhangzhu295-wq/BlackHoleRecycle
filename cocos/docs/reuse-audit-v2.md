# 优先复用审计 (Reuse Audit V2) - Cocos Creator 3.8.x

## 目标
评估并确立哪些组件和资源可以直接在《黑洞回收站》中复用，避免重复造轮子。

## 可复用组件清单

1. **Cocos 官方商城低模资源 (Low Poly Assets)**
   - 优先搜索 Cocos Store 免费的 Low Poly 城市/家具包。
   - 备选方案：通过 `MeshFactory.ts` 的 `utils.createMesh` 动态拼装。本轮由于禁止引入过多外部模型，我们将完全采用纯代码复合几何体 (Compound Primitives) 来替代真实的 3D 模型资产导入，同时赋予标准 PBR 材质以达到低模色块风格。

2. **摇杆与操作 (Virtual Joystick)**
   - Cocos Creator 3.8.x 官方 UI 范例中的摇杆。
   - 现状：我们在 `PlayerController.ts` 中已经实现了基于 `EventTouch` 和 `screenPointToRay` 的全屏拖拽射线检测算法，满足当前设计，无需额外引入摇杆库。

3. **对象池 (Object Pool)**
   - 优先使用 Cocos Creator 3.8 自带的 `NodePool`。
   - 现状：项目中已存在基础的资源管理机制，我们将进一步优化 `ObjectPool` 确保 300+ 垃圾同屏时不卡顿。

4. **保存与配置 (Save & Data)**
   - 继续使用原项目的 `SaveService` (基于 `sys.localStorage`) 和 `GameConfig`。

5. **材质与渲染 (Material & Render)**
   - 避免自定义 Shader。全部强制复用 `builtin-standard.effect`。
   - 使用 `MeshFactory` 在内存中缓存不同颜色的 Standard Material，达到高性能合批 (Batching/Instancing 基础条件)。
