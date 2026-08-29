# 性能与物体承载基准测试数据表 (Performance Benchmark Data)

测试环境: Windows 11 x64 / Chromium WebGL SwiftShader & ANGLE (DESKTOP_ONLY)

| 测试工况 (Active Objects) | FPS | 平均帧时间 (Frame Time) | Draw Calls | 内存占用 (Heap/WebGL) | 移动端预估表现 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **30 活跃物体 (标准工况)** | 60.0 FPS | 16.6 ms | 22 DC | ~64 MB | 预计主流低端机流畅 (60 FPS) |
| **60 活跃物体 (高密度工况)** | 59.8 FPS | 16.7 ms | 31 DC | ~78 MB | 预计主流低端机流畅 (55~60 FPS) |
| **100 活跃物体 (磁暴瞬间激增)** | 58.2 FPS | 17.1 ms | 42 DC | ~92 MB | 预计中端机稳定 (50~58 FPS) |
| **200 视效物体 (极限压测)** | 52.4 FPS | 19.1 ms | 56 DC | ~115 MB | 需配合画质分级降级粒子 |

> **注意声明 (DESKTOP_ONLY)**: 以上数据来自桌面端浏览器 WebGL 压测环境，在未进行真实真机 Profiler 采样前，不可标注为 MOBILE_PASS。
