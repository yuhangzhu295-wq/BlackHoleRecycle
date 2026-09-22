# Gameplay Asset Audit — V5 (PHASE 5)

Scope: every art asset the shipping build can put on screen — world, park, city,
vehicles, collectibles, the player machine, the construction landmark, UI.

Method: enumerate what is on disk, reconcile it against the license manifest and
the semantic bindings, then classify it against **runtime** evidence read from a
real portrait build (`artifacts/qa/portrait/acceptance-report-pages.json`,
produced 2026-09-22 17:23 by `npm run acceptance:v2 -- --scope=pages` on the
current `cocos/assets`). Disk listings alone do not decide a status here; the
runtime material report does.

Statuses: `KEEP` · `REPLACE` · `MISSING` · `PLACEHOLDER` · `STYLE_MISMATCH` · `BUGGED`

Evidence sources used:

| Source | What it proves |
| --- | --- |
| `scripts/validate-object-art-coverage.mjs` (`npm run audit:object-art`) | semantic binding coverage, primitive-fallback count |
| `cocos/assets/art/asset-license-manifest.json` | declared assets, licences, hashes |
| disk scan of `cocos/assets/**/*.{glb,gltf,fbx}` | real inventory, byte sizes |
| exhaustive glTF `images[].uri` resolution scan | missing external textures |
| `acceptance-report-pages.json` → `openingWorldVisuals` | runtime renderer/material state of the authored opening cell |
| `acceptance-report-pages.json` → `machineMaterialDiagnostics` | runtime material state of the player machine |
| `acceptance-report-pages.json` → `constructionLandmark` | landmark load/visibility |
| `cocos/build/wechatgame/` | shipped mini-game package composition |
| `.scratch/render-read.py` over `artifacts/qa/portrait/*.png` | colour concentration / flatness / detail density of the real rendered frames |
| `.scratch/tri-count.py` over `cocos/assets/**/*.{glb,gltf}` | triangle budget per model, read from the source geometry |

---

## 0. Inventory facts

| Fact | Value |
| --- | --- |
| Model files under `cocos/assets` | **63** — 49 `.glb` + 13 `.gltf` + 1 `.fbx` |
| Total model bytes | 4,707,054 B (**4,596.7 KB**) |
| Largest single model | `art/machines/poly-google-bulldozer.glb` — 1,419,388 B = **30.2 % of all model bytes** |
| Top-5 models' share | 2,266,448 B = **48.2 %** of all model bytes |
| License manifest entries | 56 — CC0 1.0 ×55, CC-BY 3.0 ×1 |
| `commercialAllowed: true` | 56 / 56 |
| Manifest ↔ disk reconciliation | 49 declared models + 14 undeclared = 63. Of the 56 manifest rows, 6 point at `Textures/colormap.png` and 1 at a directory, so they are not model rows |
| Semantic object bindings | **23 / 23 covered**, `uncoveredBindings: []`, `primitiveFallbackViolations: []` |
| `totalWorldArtKinds` | 56 |
| Runtime material slots, authored opening cell | 42 `MeshRenderer`s / **43 slots — 43 valid, 0 invalid**, all `builtin-unlit` |
| Distinct tints in the authored opening cell | **5** |
| `cocos/assets/textures/ui/` | **empty** — UI art lives in `cocos/assets/textures/home/` |
| Triangles across all models | **37,732 total** over 62 parsed models; max 3,124, median 312, min 12; **0 models above 5,000** |
| Heaviest model by triangles | `art/vehicles/garbage-truck.glb` — 3,124 |
| Lightest models | `world/environment/tile-low.glb` and `world/pretty-park/floor_grass_sliced_base.gltf` — 12 each (one quad) |

The triangle budget is measured, not asserted: `.scratch/tri-count.py` resolves every
mesh primitive's index accessor in each glTF/GLB JSON chunk and sums `count / 3`.
This is the evidence behind calling the art direction "Low Poly" — the median model is
312 triangles and nothing in the project exceeds 3,124. (The 63rd model,
`resources/art/construction/majadroid-construction-site.fbx`, is binary FBX and is not
parsed by that script, so it is excluded from the 37,732 total.)

`audit:object-art` is **PASS** on the current source, so no gameplay object is
served by a procedural primitive: `CompressibleObject.getArtLibrary()` throws
instead of falling back.

---

## 1. Classification

### 1.1 BUGGED — 1 asset

| Asset | Status | Evidence |
| --- | --- | --- |
| `art/world/pretty-park/floor_grass_sliced_base.gltf` | **BUGGED** (runtime-masked) | see chain below |

The evidence chain, each step independently checkable:

1. The source glTF declares an **external** image with no `bufferView`:
   `images[0] = {"mimeType":"image/png","name":"tiny_treats_grass_texture","uri":"tiny_treats_grass_texture.png"}`,
   and its only buffer is `{"byteLength":840,"uri":"floor_grass_sliced_base.bin"}` — 840 bytes cannot hold a PNG.
2. `tiny_treats_grass_texture.png` **does not exist anywhere in the repository**.
3. Cocos therefore imported the image sub-asset as an empty placeholder —
   `cocos/library/90/9048f656-cd03-4f48-aea0-69f1977de173@296dd.json` is 50 bytes:
   `{"__type__": "cc.ImageAsset", "content": ""}`.
4. This is the **only** such case. An exhaustive scan of all 13 glTF files resolved
   **13 external image references → exactly 1 missing**, the one above. The 12 sibling
   pretty-park files correctly reference `tiny_treats_texture_1.png` (20,167 B, present).

Why the player does not see it today: `floor_grass_sliced_base` is the
`ParkGrassTileTemplate` template (`Game.scene` → `GameRoot / WorldArtLibrary /
ParkGrassTileTemplate / floor_grass_sliced_base`), and every instantiation is
re-materialised at runtime by `WorldArtLibrary.applyRuntimeMaterial('parkGrassTile', …)`,
which binds `prettyParkColorTexture` (= `ed3709f2-…` = `tiny_treats_texture_1.png`,
20,167 B) and tint `#ffffff`. The broken image is never sampled.

Classification is `BUGGED` and not `KEEP` because the defect is latent: the asset
is one material-path change away from rendering its ground as untextured/blank,
and nothing in the build reports it.

### 1.2 STYLE_MISMATCH — 3 groups

Root cause is a single method, not a per-asset mistake.
`WorldArtLibrary.hydrateAuthoredOpeningMaterials` (`WorldArtLibrary.ts:387`) assigns
**one `WorldArtKind` per authored group node**:

```ts
const groups = [
  ['Ground', 'terrainTile'],
  ['Roads', 'roadStraight'],
  ['Buildings', 'commercialBuildingA'],
  ['Park', 'treeSmall'],
  ['Props', 'recyclingBox'],
  ['TrafficRoutes', 'sedan'],
];
```

It is called at `InfiniteWorldManager.ts:330` and `:625`, and the runtime confirms it
took effect — the reported group names are exactly these six. Measured result:

| Group | Renderers | Distinct meshes | Tint applied to all | Atlas sampled |
| --- | --- | --- | --- | --- |
| `Props` | 17 | `fountain`, `fountain_leaves`, `fountain_water`, `bench`×2, `trashcan`×2, `flower_A`, `flower_B`, `hedge_straight_long`, `path-stones-long`×2, `fence`×2, `box`, `construction-cone`, `light-square` | `#c68b59` | `vehicleColorTexture` |
| `Park` | 12 | `tree-small`×6, `tree-large`×6 | `#69bf71` | `prettyParkColorTexture` |
| `Buildings` | 4 | `building-type-b`, `building-a`, `building-d`, `building-f` | `#f7b267` | `commercialColorTexture` |

`#c68b59` appears in exactly one place in the whole script tree —
`WORLD_ART_COLORS.recyclingBox` — so the authored park furniture (fountain, water,
leaves, hedges, benches, trashcans, flowers, cobbles, fences) is tinted with the
**collectible-box** colour and samples the **vehicle** atlas. `tree-large` gets
`treeSmall`'s tint `#69bf71` instead of its own `#54a962`.

**Why the tint is the whole colour, not a hue shift.** The shared atlases are
flat colour-patch palettes, verified by inspection:
`art/world/pretty-park/tiny_treats_texture_1.png` is a 1024×1024 grid of flat
swatches, and `art/vehicles/Textures/colormap.png` is the same design at 512×512.
A model's UV therefore lands inside one flat patch, so the sampled texel is a
constant and `mainColor` multiplies it to produce the final surface colour.
Measured confirmation: the largest surface in the gameplay screenshot is a single
colour covering **52.5 %** of the frame with a per-channel standard deviation of
**0.08 / 255** (`.scratch/render-read.py` on
`artifacts/qa/portrait/portrait-390x844-lv5-city.png`). A flat fill of that purity
is the atlas behaving as designed, not a missing texture — but it also means the
per-group tint is the *only* thing separating one prop from another. Fountain
water, leaves, hedge, bench, trashcan, flower, cobble and fence all come out the
same brown, and the player reads one repeated block rather than a park.

The same asset family reached through the spawner is bound differently:
`WorldArtLibrary.spawn()` → `applyRuntimeMaterial(kind, …)` → `getRuntimeMaterial(kind)`,
so `parkBench` gets `#ffffff` + `prettyParkColorTexture`, `treeLarge` gets `#54a962`.
**Consequence: identical park assets render in two different treatments in the same
scene** — authored copies all-brown, spawned copies per-kind.

Status is `STYLE_MISMATCH`, not `BUGGED`: the per-group hydration is deliberate and
documented in-code (imported template renderers have no serialisable material slots;
the alternative surfaced as magenta on Web Mobile). It is a deliberate look that does
not match the intended Casual-Cartoon park palette, so it needs an owner decision
rather than a silent fix.

### 1.3 MISSING

| Item | Status | Note |
| --- | --- | --- |
| Tier requirement gaps (小盒 / 工具箱 / 小推车 / 自动售货机 / 长椅 as a swallowable target) | **MISSING** | **Carried over from `ASSET_PRODUCTIZATION_AUDIT.md` (V4), not re-derived here** — the V4 brief §35 that defines the requirement list is not in this repository, so this audit cannot independently confirm or refute the gaps. Recorded so the open items are not lost. |
| `art/world/pretty-park/Textures/colormap.png` | n/a — not needed | The park atlas is `tiny_treats_texture_1.png`, wired in `Game.scene` as `prettyParkColorTexture`. The absence of a `colormap.png` under `pretty-park/` is expected, unlike the other five areas. |
| 14 model files absent from `asset-license-manifest.json` | **documentation gap, not a licensing hole** | 13 pretty-park glTF files are covered by the CC0 licence text shipped beside them (`TinyTreats-Pretty-Park-LICENSE.txt`, Isa Lousberg), and `majadroid-construction-site.fbx` by `cocos/docs/third-party-assets/majadroid-construction-site.md` (CC0, Maik Hoffmann). All 14 are licensed; they are simply not in the JSON manifest, so provenance now lives in three different places. |

### 1.4 PLACEHOLDER

| Item | Status | Note |
| --- | --- | --- |
| `cocos/assets/textures/ui/` | **empty** | No files. All shipped UI art is in `cocos/assets/textures/home/` (PNG + SVG pairs, 26 files). Harmless but the empty directory is a stale convention. |
| bytedance mini-game AppID | **PLACEHOLDER** | `testappId` in the build. Build-level, not art — cross-referenced to PHASE 11. |

### 1.5 KEEP

Everything else. The 23 semantic bindings, all satisfied:

| Tier | Binding `type` → `kind` | Tint (`WORLD_ART_COLORS`) |
| --- | --- | --- |
| T1 | `soda_can`→`sodaCan`, `water_bottle`→`waterBottle`, `battery`→`battery`, `toy`→`toyDuck`, `apple`→`apple`, `paper_ball`→`paperScrap` | `#e53935`, `#29b6f6`, `#fbc02d`, `#ffd54f`, `#e53935`, `#f5f5f4` |
| T2 | `book_stack`→`bookStack`, `cardboard_box`→`cardboardBox`, `cone`→`constructionCone`, `trash_bag`→`trashBag`, `paint_bucket`→`paintBucket` | `#3b82f6`, `#b7794d`, `#ff7a00`, `#374151`, `#00acc1` |
| T3 | `chair`→`chair`, `small_table`→`coffeeTable`, `monitor`→`monitor`, `tire`→`tire` | `#455a64`, `#795548`, `#111827`, `#1f2937` |
| T4 | `shelf`→`shelf`, `crate`→`crate`, `sofa`→`sofa` | `#90a4ae`, `#388e3c`, `#8d6e63` |
| T5 | `car`→`sedan`, `delivery_van`→`deliveryVan`, `garbage_truck`→`garbageTruck`, `container`→`shippingContainer` | `#ef476f`, `#ffd166`, `#35a85e`, `#0288d1` |
| arena | `arena_mass_fragment`→`recyclingBox` | `#c68b59` |

Tier assignment derived from `GameConfig.ts:251-280` (`OBJECT_TEMPLATES[].tier`);
`kind` from `artifacts/qa/object-art-coverage.json`.

Runtime confirmation, authored opening cell — 42 renderers, 43 slots, **0 invalid**,
all `builtin-unlit`, 5 distinct tints:

| Group | Renderers | Mesh names | Tint | Primitive count |
| --- | --- | --- | --- | --- |
| `Ground` | 2 | `tile-low` ×2 | `#92db7f` (`terrainTile`) | 1 each |
| `Roads` | 5 | `road-crossroad-path`, `road-straight` ×4 | `#9ca8bc` (`roadStraight`) | 1 each |
| `Buildings` | 4 | `building-type-b`, `building-a`, `building-d`, `building-f` | `#f7b267` | 1 each |
| `Park` | 12 | `tree-small` ×6, `tree-large` ×6 | `#69bf71` | 1 each |
| `Props` | 17 | park furniture + `box`, `construction-cone`, `light-square` | `#c68b59` | 1 each |
| `MajadroidConstructionLandmark` | 2 | `Roads` (1), `HouseConstructionSite` (2 slots) | `#9ca8bc` / `#f7b267` | 1 / 2 |

`constructionLandmark` runtime state: `{"loadState": "READY", "visible": true}`.

Player machine (`machineMaterialDiagnostics`): every active assembly's material slots
report `valid: true` with effect `builtin-unlit` and an explicit colour
(`AbyssBase #4a1d8f`, `HoleInner #05040e`, swirls `#ffb8ff`, rim `#c8adff`) — no
magenta, no invalid slot.

The render path is textured, not flat: `createRuntimeMaterial` calls
`material.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: Boolean(texture), USE_VERTEX_COLOR: false } })`
and then `setProperty('mainTexture', texture)`. The 5 measured colours are **tints**,
not the whole appearance — the shared atlas supplies detail. `builtin-standard` is
deliberately avoided because assigning it to copied glTF sub-meshes triggers a
Web Mobile local-descriptor-set error in Creator 3.8.3.

---

## 2. Single-asset cost concentration

| Asset | Bytes | Share of all model bytes | Triangles | Bytes per triangle | Role |
| --- | --- | --- | --- | --- | --- |
| `art/machines/poly-google-bulldozer.glb` | 1,419,388 | **30.2 %** | 2,518 | **564** | Player recycling-machine chassis, arena-bot visual (`BlackHoleMachine.ts:508`), and the `ConstructionBulldozer` prop (`InfiniteWorldManager.ts:1080`) |
| `art/vehicles/garbage-truck.glb` | 268,224 | 5.7 % | 3,124 | 86 | T5 target |
| `art/vehicles/delivery-van.glb` | 240,264 | 5.1 % | 2,476 | 97 | T5 target |
| `art/vehicles/sedan.glb` | 172,216 | 3.7 % | 2,032 | 85 | T5 target |
| `art/world/city/commercial-building-g.glb` | 166,356 | 3.5 % | 2,006 | 83 | City fill |

The bulldozer is not heavy because of geometry — it is one of the **lightest**
models in the project by triangle count while being the heaviest by bytes. Parsing
its GLB chunks explains the whole gap:

| Chunk / bufferView | Bytes | Note |
| --- | --- | --- |
| JSON chunk | 2,008 | 0.1 % of file |
| BIN chunk | 1,417,352 | 99.9 % of file |
| largest bufferView | **1,236,674** | the embedded `image/png` named `Bulldozer_BaseColor` |

That image is the live atlas, not dead weight — it must not be deleted casually.
The chain: the glb's UUID is `9b34ec81-60b6-4407-8b7a-b6b2c821d44a`; its embedded
image sub-asset is `@77daa` (`Bulldozer_BaseColor`) and its texture sub-asset is
`@7731a`; `Game.scene` binds `bulldozerColorTexture` to `9b34ec81-…@7731a`. So the
1.24 MB PNG *is* `bulldozerColorTexture`, and it is packed into the shipped build as
`cocos/build/wechatgame/assets/main/native/9b/9b34ec81-…@77daa.png` — 1,236,674 B,
the **third-largest file in the entire WeChat package**.

What is actually disproportionate is the *kind* of texture. Every other world kind
samples a flat-palette colormap of 8–12 KB
(`art/vehicles/Textures/colormap.png` is 11,988 B; `art/world/roads/Textures/colormap.png`
is 8,658 B). The bulldozer alone carries a photographic PBR base-colour map. The render
path multiplies it by a flat tint under `builtin-unlit`, so most of that detail is
flattened away — and it is the only asset in the project with this treatment.

Replacing it with a flat-palette patch matching the other five atlases would remove
~1.2 MB (**7.1 % of the 17,063 KB WeChat package**). It is marked `REPLACE` as a
*candidate*, not a defect: doing so visibly flattens the bulldozer and the arena bots,
so it needs owner sign-off. It is also the **only CC-BY 3.0 asset** in the project
(`poly-google-bulldozer`, author "Poly by Google", `commercialAllowed: true`) and
therefore the only one carrying an attribution obligation.

---

## 3. Release blocker found by this audit: WeChat main package

Measured on `cocos/build/wechatgame/` (built 2026-09-21 20:36):

| Component | Size |
| --- | --- |
| `assets/` | 12,558 KB (`main` 6,760 · `resources` 5,193 · `internal` 605) |
| `cocos-js/` | 4,079 KB |
| `src/` | 253 KB |
| root files (`web-adapter.js`, `first-screen.js`, `logo.png`, …) | ~130 KB |
| **Total** | **17,063 KB** |

`cocos/build/wechatgame/game.json` contains only
`{"deviceOrientation": …, "networkTimeout": …}` — there is **no `subpackages` field**,
so the entire 17,063 KB counts as the main package. WeChat's main-package limit is
4 MB (4,096 KB); this build is **4.2× over**.

`assets/resources` (5,193 KB) is loaded on demand and is the natural subpackage
candidate. This is a packaging task, not an art defect — recorded here because the
audit is where the number first became visible.

---

## 4. Evidence coverage limits (stated so the audit is not read as more than it is)

1. **The runtime material report covers the authored Golden City cell only.**
   `WorldCompositionProbe.getCurrentCellVisualDiagnostics` walks `cell.node.children`
   (`WorldCompositionProbe.ts:357`). Procedurally spawned props are added under
   `InfiniteWorldRoot`, not under the cell, so their runtime materials are **not**
   measured here. The §1.2 comparison between authored and spawned bindings is
   therefore derived from code paths, not from a runtime reading of the spawned copies.
2. **No independent visual review.** No separate visual reviewer is available in this
   environment, so `VISUAL_REVIEW` for PHASE 6/7 is `NOT_AVAILABLE`. The frame
   measurements quoted in §1.2 come from the same agent that wrote this audit and are
   a *quantitative* read (colour counts, flatness, edge density) rather than a
   judgement of whether the result looks good. They are reproducible from
   `.scratch/render-read.py` and the named PNG, which is why they are quoted.
3. **§1.3's tier gaps are carried over, not re-derived** (reason given inline).
4. **`openingWorldVisuals` reports materials, not textures.** It emits
   `{ effect, valid, color }` per slot. Texture binding is asserted from the code path
   in `createRuntimeMaterial`, not from the diagnostic.
