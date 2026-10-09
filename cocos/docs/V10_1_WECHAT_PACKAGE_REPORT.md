# V10.1 — 微信首包体实测与瘦身报告

- 分支：`dev/product-finalization-20260929`
- 构建：`npm run build:wx`（Cocos Creator 3.8.3，`debug=false`，`platform=wechatgame`）
- 测量工具：`python scripts/measure_wechat_package.py`（只读，可复跑）
- 相关前作：`cocos/docs/release/WECHAT_SUBPACKAGE_PLAN.md`（WP0–WP4）。本报告**更正**该文档两处结论，见 §6。

---

## 1. 结论先行

| 口径 | 数值 | 对比 4,096 KB |
| --- | ---: | --- |
| **微信首包（本次实测）** | **7,394.3 KB** | **1.81× ❌ 超 3,298 KB** |
| 分包总量（另下载） | 9.68 MB | 不计入首包 |
| **把 `assets/main` 载荷全部搬空后的下界** | **5,487.8 KB** | **1.34× ❌** |

**⇒ 微信 4 M 首包上限，靠「搬资源 / 拆分包」在数学上到不了。** 下界里没有一件游戏美术，全是引擎与启动必需项。要过门禁只能动**引擎与内置 `main` 包**，而那是产品决策（§5）。

本次已落地并可复现的减量：**−850 KB（未使用 skybox）**；同时修掉一个**会白屏的发布级缺陷**（§3），并把引擎裁剪写进配置（§4，实测收益低于预期，原因已定位）。

---

## 2. 测量口径（必须先说清楚）

微信的 4 M 限制量的是**首包**＝`game.json` 中**未被声明为分包**的全部文件。

**本次报告不排除 `cocos-js/` 与 `cocos/`。** Cocos 官方 FAQ 原文：

> After the engine plugin is enabled, will the engine code still be counted into the first package?
> **A: According to WeChat's rules, it will still be counted.**
> —— <https://docs.cocos.com/creator/3.8/manual/en/editor/publish/wechatgame-plugin.html>

分离引擎的收益是**启动**（设备已缓存全局引擎插件时可跳过引擎下载，官方称省 0.5~2s），**不是包体预算**。

> ⚠️ **更正**：我在同一轮工作中先按「首包 = 总量 − 分包 − `cocos-js`」报出过 **6.56 MB**。该口径与上述官方说明不符，**已作废**，本报告一律采用 7,394.3 KB。

---

## 3. 本次修掉的发布级缺陷：子包未预加载 ⇒ 白屏

把 `cocos/assets/game_art` 声明为小游戏分包（`bundleConfigID: mini-game-subpackage`）后，`web-mobile` 构建**不再进入首屏**：

```
[console.error] Please load bundle game-art first
```

**根因**：`Game.scene` 直接序列化了 **20 个** `game_art` 资源（`home_field`、`home_hero_blackhole`、模式卡、缎带、面板等 SpriteFrame），而**小游戏分包永远不会出现在 `settings.assets.preloadBundles`** 里（实测该字段为 `["resources","main"]`）。引擎只在运行时抛错，构建的退出码、文件清单、启动场景断言**全都看不出来** —— 这个包当时是「构建 PASS、跑起来白屏」。

**修法**：`cocos/build-templates/*/application.js` 的 `BOOT_BUNDLES` 增加 `'game-art'`（三个平台模板同步，`world-city` 原本就在）。该模板在 `game.init()` 与 `game.run()` 之间加载并重试，是唯一还能「在首屏之前、由项目控制、可重试」的加载点。

**防回归**：新增 `scripts/test_boot_bundle_residency.mjs`，已接入 `npm run test:contracts`。它遍历启动场景的引用闭包，要求**任何被启动场景引用的资源所属 Bundle 必须在 `BOOT_BUNDLES` 里**（或属引擎自带预载的 `resources/main/internal`），并顺带断言三平台模板不漂移、`REGION_ASSET_BUNDLES ⊆ BOOT_BUNDLES`。

> 该守卫做过**反向证明**：从三份模板删掉 `game-art` 后它失败并给出
> `the launch scenes reference 20 asset(s) in bundle "game-art" ... Please load bundle game-art first`，恢复后通过。
> 同时 `verify_cocos_minigame_builds.mjs` 的 `REQUIRED_BOOT_BUNDLES` 也从 `['world-city']` 扩到 `['world-city','game-art']`。

> 注：本文件早先版本用 `grep -c "cc.Skybox\""` 之类写法统计过引用，`-E` 下的 `\|` 是字面量、`__uuid__` 的 `@子资源` 后缀也被漏掉，导致闭包一度只算出 10 个资源。现在的守卫按 36 位 uuid 前缀匹配，能覆盖子资源引用。

---

## 4. 引擎特性裁剪：已写进配置，但收益被「插件镜像」吃掉

- 配置：`cocos/settings/v2/packages/engine.json` → `modules.includeModules`（编辑器内部 `getPreviewShippedFeatures()` 读的就是这个键）。
- 生成器：`python scripts/engine_feature_crop.py`（默认只打印，`--write` 才落盘）。它从引擎自带的 `cc.config.json` 取全部 42 个 feature，删掉本项目证明未用的，再按 `dependentModules` 做闭包，**不手打清单**。
- 本次删掉 **24 个**：`dragon-bones`、`spine`、`tiled-map`、`video`、`webview`、`xr`、`light-probe`、`particle-2d`、`skeletal-animation`、`debug-renderer`、`geometry-renderer`、`marionette`、`procedural-animation`、`meshopt`、`occlusion-query`，以及**全部 8 个物理特性**。保留 18 个。
- 证据：场景/预制体里出现过的 `cc.*` 类型清单里，**没有**任何 Spine / DragonBones / TiledMap / Terrain 组件 / VideoPlayer / WebView / XR / Collider / RigidBody / LightProbeGroup / ParticleSystem2D / SkinnedMeshRenderer。`terrain` 故意保留（`Game.scene` 里还留着一个名为 `TerrainTileTemplate` 的材质，删特性会让它缺 effect）。

**实测效果（与预期不符，如实记录）**：

| 目录 | 裁剪前 | 裁剪后 |
| --- | ---: | ---: |
| `cocos-js/` | 1.72 MB | **0.95 MB** |
| `cocos/` | 2.47 MB | **2.47 MB（没变）** |

`cocos/` 里 `dragon-bones.js`(249 KB)、`spine.js`(68 KB)、`tiled-map.js`(58 KB) **仍在**。原因：`cocos/` 是**微信引擎插件的本地镜像**（`modules/platform-extensions/extensions/wechatgame/static/cocos/plugin.json` = `{"main":"base.js"}`），构建直接铺这份预编译内容；`modules.includeModules` 只过滤到插件入口与 wasm。**所以引擎裁剪对首包几乎无效**（`cocos-js` 那 0.77 MB 仍是首包）。

构建脚本已把 `useBuildEngineCache: false` 写进平台配置，但实测 wechatgame 日志仍无 `build-engine` 行 —— 该开关没有改变这份镜像的来源。

---

## 5. 首包下界与唯一剩下的手段

首包 7,394.3 KB 构成：

| 组成 | KB | 能不能搬 |
| --- | ---: | --- |
| `cocos/`（插件镜像） | 2,530.1 | ❌ 引擎 |
| `assets/internal`（内置 effect 包） | 1,035.5 | ❌ 启动期 `builtinResMgr` 需要 |
| `cocos-js/`（插件入口 + wasm） | 968.6 | ❌ 引擎 |
| `assets/main` | 2,323.0 | ⚠️ 唯一可搬的部分 |
| `src/` | 369.9 | ❌ 项目脚本 |
| 根目录启动文件 | 163.2 | ❌ 适配层 |
| `assets/resources` | 4.0 | 已搬空 |

**把 `assets/main` 的 native + import 载荷一件不留地搬走，首包仍有 5,487.8 KB = 上限的 1.34 倍。**

因此剩下只有两条路，**两条都改变首屏下载行为，属产品决策，需业主拍板**：

| 手段 | 可省 | 代价 |
| --- | ---: | --- |
| **内置 `main` 包压缩类型 = 小游戏分包**（构建任务选项 `mainBundleCompressionType`，本地持久化在 gitignore 的 `cocos/profiles/`） | `assets/main` 2,323 KB | 启动前必须再下一次 `subpackages/main`；把「首屏必要」整体推迟一次下载 |
| **远程包 / CDN** | 选中的 Bundle 整体移出本地包 | 需**已备案 HTTPS 域名** + CDN；`wx.downloadFile` 不能是 IP/localhost；失去「代码包缓存后可离线打开」 |
| （次选）把 `art/machines` 1389 KB、`textures/home` 970 KB 单独声明为分包并加入 `BOOT_BUNDLES` | 2,359 KB | 仍**过不了** 4 M（下界 5,488 KB），只把超限从 1.81× 压到 1.24×；换来 8 个启动期串行 Bundle 下载 |

> 「把引擎裁剪当替代方案」也已证伪：裁完 24 个特性，首包仍 7.22 MB。

---

## 6. 对 `WECHAT_SUBPACKAGE_PLAN.md` 的两处更正

1. **§4.2 / §12.4 的 `separateEngine` 预期不成立。** 该文档按「分离引擎把 `cocos-js` 移出首包 ⇒ 首包下界 1,002.1 KB ⇒ `separateEngine` + 搬 `shared-gameplay` ≈ 3,373 KB 达标」推演。按 Cocos 官方 FAQ（§2 引文），引擎文件**仍计入首包**，故该投影作废；`separateEngine` 已在本次真正启用（见 §7），实测首包 7,394.3 KB。
2. **§4.2 手段 C「skybox 850 KB」由 MEDIUM/需业主拍板 降为 LOW/已执行。** 该文档判定「两个 scene 都引用了 skybox ⇒ 属构图决策」。本次读到引擎源码后确认它**从未被采样**：
   - `_envLightingType: 0` = `EnvironmentLightingType.HEMISPHERE_DIFFUSE`，而 `SkyboxInfo.useIBL` 仅在非 0 时为真 ⇒ IBL 关闭；
   - 两个场景里 `cc.SkyboxInfo` 各一处，**没有任何 `cc.Skybox` 组件** ⇒ 天空盒根本不渲染；
   - 贴图本身是编辑器给每个新场景注入的内置 `default_skybox.hdr`，不是项目美术。
   已把 `_envmapHDR` / `_envmap` / `_envmapLDR` 置 `null`（`Game.scene` + `Bootstrap.scene`）。移除后重跑玩法视觉门禁与布局门禁全 PASS，世界渲染观感不变（`artifacts/qa/v95/gameplay/endless-hud.png`）。

---

## 7. 构建机制：`configPath` 是唯一能表达嵌套平台选项的形式

`packages.wechatgame.separateEngine` 是嵌套键，而 `--build` 把参数按 `;` 拆成**顶层** `key=value`：

| 形式 | 结果（读构建日志里的 resolved options） |
| --- | --- |
| `separateEngine=true;` | 顶层出现字符串 `"separateEngine":"true"`，被忽略 |
| `packages.wechatgame.separateEngine=true;` | 整个键被丢弃，`separateEngine` 仍 `false` |
| 内联 JSON 对象 | Creator **忽略全部选项**，退化成 `web-desktop` 构建，启动场景也错 |
| **`configPath=<文件>`** | ✅ `packages.wechatgame.separateEngine` 为 `true`，`game.json` 出现 `plugins.cocos` |

因此 `scripts/verify_cocos_minigame_builds.mjs` 改为**生成** `cocos/build-configs/<platform>.json`（已 gitignore）再传 `configPath=`。该文件的 `startScene` 与 `separateEngine` 两项由 `test_region_bundle_contract.mjs` 的 `BUILD_PASSES_START_SCENE` 断言。

---

## 8. 本次验证记录

| 门禁 | 结果 |
| --- | --- |
| `npm run test:contracts` | **PASS**（含新增 `test_boot_bundle_residency`） |
| `npm run test:authoring` | PASS |
| `npm run typecheck:cocos` | PASS |
| `npm run verify:audio` / `verify:page-tokens` / `verify:ui-kit` | PASS |
| `npm run verify:layout`（8 页 × 3 视口） | **PASS** |
| `npm run verify:gameplay-visuals`（Endless + Arena） | **PASS** |
| `node scripts/probe_boot.mjs` | 20s 内到 `HOME`，无 console error |
| `npm run build:wx` | PASS（371 文件；`boot=world-city+game-art`；分包 `game-art,world-construction,world-city`） |

---

## 9. 阻塞项（外部 / 业主）

| 项 | 状态 | 说明 |
| --- | --- | --- |
| **微信首包 4 M 门禁** | ❌ 未达标 | 下界 5,487.8 KB（1.34×）。需业主在「`main` 包分包」与「远程 CDN」之间拍板，二者都改变首屏下载行为 |
| **微信开发者工具实测首包** | `DEVICE_BLOCKED_EXTERNAL` | 本机 DevTools 已装（`C:\Program Files (x86)\Tencent\微信web开发者工具`），但其 CLI 无本地体积查询命令，`preview/upload` 需登录；且已记录**登录账号不是该小游戏（`wx6ac3f5090a6b99c5`）的开发者**（见 `WECHAT_SUBPACKAGE_PLAN.md` §6.3）。故 §1 的数字是**文件系统口径**，非 DevTools 口径 |
| 抖音 AppID | ❌ 占位 | `npm run preflight:release` 仍报 `found testappId`，不得当作可发布 |
| 授权音频素材 | 待业主 | 见 `verify:audio` 与音频资产契约 |

---

## 10. 复现

```bash
python scripts/engine_feature_crop.py          # 打印裁剪清单（--write 落盘）
python scripts/measure_wechat_package.py       # 首包实测与构成
npm run build:wx                               # 生成 cocos/build/wechatgame/
node scripts/probe_boot.mjs                    # 启动自检（web-mobile 产物）
npm run test:contracts                         # 含 test_boot_bundle_residency
npm run verify:layout && npm run verify:gameplay-visuals
```
