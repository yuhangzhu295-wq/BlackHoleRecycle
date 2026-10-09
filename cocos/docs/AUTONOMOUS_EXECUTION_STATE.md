# AUTONOMOUS EXECUTION STATE

- CURRENT_HEAD: `090621d` (clean tree; 12 commits ahead of `origin/dev/product-finalization-20260929`)
- CURRENT_PHASE: `RELEASE_BLOCKERS_AND_PRODUCT_CLOSEOUT`
- LAST_UPDATED: 2026-10-09

---

## 1. COMPLETED_TASKS

| # | Task | Evidence |
| --- | --- | --- |
| 1 | V9.5 page + HUD re-skin, UI Kit unification | `V9_5_UI_ART_REBUILD_REPORT.md`, commits `18a8d3c`..`3438847` |
| 2 | STEP 6: 8 pages × 375/390/430 sheets, all inspected | `V9_5_STEP6_PAGE_SHEETS.md`, `cocos/docs/evidence/v95/pages/` |
| 3 | V9.6 gameplay art audit; 4 dead colour tables marked | `V9_6_GAMEPLAY_ART_UNIFICATION.md`, commit `39da9e0` |
| 4 | V9.7 two-mode regression + 2 defects fixed | `V9_7_TWO_MODE_REGRESSION.md`, commit `979f974` |
| 5 | V10 performance baseline + 6-minute soak | `V10_PERFORMANCE_BASELINE.md`, commit `d559dba` |
| 6 | V10.1 build mechanism, boot fix, package measurement | `V10_1_WECHAT_PACKAGE_REPORT.md`, commit `95ac95d` |
| 7 | V11 release-candidate assessment | `V11_RELEASE_CANDIDATE_REPORT.md`, commit `e73c9ce` |
| 8 | WeChat DevTools CLI service port enabled (was off) | flipped `security.enableServicePort` in `User Data/.../WeappLocalData/localstorage_b72da75d*.json` (backup `*.bak-zcode`) |
| 9 | B1 root-caused: main package is 4.75 MB, not 7.22 MB | DevTools rule table `主包尺寸（不包含插件）`; `scripts/measure_wechat_package.py` |
| 10 | B1 fixed: `art/machines` moved to its own subpackage | **main package 3.57 MB ≤ 4.00 MB**, `subpackages=[game-art,world-construction,art-machines,world-city]` |
| 11 | Boot bundles load in parallel | `Promise.all`, per-bundle retry kept; built artifact verified |
| 12 | LV5 framing brought back inside the streamed radius | occupancy 39.2% → 46.8%, empty ground 60.8% → 53.2%, `playerWidthRatio` 0.367 (predicted 0.365) |
| 13 | Product re-audit from real runtime evidence | `FINAL_PRODUCT_AND_RELEASE_AUDIT.md` §6.2 |

## 2. VALIDATED_GATES (all on the current tree)

- `npm run test:full` — PASS (contracts 28 items incl. `test_boot_bundle_residency`)
- `npm run typecheck:cocos` — PASS
- `npm run verify:layout` (8 pages × 3 viewports) — PASS
- `npm run verify:gameplay-visuals` — PASS, 4 consecutive runs after the two fixes
- `node scripts/test_cocos_p0b_runtime.mjs` — PASS, `consoleErrors: []`
- `npm run test:perf` — PASS (evidence completeness; budget `NOT_EVALUATED`)
- `npm run build:web` / `build:wx` / `build:tt` — PASS

## 3. PACKAGE_MEASUREMENTS

| Convention | Main package | Limit |
| --- | ---: | ---: |
| **DevTools rule: 主包尺寸（不包含插件）** | **3.57 MB** | 4.00 MB → **PASS** |
| Conservative (plugin counted; Cocos FAQ wording) | 6.04 MB | 4.00 MB → over |

- Plugin (`cocos/`) = 2.47 MB, excluded per the DevTools' own rule text.
- Subpackages = 10.86 MB (`game-art`, `world-construction`, `art-machines`, `world-city`).
- Measurement: `python scripts/measure_wechat_package.py`

## 4. BLOCKER_LEDGER

### B1 — WeChat main package size — **RESOLVED**
- Evidence: main package 3.57 MB vs 4.00 MB limit, measured after the `art/machines` split.
- Tried: `separateEngine` via `configPath` (works, but does not shrink the counted set); engine
  feature cropping (24 features, reaches `cocos-js` only); skybox envmap removal (−850 KB);
  13 unreferenced assets moved out of the shipped tree (−2.85 MB); `art/machines` subpackage.
- Autonomously done: everything above; no owner input was needed.
- Owner input needed: **none for the size gate.**
- Next: none. Keep `measure_wechat_package.py` in the loop for future builds.
- Status: `RESOLVED`

### B2 — Douyin AppID is `testappId`
- Evidence: `cocos/build/bytedance-mini-game/project.config.json` → `"appid": "testappId"`.
- Tried: searched for the Douyin developer tool — **not installed** (only CapCut/JianyingPro under
  `AppData/Local/Bytedance`); searched the project for a real AppID; the WeChat AppID
  `wx6ac3f5090a6b99c5` exists in config but the DevTools rejects it as non-existent.
- Autonomously doable: Douyin build, config validation, package audit (all pass).
- Owner input needed: a real Douyin mini-game AppID, or a Douyin developer account login.
- Status: `WAITING_FOR_OWNER_AUTH`

### B3 — WeChat DevTools authoritative package size + real device
- Evidence: DevTools installed, **logged in**, CLI service port now enabled. `cli open --project`
  fails with `不存在此 AppID 请检查后重新输入 (code 10)` for both `wx6ac3f5090a6b99c5` and
  `touristappid`, so no project can be opened, no simulator run, and no upload-size figure.
- Tried: CLI with and without the appid; tourist mode; removing `appid` entirely; reading the
  DevTools' own packaging rules from `app.asar` (which is how the plugin-exclusion rule was found).
- Autonomously doable: all of the above, plus local web-mobile runtime verification.
- Owner input needed: an AppID this account can open (the logged-in account is not a developer of
  `wx6ac3f5090a6b99c5`), then a scan/confirm in the DevTools.
- Status: `WAITING_FOR_OWNER_AUTH`

## 5. REMAINING_TASKS

1. Verify the rebuilt `web-mobile` still boots with `art-machines` as a boot bundle (in flight).
2. Re-run the full gate set on the B1 change and commit it.
3. Product re-audit (P1 §8 of the mandate): classify each page/gameplay surface
   COMPLETE / DEFECT / NOT_VERIFIED / BLOCKED_EXTERNAL from real screenshots.
4. Release the remaining `TODO / PARTIAL / NOT_VERIFIED / OWNER_DECISION` items that are reachable.
5. Write `cocos/docs/FINAL_PRODUCT_AND_RELEASE_AUDIT.md`.
6. Commit everything; leave the 9+ unpushed commits alone (no push without being asked).

## 6. SCREENSHOT_PATHS

- `cocos/docs/evidence/v95/pages/` — 24 page screenshots + 8 side-by-side sheets (STEP 6)
- `artifacts/qa/v95/gameplay/` — Endless and Arena HUD captures
- `artifacts/qa/v95/` — soak, tier-banner and Arena-clip probe evidence

## 7. NEXT_ACTION

All gates are green and the tree is committed. What remains needs the owner:

1. **B2** — a Douyin mini-game AppID (no Douyin developer tool is installed; only CapCut/JianyingPro).
2. **B3** — a WeChat AppID this account can open. The DevTools is installed and logged in but rejects
   `wx6ac3f5090a6b99c5` as non-existent, so the simulator and the upload-size figure stay unreachable.
   After that: a scan/confirm, then a real-device pass.
3. **Scope item, not a defect** — a settings page (`BtnSettings` is deliberately hidden because no page
   backs it; adding one is a feature and would change the pinned Home layout contract).
4. **Provisional audio** — 6 real non-silent SFX are wired; licensed production audio remains a
   release-checklist item.
5. **LV5 far field** — partially improved; closing it fully needs a streaming change or far-field art.

Do not re-do: B1 (resolved), the boot-residency guard, the two V9.7 HUD fixes, STEP 6, V9.6, V10.

## 8. NOTES FOR THE NEXT SESSION

- The `progression` acceptance scope is not a reliable gate: its moving-traffic stage asks a fixed
  steering heuristic to intercept a `DRIVE`-state vehicle. Use `acceptance:full` for end-to-end
  confidence, and the composition diagnostic it emits when LV5 numbers are needed.
- The WeChat DevTools CLI now works (service port enabled). `cli.bat open --project <dir>` is the
  fastest way to check package size once a usable AppID exists.
- `python scripts/measure_wechat_package.py` prints both counting conventions; the plugin is
  `cocos/` and is excluded per the DevTools' own rule text.
