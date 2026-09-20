# UI V4 Expanded — Design Lock

Status: **LOCKED (layout + composition)**
Supersedes: nothing. `ui-v3/design-lock.md` remains valid and authoritative for
pages 01–04. This document extends it to the full ten-page shipping set.

Read first: `design-lineage.md` (inheritance rules) and
`gameplay-composition-contract.md` (world/screen space gates).

---

## Global System

### Canvas

| Property | Value |
| --- | --- |
| Design canvas | 720 × 1280 (9:16) |
| Acceptance devices | 375×667, **390×844**, 430×932 |
| Top safe margin | 48–64 px (notch / status) |
| Bottom safe margin | 36–48 px (home indicator) |
| Lateral padding | ≥ 24 px for any interactive element |
| Inherited masters `01`–`04` | **native 538 × 957** (V3), exempt from the 720 × 1280 raster |

**Note on the inherited masters' canvas.** `01`–`04` are byte-identical copies of the
V3 masters (`ui-v3/arena-hud-reference.png`, `revive-reference.png`,
`mode-select-reference.png`, `settlement-reference.png`), verified by SHA-256 and
recorded per-file in `reference-manifest.json` as `byteIdenticalToSource: true`.
Their native raster is 538 × 957, i.e. aspect **0.5622** against 9:16's 0.5625 — so
the 9:16 requirement is satisfied without re-rasterising. The 720 × 1280 canvas
governs the six **new** pages `05`–`10` only. Re-rasterising `01`–`04` would break
the byte-identity inheritance guarantee, so it is explicitly forbidden.

### Product Tone

9:16 casual mini-game. Low-poly cartoon. Bright colours. Clear silhouettes.
Thick outlines. Cyan-blue information panels. Yellow primary CTA. Purple
emphasis. Large type. Readable on a phone held in one hand.

Explicitly **not**: complex PBR, photoreal cars, cinematic lighting, heavy
particle effects, over-complex animation, screens full of buttons, mobile
gacha-lobby system stacking.

### Colour roles

Each accent carries exactly one meaning. Reusing an accent for a second meaning is
what created the `09` defect below, so the roles are binding on `05`–`10`:

| Token | Role | Explicitly not |
| --- | --- | --- |
| `--crimson` `#EF4444` | Lock-warning context: the `需要 LV.X` lock chip, the `.creep` ring that accompanies it, defeat, timer urgency | range / boundary indicators |
| `--cyan` `#00C0FF` | Information panels, the mechanic phase-label chips, the outer pull-range boundary in `09` | warnings |
| `#2E90FF` / `#2E7BFF` | The inner suction ring in `09`, machine palette | — |
| `--cta-1` → `--cta-2` `#FFD000`→`#FFA000` | Primary CTA, and the gold action chrome (back / pause), matching master `01` | — |
| `--violet` `#8B5CF6` | Reserved. Unused in `05`–`10` | — |

`09`'s outer pull ring was originally crimson, which read as a warning even though
a pull-range boundary is not a warning. It is now cyan (`rgba(0,192,255,.72)`, 5px),
thinned and strengthened so it separates from the inner blue ring by weight rather
than by hue. `10`'s `.creep` ring stays crimson because it *is* lock-warning
context — it appears only alongside the lock chip in State A.

### HUD pill fill

Master `01`'s pills are **flat and opaque**. Verified by pixel scanline: across the
coin pill at y=44 (x 126–174) the fill is uniform `rgb(63,64,67)`, and across the
second pill (x 180–204) `rgb(82,87,96)` — each with a spread of ≤ 3. A frosted pill
would track the background behind it, so that tightness means the fills are flat.

Pages `05`/`08`/`09`/`10` therefore use `--panel-pill: #454B57` (`rgb(69,75,87)`,
inside the measured range) rather than the translucent `--panel`. With the
translucent fill, `08`'s coin pill sat over a light-blue building and 33 % of the
pill area read `rgb(168,200,240)` (lum 196), putting cream text on a near-white
composite. After the change every pill on all four pages measures
`mean = min = max = rgb(69,75,87)`, spread **0**. `--panel` and `--panel-solid` are
unchanged and keep their other users.

### One Page Per Image

Every reference is exactly one page in one file. Multi-page contact sheets are
forbidden. Mechanic references (`09`, `10`) may show several phases of one
mechanic inside **one** real game scene, but may not montage four independent
pages.

---

## 01 — Arena Gameplay HUD

Inherited master. Source `ui-v3/arena-hud-reference.png`, 538×957.
Not re-authored. See `ui-v3/design-lock.md` §4.

Locked essentials: centre timer pill, top-5 mini leaderboard top-left with the
local row highlighted, off-screen rival arrows, bottom-quadrant joystick, no
shop or task menu during combat.

## 02 — Revive

Inherited master. Source `ui-v3/revive-reference.png`, 541×957.
Not re-authored. See `ui-v3/design-lock.md` §5.

**Corrected in this revision.** The previous text described a different layout.
Re-read against the master:

- Dimmed battlefield veil over the live arena.
- A large `复活` / `继续` lockup in violet-pink over a teal disc, crossed by an
  orange / yellow / cyan swoosh. **There is no card face.**
- The countdown is a **dark pill** reading `倒计时: N`. It is **not** a
  countdown ring.
- `免费复活` is a **violet** button carrying an ad/video glyph.
- `我怂了，溜了` is a **filled gold** button, not a muted text button.

Two consequences that must not be papered over:

1. The emphasis is inverted relative to the previous description: gold sits on
   the *give-up* action, while the revive CTA is violet.
2. The ad glyph on `免费复活` is the same `观看视频解锁` entry that
   `ui-gap-audit.md` records as `BLOCKED_EXTERNAL_CONFIG`. The master shows it
   as visible chrome, so the audit entry and the master disagree. The master
   wins as the visual authority until the ad capability is genuinely
   configured; the capability itself remains blocked.

Countdown reaching 0 transitions cleanly to Settlement.

## 03 — Mode Select

Inherited master. Source `ui-v3/mode-select-reference.png`, 544×955.
Not re-authored. See `ui-v3/design-lock.md` §2.

**Corrected in this revision.** The previous text said "exactly two live cards
(Endless Exploration, Arena Brawl). No locked cards" — all three claims were
wrong. Re-read against the master:

- Gold back button; `模式选择` title in white with a heavy dark outline.
- The title bar also carries a lightning counter (`19`), a session timer
  (`00:33`) and three circular chrome buttons.
- **Four** stacked cards, not two:
  - `竞技吞噬` — 多人竞技, `实时对战，吞噬最强对手!`, badge `4人对战` — **live**.
  - `无尽吞噬` — 生存挑战, `无限地图，挑战更高分数!`, badge `最高分 35680` — **live**.
  - `黑洞乱斗` — 团队混战, `3V3 团队对抗，策略致胜!` — **locked**, padlock +
    `观看视频解锁`.
  - `限时冲榜` — 限时挑战, `限定时间内，冲击排行榜!` — **locked**, padlock +
    `观看视频解锁`.
- No VIP, no friend rooms. That part was correct.

The `观看视频解锁` ad-unlock on the two locked cards is the same
`BLOCKED_EXTERNAL_CONFIG` entry as in §02.

## 04 — Settlement

Inherited master. Source `ui-v3/settlement-reference.png`, 538×964.
Not re-authored. See `ui-v3/design-lock.md` §6.

Locked essentials: purple ribbon, cream podium card, placement badge, three
stat blocks, coin reward, PLAY AGAIN + BACK TO LOBBY. All numbers must come
from the real session.

---

## 05 — Home

### Purpose
Orientation, hero showcase, one-tap entry into the real mode flow.

### Layout

```
┌─────────────────────────────────┐
│ 黑洞回收站            [金币][LV] │  top bar, y ≥ 48
│                                 │
│                                 │
│         ◉ 黑洞回收机             │  hero, centre
│        (低模卡通 + 轻微悬浮)      │  y ≈ 300–760
│                                 │
│                                 │
│      ┌───────────────────┐      │
│      │    开始吞噬  ▶     │      │  gold CTA, y ≈ 900
│      └───────────────────┘      │
│   [模式]   [机器]   [皮肤]        │  y ≈ 1030
│                          [设置]  │  y ≈ 1200, corner
└─────────────────────────────────┘
```

### Elements

| Element | Spec |
| --- | --- |
| Title | 黑洞回收站 — cartoon lettering, white fill, dark drop shadow, upper centre |
| Coin counter | Left of top bar. Gold coin icon + pill surface + high-contrast value |
| Machine level | Right of top bar. `LV.X` + capacity tier pill |
| Hero | Black-hole recycling machine, low-poly cartoon, gentle float, light magnetic swirl |
| Primary CTA | **开始吞噬** — gold pill, height ≥ 88 px, bottom third |
| Secondary row | 模式 / 机器 / 皮肤 — three equal items, outlined style |
| Corner | 设置 — small, top-right or bottom-right corner, low emphasis |

### Non-negotiables

- Exactly one gold CTA.
- 开始吞噬 opens the real Mode Select flow. It must not claim to start an
  unspecified default mode.
- Forbidden: VIP, 首充 (first recharge), 签到 (check-in), 邮件 (mail), 好友
  (friends), 战令 (battle pass), 抽奖 (gacha), complex red-dot badges.

---

## 06 — Endless Ready

### Purpose
Confirm the Endless run before it starts, show the map and the personal best.

### Layout

```
┌─────────────────────────────────┐
│ [←]        无尽探索              │
│                                 │
│   ┌─────────────────────────┐   │
│   │      地图预览 (低模)      │   │  y ≈ 200–560
│   └─────────────────────────┘   │
│                                 │
│   历史最高纪录        LV / 质量   │  y ≈ 620–760
│   ┌──────────┐  ┌──────────┐    │
│   │ 最高分   │  │ 当前机器  │    │
│   └──────────┘  └──────────┘    │
│                                 │
│   不断吞噬 · 不断成长             │  y ≈ 840
│   解锁更大目标                    │
│                                 │
│      ┌───────────────────┐      │
│      │    开始探索  ▶     │      │  gold CTA, y ≈ 1030
│      └───────────────────┘      │
└─────────────────────────────────┘
```

### Elements

| Element | Spec |
| --- | --- |
| Back | Rounded-square button, left arrow, top-left |
| Title | 无尽探索 — centred, clean, soft blue/white outline |
| Map preview | Low-poly city thumbnail, rounded card |
| Best record | 历史最高纪录 — real saved best score |
| Current machine | Machine card with real `LV.X` and mass |
| Body copy | Exactly the two lines: 不断吞噬 不断成长 / 解锁更大目标 |
| Primary CTA | **开始探索** — gold pill |

### Non-negotiables

- No complexity. Two facts, two lines of copy, one CTA.
- Back returns to Mode Select without starting a run.
- 开始探索 is the only route into the Endless session.

---

## 07 — Arena Ready

### Purpose
Confirm the competitive run before matchmaking.

### Layout

```
┌─────────────────────────────────┐
│ [←]        竞技乱斗              │
│                                 │
│   ┌─────────────────────────┐   │
│   │     竞技场预览 (低模)     │   │  y ≈ 200–540
│   └─────────────────────────┘   │
│                                 │
│   规则                           │  y ≈ 600
│   • 8 人                        │
│   • 3:00                        │
│   • 吞噬成长                     │
│   • 淘汰弱小玩家                 │
│   • 躲避更大玩家                 │
│                                 │
│   当前机器        LV.X / 质量     │  y ≈ 880
│                                 │
│      ┌───────────────────┐      │
│      │    开始乱斗  ▶     │      │  gold CTA, y ≈ 1030
│      └───────────────────┘      │
└─────────────────────────────────┘
```

### Elements

| Element | Spec |
| --- | --- |
| Back | Rounded-square button, top-left |
| Title | 竞技乱斗 — centred |
| Arena preview | Low-poly arena thumbnail, rounded card |
| Rule list | Exactly the five lines above, in that order |
| Current machine | Real `LV.X` and mass |
| Primary CTA | **开始乱斗** — gold pill |

### Non-negotiables

- The five rules are the real rules: 8 competitors, 180 s, swallow-to-grow,
  eliminate weaker players, avoid larger players.
- Forbidden: chat, friend list, room list, complex lobby.

---

## 08 — Endless Gameplay

**This is the most important reference in the V4 set.** It locks the gameplay
space.

### Purpose
Prove that the Endless play field is open, readable, and has both a near and a
far horizon of goals.

### Composition

Full screen is the 3D city. UI is a thin perimeter only.

```
┌─────────────────────────────────┐
│ [金币]  [LV.x 质量]  [区域]  [⏸] │  one row, y ≤ 100
│                                 │
│                                 │
│        ○ T1 scattered           │
│              ○○   ○             │
│      ▢▢                     ▲T4 │  ▲T4 / ▲T5 visible
│           ◉ 黑洞                │
│                     ○           │  open ground
│    ○        ○○           ▢      │
│                                 │
│                          ◎      │  joystick zone
│                                 │  bottom 40 %
└─────────────────────────────────┘
```

### Space Budget — binding

| Band | Share | Measured (reference 08) | Verdict |
| --- | --- | --- | --- |
| Open movable ground | **55 % – 65 %** | **64.5 %** | IN BAND |
| Environment / immovable | 15 % – 20 % | **19.3 %** | IN BAND |
| Static swallowable targets | 10 % – 15 % | **10.4 %** | IN BAND |
| Dynamic (vehicles, competitors) | 5 % – 10 % | **5.8 %** | IN BAND |

**How this is measured.** The budget is a property of *this reference image*, so
it is measured on this reference image: `scripts/render_ui_v4_references.mjs`
rasterises the live DOM boxes of `08-endless-gameplay.html` on a 72×128 grid and
resolves overlaps with the declared precedence `dynamic > static > environment >
open` (the player is excluded). Every counted element carries its own
`data-bucket`, so an auditor can re-derive the number from the HTML instead of
trusting a summary. The measured payload is stored in
`reference-manifest.json` under `references[].spaceBudget`.

**The runtime screen-space probe is not the gate.** `WorldCompositionProbe`
classifies samples from projected *world bounding quads*, which over-count large
landmarks and cluster rings: on a real 390×844 Endless frame it reported 58.6 %
of the ground region covered by "static" while the frame is visibly mostly open
road. Its `largeEmptyGroundRatio` is therefore **not** used to pass or fail this
band table. The runtime gate is the world-space metric (see
`gameplay-composition-contract.md` §3) plus the visual review of the real frame.

### HUD — the complete allowed set

Allowed, and nothing else:

- 金币 (coin)
- 机器等级 / 质量 (level + mass)
- 当前区域 (current region)
- 暂停 (pause)
- 右下 Joystick
- Optionally, briefly: mass feedback, pickup feedback

Forbidden in Endless HUD: leaderboard, elimination counter, quest bar, shop,
any button grid.

### Object structure

| Tier | Character |
| --- | --- |
| T1 | Relatively many, but spread out |
| T2 | Fewer than T1 |
| T3 | Fewer again |
| T4 | A small number of clearly readable targets |
| T5 | 0–1 obvious large target |

A low-level player must still **see** T4/T5 and be unable to swallow them.

### Non-negotiables

- Map must not look like 满地垃圾.
- No large dense cluster.
- Nothing is allowed to pile up against the black hole.
- The central gameplay region must stay as complete as possible.

### One page per image — and no commentary inside the image

**Provenance, stated precisely.** `08-endless-gameplay.png` is a
**deterministic layout render**, not a screenshot. It is drawn from
`ui-v4-expanded/source/08-endless-gameplay.html` by
`scripts/render_ui_v4_references.mjs`. Every element in it is something a
player would actually see, and it is the binding authority for *layout,
hierarchy, space budget and HUD set*. It is **not** the authority for what the
engine draws — that is the real 390×844 runtime frame under
`cocos/docs/evidence/v4-design/`. The render is flat top-down; the engine draws
3/4 perspective with volumetric low-poly assets. See "What this reference does
NOT lock" below.

The following are explicitly forbidden in the PNG and belong only in this
document:

- Tier labels (`T1` … `T5`) painted next to objects.
- A space-budget legend, ruler, or percentage captions.
- "禁止 / 允许" lists.
- Any other text that describes the page instead of appearing on it.

The only text allowed in the frame is text the shipped product renders: HUD
values, the `需要 LV.X` locked-target prompt, and brief pickup feedback.

### What this reference does NOT lock: the 3D projection

The engine renders the city in **3/4 perspective with volumetric low-poly
assets** (see `cocos/docs/evidence/v4-design/v4-390x844-08-endless-gameplay.png`).
This PNG is a flat top-down layout render. That difference is deliberate and
stated so nobody mistakes the PNG for a projection reference:

- **Locked by this PNG:** layout, hierarchy, space budget, HUD set, tier
  spread, object count and cadence, safe-area placement, colour tokens.
- **NOT locked by this PNG:** camera projection, asset volume, shadow
  direction, lighting. The real 390×844 runtime frame is the authority for
  those, and it must not be "fixed" to look like the PNG.

### Open gaps recorded against this reference

| ID | Gap | Evidence | Status |
| --- | --- | --- | --- |
| `GAP-08-TIER-LADDER` | The authored opening cell contains no T4/T5 **collectible**: `tierCounts` read `{1:20, 2:1, 3:0, 4:0, 5:0}`, `highestVisibleTier = 2`. The spec wants a low-level player to see T4/T5 and be unable to swallow them. | Root cause: the authored cell (0,0) runs **no** `CellItemGenerator`, so the generator's aspirational channel never fires there. Closed in code by `populateAuthoredAspirational()` (see `implementation-map.md` W11), which adds one T4 and one T5 on the cell's outer band at bearings 78°/258° — the nearest authored prop is 10.3 m away and no Creator-authored object moves. The procedural channel had its own defect: uniform sampling made T3 and T5 equally likely and allowed two T5 per cell; now weighted T3 4 / T4 3 / T5 1 with T5 capped at one. Independently corroborated by the real growth run, which streamed and swallowed `aspirational_RESIDENTIAL_*` targets. | **CLOSED — verified on a real 390×844 frame.** `openingTierLadder` now reads `machineMaxTier = 1`, `highestPresentTier = 5`, `exposesLockedTier = true`, with `tierCounts {1:149, 2:56, 3:6, 4:5, 5:15}` over all 231 world objects. The **visible** composition (`gameplayComposition.tierCounts`) reads `{1:20, 2:1, 3:0, 4:1, 5:1}` with `highestVisibleTier = 5` — i.e. a level-1 player can see a T4 and a T5 on screen and cannot swallow either, which is exactly what the spec requires. Note the two counts are **not** comparable: `openingTierLadder` counts every object in the streamed world (including all authored traffic vehicles, which are T5), while `gameplayComposition` counts only what is visible. The `15` T5 in the former is not a §08 violation — §08's "T5 0–1 obvious large target" is a statement about the visible composition, which reads 1. |
| `GAP-08-CADENCE` | The authored opening cell tags 20 of 21 collectibles `cluster_*`, and 4m-linkage chaining puts all 21 in one group, so the tag-derived singles/small-group shares read 0. | **Resolved as intentional, not a defect.** Measured `gameplayComposition.spacing` in the real run: `nearestNeighbourMin = Median = P90 = 1.00 m`, `isolatedCount = 0`, `maxObjectsWithinDenseRadius = 9` (6 m disc). The cause is the authored prefab geometry, not the generator: `GoldenCityCell.prefab` `CollectibleSpawnPoints` holds exactly two groups, `Cluster_Park` (10 points on a **radius-5 m** circle) and `Cluster_CitySquare` (10 points on a **radius-6 m** circle) at the *same* ten bearings, so every Park point sits exactly 1.00 m inside its CitySquare twin. The minimum distance from any ring point to `ClusterAnchor_RecyclingSquare` (−5, −5) is **exactly 1.480 m** — this is the `≈1.48 m` the round brief adjudicated `INTENTIONAL_TUTORIAL_EXCEPTION`. The opening cell *is* the tutorial starter, and its spacing is therefore explicitly off-limits. The general Endless map is the procedural cells, which measure `nearestNeighborMedian = 6.40 m`, `minSpacingRatio = 1.066`, `spacingPass = true`. | RESOLVED — `INTENTIONAL_TUTORIAL_EXCEPTION` |

### Runtime defects observed in the real 390×844 frame

Found by direct inspection of `v4-390x844-08-endless-gameplay.png`, not by the
render. These are product defects, not reference defects.

| ID | Defect | Evidence | Status |
| --- | --- | --- | --- |
| `RT-08-HUD-CLIP` | The HUD row **overflows both frame edges**. | The UI layer is drawn by an **orthographic** `UICamera` with `orthoHeight = 640` (= `designHeight / 2`, serialized in `Game.scene → Canvas/UICamera`), so the UI renders at **fit-height** even though the global view policy is `ResolutionPolicy.FIXED_WIDTH` (`PortraitGameplayCameraController.ts:45-48`). At 390×844 the horizontally usable design half-width is therefore `640 × (390/844) = 295.75`, i.e. a usable x-range of ≈[−296, +296] — the original claim was correct. The serialized row spans design [−319, 303] (622 px), which is wider than the 591.5 px safe width, so it cannot fit. Re-projected at the correct scale **0.65938 = 844/1280** (not `viewport.width/design.width`): `CoinPanel` design [−319, −101] ⇒ frame [−15.35, 128.40] ⇒ **overflowLeft 15.35 frame px**; `BtnPause` design [245, 303] ⇒ frame [356.55, 394.79] ⇒ **overflowRight 4.79 frame px**; `LevelPanel` and `RegionPanel` are inside. Both pills are visibly cut. | **FIXED and verified on a real frame.** Two independent defects made the clamp a silent no-op; both are now closed. **(1) Wrong scale source.** The first revision read `view.getVisibleSize().width`, which under `FIXED_WIDTH` returns the **full design width 720** ⇒ `hudVisibleHalfWidth` = `min(360, 360)` = 360 ⇒ `safeHalfWidth` = 324, so the guard evaluated `324 >= 324` and returned before shifting. The scale now comes from the **UICamera's `orthoHeight`** (`hudDesignToFrameScale`). **(2) ES5 iterator spread.** `buildGroups` ended with `[...buckets.values()]`. `cocos/tsconfig.json` declares `target: ES2022`, so `tsc --noEmit` was clean — but the Creator pipeline downlevels to ES5, emitting `[].concat(buckets.values())`, and `concat` does **not** spread iterators: it appends the Map *iterator* as a single element. The caller then looped once with an iterator as the "group", read `item.left` off the bucket **arrays** (always `undefined`, so the union stayed at ±Infinity) and computed a shift of exactly 0. `SaveService.ts:154` documents the identical trap for `[...new Set(...)]`. Replaced with `buckets.forEach(...)`, and `V4_NO_ES5_UNSAFE_ITERATOR_SPREAD` now guards the pattern. A third, lesser defect: `TopShade` is a 720 px backdrop that vertically overlaps the whole top row, so including it in the overlap grouping merged the pills into one unshiftable 720 px group; full-bleed nodes are now excluded from the grouping. **Measured after the fix**, `openingHudGeometry.pass = true`, `offenders = []`: `CoinPanel` design [−319, −101] → frame [0, 143.74] (`overflowLeft` **0**, was 15.34) and `BtnPause` [245, 303] → [351.76, 390.00] (`overflowRight` **0**, was 4.79). Per-group shifts: `[CoinPanel, CoinIcon, CoinValue]` **+23.27**, `[BtnPause]` **−7.27**, `[LevelPanel, LevelValue, MassValue]` / `[RegionPanel, RegionValue]` / `[Joystick]` 0. That revision targeted **zero clipping** only. The 24 px rule is now enforced as well — see Gate item 7, which this row's fix has since closed. |
| `RT-08-HUD-ROWS` | The HUD occupies two rows reaching ≈24 % of frame height, against "one row, y ≤ 100". | `CoinPanel`/`LevelPanel` sit at design y = 430 and `RegionPanel` at y = 346, i.e. a second row below them. | OPEN — accepted; the region pill is the only second-row element and collapsing it would remove the "current region" readout the 08 HUD set requires. |
| `RT-08-MASS-SEP` | The mass readout renders as `质量 56150-kg` — a hyphen between the number and the unit that reads like a negative number. | The string is `质量 0 kg` in the scene and `质量 ${mass} kg` in `EndlessHUDController.ts:56`, so there is no `-` literal anywhere. Root cause confirmed: `MassValue` is fontSize 18 and its serialized `cc.LabelOutline` carries no `_width`, so it uses the default width 2 — the two outlines bridge the ~4px space and fill it in. `LevelValue` (fontSize 20) shows the same space intact because its gap is wider. | FIXED in code — the space is dropped (`质量 56150kg` / `56150kg`) in both gameplay HUDs, which keeps the authored outline style and removes the artifact. |
| `RT-08-PARK-UNDER-JOYSTICK` | A dense dark mass sits in the lower-centre of the portrait frame, directly under the joystick. | Identified from `GoldenCityCell.prefab`: it is the authored **park props cluster** — `FlowerbedWest` (−5, 7), `FlowerbedEast` (5, 7), `ParkHedgeNorth`, benches, bins and `POI_ParkFountain` (0, 7). z = +7 is the nearest authored band to the camera, so it projects to the bottom of a portrait frame. It is legitimate environment content, not 满地垃圾, and the world-space `playableOpenAreaRatio = 0.98633` (re-measured 2026-09-20; the preserved baseline recorded ≈0.9854) is unaffected — but it does reduce the effective joystick thumb area. | OPEN — assessed, low severity |


### Runtime anchors

`CompressibleObject` supplies the tier ladder; `InfiniteWorldManager` supplies
placement and the `gameplayComposition` diagnostic (including `spacing`). The
binding runtime numbers are recorded in
`cocos/docs/evidence/v4-design/v4-design-evidence.json`.

---

## 09 — Large Target Suction

**Type: Gameplay Mechanic Reference.** One real scene, several phases.

### Purpose
Teach, at a glance, that a large target is **not** "gone on contact".

### Required Phase Chain

| # | Phase | What the player sees |
| --- | --- | --- |
| 1 | `DRIVE` | Car drives normally along the road |
| 2 | Enter outer pull range | Car reaches the outer suction boundary |
| 3 | `SLOW` | Speed visibly drops |
| 4 | `DEFLECT` | Heading bends toward the black hole |
| 5 | `DEPART` | Car leaves the road line |
| 6 | `TUMBLE` | Visible rotation / drag |
| 7 | `APPROACH` | Moves toward the core |
| 8 | `SHRINK` | Scale reduces |
| 9 | `SINK` | Drops below ground plane |
| 10 | `ABSORBED` | Gone |

Phases 1–10 must read as a continuous, sustained struggle. The car must never
look like it is deleted on touch.

### Allowed visual treatment — keep it cheap

- Light motion trail
- Direction line
- Rotation
- Scale
- Sink
- Slight colour / brightness shift

### Forbidden

- Large explosions
- Complex GPU particles
- A suction ring that seriously blocks the gameplay view

### Runtime anchor

Real captured frame: `cocos/docs/evidence/v4-design/v4-390x844-09-large-target-suction.png`.

Captured by `scripts/capture_v4_design_evidence.mjs` at 390×844 with **no forced
state** — the machine was grown to level 4 / maxTier 4 by 488 s of real joystick
play (CDP touch events only; no setter, no save edit, no QA hook), absorbing 70
bodies, then a genuine T4 body was caught mid-suction:

```
runtimeId      aspirational_RESIDENTIAL_-1_2_20
tier           4          type  shelf          state  ATTRACTED
machineLevel   4          machineMass  56150   suctionRadius 6
distanceToMachine 3.63    chain ["IDLE", "ATTRACTED"]
```

The predicate `tier >= 4 && (ATTRACTED || SUCKING)` was **not** weakened. It is
structurally unreachable below machine tier 4, because
`CompressibleObject.ts:277` keeps any `tier > machineMaxTier` body in `IDLE`
forever (it only creeps and shows `需要 LV.X`), so reaching the state requires
actually growing the machine first.

The real implementation already exists and must not be replaced:

- `cocos/assets/scripts/gameplay/SuctionMotion.ts` — `SUCTION_TIER_PROFILES`,
  per-tier `pullResistance` / `suckDuration` / `escapeRadiusFactor`
- `cocos/assets/scripts/gameplay/CompressibleObject.ts` — the
  `IDLE → ATTRACTED → SUCKING → ABSORBED → RECYCLED` FSM, `setSuctionSpin`,
  escape-back-to-IDLE behaviour
- `cocos/assets/scripts/world/DynamicVehicle.ts` — route-driven car

Reference 09 is a **visual standard**, not a licence to build `SuctionV2`.

---

## 10 — Tier Lock / Upgrade Feedback

**Type: Gameplay Mechanic Reference.** One real scene, two states.

### State A — Level insufficient

- Target may still be pulled **slightly** by the outer suction.
- It must **not** enter the formal swallow chain.
- Above the target: `需要 LV.X`
- A small lock icon is allowed.
- Feedback must be clear, short, and must not cover gameplay.

Runtime anchor: `CompressibleObject.showLockAlert()` already renders
`需要 LV.X`, floats it above the body, and enforces a 1.4 s show +
3.5 s cooldown. The removed red "traffic-cone hat" must not come back.

### State B — Upgrade

On upgrade, briefly show:

```
升级！
LV.X  XXX黑洞
解锁更大型目标
```

Short, then gone. **No full-screen upgrade page.**

### Forbidden

- Full-screen upgrade interstitial
- Persistent badge over every large target
- Any warning cone / hat mesh on top of a vehicle
- Lock text that blocks the play field for more than ~1.5 s

---

## Safe-Area Summary

| Page | Top | Bottom | Notes |
| --- | --- | --- | --- |
| 05 Home | y ≥ 48 | CTA ≥ 60 above edge | corner 设置 at y ≈ 1200 |
| 06 Endless Ready | y ≥ 48 | CTA ≥ 60 above edge | CTA y ≈ 1030 |
| 07 Arena Ready | y ≥ 48 | CTA ≥ 60 above edge | CTA y ≈ 1030 |
| 08 Endless Gameplay | HUD y ≤ 100 | joystick in bottom 40 % | centre 55–65 % clear |
| 09 Suction | HUD y ≤ 100 | joystick in bottom 40 % | phase labels must not cover the car |
| 10 Tier Feedback | HUD y ≤ 100 | — | lock text floats with the target, ≤ 1.4 s |

### Measured vertical rhythm (normative)

The `y ≈` figures in the ASCII sketches above are an **approximate proportion
guide, not a spec**. The authoritative *authoring* gate for vertical rhythm is the
layout contract suite (`test_home_layout_contract.mjs`,
`test_mode_select_layout_contract.mjs`, `test_endless_hud_layout_contract.mjs`,
`test_arena_hud_layout_contract.mjs`, `test_revive_layout_contract.mjs`,
`test_settlement_layout_contract.mjs`), which encodes real pixel expectations and
currently passes. Those suites self-report as `NON_RUNTIME`, so they gate the
authored layout only — portrait CDP acceptance remains required and is tracked
separately in `RT-*`.

The sketch values were ambiguous about whether `y` denotes an element's top edge or
its centre, and that ambiguity produced a false review finding (`m10` claimed the
05 CTA sat at ≈76 % against a locked 70 %). Measuring the rendered PNGs directly
settles it — for `05` the sketch `y` is the element **centre**:

| Element | Measured band (720 × 1280) | Centre | Ratio | Locked |
| --- | --- | --- | --- | --- |
| 05 gold CTA `开始吞噬` | y 840–952 | 896 | **70.0 %** | `y ≈ 900` ✓ |
| 05 secondary row `模式/机器/皮肤` | centre 1040 | 1040 | 81.3 % | `y ≈ 1030` ✓ |
| 05 corner `设置` | centre 1195 | 1195 | 93.4 % | `y ≈ 1200` ✓ |

All three match. `m10` is therefore **RESOLVED as a false positive** — the reviewer
compared a different reference point. No re-render was required.

---

## Gate

A V4 design PASS requires all of:

1. Ten files present, one page each, correct names.
2. `01`–`04` byte-identical to the V3 masters.
3. `05`–`10` render from the locked source and match this document.
4. Two *separate* spatial checks, neither substituting for the other:
   - **Reference visual-share band** measured on the `08` render itself by
     DOM-box rasterisation (`scripts/render_ui_v4_references.mjs`), reported as
     `references[].spaceBudget` in `reference-manifest.json`.
   - **Runtime spatial gate** measured on a real 390×844 runtime screenshot as
     the world-space `playableOpenAreaRatio ≥ 0.55`.
   The runtime screen-space probe (`openingBudget`) is **not admissible** for
   the visual-share band — see `gameplay-composition-contract.md` §2.2. It is
   retained only as a diagnostic and reports `isGate: false`.
5. No second UI language: token, type, radius and outline checks pass.
6. Kimi-K3 design review recorded, with findings either fixed or explicitly
   accepted.
7. **Lateral padding ≥ 24 px for any interactive element** — the rule stated in
   the layout table above.

Gate item 6 is **UNSATISFIED by construction** on this pass: the review was
authored by `deepseek-v4.1-flash` because the routing degraded mid-session
(`design-lineage.md` §7, `KIMI3_DESIGN_REVIEW = NOT_SATISFIED`). No Kimi-K3
authorship is claimed anywhere in the V4 set.

Gate item 7 is **SATISFIED and verified on a real frame.** An earlier revision of
this document declared it unreachable, on the premise that a 24 px margin applies
to **both edges of the whole row**. That premise was wrong twice over.

**First, the rule binds interactive elements only.** The layout table says
"≥ 24 px for any interactive element". Of the five top-level `EndlessHUD`
children, `CoinPanel`, `LevelPanel` and `RegionPanel` are labels: they must stay
unclipped, but they carry no padding obligation. Only `BtnPause` and `Joystick`
are interactive. The available span is therefore
`295.75 (right) + 259.35 (left) = 555.10` design px against an authored row of
622 px, and `622 − 23.26 (left overflow) − 43.66 (right overflow) = 555.08` — it
fits, with 15.1 px and 14.0 px left between the resulting clusters.

**Second, `BtnPause` cannot be clamped in isolation.** `LevelPanel` ends at
`x = 231` and `BtnPause` starts at `245` — a 14 px gap, and they overlap
vertically, so they read as one right-hand cluster. Clamping `BtnPause` alone
would land it at `[201.35, 259.35]`, 43.7 px *inside* `LevelPanel`'s `[−19, 231]`.
The clamp therefore groups near-adjacent items (`GROUP_GAP_TOLERANCE = 24` in
`HudSafeAreaInset.ts`) and shifts the cluster as a unit. `CoinPanel` ends at
`−101` and `LevelPanel` starts at `−19`, an 82 px gap, so the two clusters stay
separate and only the right-hand one moves.

Measured on a real 390×844 frame (`openingHudGeometry`, evidence
`v4-design-evidence.json`):

| Node | Frame span | Padding left | Padding right | Required |
| --- | --- | --- | --- | --- |
| `pauseButton` | [327.76, **366.00**] | 327.76 | **24.00** | ≥ 24 |
| `joystick` | [227.97, 357.21] | 227.97 | **32.79** | ≥ 24 |

`paddingViolations = []`, `pass = true`. Per-group results: the right-hand
cluster `[LevelPanel, LevelValue, MassValue, BtnPause]` carries
`marginScreenPx = 24` and shifts **−43.66**; the left-hand
`[CoinPanel, CoinIcon, CoinValue]` carries `marginScreenPx = 0` and shifts
**+23.27**; `[RegionPanel, RegionValue]` and `[Joystick]` need no shift. Both
clusters remain disjoint (15.1 px and 14.0 px of clear space), so the 24 px rule
is met **without** an authoring pass. No serialized `.prefab` change was needed
and none was made.

The probe now gates this directly: `capture_v4_design_evidence.mjs` checks
`INTERACTIVE_PADDING_PX = 24` on both edges of the interactive nodes. The earlier
probe passed a pause button sitting flush at `x = frameWidth` because it only
checked clipping, never padding — that hole is closed.
