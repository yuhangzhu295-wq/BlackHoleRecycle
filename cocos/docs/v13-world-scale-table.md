# V13 世界尺度表（PHASE B）

由 `art-source/tools/audit_glb_scale.py`（Blender 无头导入，不是手解 GLB）对
`cocos/assets/art` 下 **62 个 3D 资产**实测生成，原始证据在
`artifacts/qa/v13/glb-scale-audit.json`。

**为什么一张表就够了**：`ObjectArtRegistry.unitScale()` 恒为 `(1,1,1)` ——
GLB 自身单位**就是世界单位**，运行时没有任何东西缩放模型。所以资产自身超尺寸
就是真的超尺寸，**换摄像机掩盖不了**（这正是 V13 指令明确要求的）。

**轴约定**：Blender 的 glTF 导入会把 Y-up 转成 Z-up，所以**高度是 Z**，原文件里
的 Z（模型长度）落在 Blender 的 Y 上。这个审计的第一版按 Y 读高度，把轿车报成
「1.50 宽 × 2.55 高 × 1.30 长」——一辆两米半高的汽车。已用 `sedan` 交叉验证：
最小 z = 0.0、最大 z = 1.3，即车确实贴地、确实只有 1.3 高。

**三列结论**：
- `base_z` 非 0 = 该模型**不贴地**，按 yOffset 0 放置就会浮起或陷下去；
- `pivot` 非 0 = 枢轴不在占地中心，会绕错误的点旋转/缩放；
- `NO-UV` = 没有 UV 层，贴图显示不出来（可能渲染成纯色或洋红）。

| 分组 | 资产数 | 说明 |
| --- | ---: | --- |
| world | 31 | 城市主体。最高 `commercial-skyscraper-b` 4.48 |
| recyclables | 17 | 可吞物层级清晰：0.06（鸭子）→ 0.88（货架） |
| vehicles | 3 | 1.5×3.25 货车 / 1.5×2.55 轿车，比例一致 |
| machine-modules | 6 | 机器组装件，1.2 高上下 |
| props | 4 | — |
| machines | 1 | **poly-google-bulldozer 12.85 × 17.68 × 11.52** |

**两件必须报给所有者的事**：

1. `cocos/assets/art/machines/poly-google-bulldozer.glb` 占 **12.85 × 17.68 × 11.52**，
   高 17.68 单位，而普通建筑只有 1.2–4.5。它**仍在服役**（`MachineVisual_LV2/3` 与
   `PolyGoogleBulldozerChassis` 引用了它）。它大到明显超出同一世界观，且文件名自带
   外部来源标识，**授权无法从仓库内核实**——按指令「必要时引入统一风格、许可证可核实
   的低模资产」，这条需要所有者确认授权或替换。
2. 11 个资产不贴地、11 个枢轴偏中心、1 个没有 UV 层（`battery.glb`）。这些在截图里
   会表现为浮空、绕错误点旋转、或贴图显示不出来。

## 全量表

| 资产 | 高 | 占地 | 三角面 | 基准 / 枢轴 / UV |
| --- | ---: | --- | ---: | --- |

| 资产 | 高 | 占地 | 三角面 | 基准 / 枢轴 / UV |
| --- | ---: | --- | ---: | --- |
| vehicles/delivery-van.glb | 1.65 | 1.50 x 3.25 | 2476 | ok |
| vehicles/garbage-truck.glb | 1.60 | 1.60 x 3.45 | 3124 | ok |
| vehicles/sedan.glb | 1.30 | 1.50 x 2.55 | 2032 | ok |
| world/pretty-park/tree_large.gltf | 4.98 | 2.75 x 2.69 | 500 | base_z=-0.20 |
| world/pretty-park/street_lantern.gltf | 4.50 | 0.94 x 0.94 | 424 | base_z=-0.20 |
| world/city/commercial-skyscraper-b.glb | 4.48 | 1.36 x 1.36 | 1592 | ok |
| world/pretty-park/tree.gltf | 3.62 | 2.48 x 2.37 | 320 | base_z=-0.20 |
| world/city/commercial-skyscraper-a.glb | 2.88 | 1.36 x 1.36 | 1292 | ok |
| world/city/commercial-building-f.glb | 1.69 | 0.84 x 1.03 | 1794 | ok |
| world/city/commercial-building-g.glb | 1.69 | 0.97 x 0.92 | 2006 | ok |
| world/pretty-park/fountain.gltf | 1.60 | 4.00 x 4.00 | 1646 | ok |
| world/pretty-park/hedge_corner.gltf | 1.50 | 2.75 x 2.75 | 432 | pivot 0.6,-0.6 |
| world/pretty-park/hedge_straight_long.gltf | 1.50 | 4.00 x 1.50 | 372 | ok |
| world/pretty-park/bench.gltf | 1.41 | 2.00 x 1.32 | 396 | pivot 0.0,0.1 |
| world/city/commercial-building-a.glb | 1.29 | 0.88 x 0.94 | 1252 | ok |
| world/city/commercial-building-d.glb | 1.29 | 0.84 x 0.90 | 1100 | ok |
| world/city/commercial-building-h.glb | 1.29 | 0.88 x 1.01 | 1512 | ok |
| world/pretty-park/trashcan.gltf | 1.14 | 1.00 x 1.00 | 504 | ok |
| world/residential/building-type-b.glb | 1.14 | 1.83 x 1.14 | 1748 | ok |
| world/residential/building-type-c.glb | 1.03 | 1.29 x 1.03 | 1196 | ok |
| world/environment/tree-large.glb | 0.77 | 0.21 x 0.24 | 42 | ok |
| world/pretty-park/bush_large.gltf | 0.76 | 1.50 x 1.41 | 312 | ok |
| world/roads/street-light.glb | 0.60 | 0.05 x 0.24 | 60 | pivot 0.0,0.1 |
| world/environment/tree-small.glb | 0.57 | 0.21 x 0.24 | 42 | ok |
| world/pretty-park/floor_grass_sliced_base.gltf | 0.50 | 2.00 x 2.00 | 12 | base_z=-0.50 |
| world/environment/fence.glb | 0.27 | 0.47 x 0.07 | 88 | ok |
| world/pretty-park/cobble_stones_large.gltf | 0.15 | 2.02 x 1.83 | 1232 | base_z=-0.10 pivot -0.1,0.0 |
| world/pretty-park/flower_A.gltf | 0.14 | 0.45 x 0.45 | 192 | ok |
| world/pretty-park/flower_B.gltf | 0.11 | 0.31 x 0.30 | 166 | base_z=-0.02 |
| world/roads/construction-cone.glb | 0.09 | 0.07 x 0.07 | 66 | ok |
| world/environment/tile-low.glb | 0.02 | 1.00 x 1.00 | 12 | ok |
| world/roads/road-crossroad-path.glb | 0.02 | 1.00 x 1.00 | 276 | ok |
| world/roads/road-straight.glb | 0.02 | 1.00 x 1.00 | 44 | ok |
| world/environment/path-stones-long.glb | 0.01 | 0.14 x 0.40 | 48 | ok |
| recyclables/furniture/shelf.glb | 0.88 | 0.40 x 0.25 | 320 | pivot 0.2,0.1 |
| recyclables/props/paint-bucket.glb | 0.68 | 0.76 x 0.71 | 532 | ok |
| recyclables/food/soda-bottle.glb | 0.58 | 0.18 x 0.16 | 100 | ok |
| recyclables/props/trash-bag.glb | 0.56 | 0.50 x 0.50 | 1044 | ok |
| recyclables/industrial/crate.glb | 0.55 | 1.10 x 1.00 | 70 | ok |
| recyclables/props/paper-scrap.glb | 0.52 | 0.51 x 0.31 | 304 | base_z=-0.28 |
| recyclables/furniture/chair.glb | 0.47 | 0.20 x 0.20 | 170 | pivot 0.1,0.1 |
| recyclables/furniture/sofa.glb | 0.46 | 0.98 x 0.41 | 128 | pivot 0.5,0.2 |
| recyclables/props/battery.glb | 0.46 | 0.18 x 0.18 | 132 | **NO-UV** |
| recyclables/food/soda-can.glb | 0.35 | 0.23 x 0.23 | 164 | ok |
| recyclables/industrial/shipping-container.glb | 0.35 | 0.37 x 0.82 | 402 | ok |
| recyclables/furniture/monitor.glb | 0.29 | 0.39 x 0.10 | 72 | pivot 0.2,0.1 |
| recyclables/furniture/cardboard-box.glb | 0.28 | 0.21 x 0.21 | 60 | pivot 0.1,0.1 |
| recyclables/furniture/coffee-table.glb | 0.23 | 0.66 x 0.40 | 124 | pivot -0.1,0.1 |
| recyclables/food/apple.glb | 0.19 | 0.20 x 0.20 | 136 | ok |
| recyclables/furniture/book-stack.glb | 0.10 | 0.15 x 0.09 | 62 | pivot 0.1,0.0 |
| recyclables/props/toy-duck.glb | 0.06 | 0.06 x 0.07 | 710 | ok |
| machine-modules/magnetic-pipe.glb | 1.75 | 1.20 x 1.50 | 342 | ok |
| machine-modules/compression-chassis.glb | 1.35 | 1.20 x 1.60 | 320 | ok |
| machine-modules/compression-engine.glb | 1.30 | 1.20 x 1.50 | 268 | ok |
| machine-modules/singularity-hopper.glb | 1.00 | 1.12 x 1.12 | 144 | ok |
| machine-modules/gravity-wing-frame.glb | 0.80 | 1.01 x 1.20 | 296 | ok |
| machine-modules/magnetic-turbine.glb | 0.23 | 1.00 x 1.00 | 224 | base_z=-0.15 |
| props/recycling-box.glb | 0.71 | 0.71 x 0.71 | 124 | ok |
| props/tire.glb | 0.60 | 0.35 x 0.60 | 288 | base_z=-0.30 |
| props/turbine-wheel.glb | 0.60 | 0.40 x 0.60 | 332 | base_z=-0.30 |
| props/recycling-bolt.glb | 0.26 | 0.17 x 0.20 | 36 | ok |
| machines/poly-google-bulldozer.glb | 11.52 | 12.85 x 17.68 | 2518 | base_z=-1.10 |