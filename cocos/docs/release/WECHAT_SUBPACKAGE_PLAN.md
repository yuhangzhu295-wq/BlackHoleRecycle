# WECHAT_SUBPACKAGE_PLAN — 微信小游戏分包方案（PHASE WP0 + WP2 + WP3 + WP3b）

- 基线 commit：`d3214e4383caedfc23ab73bcc7bd5af1bb67e918`（`origin/main` 同步，HEAD 未变）
- 构建：`npm run build:wx`（Cocos Creator 3.8.3，`platform=wechatgame;debug=false;orientation=portrait`）
- WP0 产物：`cocos/build/wechatgame/`，**191 文件 / 16,667 KB**（无任何分包）
- WP2 产物：`cocos/build/wechatgame/`，**201 文件 / 16,680 KB**，其中 `subpackages/world-city/` **1,442 KB**，主包 **15,238 KB**
- 数据来源：`wechat-package-audit.json`、`wechat-bundle-map.json`（均由 `scripts/audit_wechat_package.mjs` 生成，可复跑）
- **WP0 未移动任何资源；WP2 只改配置、零文件搬迁。**

**状态：PHASE WP2 三项验收判据全部通过（见 §2.6），但试点 Bundle 尚不可发布（见 R9）。**

---

## 1. 平台规则（已对官方文档核验，非旧记忆）

| 规则 | 数值 | 来源 |
| --- | --- | --- |
| 代码包总大小 | **≤ 30 M** | [微信 · 代码包](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/code-package.html)：「代码包总大小不能超过 30M，单个分包不限制大小，主包不超过 4M。」 |
| 主包 | **≤ 4 M** | 同上 |
| 单个普通分包 | **不限制大小** | 同上 |
| 单个独立分包 | ≤ 4 M | [微信 · 分包加载](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/subPackage/useSubPackage.html) |
| 分包配置字段 | `game.json` → `subpackages: [{ name, root }]` | 同上 |
| 分包加载 API | `wx.loadSubpackage`；预下载 `wx.preDownloadSubpackage`（基础库 **3.4.9+**） | 同上 |
| 开放数据域目录 | **不能**设为分包或置于分包下 | 同上 |
| 上传文件类型 | 白名单制，`.glb/.gltf/.fbx/.bin/.png/.json/.wasm/.ktx/.astc` 等在白名单内 | 微信 · 代码包「文件类型」 |

Cocos Creator 侧（[Asset Bundle](https://docs.cocos.com/creator/3.8/manual/zh/asset/bundle.html)、[小游戏分包](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/subpackage.html)）：

### 「小游戏分包」的**正式配置位置**（WP2 实测确认，非文档推断）

WP0 初稿曾写「构建时还需把构建发布面板的『主包压缩类型』也设为小游戏分包」。WP2 用三次受控构建
证明这条**不适用于自定义 Bundle**，并定位到真正的配置存储。实测结论：

| 位置 | 是否有效 | 说明 |
| --- | --- | --- |
| Bundle 文件夹 `.meta` → `userData.compressionType` | ❌ **无效** | `.meta` 的 `userData` 里**没有**这个字段。`resources.meta`（全项目唯一由编辑器写出的 Bundle 配置）只有 `isBundle` / `bundleConfigID` / `bundleName` / `priority`。手写 `compressionType` 被完全忽略。 |
| `cocos/settings/v2/packages/builder.json` → 顶层 `mainBundleCompressionType` | ❌ **无效** | `mainBundleCompressionType` 是**构建任务选项**（`IBuildOptionBase`），不是项目设置键。 |
| `cocos/profiles/v2/packages/builder.json` → `common.mainBundleCompressionType` | ⚠️ 有效但**只作用于内置 `main` 包**，且 `cocos/profiles/` 被 gitignore | 这是构建发布面板「主包压缩类型」的本地记忆值。 |
| **`cocos/settings/v2/packages/builder.json` → `bundleConfig.custom`** | ✅ **有效（本方案采用）** | 项目设置 → **Bundle 配置** 页的持久化键（`builtin/builder/package.json` → `contributions.profile.project["bundleConfig.custom"]`，默认 `{}`）。 |
| **Bundle 文件夹 `.meta` → `userData.bundleConfigID`** | ✅ **有效** | 指向 `bundleConfig.custom` 里的某个**配置方案**；`"default"` 是内置方案（全部 `merge_dep`）。 |

**Creator 侧机制**（读自编辑器内部，`app.asar` 内 `builtin/builder` 的类型与模板；实现体 `.ccc` 已加密，故以受控构建实测为准）：

- 一个 Bundle 的压缩类型 = `bundleConfig.custom[bundleConfigID].configs[平台类型]`，平台类型 ∈ `native | miniGame | web`（`wechatgame` → `miniGame`）。
- `miniGame` 分支有两个模式：`fallbackOptions`（「统一配置」= 所有小游戏通用）与 `overwriteSettings`（「单独配置」= 按具体小游戏平台覆盖）。未设 `configMode` 时按 `fallbackOptions` 处理。
- 平台插件在 `onBeforeBuildAssets` 里对 `bundles[].isSubpackage === true` 的 Bundle 做
  `dest = join(dirname(dest), 'subpackages/' + name)`，并在 `onAfterBuild` 写 `game.json` 的
  `subpackages: [{name, root}]`。**这一切由 Creator 自己完成，我们不手写构建产物、不手改 `game.json`。**

本方案实际写入的配置（WP2 采用，可直接复现）：

```json
// cocos/settings/v2/packages/builder.json
{
  "__version__": "1.3.8",
  "textureCompressConfig": { "genMipmaps": false },
  "bundleConfig": {
    "custom": {
      "mini-game-subpackage": {
        "displayName": "Mini Game Subpackage",
        "configs": { "miniGame": { "fallbackOptions": { "compressionType": "subpackage", "isRemote": false } } }
      }
    }
  }
}
```

```json
// cocos/assets/art/world/city.meta → userData
{ "isBundle": true, "bundleConfigID": "mini-game-subpackage", "bundleName": "world-city", "priority": 9 }
```

> 在 GUI 里的等价操作：**项目设置 → Bundle 配置 → 新增配置方案**，命名为「Mini Game Subpackage」，
> 平台选 **小游戏**，勾「统一配置」，压缩类型选 **小游戏分包**；然后在资源管理器选中
> `assets/art/world/city`，**配置为 Bundle**，Bundle 名称 `world-city`，优先级 9，
> 「目标平台」下拉选该方案。

**优先级仍是关键**：`world-city` 用 priority **9**（> `main`=7）才会让 city 的 native 载荷
**离开** `main` 进入该 Bundle；priority **1**（< `main`）时 Creator 让 `main` 胜出，Bundle 里只剩
34 KB 元数据，**载荷一步没搬**（WP2 两次受控构建实测，见 §2.6）。

- **小游戏分包只能放本地**：压缩类型为「小游戏分包」时「配置为远程包」被锁死不可勾选。
- 内置 Bundle 优先级：`main`=7、`resources`=8、`start-scene`=20、`internal`=21；自定义 Bundle 优先级不应高于内置。
- **Asset Bundle 不支持嵌套。**
- 同资源被不同优先级 Bundle 引用 ⇒ 归高优先级、低优先级只留依赖记录；**同优先级多个 Bundle 引用 ⇒ 每个 Bundle 各复制一份**（会增大总体积）。
- 「不同 Asset Bundle 中的脚本建议最好不要互相引用，否则可能会导致在运行时找不到对应脚本。」
- 微信等平台不允许加载远程脚本 ⇒ Creator 把 Bundle 代码拷到 `src/bundle-scripts/`。

> **口径更正**：检索到一份镜像页 `mp.weixin.qq.com/debug/minigame/dev/guide/framework/code-package.html` 写「总大小 8M / 单个分包 4M」。该页与当前正式文档不一致，**以 `developers.weixin.qq.com/.../code-package.html` 的 30M / 不限 / 4M 为准**。

### 内部 Headroom 目标

主包内部目标 = 官方 4 M 的 **85% ≈ 3,482 KB**。**这是我们自己留的余量，不是微信的硬阈值。**

---

## 2. PHASE WP0 审计结果

### 2.1 现状：无任何分包

`cocos/build/wechatgame/game.json` 只有 `deviceOrientation` 与 `networkTimeout`，**没有 `subpackages` 字段** ⇒ 全部 16,667 KB 计入主包 ⇒ **超 4 M 上限 4.07 倍**。

### 2.2 体积构成

按类别（全包）：

| 类别 | KB | 说明 |
| --- | --- | --- |
| Mesh | 8,457 | 网格 + glTF buffer，最大头 |
| EngineJS | 4,051 | `cocos-js/` 引擎 |
| Texture | 1,855 | |
| AssetDataJSON | 1,618 | 合并后的 `import/*.json` |
| BundleJS | 306 | `assets/main/index.js`（项目代码） |
| ProjectJS | 237 | `src/` |
| PlatformJS | 131 | 平台适配层 |
| ConfigJSON | 11 | |

按归属（owner，全包 = 主包，因无分包）：

| owner | KB | 占比 |
| --- | --- | --- |
| `BOOT_REQUIRED` | 7,177 | 43.1% |
| `WORLD_CONSTRUCTION` | 4,617 | 27.7% |
| `SHARED_RUNTIME` | 3,725 | 22.4% |
| `WORLD_CITY` | 896 | 5.4% |
| `ENDLESS_ONLY` | 244 | 1.5% |
| `WORLD_OPENING` | 8 | 0.05% |
| `ARENA_ONLY` | **0** | 无专属资源 |
| `COSMETIC_OPTIONAL` | **0** | 无专属资源 |
| `DEV_QA` | **0（按字节不可分）** | 见 §2.4 |

### 2.3 Top 最大文件（前 10）

| # | KB | owner | 文件 / 源资源 |
| --- | --- | --- | --- |
| 1 | 4,274 | WORLD_CONSTRUCTION | `assets/resources/native/41/41c6d840-…@8fac0.bin` ← `resources/art/construction/majadroid-construction-site.fbx` |
| 2 | 3,078 | BOOT_REQUIRED | `cocos-js/_virtual_cc-bf7083ae.js` |
| 3 | 1,208 | SHARED_RUNTIME | `assets/main/native/9b/9b34ec81-…@77daa.png` ← `art/machines/poly-google-bulldozer.glb` |
| 4 | 598 | BOOT_REQUIRED | `assets/internal/import/0b/0b2bbb7a0.json` |
| 5 | 458 | BOOT_REQUIRED | `cocos-js/assets/bullet.release.wasm-10f8cbd4.wasm` |
| 6 | 458 | BOOT_REQUIRED | `assets/main/native/6b/6b875dba-….png` ← `textures/home/home_city_park.png` |
| 7 | 443 | BOOT_REQUIRED | `cocos-js/assets/spine-59f406dc.wasm` |
| 8 | 305 | SHARED_RUNTIME | `assets/main/index.js`（项目代码） |
| 9 | 257 | SHARED_RUNTIME | `…/9b34ec81-…@17fd0.bin` ← `poly-google-bulldozer.glb` |
| 10 | 199 | BOOT_REQUIRED | `src/chunks/bundle.js` |

完整 Top 50 见 `wechat-package-audit.json` → `topLargestFiles`。

### 2.4 归属可解析度与两个诚实边界

- 构建产物 → uuid → 源路径的解析率：**97.41%（156/162 个资源文件）**，未解析 317 KB。未解析部分留在 `main`，**不猜测、不摊派**。
- 解析链：`native/<xx>/<uuid>@<sub>.<ext>` 直接带 uuid；`import/<xx>/<name>.json` 经 `config.json.packs` → `config.uuids`（base64 压缩）→ Creator 的 `decodeUuid` 展开。源路径来自 Creator 自己的索引 `cocos/library/.assets-info1.0.0.json`（路径 → uuid，脚本内反转）。
- **合并 import 文件**：一个 `import/*.json` 可含多个资源（`packs[name]` 是索引数组）。跨 owner 时按**各成员源文件大小加权**分摊，并在 `ownerBasis` 标注 `pack-shared-source-weighted`；无法加权则退化为等分并标注。**分摊过程可见。**
- **项目 TypeScript 被编译进单体 JS**：`assets/main/index.js`(306 KB) + `src/chunks/bundle.js`(199 KB) 无法按脚本归属切分。因此 **`DEV_QA` 字节无法分离** —— 但已证实它**确实随包发布**：`QABridge` 在发布 JS 中出现 8 次、`WorldCompositionProbe` 6 次。这是**独立于分包问题的缺陷**（发布包含调试代码），需业主决定处理方式。

### 2.5 关键结构发现：区域与美术不是一一对应

`DistrictTemplates.ts` 的 6 个推进区域 → 4 个美术目录：

| 区域 | DistrictKind | 专属美术 | 体积 |
| --- | --- | --- | --- |
| `bedroom` | RESIDENTIAL | `art/world/residential` | 241 KB 源 |
| `warehouse` | WAREHOUSE | **无** | — |
| `supermarket` | SUPERMARKET | **无** | — |
| `parking` | PARKING | **无** | — |
| `construction` | CONSTRUCTION | `resources/art/construction` | 771 KB 源 → **4,617 KB 构建** |
| `city` | DOWNTOWN | `art/world/city` | 886 KB 源 |

⇒ **`WORLD_WAREHOUSE` / `WORLD_SUPERMARKET` / `WORLD_PARKING` 三个区域没有专属资源**，它们的差异是数据/语义层（`resourceClusters.preferredTypes` 决定刷什么收集物），不是美术层。按区域拆 Bundle 对这三个区域**不可能减包**；强行拆只会因「同优先级复制」而**增大**总体积。

`art/world/{environment,roads,pretty-park}`（384 KB 源）被所有区域共用 ⇒ 归 `shared-gameplay`。

`ARENA_ONLY` 与 `COSMETIC_OPTIONAL` 同样**无专属资源**：Arena 复用同一套 `Game.scene` 与共享美术；5 个皮肤在 `GameConfig.ts:296 SKINS_CONFIG` 里是纯 `color`/`rimColor` 数据，套在既有机器美术上。⇒ 这两个 Bundle 现在建了也只会复制资源，**故保留为空**。

---

### 2.6 PHASE WP2 实测结果（真实构建，替换 WP0 估算）

四次受控构建（`npm run build:wx`，每次全机仅 **1 个** Cocos build）：

| 构建 | 配置 | 文件数 | `subpackages/` | `game.json.subpackages` | `assets/world-city/` | `assets/main/` |
| --- | --- | --- | --- | --- | --- | --- |
| A | priority **1**，meta `compressionType` | 201 | ❌ 无 | ❌ 无 | 34 KB（仅元数据） | 6,764 KB |
| B | priority **9**，meta `compressionType` | 201 | ❌ 无 | ❌ 无 | 1,483 KB | 5,863 KB |
| C | B + 项目设置顶层 `mainBundleCompressionType` | 201 | ❌ 无 | ❌ 无 | 1,483 KB | 5,863 KB |
| **D** | **`bundleConfig.custom` + meta `bundleConfigID`** | 201 | ✅ **有** | ✅ **有** | 移入 `subpackages/world-city/` | **5,570 KB** |

A/B/C 三次共同证明 `.meta.compressionType` 与项目设置顶层 `mainBundleCompressionType` 都是**无效写入**；
D 一次证明 `bundleConfig.custom` + `bundleConfigID` 是**有效写入**（配置见 §1）。

#### D 的三项验收判据（mandate 原文逐条）

| 判据 | 结果 |
| --- | --- |
| `subpackages/<pilot>` 真实存在 | ✅ `cocos/build/wechatgame/subpackages/world-city/`，**19 文件 / 1,441.6 KB** |
| `game.json` 有正式分包声明 | ✅ `"subpackages": [{"name":"world-city","root":"subpackages/world-city/"}]` |
| 试点资源不再计入 Main | ✅ `assets/main/` 6,764 → **5,570 KB**；city 的 8 个 `.bin` 载荷全部在分包内；审计中 `WORLD_CITY` 已从主包归属表消失 |

#### 主包实测（微信口径 = `game.json.subpackages` 之外的**全部**字节）

| 口径 | WP0（无分包） | WP2（world-city 分包） | Δ |
| --- | --- | --- | --- |
| **主包** | 16,667 KB | **15,238 KB** | **−1,429 KB** |
| 分包 | 0 | 1,442 KB | +1,442 KB |
| 总包 | 16,667 KB | 16,680 KB | **+13 KB** |

> **分包确实在减主包，而且几乎没有额外代价。** 对比构建 B（同 priority 的**普通** Bundle）：
> 主包只降到 5,863 KB 且**总包 +686 KB**（5 个合并 import JSON 被复制进 Bundle）。
> 走「小游戏分包」压缩类型后那部分复制消失了，总包几乎不变。
> ⇒ **必须走 `subpackage` 压缩类型，不能只做普通 Bundle。**

#### 其他实测

- `src/settings.json` → `assets.subpackages: ["world-city"]`、`assets.projectBundles: ["internal","world-city","resources","main"]`、`assets.preloadBundles: [{"bundle":"resources"},{"bundle":"main"}]`
  —— **`world-city` 不在预加载列表**（这是 R9 的直接原因）。
- `assets/main/config.json` → `deps: ["internal","world-city"]`。
- 证据：`cocos/docs/evidence/final/platform/wechat-build-wp2-world-city-subpackage.json`；
  构建产物留存于 `cocos/build/.evidence-wp2-subpackage/`；A/B/C 留存于
  `cocos/build/.evidence-priority1|priority9|mainbundle-subpackage/`。
- 重跑审计（`scripts/audit_wechat_package.mjs`）：解析率 97.07%，主包 15,238 KB，
  `WORLD_CITY` 已不在主包归属中；**`WORLD_CONSTRUCTION` 4,617 KB 成为主包内最大可动项**。

**⚠️ 但 `world-city` 目前还不可发布 —— 见 R9。**

---

## 3. 建议的 Bundle 方案（`wechat-bundle-map.json`）

| Bundle | 内容（源路径） | 体积 | 类型 |
| --- | --- | --- | --- |
| `main`（内置） | 引擎、平台启动、`assets/internal`、`Bootstrap.scene`、`textures/home`、`HomePage`/`ModeSelectPage` prefab、全部 `scripts/**`、`Game.scene`、未解析元数据 | **7,705 KB** | 内置 |
| `world-construction` | `assets/resources/art/construction/**` | 4,617 KB | 小游戏分包 |
| `shared-gameplay` | `art/{machines,machine-modules,vehicles,recyclables,props}`、`art/world/{environment,roads,pretty-park}`、`prefabs/{art,machine,objects}`、`prefabs/ui/{HUD,EndlessHUD,PausePage,SettlementPage}`、`textures/ui` | 3,197 KB | 小游戏分包 |
| `world-city` | `assets/art/world/city/**` | 896 KB | 小游戏分包 |
| `endless` | `assets/art/world/residential/**`、`assets/prefabs/chunks/**` | 244 KB | 小游戏分包 |
| `world-opening` | `assets/prefabs/world/GoldenCityCell.prefab` | 8 KB | 小游戏分包 |
| `arena` | — | 0 KB | **保留** |
| `cosmetics` | — | 0 KB | **保留** |

合计 16,667 KB（与现状一致：**分包只搬家，不减总量**）。

> **保留 Bundle 的理由必须记录**：`arena` 与 `cosmetics` 现在没有可拆的资源。mandate 要求建立这两个 Bundle，但**建立空 Bundle 会与 `main` 形成「同资源多 Bundle 引用」风险**，因此本方案先**保留命名与边界**，待 Arena 或皮肤获得专属美术时再落配置。

`main` 的核心代码边界按 mandate 保留在 `main`：`GameManager`、`GameConfig`、`SaveService`、`WorldStreamer`、`WorldCellFactory`、`CompressibleObject`、`DynamicVehicle`、`ObjectPool`、Bundle Loader、核心 Mode State —— 第一轮**不为减包拆散核心共享 TypeScript**。

---

## 4. ⚠️ 核心结论：分包本身**无法**满足 4 M 主包上限

`wechat-bundle-map.json` → `verdict`：

```
mainUnderOfficialLimit : false
mainUnderInternalTarget: false
totalUnderOfficialLimit: true
```

| 口径 | 主包 | 对比 4,096 KB |
| --- | --- | --- |
| 现状（无分包） | 16,667 KB | **4.07×** |
| 本方案全部分包落配置后 | **7,705 KB** | **1.88×** |
| 再加低风险引擎裁剪 | **6,749 KB** | **1.65×** |

7,705 KB 的构成（`proposedMainSizeBySourceGroup`）：

| 来源 | KB |
| --- | --- |
| `cocos-js`（引擎） | 4,051 |
| `(build) assets`（Bundle 元数据 / 合并 import，保守全留主包） | 1,499 |
| `textures/home` | 907 |
| `(engine internal asset)`（skybox） | 850 |
| `src/` | 237 |
| 平台启动文件 | 156 |
| `scenes` | 2 |

**引擎单独就占 4,051 KB ≈ 主包上限的 99%。** 即使把全部区域美术、全部共享美术、全部 Home 贴图都搬走，主包仍然 > 4 M。⇒ **mandate 预期的「建 Bundle 即可过 PACKAGE GATE」不成立**，必须明确记录，不能靠调口径让它看起来通过。

### 4.1 WP2 实测后的真实账（替换上表的估算）

| 口径 | 主包 | 对比 4,096 KB |
| --- | --- | --- |
| WP0 现状（无分包，实测） | 16,667 KB | **4.07×** |
| WP2 已落地（`world-city` 分包，实测） | **15,238 KB** | **3.72×** |
| 若 §3 全部分包落配置（估算，未实测） | ≈ 7,705 KB | ≈ 1.88× |
| 再加低风险引擎裁剪 A+B（估算，未实测） | ≈ 6,749 KB | ≈ 1.65× |

**⇒ 仅靠「拆资源 Bundle」，即使全拆完，主包仍是上限的 1.65 倍。** 这不是执行力度问题，是**结构问题**：
主包里 `cocos-js/` 4,051 KB + `assets/internal` 601 KB + `src/` 237 KB + 平台适配 108 KB ≈ **5,000 KB**
本身就超过 4,096 KB，而这几项**都不是**区域美术，拆 Bundle 拆不掉。

### 4.2 ⚠️ 新发现：Creator 为微信内置了三个**引擎级/主包级**官方减包开关

WP2 期间从编辑器内部（`modules/platform-extensions/extensions/wechatgame/`）确认，它们**不在**
Asset Bundle 体系里，而是**平台构建选项**：

| 开关 | 键 | 作用 | 涉及体积 |
| --- | --- | --- | --- |
| **引擎插件（分离引擎）** | `packages.wechatgame.separateEngine` | 通过微信**共享全局引擎插件**，首包下载时剔除引擎文件 | `cocos-js/` **4,051 KB** |
| **引擎原生代码分包** | `packages.wechatgame.wasmSubpackage` | 把引擎原生代码（wasm/asmjs）作为小游戏分包 | `bullet.release.wasm` 469 KB + `spine-*.wasm` 454 KB ≈ **923 KB** |
| **主包压缩类型 = 小游戏分包** | 构建任务选项 `mainBundleCompressionType`（本地持久化于 `cocos/profiles/v2/packages/builder.json` → `common`） | 把**内置 `main` bundle 整体**放进 `subpackages/main` | `assets/main/` **5,570 KB** |

i18n 原文（`modules/platform-extensions/extensions/wechatgame/i18n/zh.js`，逐字引用）：

> `separate_engine`：「启用微信引擎插件（分离引擎）」
> `separate_engine_tips`：「该功能是通过共享全局引擎，来减小每个小游戏的首包大小。（仅支持 Cocos Creator 正式版本和非调试模式）启用后，如果引擎在手机中已经有缓存，首包下载时将会自动剔除引擎文件，加载手机中缓存的完整版引擎。如果手机中没有缓存，将会加载完整首包，完整首包里会包含剔除后的引擎」
> `wasm_subpackage`：「引擎原生代码(wasm/asmjs)分包」
> `wasm_subpackage_tips`：「将引擎原生代码模块作为小游戏分包，以减少主包包体。」
> `remote_server_address_tips`：「…由于微信小游戏限制原生包为 4 MB，如果大于的话可以把部分资源存放到服务器进行下载」

⚠️ 三条硬约束（同样来自该 i18n）：

- `separate_engine` **仅支持 Cocos Creator 正式版本 + 非调试模式**（`separate_engine_only_in_normal_version`、`separate_engine_with_debug`）；
- 启用分离引擎后「原生代码打包模式为 Wasm 且 Wasm 压缩设置无效」（`separate_engine_with_wasm`）⇒ 与 `wasmSubpackage` **不叠加**；
- 使用**自定义引擎**时无效（`separate_engine_with_custom_engine`）。本项目用内置引擎、`debug=false`、编辑器为 3.8.3 正式版 ⇒ 条件满足，但**尚未实测**。

⇒ **结论更新**：4 M 主包上限**不是**靠「拆资源 Bundle」达到的，而是靠上面三个引擎级/主包级开关。
若叠加（引擎插件 −4,051 + `main` 分包 −5,570），主包只剩
`assets/internal` 601 KB + `src/` 237 KB + 平台适配 108 KB + 杂项 ≈ **950 KB**，**远低于 4,096 KB**。
但这三个开关都会改变**首屏下载行为**（引擎插件依赖用户端缓存；`main` 分包意味着启动前必须
`wx.loadSubpackage('main')`），属于**产品决策**，需业主拍板。

### 可行的补充手段（按风险排序）

| # | 手段 | 可省 | 风险 / 前置 |
| --- | --- | --- | --- |
| A | **引擎功能裁剪：bullet 物理** | 484 KB | **LOW**。`cocos/settings/v2/packages/engine.json` 当前**只有 `__version__`，没有任何裁剪配置**。全仓搜 `Collider|RigidBody|physics` 只命中 2 处**注释**，且注释本身写着「the gameplay runtime ships no Collider/RigidBody」。 |
| B | **引擎功能裁剪：spine** | 471 KB | **LOW**。全仓 `spine` 命中 **0** 处。 |
| C | **skybox 载荷** | 850 KB | **MEDIUM，需业主拍板**。2 个 HDR 以 12 张 mip PNG 发布；渲染用 `builtin-unlit` 无光照，但两个 scene 都引用了 skybox ⇒ 属**构图决策**，不是死数据。 |
| D | **更深引擎裁剪**（particle / tiledmap / video / webview / terrain 等未用模块） | **未测量** | 需要一次实验构建才能给出数字。**不许先报数字。** |
| E | **远程包（CDN）** | 把选中的 Bundle 整个移出本地包 | 见下 |
| **F** | **引擎插件（分离引擎）** `separateEngine` | **4,051 KB** | **需业主拍板**。改变首屏下载行为、依赖用户端引擎缓存；仅正式版 + 非 debug；与 `wasmSubpackage` 不叠加。 |
| **G** | **内置 `main` 包压缩类型 = 小游戏分包** | **5,570 KB** | **需业主拍板**。启动前必须下载 `subpackages/main`，等于把「首屏必要」整体推迟一次下载。 |
| **H** | **引擎原生代码分包** `wasmSubpackage` | **923 KB** | LOW–MEDIUM。与 F 互斥（F 开启后 wasm 打包模式失效）。 |

> **F 与 G 是本轮唯一能真正跨过 4 M 的手段**，A/B/C/D/E 都只是增量优化。
> 但它们都是**产品/体验决策**（首屏多一次下载 vs. 包体超限），mandate 明确要求业主拍板，**不得由我单方面开启**。

A+B 合计 **955 KB**，是本轮唯一可以立刻确定、且不触碰产品内容的减量。

### 关于远程包（E）

- Cocos 的「配置为远程包」会把 Bundle 构建到 `remote/`，需自行放服务器；而**「小游戏分包」与「远程包」互斥**（见 §1），所以远程包不是分包的一种形态，而是另一条路。
- 微信侧：`wx.request`/`wx.downloadFile` 只能访问**已配置的服务器域名**，域名必须**HTTPS + 已 ICP 备案**，**不能是 IP 或 localhost**（[微信 · 网络](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/network.html)）。
- 官方文档**没有**一句直接说「CDN 资源不计入代码包」。合理推断是：`代码包` 指上传的包，运行时下载的资源不在其中 —— 但**这是推断，不是引用**，落地前需业主确认。
- 代价：需要一个已备案 HTTPS 域名 + CDN（与已知阻塞项「无公网 `wss://`」同源），且会失去「代码包缓存后可离线打开」的性质。

---

## 5. PHASE WP3 实测：分包把两个**此前无人发现**的启动期缺陷暴露出来

WP3 开工前先按 mandate 要求核对真实仓库与真实构建产物，结果发现：**WP2 之前，微信/抖音构建的
首屏根本不是游戏**。这一节全部结论都来自真实构建产物与引擎二进制，不是推断。

### 5.1 缺陷一：小游戏构建启动的是**空场景**

| 证据 | 内容 |
| --- | --- |
| `cocos/build/wechatgame/src/settings.json` | `launch.launchScene = "db://assets/scenes/Bootstrap.scene"` |
| `cocos/build/bytedance-mini-game/src/settings.json` | 同上 —— 两个小游戏平台都中招 |
| `cocos/build/web-mobile/src/settings.json` | `launch.launchScene = "db://assets/scenes/Game.scene"` —— 只有 web 是对的 |
| `cocos/assets/scenes/Bootstrap.scene`（6,257 B） | 只有 `Main Light` / `Main Camera` / 默认 `SceneGlobals`，**`cc.Scene._components` 为空数组**，零脚本组件 |
| 该文件来源 | `scripts/format_official_scenes.js:11` 把 Creator 官方**默认空场景模板**写进 `Bootstrap.scene`，用于修复场景 schema；`Game.scene` 后来被重新编辑（963,490 B / mtime 09-18），`Bootstrap.scene` 自 08-29 起再未改动 |
| 全项目 `loadScene` 调用 | **0 处**（`cocos/assets/scripts/**` 与 `assets/main/index.js` 均无）⇒ 没有任何代码会切到 `Game.scene` |

**根因**：`cocos/profiles/v2/packages/builder.json` 的 `common.startScene` 保存的是 `Game.scene`
（GUI 口径），但**无头 `--build` 不继承它**；`scripts/verify_cocos_minigame_builds.mjs:63` 只传
`platform/debug/orientation`，Creator 于是回退到**字母序第一个场景** `Bootstrap.scene`。
web-mobile 之所以正确，只是因为它恰好等于 `common.platform`。

**为什么所有门禁都没发现**：`validateOutput` 只检查文件存在与体积；`acceptance:p0b`/`acceptance:v2`
只跑 web-mobile。**首屏正确性从未被断言过。**

### 5.2 缺陷二：`world-city` 必须在启动场景**之前**就位，而项目代码**不可能**做到

引擎二进制 `cocos/build/wechatgame/cocos-js/_virtual_cc-bf7083ae.js` 里的两段实现（逐字）：

```js
_loadProjectBundles = function () {
  var t = querySettings(ASSETS, "preloadBundles");
  return t ? Promise.all(t.map(({bundle, version}) => new Promise((res, rej) =>
    EA.loadBundle(bundle, version ? {version} : {}, (e) => e ? rej(e) : res())))) : Promise.resolve([]);
}

_updateCallback = function () {
  if (this._inited) if (PN.instance.isFinished) if (this._shouldLoadLaunchScene) {
    this._shouldLoadLaunchScene = false;
    var i = querySettings(LAUNCH, "launchScene");
    i ? IN.loadScene(i, ...) : ...
  }
}
```

⇒ 顺序是 **`init()` → 预加载 `preloadBundles` → 第一帧 `loadScene(launchScene)`**。
**任何项目脚本都跑在 `loadScene` 之后**，所以「在进入 `Game.scene` 前 `ensureLoaded`」在
**launch scene 上物理不可行**。必须把加载提前到 `init()` 与 `run()` 之间。

而引擎**不会**自动加载依赖 Bundle —— `assets/main/config.json` 的 `deps` 是**惰性**的
（`Config.deps` 只在 `Config.init` 赋值，全引擎包 `deps` 仅出现 14 次，无 `loadBundle` 消费路径；
`dependencyRelationships` 为 `{}`）。更关键的是，跨 Bundle 取资源时引擎**主动抛错**：

```js
if ((a = o.getAssetInfo(r)) && a.redirect) {
  if (!ad.has(a.redirect)) throw new Error("Please load bundle " + a.redirect + " first");
  ...
}
```

`assets/main/config.json` 的 `redirect = [13,"1",23,"1",50,"1",56,"1",57,"1",75,"1",131,"0",158,"1",160,"1"]`
正是把若干资源指向 `projectBundles` 里的第 1 项 = `world-city`。⇒ 缺 Bundle 时是**硬报错**，不是静默空引用。

**把 `redirect` 解到底（`projectBundles = ["internal","world-city","resources","main"]`，索引 1 = `world-city`）：**

| `main` 的 uuid 索引 | 解码后 uuid | 源文件 | 指向 |
| --- | --- | --- | --- |
| 13 | `16ed6d87-…` | `art/world/city/commercial-building-f.glb` | `world-city` |
| 23 | `2cbe6492-…` | `art/world/city/commercial-skyscraper-b.glb` | `world-city` |
| 50 | `5cef1a38-…` | `art/world/city/commercial-building-a.glb` | `world-city` |
| 56 | `66fcf59d-…` | `art/world/city/commercial-building-g.glb` | `world-city` |
| 57 | `684f4ad6-…` | `art/world/city/commercial-skyscraper-a.glb` | `world-city` |
| 75 | `6d726725-…` | `art/world/city/commercial-building-d.glb` | `world-city` |
| 158 | `d9165bf0-…` | `art/world/city/Textures/colormap.png`（= `commercialColorTexture`） | `world-city` |
| 160 | `dab10dbb-…` | `art/world/city/commercial-building-h.glb` | `world-city` |
| 131 | `ba21476f-…` | （引擎内置） | `internal` |

**这 8 条与 `world-city` 自身 `config.json` 的资产集合完全吻合**（§5.3）⇒ 两个独立方向互相印证。

### 5.2.1 为什么「修启动场景」与「修启动期 Bundle」必须**同时**上

`WorldArtLibrary.validateTemplates()`（`WorldArtLibrary.ts:531-550`）在 `init()` 里被调用，末尾：

```ts
if (!this.roadColorTexture || !this.suburbanColorTexture || !this.commercialColorTexture
  || !this.vehicleColorTexture || !this.prettyParkColorTexture) {
  throw new Error('[WorldArtLibrary] Missing one or more Creator-imported external colour maps.');
}
```

而 `commercialColorTexture` = `d9165bf0-…` = **`world-city` 里的 `colormap.png`**。⇒

- **只修启动场景**（改回 `Game.scene`）⇒ `init()` **直接抛错**，游戏起不来（比黑屏更响，但仍不可发布）。
- **只修启动期 Bundle**（不改 `Bootstrap.scene`）⇒ 空场景不需要 city 资源，代码根本不跑，缺陷被**掩盖**。

所以两个修法是一组，必须一起上、一起验证。

### 5.3 `world-city` 里到底是什么（100% 归属，可反查）

`scripts/audit_wechat_package.mjs` 的 uuid 反查（新增 `.scratch/resolve-bundle.mjs`）解析
`subpackages/world-city/config.json` 的 39 条 uuid → 17 个去重资产：

| 源字节 | 源文件 |
| --- | --- |
| 166,356 | `cocos/assets/art/world/city/commercial-building-g.glb` |
| 148,952 | `cocos/assets/art/world/city/commercial-building-f.glb` |
| 138,480 | `cocos/assets/art/world/city/commercial-skyscraper-b.glb` |
| 127,384 | `cocos/assets/art/world/city/commercial-building-h.glb` |
| 111,336 | `cocos/assets/art/world/city/commercial-skyscraper-a.glb` |
| 108,936 | `cocos/assets/art/world/city/commercial-building-a.glb` |
| 95,160 | `cocos/assets/art/world/city/commercial-building-d.glb` |
| 11,002 | `cocos/assets/art/world/city/Textures/colormap.png` |
| 17,228 | 引擎内置 `builtin-standard.effect` |

⇒ `world-city` = **Golden City 开场单元格的 7 个商业区楼体网格 + 其色图**，即
`Game.scene` 中 `#8 WorldArtLibrary` 节点下 7 个模板节点烘焙的 `cc.MeshRenderer._mesh`
（`building-a/d/f/g/h`、`building-skyscraper-a/b`）。**它是启动期硬依赖，不是"以后才需要"的区域包。**

### 5.4 采用的修法（最小、可验证、不引入第二套系统）

1. **修启动场景**：`scripts/verify_cocos_minigame_builds.mjs` 显式传
   `startScene=scene-game-0001-8888-9999-aaaabbbbcccc`，并**在真实产物上断言**
   `src/settings.json` 的 `launch.launchScene === "db://assets/scenes/Game.scene"`。
2. **修启动期加载**：新增 `cocos/build-templates/<platform>/application.js`（项目**已有**该
   Creator 官方自定义模板机制，`game.json`/`index.ejs` 已在用），把
   `init() → loadBundle('world-city') → run()` 串起来。这是**唯一**既能早于 `loadScene`、
   又由项目代码掌握、因而**可重试**的时机。
3. **失败即明确提示 + 真 Retry**：微信/抖音用 `wx.showModal`/`tt.showModal`
   （`confirmText: '重试'` / `cancelText: '退出'` → `exitMiniProgram`），Web 用常驻 overlay + 重试按钮。
   每次尝试 4 次、线性退避；**绝不静默卡住**。
4. **运行时按需加载**：新增轻量 `RegionBundleService`（§7），`InfiniteWorldManager.createCell`
   在建 Cell 前先 `ensureRegionArt`。因为 `updateCells()` 每帧由 `GameManager.update()` 调用并
   重算所需坐标集，**不需要任何 pending 坐标簿记**：Bundle 未就绪就跳这一帧，就绪后自然建出来。

**注意 `preloadBundles` 没有被改**：仍为 `[resources, main]`。启动期 Bundle 由项目代码显式加载，
因为引擎的 `preloadBundles` 路径**没有错误出口**（Promise.all 直接 reject ⇒ `game.init()` reject ⇒ 黑屏）。

### 5.5 WP3 验证结果（真实构建 + 真实产物）

构建：`npm run build:wx` → `status: PASS`，201 文件，`launcherExitCode: 36`（正常）。
证据：`cocos/docs/evidence/final/platform/wechat-build-wp3-boot-and-launch-scene.json`。

| 判据 | 修前 | 修后（实测） |
| --- | --- | --- |
| `src/settings.json` → `launch.launchScene` | `db://assets/scenes/Bootstrap.scene`（空场景） | **`db://assets/scenes/Game.scene`** ✅ |
| `application.js` | 官方默认（无 boot 加载） | 8,429 B，含 `BOOT_BUNDLES = ['world-city']` + `ensureBootBundles` + 重试弹窗 ✅ |
| `src/settings.json` → `assets.subpackages` | `["world-city"]` | `["world-city"]`（未变） |
| `game.json` → `subpackages` | 1 条声明 | 1 条声明（未变） |
| `subpackages/world-city/` | 19 文件 / 1,441.6 KB | 19 文件 / 1,441.6 KB |
| 主包（微信口径） | 15,238 KB | **15,249 KB**（+10.7 KB：新增 `RegionBundleService` + 门禁代码；`assets/main/index.js` 311,990 → 317,374 B） |
| 全包总量 | 16,680 KB | **16,690 KB** |
| 主包 owner 归集 | 无 `WORLD_CITY` | 仍无 `WORLD_CITY` ✅ |

**回归**（本轮已跑）：`typecheck:cocos` ✅、`test:full`（`test:cocos` + `test:contracts` 含新增
`test_region_bundle_contract` + `test:authoring`）✅、`build:web` ✅。

**过程中契约测试抓到的真实缺陷**：`RegionBundleService.ensureLoaded` 最初在 `FAILED` 状态下会**重新开始**
一轮尝试 ⇒ 逐帧调用会变成请求风暴。`SERVICE_FAILED_IS_TERMINAL` 断言失败后已改为**终态**（仅 `reset()`
可恢复）。另有一处 `[...map.keys()]` 被 `V4_NO_ES5_UNSAFE_ITERATOR_SPREAD` 拦下 —— 小游戏包是 ES5，
迭代器展开会被降级成不安全的 helper 调用；已改为 `forEach`。

---

## 6. PHASE WP3b 实测：微信开发者工具**真实模拟器**验收（2026-09-23 00:33–00:47）

WP3 之前只做到「真实构建 + 产物核验 + Web 运行时」。本轮把**真实的微信开发者工具**跑起来，
结果**又暴露一个此前无人发现的硬阻塞**，同时也把 WP3 的两个启动期修法**在微信运行时上证实了**。

### 6.1 缺陷三：`project.config.json` 的 `libVersion` 让**模拟器无法启动**

- **现象**：微信开发者工具（Stable **2.01.2510290**）打开 `cocos/build/wechatgame` 后，模拟器**根本不启动**。日志原文：
  ```
  [ERROR] simulator launch catch error CustomError: project.config.json: libVersion 字段需为 string, string
      at .../miniprogram-builder/modules/corecompiler/original/json/projectconfig.js
  [ERROR] appservice.js checkPluginInfo fail with error: Error: project.config.json: libVersion 字段需为 string, string
  [ERROR] simulator game launch error TypeError: Cannot read property 'getPreCompileOptions' of undefined
  ```
- **根因（权威 schema，非推断）**：`code/package.nw/js/common/miniprogram-builder/schema/dist/projectconfig.js`（`$version: 1754364153193`）：
  ```json
  "libVersion": { "anyOf": [
    { "enum": ["", "development", "latest", "trial", "widelyUsed"], "type": "string" },
    { "type": "string", "pattern": "^[0-9]*.[0-9]*.[0-9]*$" } ] }
  ```
  而 **Cocos Creator 3.8.3 自带模板**（`resources/resources/3d/engine/templates/wechatgame/project.config.json:13`）
  写的是 `"libVersion": "game"` —— **既不在枚举里，也不匹配版本号** ⇒ 校验抛错 ⇒ 模拟器拒绝启动。
- **对照**：本仓库**旧的 Three.js 微信构建**（`legacy/threejs-prototype/platform/wx/project.config.json`，已入库）
  用的是 `"libVersion": "3.3.4"`，是合法的 ⇒ 这是**移植到 Cocos 后引入的回归**。
- **影响面**：`build:wx` 一直是 PASS（构建器不校验这个字段），**所有既有门禁都查不出来**；
  但它意味着**此前从未有人在微信开发者工具里真正把这个包跑起来过**。
- **修法**：`cocos/build-templates/wechatgame/project.config.json` → `{"libVersion": "widelyUsed"}`。
  已验证 `build-templates/` 是**深合并**（本项目的 `game.json` 只写 `deviceOrientation`，构建产物仍保留模板的
  `networkTimeout`），所以只覆盖这一个键，**不会**动构建器填的 `appid`/`projectname`。
- **门禁**：`verify_cocos_minigame_builds.mjs` 现在**在真实产物上断言** `libVersion` 合法
  （`isValidLibVersion` 逐字镜像上面的 schema，含未转义的 `.`）；`test_region_bundle_contract.mjs` 增加
  `WECHAT_TEMPLATE_OVERRIDES_LIB_VERSION` 与 `BUILD_ASSERTS_LIB_VERSION`。

### 6.2 修后：微信开发者工具**真的跑起来了**（运行时证据）

修 `libVersion` 后（其余一律未动），日志从「模拟器启动失败」变为
`compile onFileChange contentChange project.config.json` → 下载游戏基础库 `commlib/1647.wxapkg 3.17.3`
→ **无任何 `libVersion` / `getPreCompileOptions` 错误**，且游戏在模拟器里**实际渲染并可操作**。

| RUNTIME GATE 项 | 实测证据（截图在 `cocos/docs/evidence/final/platform/`） |
| --- | --- |
| Cold Start / Home | `wechat-runtime-01-home.png` —— 《黑洞回收站》首页：金币 0、机械等级、**开始吞噬**、商店/皮肤/排行。**不是空的 `Bootstrap.scene`** ⇒ §5.1 的修法在微信运行时成立。 |
| Mode Select | `wechat-runtime-02-mode-select.png` —— 模式选择：**竞技乱斗**（1v7 本地竞技·已开放）、**无尽探索**（已开放）。 |
| Endless Ready | `wechat-runtime-03-endless-ready.png` —— 无尽探索 Ready：历史最高纪录、当前机器、**开始探索**。 |
| Endless Start / world-opening / Cell streaming / Vehicle | `wechat-runtime-04-endless-gameplay.png` —— 进入 **「卧室杂物区」**，世界渲染出道路/建筑/树木/车辆，HUD 为 `金币 0 / LV.1 初级黑洞 / 吞噬经验 0/10`。 |
| `world-city` 启动期 Bundle | 由上面两项共同证明：`Game.scene` 直接引用 city 网格，而 `WorldArtLibrary.validateTemplates()` 在 `commercialColorTexture`（= `world-city/colormap.png`）缺失时会**抛异常**。画面正常渲染 ⇒ Bundle 在启动期**确实已就位**。 |

**已证「修法来自模板而非手工改动」**：上面第一轮是在构建产物上手工改 `libVersion` 试出来的。
随后加了 `build-templates/wechatgame/project.config.json`，**重新完整构建**（`npm run build:wx` →
`PASS wechatgame: 201 files, launch=db://assets/scenes/Game.scene, boot=world-city,
subpackages=[world-city], AppID=wx6ac3f5090a6b99c5 (configured), libVersion=widelyUsed.`），
再**不做任何手工改动**直接把新产物交给开发者工具 ⇒ 模拟器正常启动、游戏正常渲染
（`wechat-runtime-05-home-after-template-fix.png`）。**这一步排除了「修的是手工补丁而不是项目配置」的可能。**

### 6.2.1 PHASE WP3c：把 RUNTIME GATE 逐项走完（2026-09-23 00:56–01:30）

§6.2 当时只证明了「可运行」，RUNTIME GATE 的大部分条目仍是空白。WP3c 用**操作系统级可信输入**
（`SetCursorPos` + `mouse_event` 的真实点击/拖拽，见 `.scratch/wechat-{click,drag,swipe-n}-shot.ps1`）
把整条链路逐屏走完。坐标由画布矩形反解：画布物理区 `x∈[1707,2267] y∈[137,1333]`，
设计空间 720×1280 且 `fitWidth=false / fitHeight=false`
⇒ `x = 1707 + (designX+360)/720*561`、`y = 137 + (640-designY)/1280*1196`。

| RUNTIME GATE 项 | 实测证据（均在 `cocos/docs/evidence/final/platform/`） |
| --- | --- |
| **Arena Ready** | `wechat-runtime-06-arena-ready.png` —— 竞技乱斗 Ready：对局规则 `8 人 · 3:00`、五条规则、CTA **开始乱斗**。 |
| **Arena Start** | `wechat-runtime-07-arena-revive.png` —— 对局真的跑起来了：复活页 `复活继续`、`当前第 8 / 8` ⇒ **8 名参赛者已生成**。 |
| **Arena Settlement** | `wechat-runtime-08-arena-settlement.png` —— `竞技结算 · 黑洞乱斗 · 已退出`，8 行排行榜（风暴 620kg·1 淘汰 / 流光 485kg / 矿石 465kg / 链钥 440kg … 我 140kg），`最终质量 140kg / 击败对手 0 / 生存时长 0:43`，`本局获得金币 +4`。 |
| **region transition** | `wechat-runtime-10-region-transition-warehouse.png` —— 连续 22 次滑动后区域标签由 **「卧室杂物区」→「废弃仓库区」**，期间金币 17 → 68。 |
| **Cell streaming** | 同上两张：跨越区域前后建筑/道路/道具/树木全部不同，**无空洞、无洋红、无冻结单元格**。 |
| **Vehicle / CAR_SWALLOW / PROGRESSIVE_SUCTION** | `wechat-runtime-09-endless-suction-and-car-swallow.png` —— 质量 `0kg → 188kg`、金币 `0 → 17`，画面中一辆绿色车辆被吞并弹出 `+50`。 |
| **TIER_LOCK** | `wechat-runtime-11-tier-lock-needs-lv2.png` —— 未解锁物体渲染出 **`需要 LV.2`** 门禁标签。 |
| **Pause** | `wechat-runtime-12-pause-menu.png` —— `游戏暂停 / 当前进度已冻结 / 继续游戏 / 结束并结算 / 返回首页`。 |
| **Endless Settlement** | `wechat-runtime-13-endless-settlement.png` —— `本局结算 · 无尽吞噬`：吞噬物品 8、最终质量 **750 kg**、获得金币 68、最终等级 LV.1、探索区域 1。 |
| **Exit** | `wechat-runtime-14-exit-to-home-coins-persisted.png` —— `返回首页` 回到 Home，金币计数 **4 → 72**（4 是上一局竞技结算带过来的 + 本局 68）。 |
| **Re-enter** | `wechat-runtime-15-reenter-highscore-still-zero.png` —— 再次 `模式选择 → 无尽探索` Ready 页正常，**无卡死按钮、无黑屏**。 |
| **Save/Resume（金币）** | `wechat-runtime-16-cold-restart-home-coins-4.png` —— 竞技结算给 +4 金币后，**把开发者工具整进程杀掉重启**，Home 金币计数仍是 **4** ⇒ 金币余额跨进程重启持久化 **PASS**。 |
| **Save/Resume（最高纪录）** | **FAIL** —— 见 §6.4 缺陷四。 |

**页面控制台是干净的**：`wechat-runtime-17-page-console-banner-only.png` 显示小游戏上下文
（`env: windows, mg, 2.01.2510290, lib: 3.17.3`）下**唯一一条**记录就是开发者工具的环境横幅，
**没有任何来自游戏的 error / warning**，因此本次会话中
**没有出现 Missing UUID / Missing Prefab / Missing Material / Missing Script / Bundle Load Failure**。
顺带确认**实际使用的基础库版本 = 3.17.3**，即 `libVersion: "widelyUsed"` 解析正确。

`调试器` 标签上的 `2 ✕ 3~5` 角标**不是**页面错误，是 IDE 自身的：
`WeappLog/logs/*.log` 里对应的 ERROR 行是 `[ideplugin] get devtools manifest.json catch error
Error: not installed`、`登录用户不是该小程序的开发者`、`41002 appid missing`、
`markDevLaunchEnv timingData not found`、`start cli server error`。
**诚实边界**：底部 dock 无法放大到能逐行列出控制台，且角标在按下清空后并未归零，
所以角标**没能逐条归因**；能确证的是「页面控制台只有环境横幅」与「日志里的 ERROR 全部来自 IDE」。

**仍未验证（诚实边界，不得当作已过）**：`bundle preload` 路径、`bundle retry` 路径、
`world-city` 的**字节级分包下载**。前两者需要往 `RegionBundleService` 注入故障，第三者需要
Network 面板（小游戏的分包走本地文件系统读取，面板通常不记录）。这三项目前**只有静态契约测试**
（如 `SERVICE_FAILED_IS_TERMINAL`、`BOOT_PRELOAD_PRECEDES_RUN`）覆盖，
而**静态测试不构成运行时证据**。

### 6.3 新阻塞项：登录账号不是该小程序的开发者

修好 `libVersion` 之后，唯一剩下的错误是**账号级**的：

```
[ERROR] .../getexptinfosync?appid=wx6ac3f5090a6b99c5 ... Error: 登录用户不是该小程序的开发者, [wx6ac3f5090a6b99c5]
```

`cli.bat islogin` 返回 `{"login":true}`，但该账号**不是** `wx6ac3f5090a6b99c5` 的开发者/体验成员。
它**不阻塞模拟器运行**（本轮游戏跑起来了），但会阻塞依赖 appid 的云端能力（体验版、真机预览、上传）。
⇒ 记为 **B10**，属**外部配置**，与抖音 AppID 同类。

### 6.4 缺陷四（WP3c 新发现，**未修**）：`highScore` 从来没有被写入过

**症状**（真实微信模拟器实测）：无尽模式跑出 `最终质量 750 kg` 并在结算页点了 `结束并结算`、
`返回首页` 之后，重新进入 `无尽探索` Ready 页，**`历史最高纪录` 仍是 0**；
`模式选择` 上 `无尽探索` 卡片的 `最高分` 角标同样恒为 0。**金币正常持久化（4 → 72），只有最高纪录不落盘。**

**根因**：`SaveService.updateHighScore(score)`（`cocos/assets/scripts/data/SaveService.ts:248`）
**全项目零调用点**。无尽模式的结算路径 `GameManager.openEndlessSettlement`
（`cocos/assets/scripts/gameplay/GameManager.ts:639-655`）只把数字塞进 HUD
（`hud.updateSettlement(...)`）与 `hud.showScreen('Settlement')`，**从不写存档**。

**反证（同文件里其他字段是写了的，所以这不是「存档整体没接线」）**：
`setMachineProgression` 有调用点（`BlackHoleMachine.ts:91`）、
`setMachineLevel` 有调用点（`GameManager.ts:290`）、
金币靠 `addCoins` 落盘（`CompressionSystem.ts:135`）⇒ 唯独最高纪录这一条漏了。

**同类死字段**（`ISaveData` 里声明并给了默认值、但在 `cocos/assets/scripts` 内**从未被赋值**）：
`highestRegion`、`tasks.*`、`tutorialCompleted`、`metaUpgrades.*`。

**为什么所有门禁都没抓到**：现有契约测试断言的是
`ModeReadyPageController` / `ModeSelectPageController` 把 `highScore` **接到标签上**，
而不是「有东西会去写这个值」；`highScore` 为 0 时标签显示 `0`，**不报错、不告警**。
这是一个静默的 0。**只有把真实模拟器跑起来、真的结算一局，才看得出来。**

**为什么本轮不擅自修**：改法本身是一行（在 `openEndlessSettlement` 里调用
`saveService.updateHighScore(...)`），但**「纪录」到底是哪个量**是产品决策 ——
结算页展示的是 `最终质量 750 kg`，`GameManager.ts:878` 也把 `bestMass → data.highScore`，
而会话快照里另有一个独立的 `score` 字段。**按本阶段的硬性原则（不擅自改产品行为 / 不擅自改契约），
这里只报告根因与最小改法，等业主拍板。** 记为 **B12**。

---

## 7. 风险

| 风险 | 说明 |
| --- | --- |
| **R1 4 M 主包上限可能无法达成** | 见 §4。这是本阶段最重要的结论，需业主决策（接受超限 / 远程包 / 更深裁剪 / 减内容）。 |
| **R2 跨 Bundle 脚本引用** | 官方明确警告「不同 Asset Bundle 中的脚本建议最好不要互相引用，否则运行时找不到脚本」。本项目 `WorldArtLibrary`/`WorldCellFactory`/`InfiniteWorldManager` 彼此紧耦合，**第一轮只搬资源、不搬脚本**。 |
| **R3 同优先级复制** | 同资源被同优先级多个 Bundle 引用会**各存一份**，反而增大总体积。`shared-gameplay` 与各区域 Bundle 的优先级必须区分并验证。 |
| **R4 开场单元格与 spawn 版两副面孔** | `hydrateAuthoredOpeningMaterials` 把作者手搭的 Golden City 按**组节点**套单一材质；`art/world/city` 若整包移出 `main`，`GoldenCityCell.prefab` 的引用必须能跨 Bundle 解析，否则开场单元格会缺材质。 |
| **R5 构建 stall** | 本机 stall 率实测远高于文档的 2%。`verify_cocos_minigame_builds.mjs` **没有重试**，一次 stall 就 exit 1；且它写进已入库的 `cocos/docs/evidence/v2/platform/`。 |
| **R6 发布包含调试代码** | `QABridge`/`WorldCompositionProbe` 确在发布 JS 内（§2.4）。独立缺陷。 |
| **R7 归属不可分字节** | 2.59% 资源字节 + 全部项目代码无法按 owner 切分。分包后的实际体积需**重新构建实测**，不能拿本报告的估算当结论。 |
| **R8 Bundle 不能嵌套** | `assets/resources` 已是内置 bundle ⇒ 其下任何子目录（含占 27.7% 的 `resources/art/construction`）**结构上无法**成为独立 Bundle，必须先搬出 `resources/`。同理 `art`/`prefabs`/`scenes`/`textures`/`scripts` 一旦被设为 Bundle，其子目录也全部失去成为 Bundle 的资格。⇒ **先定哪一层做 Bundle，再放资源**，顺序错了要返工。 |
| **R9 `world-city` 是启动场景的硬依赖** | ✅ **WP3 已闭环**（§5）。原状：`assets/main/config.json` → `deps: ["internal","world-city"]`，`Game.scene` 直接引用 7 个 city 网格，但引擎**不读 `deps`**（`Config.deps` 只在 `init` 赋值，无消费路径），且跨 Bundle 取资源时引擎**主动 `throw "Please load bundle world-city first"`**。修法：`build-templates/<platform>/application.js` 在 `init()` 与 `run()` 之间加载，并带重试与失败提示。**WP2 只证明机制；现在机制 + 启动期接线都成立。** |
| **R10 「主包」有两个口径，勿混用** | 本报告与审计中的「主包」= `game.json.subpackages` 之外的**全部**字节（与微信口径一致，含引擎、`resources`、`internal`、`src`）。Cocos 的**内置 `main` bundle**（`assets/main/`）只是其中一个目录。WP0 初稿里「主包 6,764 KB」指的是后者，属**口径混用**，已在本版统一。 |
| **R11 启动场景可被无头构建静默改错** | ✅ **WP3 已闭环**（§5.1）。`--build` 不继承 `common.startScene` ⇒ 回退到字母序第一个场景。已修：显式传 `startScene` + **在真实产物上断言** `launch.launchScene`。**这类缺陷此前没有任何门禁能发现**，所以修的是门禁而不只是配置。 |
| **R12 启动模板是对 Creator 官方文件的**分叉** | `build-templates/<platform>/application.js` 是官方 `application.js` 的副本 + 改动。Creator 升级时官方模板若变化，本项目副本**不会**自动跟进。判据：升级 Creator 后 diff 一次官方默认 `application.js`；改动面仅限 `start()` 与新增的 boot 辅助函数。 |
| **R13 不能用 `preloadBundles` 做启动期 Bundle** | 引擎的 `_loadProjectBundles` 是 `Promise.all(...loadBundle)`，**没有错误出口**：任一 Bundle 失败即 `game.init()` reject ⇒ 黑屏且无提示。这正是启动期 Bundle 必须由项目代码加载的原因（§5.4）。 |
| **R14 构建器不校验 `project.config.json`** | ✅ **WP3b 已修 + 已加门禁**（§6.1）。Cocos 的构建只把模板拷出来，**不校验字段合法性** ⇒ `build:wx` PASS 但开发者工具**拒绝启动模拟器**。这类「配置值对平台非法」的缺陷**只有把真实运行时跑起来才能发现**。⇒ 任何「构建 PASS 但从未在开发者工具/真机跑过」的结论都不算数。 |
| **R15 `build-templates/` 覆盖是项目级分叉** | `build-templates/wechatgame/project.config.json` 与 `application.js` 都是对 Creator 官方文件的**覆盖/分叉**；Creator 升级时官方模板变化**不会**自动跟进。判据：升级 Creator 后，把官方 `resources/resources/3d/engine/templates/wechatgame/` 下对应文件与本项目 `build-templates/` diff 一次。 |
| **R16 静默的 0：声明了但没人写的存档字段** | ⚠️ **WP3c 新发现，未修**（§6.4）。`updateHighScore` 零调用点 ⇒ `历史最高纪录` 恒为 0，**不报错、不告警**，所有静态门禁都只验「标签接线」不验「有东西写值」。**推论：存档字段的「有默认值 + 有读取方」不等于「有写入方」；断言存档功能前必须把真实运行时跑一局并结算。** |
| **R17 `miniprogram-automator` 对本项目不可用** | 官方自动化 SDK 能连上（`Tool.getInfo` 有应答），但 `App.*`（`callWxMethod`/`getPageStack`/`getCurrentPage`/`captureScreenshot`）**全部无应答** —— 因为本项目构建的是**小游戏**（`game.json`）而不是小程序，`App`/`Page` 通道不绑定。⇒ 本项目只能用**操作系统级输入 + 截图**驱动开发者工具。另：`cli.bat auto` 会**重新打开项目**（被测小游戏会重启回 Home），并占用 `0.0.0.0:9420`，用完要关。 |
| **R18 探测 localhost 会被 shell 代理污染** | 本机 shell 导出 `http_proxy=http://127.0.0.1:60719`，直接 `curl http://127.0.0.1:<port>/json/version` 得到的是**代理**的 502/403/426，看起来像「IDE 拒绝连接」而实际根本没连到 IDE。⇒ 探测本地端口**必须**加 `--noproxy '*'`。 |

---

## 8. 需要改动的文件

| 阶段 | 文件 | 动作 | 状态 |
| --- | --- | --- | --- |
| WP1 | `cocos/assets/**` 下新建 Bundle 文件夹 / `.meta` | 用 Creator 的「配置为 Bundle」正式配置，**不手写构建产物、不手改 `game.json`** | ✅ WP2 已对 `art/world/city` 落地 |
| WP1 | `cocos/settings/v2/packages/builder.json` → `bundleConfig.custom` | 新增「小游戏分包」配置方案（**这才是压缩类型的真正存储位置**，见 §1） | ✅ 已落地 |
| WP2 | `cocos/assets/art/world/city.meta` | 试点 Bundle（`bundleConfigID` + `priority: 9`） | ✅ 已落地，三项判据通过 |
| WP3 | `cocos/assets/scripts/world/RegionBundleService.ts`（+ `.meta`） | 新增**轻量**服务：`ensureLoaded` / `preload` / 失败重试 / 引用状态 | ✅ 已落地 |
| WP3 | `cocos/assets/scripts/world/InfiniteWorldManager.ts` | `REGION_ASSET_BUNDLES` 表 + `ensureRegionArt` 门（建 Cell 前）、`getRegionArtStatus`/`getRegionArtFailure`/`retryRegionArt` | ✅ 已落地 |
| WP3 | `cocos/build-templates/{wechatgame,bytedance-mini-game,web-mobile}/application.js` | 新增：`init() → loadBundle('world-city') → run()` + 失败提示/重试 | ✅ 已落地 |
| WP3 | `cocos/assets/scripts/platform/IPlatformAdapter.ts` + `EditorPlatformAdapter.ts` | 新增 `showRetryDialog`（Web overlay / `wx.showModal` / `tt.showModal`） | ✅ 已落地 |
| WP3 | `cocos/assets/scripts/gameplay/GameManager.ts` | 订阅 `UI_REGION_ART_FAILED` → 明确提示 + Retry | ✅ 已落地 |
| WP3 | `scripts/verify_cocos_minigame_builds.mjs` | 显式传 `startScene`；断言 `launch.launchScene`、boot Bundle、分包声明 | ✅ 已落地 |
| WP3 | `scripts/test_region_bundle_contract.mjs` + `package.json` | 新增契约测试并接入 `test:contracts` | ✅ 已落地 |
| **WP3b** | `cocos/build-templates/wechatgame/project.config.json` | **新增**：覆盖 Creator 模板里非法的 `"libVersion": "game"` → `"widelyUsed"`（深合并，只改这一个键） | ✅ 已落地，真实构建产物已验证 |
| **WP3b** | `scripts/verify_cocos_minigame_builds.mjs` | 在真实产物上断言 `libVersion` 合法（`isValidLibVersion`，逐字镜像开发者工具 schema） | ✅ 已落地 |
| **WP3b** | `scripts/test_region_bundle_contract.mjs` | 新增 `WECHAT_TEMPLATE_OVERRIDES_LIB_VERSION`、`BUILD_ASSERTS_LIB_VERSION` | ✅ 已落地 |
| **WP3c** | `cocos/docs/evidence/final/platform/wechat-runtime-{06..17}-*.png` | **新增**：12 张运行时证据（Arena Ready/Revive/Settlement、吞车、区域切换、TIER_LOCK、暂停、无尽结算、退出回 Home、重进、冷重启、页面控制台） | ✅ 已落地（未入库） |
| **WP3c** | `cocos/docs/evidence/final/platform/wechat-runtime-wp3c-full-gate.json` | **新增**：20 项通过 / 3 项未验证的完整 RUNTIME GATE 记录 + 缺陷四 + 控制台归因 + 工具结论 | ✅ 已落地（未入库） |
| **WP3c** | `.scratch/wechat-{click,drag,swipe-n,key}-shot.ps1`、`.scratch/wx-auto-probe.cjs` | **新增**：操作系统级输入驱动 + 自动化 SDK 探测（`.scratch/` 不入库） | ✅ 已落地（临时） |
| WP4 | （无代码改动）`cocos/assets/**` Bundle 配置 | 加 Bundle 只需改 `REGION_ASSET_BUNDLES` + `BOOT_BUNDLES` | ⏳ |
| **B12** | `cocos/assets/scripts/gameplay/GameManager.ts` | **待拍板**：在 `openEndlessSettlement` 里调用 `saveService.updateHighScore(...)` 才能修好 `历史最高纪录` | ⏳ 需业主拍板 |
| WP4 | `cocos/assets/resources/art/construction/**` → 搬出 `resources/` | 最大可动项（4,617 KB），但 R8 要求先搬迁 | ⏳ |
| WP4 | `cocos/settings/v2/packages/engine.json` | 引擎功能裁剪（bullet / spine 先行，A+B = 955 KB） | ⏳ 需业主拍板 |
| WP5 | `scripts/test_design_lock_contract.mjs` | 新增，接入 `test:contracts`（PACKAGE GATE 通过后再做） | ⏳ |

### 试点 Bundle = `world-city`（并记录一处对方案的更正）

**更正**：WP0 初稿曾建议把试点从 `world-city` 改为 `world-construction`（理由是它占 27.7%、最独立）。
核对 Creator 的 Bundle 约束后**该建议不成立**，已撤回：

> **Asset Bundle 不支持嵌套** ——「例如 A 文件夹中有 B 文件夹，A 和 B 不能都设置为 Asset Bundle」。

本项目 `assets/resources` **已经**是内置 `resources` bundle（`resources.meta` →
`userData: { isBundle: true, bundleName: "resources", priority: 8 }`，全项目**唯一**一个已配置的 Bundle）。
因此 `assets/resources/art/construction` **在结构上不可能**成为独立 Bundle。

⇒ 想让 `world-construction` 成为 Bundle，必须**先把文件搬出 `resources/`**（例如移到
`assets/bundles/world-construction/`）并同步改 `InfiniteWorldManager.ts:1615` 的 `resources.load` 路径。
那是一次**资源搬迁**，会把「验证分包机制」与「搬迁资源」两件事混在一起。

⇒ **试点选 `world-city`（与 mandate 的偏好一致）**：`assets/art` 不是 Bundle，所以
`assets/art/world/city` 可以**纯靠配置**变成 Bundle，**零文件搬迁**。试点要验证的是**机制**
（`subpackages/` 是否生成、`game.json` 是否出现 `subpackages`、该组是否不再计入主包），
而不是搬迁本身。搬迁放到 WP4。

`world-construction` 因此**降级为 WP4 的第一步**（搬迁 + 配置 + 构建 + 回归）。

---

## 9. 阻塞项

| # | 阻塞项 | 状态 |
| --- | --- | --- |
| B1 | **主包 4 M 上限** | **BLOCKED — 需业主决策**。WP2 实测 15,238 KB；WP3c 复测 15,624 KB（总 17,107 KB，`subpackages/world-city` 1,483 KB，201 文件）；**WP4 步骤 1 后 = 主包 10,629.3 KB**（总 16,691.5 KB，`world-construction` 4,620.6 + `world-city` 1,441.6，203 文件）⇒ 是 4,096 KB 上限的 **2.60 倍**（总包仍在 30,720 KB 之内）。**搬资源已证明跨不过去，且已给出数学下界**（§12.3）：把 `assets/main`（5,576.0 KB）**一件不留全部搬空**，主包下界仍是 **5,053.3 KB = 上限的 1.23 倍**（`cocos-js` 4,051.2 + `internal` 601.4 + `src` 237.3 + 根脚本 162.4 + `resources` 1.1）—— `cocos-js` 一项就占 4,096 KB 的 **98.9%**。**唯一可行路径 = 引擎插件（F）`separateEngine` + 搬 `shared-gameplay`**：主包 ≈ **3,373 KB**（0.82× 上限、0.97× 内部目标）；但只搬资源不动引擎则 ≈7,424 KB（1.81×）仍不达标 ⇒ **两半必须同时成立**。引擎裁剪（A+B）**不是替代方案**：只裁 bullet+spine 后仍 = 4,098 KB 且尚未装任何资源。见 §4.2、§11.4、§12.3–§12.4。 |
| B2 | skybox 850 KB 去留 | BLOCKED — 需业主拍板（构图决策） |
| B3 | 发布包含调试代码 | OPEN — 需业主决定是否在发布构建剔除 `scripts/dev/**` |
| B4 | 抖音真实 AppID | `DOUYIN_RELEASE = BLOCKED_EXTERNAL_CONFIG`（仍是 `testappId`）。**不阻塞**微信分包施工。 |
| B5 | 公网 CDN / `wss://` | 若走远程包方案（E）则成为前置条件 |
| B6 | 模型路由 | `EXPLICIT_MODEL_ROUTING_UNAVAILABLE` —— 本阶段未声明任何具体子代理模型，全部工作由主代理完成，**未伪报模型**。 |
| **B7** | **试点 Bundle 的运行时接线（R9）** | ✅ **CLOSED by WP3 + WP3b**（§5、§6）。`world-city` 由 `application.js` 在 `init()`/`run()` 之间加载，`InfiniteWorldManager` 在建 Cell 前有门；构建产物已验证 `launchScene=Game.scene`、`bootBundles=[world-city]`、`subpackages=[world-city]`；并且**已在真实微信开发者工具里跑起来**（§6.2）。 |
| **B8** | **微信运行时验收** | **20 项通过 / 3 项未验证**（WP3b 立起，WP3c 走完）。已在真实微信开发者工具（Stable 2.01.2510290）逐屏验收：Cold Start、Home、Mode Select、Endless Ready、**Arena Ready**、Endless Start、**Arena Start**、world-opening 载入、**region transition**（卧室杂物区→废弃仓库区）、Cell streaming、Vehicle / CAR_SWALLOW / PROGRESSIVE_SUCTION、**TIER_LOCK**、Pause、**Arena Settlement**、**Endless Settlement**、**Exit**、**Re-enter**、Save/Resume（金币，含整进程重启）。**未验证**：bundle preload 路径、bundle retry 路径、分包下载的字节级证据（均需故障注入或 Network 面板）。另：Save/Resume 的**最高纪录**项 **FAIL**（见 B12）。证据：`cocos/docs/evidence/final/platform/wechat-runtime-*.png`（20 张）、`wechat-runtime-wp3c-full-gate.json`、`wechat-runtime-wp3b-libversion-and-simulator.json`。**WP4 步骤 1 追加**：小游戏侧复验了冷启动 / Home / 世界渲染 / 进对局可玩（§11.5，证据 `wechat-runtime-18..20-wp4-*.png`）；而 `world-construction` 地标自身的 `loadState`/`visible` **只能**在 web-mobile 侧读（小游戏无 QA 探针），已实测 `READY` / `visible:true`（`web-runtime-wp4-construction-landmark-drive.json`）。 |
| **B9** | **已入库平台报告只覆盖 web-mobile** | **OPEN（既有缺陷）**。`cocos/docs/evidence/v2/platform/mini-build-report.json` 在 HEAD 里 `requestedPlatform = "web-mobile"`、只有 1 行 build，但文件名与 `status: PASS` 都不体现这一点。本轮跑 `build:wx`/`build:web` 前已备份、跑后已 `git checkout --` 还原，**未把它改成更窄或更宽**。持久修法（业主范围）：让该脚本默认写 `artifacts/`，只在显式要求时写 `docs/evidence/`。 |
| **B10** | **登录账号不是 `wx6ac3f5090a6b99c5` 的开发者** | `WECHAT_ACCOUNT_NOT_DEVELOPER`（errcode **-80002**）。`cli.bat islogin` 返回 `{"login":true}`，但该账号不是该小游戏的开发者/体验成员 ⇒ **不阻塞模拟器**（游戏已跑起来），但阻塞**体验版 / 真机预览 / 上传**。属**外部配置**，与 B4 同类。 |
| **B11** | ~~`project.config.json` 的 `libVersion` 非法~~ | ✅ **CLOSED by WP3b**（§6.1）。Cocos 3.8.3 模板写 `"game"`，被开发者工具 schema 拒绝 ⇒ 模拟器无法启动。已用 `build-templates/wechatgame/project.config.json` 覆盖为 `"widelyUsed"`，并在构建产物上加断言。 |
| **B12** | **`highScore` 从不落盘 ⇒ `历史最高纪录` / `最高分` 恒为 0** | **OPEN — 需业主拍板后才改**（§6.4）。`SaveService.updateHighScore`（`SaveService.ts:248`）**全项目零调用点**；无尽结算路径 `GameManager.openEndlessSettlement`（`GameManager.ts:639-655`）只更新 HUD、不写存档。真实模拟器实测：结算 `最终质量 750 kg` 后重进 Ready 页 `历史最高纪录` 仍为 `0`，而金币正常持久化（4 → 72）。**不阻塞分包施工**，但属**真实运行时发现的产品缺陷**；修法是一行，但「纪录取质量还是 score」是产品决策，故不擅自改。 |

---

## 10. 下一任务（NEXT_TASK）

### 已完成

- **PHASE WP0** — 审计、平台规则核验、Bundle 方案、Top 50、owner 归属。
- **PHASE WP2** — 试点 `world-city` 分包**三项判据全部通过**，机制已证实并定位到正式配置位置（§1、§2.6）。
- **PHASE WP3** — 运行时接线完成，并**顺带修掉两个此前无人发现的启动期缺陷**（§5）：
  小游戏构建启动空场景（R11）、`world-city` 启动期取不到（R9）。
  新增 `RegionBundleService`、boot 模板、失败提示 + Retry、构建期断言、契约测试。
  构建实测：`launchScene=Game.scene`、`bootBundles=[world-city]`、`subpackages=[world-city]`、
  201 文件、主包 15,249 KB / 分包 1,442 KB。
- **PHASE WP3b** — 把**真实的微信开发者工具**跑起来做验收，**又发现并修掉第三个此前无人发现的缺陷**（§6）：
  `project.config.json` 的 `libVersion` 由 Creator 模板写成非法的 `"game"` ⇒ **模拟器根本无法启动**，
  而 `build:wx` 一直是 PASS。修后游戏在真实微信运行时跑通（Home / Mode Select / Endless Ready /
  Endless Start / world-city 启动期 Bundle 均实测），并加了构建产物断言与契约检查。
  **未做完的 RUNTIME GATE 项已如实列在 B8。**
- **PHASE WP3c** — 用**操作系统级可信输入**把 RUNTIME GATE 逐屏走完（§6.2.1）：
  两种模式的 Ready / Start / 结算、区域切换、暂停、退出、重进、金币跨进程持久化全部实测通过
  （20 项）；页面控制台**只有环境横幅、无游戏侧 error**，因此**未出现任何缺失资源 / Bundle 加载失败**。
  顺带发现并如实记录**第四个缺陷**（§6.4，`highScore` 零调用点，**未修，等拍板**）
  与一条工具结论（`miniprogram-automator` 对本项目的小游戏产物不可用，R17）。
  **仍未验证的 3 项已如实列在 B8，未当作已过。**
- **PHASE WP4 步骤 1** — `world-construction` 分包完成，四道门全过（§11）：
  主包 **15,624 → 10,629.3 KB**（−4,994.7 KB，−32.0%），`game.json` 正式声明两个分包，
  该资产在主包里 **0 个 uuid 命中**；运行时实测 `constructionLandmark.loadState = "READY"`、
  游戏内 `visible = true`。**主包仍是 4,096 KB 上限的 2.60 倍 ⇒ B1 依然 BLOCKED。**

### 下一步：PHASE WP4 — 扩展 Bundle（按审计真实贡献排序）

顺序：`world-construction`（**已完成**，§11）→ `shared-gameplay`（3,205 KB）→
`endless`（248 KB）→ `arena` → `cosmetics`。
每次一个逻辑组：配置 → 构建 → 体积审计 → 运行时 → 回归。**禁止一次搬完所有资源。**
`arena` / `cosmetics` 在 `wechat-bundle-map.json` 里是**预留空包**（两者都没有独占资源），
搬之前必须先确认是否真的存在可搬的资源，否则应如实记为「无可搬内容」而不是硬造一个包。

> **⚠️ 本节已被 §12 的边界审计取代。** 上面这份顺序是 WP0 按**目录路径**推出来的，
> 而 §12 用**引用图闭包**重新判定后结论不同：mandate 列表里的
> `world-warehouse` / `world-supermarket` / `world-parking` / `arena` / `cosmetics`
> **五组都无可搬内容**（`arena` 与 `cosmetics` 的「预留空包」结论被独立复现），
> `endless` 的 241 KB 是开场首屏必需资源，真正剩下的只有 `shared-gameplay`。
> **以 §12 为准。**

> **⚠️ 更正（WP4 步骤 1 实测）**：本节原先写「WP4 的加载路径**不需要新代码**：`REGION_ASSET_BUNDLES`
> 加一行、`BOOT_BUNDLES` 按需增减即可」。**这只对「区域专属包」成立。**
> `world-construction` 不是区域包（没有格子等它、也不该进 `BOOT_BUNDLES`），
> 它的加载点是一个 `resources.load()` 回调 ⇒ **必须改代码**：
> 给 `RegionBundleService` 加一个 `getBundle()` 访问器 + 重写 `loadConstructionLandmark()`。
> 后续 `shared-gameplay` / `endless` 同样是**非区域包**，请按同样的方式估算工作量。

### 需要业主拍板后才能做

- **F 引擎插件（分离引擎）** 与 **G 内置 `main` 包压缩类型 = 小游戏分包**（§4.2）—— 决定 4 M 主包能否达标。
- **A+B 引擎功能裁剪**（bullet 484 KB + spine 471 KB，LOW 风险但改的是引擎能力集）。
- **C skybox 850 KB**（构图决策）、**B3 发布包剔除调试代码**。

> 构建纪律：全机同时只允许 **1 个** Cocos build。超过 5 分钟日志无新增即按 stall 处理（查 `CocosCreator.exe`/`node.exe`/项目锁/日志 mtime），**禁止盲等 20 分钟**。跑 `build:*` 前先备份 `cocos/docs/evidence/v2/platform/`（该脚本会覆盖已入库证据，实测已发生三次）。

---

## 11. PHASE WP4 步骤 1 实测：第一个扩展 Bundle = `world-construction`（2026-09-23 01:35–02:20）

证据：`cocos/docs/evidence/final/platform/wechat-build-wp4-world-construction-subpackage.json`

### 11.1 为什么先搬它（先量，再搬）

`cocos/assets/resources/art/construction/majadroid-construction-site.fbx` 是**一个**源文件
（789,276 B），Creator 把它导入成一个 **43,142 三角形**的网格。上一个构建里，
**仅这个网格**就是 `assets/resources/native/41/41c6d840-…@8fac0.bin = 4,376,316 B`，
整个 `assets/resources` 合计 **4,731,829 B（4,621 KiB）** —— 与 `wechat-bundle-map.json`
估算的 4,617 KB 相差 0.1%，**估算被真实产物证实**。

**它是惰性的**：fbx 的 uuid `41c6d840-…` 在 `cocos/assets` 下**任何** `.scene`/`.prefab`/`.json`
里都不出现，只能通过 `resources.load()` 回调到达 ⇒ 搬出启动路径是安全的。

### 11.2 改了什么

| 项 | 内容 |
| --- | --- |
| 新包根 | `cocos/assets/bundles/world-construction/`（**不在 `assets/resources/` 下**，R8 不允许嵌套） |
| 包配置 | `world-construction.meta` → `{isBundle:true, bundleConfigID:"mini-game-subpackage", bundleName:"world-construction", priority:10}` |
| 搬运 | fbx + 其 `.meta`（**uuid 不变**，789,276 B 与 HEAD blob 逐字节相同） |
| 删除 | `resources/art.meta`、`resources/art/construction.meta`（搬空后的孤立目录 meta） |
| 保留 | `resources/material.mtl`（孤立 `cc.Material`，225 B，无人引用）—— 留在原处让 `resources` 包保持非空有效 |
| 代码 | `RegionBundleService.getBundle()`（新增访问器）+ `loadConstructionLandmark()` 重写 + `observeRegionArtAttempt()` 改读本次 attempt 自己的 rejection |
| 契约 | `test_region_bundle_contract.mjs` 新增 6 项检查（含通用的 **`NO_NESTED_BUNDLE_ROOTS`** 枚举） |

**刻意不做**：地标**没有**进 `REGION_ASSET_BUNDLES`，也**没有**进 `BOOT_BUNDLES`。
它是可选布景，没有格子等它；把开局格门控在 4.6 MB 下载上会让**每个玩家**的首帧被推迟。
失败仍然退化为「没有地标」，与它当初待在 `resources` 包里时**完全一致**。

`observeRegionArtAttempt()` 的那处改动是**为了不引入新耦合**：服务的 `lastFailure` 只有**一个槽**，
多一个包在飞之后，`world-construction` 的失败有可能被当成 `world-city` 的失败播给玩家。
改成读本次 attempt 自己的 rejection 之后，这个交叉污染在结构上不可能发生。

### 11.3 PACKAGE GATE（真实构建，非估算）

| 指标 | 改前 | 改后 |
| --- | --- | --- |
| `totalReleaseKiB` | 17,107 | **16,691.5** |
| `mainPackageKiB` | 15,624 | **10,629.3**（−4,994.7，−32.0%） |
| `world-construction` | — | **4,620.6** |
| `world-city` | 1,483 | 1,441.6 |
| `allSubpackagesKiB` | 1,483 | **6,062.2** |
| 文件数 | 201 | 203 |

构建行：`PASS wechatgame: 203 files, launch=db://assets/scenes/Game.scene, boot=world-city,
subpackages=[world-construction,world-city], AppID=wx6ac3f5090a6b99c5 (configured), libVersion=widelyUsed.`

`game.json` 由 **Creator 自己的 bundle 配置**生成两个分包条目，**没有手改构建产物**。

**资产确实离开了主包**：在 `assets/main/` 下检索 `41c6d840` 与压缩形式 `41xthAEOpAFINHET8mh0N3`
⇒ **0 命中**；那个 4,376,316 B 的网格现在在
`subpackages/world-construction/native/41/…@8fac0.bin`。

### 11.4 主包仍然不可达 4 M（B1 的实证复现）

改后主包 10,629.3 KB 的构成：

| 组成 | KiB | 占 4,096 KB 上限 |
| --- | --- | --- |
| `cocos-js`（引擎） | **4,051.2** | **98.9%** |
| `assets/main` | 5,576.0 | 136% |
| `assets/internal` | 601.4 | 14.7% |
| `src` | 237.3 | 5.8% |
| `assets/resources` | 1.1 | 0.03% |

**光引擎就吃掉整个主包预算的 98.9%** ⇒ 无论再搬多少资源，主包都到不了 4 MB。
这不是 WP4 能解决的问题，只能由 §4.2 的引擎级开关（F/G、A+B 裁剪、C skybox、B3 剥调试码）跨越，
**属业主决策**。

### 11.5 RUNTIME GATE：分两个平台各自证一半

小游戏**没有** QA 探针 —— `GameManager.installQABridgeIfRequested()` 门控在
`globalThis.location.search` 上，那是**浏览器专属**的。所以：

- **微信小游戏**（`cocos/build/wechatgame`，开发者工具 Stable 2.01.2510290，工具 → 编译后重载）
  证明的是**打包**：冷启动进 Home、世界渲染（无黑屏、无 boot 重试浮层）、
  进入对局可玩（金币 72 / LV.1 级黑洞 / 质量 150kg / 区域 `卧室杂物区` / 道路树木车辆 HUD 齐全）。
  控制台仍是 `调试器 2, 3` + 一条 DevTools 自身的 `devtools_profile_parser` 行，
  **与 WP3c 基线一致**；但停靠栏放不大、无法逐行枚举 ⇒ **只作为限制说明，不作为逐行证明**。
- **web-mobile**（`?qa=1` + Playwright，`.scratch/wp4-web-drive.mjs`）证明的是**代码路径**，
  因为只有浏览器能读 `__BHR_QA__`。`GameManager.onLoad()` → `initWorld()` → `loadConstructionLandmark()`，
  所以包在**启动时**就开始下载，驱动脚本随后按已发布的 layout 常量点进对局：

| 步骤 | gameState | uiScreen | 格子数 | `constructionLandmark` |
| --- | --- | --- | --- | --- |
| boot | HOME | Home | 8 | `READY`, visible **false** |
| home-start | MODE_SELECT | Home | 8 | `READY`, false |
| mode-select-endless | MODE_READY | Home | 8 | `READY`, false |
| mode-ready-start | **PLAYING** | **Gameplay** | **9** | **`READY`, visible true** |

最终：`activeCells` 含 `0:0`、`currentRegionName = 卧室杂物区`、
**pageErrors 0、failedRequests 0**，`world-construction` 的 8 个请求全部 200。

> **为什么 Home 阶段 `visible: false` 不是回归**：`gameState` 还是 HOME 时流送器只装了
> `0:0` 的 8 个邻居、**没有 `0:0` 自己**，而 `installConstructionLandmarkInOpeningCell()`
> 是挂到 `0:0` 格子上的；一进对局格子数变 9、`visible` 立刻为 true。
> `git diff -U0` 显示 `installConstructionLandmarkInOpeningCell()` 与 `hasConstructionLandmark()`
> **本次一字未改**（只动了调用点）⇒ 该行为是既有设计，不是本次引入。

### 11.6 回归

`npm run test:full`（= `test:cocos` + `test:contracts` + `test:authoring`）**EXIT=0**，
**396 条 PASS**，`[FAIL]` **0 条**（`grep FAIL` 的 6 条命中全是文本里含 "FAIL" 的 PASS 行，
如 `BOOT_FAILURE_HAS_RETRY`）。`typecheck:cocos` 无输出即通过。

### 11.7 ⚠️ 过程中发生的事故（必须记录）

本次施工中 `git rm` **两次**触发工具 SIGTERM，随后工作区回滚把**整个 `cocos/assets`
（439 文件）逐个送进 Windows 回收站**，并留下 0 字节的 `.git/index.lock`。
`git rm` 自身从未执行（index 里没有 staged delete，锁还握着），删除窗口内 **435 条全部落在
`cocos/assets` 下**、自底向上、且内容被文本规范化过 ⇒ 是**回滚例程**干的，不是 git。

**已完整恢复**（439 文件 = 439 文件、`git status` 删除数 0、`git diff --check` 干净、
`typecheck` 通过），恢复脚本 `.scratch/restore_assets.py`（copy 而非 move，回收站留作兜底）。

**纪律**：本机**禁止 `git rm` 与 `rmdir`**，删文件用 `rm`/Python；**任何 SIGTERM 之后先查
`.git/index.lock`**（`git status`/`git diff` 是读操作，锁还在也能跑，所以「status 正常」不代表没中招）。
副作用：恢复后工作树行尾变 LF，git 视其为未修改、属良性，**不要**用 `git checkout --` 去「修」。

---

## 12. PHASE WP4 步骤 2 实测：剩余候选组的可搬性判定 + 主包理论下界（2026-09-23 03:05–04:05）

证据：`cocos/docs/evidence/final/platform/wechat-build-wp4-boundary-audit.json`

### 12.1 为什么必须重做判定：按目录归组是不够的

WP0 的 `wechat-bundle-map.json` 用**源路径正则**把资源分到 bundle（例如
`art/world/residential/` → `endless`）。这个做法有一个致命漏洞：

> **Cocos 里 launch scene 序列化的依赖必须在 `loadScene` 之前就位，而引擎不会自动加载依赖包。**

所以一个资源能不能搬，取决于**谁引用它**，不取决于它放在哪个目录。
正确判据是**引用图闭包**：从 `cocos/assets/scenes/*.scene` 出发沿 uuid 做传递闭包，
凡被闭包覆盖即「启动可达」。

新增两个工具（本轮新建，可复用）：

- `.scratch/boot-closure.mjs` — uuid→源文件索引（含 `.meta` 的 `subMetas` 子资源）+ 场景出发的传递闭包，
  按候选组汇总 boot / free 字节。
- `.scratch/where-uuid.mjs` — 解码构建产物里 **base64 压缩形式**的 uuid，定位资源真实归属包。

> ⚠️ **坑（与 WP4 步骤 1 同源）**：构建产物把 uuid 存成压缩形式
> （`41c6d840-…` → `41xthAEOpAFINHET8mh0N3`），**直接 grep 原始 uuid 永远 0 命中**。
> 但 0 命中同样可能只是「引用而非拥有」⇒ 判定归属要看 `native/<uuid前两位>/` 是否存在载荷字节。

### 12.2 判定表（9 组，逐组给出证据）

| 组 | 判定 | 证据 |
| --- | --- | --- |
| `world-warehouse` | **无可搬内容** | 它是 `DistrictKind`（`DistrictTemplates.ts:65`），只定义资源簇中心点与偏好类型；文件头注释写明 *every visual is resolved through the Creator-saved WorldArtLibrary*。审计 `sizeByOwner` 里不存在任何 per-district owner。 |
| `world-supermarket` | **无可搬内容** | 同上（`DistrictTemplates.ts:48`）。 |
| `world-parking` | **无可搬内容** | 同上（`DistrictTemplates.ts:70`）。 |
| `world-construction` | **已完成** | §11，四门全过。 |
| `world-city` | **已完成** | WP2 pilot，`subpackages/world-city` = 1,441.6 KB。 |
| `arena` | **无可搬内容** | 全资产树 `-iname "*arena*"` 只命中 `.ts` 脚本 + `textures/home/mode_arena_card.png`（一张**首页模式卡**）。无 arena 专属美术目录；竞技场复用共享 gameplay 美术与同一个 `Game.scene`。把首页模式卡搬进 arena 包是错的。 |
| `endless` | **可搬但收益低** | 提案 247.8 KB = `building-type-b.glb` 146,720 B + `building-type-c.glb` 99,592 B + `BedroomChunk.prefab` 1,028 B。**前两个被 `Game.scene` 与开场单元格 `GoldenCityCell.prefab` 直接引用**（开场单元格就是第一屏）；第三个**全资产树 0 引用**，且 uuid 是手写的 `prefab-chunk-0003-8888-9999-aaaabbbbcccc`（非 Creator 十六进制格式）⇒ 是**死资产**，不是可搬资产。 |
| `cosmetics` | **无可搬内容** | `SKINS_CONFIG`（`GameConfig.ts:296-304`）5 个皮肤只有 `color` / `rimColor` 两个十六进制字符串，没有任何 mesh 或 texture。 |
| `shared-gameplay` | **可搬且具决定性** | 约 3,205 KB，是唯一体量足够跨过门禁的资产杠杆。**包根不能选 `cocos/assets/art/world`** —— `world-city` 已在 `art/world/city`，会构成嵌套包（平台禁止，`NO_NESTED_BUNDLE_ROOTS` 会拦）。必须另择包根，例如 `cocos/assets/bundles/shared-gameplay/`。 |

> **结论**：mandate 的 WP4 列表里 9 个名字，只有 3 个是真实的资源组（`world-construction`、
> `world-city`、`shared-gameplay`），其余 5 个**确实没有可搬资源** —— 这是独立复现的结果，
> 不是漏查。`endless` 名义上存在但那 241 KB 属于首屏必需。

### 12.3 决定性数字：主包存在一个搬资源跨不过的下界

当前主包 **10,629.3 KB** 的构成（真实产物实测）：

| 组成 | KB | 说明 |
| --- | ---: | --- |
| `assets/main` | **5,576.0** | `native/` 5,095.6 + `index.js` 310.3 + `import/` 163.9 + `config.json` 6.2 —— **唯一可搬的部分** |
| `cocos-js` | **4,051.2** | 引擎。**一项就占 4,096 KB 上限的 98.9%** |
| `assets/internal` | 601.4 | 引擎内置资源，启动期 `builtinResMgr` 需要 |
| `src/` | 237.3 | 项目脚本 |
| 根目录启动脚本等 | 162.4 | `web-adapter.js` 87.9 / `engine-adapter.js` 19.8 / `first-screen.js` 17.5 / logo+slogan 25.4 / `application.js` 8.4 / `game.js` 2.5 / 两个 json 0.9 |
| `assets/resources` | 1.1 | 已搬空到只剩 `material.mtl` |

⇒ **把 `assets/main` 全部搬空**（一件不留）后：

```
主包下界 = 4,051.2 + 601.4 + 237.3 + 162.4 + 1.1 = 5,053.3 KB
         = 官方上限 4,096 KB 的 1.23 倍
         = 内部目标 3,482 KB 的 1.45 倍
```

> **这就是 B1 的数学证明**：不是「还没搬够」，而是**搬资源在数学上不可能跨过 4 M 门禁**。
> 剩下的唯一变量是引擎（`cocos-js` 4,051.2 KB）与 `assets/internal`（601.4 KB）。

顺带一条可复用的交叉校验：`assets/main/native/` 的 67 个 uuid 前缀桶里，
`9b` = **1,465.0 KB**，与审计的 `art/machines` = **1,465.0 KB** 逐字节吻合
⇒ **桶名前两位即 uuid 前两位**，可直接按资源组反查主包内的载荷。

### 12.4 存在一条可行路径（但第一半是业主决定）

若 **`separateEngine`（引擎插件）** 把 `cocos-js` 移出主包：

```
主包下界 = 1,002.1 KB
可留给 assets/main 的预算 = 4,096 − 1,002.1 = 3,093.9 KB
需要搬走的量 = 5,576.0 − 3,093.9 = 2,482.1 KB
```

而 `shared-gameplay` 约 2,900–3,205 KB > 2,482.1 KB ⇒ **一个包就够**：

| 方案 | 主包 | vs 4,096 上限 | vs 3,482 内部目标 |
| --- | ---: | --- | --- |
| 现状（WP4 步骤 1 后） | 10,629.3 KB | 2.60× ❌ | 3.05× ❌ |
| 只搬 `shared-gameplay` | ≈ 7,424 KB | 1.81× ❌ | 2.13× ❌ |
| **`separateEngine` + 搬 `shared-gameplay`** | **≈ 3,373 KB** | **0.82× ✅** | **0.97× ✅** |

> **⇒ 单独搬资源没有意义，必须与 `separateEngine` 同时成立。** 而 `separateEngine`
> 属 §4.2 的业主决定项，且**需要 release 版本编辑器 + 非 debug 构建**才能实测
> ⇒ 本机（开发版编辑器）**无法验证**，只能标注 `NOT_MEASURED`。

**引擎裁剪也不是替代方案**：只裁 bullet（484 KB）+ spine（471 KB）后
`cocos-js` ≈ 3,096 KB，加上 `internal/src/根脚本` 1,002.1 KB = **4,098 KB**
—— 仍在 4,096 KB 之上，而且**还没有装任何游戏资源**。

### 12.5 机制确认：被 launch scene 引用的资源**仍然可以**分包

这一点必须说清楚，否则 §12.1 的闭包结论会被误读成「启动可达 ⇒ 不可搬」。

- **实证**：`world-city` 本身就是启动可达却已成功分包的包 —— `Game.scene` 的开场单元格
  序列化了 7 个商业区 mesh，它们住在 `world-city` 里，而 WP2/WP3/WP4 的运行时门禁全部通过。
- **机制**：`cocos/build-templates/wechatgame/application.js` 的 `ensureBootBundles()`，
  在 `game.init()` 与 `game.run()` 之间加载 `BOOT_BUNDLES`，每包最多重试 4 次，
  失败弹**真实 Retry 弹窗**。
- **不是机制**：`settings.assets.preloadBundles`（= `[resources, main]`，无错误出口）；
  `config.json` 的 `deps` 字段（引擎源码里 `Bundle.deps` 只是 getter，`config.ts:154` 把它
  当作路径/重定向映射，**不触发加载**）。
- **⚠️ 代价必须如实说**：进 `BOOT_BUNDLES` 的包会在启动时下载 ⇒ **主包变小，但首次下载总量不变**。
  PACKAGE GATE 量的是主包，所以仍算达标；但**不能**声称「首屏下载减少」。

### 12.6 本轮未验证的项

- `separateEngine` 的实际效果 —— 无 release 编辑器，只有官方文档依据，**未实测**。
- `shared-gameplay` 尚未分包，≈3,373 KB 是**投影**不是测量值。
- `BOOT_BUNDLES` 增加分包后的启动耗时与失败率 —— 未测。
- `endless` 若分包的实际收益 —— 未测（且已判定收益低）。


