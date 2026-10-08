# V9.5 UI ART REBUILD — RESUME STATE

**Purpose:** a session that is interrupted must be able to continue from this file rather than
from a model's recollection. Read this before doing anything.

**Updated at HEAD:** `18a8d3c` (pushed to `dev/product-finalization-20260929`)

---

## 1. Current state in one paragraph

The V9.5 art is **in the running Home page** — real runtime change, verified by screenshot and by
the gates. Home is **not visually acceptable yet**: four defects are listed in §4. Settlement and
every other page are untouched. Nothing is `VISUAL_LOCKED`, nothing is release-ready.

## 2. Gates — last run at this HEAD

| Gate | Result |
|---|---|
| `npm run typecheck:cocos` | PASS |
| `npm run test:contracts` | PASS, 413 assertions |
| `npm run verify:layout` | PASS, 8 pages × 3 viewports |
| `npm run acceptance:v2` | PASS at 375×667 / 390×844 / 430×932 |
| `npm run build:web` | PASS, 333 files |

Not run since the art change: `verify:gameplay-visuals`, `verify:ui-kit`, `verify:page-tokens`,
`verify:machine-archive`, `verify:audio`, `build:wx`, `build:tt`, `preflight:release`.
**No three-size capture of the rebuilt Home exists.**

## 3. What changed, by commit

| Commit | Change |
|---|---|
| `781292f` | Home's 8 sprite references re-pointed to the V9.5 art |
| `39c1c44` | city band composited into the background; entry cards recomposed at the card's own aspect; hero ring thinned |
| `18a8d3c` | hero reads smaller inside its authored frame |

Scene diff per commit: 11 / 22 / 2 lines. No node added, moved, renamed or removed.

## 4. Home's remaining defects

1. **The old baked wordmark still shows** and clashes with the field. Fixing it means adding a
   `Label` node under `Logo` and re-pointing `Logo` to `plate_brand` — a structural scene edit,
   deliberately not attempted with a short budget.
2. **The three entry cards sit on the bottom edge.**
3. **An unexplained dark oval sits below the level pill.** Not a Canvas-level sprite; source not
   identified. Do not guess at it — bisect by node visibility.
4. **`HomePageVisual`'s `HOME_LAYOUT` still fights the scene.** The scene's Home nodes are all at
   `(0,0)`; the runtime table positions them. This is the brief's B4 item and is unresolved.

## 5. Three hard facts that cost time to learn

1. **`cocos/assets/prefabs/ui/HomePage.prefab` is dead weight.** The scene's `HomePage` node is a
   plain node with `_prefab: null`, so the prefab is not instantiated and editing it changes
   nothing on screen. The running page is authored in `Game.scene`. Check which one runs before
   editing either.
2. **PNGs generated outside the editor import as `type: "texture"`**, which produces a texture
   sub-asset and **no SpriteFrame**, so nothing can reference them. Set `type: "sprite-frame"`;
   9-slice sources additionally need their borders and `packable: false`. **Pre-writing the meta
   with `type: "sprite-frame"` and `imported: false` makes one build enough** — otherwise it takes
   a build to discover the problem, a meta patch, and a second build.
3. **Re-skin by subtree, never by node name.** `BtnStart` also exists on both Ready pages and
   `CoinPanel` on the skin page; a name-based match was silently re-pointing three sprites for
   each. `art-source/tools/reskin_home_scene.py` is scoped to the HomePage subtree and is
   idempotent.

**And one that will recur on every page:** `HOME_LAYOUT` is pinned by
`test_home_layout_contract.mjs` to `cocos/docs/design-contracts/home.json`. It may not be changed
to suit new art — that breaks a gate. **Make the art match the authored sizes instead.** The
authored `HeroBlackHole` frame is 360×360 and the entry cards are 160×112 (aspect 1.43); the
composed card art is 320×224 (also 1.43) for exactly this reason.

## 6. Where the art comes from

| Piece | Source |
|---|---|
| vector UI (plates, capsules, pills, frames, badges, boards, ribbon, glyphs) | `art-source/vector/*.py` — the `.py` is the source, the PNGs are build output |
| palette | sampled from the adopted references, recorded per value in `palette.py` |
| 3D stage assets (city band, hero, vignettes) | `art-source/blender/render_home_assets.py`, `render_v95_assets.py` — recipes, not hand-edited scenes |
| composited layers | `art-source/vector/compose_home_layers.py` |
| page preview | `art-source/vector/compose_home_preview.py` → `art-source/preview/home-preview-390x844.png` |
| scene re-skin | `art-source/tools/reskin_home_scene.py` |

Delivered assets live in `cocos/assets/game_art/ui/v95/`.

## 7. Next scope, in order

1. Home's four defects in §4, then a three-size capture and a side-by-side against
   `cocos/docs/design-reference/ui-v9.5-adopted/01-modesel-and-home-language.png`.
2. Re-run the gates that have not been run since the art change.
3. Settlement, against `02-settlement.png`, with `board_settlement.png` and
   `ribbon_settlement.png` already available. Preserve `updateStats`, `updateArenaStats`, the
   reward ledger, restart and return. Endless and Arena must show their own real statistics.
4. Then the remaining pages, gameplay art, audio, performance, WeChat package, device checks.

## 8. Blocked on the owner

- Licensed audio assets (the six effects are provisional synthesis).
- Douyin AppID — `preflight:release` fails on `found testappId`; WeChat's is configured.
- Whether the UI Kit's art or the pages' bespoke art is canonical — until that is decided the six
  unconsumed Kit prefabs stay unconsumed (see `UI_ART_DIRECTION_CANONICAL.md` §7).
