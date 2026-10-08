# V9.5 UI ART REBUILD — REPORT

**Round:** `V9.5_UI_ART_DIRECTION_ADOPTION_AND_PRODUCTION`
**Branch:** `dev/product-finalization-20260929`
**Status: PHASE A complete. PHASE B in progress, not acceptable yet. PHASE C–E not started.**
Nothing here is `VISUAL_LOCKED`.

---

## 1. HEAD and commits

| Commit | What |
|---|---|
| `d0cd97c` | PHASE A — adopt the v9.5 art direction, name one reference per page, bring the images in |
| `9455c68` | the V9.5 vector art library (19 assets) generated from source |
| `039a6a7` | the Blender vignette pipeline (work in progress) |

Preceding this round: `855d552` and earlier, the V9 engineering round. The tree was clean and
fully pushed before starting; no unpushed commit was overwritten.

## 2. Adopted reference per page

Full mapping, inherited elements and conflicts in
`cocos/docs/design-reference/UI_ART_DIRECTION_CANONICAL.md`. Images are in
`cocos/docs/design-reference/ui-v9.5-adopted/`.

| Page | Reference |
|---|---|
| Home | *no render exists* — derived from the mode-select language |
| Settlement | `02-settlement.png` |
| ModeSelect | `01-modesel-and-home-language.png` |
| EndlessReady / ArenaReady | `03-endless-ready.png` |
| Gameplay HUD | `04-arena-gameplay.png` |

`05-modesel-alternate-rejected.png` is kept so the rejected variant is visible rather than
forgotten.

**Conflicts resolved rather than averaged:** the written v5 lock calls the settlement board
"cream" while the image is light blue with a white panel (image wins — the lock admits it could
not measure what it described); the lock's settlement section says ranked rows carry vehicle
icons while its own arena rule says competitors are coloured black holes (row icons are coloured
black holes, or the settlement would disagree with the match just played).

## 3. What is produced

**Vector library — 19 assets, reviewed, committed** (`9455c68`). Source is
`art-source/vector/*.py`; the PNGs are build output. Palette sampled from the references.
Nothing is text: labels and values stay in Creator.

**Blender vignettes — 5 assets, rendered, not yet acceptable** (`039a6a7`): Home's city band, the
hero black hole, and one interior per entry card.

## 4. Home and Settlement, before → now

**Before** captures are committed at `ui-v9.5-adopted/before/`. **After** does not exist yet:
neither page has been rebuilt in Creator, so there is no after-shot to show. This section is
deliberately empty rather than filled with an intermediate that would overstate progress.

## 5. Asset replacement table

| Family | Used by | Decision |
|---|---|---|
| `textures/home/*` (`home_logo`, `home_blackhole_hero`, `home_city_park`, `home_start_button`, `home_action_*`, `mode_card_shelf`, `mode_header`, `home_hud_panel`) | every shipped page | **retained until its page's turn**; replaced page by page |
| `game_art/ui/textures/*` (5 9-slice frames) | the V9 UI Kit prefabs | retained |
| `game_art/ui/v95/*` (new, 24 files) | the rebuilt pages | created this round |

No old asset has been deleted. Nothing has been re-pointed, so no page's look has changed yet.

## 6. UI Kit reference table

| Kit prefab | Referenced by a running page? |
|---|---|
| `UIProgressBar` | **yes** — Machine Info |
| the other 6 | **no** — deliberately unreferenced; see `UI_ART_DIRECTION_CANONICAL.md` §7 and the V9 report §3.1 |

## 7. Three-size screenshots

Not produced for the rebuilt pages, because they are not rebuilt. The current build's
three-size captures are the V9 set at `artifacts/qa/settled/`.

## 8. Functional tests and visual review

**Functional: unchanged and passing** — `typecheck:cocos`, `test:contracts` (413),
`verify:layout` (8 pages × 3 viewports), `verify:gameplay-visuals`, `verify:ui-kit`,
`verify:machine-archive`, `verify:page-tokens`, `verify:audio`, `acceptance:v2`.
No gate was lowered. Nothing has been wired into Creator yet, so these all still describe the
pre-rebuild build.

**Visual review: not performed for the new art.** The vignettes were reviewed on a contact sheet
and rejected by me before any review gate; see §9.

## 9. What is not finished, and what it needs

**Blender vignette compositions.** Rendered and reviewed; three defects remain:

1. **Ground reads as a dark slab.** `tile-low` and the crossroad tile render near-black at card
   scale, so the cards sit on a black diamond instead of a street. The city band's road tiles
   render light grey at the same lighting, so the cause is the tile choice and scale, not the
   lights.
2. **The black hole is oversized** relative to the ground patch — it reads as a disc filling the
   card rather than a hole in a street.
3. **Props are too small** in the city band; the buildings are specks.

**Then, for PHASE B to close:** wire the Home field, brand plate, capsules, pills, glyphs and the
three card interiors into Creator with real Label children and real data bindings; capture
375×667 / 390×844 / 430×932; run the geometry gates and the separate visual review.

**PHASE C (Settlement)** is designed and its vector surfaces exist (board, ribbon, panels, reward
bar, badges) but nothing is composed or wired.

**PHASE D and E** are untouched.

## 10. Findings worth keeping

**Two GLBs carry a texture that was never embedded.** `recyclables/industrial/crate.glb` and
`world/residential/building-type-b.glb` reference a `colormap` image that imports as size (0, 0)
and renders magenta. This is a property of the shipped asset, not of the renderer, and it is
worth checking whether the game resolves it through a runtime material assignment
(`MaterialLibrary` / `ArtMaterialReference`) or whether those props are untextured in the build
too. **Not yet investigated.**

**The game's proportion rule.** Every binding in `ObjectArtRegistry` uses `unitScale()`, so no
asset is scaled relative to another; a ground tile GLB is 1×1 units while the world places it as
a 32-unit block. Any composition that mixes ground and props has to respect that ratio.

**Blender traps, each of which cost a cycle:** node lookups by name raise `KeyError` across
versions and UI languages (`Principled BSDF`, world `Background`) — look them up by type;
`matrix_world` is stale until `bpy.context.view_layer.update()`; and a render that writes a PNG
proves nothing — the first probe produced an entirely blank image while reporting success.

## 11. Next batch

1. Fix the three composition defects above and re-review the vignettes.
2. Home: compose and wire, then capture three sizes and run both gates.
3. Settlement: compose and wire the same way.
4. Only then PHASE E, in the order Mode → Ready → Pause → Revive → Machine → Skin → HUD.

No `main` merge. No gate lowered.
