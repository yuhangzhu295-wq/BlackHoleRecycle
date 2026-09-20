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

| Scope | Result | Evidence |
| :--- | :--- | :--- |
| `full` | **PASS** (375x667 + 390x844) | `acceptance-report-full.json` |
| `arena-ai` | **PASS** | `acceptance-report-arena-ai.json` |
| `arena-timer` | **PASS** | `acceptance-report-arena-timer.json` |
| `golden-city` | **PASS** | `acceptance-report-golden-city.json` |

`verifyArenaAiRuntime` and `collectGoldenCityBaseline` are each reachable from
only one scope, so `--scope=full` does **not** substitute for them.

### Measured results

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
  (0.22–0.30), player screen-Y ratio 0.5728 (0.50–0.67), viewport 390x844,
  devicePixelRatio 1, and all 12 required semantics present including
  `hospital`. Evidence: `evidence/v2/portrait/golden-city-gate.json`
  (`verdict: PASS`) plus the composition and screenshot beside it.
  `PLAYER_WIDTH_RATIO_MAX` is the tightest check at 0.00065 of headroom, but
  the ratio scales as 1/distance from a camera that is now sampled only after
  it settles, so it is deterministic rather than flaky.
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

### Operational note: Creator CLI builds hang intermittently

2 of 4 builds stalled immediately after `Build with Cocos Creator 3.8.3` with
no further output and no writes anywhere under `cocos/temp`, `cocos/library` or
`cocos/build/web-mobile`, while 6 `CocosCreator.exe` processes stayed alive. In
both cases the stall followed a scope that had just **failed**. Diagnose with
the last line of `cocos/temp/builder/log/web-mobile<date>.log` plus
`find <dir> -type f -newermt "-3 minutes"`; do **not** rely on the npm log
mtime, which is static for the whole build because output is buffered. Clear it
with `taskkill /F /IM CocosCreator.exe`.

