# BlackHoleRecycle V2 外部 3D 资产复用审计

## 审计结论

本次世界美术基础层优先选用 Kenney 发布、明确标注为 **CC0** 的低多边形 glTF 资产；玩家履带回收机底盘使用一项经单独审计的 Poly by Google **CC-BY 3.0** 模型。CC0 允许商业使用、修改和再分发，不要求署名；CC-BY 3.0 允许商业使用但必须保留署名。项目会在资产清单和署名文档中保留作者与来源，便于追溯。未列入清单的网络模型一律不得进入工程。

## 已批准的资源包

| 资源包 | 作者 | 许可 | 官方来源 | 本阶段用途 | 状态 |
| --- | --- | --- | --- | --- | --- |
| City Kit: Roads | Kenney | CC0 1.0 Universal | https://kenney.nl/assets/city-kit-roads | 道路、路口、低地块 | 已批准并导入 |
| City Kit: Suburban | Kenney | CC0 1.0 Universal | https://kenney.nl/assets/city-kit-suburban | 建筑、树木、围栏、步道 | 已批准并导入 |
| City Kit: Commercial | Kenney | CC0 1.0 Universal | https://kenney.nl/assets/city-kit-commercial | 小型商店与城市地标 | 已批准并导入 |
| Car Kit | Kenney | CC0 1.0 Universal | https://kenney.nl/assets/car-kit | 回收车底盘、静态车辆、轮胎、回收碎片和资源块 | 已批准并导入 |
| Food Kit | Kenney | CC0 1.0 Universal | https://kenney.nl/assets/food-kit | 苹果、易拉罐与瓶装回收物 | 已由 Creator 导入并接入语义模板 |
| Furniture Kit | Kenney | CC0 1.0 Universal | https://kenney.nl/assets/furniture-kit | 书本、纸箱、椅子、桌子、显示器、货架与沙发 | 已由 Creator 导入并接入语义模板 |
| Factory Kit | Kenney | CC0 1.0 Universal | https://kenney.nl/assets/factory-kit | 工业木箱 | 已由 Creator 导入并接入语义模板 |
| City Kit: Industrial | Kenney | CC0 1.0 Universal | https://kenney.nl/assets/city-kit-industrial | 集装箱 | 已由 Creator 导入并接入语义模板 |
| Poly Pizza 单模型（Battery、Bucket、Paper、Trash Bag） | Quaternius | CC0 1.0 Universal | https://poly.pizza | 电池、油漆桶、纸屑、垃圾袋 | 已由 Creator 导入并接入语义模板 |
| Poly Pizza 单模型（Rubber Duck） | CreativeTrio | CC0 1.0 Universal | https://poly.pizza | 玩具鸭 | 已由 Creator 导入并接入语义模板 |
| Poly Pizza 单模型（Bulldozer） | Poly by Google | CC-BY 3.0 | https://poly.pizza/m/eY1N7Rz9Drr | 玩家履带回收机底盘 | 已由 Creator 导入并接入机器模板 |

下载传输使用 Bevy 维护的 Kenney 资产镜像；每一个实际导入文件的镜像 URL、原始 Kenney 资源包、许可证和本地路径都记录在 `assets/art/asset-license-manifest.json`。镜像仅作传输地址，不改变作者和许可归属。

本次新增回收物使用 Kenney 官方资源包下载页与 Poly Pizza 的单模型原始 GLB。清单分别记录资源包或原始 GLB 的 SHA-256；`modified: false` 表示二进制模型未被改写，Cocos 场景中的尺度与绑定属于工程装配，不会覆盖原始文件。

## 导入和使用约束

1. 只导入清单列出的文件；新增外部文件必须先新增审计记录和清单条目。
2. 这些模型必须通过 Cocos Creator 导入并转换为可实例化的美术预制体；运行时世界不得再以 `MeshFactory` 几何体作为正式道路、建筑、树木、围栏或车辆。
3. 允许为性能、材质、碰撞和场景适配修改模型；修改结果仍必须遵守 CC0 及本清单追溯要求。
4. 场景模板不得嵌套 glTF 预制体依赖。道路、建筑和普通车辆运行时材质使用同一 Kenney 资源包中、经 Creator 导入并登记在清单里的外置 `Textures/colormap.png`；履带回收机的原始颜色贴图则作为 `WorldArtLibrary.bulldozerColorTexture` 由 Creator 保存为显式 `Texture2D` 引用，并已通过 Web Mobile 实机构建验证。
5. 本次基础导入不代表“模型美术门禁”通过；该门禁须在 Cocos Creator 中保存预制体、接入真实场景、运行截图与 Console 检查均完成后才可判定。
6. 车辆与小物件的形状均来自实际 glTF 网格；禁止使用 Box、Cylinder 或 Sphere 伪造正式可见的回收物、车体、道路或建筑。黑洞核心的动态光环属于特效例外。
