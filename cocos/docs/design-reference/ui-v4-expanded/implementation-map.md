# UI V4 Expanded — Implementation Map

Binding rule: **reuse, do not duplicate.**

Reused as-is: `Game.scene` · existing Controllers · `HUDView.ts` · existing
Sprites · existing `Button` nodes · `ObjectArtRegistry.ts` ·
`WorldArtLibrary.ts` · `DynamicVehicle.ts` · `CompressibleObject.ts` ·
`SuctionMotion.ts` · `RoundedPanelGraphic.ts` · `RuntimePageInputRouter.ts` ·
`PickupFeedbackPresenter.ts`

Forbidden new siblings: `UIRouterV2`, `HUDV2`, `VehicleV2`, `SuctionV2`,
`WorldV2`.

---

## Page → Code → Test → Evidence

| # | Page / mechanic | Primary code | Contract test | Runtime evidence |
| --- | --- | --- | --- | --- |
| 01 | Arena Gameplay HUD | `ArenaHUDController.ts`, `HUDView.ts` | `test_arena_hud_layout_contract.mjs` | 390×844 arena screenshot |
| 02 | Revive | `RevivePageController.ts`, `HUDView.ts` | `test_revive_layout_contract.mjs` | 390×844 revive screenshot |
| 03 | Mode Select | `ModeSelectPageController.ts` | `test_mode_select_layout_contract.mjs` | 390×844 mode-select screenshot |
| 04 | Settlement | `SettlementPageController.ts` | `test_settlement_layout_contract.mjs` | 390×844 settlement screenshot |
| 05 | Home | `HomePageController.ts`, `HomePageVisual.ts` | `test_home_layout_contract.mjs` + `test_ui_v4_design_contract.mjs` | 390×844 home screenshot |
| 06 | Endless Ready | `ModeReadyPageController.ts` (`ENDLESS`), `MapPreviewGraphic.ts` | `test_mode_ready_flow_contract.mjs` + `test_ui_v4_design_contract.mjs` | 390×844 endless-ready screenshot |
| 07 | Arena Ready | `ModeReadyPageController.ts` (`ARENA`) | `test_mode_ready_flow_contract.mjs` + `test_ui_v4_design_contract.mjs` | 390×844 arena-ready screenshot |
| 08 | Endless Gameplay | `EndlessHUDController.ts`, `CellItemGenerator` in `ChunkConfig.ts`, `InfiniteWorldManager.ts` | `test_ui_v4_design_contract.mjs` + `test_collectible_production_contract.mjs` | 390×844 gameplay screenshot + world-space probe JSON |
| 09 | Large Target Suction | `SuctionMotion.ts`, `CompressibleObject.ts`, `DynamicVehicle.ts` | `test_suction_progression_contract.mjs` + `test_ui_v4_design_contract.mjs` | car lifecycle capture, T5 timings |
| 10 | Tier Lock / Upgrade | `CompressibleObject.showLockAlert()`, new `TierUpgradePresenter.ts`, `EndlessHUDController.ts` | `test_ui_v4_design_contract.mjs` | lock label capture + upgrade banner capture |

---

## Work Items

### W1 — Ready-page copy alignment (06, 07)

File: `cocos/assets/scripts/ui/ModeReadyPageController.ts`

- Endless `IntroText` → the locked two lines
  `不断吞噬 · 不断成长` / `解锁更大目标`.
- Arena → replace prose `IntroText` with the explicit five-line rule list
  `8 人` / `3:00` / `吞噬成长` / `淘汰弱小玩家` / `躲避更大玩家`.
- Arena `StatCaption` / `StatValue` stay truthful (`对局规则` / real rule summary).
- No scene, prefab, meta or UUID change. Layout table only.

### W2 — Real map preview (06, 07)

New: `cocos/assets/scripts/ui/MapPreviewGraphic.ts`

- A `Graphics`-based low-poly city/arena thumbnail drawn from serialized
  properties, following the existing `RoundedPanelGraphic` pattern.
- Removes the current dependency on mode-card artwork (which carries baked
  title text) as the map preview.
- No new asset import, no sprite writeback.

### W3 — Endless gameplay composition diagnostic (08)

File: `cocos/assets/scripts/world/InfiniteWorldManager.ts`

- Extend the existing opening-cell diagnostics with the three distribution
  buckets required by `gameplay-composition-contract.md` §4:
  `singles`, `smallGroups`, `hotspots`.
- Report per-tier counts and the tier-visibility fact (a T4/T5 target present
  while the player is still LV.1).
- Consumed by `test_ui_v4_design_contract.mjs` and by the runtime probe.

### W4 — Large-target suction legibility (09)

File: `cocos/assets/scripts/gameplay/CompressibleObject.ts`

- Add a progressive **strain profile** during `ATTRACTED` for tier ≥ 4:
  a slow, readable tilt/roll ramp on the existing `visualNode`, on top of the
  existing `setSuctionSpin` yaw.
- Expose the current phase for diagnostics/tests.
- No new mesh, no primitive fallback, no particle work, no `SuctionV2`.
- The existing `IDLE → ATTRACTED → SUCKING → ABSORBED` chain, tier profiles and
  escape-back-to-IDLE behaviour are untouched.

### W5 — Tier upgrade feedback, State B (10)

New: `cocos/assets/scripts/ui/TierUpgradePresenter.ts`

- Listens to the existing `MACHINE_EVOLVED` event.
- Ignores bot machines (only the local player's evolution is announced).
- Shows, for ≤ 2 s, centred and non-blocking:
  `升级！` / `LV.X XXX黑洞` / `解锁更大型目标`
- Clones an editor-saved `Label` as its glyph template, exactly like
  `PickupFeedbackPresenter` — it does not construct a new glyph/material path.
- Wired from `EndlessHUDController.onEnable()` and `ArenaHUDController.onEnable()`.
- No full-screen page, no interstitial, no persistent badge.

### W6 — Design contract test

New: `scripts/test_ui_v4_design_contract.mjs`

Static assertions over the real sources and the real reference set:

- The ten reference files exist with the exact locked names.
- `01`–`04` are byte-identical to the `ui-v3/` masters.
- `05`–`10` are one page each, at the locked canvas size.
- `design-lineage.md`, `design-lock.md`, `ui-gap-audit.md`,
  `gameplay-composition-contract.md`, `implementation-map.md` all exist.
- `ModeReadyPageController` contains the locked copy and the five Arena rules.
- `EndlessHUDController` does not enable a leaderboard / quest / shop node.
- `CompressibleObject` still shows `需要 LV.X` and still has no cone/hat mesh.
- `TierUpgradePresenter` exists and is wired from both HUD controllers.
- The distribution cadence constants in `ChunkConfig.ts` are inside the
  contract bands.

### W7 — Reference renderer

New: `scripts/render_ui_v4_references.mjs`

- Copies `01`–`04` from `ui-v3/` and verifies byte identity.
- Renders `05`–`10` from the HTML sources under
  `cocos/docs/design-reference/ui-v4-expanded/source/` at 720×1280 via
  Playwright Chromium, one page per file.
- Measures the reference-08 space budget by rasterising the live DOM boxes on a
  72×128 grid with the declared precedence `dynamic > static > environment >
  open`, and writes it to `reference-manifest.json` under
  `references[].spaceBudget`.

### W8 — Real map preview actually renders (06, 07)

Fixed: `cocos/assets/scripts/ui/MapPreviewGraphic.ts`

The first real 390×844 capture showed an **empty** preview area even though the
diagnostic reported `redrawCount: 3`. Two engine rules that the editor preview
hides were both being violated:

1. A `Node` created in code starts on `Layers.Enum.DEFAULT`, and the UI camera
   only draws `UI_2D`.
2. `Sprite` and `Graphics` are both `UIRenderer`s and fight over the node's UI
   component when they share one node.

The vector art now lives on a dedicated child node (`PreviewArt`) whose layer is
copied from the host, and the serialized `Sprite` is disabled rather than merely
emptied. `getDiagnostics()` publishes `artNodeName`, `artLayerIsUi2d` and
`spriteEnabled` so the gate can prove it.

### W9 — Locked-target prompt is actually visible (10, State A)

New: `cocos/assets/scripts/ui/TierLockPresenter.ts`

`CompressibleObject` already owned the *mechanic* and flipped
`isShowingLockAlert()`, but its prompt was a `cc.Label` on a node built in code —
no `RenderRoot2D` ancestor and the wrong layer — so **it was never drawn in a
built player**. The readable prompt is now produced on the HUD by projecting the
locked body's world position onto the screen, reusing the proven
`PickupFeedbackPresenter` contract (clone an editor-saved Label).

- `CompressibleObject.getLockAlertText()` is the single source of truth for the
  text.
- Driven once per gameplay frame from `GameManager.update()` via
  `HUDView.updateTierLock()`.
- Hosted by both `EndlessHUDController` (`RegionValue` template) and
  `ArenaHUDController` (`TimerValue` template).
- Presentation only: it reads `isShowingLockAlert()` and never advances the FSM,
  mass or tier.

Runtime proof: `cocos/docs/evidence/v4-design/v4-390x844-10-tier-lock.png`
shows `需要 LV.2` above a real truck during a real run.

### W10 — Runtime capture runner

New: `scripts/capture_v4_design_evidence.mjs`

Drives the real built Web Mobile player at 390×844 and writes 7 frames plus
measurements to `cocos/docs/evidence/v4-design/`. It seeks the nearest body the
machine cannot yet swallow, using the live camera basis to steer, so the
tier-lock path is genuinely exercised rather than waited for.

It also records, and explicitly marks as **inadmissible**, the runtime
screen-space budget: that instrument classifies samples from projected world
bounding quads, which over-count, and it reported most of the ground as covered
on a frame that is visibly mostly open road. The runtime spatial gate is the
world-space `playableOpenAreaRatio`.

### W11 — Authored opening cell exposes the tier ladder (08, contract §5/§6)

`cocos/assets/scripts/world/InfiniteWorldManager.ts` — new
`populateAuthoredAspirational()`, called from `populateAuthoredContent()`.

Root cause, measured: the authored opening cell runs **no** `CellItemGenerator`
at all, so the generator's aspirational channel never fires there. The real run
reported `tierCounts {1:20, 2:1, 3:0, 4:0, 5:0}` and `highestVisibleTier: 2`,
so the contract rule "a low-level player must still **see** T4/T5 and be unable
to swallow them" could not be satisfied by any collectible.

The fix adds exactly one T4-class and one T5-class target on the cell's outer
band (radius 0.62–0.84 of the half-cell, ≈20–27 m), on bearings chosen away from
the authored park lane (+z) and construction lane (−z). That radius is far
outside the authored tutorial ring (radius ≤ 6 m) and outside every authored
anchor (±8 m), so **no Creator-authored object moves** and the adjudicated
`INTENTIONAL_TUTORIAL_EXCEPTION` spacing is untouched. Deterministic, so runtime
evidence is reproducible.

`cocos/assets/scripts/world/ChunkConfig.ts` — the procedural aspirational
channel sampled uniformly over the high-tier pool, which made T3 and T5 equally
likely and allowed two T5 in one cell, breaking "T5: 0–1 obvious large target".
Sampling is now weighted **T3 4 / T4 3 / T5 1** with T5 capped at one per cell.

Tests: `scripts/test_resource_replenishment_contract.mjs` gains
`AUTHORED_CELL_EXPOSES_T4_T5_ASPIRATIONAL` and
`AUTHORED_ASPIRATIONAL_STAYS_OUTSIDE_TUTORIAL_RING`, and its `ObjectTier` /
`OBJECT_TEMPLATES` stubs now expose the full T1–T5 ladder so the new path is
actually covered instead of silently no-opping.
`scripts/test_ui_v4_design_contract.mjs` gains
`V4_ASPIRATIONAL_LADDER_WEIGHTED`, `V4_ASPIRATIONAL_T5_CAPPED` and
`V4_AUTHORED_CELL_EXPOSES_T4_T5`.

### W12 — HUD chrome stays inside the 390×844 crop (08, 10, Arena)

New: `cocos/assets/scripts/ui/HudSafeAreaInset.ts`, wired into
`EndlessHUDController.updateStats()` and `ArenaHUDController.updateMatch()`.

Root cause, measured: the UI layer is drawn by an **orthographic** `UICamera` with
`orthoHeight = 640` (= `designHeight / 2`, serialized in `Game.scene →
Canvas/UICamera`), so the UI renders at **fit-height even though the global view
policy is `ResolutionPolicy.FIXED_WIDTH`** (`PortraitGameplayCameraController.ts:45-48`).
At 390×844 the usable design half-width is `640 × (390/844) = 295.75`, i.e. the
usable design x-range is ≈[−296, +296], not [−360, +360]. The authored HUD predates
that measurement: `CoinPanel` x = −210 with width 218 (left edge −319), `CoinIcon`
x = −294 (left edge −317), `BtnPause` x = 274 with width 58 (right edge 303) and
`Joystick` x = 232 with width 196 (right edge 330). The captured frame shows the
coin pill and the pause button visibly cut by the frame edge. The Arena HUD is
worse: `LeaderboardPanel` left edge −344, `StatusPanel` right edge 332, `BtnPause`
right edge 323.

**The first revision of this fix was a provable no-op and was rewritten.** It
derived the visible width from `view.getVisibleSize().width`, which under
`FIXED_WIDTH` returns the **full design width 720** — so the computed half-width
equalled the design half-width, `safeHalfWidth` came out at exactly `324`, and the
early-return guard evaluated `324 >= 324` on every frame. The scale must come from
the UI camera, which is what `hudDesignToFrameScale(host)` now does; the module no
longer references `view.getVisibleSize()` at all.

The helper groups the HUD's children by **rectangle overlap** (union-find on the
design-space rects) and shifts each group by its own minimum, so panel/value
alignment survives. A single left/right cluster delta is not enough: `BtnPause`
needs −7.3 design px while `Joystick` needs −34.3 design px, and moving them
together would push `BtnPause` into `LevelPanel`, which they already overlap
vertically by 17 px. It is idempotent (each node's first observed position is its
frozen base) and creates no UI.

It targets **zero clipping, not the locked 24 px margin**, because 24 px is not
collision-free at 390×844 — see `design-lock.md` Gate item 7, which records the
padding shortfall as an open authoring item.

Test: `V4_HUD_SAFE_AREA_INSET` in `scripts/test_ui_v4_design_contract.mjs`. The
assertion strips comments before matching, so the module's docstring may explain
why `view.getVisibleSize()` is wrong without tripping the check.

### W13 — Reference set restored to master 01's single UI language (08, 09, 10)

Three defects had been introduced into the rendered reference set by a justification
that was factually false. The source comments in `08`/`09`/`10` asserted *"Master 01
ships cream HUD pills with dark ink text"*; reading `ui-v3/arena-hud-reference.png`
directly shows the opposite — master 01's pills are **dark** with **cream** ink, and
its back/pause controls are gold. The pages had locally overridden the shared
`.hud-pill` token to cream, i.e. a second UI language, which the brief forbids.

1. **Pill polarity.** The local `.hud-pill` overrides were deleted from
   `08`/`09`/`10`; `05-home` already inherited the shared token correctly. The
   fabricated justification is gone from every file.
2. **Pill opacity.** The shared token was `--panel: rgba(15,23,42,.62)` — 62 %
   opaque, so on `08` the pills tracked the backdrop (the 质量 pill read dark olive
   over grass). Master 01's pills are **flat, not frosted**: a pixel scanline across
   them is uniform to within 3 px, with measured fills `rgb(63,64,67)` and
   `rgb(82,87,96)`. A dedicated opaque `--panel-pill: #454B57 = rgb(69,75,87)` was
   added inside that range and `.hud-pill` now uses it. Every pill on `05`/`08`/`09`/`10`
   measures `mean = min = max = rgb(69,75,87)`, i.e. **spread 0** (was 180).
   `--panel` is unchanged and still backs `.panel`, `.pill` and `.btn-back`.
3. **Crimson reserved for lock warning.** `09`'s outer pull ring was
   `rgba(239,68,68,.45)`, colliding semantically with the crimson lock chip. Crimson
   now means *lock-warning context* only (ref `10` State A, and `10`'s `.creep` ring,
   which is deliberately kept crimson as part of that state). The pull-range boundary
   is a different meaning, so the two rings separate by **weight + alpha** rather than
   by a third hue: outer `5px dashed rgba(0,192,255,.72)`, inner `6px dashed
   rgba(46,123,255,.55)`. Measured separation went from Euclidean 42.1 to **72.3**
   (red-channel delta 13 → 63; the green delta moved the *wrong* way, 40 → 34, and is
   recorded here rather than buried).
4. **Dead declarations removed.** `.chip-lock` (a crimson-bordered chip class with
   zero users — a trap once crimson is formalised as lock-warning-only) and
   `--panel-solid` (declared, no users) were both deleted from `_shared.css`. Neither
   deletion changes a rendered pixel, which the re-render confirmed.

`01`–`04` were untouched throughout and remain SHA-256-identical to the V3 masters;
`08`'s space budget held at 64.5 / 19.3 / 10.4 / 5.8 (in band).

### W14 — False "authoritative gate" claim in the lock

`design-lock.md` called the layout contract suite *"the authoritative vertical-rhythm
gate"*. Those suites self-report `NON_RUNTIME`, so they gate the **authored** layout
only; portrait CDP acceptance is still required. The lock now says exactly that. The
`y ≈` sketch figures were also replaced with a measured, normative table — `05`'s gold
CTA measures centre 896 = **70.0 %** against the locked `y ≈ 900`, secondary row
81.3 % against `y ≈ 1030`, corner 设置 93.4 % against `y ≈ 1200`.

---

## Ordering

```
W1 ─┐
W2 ─┼─→ W6 ─→ typecheck ─→ test:full ─→ build:web ─→ runtime ─→ screenshots
W3 ─┤
W4 ─┤
W5 ─┘
W7 (independent, feeds the design gate)
W8, W9, W10, W11, W12 (runtime fixes found by the first real capture)
W13, W14 (reference set + lock corrected against the real masters)
```

Only one Cocos build may run at a time. If `build:web` exceeds 5 minutes with a
static log mtime, stop and diagnose `CocosCreator.exe`, `node.exe`, the project
lock and the build log — do not keep waiting.
