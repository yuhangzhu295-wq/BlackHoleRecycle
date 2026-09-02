# BlackHoleRecycle V2 外部 3D 资产复用审计

## 审计结论

本次世界美术基础层仅选用 Kenney 发布、明确标注为 **CC0** 的低多边形 glTF 资产。CC0 允许商业使用、修改和再分发，不要求署名；项目仍会在资产清单中保留作者与来源，便于追溯。未列入清单的网络模型一律不得进入工程。

## 已批准的资源包

| 资源包 | 作者 | 许可 | 官方来源 | 本阶段用途 | 状态 |
| --- | --- | --- | --- | --- | --- |
| City Kit: Roads | Kenney | CC0 1.0 Universal | https://kenney.nl/assets/city-kit-roads | 道路、路口、低地块 | 已批准并导入 |
| City Kit: Suburban | Kenney | CC0 1.0 Universal | https://kenney.nl/assets/city-kit-suburban | 建筑、树木、围栏、步道 | 已批准并导入 |
| City Kit: Commercial | Kenney | CC0 1.0 Universal | https://kenney.nl/assets/city-kit-commercial | 小型商店与城市地标 | 已批准并导入 |
| Car Kit | Kenney | CC0 1.0 Universal | https://kenney.nl/assets/car-kit | 回收车底盘、静态车辆、轮胎、回收碎片和资源块 | 已批准并导入 |

下载传输使用 Bevy 维护的 Kenney 资产镜像；每一个实际导入文件的镜像 URL、原始 Kenney 资源包、许可证和本地路径都记录在 `assets/art/asset-license-manifest.json`。镜像仅作传输地址，不改变作者和许可归属。

## 导入和使用约束

1. 只导入清单列出的文件；新增外部文件必须先新增审计记录和清单条目。
2. 这些模型必须通过 Cocos Creator 导入并转换为可实例化的美术预制体；运行时世界不得再以 `MeshFactory` 几何体作为正式道路、建筑、树木、围栏或车辆。
3. 允许为性能、材质、碰撞和场景适配修改模型；修改结果仍必须遵守 CC0 及本清单追溯要求。
4. GLB 内嵌贴图子资源不可被 Creator 3.8.3 安全地嵌套保存到本世界库。运行时材质必须改用同一 Kenney 资源包中、经 Creator 导入并登记在清单里的外置 `Textures/colormap.png`；禁止重新引用 `gltf-embeded-image` 子资源。
5. 本次基础导入不代表“模型美术门禁”通过；该门禁须在 Cocos Creator 中保存预制体、接入真实场景、运行截图与 Console 检查均完成后才可判定。
6. 车辆与小物件的形状均来自实际 glTF 网格；禁止使用 Box、Cylinder 或 Sphere 伪造正式可见的回收物、车体、道路或建筑。黑洞核心的动态光环属于特效例外。
