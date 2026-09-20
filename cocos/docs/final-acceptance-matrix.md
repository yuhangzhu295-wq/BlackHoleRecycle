# Final Acceptance Matrix

| ID | Feature | Method | Expected | Actual | Evidence | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| AC-001 | Cocos启动 | Playwright Boot | Canvas与QA挂钩就绪 | 引擎正常启动且Canvas有效 | 01-home.png | PASS |
| AC-002 | Home首页 | UI Screen State | uiScreen == Home | uiScreen: Home | 01-home.png | PASS |
| AC-003 | Start按钮 | CDP Touch Btn_Start | 切换至 ModeSelect | uiScreen: ModeSelect | 02-mode-select.png | PASS |
| AC-004 | ModeSelect模式 | CDP Touch Btn_Endless | uiScreen == Gameplay & 物体数>=15 | Objects: 108 | 03-gameplay.png | PASS |
| AC-005 | Gameplay画面 | Render check | 3D 场景与机器渲染正常 | State: PLAYING | 03-gameplay.png | PASS |
| AC-006 | Touch移动 | CDP Touch Drag | Player 发生 3D 位移 | ΔZ: -14.46m | - | PASS |
| AC-007 | T1吸附 | Move near T1 | Object absorbed & Mass/Buffer increases | Absorbed: 4 | 04-suction.png | PASS |
| AC-008 | Tier Lock | LV1 vs T2 check | MaxTier 锁定且未被瞬吸 | MaxTier: 1 | 05-tier-lock.png | PASS |
| AC-009 | 真实升级 | Mass accumulation | Machine level >= 2 | LV: 2 | 06-lv2.png | PASS |
| AC-010 | LV2 T2吸附能力 | MaxTier check | MaxTier increases to T2 | MaxTier: 2 | 06-lv2.png | PASS |
| AC-011 | 压缩缓冲 | Compression State History | State sequence contains BUFFERING & COMPRESSING | History: COMPRESSING->EJECTING->COLLECTING->IDLE->BUFFERING->READY->COMPRESSING->EJECTING->COLLECTING->IDLE->BUFFERING->READY->COMPRESSING->EJECTING->COLLECTING->IDLE | 07-compression.png | PASS |
| AC-012 | 资源方块 | Spawn ResourceBlock | 3D ResourceBlock generated & stored | Blocks: 5 | 07-compression.png | PASS |
| AC-013 | 同一T2吸收 | LV2 Re-visit T2 | Target T2 absorbed by LV2 machine | Absorbed Count: 19 | - | PASS |
| AC-015 | 卧室区域 | Spawn Theme | Theme bedroom active | bedroom | 08-warehouse.png | PASS |
| AC-016 | 仓库区域 | Region transition | Theme warehouse generated | warehouse | 08-warehouse.png | PASS |
| AC-017 | 超市区域 | Region transition | Theme supermarket generated | supermarket | 09-supermarket.png | PASS |
| AC-018 | 区域切换 | Continuous travel | Active regions sequence >= 3 | 3 regions visited | 09-supermarket.png | PASS |
| AC-019 | Pause暂停 | CDP Touch Btn_Pause | gameState == PAUSED & uiScreen == Pause | State: PAUSED | 10-pause.png | PASS |
| AC-019-FREEZE | 暂停完全静止 | Freeze Check (2s) | Position Z unchanged | Z: -215.68m | 10-pause.png | PASS |
| AC-020 | Resume恢复 | CDP Touch Btn_Resume | gameState == PLAYING & 重新接收操作 | State: PLAYING | 10-pause.png | PASS |
| AC-021 | 结算展示 | CDP Touch Btn_PauseSettle | uiScreen == Settlement & Session统计真实 | Absorbed: 25, Coins: 107 | 11-settlement.png | PASS |
| AC-022 | 数据存档 | saveService.save() | 金币数据与升级状态持久化 | Coins: 2497 | - | PASS |
| AC-023 | 刷新保留 | page.reload() | 刷新后存档数据完全保留 | Coins: 2497 | - | PASS |
| AC-030 | 390分辨率 | Viewport 390x844 | UI与3D画面正常适配 | Normal | viewport-390.png | PASS |
| AC-031 | 430分辨率 | Viewport 430x932 | UI与3D画面正常适配 | Normal | viewport-430.png | PASS |
| AC-029 | 375分辨率 | Viewport 375x667 | UI与3D画面正常适配 | Normal | 01-home.png | PASS |
| AC-027 | 控制台错误 | Error Listener | Console Error == 0 | Errors: 0 | - | PASS |
| AC-028 | 只读QA | Bridge Code Check | Mutation == 0 | STRICT READ-ONLY | - | PASS |

---

## V4 RC gate chain — `acceptance:v2` scopes

`npm run acceptance:v2 -- --scope=<scope>`. Each scope rebuilds
`cocos/build/web-mobile` through the Creator CLI (the script has no skip-build
switch) and reads the same directory, so the scopes must run serially.

The runner declares **16** scopes. Six are verified by a re-run alone on the
slot and carry `bundleProvenance`. The rest hold older reports that predate both
the provenance guard and the fixes recorded below, so they are **not** evidence
of the current build.

| Scope | State | Provenance | Report |
| :--- | :--- | :--- | :--- |
| `full` | **PASS** — 375x667 + 390x844 + 430x932, `failures: []` | `BUNDLE_STABLE` `fe685340` | `09-20 19:08` |
| `arena-ai` | **PASS** — real 180 s match, all four bot states | `BUNDLE_STABLE` `333e265f` | `09-20 19:18` |
| `arena-timer` | **PASS** — 180.0057 s, `reason: TIME`, reward paid | `BUNDLE_STABLE` | `09-20 19:23` |
| `golden-city` | **PASS** — 31/31, `deficits: []`; but the width check is unstable, see below | `BUNDLE_STABLE` (earlier evidence committed `413b1e9`) | `09-21 00:20` |
| `cell-lifecycle` | **PASS** — 375x667 + 390x844 + 430x932, 6/6 checkpoints | `BUNDLE_STABLE` | `09-20 19:32` |
| `regions` | **PASS** — all six regions over the 940 m route | `BUNDLE_STABLE` | `09-20 23:28` |
| `arena`, `network`, `pages`, `progression`, `revive`, `save-resume`, `settlement`, `ui-full-flow` | **PASS**, never re-run | none | `09-16` – `09-18` **stale** |
| `skins`, `skin-unlock` | **no report at all** | — | — |

**"The chain is green" is therefore not yet a true statement.** Six scopes are
defensible; eight carry stale passes and two have never produced a report. The
six above are what this session actually verified.

`regions` was the one recorded failure and is now resolved — but only after the
re-run disproved the diagnosis. It failed reproducibly (`BUNDLE_STABLE`,
`consoleErrors: []`), and the guess that `7661123` had superseded it by moving
`ResidentialHouseWest` was **wrong**. See below.

Measured for the six verified scopes:

- `full`: `failures: []` across all three viewports; digest `fe685340`.
- `arena-ai`: `reason: TIME` at `elapsedSeconds 180.014`, 8 competitors,
  `stateFrames {COLLECT 47719, ROAM 7310, CHASE 6673, FLEE 1155, EVENT_HUNT 843}`,
  `deathsObserved: 3`, `consoleErrors: []`.
- `arena-timer`: `reason: TIME` at `elapsedSeconds 180.0057`,
  `remainingSeconds 0`, 8 competitors, `eliminationCount 28`, and a real
  `settlementReward {coins 15, survivalCoins 12, placementCoins 3}`,
  `consoleErrors: []`.
- `golden-city`: 31 checks, `deficits: []`.
- `cell-lifecycle`: `failures: []` across all three viewports, 6/6 checkpoints
  reached (`EAST`, `NORTH`, `WEST`, `SOUTH`, `RETURN_X`, `OPENING`), `rebaseCount`
  advancing `1 → 6`, `consoleErrors: []`. The opening census recorded **23**
  collectibles (`Cluster_Park` 10, `Cluster_CitySquare` 10, `tutorial_t2_target`,
  `aspirational_authored_0/1`) and 5 authored vehicles — the authored population,
  present at the very first snapshot.
- `regions`: `failures: []`, all six checkpoints reached over the 940 m route —
  `bedroom` 0 m, `warehouse` 175.5, `supermarket` 367.4, `parking` 557.5,
  `construction` 751.2, `city` 941.4 — each with its district and landmark
  confirmed, `rebaseCount` 4, `consoleErrors: []`.

That clean `BUNDLE_STABLE` observation licensed promoting a clobber from a
warning to a failure, which `f39f689` did — see below.

### The bot-movement gate found a real bug, and it was mine to fix (`edcc8fd`)

`arena-ai` first failed `FAIL_ARENA_AI_STATE_CHASE` with only 14 state frames
(`COLLECT 12, FLEE 2`) — while reporting `BUNDLE_STABLE`, so it was a true
failure, not a clobber. The page console named the cause:
`BOT_TELEPORT_CLAMP_METERS is not defined`.

`page.evaluate` **serializes its callback and runs it in the browser**, so the
callback cannot close over a Node-side module constant. The bare reference threw
`ReferenceError` inside the `requestAnimationFrame` observe loop **on every
frame**, silently emptying the bot telemetry and then reporting a misleading
"bots do not move". The clamp is now a parameter of the evaluated callback.

Two lessons, both worth keeping:

- **`tsc --checkJs` cannot catch this class.** In the JS file the name *is* in
  scope, so only a real run — or the page console — reveals it. The pre-run
  guard covers Node-scope errors, not browser-serialization errors.
- **A gate that reports a misleading cause is worse than one that reports
  nothing.** "Bots do not move" sent the investigation toward the bot AI when
  the fault was a harness scope error.

Provenance note: this bug reached HEAD inside `9b515cd`, where the whole
acceptance script was staged and another lane's uncommitted bot-teleport work
was swept in alongside the provenance guard. The diffstat (`+132/−1`) looked
exactly like the guard alone. **Read the staged diff, not just its size.**

`verifyArenaAiRuntime` and `collectGoldenCityBaseline` are each reachable from
only one scope, so `--scope=full` does **not** substitute for them.

### Why three scopes are marked VOID, not PASS

They previously read PASS. They are not PASS. A Cocos build **deletes
`cocos/build/web-mobile` wholesale and rewrites it**, so any verification
running while another lane builds gets 404s for the entire rebuild window. Three
lanes were in flight at once and the evidence files record it:

- `cocos/profiles/v2/packages/builder.json` mtime `18:53:57` falls **inside**
  the `--scope=full` window `18:52:50–18:54:50`.
- `acceptance-report-arena-ai.json` (`18:53:32`) and
  `rc-arena-timer.log` (`18:54:45 → 18:57:58`) were written during that window.

The tell is diagnostic and worth remembering: the same eight asset URLs returned
**404 consistently for 45 s** and then existed again 10 s later. A stable 404 is
a directory being rewritten, not a slow boot and not a transfer race. Every
`FAIL_PORTRAIT_BOOT` in this chain had that cause; none was a product defect.
The scopes are serial and must be run **alone**. `golden-city` is unaffected
because its evidence was committed at `413b1e9`, before the collision window.

A bundle-provenance guard now stamps every report with
`bundleProvenance {status, start, end, comparisonWindow}` and, since `f39f689`,
**fails the run** when the built tree changes mid-run, so the next collision
self-labels as `FAIL_BUNDLE_CLOBBERED` instead of reading as a product failure.
The promotion waited for the observation it needed: three scopes re-run alone all
reported `BUNDLE_STABLE` with identical start/end digests, which is the clean
case the guard had to be able to recognise before a clobber could be called
fatal. `BUNDLE_UNVERIFIED` is deliberately **not** fatal — a clobber is positive
evidence the report is incoherent, whereas an unverified census is only the
absence of evidence, and failing on it would turn healthy runs red for reasons
unrelated to the product.

### Measured results

**Caveat resolved:** all four scopes have now been re-run alone and each reports
`BUNDLE_STABLE`, so the figures below are defensible. The `VOID` episode above
is kept because the failure mode it documents — a concurrent build silently
invalidating a passing run — will recur the moment two lanes share the slot.

- `full`: real portrait runtime and CDP touch verified on both viewports,
  `consoleErrors: []`. Includes `V4_HUD_SAFE_AREA_INSET` (see below).
- `arena-ai`: unshortened local match reached `reason: TIME` at
  `elapsedSeconds 180.01` with 8 competitors and 8968 observed frames
  (≈50 fps), across the four real bot states, with the visible revive action.
- `arena-timer`: production clock reached `reason: TIME` at
  `elapsedSeconds 180.008`, `remainingSeconds 0`, and paid a real
  `settlementReward {coins 15, survivalCoins 12, placementCoins 3}`,
  `consoleErrors: []`.
- `golden-city`: all **31** gate checks green, `deficits: []`. Against
  `design-contracts/golden-city-composition.json` v1: buildings 4, trees 12,
  roads 5 (logical units), POI 14, vehicles 5, competitors 7, authored
  collectible slots 23 of 23, authored resource clusters 2 of 2,
  `largeEmptyGroundRatio 0.1727` (max 0.25), player width ratio 0.2994
  (0.22–0.30 — **not reproducible**, see below), player screen-Y ratio 0.5728
  (0.50–0.67), viewport 390x844,
  devicePixelRatio 1, and all 12 required semantics present including
  `hospital`. Evidence: `evidence/v2/portrait/golden-city-gate.json`
  (`verdict: PASS`) plus the composition and screenshot beside it.
  `PLAYER_WIDTH_RATIO_MAX` is the tightest check, and an earlier revision of
  this document called the ratio "deterministic rather than flaky" because it
  scales as `1/distance` from a camera that is now sampled only after it
  settles. **That claim is withdrawn — it was wrong.** Four runs on the same
  build measured **0.2192**, **0.2337**, **0.2622** and **0.2979** with a camera
  pose that spans `6e-4` m and a rendered player whose widest span is identical
  (the violet disc measures `x 154..235` at `y 480`–`490`, and 11 of 13 sampled
  scanlines match exactly). The
  ratio is not a camera measurement at all — it is the merged bounds of the
  machine's decorative subtree, which rotates every frame and includes a ring
  scaled by the gameplay suction radius. See "`playerWidthRatio` is not a
  stable measurement" below.
- `golden-city` world-space spatial gate (`8afdaab`): the two checks above the
  screen-space block — `PLAYABLE_OPEN_AREA_GROUND_SAMPLES_MIN` (2048 ≥ 1) and
  `PLAYABLE_OPEN_AREA_RATIO_MIN` (`playableOpenAreaRatio` **0.986328125** ≥
  0.55) — close a real hole. The probe and the reader both existed, but nothing
  asserted the ratio, so a passing `LARGE_EMPTY_GROUND_MAX` was the only spatial
  evidence. The threshold is now declared in the contract under a **separate**
  `worldSpaceSpatial` section, because the brief requires the world-space metric
  and the screen-space one to be measured independently and forbids
  substituting either for the other. The separation is not academic: across the
  two runs the screen-space ratio moved `0.16563 → 0.17266` while the
  world-space ratio held at exactly `0.986328125`, and on the Endless opening
  frame the screen-space instrument reports `0.0172` (i.e. maximum crowding) on
  a frame that is visibly open road. `--scope` now also rejects an unrecognised
  value instead of silently falling back to `full`.

### Two harness defects found and fixed (`2c3f595`)

Both were gates that could not express what they measured. No product code
changed.

1. **`FAIL_VERTICAL_SLICE_T2_LOCK`** — `lockVisible` is
   `CompressibleObject.isShowingLockAlert()`, and `showLockAlert()` is a pulse,
   not a latch: 1.4 s visible then a further 3.5 s during which it refuses to
   re-arm. The check sampled one instant 700 ms after arrival, so it only
   passed when the pulse happened to start at that moment. The player spawns
   inside the authored tutorial ring, so the pulse usually fires at spawn and
   is already in cooldown on arrival, and the drive duration depends on the
   viewport-sized joystick geometry. The gate was therefore viewport-dependent:
   the same build passed at 375x667 and failed at 390x844 (confirmed there is
   no viewport guard around the vertical slice). The check now observes the
   pulse across one full period (6 s window, 200 ms polling). The gate is
   unchanged — the prompt must still appear.

2. **`--scope=arena-timer`** — the check tapped start and then waited
   passively, which can never reach `TIME`: an idle player is eliminated, the
   real revive page appears, and its own 5 s countdown
   (`REVIVE_COUNTDOWN_SECONDS`) expires into `ARENA_GIVE_UP_REQUESTED` →
   `forfeitLocal()`, settling as `FORFEIT` at ~15 s. That is correct product
   behaviour. The bare `waitForFunction` reported only
   `Timeout 205000ms exceeded`, which cannot distinguish "still running" from
   "ended for another reason" from "the clock stopped". The wait now polls,
   reports the last observed arena state, and keeps playing through the
   visible joystick plus the visible revive action — what
   `verifyArenaAiRuntime` already does and documents. No clock manipulation
   and no state setters.

### Golden City P0 closed (`7661123`, `7744f91`, `acf674b`)

`FAIL_GOLDEN_CITY_COMPOSITION_GATE` predated the V4 set (introduced by
`855b637`) and is now green. It needed three separate fixes, and each one
exposed a defect the previous failure had been hiding — an `assert` chain
short-circuits, so a scope that fails early never runs the checks behind it.

**1. The layout could not satisfy the contract by re-framing (`7661123`).**
The gate reads `composition.entries[].visible === true`, and the probe records
the world and screen bounds of every candidate, so the deficit was readable
precisely: `ResidentialHouseWest` and `CommercialMarketSouth` were visible but
clipped, while `Hospital_ClinicNorth` (screenBounds right −1.14) and
`CommercialShopEast` (left 390.28) missed the 390 px frame by 1.14 px and
0.28 px. The screen mapping at that depth is ≈29.7 px/m, so the frame spans only
≈13.1 m of world x while the hospital and the shop were **21.66 m** apart, on
opposite sides of the cell — no player position could hold both, and the camera
was already contract-compliant (`fov 44`, `fovAxis 0`, pitch −55°). The fix was
a layout pass, with the tutorial collectible ring left byte-identical:

- `MainCrossroad` scale `12→16`, which also removes a 2 m unpaved ring: the
  junction was 12×12 while all four arms start at |8|.
- `CommercialShopEast` x `10→7.5` and `Hospital_ClinicNorth` x `−10→−7.5`, so
  both project inside the frame.
- The T4 aspirational collectible moved to bearings 250°/290°.

`GoldenCityCell.prefab` is a **generated** artifact: the Creator extension
`extensions/black-hole-world-art-builder/scene.js` rebuilds it through
`replacePrefabThroughAssetDatabase` (whole-prefab delete-then-recreate), so the
recipe was synced in the same commit or `npm run author:golden-city` would have
reverted the edits.

**2. Two thresholds measured the live census, not the cell (`7744f91`).**
`counts.COLLECTIBLE` counts objects in the `IDLE`/`ATTRACTED`/`SUCKING` FSM
states, and the player spawns at the centre of the opening rings (radius 5 m and
6 m) and starts absorbing immediately, so the count fell to 18/19/23 against 20
authored slots. `RESOURCE_CLUSTER` is grouped from that same census, so a
cluster vanished once the player had absorbed all of its members (measured 0
against 2 authored clusters). Both describe *when* the sample was taken, not
what the cell presents. The probe now also reports `authoredCollectibleSlots`
and `authoredResourceClusters` — the authored population, with visibility
derived by projecting each authored slot through the same gameplay camera — and
the gate reads those, keeping the live numbers as drift diagnostics.

The camera is also sampled only after it settles. `PortraitGameplayCamera
Controller` follows with `lerp(current, target, dt * 5)`, so it never reaches
the declared preset exactly; reading mid-ease moved `largeEmptyGroundRatio`
between 0.14 and 0.25 for identical scene content.

**3. The traffic route left the pavement, and the check tested the wrong
bounds (`acf674b`).** `FAIL_GOLDEN_CITY_TRAFFIC_OFF_ROAD` required every
opening vehicle to be inside `MainCrossroad`'s own `worldBounds` — but that is
only the 16×16 junction, while the arms run out to |24|, so a vehicle on an arm
was reported off-road. The predicate now tests the union of the visible `ROAD`
footprints. That fix exposed a real art defect: the route is a closed diamond
whose vertices were the four arm *centres* (radius 16), and a vehicle drives
straight from its spawn point to the next waypoint, so every diagonal chord cut
a junction corner. Sampling the route against the measured road footprints put
**24.95%** of the loop on unpaved ground — the corners near (7, 9) and (9, 7)
are outside both the junction and the 12-wide arms. A chord from (R, 0) to
(0, R) only stays paved while R is at most 14, so the route vertices are now
clamped to 12. Re-sampled after the change: 0 of 40000 points off-pavement,
including every vehicle's first leg from its anchor.

Both traffic defects date from `7eeb3fc`, which rewrote traffic into five
authored ring vehicles and renamed the road entries; the earlier check passed
only because `ce30274` had two vehicles driving along the south arm against a
single `FourWayRoad` entry whose bounds were that arm.

### `playerWidthRatio` is not a stable measurement

`PLAYER_WIDTH_RATIO_MIN` is the one golden-city check that cannot be trusted
yet, and the cause is not the camera. **Four** runs of the same build produced
**four** different ratios:

| run | camera `y / z` | machine level | `AbyssBase` half | `HoleRing` half | AABB x | ratio | verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `413b1e9` (18:32) | `44.00056 / 27.00020` | — | — | — | `5.4827` | `0.2979` | PASS |
| premise re-test | `44.00006 / 27.00002` | — | — | — | `4.0700` | `0.2192` | **FAIL**, short by `0.0008` |
| drawn-only | `43.99998 / 26.99999` | — | `2.0350` | `2.4224` | `4.8449` | `0.2622` | PASS |
| latest | `44.00001 / 27.00000` | **1** (`r 2.4`) | `2.0350` | `2.1657` | `4.3314` | `0.2337` | PASS |

The camera is the declared `PortraitGameplayCameraPreset` in all four — the
poses span `6e-4` m — and the rendered player is essentially unchanged. The
violet disc's widest span is identical in both screenshots (`x 154..235`, at
`y 480`–`490`), the near-black core measures 39 px and 38 px, and 11 of 13
sampled scanlines match exactly. The two that differ sit at the disc's top edge
and move by 5–6 px, which is the ring rotation phase, not the framing. What
moved is the geometry the probe merges.

`collectMergedWorldBounds` unions every `MeshRenderer.model.worldBounds` in the
player's subtree, and that subtree is the machine's decorative assembly. The
probe now reports `player.contributors`, and in the two runs that carry it the
**fixed** body meshes are identical while **every decorative node differs**:

| node | drawn-only run | LV1 run |
| :--- | :--- | :--- |
| `AbyssBase` (cylinder, r 1.10) | `2.0350` | `2.0350` |
| `HoleInner` (cylinder, r 0.56) | `1.0360` | `1.0360` |
| `InnerSwirl` | `0.9437` | `1.0403` |
| `MidSwirl` | `1.4337` | `1.3504` |
| `OuterSwirl` | `1.9673` | `1.8351` |
| `ShimmerSwirl` | `2.1955` | `1.9078` |
| `HoleRing` | `2.4224` | `2.1657` |

So the variation lives entirely in the decoration, which rotates every frame
(`BlackHoleMachine.update` drives five yaw-rotating, z-tilted meshes and a
`sin`-driven pulse) and whose widest member, `HoleRing`, is scaled by
`1 + min(0.38, (suctionRadius - 2.4) * 0.075)` — a function of the **gameplay
suction radius**, which is per-level (`GameConfig`: `2.4 / 3.4 / 4.6 / 6.0 /
8.0` → ringScale `1.000 / 1.075 / 1.165 / 1.270 / 1.380`). The comment beside
that ring says why it is capped: the suction radius can grow quickly, and the
outer ring is only a controlled level hint that must not read as the collision
range. The gate reads that hint as the player's width.

**The check is therefore not deterministic, and the level is not the whole
story.** The LV1 run measured `0.2337` while the premise run measured `0.2192`;
both were sampled at the same level-1 machine, and `AbyssBase` is a fixed mesh
that measured `2.0350` in both. A verdict currently depends on the animation
phase and machine state at the sample instant.

**The consequence is the part that matters.** The level-independent body is
`AbyssBase` at `4.07 m` — `1.10 × 2 × 1.85` — which reads **`0.2192`**, i.e.
`0.0008` *below* the contract floor. The gate therefore passes only when
decoration inflates the number past the floor. The implemented range across all
four runs is `0.2192`–`0.2979` against a contract of `0.22`–`0.30`.

**Committed here, neither a product change:** `collectMergedWorldBounds` takes
`drawnOnly` and the player measurement opts in, so a hidden renderer can no
longer contribute to a silhouette (the environment entries keep their existing
numbers); and the composition and gate now record `machineLevel` and
`machineSuctionRadius` beside the ratio, so a level-driven number cannot be
misread as a framing change.

**What remains is a decision, not a defect.** Either the measured subject must
be pinned — declare which node *is* the silhouette, so the check stops reading
whichever decorative mesh happens to be widest — or the band must move. The
body-only reading is `0.2192` and misses the floor by `0.0008`, so a ~0.7%
increase in the player's on-screen width (`coreScale 1.85 → ~1.863`) would clear
it at every level; the alternative is to lower the floor to the documented
18–23% readability band. The contract is `LOCKED` and the value is
player-facing, so nothing was changed here.

### Operational note: Creator CLI builds hang intermittently

2 of 4 builds stalled immediately after `Build with Cocos Creator 3.8.3` with
no further output and no writes anywhere under `cocos/temp`, `cocos/library` or
`cocos/build/web-mobile`, while 6 `CocosCreator.exe` processes stayed alive. In
both cases the stall followed a scope that had just **failed**. Diagnose with
the last line of `cocos/temp/builder/log/web-mobile<date>.log` plus
`find <dir> -type f -newermt "-3 minutes"`; do **not** rely on the npm log
mtime, which is static for the whole build because output is buffered. Clear it
with `taskkill /F /IM CocosCreator.exe`.

**Amended:** a stall is only diagnosable by checking **all three** trees —
`cocos/temp`, `cocos/library` **and** `cocos/build`. Checking only the first two
misreports an asset re-import as a hang. A confirmed stall looks like: the build
task logs `Build with Cocos Creator 3.8.3`, then **zero** writes anywhere under
`cocos/` for minutes. A healthy build deletes and rewrites
`cocos/build/web-mobile`, so `index.html` legitimately **disappears** mid-build;
absence is progress, not failure.

### Two gates asserted on transients shorter than the sampling interval

Both defects share one shape: the state's lifetime is shorter than one
observation, so the assertion is a coin flip. The rule this yields is worth
applying to every gate in the file — **before asserting on a transient, compute
window duration vs sampling period; if window < period, the check must become an
engine-side record or a poll-until-true.**

`QABridge.snapshot()` recomputes the whole composition and blocks the browser
main thread for roughly 0.5 s, so no full-snapshot poll can observe anything
shorter than that. Two checks tried anyway:

1. **`FAIL_COLLECTIBLE_LIFECYCLE_ORDER`** (`5f7e579`). Tier-1 is `ATTRACTED`
   ≈0.2 s + `SUCKING` 0.35 s ≈ **0.55 s**, shorter than one snapshot. The trace
   sampled `IDLE → MISSING → ABSORBED/RECYCLED` at random and failed a correct
   absorption. Raising the sample rate cannot fix this — the blind spot exceeds
   the window. `CompressibleObject` now records the ordered FSM sequence in
   `stateHistory` through a single `transitionTo()` entry point (mirroring the
   existing `CompressionSystem.stateHistory` precedent), and
   `InfiniteWorldManager.removeAbsorbedCollectible` copies it onto the authored
   slot as `lastLifecycle` before the entity is pooled. The gate asserts the
   **recorded** sequence; the sampled trace is kept only as a diagnostic.

2. **`FAIL_ABSORB_FEEDBACK_NOT_VISIBLE`** (`4c271cf`, `aff8867`). The popup is
   emitted in the same frame as the absorption but is fully opaque for only
   **1.584 s** of its 1.8 s life (`FEEDBACK_DURATION_SECONDS 1.8`,
   `FEEDBACK_FADE_START 0.88`). The check read it once, *after* the resource
   replenishment block, which holds a real CDP touch through a 4 s cooldown plus
   an escape leg — so it could only ever see an expired popup. Its own comment
   ("Capture immediately after release") described an intent it did not
   implement. It now captures during the absorption window from the snapshots
   the lifecycle observer already receives, requiring the absorption to advance
   `emittedCount` past a per-attempt baseline.

### `largeEmptyGroundRatio` drifts with gameplay — measured, not suspected

`WorldCompositionProbe.estimateEmptyGround` (`:771-806`) excludes only `GROUND`
and `RESOURCE_CLUSTER` from `occupants`, so `COLLECTIBLE`, `VEHICLE` and
`COMPETITOR` all count as ground cover. Eating a collectible therefore **raises**
the ratio, and the user's headline metric moves as the player plays.

Replicating the probe loop over the saved composition reproduces the shipped
value to the digit (221/1280 = `0.17265625`). Counterfactuals:

| occupants excluded | ratio | vs cap 0.25 |
| :--- | ---: | :--- |
| as-shipped (GROUND, RESOURCE_CLUSTER) | 0.172656 | PASS |
| + COLLECTIBLE | 0.178125 | PASS |
| + COLLECTIBLE, VEHICLE, COMPETITOR | 0.182812 | PASS |
| **+ ROAD as well** | **0.857812** | **FAIL** |

Two consequences, and the second is an **invariant**:

- The drift is bounded at ≤13/1280 = **0.010** against a **0.077** margin, so it
  is a quantified residual, not a live flake. It is documented rather than fixed
  because the fix would invalidate the committed `golden-city` evidence for a
  0.010 gain. The safe fix, if taken later, is to exclude
  `COLLECTIBLE`/`VEHICLE`/`COMPETITOR` (proven: 0.1828).
- **`estimateEmptyGround` must keep ROAD as an occupant, while
  `computeScreenSpaceBudget` must not** (the latter changed to walkable/open in
  `95d5816`). ROAD covers 990/1280 samples and is the only reason the ratio is
  low. Anyone who "unifies" the two instruments fails this gate at **0.858**.
  The divergence was a code comment and is now a contract assertion:
  `scripts/test_open_ground_instrument_divergence_contract.mjs` (`f39f689`, wired
  into `test:contracts`) lifts both implementations out of their sources, runs
  them on identical synthetic scenes, and asserts the identity
  `openSamples − emptyGroundSamples === road samples` so that road is the *only*
  permitted difference. It is mutation-tested rather than assumed: removing
  `ROAD` from the probe's occupants makes it exit 1 with
  `PROBE_COUNTS_ROAD_AS_OCCUPANT`. The same file locks a second, independent
  asymmetry — the probe drops `RESOURCE_CLUSTER` from its occupants while the
  budget buckets clusters as `static` — so neither can be "tidied" into the
  other by accident.

### `FAIL_CELL_LIFECYCLE_OPENING_RELOAD` — live census compared to live census

Both sides of the comparison were live, so neither was the authored contract.
`openingObjects` is `openingCell.collectibleRuntimeIds`, which comes from the
**live** `cell.objects` (`InfiniteWorldManager.ts:1447`); `reload.collectibleCount`
comes from `recordCellLifecycle` (`InfiniteWorldManager.ts:1597`) as
`cell.objects.filter((object) => !isVehicleObject(object)).length`, also the
**live** list, sampled at LOAD. If the player eats an opening-cell collectible
before the scenario's first snapshot, the reload rebuilds all authored slots and
can never match. The same live-census-vs-authored-contract category error as
`7744f91`, not a timing race.

**Fixed in `f39f689`.** The obvious repair — compare against the authored slot
count — is not available here: `getSnapshot().activeCells` serializes only live
`cell.objects`/`cell.dynamicVehicles`, and the authored `collectibleSlots`/
`trafficSlots` reach the golden-city diagnostics rather than this snapshot. So
the assertion now compares the cell's **own UNLOAD event** against its reload
event and requires the round trip to restore at least what it took away and never
to come back empty. That is the engine's actual guarantee:
`populateAuthoredContent` and `populateAuthoredTraffic` re-register every authored
spawn point unconditionally (`InfiniteWorldManager.ts:416-426`, `:564`), while
the UNLOAD count is whatever remained at departure and can only be smaller. The
pickup that used to break the old assertion now cannot, and a cell that reloads
empty still fails.

`--scope=cell-lifecycle` is the only scope that runs this path — the reports for
`full`, `arena-ai` and `arena-timer` all carry `cellLifecycle: null` — so this
fix is verified by a dedicated re-run of that scope, not by the four above.
**Verified:** that run passes at all three viewports with `failures: []`,
`BUNDLE_STABLE` and `consoleErrors: []`, and it exercises all six checkpoints
with `rebaseCount` advancing `1 → 6`. The same run is also the first clean
observation of the newly-fatal clobber guard, which stayed silent as it should.

### `FAIL_REGION_LANDMARK_BEDROOM` — the landmark was never missing (`d87d10f`)

The only recorded failure in the chain, and the record was wrong about it twice.

**First wrong claim:** that it was stale. The 09-12 report predates `7661123`,
which repositioned `ResidentialHouseWest`, so the failure looked superseded. The
re-run disproved it: `BUNDLE_STABLE`, `consoleErrors: []`, and the **same**
failure. A stale-looking failure is only stale if you re-run it.

**Second wrong claim:** that a landmark was missing. It was not. The prefab nests
it — `GoldenCityCell → Buildings → ResidentialHouseWest → building-type-b` —
while `getCurrentCellVisualDiagnostics` maps `cell.node.children`, so it emits
only group names (`Ground`, `Roads`, `Buildings`, `Park`, `Props`, …), and its
`visit()` records only nodes carrying a `MeshRenderer`, which a group node does
not. The check compared `checkpoint.landmark` against that top-level list, so a
landmark one level down was structurally invisible to it.

The baseline report shows it used to work: `visualDiagnostics` was a **flat** list
of semantic names (`ResidentialHouseWest`, `ArenaSkylineWest`,
`NeighbourhoodClinic`, …) produced by the *procedural* opening cell. The authored
Golden City cell replaced that shape and the check was never updated, so it had
been failing for a reason unrelated to the landmark since the authored cell
landed. Procedural region cells still spawn landmarks as direct children
(`spawn()` → `art.spawn(kind, this.node, …)`), which is why only the first
checkpoint failed and the other five passed — a signature worth remembering:
**one checkpoint failing while its siblings pass points at a structural
difference in that one cell, not at the thing being asserted.**

The probe now also emits `descendantNames` per group and the check searches the
subtree, so it answers for both cell shapes. The failure message was also
trimmed: it dumped the full renderer diagnostics, about 6 KB, which is unreadable
exactly when it matters.

### The aspirational T4/T5 are genuinely visible at LV.1 (N2 closed)

`collectCollectibleEntries` (`WorldCompositionProbe.ts:382-406`) already emits
one entry per collectible keyed by `runtimeId` with `screenBounds` and `visible`,
so this needed no product change. Recorded as a triple, not a boolean, because
the two objects differ:

- `aspirational_authored_0` (T4): `visible` + `onScreen` + `clearOfHud`.
- `aspirational_authored_1` (T5): `visible` + `onScreen`, but **`clearOfHud`
  false** (centre y 131.79 vs HUD band start 135.04).

So a low-level player does see a T4 and a T5 it cannot yet swallow. The T5 sits
under translucent HUD furniture — a **legibility** caveat, not invisibility. An
earlier draft folded the HUD test into `onScreen` and would have reported a
demonstrably visible T5 as invisible; it was caught by validating against the
artefact rather than against intent.

### Golden City: the user's four layout requirements, audited

The gate passes 31/31 and the composition is contract-compliant. That is **not**
the same as the user's brief being met. Auditing the brief itself:

1. **≥4 buildings inside the ~13 m visible band — PARTIAL.** The predicate is
   *intersects*, not *contains*: three of the four buildings are only partly on
   screen (`ResidentialHouseWest` bounds −19.07 → 36.31, ~36 of 55 px on screen).
   The "~13 m band" has **no code predicate at all** — it is a derived
   frame-width equivalence from prose (≈29.7 px/m at that depth).
2. **Including the hospital — MET.** `Hospital_ClinicNorth` is a `BUILDING`,
   `visible`, bounds −4.74 → 43.84.
3. **Add the 1 missing visible collectible — NOT MET.** **No collectible was
   ever added.** The 19 → 23 movement is a **measurement redefinition** by
   `7744f91` (which introduced `authoredCollectibleSlots`), not a content change.
   The original "19 of 20" was itself a live-census reading, so `e4243d1`'s
   "missing due to framing" attribution is probably wrong. The instruction was
   acted on as a measurement problem when it may have been a premise problem.
4. **Ground coverage 34% → ≤25% empty — ENDPOINT MET, BASELINE UNVERIFIABLE.**
   The endpoint is `0.17265625` (221/1280). The stated `0.34` baseline exists
   **only as prose** and is not machine-readable anywhere in the repo.

**Process defect, more serious than the finding:**
`artifacts/qa/portrait/golden-city-composition-before.json` was **overwritten**
by the re-capture in `413b1e9`. A file whose name declares it is the *before*
state must be immutable once written, otherwise a deficit we claim to have
closed can never be re-checked. Git preserves only two versions: `ce30274`
(`0.505078125`, `BASELINE_COLLECTED`) and `413b1e9` (`0.17265625`, `PASS`).
**Rule: `-before` evidence is write-once.**

