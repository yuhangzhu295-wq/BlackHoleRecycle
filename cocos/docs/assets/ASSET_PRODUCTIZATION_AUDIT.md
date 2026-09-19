# Asset Productization Audit — V4

Scope: every art asset the shipping product shows to a player.
Method: enumerate what is actually on disk under `cocos/assets/art`,
`cocos/assets/textures` and `cocos/assets/prefabs/ui`, cross-check it against the
semantic binding in `ObjectArtRegistry.ts` / `WorldArtLibrary.ts`, then classify
against the V4 requirement in `design-lock.md` and the coverage list in the V4
brief §35.

Statuses: `KEEP` · `REPLACE` · `MISSING` · `PLACEHOLDER` · `STYLE_MISMATCH`

## 0. Inventory Facts

| Fact | Value |
| --- | --- |
| Total glTF / GLB art files | 62 |
| Assets registered in `asset-license-manifest.json` | 56 |
| Commercial use allowed | 56 / 56 |
| Primitive / procedural fallback in the shipping path | **0** — `CompressibleObject.getArtLibrary()` throws instead of falling back |
| Semantic object types bound in `ObjectArtRegistry` | 23 + `arena_mass_fragment` |
| `cocos/assets/textures/ui/` | **empty** — no files |
| UI art actually present | `cocos/assets/textures/home/` (PNG + SVG pairs) and `cocos/docs/design-assets/*.svg` |

## 1. Vehicles

| Asset | Path | Status | Note |
| --- | --- | --- | --- |
| Sedan | `art/vehicles/sedan.glb` | KEEP | Real T5 target, Kenney city kit |
| Delivery van | `art/vehicles/delivery-van.glb` | KEEP | Real T5 target |
| Garbage truck | `art/vehicles/garbage-truck.glb` | KEEP | Real T5 target |
| Bulldozer | `art/machines/poly-google-bulldozer.glb` | KEEP | Arena bot presentation only, never a swallowable target |
| Photoreal or high-poly vehicle | — | — | **None present.** No `STYLE_MISMATCH` in this category. |

## 2. Swallowable Targets — T1 to T5

### T1

| Requirement | Asset | Status |
| --- | --- | --- |
| 易拉罐 | `art/recyclables/food/soda-can.glb` | KEEP |
| 瓶子 | `art/recyclables/food/soda-bottle.glb` | KEEP |
| 纸团 | `art/recyclables/props/paper-scrap.glb` | KEEP |
| 电池 | `art/recyclables/props/battery.glb` | KEEP |
| 小盒 | — | MISSING |
| 小垃圾 | `art/recyclables/props/trash-bag.glb` (bound as T2) | MISSING at T1 |
| 额外 | `food/apple.glb`, `props/toy-duck.glb` | KEEP |

T1 coverage: 5 of 6 required. No primitive placeholders.

### T2

| Requirement | Asset | Status |
| --- | --- | --- |
| 纸箱 | `art/recyclables/furniture/cardboard-box.glb` | KEEP |
| 路障 | `art/world/roads/construction-cone.glb` | KEEP |
| 垃圾桶 | `art/world/pretty-park/trashcan.gltf` exists but is bound to `parkTrashcan` (environment), not to a T2 target | MISSING as a swallowable target |
| 工具箱 | — | MISSING |
| 小推车 | — | MISSING |
| 额外 | `furniture/book-stack.glb`, `props/paint-bucket.glb`, `props/trash-bag.glb` | KEEP |

T2 coverage: 2 of 5 required.

### T3

| Requirement | Asset | Status |
| --- | --- | --- |
| 椅子 | `art/recyclables/furniture/chair.glb` | KEEP |
| 桌子 | `art/recyclables/furniture/coffee-table.glb` | KEEP |
| 长椅 | `art/world/pretty-park/bench.gltf` exists but is bound to `parkBench` (environment) | MISSING as a swallowable target |
| 轮胎 | `art/props/tire.glb` | KEEP |
| 自动售货机 | — | MISSING |
| 额外 | `furniture/monitor.glb` | KEEP |

T3 coverage: 3 of 5 required.

### T4

| Requirement | Asset | Status |
| --- | --- | --- |
| 沙发 | `art/recyclables/furniture/sofa.glb` | KEEP |
| 花坛 | `art/world/pretty-park/flower_A.gltf`, `flower_B.gltf` exist but are bound to `parkFlowerA/B` (environment) | MISSING as a swallowable target |
| 广告牌 | — | MISSING |
| 树 | `art/world/environment/tree-small.glb`, `tree-large.glb`, `pretty-park/tree.gltf`, `tree_large.gltf` exist as environment | MISSING as a swallowable target |
| 大型街道设施 | — | MISSING |
| 额外 | `furniture/shelf.glb`, `industrial/crate.glb` | KEEP |

T4 coverage: 1 of 5 required.

### T5

| Requirement | Asset | Status |
| --- | --- | --- |
| 轿车 | `art/vehicles/sedan.glb` | KEEP |
| 货车 | `art/vehicles/delivery-van.glb`, `garbage-truck.glb` | KEEP |
| 大型城市物体 | `art/recyclables/industrial/shipping-container.glb` | KEEP |

T5 coverage: 3 of 3 required.

## 3. Road Facilities

| Asset | Status |
| --- | --- |
| `world/roads/road-straight.glb` | KEEP |
| `world/roads/road-crossroad-path.glb` | KEEP |
| `world/roads/street-light.glb` | KEEP |
| `world/roads/construction-cone.glb` | KEEP |
| `world/environment/path-stones-long.glb` | KEEP |
| `world/environment/tile-low.glb` | KEEP |
| `world/environment/fence.glb` | KEEP |

## 4. Trees

| Asset | Status |
| --- | --- |
| `world/environment/tree-small.glb` | KEEP |
| `world/environment/tree-large.glb` | KEEP |
| `world/pretty-park/tree.gltf` | KEEP |
| `world/pretty-park/tree_large.gltf` | KEEP |
| `world/pretty-park/bush_large.gltf` | KEEP |
| `world/pretty-park/hedge_straight_long.gltf` | KEEP |
| `world/pretty-park/hedge_corner.gltf` | KEEP |

Four distinct tree assets already exist, which is why "tree as a T4 target" is
recorded as MISSING **as a target** rather than as MISSING art: the geometry is
already in the project and only the semantic binding is absent.

## 5. Benches

| Asset | Status |
| --- | --- |
| `world/pretty-park/bench.gltf` | KEEP as environment |
| Bench as a swallowable T3 target | MISSING |

## 6. Trash Bins

| Asset | Status |
| --- | --- |
| `world/pretty-park/trashcan.gltf` | KEEP as environment |
| Trash bin as a swallowable T2 target | MISSING |

## 7. Shops / POI

| Asset | Status |
| --- | --- |
| `world/city/commercial-building-a.glb` | KEEP |
| `world/city/commercial-building-d.glb` | KEEP |
| `world/city/commercial-building-f.glb` | KEEP |
| `world/city/commercial-building-g.glb` | KEEP |
| `world/city/commercial-building-h.glb` | KEEP |
| `world/city/commercial-skyscraper-a.glb` | KEEP |
| `world/city/commercial-skyscraper-b.glb` | KEEP |
| `world/residential/building-type-b.glb` | KEEP |
| `world/residential/building-type-c.glb` | KEEP |
| `world/pretty-park/fountain.gltf` | KEEP |
| `world/pretty-park/street_lantern.gltf` | KEEP |
| `world/pretty-park/cobble_stones_large.gltf` | KEEP |
| `world/pretty-park/floor_grass_sliced_base.gltf` | KEEP |

## 8. UI Icons

| Icon | Asset | Status |
| --- | --- | --- |
| Coin | `textures/home/home_coin.png` + `.svg` | KEEP |
| Settings / gear | `textures/home/home_settings.png` + `.svg` | KEEP |
| Mode | `textures/home/home_action_mode.png` + `.svg` | KEEP |
| Machine | `textures/home/home_action_machine.png` + `.svg` | KEEP |
| Skin | `textures/home/home_action_skin.png` + `.svg` | KEEP |
| Start CTA frame | `textures/home/home_start_button.png` + `.svg` | KEEP |
| Logo | `textures/home/home_logo.png` + `.svg` | KEEP |
| Hero | `textures/home/home_blackhole_hero.png` + `.svg` | KEEP |
| HUD panel | `textures/home/home_hud_panel.png` + `.svg` | KEEP |
| Mode Select card art | `docs/design-assets/mode-arena-card-v2.svg`, `mode-endless-card-v2.svg`, `mode-background-v2.svg` | KEEP |
| Pause icon | — | MISSING |
| Tier lock icon | — | MISSING (the V4 lock allows a small lock glyph; today only text is drawn) |
| Settlement trophy / medal | — | MISSING |
| Revive countdown ring | — | MISSING |
| Unified `textures/ui/` icon set | directory is empty | MISSING |

## 9. Style Consistency

| Check | Result |
| --- | --- |
| Primitive placeholders in the shipping path | none |
| Photoreal / high-poly assets | none |
| Mixed PBR vs unlit cartoon | none observed — all assets come from Kenney / Quaternius / CreativeTrio / Tiny Treats low-poly cartoon kits |
| Inconsistent proportions | **RISK** — vehicles come from the Kenney city kit while recyclables come from Quaternius; the two kits differ in unit scale and bevel treatment. Not yet visible as a defect, but it is the most likely future `STYLE_MISMATCH`. |
| Colour cohesion | acceptable — V4 references reuse the existing saturated cartoon palette |

## 10. Totals

| Status | Count |
| --- | --- |
| KEEP | 47 |
| REPLACE | 0 |
| PLACEHOLDER | 0 |
| STYLE_MISMATCH | 0 confirmed (1 risk noted in §9) |
| MISSING | 13 |

### The 13 MISSING items, ranked by product impact

| Rank | Missing | Needed for | Source |
| --- | --- | --- | --- |
| 1 | 垃圾桶 as a T2 target | T2 variety; the geometry already exists as `trashcan.gltf` and only needs a target binding | reuse existing |
| 2 | 长椅 as a T3 target | T3 variety; geometry already exists as `bench.gltf` | reuse existing |
| 3 | 树 as a T4 target | T4 presence in the frame; four tree assets already exist | reuse existing |
| 4 | 花坛 as a T4 target | T4 variety; `flower_A/B.gltf` already exist | reuse existing |
| 5 | 自动售货机 | T3 mid-game goal | Kenney city kit / Quaternius |
| 6 | 工具箱 | T2 | Kenney |
| 7 | 小推车 | T2 | Kenney |
| 8 | 广告牌 | T4 | Kenney city kit |
| 9 | 大型街道设施 | T4 | Kenney city kit |
| 10 | 小盒 (T1) | T1 | Kenney / Quaternius |
| 11 | Pause icon | HUD | Kenney UI pack |
| 12 | Tier lock icon | reference 10 | Kenney UI pack |
| 13 | Settlement + Revive icons | references 02 / 04 | Kenney UI pack |

### Important finding

Ten of the thirteen gaps are **semantic-binding gaps, not art gaps**. The
geometry is already in the repository under `art/world/pretty-park/` and
`art/world/environment/`, and it is already licensed CC0 and already imported by
Creator. Turning a bench, a trash bin, a tree or a flowerbed into a swallowable
target is a data change in `GameConfig.ts` plus a binding in
`ObjectArtRegistry.ts` — no new download, no new licence review, no Creator
prefab work.

Only three gaps need new art: 自动售货机, 广告牌, 大型街道设施, plus the UI icon
set.

## 11. Blockers

- `BLOCKED_EXTERNAL_CONFIG` — the rewarded-ad SDK, Ad Unit and device callback
  remain unavailable, so the Revive ad entry stays hidden. Unrelated to assets.
- No licence conflict was found. No asset restricts commercial use.
- No asset in this audit requires a Creator prefab, `.meta` or UUID edit to
  resolve; the KEEP set needs no work at all.
