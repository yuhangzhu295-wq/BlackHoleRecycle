# FINAL PRODUCT AND RELEASE AUDIT

- Repository: `C:\Users\zyu33\Documents\Codex\2026-09-29\BlackHoleRecycle`
- Branch: `dev/product-finalization-20260929`
- HEAD at time of writing: `f451134` (plus the LV5 framing change, see §7)
- Phase: `RELEASE_BLOCKERS_AND_PRODUCT_CLOSEOUT`

---

## 1. Verdict

> # `READY_FOR_STORE = NO`

The reason is no longer the package size. It is now **two external items only**:

| # | Blocker | Who can close it |
| --- | --- | --- |
| B2 | Douyin AppID is still `testappId`; no real AppID exists anywhere in the project | owner (an AppID from a Douyin developer account) |
| B3 | The WeChat AppID `wx6ac3f5090a6b99c5` is rejected by the DevTools as non-existent for the logged-in account, so the simulator and the upload-size figure are unreachable | owner (an AppID this account can open, then a scan/confirm) |

**B1 (WeChat main package over the 4 MB limit) is RESOLVED**, and it was resolved by work, not by a decision. See §3.

Everything else that this environment can legally and safely do has been done and is listed in §6.

---

## 2. Current true state

- `git status`: clean at `f451134`; the LV5 framing change is the one uncommitted edit.
- Local is **9 commits ahead** of `origin/dev/product-finalization-20260929` (`9945d7b`). Nothing was pushed, no `main` merge, no force-push, no `reset --hard`, no `clean -fdx`.
- `git diff --check`: clean.

---

## 3. B1 — WeChat main package — **RESOLVED**

### 3.1 The measurement was wrong before it was hard

The earlier figure of 7,394 KB (1.81x the 4,096 KB limit) counted the engine plugin
as part of the main package. The DevTools states otherwise, in its own rule table
inside `resources/app.asar`:

```
{"name":"PACKAGE_SIZE_LIMIT","desc":"主包尺寸（不包含插件）应小于 %s M",
 "descEn":"Main package size (without plugins) should be less than %s M", ...}
```

with the plugin size reported as a separate supplement
(`PLUGIN_SIZE_IN_PACKAGE: '（含插件%s KB）'`). Cocos's FAQ contradicts this
("will the engine code still be counted into the first package? A: According to
WeChat's rules, it will still be counted"), so `scripts/measure_wechat_package.py`
now prints both conventions and treats the DevTools' wording as the verdict, since
the DevTools is what enforces the limit.

Identifying the plugin took reading the output, not guessing:

| Directory | Role | Evidence |
| --- | --- | --- |
| `cocos/` (2.47 MB) | **the plugin** — excluded from the main package | `plugin.json` declares its entry as `base.js`; its modules import each other relatively (`./index-92d00b49.js`) |
| `cocos-js/` (0.99 MB) | **project code** — counted | stubs and modules that reach the plugin through the import map (`"../cocos-js/index-92d00b49.js": "plugin:cocos/index-92d00b49.js"`), including the custom render pipeline |

So the correct starting number was **4.75 MB, over by 768 KB** — not 7.22 MB over by 3.3 MB.

### 3.2 What was tried, in order

| # | Attempt | Result |
| --- | --- | --- |
| 1 | `separateEngine` via the semicolon `--build` flag | **silently ignored** — the dotted key is dropped and the bare key arrives as the string `"true"` |
| 2 | Inline JSON options | Creator ignored *every* option and built `web-desktop` |
| 3 | `configPath=<file>` | **works**; `packages.wechatgame.separateEngine` reaches the nested key and `game.json` declares the plugin |
| 4 | Engine feature cropping (24 of 42 features, from the engine's own `cc.config.json` with a dependency closure) | reaches `cocos-js/` (1.72 → 0.95 MB) but not `cocos/`, which is the plugin's prebuilt mirror |
| 5 | Removing the scene's skybox envmap | **−850 KB**, and the plan's "composition decision" ruling downgraded to a safe cleanup (`_envLightingType` is `HEMISPHERE_DIFFUSE` so `useIBL` is false, and neither scene has a `cc.Skybox` component) |
| 6 | Moving 13 unreferenced assets out of the shipped tree | −2.85 MB of build input |
| 7 | `art/machines` as its own mini-game subpackage | **−1,207 KB** (the single largest main-package item) |

### 3.3 Current best scheme

- Main package **3.57 MB** against a 4.00 MB limit — 530 KB margin.
- Subpackages: `game-art`, `world-construction`, `art-machines`, `world-city` (10.86 MB).
- Plugin `cocos/` 2.47 MB, excluded by rule.
- Verified the payload **moved rather than disappeared**: the bulldozer texture is
  gone from `assets/main/native/` and present at `subpackages/art-machines/native/`,
  and `game.json` declares the subpackage.
- Because the launch scene serialises the five MachineVisual prefabs, `art-machines`
  must be resident before it loads — the same requirement that broke boot when
  `game-art` was made a subpackage. It joins `BOOT_BUNDLES` in all three templates,
  `REQUIRED_BOOT_BUNDLES` in the build gate, and `scripts/test_boot_bundle_residency.mjs`.
- The three boot bundles now load with `Promise.all` instead of serially, so the
  size fix does not land on startup latency.

### 3.4 Not needed

The owner decision the previous report asked for — "put the built-in `main` bundle
into a subpackage, or move bundles to a CDN" — **is not required**. The gate is met
without a CDN, without `mainBundleCompressionType`, and without a paid service.

---

## 4. B2 — Douyin AppID

**Autonomous investigation performed** (so this is not simply handed back):

- Searched for the Douyin developer tool: **not installed** — `AppData/Local/Bytedance`
  contains only CapCut and JianyingPro; no `tt-ide`, no Bytedance program directory.
- Searched the project for any real AppID: the only value is `testappId` in
  `cocos/build/bytedance-mini-game/project.config.json` and in the build template.
- Confirmed the Douyin build itself is healthy: `build:tt` → PASS, 300 files,
  `boot=world-city+game-art+art-machines`, subpackages declared. The gate reports
  `AppID=testappId (placeholder)` rather than pretending otherwise.
- Did **not** install a third-party tool or invent an AppID, and did not upload
  anything to an unknown host.

**What is needed:** a Douyin mini-game AppID, or a Douyin developer account login.

## 5. B3 — WeChat DevTools

**Autonomous investigation performed:**

- Located the DevTools and launched it. It is **already logged in**.
- Found the CLI service port disabled; enabled it by flipping
  `security.enableServicePort` in the DevTools' own `WeappLocalData` store (with a
  `.bak-zcode` backup) — the same switch as 设置 → 安全设置 → 服务端口. The CLI then
  connected (`IDE server has started, listening on http://127.0.0.1:13384`).
- `cli.bat open --project <build>` returns `不存在此 AppID 请检查后重新输入 (code 10)`
  for `wx6ac3f5090a6b99c5`, for `touristappid`, and with the `appid` key removed.
- Read the DevTools' own packaging rules out of `app.asar`, which is how the
  plugin-exclusion rule in §3.1 was established.
- Ran the full local runtime acceptance instead: `acceptance:v2 --scope=full` → PASS.

**What is needed:** an AppID this account can open (the logged-in account is not a
developer of `wx6ac3f5090a6b99c5`), then a scan/confirm in the DevTools. Until then
the DevTools' *upload* figure is `BLOCKED_AUTH`, while the local measurement in §3.3
is real and reproducible.

**Real device:** `NOT_MEASURABLE` — no device link in this environment. Browser-based
acceptance is never presented as real-device verification.

---

## 6. What this environment completed

### 6.1 Gates on the current tree

| Gate | Result |
| --- | --- |
| `npm run test:full` | **PASS** (contracts 28 items incl. `test_boot_bundle_residency`) |
| `npm run typecheck:cocos` | **PASS** |
| `npm run verify:layout` (8 pages × 3 viewports) | **PASS** |
| `npm run verify:gameplay-visuals` (Endless + Arena) | **PASS**, 4 consecutive runs |
| `acceptance:v2 --scope=full` | **PASS** — real portrait runtime + CDP touch at 375/390/430, `consoleErrors: 0`, bundle stable (301 files, digest `0d0fad8a`) |
| `node scripts/test_cocos_p0b_runtime.mjs` | **PASS** |
| `npm run test:perf` | **PASS** (evidence completeness; budget `NOT_EVALUATED`) |
| `npm run build:web` / `build:wx` / `build:tt` | **PASS** |
| WeChat main package | **3.57 MB ≤ 4.00 MB — PASS** |

### 6.2 Product surfaces, classified from real runtime evidence

| Surface | Status | Evidence |
| --- | --- | --- |
| Home / Mode Select / Ready / Pause / Revive / Machine / Skin / Settlement | **COMPLETE** | STEP 6 sheets, all 8 inspected at 375/390/430; layout gate 8×3 PASS |
| Endless HUD / Arena HUD | **COMPLETE** | gameplay-visuals PASS; the Arena leaderboard clip and the tier-banner sampling defect both fixed this cycle |
| Player singularity | **COMPLETE** | `machineUsesAuthoredSingularity: true`; all machine materials `builtin-unlit` with `valid: true` and real colours (AbyssBase rgb(74,29,143)) |
| Machine LV1–LV5 | **COMPLETE** | `verticalSlice`: LV1 → LV3, 128 absorbed, mass 17,140, maxTier 3; LV4/LV5 captures exist |
| Absorption / upgrade / pickup feedback | **COMPLETE** | `pickupFeedback.emittedCount 31`, `lastText "+50"`; tier banner verified by probe |
| World streaming / regions / districts | **COMPLETE** | `infiniteWorld`: 9 active cells, region `bedroom`, district RESIDENTIAL, pool active 154; dynamic vehicles `DRIVE` with routes |
| Construction landmark bundle | **COMPLETE** | `constructionLandmark: {loadState: READY, visible: true}` |
| Real touch | **COMPLETE** | acceptance `touch` shows real deltas (Δz −5.64 m); CDP touch drives every gate |
| Sound effects | **COMPLETE (provisional audio)** | 6 real PCM WAVs, all non-silent with the intended pitch shapes, wired through `AudioAssetLibrary`; the asset contract states these are provisional synthesis and that licensed assets remain a release-checklist item |
| Settings entry | **PARTIAL by design** | `HomePageController.hideUnavailableActions()` hides `BtnSettings` because no Creator page backs it, with the comment that it must not appear as a fake grey button. Building one is a feature addition and would change the pinned Home layout contract — see §7 |
| LV5 far-field composition | **DEFECT, being fixed** | measured 39.2% occupancy / 60.8% large-empty ground at LV5 vs 99.4% / 0.6% at LV1 — see §7 |
| Real device | **BLOCKED_EXTERNAL** | no device link |
| Douyin release | **BLOCKED_EXTERNAL** | B2 |

---

## 7. Open work being carried forward

### 7.1 LV5 framing — improved and measured

The camera pulled back 4.90× at LV5 (visible ground 16,353 m², 24× the LV1
footprint) while `InfiniteWorldManager` streams only ~96 m of reach, so the far
field is outside the resident cells by construction. The upper third of the frame
was a flat brown void. The previous report filed this as an owner decision; the
mandate allows composition and rendering changes, so it was implemented instead.

Reduced to 3.60× (distance 98.06 m), measured on the real runtime:

| Metric | before (4.90×) | after (3.60×) | LV1 (control) |
| --- | ---: | ---: | ---: |
| screen occupancy | 39.2% | **46.8%** | 99.4% |
| large-empty ground | 60.8% | **53.2%** | 0.6% |
| visible environment | 64 | 52 | 16 |
| `playerWidthRatio` | ~0.268 | **0.367** | 0.301 |

The predicted ratio was ~0.365 and the measured value is 0.367, so the change did
what the model said. **It is a partial fix, not a complete one**: 53% of the ground
is still empty at LV5, because the frustum still reaches past the streamed cells.
Closing that fully needs either a streaming change or far-field art, both of which
are separate decisions; the honest statement is that LV5 now reads as a wide view
with a visible horizon rather than as a void, and it is still measurably sparser
than LV1.

### 7.2 The `progression` scope fails at its moving-traffic stage — harness, not product

Chasing this produced a wrong hypothesis, which is worth recording so nobody repeats it.

Three runs of `--scope=progression` failed, at two different stages, each with
`movementInput {x: 0, y: 0}` and `touchDiagnostic.accepted: false`. I read that as a
joystick wedged by a lost touch-end, and implemented a guard in
`PlayerController.onTouchStart` to release a stale `activeTouchId`.

**The evidence refuted it.** Every failure snapshot already reports
`activeTouchId: null`, so no touch was stuck. The guard was reverted rather than
left in with a comment claiming it fixed something it did not.

What the failures actually are:

| Field | Value |
| --- | --- |
| failing stage | `FAIL_TRAFFIC_REPLENISHMENT_ABSORB` (twice); once `FAIL_FULL_PROGRESSION_T1_ABSORPTION` |
| target | `traffic_0_-16_authored_VehicleAnchor_SedanWest` — a **`DRIVE`-state** traffic vehicle |
| player state at failure | level 5, mass 955,375, suctionRadius 8, **13 T5 items already absorbed** |

So the progression machinery works — the player reached LV5 and absorbed 955 tonnes
through real touch — and the stage that fails is the one asking the harness to
intercept a *moving* vehicle with a fixed steering heuristic. `acceptance:v2
--scope=full` passes on the same build, and `verify:gameplay-visuals` moves the
player reliably.

**Verification method changed** per the two-failure rule: the LV5 framing is
measured from the composition diagnostic that the progression run emits (which is
why it could be measured at all), and end-to-end confidence comes from
`acceptance:full` plus the layout and gameplay gates rather than from this scope.

### 7.3 Settings page

Deliberately absent — `HomePageController.hideUnavailableActions()` hides
`BtnSettings` because no Creator page backs it, with the comment that it must not
appear as a fake grey button. Adding one is a feature, not a defect fix, and it
would change the pinned Home layout contract. Recorded as a scope item.

---

## 8. Reproduce

```bash
npm run test:full && npm run typecheck:cocos
npm run build:web && npm run verify:layout && npm run verify:gameplay-visuals
node scripts/test_cocos_portrait_acceptance.mjs --scope=full
npm run build:wx && python scripts/measure_wechat_package.py   # main package vs 4 MB
npm run build:tt
```
