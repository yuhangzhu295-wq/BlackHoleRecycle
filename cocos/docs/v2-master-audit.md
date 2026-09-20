# BlackHoleRecycle V2 Master Audit

> Authority: this is the current product/audit backlog for V2.  It replaces
> subjective “screenshot looks better” iterations with reference → blueprint →
> Creator-saved asset/prefab → actual-bounds/overlay evidence → quantitative
> gate → lock.  A `PASS` is valid only when its stated evidence exists.

## Audit method

1. Preserve the current user worktree; never text-edit Cocos serialized scene
   or prefab internals.
2. Classify current claims as **historical**, **source-audited**, or
   **current-runtime evidence**.  Historical evidence does not satisfy a new
   design lock.
3. For each visual page, compare named elements in the 720×1280 reference
   space.  Check layout, style, typography, colour, asset source, and element
   completeness independently.
4. For dynamic 3D gameplay, use its composition contract rather than a
   pixel-perfect static-image comparison.
5. Make a page immutable only after the design-lock record says `LOCKED` and
   links to current Creator/runtime evidence.

## Issue backlog

| ISSUE_ID | CATEGORY | SEVERITY | OBSERVED | EXPECTED | ROOT_CAUSE | PROPOSED_SOLUTION | REUSE_OPTION | FILES | TEST_METHOD | STATUS |
|---|---|---:|---|---|---|---|---|---|---|---|
| D-001 | Delivery process | P0 | No structured V2 master issue backlog existed. | One auditable source lists every material gap and its proof. | Previous work was organized by individual screenshot fixes. | Maintain this backlog and update a row before/after each material gate. | Reuse existing audit/evidence folders. | `docs/v2-master-audit.md` | Review each issue against a concrete artifact. | IN_PROGRESS |
| D-002 | Asset policy | P1 | `reuse-audit-v2.md` permits compound primitives as a replacement for imported production models. | Production models must be licensed, semantically correct assets or simple purpose-built low-poly models; primitives are debug-only. | Old policy predates the V2 asset mandate. | Use the superseding V2 reuse audit and register every new asset/license. | Creator-imported assets, Kenney, Quaternius, OpenGameArt after license audit. | `docs/reuse-audit-v2.md`, `docs/v2-reuse-audit.md` | License and semantic-art audit. | OPEN |
| D-003 | UI design lock | P0 | Existing page contracts were broad percentage bands; no element-level reference/actual-bounds evidence or page lock existed. | Each of Home, Mode, Arena HUD, Revive, Settlement has a 720×1280 blueprint and independently verified subgates. | No deterministic comparison tool or data model. | Element-level Blueprint drafts now exist; collect actual Creator bounds, create overlay report, then lock per page. | Cocos Editor extension template. | `docs/design-lock.json`, `docs/design-contracts/*.json` | Overlay/bounds report plus runtime screenshot. | IN_PROGRESS |
| D-004 | Editor tooling | P1 | There was no `black-hole-design-overlay` extension. | Editor-only reference selection, opacity, grid and JSON report; never emitted into a player build. | The present builder extension authors assets but does not compare design geometry. | Added a read-only Creator extension with scene inspection and explicit report export; current Editor load still requires Computer Use. | Official Creator 3.8.3 Vue panel template. | `extensions/black-hole-design-overlay/` | Load panel in Creator; export report; verify no scene mutation. | IN_PROGRESS |
| D-005 | 3D composition | P0 | Baseline at the shared `20/18.5m` offset: player width `0.547`, Y `0.326`, buildings `2`, trees `0`, vehicles `1`, collectibles `3`, resource clusters `1`, valid empty ground `0.75`. Isolated Arena round 1 (`44/23m`) measured width `0.267` (**PASS**), Y `0.692` (missed high by `0.022`), buildings `10`, trees `8`, roads `6`, POI `53`, vehicles `2`, competitors `7`, collectibles `11`, resource clusters `2`, valid empty ground `0.503`. | One dense, playable, camera-locked city cell is quantitatively verified before broader streaming-art work. | Infinite-world implementation and visual tuning advanced in parallel. The first empty-ground probe also treated the logical `RESOURCE_CLUSTER` union AABB as a rendered object, yielding an invalid zero-empty-ground reading. The same `20/18.5m` follow offset was shared by Endless and Arena, so Arena had no independently measurable portrait preset. | Logical cluster rows are now excluded from occupancy while individual collectible rows remain. The first isolated camera run moved the player scale into contract without changing world/UI. Retain height/FOV/pitch and move only Arena `z:23→27m`; then remeasure before deciding whether semantic city content is actually missing. | Existing city/world art and prefabs, subject to semantic audit. | `docs/design-contracts/golden-city-composition.json`, `assets/scripts/world/InfiniteWorldManager.ts`, `assets/scripts/gameplay/GameManager.ts`, world prefabs | 390×844 Cocos WebGL build, real CDP touch Home → Mode → Arena, live `MeshRenderer.model.worldBounds` + `Camera.worldToScreen()` diagnostics. | **CLOSED** — see "D-005 closure" below. |
| D-006 | Machine art | P0 | LV1’s Golden machine has no current, evidence-backed silhouette/asset gate; the five-level path may not be evaluated from a validated LV1 base. | LV1 visibly reads as a yellow cartoon recycling vehicle with a black-hole core, chassis and compression structure; LV2 proves a structural turbine/piping upgrade and radius increase. | Earlier validation emphasized progression state more than art structure. | Establish the LV1 gate, then derive LV2–LV5 with structural deltas. | Existing Creator-saved chassis/art prefabs only after audit. | `docs/design-contracts/machine-lv1-golden.json`, machine prefabs | Creator prefab inspection and runtime screenshots at LV1/LV2. | OPEN |
| D-007 | Production UI assets | P1 | Source scan still finds `RoundedPanelGraphic` and `JoystickVisual` using native `Graphics`; their saved-scene use and whether any formal panel relies on them are not current-Editor audited. | Formal panels/buttons use Creator-saved Sprite/9-slice/prefab assets; Graphics remains limited to permitted dynamic/debug effects. | Partial migration was asserted without a current serialized-scene audit. | Inspect actual Creator components, migrate only proven formal-panel violations. | Existing imported UI sprites and saved prefabs. | UI scripts and `Game.scene` via Creator. | Creator component audit, screenshot, bounds report. | OPEN |
| D-008 | Runtime truth | P0 | Native Creator Inspector previously showed the required `GameRoot → GameManager` references and the visible Console showed errors `0`; the Browser Preview business flow has not been re-run in the current evidence session. The Editor-only design overlay opened as a white/empty panel. | Current-session native evidence must report zero red errors, a usable Editor overlay audit, and successful real interaction without test-only setters. | Earlier notes conflated an old computer-use transport failure with the current state; the remaining root cause is the overlay renderer white panel, plus absent fresh Browser Preview evidence. | Obtain the overlay renderer error/load evidence through the available computer-use bridge, make one evidence-led load repair, then inspect Creator and run the business flow with real pointer/touch only. | Existing acceptance suite only as supplementary evidence. | `Game.scene`, `extensions/black-hole-design-overlay/`, runtime/evidence report | Native Console, usable overlay report, Browser Preview, real pointer/touch. | IN_PROGRESS |

## Truth labels

### D-004 measurement root cause and bounded repair, 2026-09-07

- Native Creator now exposes GameRoot -> GameManager with Machine, world,
  camera, HUD and Arena references in the Inspector. The visible native Console
  has errors=0 and warnings=0 at inspection; Browser Preview is not yet checked.
  D-008's earlier transport blocker is historical, not a current blocker.
- The existing overlay does not yet display reference images: its opacity
  slider only changes a text label. Do not treat extension existence as delivery.
- More urgently, its bounds calculation assumes every element is a direct
  child of a centred 720x1280 Canvas. Parent transforms, Canvas size/anchor,
  and rotation are ignored; global first-name matching can select the wrong
  page; absent elements are compared as zero rectangles and could pass.
- Repair measurement before editing any UI: use the installed engine's
  UITransform.convertToWorldSpaceAR / convertToNodeSpaceAR for all four corners,
  normalize Canvas-local corners into reference coordinates, reject missing or
  ambiguous matches, and retain null actual bounds on failures. Draft references
  cannot produce a page lock. Reuse native engine APIs, no dependency or art.
- Risk: inactive/runtime-created pages may not be available in the edit scene;
  report that explicitly, never create gameplay nodes to make the audit pass.
- Verification: pure numeric regression (not engine evidence), source contracts,
  typecheck, native Creator extension load/report. No UI/camera/scene edits.

### D-005 deterministic correction, 2026-09-07

- Previous camera measurement: player width 0.257, screen Y 0.593. Camera/UI
  parameters are frozen during this correction; no density decoration is added.
- Source and stored renderer-bounds evidence expose two distinct defects:
  `OpeningParkTreeRoadWest/East` matched a broad `includes('Road')` rule before
  the tree rule, and the opening sedan drove around z=0 while the visible road
  occupies x=[-6,6], z=[-17,-5]. Previous counts of roads=6 and trees=10 therefore
  need remeasurement and must not be used to justify new scenery.
- Solution: restrict road classification to the actual authored road root names;
  share the cell road centre between rendering and traffic. The opening loop
  uses x=+/-4, z=-14/-8, within the existing road. Construction traffic also uses
  its actual road centre instead of an unrelated +10 offset.
- Reuse: existing project DynamicVehicle waypoint follower and imported road;
  no new third-party module or art, no serialized scene/prefab mutation.
- Risk: road AABB containment is not proof of asphalt surface membership or
  obstacle clearance. Runtime screenshots and later route/collision review are
  still required. This does not establish the GoldenCityCell scene requirement.
- Verification: typecheck, six source contracts, official Cocos build and CDP
  Home -> Mode -> Arena; assert roadside tree categories and actual opening
  traffic positions inside road bounds before/after movement. Results pending.
- Remaining structural work: Creator-authored GoldenCityCell and resource
  clusters, vehicle count, empty-ground density, then machine/UI gates. Do not
  resume sparse-world random decoration or camera iteration.

### D-005 closure, 2026-09-20

Golden City is established: `npm run acceptance:v2 -- --scope=golden-city`
passes with 29/29 gate checks and `deficits: []`, recorded in
`evidence/v2/portrait/golden-city-gate.json`.

| Metric | Contract | Measured |
|---|---|---|
| buildings | >= 4 | 4 |
| trees | >= 10 | 12 |
| road segments (logical units) | >= 3 | 5 |
| points of interest | >= 3 | 14 |
| vehicles | >= 3 | 5 |
| AI competitors | >= 4 | 7 |
| authored collectible slots | >= 20 | 23 of 23 |
| authored resource clusters | >= 2 | 2 of 2 |
| large empty ground ratio | <= 0.25 | 0.1656 |
| player width ratio | 0.22-0.30 | 0.2994 |
| player screen-Y ratio | 0.50-0.67 | 0.5728 |
| required semantics | 12 present | 12 present, including `hospital` |
| camera preset | fov 44 / fovAxis 0 / pitch -55 | matches |

Three defects had to be fixed, and two of them were in the *gates*, not the
product. The sequence matters: an `assert` chain short-circuits, so the
golden-city scope kept reporting only its first failure and the checks behind it
had not run since `7eeb3fc`.

1. **Layout (`7661123`).** `Hospital_ClinicNorth` and `CommercialShopEast`
   projected 1.14 px and 0.28 px outside the 390 px frame, and the frame spans
   only about 13.1 m of world x against a 21.66 m separation, so re-framing
   could not work. `MainCrossroad` 12 to 16 (also removing a 2 m unpaved ring,
   since the arms start at |8|), the two north buildings to x=+/-7.5, and the T4
   aspirational collectible to bearings 250/290 degrees. The tutorial
   collectible ring is byte-identical. `GoldenCityCell.prefab` is generated by
   `extensions/black-hole-world-art-builder/scene.js`, so the recipe was synced
   in the same commit.

2. **Two thresholds measured a live census (`7744f91`).** `counts.COLLECTIBLE`
   is a count of objects in `IDLE`/`ATTRACTED`/`SUCKING`, and `RESOURCE_CLUSTER`
   is grouped from that same set, so both fell as the player absorbed the
   opening rings centred on its spawn (collectibles 18/19/23 against 20 authored
   slots; clusters 0 against 2). The probe now also reports the authored slot
   population and the gate reads that. The camera is also sampled only after it
   settles, because `PortraitGameplayCameraController` follows with
   `lerp(current, target, dt * 5)` and mid-ease sampling swung
   `largeEmptyGroundRatio` between 0.14 and 0.25 for identical content.

3. **Traffic (`acf674b`).** `FAIL_GOLDEN_CITY_TRAFFIC_OFF_ROAD` tested
   `MainCrossroad`'s own bounds rather than the road network, so a vehicle on an
   arm read as off-road; it now tests the union of the visible `ROAD`
   footprints. That exposed a real defect: the route's four vertices were the
   arm *centres* (radius 16) and vehicles drive straight to the next waypoint,
   so every diagonal chord cut a junction corner, leaving 24.95% of the loop
   unpaved. A chord from (R, 0) to (0, R) stays paved while R is at most 14, so
   the vertices are clamped to 12 (re-sampled: 0 of 40000 points off-pavement).

Known residual, recorded rather than hidden: `PLAYER_WIDTH_RATIO_MAX` passes at
0.2994 against 0.30, i.e. 0.00065 of headroom. The ratio scales as 1/distance
and the camera is now sampled post-settle, so it is deterministic, but any
future camera or player-scale change will cross it first.

| Label | Meaning |
|---|---|
| `SOURCE_AUDITED` | Code/files read in this session; not a runtime result. |
| `HISTORICAL_EVIDENCE` | Artifact predates this session; useful context only. |
| `CURRENT_RUNTIME_PASS` | Current real Cocos runtime and input evidence exists. |
| `PENDING_EVIDENCE` | No qualifying proof exists yet. |
| `LOCKED` | All required checks passed and the page is protected from unrelated edits. |

## Current gate truth

| Gate | State | Evidence classification |
|---|---|---|
| Existing vertical slice / portrait / control / world / local arena | Historical PASS | Historical runtime evidence exists; not re-run this turn. |
| Golden City | ESTABLISHED — 29/29 gate checks | `CURRENT_RUNTIME_PASS`: `evidence/v2/portrait/golden-city-gate.json` (`verdict: PASS`, `deficits: []`) |
| Machine LV1 Golden | NOT ESTABLISHED | `PENDING_EVIDENCE` |
| UI page design locks | NOT ESTABLISHED | `PENDING_EVIDENCE` |
| Creator Console errors | 0 OBSERVED AT PRIOR NATIVE INSPECTION | Historical native observation; must be reconfirmed before a final runtime gate. |
| Final product acceptance | NOT COMPLETE | Several P0 gates remain open. |
