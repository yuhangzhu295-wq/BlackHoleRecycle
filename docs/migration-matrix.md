# 《黑洞回收站》迁移矩阵

历史 Three.js 原型位于 `legacy/threejs-prototype/`，仅作参考，绝不参与当前构建或验收。

| 历史基准 | 当前 Cocos Creator 3.8.3 实现 | 状态 |
| :--- | :--- | :--- |
| `legacy/threejs-prototype/src/data/GameConfig.js` | `cocos/assets/scripts/data/GameConfig.ts` | 强类型配置迁移 |
| `legacy/threejs-prototype/src/data/SaveManager.js` | `cocos/assets/scripts/data/SaveService.ts` | 存档迁移 |
| `legacy/threejs-prototype/src/core/*.js` | `cocos/assets/scripts/core/*.ts` | 事件、状态机、对象池重写 |
| `legacy/threejs-prototype/src/3d/objects/TrashObject.js` | `cocos/assets/scripts/gameplay/CompressibleObject.ts` | Cocos 吸附状态机重写 |
| `legacy/threejs-prototype/src/3d/machine/BlackHoleMachine.js` | `cocos/assets/scripts/machine/BlackHoleMachine.ts` | Cocos 机器与涡流渲染重写 |
| `legacy/threejs-prototype/src/3d/chunks/WorldChunkManager.js` | `cocos/assets/scripts/world/InfiniteWorldManager.ts` | 二维流式世界重写 |
| `legacy/threejs-prototype/src/ui/UIManager.js` | `cocos/assets/scripts/ui/*.ts` | Home、Mode、HUD、Revive、Settlement 页面重写 |

当前唯一构建入口是根目录 `package.json` 中的 Cocos 命令。
