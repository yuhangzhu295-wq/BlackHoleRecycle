# UI ART DIRECTION — CANONICAL

**Round:** V9.5 `UI_ART_DIRECTION_ADOPTION_AND_PRODUCTION`
**Status:** binding for this round. Supersedes the visual conclusions in `V9_VISUAL_LOCK_PROGRESS.md`
for everything the player looks at; those conclusions remain valid only as engineering and
basic-usability history.

---

## 1. Why this document exists

The project carries four design-reference sets, and they are **not** mutually consistent:

| Set | Contents | Status before this round |
|---|---|---|
| `ui-v3` | 4 page renders + lock + gap audit | superseded |
| `ui-v4-expanded` | 10 numbered page renders + lock + manifest + `source/` | the set the code was built against |
| `ui-v5-final` | **lock + manifest only — no images at all** | `PENDING ADOPTION` |
| `ui-v6-production` | `render-profile.md` only | render tokens, not a design set |

`ui-v5-final` reads as the newer, higher-quality direction, and it says so itself: its rules are
"read off the 2026-09-28 reference package", i.e. the images live **outside** the repo, in
`BlackHoleRecycle-DesignBackup/黑洞回收站_UI方案包_含方案提示词_2026-09-28/01_设计图/`.
It stayed `PENDING ADOPTION` only because nobody had confirmed which reference images are
authoritative. The owner has now asked for that adoption, so this document makes the choice
explicit instead of leaving the project able to avoid it indefinitely.

The adopted references are copied into `cocos/docs/design-reference/ui-v9.5-adopted/` so the
contract has versioned images rather than a path into a sibling folder.

## 2. Rules for adopting a reference

1. **Product rules win.** The shipped product has exactly two modes, 无尽探索 and 竞技乱斗. Any
   reference showing four mode cards, a locked/VIP/coming-soon entry, or any other non-existent
   mode is used for colour, iconography, material and typography only. No such control is built.
2. **One reference per page.** A page is built against a single reference; two conflicting
   references are never blended on one page.
3. **Newer and higher-fidelity wins** when two renders of the same page disagree.
4. **Old references stay usable** as colour/icon/material/typography sources, and may not
   introduce modes or fake buttons.
5. **The image beats the written lock** where they disagree, because the lock was derived from a
   JPEG at review time and its own text admits it could not measure what it was describing. Two
   such disagreements are recorded in §5.

## 3. Adopted reference per page

| Page | Adopted reference | Inherited from it | Must be re-created for this product |
|---|---|---|---|
| **Home** | *no dedicated render exists* → derived from `黑洞回收站模式选择界面.png` | field, two-line brand block, yellow primary capsule, illustrated-card language | the whole page: brand block, hero presentation, three entry cards, currency/level pills |
| **Settlement** | `竞技结算_黑洞乱斗排行榜.png` | board + crown ribbon, headline result, leaderboard rows with rank badge and per-row icon, highlighted local row, three icon stat cards, gold reward bar, exactly two capsule actions | the whole board; the row icon (see §5.2); Endless's own stat set |
| **ModeSelect** (PHASE E) | `黑洞回收站模式选择界面.png` | two illustrated mode cards each with title/subtitle/sell line/own CTA | card interiors rendered from this game's assets |
| **EndlessReady / ArenaReady** (PHASE E) | `黑洞回收站_无尽探索.png` | ready-page composition | — |
| **Pause / Revive / Machine / Skin** (PHASE E) | `ui-v4-expanded` renders + this document's field/card/HUD rules | structure and copy | surfaces re-authored to the adopted language |
| **Gameplay HUD** (PHASE E) | `黑洞回收站_城市竞技场.png` | pill language, opponent colour identity | — |

Home has no render of its own in any set. That is stated rather than papered over: its design is
*derived*, and the derivation is the mode-select language applied to Home's existing product
structure (hero + primary action + three entries), which is what the shipped page already is.

## 4. The language (adopted, from the v5 lock verified against the images)

**Field.** Saturated sky-blue gradient with large flat low-contrast geometric shapes. The field
is **light**: cards and HUD read as darker or framed objects placed on it. No dark full-bleed
backdrop anywhere except Settlement's blurred gameplay veil.

**Brand block.** Two lines: a small brand line `黑洞回收站` on a dark plate with gold outline and a
planet glyph plus sparkles, above a large page title in white with a heavy dark outline and
sparkle marks on both sides. **One brand block per page.**

**Primary action.** A thick **yellow capsule**: fully rounded ends, white outline, inner highlight
along the top edge, drop shadow, dark-outlined centred label, optional chevron glyph in a circle
at the trailing edge. Secondary actions are the same capsule in purple.

**Cards.** Large rounded rectangles with a **white outer frame** and a **fully illustrated
isometric interior** — a vignette of the actual game scene. A flat texture or a gradient with a
small icon is a placeholder, not a card. Each card carries its own title, subtitle, sell line and
CTA capsule.

**HUD panels.** Dark translucent pills with white outlined text and a thin light border. They hug
the frame edges and never overlap. **Every value is framed** — bare stat text is a defect.

**Opponent identity.** Colour is the identity channel: each competitor is a distinctly coloured
black hole with a matching ring, a name tag and a coloured arrow marker.

## 5. Conflicts found, and how they are resolved

**5.1 The settlement board colour.** `ui-v5-final/design-lock.md` calls it a "cream round-corner
board". The image shows a **light blue/cyan board with a white inner panel**. The image wins per
§2.5. Recorded so the written lock is not cited as authority for cream.

**5.2 The settlement row icon.** The lock's §08 says ranked rows carry a "vehicle icon", and the
image does show cars. But the lock's own §06 — verified against the arena render — says every
competitor is a distinctly coloured **black hole**, and that is what the product actually
simulates. Shipping car icons would make the settlement disagree with the match the player just
played, which is the "two answers disagree" class of defect. **Resolution: the row icon is the
competitor's coloured black hole**, using the same colour identity as the arena ring. The vehicle
silhouettes are used only where a vehicle is genuinely the subject.

**5.3 Two mode-select renders.** `黑洞回收站_模式选择.png` and `黑洞回收站模式选择界面.png` are
not identical. Per §2.3 the second is adopted: it carries the planet glyph, a cleaner title
treatment and richer card interiors.

**5.4 The v4 reference is what the code was built from.** The current pages match `ui-v4-expanded`
geometry and copy. Adopting v9.5 therefore changes the player-visible surface while keeping the
v4-era product rules (two modes, real stats only, no fake buttons).

## 6. Production pipeline (proven this round, not assumed)

| Need | Tool | Evidence |
|---|---|---|
| Illustrated card interiors, hero black hole, board vignettes | **Blender 4.5.14 LTS**, rendering the game's own GLB kit | `art-source/blender/probe_glb_render.py` imported 4 assets (building 2074 verts, sedan 3184 verts, tree, road) with their embedded textures and produced a correct isometric render |
| Frames, capsules, pills, ribbons, badges, fields | **Programmatic vector → PNG** (Python + Pillow), sources committed as text | — |
| 3D only when a model is genuinely wrong | Blender | not needed yet |

Blender is available at `/c/Users/zyu33/tools/blender-4.5.14-windows-x64/blender` (on PATH).
Inkscape, ImageMagick and rsvg are **not installed** and are not required: the pipeline above
needs neither.

**Why the game's own assets.** The brief asks for the Home hero to reuse the in-game 3D black hole
rather than redraw a character that would disagree with gameplay. The same argument applies to
every illustrated interior: a card showing the actual city kit cannot drift from the world the
player then plays in. 65 GLBs are available, covering city buildings, residential buildings,
skyscrapers, trees, fences, road tiles, street lights, cones, three vehicles, sixteen recyclables,
props and the machine's own upgrade modules.

**Two traps this pipeline already hit, recorded so they are not repeated:**

- A render that writes a PNG file proves nothing. The first probe produced an entirely blank
  image while reporting success, because the camera was framed from a bounding box measured
  before the dependency graph updated. **Measure the geometry, then look at the image.**
- `matrix_world` is stale until `bpy.context.view_layer.update()`. Bounds read after setting
  `location` silently report every asset at the origin.

## 7. Asset correspondence

Two texture families exist and **do not overlap**, which is why "just reuse the UI Kit" was
rejected in the previous round:

| Family | Used by | Decision |
|---|---|---|
| `textures/home/*` (`mode_card_shelf`, `mode_header`, `home_hud_panel`, `home_logo`, `home_blackhole_hero`, `home_city_park`, `home_start_button`, `home_action_*`) | every shipped page | **replaced** page by page as that page is rebuilt; retained until its page's turn |
| `game_art/ui/textures/*` (`ui_card_9slice`, `ui_hud_bar_9slice`, `ui_button_9slice`, `ui_panel_9slice`, `ui_popup_9slice`) | the V9 UI Kit prefabs only | retained; **re-skinned or re-pointed** when a page adopts the new language, so pages and Kit finally share one source |
| new `game_art/ui/v95/*` | the rebuilt pages | created this round |

The Kit prefabs are **not** to be pointed at the old `textures/home/*` art to force a match: that
was attempted once (`b710544`) and reverted, because it changed the machine page from dark navy to
light green. See §5.4 of the V9 progress document.

## 8. Gates for this round

Geometry and visual review are separate and neither substitutes for the other.

**Geometry (existing, unchanged):** `verify:layout` (8 pages × 3 viewports), `verify:page-tokens`,
`verify:ui-kit`, `verify:gameplay-visuals`, `verify:machine-archive`, `verify:audio`,
`test:contracts`. None of these may be lowered.

**Visual (new, this round):** each rebuilt page is judged against its adopted reference on
composition, character proportion, colour, typography, card style, shadow, iconography and
layering. A page whose runtime render still differs materially from its reference is **not**
`VISUAL_LOCKED`, regardless of every test passing.

## 9. Forbidden in this round

Per the brief, and restated here because they are the failure modes this document exists to
prevent:

- Calling a Safe-Area correction a redesign.
- Swapping a 9-slice texture without looking at the image.
- Authoring a prefab that no running page references.
- Shipping one pretty full-page PNG as if it were the game page.
- Baking text, coin counts, levels or button states into images.
- Rebuilding a page's visuals in TypeScript.
- Adding a second page router or UI framework.
- Deleting working functionality for looks.
- Lowering an existing gate.
- Writing "meets commercial standard" in prose instead of showing a real design comparison.
