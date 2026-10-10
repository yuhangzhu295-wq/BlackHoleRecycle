# LV5_FRAMING_OWNER_DECISION

**Date:** 2026-10-04
**Status:** needs an owner decision. Nothing was changed on the basis of this document.

## What was measured

`LV5_COMPOSITION_DIAGNOSTIC` (added to `WorldCompositionProbe`, exposed through
`QABridge`) collected these from real runs at 390x844:

| Metric | LV1 (control) | LV5 (before density work) |
|---|---|---|
| Camera distance | 27.24 m | 133.49 m (4.90x) |
| Covered ground area | 681 m² | **16,353 m² (24.0x)** |
| Frustum ground depth | 45.19 m | 221.45 m |
| Screen occupancy | 99.38% | **44.53%** |
| Large empty ground | 0.63% | **55.47%** |
| Nearest-neighbour spacing (mean / max) | 2.42 m / 5.92 m | 6.50 m / **16.00 m** |
| Visible environment / props | 16 / 13 | 16 / 11 |
| Props in the upper half of the frame | 7 | **2** |

## The two causes, and which one dominates

**1. Camera coverage.** The level-aware framing added earlier this cycle pulls
the camera back 4.90x at LV5 to keep the player readable, and because the
visible ground area scales with distance squared, that expands the visible
footprint **24x** - from 681 m² to 16,353 m². This is the dominant term.

**2. Low cell density.** The authored district cells placed their content in a
central corridor (roughly |x| <= 9.5, |z| <= 18), leaving most of each 64x64 m
cell bare. This has now been addressed - see below - and it was worth about
**3.2 percentage points** of occupancy (55.47% -> 52.27% empty ground). Real,
but not the main term.

A third factor is structural and cannot be fixed inside the current rules:
`InfiniteWorldManager` streams a 3x3 cell neighbourhood (about 96 m of reach)
while the LV5 frustum sees 221 m of ground, so the top 40-50 m of the frame lies
beyond the resident cells no matter how dense each cell is. The brief forbids
changing streaming behaviour, so this document does not propose doing so.

## The density work that was done

`scripts/v7_phase3_maps.mjs`'s `DISTRICT_PLAN` now populates the outer quadrants
of all seven district maps with **existing** World Kit static assets -
skyscrapers, houses, trees, fences, streetlights, benches, containers - reusing
the existing category materials. No dynamic collectibles or vehicles were added,
so gameplay targets and per-frame cost are untouched.

Measured effect: visible environment 16 -> 31, visible props 13 -> 26, trees
0 -> 6, buildings 1 -> 4, POI 4 -> 8, while **collectibles stayed at 19** and
frame time stayed at ~14.5 ms. Nearest-neighbour max void 16.0 m -> 12.8 m.

I looked at the resulting LV5 screenshot: the lower half now has real layering
(roads, buildings, trees, vehicles), but **the upper half is still a large flat
expanse**. The goal in the brief - "LV5 画面：远景有层次，但 Gameplay 目标仍清楚" -
is **half met**: gameplay targets are clear, far-field layering is not.

## The decision this needs

The remaining gap is a product trade-off, not a bug: **how much of the world the
player should see at LV5** against **how large the player reads on screen**.
Three options, all of which touch gameplay visibility, which is why I have not
picked one unilaterally:

**A. Pull the camera back less at LV5** (data-only: `CAMERA_PROFILE.endless.levelOffsets`
in `cocos/assets/scripts/core/RenderProfile.ts`). At a 2.5x pullback instead of
4.90x the visible ground area would be roughly 4,000 m² instead of 16,353 m², and
the player's `playerWidthRatio` would rise from ~0.26 to ~0.52 - the player would
fill over half the frame width. Costs: the player reads as huge and the player
sees much less of the world.

**B. Cap the LV5 assembly size.** The machine grows from ~3.1 m to ~13.4 m across
between LV1 and LV5 (`MACHINE_EVOLUTION_CONFIG` scale 1.0 -> 2.30 plus the
upgrade assemblies). Capping that growth means the camera need not pull back so
far, so both the framing and the density improve together - but the level-up
payoff is visually smaller, which cuts against the brief's "growth must be
visible by eye".

**C. Leave the framing as is** and accept that LV5 is a wide, sparser view. The
player stays readable (which was the P1 this framing fixed - at LV5 the player
previously overflowed the frame and its own machine buried the black hole), and
the density work has made the resident area as full as the current streaming
radius allows.

**My recommendation: A, at a moderate value rather than 2.5x** - enough to bring
the visible area down while keeping `playerWidthRatio` inside roughly 0.30-0.38,
then re-measure. The LV1 band is [0.22, 0.30] and the framing gate is only
asserted at LV1, so a slightly larger LV5 ratio is measurable without weakening
that gate. But this changes how much world the player can see while playing, so
it should be the owner's call rather than mine.


---

## RESOLVED (2026-10-10) — it was framing, and the metric could not see it

**Status:** closed. The decision this document was waiting for was a camera one.

### What was actually wrong

The LV5 frame showed the camera clear colour as a flat neutral-grey band across
the top. Measured on the 390x844 capture: the top 96 px had **zero channel
saturation** at (60,60,60) and (174,174,174) -- matching
`RenderProfile.cameraClearColor = "#333333"` and unlike every other frame in the
level series, all of which are saturated from row 0.

Cause: the frustum's far edge landed outside the streamed cells. At 3.60x the
frustum covered ground from z -206.68 to -44.10 (162.58 m deep) while the player
sat at z -88.9, putting the far edge 117.8 m out against a 3x3 neighbourhood
reach of at most 103.1 m. The band of screen rows whose ground-plane z fell past
the resident cells showed the clear colour.

### The fix

`endless.levelOffsets[4]` 3.60x -> **2.95x** (`new Vec3(0, 63.0, 58.3)`,
85.8 m). The far edge now lands at ~103 m, inside the reach at the positions
where the old value was outside it. Verified: the LV5 capture's first saturated
row is now **0**, and `--scope=progression` passes.

It cannot be removed outright by framing. The reach varies from 64 m to 128 m
depending on where the player sits inside its cell, so a guaranteed-clear frame
would need a ~53 m camera and a hole filling two thirds of the width. Closing it
completely is a streaming-reach or far-field-ground change, and this document
still does not propose changing streaming behaviour.

### Why nothing caught it, and the correction that did NOT work

`largeEmptyGroundRatio` is `emptyGroundSamples / groundSamples`, i.e. **1 minus
prop coverage of visible ground** -- not a measure of large empty regions,
whatever the name suggests. It also skips the top 16% of the frame as "HUD" and
silently drops any sample no ground tile covers. A frame whose top was clear
colour therefore still reported 100% ground coverage of the rest.

The first correction attempt added a `voidRatio` (samples no ground tile covers,
over the whole frame) to `WorldCompositionProbe`. **It was reverted.** The LV1
control returned `voidRatio = 0.4766` where there is demonstrably no void -- LV1's
top row is grass. The GROUND category does not tile all rendered ground, so
"no GROUND entry" is not "clear colour visible". A metric that reports a 48%
void on a clean frame is worse than one that reports none. The correct form is a
geometric test -- frustum far edge against the resident cell extent, both of
which the probe already computes -- not a sample count.
