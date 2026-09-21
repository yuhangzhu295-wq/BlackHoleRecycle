# Gameplay Composition Contract — V4

Applies to reference `08-endless-gameplay.png` and to every procedurally
generated Endless cell.

## 1. Two Different Measurements, Two Different Meanings

These two metrics are **not interchangeable** and must never be used to
substitute for one another.

| Metric | Space | Meaning | Owner |
| --- | --- | --- | --- |
| `largeEmptyGroundRatio` | screen-space | Visual composition of one 390×844 frame. Is the picture crowded or empty? | Screenshot review |
| `playableOpenAreaRatio` | world-space | How much of the authored cell's ground footprint is free of placed objects. | `qa-probe` world composition |

A high `playableOpenAreaRatio` does **not** prove that the screen composition is
good. A low `largeEmptyGroundRatio` does **not** prove the world is crowded.
Both must be measured and both must pass.

## 2. Screen-Space Visual Budget (reference 08)

| Band | Share of frame | Content |
| --- | --- | --- |
| Open movable ground | **55 % – 65 %** | Walkable street/pavement with no object footprint |
| Environment / immovable scene | 15 % – 20 % | Buildings, facades, walls, fences |
| Static swallowable targets | 10 % – 15 % | T1–T5 object footprints |
| Dynamic content | 5 % – 10 % | Vehicles, arena competitors, later pedestrians |

### 2.1 Where this budget is measured

This table is a property of the **reference image**, so it is measured on the
reference image, not inferred from the running game:

```
scripts/render_ui_v4_references.mjs
  -> rasterises the live DOM boxes of 08-endless-gameplay.html on a 72×128 grid
  -> resolves overlap with precedence  dynamic > static > environment > open
  -> excludes the player
  -> writes the payload to reference-manifest.json  references[].spaceBudget
```

Measured on the current reference: open **64.5 %**, environment **19.3 %**,
static **10.4 %**, dynamic **5.8 %** — all four in band.

### 2.2 The runtime screen-space probe is NOT this gate

`WorldCompositionProbe.estimateEmptyGround` reports a screen-space ratio, but it
classifies samples from **projected world bounding quads**. Those quads
over-count: a single proximity-cluster entry can span every collectible in the
cell, and large landmarks project far larger than they read. On a real 390×844
Endless frame the probe reported

- `largeEmptyGroundRatio = 0.0599` (5.99 % empty)
- `coverageByCategory` dominated by `RESOURCE_CLUSTER` / `COLLECTIBLE`

while the same frame is visibly mostly open road. That number is **not**
crowding evidence and must not be used to pass or fail §2.

The authoritative runtime openness measure is the world-space metric in §3.

### 2.3 Hard fails for reference 08

- A frame where every object crowds around the black hole.
- A frame with a large dense cluster spanning more than a third of the width.
- A frame where T4/T5 targets are not visible at all.
- A frame where the open-ground share drops below 0.55.
- Any spec commentary, tier label or budget legend painted into the PNG.

## 3. World-Space Gate (unchanged from V3 baseline)

`playableOpenAreaRatio ≥ 0.55` for any authored or procedural cell, measured in
world space from real object footprints.

### 3.1 Where this is enforced

The threshold is declared in
`cocos/docs/design-contracts/golden-city-composition.json` under
`worldSpaceSpatial.playableOpenAreaRatioMin`, deliberately as a **separate
section** from `mandatoryComposition` (which is screen-space). The gate asserts
it as `PLAYABLE_OPEN_AREA_RATIO_MIN`, preceded by
`PLAYABLE_OPEN_AREA_GROUND_SAMPLES_MIN ≥ 1` so a degenerate probe run reports
"no ground samples" rather than a bare "ratio unavailable". It runs under
`npm run acceptance:v2 -- --scope=golden-city` and is written to
`cocos/docs/evidence/v2/portrait/golden-city-gate.json` alongside the
screen-space checks.

Declaring it in the contract matters: the loader validates every declared
threshold, so removing or malforming it is a hard
`FAIL_GOLDEN_CITY_CONTRACT_INVALID` rather than a silent skip. Before this was
wired up, the probe and the reader both existed but **nothing asserted the
ratio**, so a passing `LARGE_EMPTY_GROUND_MAX` was the only spatial evidence and
a screen-dense / world-open cell would have passed while violating §3.

### 3.2 Why the two metrics can never substitute for each other

Measured on **two** real 390×844 frames. The two instruments disagree by more
than an order of magnitude on each:

| Frame | Screen-space ratio | World-space `playableOpenAreaRatio` |
| --- | --- | --- |
| Endless opening (`v4-design-evidence.json → gameplay.openingBudget`) | `probeEmptyGroundRatio` **0.0172** | **0.98633** |
| Golden City cell (`golden-city-composition-before.json`) | `emptyGround.largeEmptyGroundRatio` **0.16563** | **0.98633** |

The Endless frame is simultaneously 1.7 % open by the screen-space instrument and
98.6 % open in world space. The screen-space figure is dominated by
proximity-cluster entries that span every collectible in the cell, which is why
`openingBudget` self-reports `isGate: false` and
`reliability: UNRELIABLE_FOR_VISUAL_SHARE`.

Note the direction of the error, because it is what makes the substitution
dangerous rather than merely imprecise. `largeEmptyGroundMaxPercent = 25` is a
*crowding* ceiling: a high screen-space number means crowded. The Endless frame
reads **0.0172** — the instrument is claiming almost no empty ground at all,
i.e. maximum crowding, on a frame that is visibly open road. It would sail past
the `≤ 0.25` ceiling while describing the opposite of what is on screen. A gate
that accepted either number as evidence for the other would be measuring nothing.

Recorded V3 baseline, which V4 must not regress:

| Source | `playableOpenAreaRatio` |
| --- | --- |
| `AUTHORED_GOLDEN_CITY` | ≈ 0.9854 (re-measured 2026-09-20: 0.98633) |
| `PROCEDURAL_FALLBACK` | ≈ 0.9319 |

Screen-space numbers obtained earlier in the project were low and are **not**
valid evidence of crowding. World-space composition measurement is the formal
Spatial Gate from this point on.

## 4. Resource Distribution Cadence

Per cell, the placed collectibles must decompose as:

| Bucket | Share of placed collectibles | Definition |
| --- | --- | --- |
| Singles | **50 % – 60 %** | Isolated object, no neighbour within its spacing floor |
| Small groups | **25 % – 35 %** | 2–3 objects, grouped |
| Hotspots | **10 % – 15 %** | An explicit, legible resource point |

Explicitly forbidden regression: a single hotspot surrounded by a dozen or more
objects. That was the old cadence and it produced the "满地垃圾" look.

### 4.1 Scope — the bands describe the procedural generator

The three bands are enforced by `scripts/test_ui_v4_design_contract.mjs` as
`V4_SINGLE_BAND` / `V4_SMALL_GROUP_BAND` / `V4_HOTSPOT_BAND`, which read the
placement budgets in `cocos/assets/scripts/world/ChunkConfig.ts`
(`scatter` / `group_${g}` / `cluster_${cluster.id}`). They are therefore a
property of **procedurally generated cells**.

The `byTag` view of `gameplayComposition` buckets by that same prefix
convention (`cluster_` → hotspot, `group_` → smallGroup, `scatter` → single,
`aspirational` → aspirational). An **authored** cell carries
`cluster_<name>_<n>` ids from `CollectibleSpawnPoints`, so every one of its
objects buckets as `hotspot` — by naming convention, not by any distribution
decision. `byTag` must not be read as a cadence verdict on an authored cell.
The `spacing` block is the measurement that distinguishes a pile from a spread;
`byTag` cannot.

### 4.2 Adjudication — authored opening cell

`AUTHORED_OPENING_CELL_CADENCE_EXCEPTION` — adjudicated
**`INTENTIONAL_TUTORIAL_EXCEPTION`**, the same call as §7. Do **not** re-author
the two spawn rings.

Measured on the committed evidence
(`cocos/docs/evidence/v4-design/v4-design-evidence.json` →
`gameplay.opening.gameplayComposition`):

| Field | Value | Reading |
| --- | --- | --- |
| `collectibles` | 23 | 20 × T1, 1 × T2, 1 × T4, 1 × T5 |
| `byTag` | singles 0 / smallGroups 0 / hotspots 20 | naming artifact — every authored id is `cluster_*` |
| `spacing.nearestNeighbourMinMeters` | 1.00 | two concentric rings, r = 5 m and r = 6 m |
| `spacing.nearestNeighbourMedianMeters` | 1.00 | min = median ⇒ **flat** distribution |
| `spacing.nearestNeighbourP90Meters` | 1.48 | the §7 figure |
| `spacing.maxObjectsWithinDenseRadius` | 9 | see below |
| `spacing.isolatedCount` | 2 | the T4 / T5 aspirational targets |

§4 forbids *"a single hotspot surrounded by a dozen or more objects"*. The
authored cell does not have that geometry:

- A 6 m disc centred on a ring point spans ≈ 12 m of arc. At r = 5 m that is
  137° of 360° ⇒ ≈ 3.8 of 10 points; the outer ring contributes ≈ 3.2 more, plus
  the radially-paired partner ⇒ **8–9 objects** — exactly the measured
  `maxObjectsWithinDenseRadius = 9`. All 20 T1 objects piled on one point would
  read ≈ 20.
- A pile is **heavy-tailed**: min ≈ 0.1–0.3 m with the median far above it. This
  cell reads min **1.00** = median **1.00** — a flat distribution, which is the
  signature of an even ring.

So the geometry is an evenly spaced teaching ring. `byTag` is the artifact;
§4 is not violated.

**Guard.** So the exception cannot quietly widen into the real regression §4
exists to catch, the contract test asserts the committed evidence stays inside a
bounded ceiling — `V4_AUTHORED_OPENING_CELL_NOT_A_PILE`:
`maxObjectsWithinDenseRadius ≤ 12` and `nearestNeighbourMedianMeters ≥ 0.5`.
Re-authoring the rings into a pile, or any future capture that reports one,
fails the contract test instead of passing silently under the exception.

## 5. Tier Population Rules

| Tier | Count character | Visibility rule |
| --- | --- | --- |
| T1 | Relatively many, but **spread out** | Always swallowable at LV.1 |
| T2 | Fewer than T1 | Mostly swallowable after first upgrade |
| T3 | Fewer again | Mid-game goal |
| T4 | A small number of clearly readable targets | **Must be visible to a low-level player, even though it cannot be swallowed** |
| T5 | **0 – 1** obvious large target | Same visibility rule |

Spacing floors, already implemented in `CellItemGenerator`:

| Tier | Minimum neighbour spacing |
| --- | --- |
| T1 | 2.5 m |
| T2–T3 | 4.0 m |
| T4–T5 | 8.0 m |

Tier weights in the generator are `T1 50 / T2 25 / T3 15 / T4 8 / T5 2`.

## 6. Progression Legibility Rule

A low-level player must be able to **see** a T4/T5 target inside the first cell,
and must be unable to swallow it. The correct experience is:

```
see the big thing  →  walk into its suction range  →  "需要 LV.X"  →  go grow
```

The wrong experience is either (a) nothing large is ever visible, or (b) the
large thing gets silently dragged in and disappears.

Locked targets receive a **gentle outer pull** only. They never enter the formal
`ATTRACTED → SUCKING → ABSORBED` chain. The standoff distance keeps them outside
the black-hole rim so that no "already eaten" illusion is possible.

### 6.1 How "can see" is proved — frustum arithmetic, not `lockVisible`

`lockVisible` cannot answer this question and must not be used to. It is a
**state** flag: it only turns true once the machine is already inside the
target's suction range. Over the real drive trace
(`v4-design-evidence.json → targets.drive.samples`, n = 92) it is non-zero in
35 samples (**38.0 %**), so it is a live duty cycle rather than a stuck-false
flag — but at spawn the machine is nowhere near the target, so it cannot report
"was a static T4/T5 on screen at spawn". An earlier reading of this field as
"all false" was a sampling artifact of a shorter trace.

Visibility is instead bounded by the camera frustum, published in the acceptance
report's `camera` block:

| Field | Value |
| --- | --- |
| `fov` / `fovAxis` | 44° / 0 |
| `position`, relative to the player | (0, 19.878, 18.272) |
| camera → player distance | √(19.878² + 18.272²) = **27.00 m** |

Half-angle = 22°, so the frustum cross-section in the plane through the player is
`27.00 × tan 22° = 10.909 m` on the `fov` axis and `10.909 × (390/844) = 5.041 m`
on the other. The **narrower** semi-axis is therefore **5.041 m**.

The spawn distance comes from `targets.drive.samples[].targetDistance` — the
distance from the machine to the nearest body it cannot yet swallow, computed
player-relative (`Math.hypot(object.x - player.x, object.z - player.z)` in
`capture_v4_design_evidence.mjs`). Its first sample, at LV.1 / mass 0, reads
**4.17 m**.

That is *not* what `openingTierLadder.nearestOverTier[].distance` used to report.
That field read `3.89 m` because it computed distance from the **world origin**
while publishing it under a name that reads as player distance — design-review
**N8**, MAJOR. The two agree only because this authored cell is authored around
the origin and the machine spawns on it (`32 × 0.62 = 19.84` is how the authored
T4 figure arose), which is precisely why the defect survived: it produced
plausible numbers. The runner now publishes `distance` (player-relative) and
`originDistance` side by side, so neither can be mistaken for the other.

A ground-plane point 4.17 m from the player lies at most 4.17 m off the view
axis, and `4.17 < 5.041`, so it is inside the frustum **in every horizontal
direction** — there is no bearing at which a T5 target 4.17 m away is off screen.
The bound is robust to the `fovAxis` convention: if `fovAxis` were horizontal
instead, the narrower semi-axis would be `10.909 m`, larger still. It is also
robust to the target's depth: the tightest case is a purely lateral target at the
player's own depth, where the half-width is `5.086 m` against a `4.17 m` offset,
a margin of ≈ `0.9 m`.

It is also clear of the HUD exclusion band (`topRatio 0.16` / `bottomRatio 0.18`).
The player sits at `playerViewport.y = 0.610`, and a target 4.17 m away projects
near the player — near mid-frame, not under the coin/level pills.

So §6 is satisfied at LV.1 by `highestPresentTier: 5` + `exposesLockedTier: true`
+ a T5 target at 4.17 m inside the frustum.

**Documented follow-up, deliberately not a gate this round.** The bound above
comes from the camera only; it does not account for occlusion by buildings. A
stronger instrument would describe the aspirational nodes through
`QABridge.describe()` so each carries a viewport-normalised `screen` rect, then
intersect that rect with the content band. It is not added in this round: the
composition block is `NOT_A_GATE`, the RC gate list does not include it, and
adding a field would invalidate the already-validated build. Recorded here so the
next round can pick it up without re-deriving the analysis.

## 7. Tutorial Exception — Intentional, Do Not "Fix"

`TutorialStarter` local spacing is ≈ 1.48 m for T1/T2.

Adjudication: **`INTENTIONAL_TUTORIAL_EXCEPTION`.**

Reason: the teaching area must let the player feel a first swallow within
seconds. Forcing tutorial objects apart would break the onboarding.

Therefore the spacing floors in §5 apply to **procedural and normal authored
cells only**. Tutorial placement is authored under `CollectibleSpawnPoints` and
is not selected by chunk index. Do not re-space tutorial objects.

## 8. Evidence Required for a Composition PASS

1. Real 390×844 runtime screenshot of reference 08 state.
2. `playableOpenAreaRatio` from the world-space probe.
3. `largeEmptyGroundRatio` from the same screenshot.
4. Per-tier object counts for the captured cell.
5. Distribution bucket counts (singles / small groups / hotspots).

A single overall "looks good" verdict is not evidence.
