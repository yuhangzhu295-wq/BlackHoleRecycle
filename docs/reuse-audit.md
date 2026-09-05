# 《黑洞回收站》复用与许可审计

当前正式运行时为 Cocos Creator 3.8.3 + TypeScript。核心玩法、状态机、对象池和 UI 控制器均位于 `cocos/assets/scripts/`，采用 Cocos 原生 `cc` 类型。

| 资源/参考 | 实际使用 | 许可与证据 |
| :--- | :--- | :--- |
| Cocos Creator | 正式引擎 | 3.8.3 官方安装与构建命令 |
| City / park / road 3D 套件 | 已导入的环境模型 | `cocos/docs/v2-asset-reuse-audit.md` |
| Poly by Google bulldozer | 已导入竞技对手模型 | `cocos/docs/third-party-attributions.md`，CC-BY 3.0 署名 |
| 历史 Three.js 原型 | 仅行为与迁移参考 | `legacy/threejs-prototype/`，不参与构建 |

不得把历史 Three.js 文件、Vite 产物或其测试报告称为当前 Cocos 工程的运行证据。
