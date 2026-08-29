# 《黑洞回收站》性能优化与画质分级规范 (Performance & Quality Spec)

## 1. 目标指标
- **主流中高端机型**：稳定 60 FPS，内存 < 280MB，DrawCall < 45。
- **千元低端机型**：最低 35+ FPS，内存 < 180MB，DrawCall < 30。

## 2. 优化技术手段
1. **几何体与材质全局共享池 (`geometryCache` / `materialCache`)**：同类低模物体复用共享 BufferGeometry 与材质，减少重复提交。
2. **点精灵与粒子合并 (`VFXManager`)**：全场吞噬火花与金币粒子采用单个 `BufferGeometry` 点云绘制，1 个 DrawCall 渲染 300 颗高频粒子。
3. **视锥与距离剔除**：身后远离的 Chunk 立即释放回池，同屏活跃物体数量控制在 40~80 个。
4. **画质分级策略**：
   - **高画质 (High)**：开启 DirectionalLight 阴影贴图、抗锯齿 (Antialias)、高精度点云粒子。
   - **中画质 (Medium)**：关闭软阴影、标准像素比 (DPR=1.5)、适中粒子数量。
   - **低画质 (Low)**：关闭实时阴影、基础像素比 (DPR=1.0)、极简粒子。
