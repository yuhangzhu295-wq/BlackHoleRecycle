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

The runner declares **16** scopes. All sixteen were re-run alone on the slot on
`09-21` and carry `bundleProvenance`. No scope still holds a stale report, and
none fails: the last one to be repaired (`save-resume`) turned out to be a real
product defect rather than a stale pass — see below.

| Scope | State | Provenance | Report |
| :--- | :--- | :--- | :--- |
| `full` | **PASS** — 375x667 + 390x844 + 430x932, `failures: []` | `BUNDLE_STABLE` `c42a45eb` | `09-21 19:20` |
| `pages` | **PASS** — pause → resume → settle by real touch, `finalScreen: "Settlement"` | `BUNDLE_STABLE` `65c0d14b` | `09-21 19:22` |
| `arena` | **PASS** — 3 viewports + live match: 8 competitors, leaderboard, bot `COLLECT`/`FLEE`, shields | `BUNDLE_STABLE` `41f49e80` | `09-21 19:23` |
| `arena-ai` | **PASS** — real 180 s match, all four bot states | `BUNDLE_STABLE` `0baecc71` | `09-21 19:28` |
| `revive` | **PASS** — `failures: []`, `consoleErrors: []` | `BUNDLE_STABLE` `978a7d1b` | `09-21 19:29` |
| `settlement` | **PASS** — `failures: []`, `consoleErrors: []` | `BUNDLE_STABLE` `4b68a184` | `09-21 19:31` |
| `ui-full-flow` | **PASS** — `failures: []`, `consoleErrors: []` | `BUNDLE_STABLE` `6e066e00` | `09-21 19:32` |
| `skins` | **PASS** — home skin switched `skin_classic` → `skin_violet_vortex`, locked tap at 0 coins | `BUNDLE_STABLE` `950aa440` | `09-21 19:33` |
| `skin-unlock` | **PASS** — LV1→LV5 by real touch, then a paid unlock; T5 `container` absorbed | `BUNDLE_STABLE` `41daa2b5` | `09-21 19:45` |
| `arena-timer` | **PASS** — 180.0057 s, `reason: TIME`, reward paid | `BUNDLE_STABLE` `fe24f269` | `09-21 19:50` |
| `network` | **PASS** — Colyseus room, 8 players / 17 pickups, reconnect | `BUNDLE_STABLE` `310970c2` | `09-21 19:51` |
| `regions` | **PASS** — all six regions over the 940 m route | `BUNDLE_STABLE` `c9aa5158` | `09-21 19:55` |
| `progression` | **PASS** — same five-level route through the shared helper; T5 `container` absorbed | `BUNDLE_STABLE` `45bbea19` | `09-21 20:07` |
| `cell-lifecycle` | **PASS** — 375x667 + 390x844 + 430x932, 6/6 checkpoints | `BUNDLE_STABLE` `911fcb0f` | `09-21 20:13` |
| `golden-city` | **PASS** — 31/31, `deficits: []`; but the width check is unstable, see below | `BUNDLE_STABLE` `551d1f84` | `09-21 20:15` |
| `save-resume` | **PASS** — `preReload.mass 240 == afterReload.mass 240`, no repeat grant | `BUNDLE_STABLE` `b162ac03` | `09-21 19:12` |

**All sixteen scopes were re-run on the current source and all sixteen PASS.**
Every report carries `failures: []`, `consoleErrors: []` and a `BUNDLE_STABLE`
provenance whose start and end digests match, at 187 files. The last change to
`cocos/assets/**` was `09-21 19:10:47`, and the sixteen runs span `19:12`–`20:15`,
so the reports and the source describe the same build.

### `save-resume`: arena bots were overwriting the player's save (found and fixed `09-21`)

This scope failed on the `09-21` morning build, and the failure was real — not
stale evidence, not the environment, not a flake:

`FAIL_SAVE_RESUME_MASS_MISMATCH: {"preReload":240,"afterReload":295}`, and `320`
on another run. The live machine mass at settlement is always exactly `240`
(`ArenaMatchManager` `START_MASS`), while the persisted `machineMass` was
whatever the last arena **bot** had absorbed. Measured directly, read-only:

```
persistedBeforeReload.machineMass : 320   // before the reload, already 320
persistedAfterReload.machineMass  : 320   // the reload itself is correct
preReload (live machine.currentMass): 240
coins: 3 == 3                             // the coin assertions pass
```

So persistence was not broken — the value being persisted was the wrong actor's.
`saveService` is an app-wide singleton, and `BlackHoleMachine.addMass` /
`applyEvolutionLevel` wrote it unconditionally, with no notion of *which* machine
owns the player's progression. `ArenaMatchManager.ts:511` awards bot mass through
`competitor.machine.addMass(...)`, so **every bot absorb rewrote the player's
save**; `NetworkArenaReplica` did the same for replicated remote players. Because
`setMachineProgression` does `machineLevel = Math.max(data.machineLevel,
nextLevel)`, a bot reaching LV2+ would also have handed the player a free level.

The write was introduced by `6f7de14` (`09-15 12:27`); the bot `addMass` path is
older (`3a530da`, `09-04`). That makes the `09-18` PASS a lucky one: the check
passes only when no bot absorb lands before the harness reads the save.

**Fix (`09-21 19:10`).** `BlackHoleMachine` gained one owner flag,
`persistsProgression`, and every write now goes through a single gate
(`persistProgression()`); `ArenaMatchManager` clears the flag on its seven bots
and `NetworkArenaReplica` clears it on replicated opponents. `onLoad` mirrors the
save through `withoutPersisting(...)`, because a bot is created with
`addComponent`, which runs `onLoad` before its owner can clear the flag. The
`save-resume` scope is itself the regression guard: it fails without the fix.
Verified after the fix — `preReload.mass 240 == afterReload.mass 240`, plus the
coin idempotency assertions (no repeat grant, claimed id preserved).

### Where the evidence lives, and how far release readiness got (`09-21 20:2x`)

The reports themselves are **not** in `artifacts/` (gitignored). They are curated
into `cocos/docs/evidence/final/`, which is the directory `.gitignore` has always
named for product-level evidence, with a `README.md` index that lists every
scope's digest and run time. `golden-city-composition-before.json` is in there
too, and it is **write-once** — do not re-capture over it.

Two release steps were run on the current source:

- `npm run build:all` — **PASS**: `web-mobile` 187 files, `wechatgame` 191 files
  (real AppID `wx6ac3f5090a6b99c5`), `bytedance-mini-game` 190 files (placeholder).
- `npm run preflight:release` — **FAIL**, for an **owner-owned reason, not a code
  defect**: `wechatgame` passes with its configured AppID and
  `bytedance-mini-game requires a real AppID for release preflight; found
  testappId.`

So the gate chain is green, but **the build is not releasable yet**: the Douyin
AppID is still a placeholder, and no WeChat/Douyin developer-tool or on-device
acceptance has been performed. Building is not device acceptance.

Two of the scopes above were verified but went unrecorded for a while, which is its own small
lesson: `pages` passed at `01:49` and `arena` at `02:09`, and the table above
kept listing both as stale until they were counted from the reports rather than
from memory. The scope list is the thing to diff against the report directory,
not against what the last edit happened to mention.

`regions` was the one recorded failure and is now resolved — but only after the
re-run disproved the diagnosis. It failed reproducibly (`BUNDLE_STABLE`,
`consoleErrors: []`), and the guess that `7661123` had superseded it by moving
`ResidentialHouseWest` was **wrong**. See below.

Measured for the eleven verified scopes:

- `full`: `failures: []` across all three viewports; digest `fe685340`.
- `arena-ai`: `reason: TIME` at `elapsedSeconds 180.014`, 8 competitors,
  `stateFrames {COLLECT 47719, ROAM 7310, CHASE 6673, FLEE 1155, EVENT_HUNT 843}`,
  `deathsObserved: 3`, `consoleErrors: []`.
- `arena-timer`: `reason: TIME` at `elapsedSeconds 180.0057`,
  `remainingSeconds 0`, 8 competitors, `eliminationCount 28`, and a real
  `settlementReward {coins 15, survivalCoins 12, placementCoins 3}`,
  `consoleErrors: []`.
- `arena`: `failures: []`, `consoleErrors: []`, `BUNDLE_STABLE` with identical
  start/end digests (`d0022470`, 187 files) across all three viewports — and it
  is not the shallow "the match starts" check its 1m44s runtime suggests. It
  samples six phases of one real match (`local-arena-mua4rh3e-1-ddwmwj`):
  `initial` at 0.897 s (8 competitors, `localRank 6`, all seven bots
  `COLLECT`/`FLEE` under a shared 2.103 s spawn shield); `collected` at 15.398 s
  with `localAlive: false`, `localRespawnSeconds 2.5` and `eliminationCount 1`;
  `hunter`, which *names the killer* — `bot-3` at mass 600 having `consumed: 4`,
  sitting on the origin (0.003, -0.003) where the local player had been;
  `revived` at 15.440 s with `localAlive: true` and the respawn timer back to 0;
  `settled` at 17.235 s with `running: false`, `reason: FORFEIT` and a real
  `settlementReward {coins 4, survivalCoins 1, placementCoins 3}`; and
  `returnMode`, an active 720x1280 overlay. Across those phases the bots pass
  through **all four** states — `COLLECT`, `ROAM`, `CHASE`, `FLEE` — which is the
  behaviour set `arena-ai` then runs out to the full 180 s.
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
- `skins`: `failures: []` at 390x844, `consoleErrors: []`, and the payload is a
  real home-skin selection rather than a page that merely rendered:
  `previousSkinId skin_classic` → `selectedSkinId skin_violet_vortex`, with the
  locked-skin tap exercised at `coinsBeforeLockedTap: 0`. `bundleProvenance` is
  `BUNDLE_STABLE`.
- `skin-unlock`: `failures: []` at 390x844, `consoleErrors: []`, `BUNDLE_STABLE`,
  with the whole ladder driven by real touch and the targeting visible in what it
  chose to eat: level 3 `cardboard_box` x17 + `trash_bag` x17 (T2, 320/350 mass,
  `maxTier` 2) to reach 15235; level 4 `chair` x6 + `small_table` x5 (T3,
  950/1400, `maxTier` 3) to reach 56035; level 5 `crate` x6 + `shelf` x5 + `sofa`
  x1 (T4, 5500-8000, `maxTier` 4) to reach 183350. The terminal city asset was a
  static   `container` (`cluster_alley-boxes_DOWNTOWN_0_-16_3`), and the
  `CompressionSystem` reached all five states with `resourceBlockCount` 190.
- `progression`: `failures: []` at 390x844, `consoleErrors: []`, `BUNDLE_STABLE`,
  and it reproduces `skin-unlock`'s profile through the same helper rather than
  merely agreeing with it: level 3 `trash_bag` x32 + `cardboard_box` x1 to reach
  15405, level 4 `chair` x6 + `small_table` x5 to reach 56885, level 5 `crate` x6
  + `shelf` x5 + `sofa` x1 to reach 198915, and the same terminal
  `cluster_alley-boxes_DOWNTOWN_0_-16_3` `container`. Two independent runs
  agreeing on both the tier choice per level and the terminal asset is what
  separates a fixed gate from a gate that happened to pass once.
- `pages`: `failures: []`, `consoleErrors: []`, `BUNDLE_STABLE`, with the flow
  driven by three real taps — pause at (346.9, 109.5), resume at (195, 393.0),
  settle at (195, 484.0) — to `finalScreen: "Settlement"`. Its 390x844 viewport
  reports `designIsPortrait`, `frameIsPortrait`, `viewportIsPortrait` and
  `viewportWithinFrame` all true, with a measured `frameRatio` 0.4620 against a
  `targetRatio` of 0.5625. This is the UI counterpart to the runtime scopes: it
  asserts the screens a player actually reaches, not that they drew.

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
body-only reading is `0.2192` and misses the floor by `0.0008`. The ratio scales
linearly with `coreScale` (every member of the merged subtree is a child of
`coreNode`, which carries the x/z scale), so the feasible window is exactly
**`coreScale` in `[1.856592, 1.863226]`** — a 0.36% window. Below it the LV1
reading stays under `0.22`; above it the LV5 reading crosses `0.30`. The clean
midpoint is **`1.86`**, giving LV1 `0.220404` and LV5 `0.299481`. The
alternative is to lower the floor to the documented 18–23% readability band.
The contract is `LOCKED` and the value is player-facing, so nothing was changed
here, and the window assumes linearity — it should be re-measured with
`player.contributors` present at both ends before it is relied on.

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

**Amended again (09-21), with a measurement and a ruled-out cause.** A stall is
not confined to builds that follow a failure: the one observed here followed
`golden-city` **passing** minutes earlier, so the earlier "follows a scope that
had just failed" correlation does not hold. Two things were measured rather than
inferred:

- **The signature, quantified.** A healthy build of this project finishes in
  **25–60 s** and grows `cocos/temp/builder/log/web-mobile<date>.log` to roughly
  **400–520 lines / 80 KB**. The stalled build sat at **3 lines / 1710 bytes**
  from `00:33:03` onward while nothing under `cocos/` was written for over eight
  minutes and 6 `CocosCreator.exe` processes stayed resident. `index.html` was
  still the *previous* run's file, which is the trap: the slot looks occupied by
  a build that has in fact stopped.
- **The cause is not the two messages this section previously blamed.** An
  earlier version named the network, on the evidence that the editor logged
  `Request failed with status code 400` from `apiQueryExtensionList` and
  `failed to connect login server due to request timeout` immediately before the
  stall. Both are now **ruled out**, because `report.build` keeps the editor
  console for *every* run, not only failing ones — so the healthy side of the
  comparison exists. The 400 appears in **four passing** reports (`arena-timer`,
  `golden-city`, `progression`, `skin-unlock`) and the login-server message in
  **seven** (`arena-ai`, `cell-lifecycle`, `full`, `pages`, `regions`, `revive`,
  `skins`). Eleven of the fifteen reports carry one or the other and all fifteen
  pass, so neither message distinguishes a stall from a healthy build. They are
  startup noise from the editor's update and login checks, which fail routinely
  in this environment and do not stop the build.
- **What is actually measured is the rate.** The signature is exact — the log
  freezes at **1710 bytes** with `Build with Cocos Creator 3.8.3` as its last
  line, *before* the first `onBeforeBuild` hook runs (`cocos-service` at 7 ms,
  `scene` at 0 ms, `black-hole-home-builder` at 2 ms, then `Start lock asset db`
  ten seconds later, in a healthy log). Across **697 builds over three days**,
  **11 stalled** — 2% overall, but 3 of the ~12 on 09-21 alone. Every stall has
  been recovered by a retry, so treat it as environmental and re-run rather than
  debug — but bound the wait, because the runner used to wait on `close`
  forever.

**Two diagnostic traps, both hit while establishing the above.** The documented
`find <dir> -type f -newermt "-3 minutes"` is unreliable here: it returned the
same count on two checks several minutes apart, which reads as "still building".
Sort by epoch instead — `find . -printf '%T@ %p\n' | sort -rn` — and note that
sorting by `%TH:%TM:%TS` is **wrong**, because it is lexicographic and puts
`23:59` ahead of `00:33`. Both mistakes point the same way: they make a dead
build look alive.

**Now bounded in code.** `buildCocosWebMobile` applies
`BHR_COCOS_BUILD_TIMEOUT_MS` (default 15 min) and on expiry kills the **process
tree** with `taskkill /PID <pid> /T /F`, then fails naming the builder log. The
tree matters: killing only the launcher leaves the other editor processes
holding the project and breaks the next run too. The kill path was verified
against a real spawned tree — timer fired, launcher gone, `node.exe` count back
to baseline, no orphan.

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

### `FAIL_FULL_PROGRESSION_NO_ELIGIBLE_WAREHOUSE` — a field swap, and two scopes keyed to the old order

This is the **same class of defect as the region landmark above** — an assertion
keyed to a generated name that later changed — and it is the reason `skin-unlock`
could not pass. `23906d0` (`09-18 23:51`, "refine collectible distribution
cadence") rewrote the collectible id in `ChunkConfig.ts` and **swapped the two
leading fields**:

| | generated id |
| :--- | :--- |
| before `23906d0` | `cluster_<DISTRICT>_<clusterId>_<cellX>_<cellZ>_<n>` |
| after `23906d0` | `cluster_<clusterId>_<DISTRICT>_<cellX>_<cellZ>_<n>` |

Two progression checks filter on the district as a **prefix**:

```js
String(object.runtimeId || '').startsWith('cluster_WAREHOUSE_')   // stages 3-5
String(object.runtimeId || '').startsWith('cluster_DOWNTOWN_')    // the city T5 target
```

After the swap the district is the *second* field, so neither can ever match a
cluster that exists. Both came from `d9da039` (`09-05`) and were never updated.
The counts are not ambiguous — measured against the 216 objects in the failing
report, the old predicate matched **0**, and matching the district as its own
segment matches **28**, of which **21** are eligible (`IDLE`, `tier <= maxTier`).
The clusters were in the world the whole time; the check simply could not name
them.

The last passing `progression` report proves the same thing from the other side.
It is dated **`09-16 18:27`**, before the rename, and every target it actually
absorbed carries the old field order:

| stage | absorbed target in the `09-16` report |
| :--- | :--- |
| level 3 warehouse | `cluster_WAREHOUSE_container-yard_0_-4_3` |
| level 4 supermarket | `cluster_SUPERMARKET_parking-recycling_0_-7_7` |
| level 5 parking | `cluster_PARKING_parking-corner_0_-10_18` |
| city T5 | `cluster_DOWNTOWN_taxi-stand_0_-16_19`, `type: car` |

Every one of those matches `startsWith('cluster_<DISTRICT>_')` and none matches
after the swap. That row also confirms the T5 check's premise directly: the T5
target was a `car` from the `taxi-stand` cluster, and `car` is `ObjectTier.T5` —
so keeping the cluster requirement while fixing the prefix is the faithful repair
rather than a loosening.

**Two scopes, one cause.** `verifyFiveLevelProgression` is called by both
`progression` (line 3504) and `skin-unlock` (line 3581), so both were broken by
the same commit. `progression`'s report is dated `09-16`–`09-18`, i.e. **before**
`23906d0`, which is exactly why it reads PASS: it passed under the old naming and
was never re-run afterwards. That is the trap this document keeps hitting — a
stale PASS and a currently-passing scope look identical in the report directory.

`isClusterOfDistrict(runtimeId, district)` now matches the district as its own
segment. Cluster ids are lowercase and hyphenated (`pallet-boxes`, `loading-bay`,
`shelf-spill`, `container-yard`), so an uppercase district cannot collide with
one. Both failure messages were also trimmed the same way as the landmark one:
each dumped `objects`, the whole nine-cell streamed world at about 80 KB, and
each now reports the counts that actually answer the question — how many clusters
the district has, how many are idle, which tiers they carry.

**Checked for a third instance and found none.** The other name-keyed assertions
in the runner were each verified against the current generators:
`traffic_${coord.x}_${coord.z}_${visualKind}` still produces `traffic_0_0_…`, and
`FourWayRoad` / `MainCrossroad`, `Ground` and `tile-low` all still exist in the
source or the prefab. `FourWayRoad` is deliberately kept alongside its rename so
an older probe build stays diagnosable.

### The stage budget was set before the world got thinner (`23906d0`)

Fixing the prefix let `skin-unlock` past that gate, and it then failed **later**
and for a different reason: `FAIL_FULL_PROGRESSION_LEVEL_3`. That is progress, not
a second naming bug, and the mass ledger says so exactly.

The machine absorbed 38 objects in the stage's 240 s: 19 `battery` (T1, 80 mass)
and 19 `paint_bucket` (T2, 300). Predicted **7220**, observed **7285** — a 65-mass
gap, i.e. one small object caught by passive suction. Mass is fully conserved
through the `CompressionSystem` buffer, so nothing was leaking or being dropped;
the run simply ran out of clock. It needed 11145 mass, reached 11140, and the loop
did **exactly** the 38 absorbs that `6.3 s × 240 s` allows.

Two harness assumptions had gone stale together, and `23906d0` is why:

| commit | date | what it fixed in place |
| :--- | :--- | :--- |
| `bfd4afc` | `09-05 18:53` | the flat 240 s stage budget |
| `592a985` | `09-16 03:06` | the 60 s opening budget |
| `23906d0` | `09-18 23:51` | re-weighted placement to `T1:50 T2:25 T3:15 T4:8 T5:2` |

Under those weights the world's mass is `81%` T4/T5 (mean mass `65 / 294 / 1162 /
6667 / 33500` for T1..T5), but at level 2 the machine's `maxTier` is T2 — so the
`900 → 15000` step has to be ground out on items averaging about **106 mass**
while every T3 cluster (mean 1162) sits visibly out of reach. That is a design
choice, not a defect: the `09-16` report absorbed 226 objects across five levels,
so the ladder is completable. What was wrong is that a **fixed wall clock** was
trying to cover a cost that the same commit had multiplied by roughly five.

The second stale assumption was the targeting. Nearest-first ping-pongs on
whatever respawns beside the machine, because `COLLECTIBLE_RESPAWN_DELAY_SECONDS`
is **4 s** — shorter than one 6.3 s round trip — so the same T1 `battery` and the
same T2 `paint_bucket` came back forever while 21 eligible clusters existed. Both
are now addressed:

- the stage ends on a **stall** (no mass progress for 120 s), with a 900 s ceiling
  so a genuinely wedged run still terminates, instead of a flat 240 s;
- targets are ordered **heaviest edible tier first, then nearest** — tier is the
  mass proxy the snapshot actually carries, since `QABridge` projects only
  `runtimeId / type / tier / state / x / z / lockVisible` — with an explicit 60 s
  drive timeout, because tier-first can legitimately pick a cluster in an adjacent
  cell and the default 30 s would abort that trip as `FAIL_VERTICAL_SLICE_ROUTE_`.

The failure message was trimmed here too. `machine: latest.machine` dragged in
`visualMaterials`, dozens of renderer entries, which is why the original
`LEVEL_3` message ran to tens of kilobytes; it now reports the level, mass,
deficit, elapsed time, stall time and the absorbed mix by type.

`test_collectible_production_contract.mjs` gained a third guard for this class.
`PROGRESSION_STAGE_BUDGET_TRACKS_PROGRESS` asserts on the stage loop's **exit
condition** — not its body, since the body also mentions `lastProgressAt` when it
records progress, which is exactly the false-negative a first attempt at this
guard had. Mutation-checked against three shapes: the pre-fix fixed clock, a
ceiling with the stall term dropped, and a condition missing the level term. All
three are caught; the real source passes.

### The T5 absorption check was passing on a moving target (`skin-unlock`)

With the budget fixed, `skin-unlock` cleared the warehouse, supermarket and
parking stages, drove to the city and **found** a valid T5 target —
`cluster_alley-boxes_DOWNTOWN_0_-16_3`, type `container`, tier 5, `IDLE`. It then
failed to absorb it: `absorbedTiers[5]` stayed at **6**.

The FSM explains it exactly. `CompressibleObject` only promotes a target from
ATTRACTED to SUCKING on proximity:

```
else if (Math.sqrt(distSq) < 0.6) this.transitionTo('SUCKING');
```

and `SUCTION_TIER_PROFILES[5]` is `{ pullResistance: 3.6, suckDuration: 3.2 }`, so
a T5 also needs **3.2 s** of SUCKING after that. The check drove with an arrival
radius of `max(1.5, suctionRadius * 0.62)` — **4.96 m at LV.5**, eight times the
0.6 m gate — and then waited only **1500 ms**, under half the suck.

It had been passing on `09-16` because the nearest T5 that day was a `car`: a
dynamic vehicle that drives into the machine's core on its own. A static
`container` (radius 4.5, the slowest `pullResistance`) never closes the gap, so
the flake surfaced the first time the nearest T5 happened to be static. The
opening T1 loop already documents this exact requirement — *"the production FSM
only switches ATTRACTED -> SUCKING below 0.6 m … finish the physical route inside
that core"* — the T5 check simply never followed it.

The drive now goes into the core at 0.45 m, with `allowMiss` set because the
target is ATTRACTED and creeping toward the machine while the machine drives at
its last known point, and the check then traces `absorbedTiers[5]` for up to
12 s rather than sampling once. The claim being asserted is the absorption, not
the route.

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

