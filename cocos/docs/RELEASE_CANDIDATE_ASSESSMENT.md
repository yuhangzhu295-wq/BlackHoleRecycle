# Release Candidate Assessment — PHASE 11

Date: 2026-09-22. Repository `C:\Users\zyu33\Documents\Codex\2026-08-28\ji`, branch `main`,
HEAD `7d286f4`.

**Verdict: `CONSOLE_ERRORS = 0` is CONFIRMED. `RELEASE_CANDIDATE` is NOT DECLARABLE.**
Five blockers remain, and one of them is a hard platform limit that no code change can
resolve on its own.

---

## 1. Gate 1 — `CONSOLE_ERRORS = 0` — **CONFIRMED**

Read from the 16 acceptance reports in `artifacts/qa/portrait/`, not from exit codes:

| Quantity | Result |
| :--- | :--- |
| reports scanned | 16 |
| total `consoleErrors` | **0** |
| total `failures` | **0** |
| reports not `PASS` | **0** |

Every report also carries `bundleProvenance.status = BUNDLE_STABLE` with identical
start/end `censusDigest` and 187 files, so each describes the bundle it was run against.

**Gate 1 passes.**

---

## 2. Gate 2 — `RELEASE_CANDIDATE` — **NOT DECLARABLE**

### Blocker 1 — WeChat main package is 4.2× over the platform limit (hard)

| Quantity | Value |
| :--- | :--- |
| `cocos/build/wechatgame/` total | **17,063 KB** |
| WeChat main-package limit | 4,096 KB |
| `game.json` keys | `deviceOrientation`, `networkTimeout` — **only** |
| `subpackages` field present | **no** |

With no `subpackages` declared, the whole 17,063 KB counts against the main package.
Byte breakdown from the earlier audit: `assets/` 12,558 KB (main 6,760 + resources 5,193
+ internal 605), `cocos-js/` 4,079 KB, `src/` 253 KB. `assets/resources` (5,193 KB) is the
natural subpackage candidate.

This is **not** a code defect and cannot be fixed by editing source alone — it needs a
subpackage split decision (which bundles move, and whether first-frame content survives
the split). **Owner decision.**

### Blocker 2 — ByteDance AppID is still the placeholder

`cocos/build/bytedance-mini-game/project.config.json` → `appid: testappId`.
WeChat is genuinely configured (`wx6ac3f5090a6b99c5`), ByteDance is not.
`npm run preflight:release` runs with `--require-release-ids` and **will reject this by
design**. The committed platform report already records it honestly:
`bytedance-mini-game … releaseIdStatus: placeholder`.

**Owner-supplied value.**

### Blocker 3 — no public `wss://` endpoint

The arena's network path is exercised against a loopback relay (`127.0.0.1:25784`).
Production needs a real TLS endpoint. **Owner/infra decision.**

### Blocker 4 — device acceptance not performed

No WeChat or ByteDance developer-tool run, no physical-device run. A green gate chain is
**not** device acceptance, and the repository's own README says so. This assessment does
not claim otherwise.

### Blocker 5 — PHASE 7 is `BLOCKED`

The UI design lock cannot be reached: the two lock authorities disagree, the V2 `home`
reference is superseded and contains features the V4 lock forbids, and
`independent_subgate_results` is unobtainable without an independent reviewer. See
`cocos/docs/UI_DESIGN_AUDIT.md`.

---

## 3. Platform build evidence — an overwrite I caused, and its restoration

**What happened.** The PHASE 0 baseline command `npm run build:web` runs
`scripts/verify_cocos_minigame_builds.mjs`, which writes its report to a **committed**
evidence path. It replaced
`cocos/docs/evidence/final/platform/mini-build-report.json` with a web-mobile-only record:

| | `requestedPlatform` | Rows recorded |
| :--- | :--- | :--- |
| HEAD (`4e5afb4`) | `all` | web-mobile 187 `not-applicable`; **wechatgame 191 `configured`**; **bytedance-mini-game 190 `placeholder`** |
| after my PHASE 0 run | `web-mobile` | web-mobile 187 only — **the other two rows were gone** |

**Restoration.** Backed up to `.scratch/platform-report-backup/mini-build-report.web-mobile-only.json`
and restored with `git checkout --`. Verified: `requestedPlatform: all`, all three rows
back, and `git status` for that directory is clean.

**Why it is recorded here rather than quietly fixed.** This is the second instance of the
same hazard class in this repository — a verification script whose report path points into
committed evidence. It will recur on the next `build:web` / `build:all` / `preflight:release`
run. The durable fix is to make the script default its output under `artifacts/` and write
to `docs/evidence/` only when explicitly asked, mirroring how the acceptance harness already
behaves (`test_cocos_portrait_acceptance.mjs:21-26`). **Not changed here** — it is a change
to a release script and belongs with the owner.

---

## 4. Model routing

**`EXPLICIT_MODEL_ROUTING_UNAVAILABLE`**

The mandate specifies a six-role routing (Team Lead / QA-Evidence / Main Developer /
Code Reviewer / UI-Product / Escalation). This environment exposes no model-selection
control, so the roles could not be assigned as specified. No claim is made about which
model performed which step, because no such mapping exists to report.

---

## 5. Phase status roll-up

| Phase | Status | Basis |
| :--- | :--- | :--- |
| 0 BASELINE | done | `BASELINE_STATUS`; platform evidence restored (§3) |
| 1 ENDLESS FULL FLOW | PASS | 16/16 scopes, 0 failures |
| 2 ARENA FULL FLOW | PASS | `arena` + `full`: 180 s match, 8 competitors, settle, revive, return |
| 3 GAMEPLAY QUALITY | PASS | `progression` absorption timing; `resourceReplenishment` full object FSM |
| 4 SPATIAL COMPOSITION | PASS | `golden-city` gate green after the `7d286f4` fix |
| 5 ASSET AUDIT | done | `cocos/docs/assets/GAMEPLAY_ASSET_AUDIT.md` |
| 6 RENDER AUDIT | done | `cocos/docs/assets/RENDER_AUDIT.md` |
| 7 UI DESIGN AUDIT | **BLOCKED** | `cocos/docs/UI_DESIGN_AUDIT.md` §5 |
| 8 DYNAMIC WORLD | done | `cocos/docs/DYNAMIC_WORLD_AUDIT.md` — 9/11 states verified |
| 9 PERFORMANCE | done | runner false-PASS defect fixed; 3/3 scenarios; density tiers reported unreachable |
| 10 FULL E2E | **`FULL_E2E_PASS`** | `acceptance-report-full.json`: PASS, `failures: []`, `consoleErrors: []`, `BUNDLE_STABLE` |
| 11 RC | **NOT_DECLARABLE** | five blockers above |

---

## 6. What this assessment does not claim

- Not that the product is release-ready. Five blockers are open, one of them a hard
  platform limit.
- Not device acceptance (§2, Blocker 4).
- Not that PHASE 7's visual lock is satisfied (§2, Blocker 5).
- Not that the 30/60/100 density tiers were measured — they are unreachable and are
  reported as such in `cocos/docs/evidence/s11/s11-performance-evidence.json`.
