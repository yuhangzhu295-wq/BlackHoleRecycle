# 黑洞回收站 | 混元世界模型参考图包（7张独立场景）

优先在 https://3d.hunyuan.tencent.com/sceneTo3D 选择「世界生成」，不要选择「360°全景图」。

首次测试：上传 `01_Golden_Arena.png`，只提交一次生成任务；生成成功后检查空间质量、导出格式及可漫游效果，再决定是否生成余下区域。

说明：图片均是视觉参考，不是可直接用于游戏的3D模型。混元世界场景可能返回 3DGS/SPZ 和碰撞网格 PLY；不得假设它是含独立道路/建筑的可编辑GLB。正式小游戏建议生成可复用的单体GLB资产，再经Blender优化并用Cocos Creator现有世界系统装配。

上传规则：每次仅上传一个独立场景；不使用含UI、排行榜、黑洞角色、文字的整页设计图。官网 TokenHub 场景 API 当前说明图生场景和文生场景二选一，网页版以实际控件为准。

文件顺序：
01_Golden_Arena.png - Golden Arena 优先测试样板
02_Residential.png - 住宅街区
03_Warehouse_Logistics.png - 仓库物流区
04_Supermarket_Commercial.png - 商业超市区
05_Parking_District.png - 停车场区
06_Construction_District.png - 建筑工地区
07_City_Center.png - 市中心区

若用文本生场景，请参考同包 `Hunyuan_Scene_Prompts.txt`。如网页不能同时接受图和提示词，不要强行同时提交。

腾讯官方使用指南：https://cloud.tencent.com/document/product/1823/136578
