# V9.6 — Gameplay 美术统一：审计与结论

- 目的：判断 gameplay（世界 / 黑洞 / 车辆 / 目标 / 特效）与 V9.5 采纳的页面美术是否同一套语言，并把「该改的」与「不能改的」分开记录。
- 方法：**读代码路径 + 数引用 + 采样真实像素**，不靠印象。
- 相关：`cocos/docs/design-reference/UI_ART_DIRECTION_CANONICAL.md`（语言权威）、`cocos/docs/V9_5_UI_ART_REBUILD_REPORT.md`（页面侧已完成）
- 审计脚本：`python scripts/audit_gameplay_palette.py`（只读，可复跑）

---

## 1. 结论

**gameplay 的美术统一在结构上已经成立**：每一个可见颜色都只有一个活的所有者，而且它已经与页面美术同族。本轮**没有**做美术改动，因为审计显示可改的对象要么是**死数据**（改了不可见），要么是**已经对齐**的。

同时发现一批**遗留死数据**，它们看起来像"待统一的美术来源"，实际 0 引用。若不标记，下一轮会有人（包括我）按它们去"调和颜色"——本轮就差点这么做。

---

## 2. 关键事实：本作是 unlit 渲染，光照不产生任何画面

`cocos/assets/scripts/core/RenderProfile.ts` 顶部逐字记录：

> Lighting is deliberately unlit. … the serialized DirectionalLight, Ambient and Skybox values are recorded here for reference only and **are not a source of image content**.

`RENDER_EFFECT = 'builtin-unlit'`。因此：

- 世界的颜色 = **贴图 × 材质 tint**，与光照/环境/雾无关；
- `LIGHTING_PROFILE`、`GameConfig` 的 `groundColor` / `ambientLight`（每个区域一套）、scene 里的 `DirectionalLight`/`Ambient`/`SkyboxInfo` 都**不产生画面**；
- 这也是 V10.1 移除 skybox envmap 的第二条独立证据（第一条是 `_envLightingType: 0` = `HEMISPHERE_DIFFUSE`、`useIBL` 为假且场景无 `cc.Skybox` 组件）。

⇒ **"统一 gameplay 美术"在本作里只能通过改贴图与材质 tint 实现，不能通过调光照。**

---

## 3. 活的所有者 vs 死的数据

### 3.1 真正决定画面的（活）

| 表面 | 所有者 | 引用数 |
| --- | --- | --- |
| 世界（地面/道路/建筑/树/道具） | `RenderProfile.WORLD_PALETTE` → `WorldArtLibrary`（`Color.fromHEX(color, WORLD_PALETTE[kind])`） | 3 处应用点 |
| 收集物/车辆/目标的**外观** | `getObjectArtBinding(template.type)` → `WorldArtLibrary.spawn(...)` 的**授权 GLB 美术** | 8 处读 `template.type` |
| 玩家黑洞核心 | `GameConfig.SKINS_CONFIG[].color / .rimColor` → `BlackHoleMachine.applyCoreSkin()`（注释明写「A player skin is re-applied last and still wins」） | 活 |
| 黑洞环/粒子（等级色） | `GameConfig` 等级 `baseColor/rimColor` → `getSingularityLevelVisuals()`，**被皮肤覆盖** | 活 |
| HUD 文本 | `RenderProfile.HUD_SEMANTIC` → 两个 HUD 控制器 | 活 |
| HUD 面板/页面美术 | 烘焙的 v95 PNG（`game_art/ui/v95/*`） | 活 |

### 3.2 看起来像美术来源、实际 0 引用的（死）

| 数据 | 规模 | 引用数 | 说明 |
| --- | --- | --- | --- |
| `RenderProfile.UI_PALETTE` | 12 个角色 | **全部 0** | V6 时代的 UI 调色板；页面换成烘焙 v95 PNG 后无人读 |
| `IObjectTemplate.color` | 25+ 条 Material Design 色（`#e53935`/`#29b6f6`/`#4caf50`…） | **0** | 目标外观走 GLB 美术绑定，不读此字段 |
| `IObjectTemplate.shape` / `.height` / `.size` + `ObjectShape` 枚举 | 25+ 条 | **0** | 早期图元时代的遗留；代码注释本身写着 primitive fallback is prohibited |
| `GameConfig` 区域 `groundColor` / `ambientLight` | 6 个区域 | 0（前轮已发现） | 且 unlit 下本就不产生画面 |

> ⚠️ 这三个字段**不能删**：`OBJECT_TEMPLATES` 被 6 个契约测试（`test_collectible_production_contract`、`test_suction_progression_contract`、`test_vehicle_art_contract`、`test_traffic_replenishment_contract`、`test_resource_replenishment_contract`、`v7_phase3_maps`）读取，删字段会动门禁。已在源码就地标注为死数据。

---

## 4. 与 V9.5 采纳调色板的实测对照

`python scripts/audit_gameplay_palette.py` 采样两边真实像素（16 级量化）：

**采纳的黑洞主视觉**（`game_art/ui/v95/home_hero_blackhole.png`，1120×1120）
- 主体 `#484868`（2.5%）— 去饱和的**藏青紫**
- 核心 `#080808` — 近黑
- 环 `#f8c8f8` / `#e8b8f8` — **浅粉紫**
- （93.7% 为 `#080808`，是 PNG 透明区）

**实际渲染的 gameplay**（`artifacts/qa/v95/gameplay/endless-hud.png`，412×915）
- 英雄核心 `#687898`、`#98a8c8`
- 英雄环 `#d8d8e8`
- 道路 `#485878` / `#d8d8e8`
- 草地 `#588848`

**运行时角色 vs 采纳值**

| 角色 | 当前值 | 最接近的采纳色 | 距离 |
| --- | --- | --- | ---: |
| `skin_classic.color`（黑洞主体） | `#281660` | 主视觉主体 `#484868` | **59.9** |
| `skin_classic.rimColor`（黑洞环） | `#e0d5ff` | 主视觉环 `#f8c8f8` | 28.2 |
| 等级 1 `rimColor`（环能量/粒子） | `#00e5ff` | `SKY_MID #52d0fe` | 84.7 |

### 唯一实质性差异：黑洞主体色相

- 页面主视觉主体是**去饱和藏青紫** `#484868`；游戏内是**高饱和紫** `#281660`（皮肤 `skin_classic` 覆盖等级色，是最终可见值）。
- **但不建议直接采纳页面值**：实测道路的渲染色是 `#485878`，与页面主体的 `#484868` 几乎同色。把玩家核心改成页面主体色，玩家会在路面上**消失**。
- 而产品自己的门禁要求英雄"可找到"（`verify_gameplay_visuals.mjs`：`the hero never shrank below 40 px`、`the hero stayed 0.04 inside the frame`）。
- ⇒ 这是**可读性 vs 与主视觉逐字一致**的取舍，属产品决定。**本轮保留高饱和紫**，并把测量值留档（上表）。

### 世界/车辆/目标：已经同族，不应重调

- 页面卡片的内部是「**a fully illustrated isometric interior — a vignette of the actual game scene**」（canon §4）。也就是说**页面美术是照着这个游戏世界画的**：`sheet-home.png` / `sheet-mode.png` 卡片里的草地、道路、建筑、车辆就是 gameplay 里那一套。
- 若把世界 tint 改成页面场地的天蓝渐变，**卡片的插图会与它描绘的世界不一致**——那才是真正的不统一。
- `WORLD_PALETTE` 的数值本身也有实测依据（注释记录了 road/grass 相对"bright reference"的逐次测量：`#9ca8bc`→rgb(62,74,112)、`#e5dbe6`→rgb(98,108,141)、`#e8edf5`→rgb(109,119,151)）。
- ⇒ **世界与目标美术不动**，理由记录在案。

---

## 5. 本轮实际改动

只做了「防止后人按死数据返工」的标注，**零画面改动**：

1. `RenderProfile.UI_PALETTE` 就地标注：12 个角色 0 引用，页面已改烘焙 PNG，此表仅存历史。
2. `GameConfig.IObjectTemplate` 的 `color` / `shape` / `height` / `size` 与 `ObjectShape` 就地标注：0 引用，外观走 GLB 美术绑定。
3. 新增 `scripts/audit_gameplay_palette.py`：可复跑的对照采样，输出上表数字。

> 之所以不改画面：**改动必须是可验证的**。本轮没有任何一处 gameplay 颜色与页面美术存在「需要修」的差距——除主体色相，而那是有可读性理由的取舍，且属产品决定。

---

## 6. 验证

| 项 | 结果 |
| --- | --- |
| `npm run test:contracts` | PASS（含 `test_vehicle_art_contract`、`test_singularity_visuals_contract`） |
| `npm run typecheck:cocos` | PASS |
| `npm run verify:gameplay-visuals` | PASS（Endless + Arena；英雄最小 99.3 px / 52.5 px，均在框内） |
| 画面回归 | 无（本轮未改任何颜色/贴图/材质） |

---

## 7. 复现

```bash
python scripts/audit_gameplay_palette.py     # 采样并打印对照表
grep -rn "UI_PALETTE\." cocos/assets/scripts --include=*.ts | wc -l   # 0
```
