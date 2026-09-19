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
| `golden-city` | **FAIL** | `acceptance-report-golden-city.json` |

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
- `golden-city`: `FAIL_GOLDEN_CITY_COMPOSITION_GATE`, 4 unmet thresholds
  against `design-contracts/golden-city-composition.json`:
  `buildings 2 < 4`, `collectibles 19 < 20`,
  `largeEmptyGroundRatio 0.3406 > 0.25`, and the required `hospital`
  semantic is absent.

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

### Golden City remains an open content gap, not a test defect

`FAIL_GOLDEN_CITY_COMPOSITION_GATE` predates this work:

- The assertion was introduced by `855b637 test(golden-city): enforce portrait
  composition gate`, not by the V4 set.
- The committed `evidence/v2/portrait/acceptance-report-golden-city.json` is
  `status: BASELINE_COLLECTED` with `failures: []` — it only collected numbers.
- `v2-master-audit.md` already tracks it as open P0 **D-005** with the same
  `buildings 2` baseline, and its gate table reads
  `Golden City | NOT ESTABLISHED | PENDING_EVIDENCE`.
- The cell improved substantially against that baseline (trees 0→12, POI→14,
  vehicles 1→5, competitors 7, collectibles 3→19, empty ground 0.75→0.34) but
  is still short of the contract.

Closing it needs an authoring pass on `GoldenCityCell.prefab` (more buildings,
a hospital/clinic, less empty ground). The `hospital` mapping exists in the
gate (`/Clinic|Hospital/` over visible names); the cell simply has no such
building.

### Operational note: Creator CLI builds hang intermittently

2 of 4 builds stalled immediately after `Build with Cocos Creator 3.8.3` with
no further output and no writes anywhere under `cocos/temp`, `cocos/library` or
`cocos/build/web-mobile`, while 6 `CocosCreator.exe` processes stayed alive. In
both cases the stall followed a scope that had just **failed**. Diagnose with
the last line of `cocos/temp/builder/log/web-mobile<date>.log` plus
`find <dir> -type f -newermt "-3 minutes"`; do **not** rely on the npm log
mtime, which is static for the whole build because output is buffered. Clear it
with `taskkill /F /IM CocosCreator.exe`.

