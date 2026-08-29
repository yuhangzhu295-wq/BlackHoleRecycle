# 《黑洞回收站》 Cocos 场景与预制体修复前状态审计报告 (runtime-repair-before.md)

审计时间: 2026-08-29T03:45:32.874Z

## 1. 修复前文件 SHA256 与结构备份

### `scenes/Game.scene`
- **SHA256**: `c291a43cf43890a0838066ce4e8293a37e993818bd294fb6a640a767951102d6`
- **Size**: 6247 bytes

### `scenes/Game.scene.meta`
- **SHA256**: `ff98e45304e4465405be7acf1c01742ced1e0d9f293acfb6504d7ec49843c56e`
- **Size**: 183 bytes

### `scenes/Bootstrap.scene`
- **SHA256**: `ac638f223d25cef95b0787f7c134e009c2ba5bdc3854b6c166ab99e351e8fdb9`
- **Size**: 6257 bytes

### `scenes/Bootstrap.scene.meta`
- **SHA256**: `d9e7bec0fb9b0533fa507d5fce8bffac751237578f8672bf24edb05e43eca0c3`
- **Size**: 188 bytes

### `prefabs/machine/BlackHoleMachine.prefab`
- **SHA256**: `95b0fe697b0ee9c1c3c1db814c6483c60362054423ec9889147c8cef5f9944a4`
- **Size**: 1036 bytes

### `prefabs/machine/BlackHoleMachine.prefab.meta`
- **SHA256**: `5aa34623b71ab48168b68649ca2e877c7d940890435d606dbb8e50562165626f`
- **Size**: 230 bytes

### `prefabs/objects/TrashObject.prefab`
- **SHA256**: `6c44f2dc4e6676192ed0393fb1642ed959a408651247f6cffe6133d93eefab2b`
- **Size**: 1026 bytes

### `prefabs/objects/TrashObject.prefab.meta`
- **SHA256**: `ebf6d2805fb85d181a2e5d80186ee4954340184578461de9d7bcf0178f289eb3`
- **Size**: 223 bytes

### `prefabs/chunks/BedroomChunk.prefab`
- **SHA256**: `5babd1fbf0bca23d8d519302c2e03ce05647901f7f03afcd568c13a446d7c2e2`
- **Size**: 1028 bytes

### `prefabs/chunks/BedroomChunk.prefab.meta`
- **SHA256**: `5d4360f8d6aef9f878cff65d5d4c78d02bf988a94d11e395459a535237c0840e`
- **Size**: 224 bytes

### `prefabs/ui/HUD.prefab`
- **SHA256**: `a7b74d8cfb71c78cf05790a2a7521702c40539db459e2f4733d82f22eaa7978b`
- **Size**: 1010 bytes

### `prefabs/ui/HUD.prefab.meta`
- **SHA256**: `53682cb16d392f27c9025df2885d56c12003d6f4f6a191897151a9f350e920d7`
- **Size**: 213 bytes

## 2. 修复前问题诊断 (Root Cause Diagnosis)
1. **Game.scene 缺失游戏节点树**: 场景仅包含 `Main Light` 与 `Main Camera`，没有任何 `GameRoot`、`WorldRoot`、`BlackHoleMachine` 或 `GameManager` 节点，导致运行时摄像机只能渲染灰色天空背景。
2. **Prefab 均为空壳节点**: `BlackHoleMachine.prefab`、`TrashObject.prefab`、`BedroomChunk.prefab`、`HUD.prefab` 序列化内容仅有空 Node，未挂载任何 `MeshRenderer`、几何网格（Cube/Cylinder/Sphere/Plane）、UI 元素（Label/Button）或脚本组件。
3. **GameManager Inspector 引用未序列化**: 缺乏场景内 Node 与 Component 之间的有效指针绑定，导致运行时无法驱动游戏逻辑。
