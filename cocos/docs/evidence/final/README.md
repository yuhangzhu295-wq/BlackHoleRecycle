# V4 RC — final acceptance evidence

Curated 2026-09-27 from `artifacts/qa/portrait/`, which is gitignored. This
directory is the committed home for product-level evidence.

**Every report below was produced on the same source.** The last change to
`cocos/assets/**` was `2026-09-27 02:43:19` (local, commit `37f766a`), and the
sixteen runs span `2026-09-27 03:01`–`04:39` (local), so the reports and the
source describe one build.

## Gate chain — 16/16 PASS

| scope | status | failures | consoleErrors | provenance | digest | files | run (local) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `pages` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `21785f1f` | 199 | 03:01 |
| `ui-full-flow` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `8fed9d5f` | 199 | 03:10 |
| `arena` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `c40c2c39` | 199 | 03:11 |
| `save-resume` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `a5cc321f` | 199 | 03:12 |
| `regions` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `8c15dbd3` | 199 | 03:17 |
| `golden-city` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `b498cb85` | 199 | 03:33 |
| `full` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `51fe5c08` | 199 | 03:54 |
| `revive` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `9de96072` | 199 | 03:57 |
| `settlement` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `e98ffeb8` | 199 | 03:58 |
| `arena-timer` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `ab4dc122` | 199 | 04:02 |
| `arena-ai` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `8f375fb6` | 199 | 04:06 |
| `network` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `29421979` | 199 | 04:07 |
| `progression` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `e4397aea` | 199 | 04:21 |
| `cell-lifecycle` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `91c2c098` | 199 | 04:26 |
| `skins` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `3a3e0441` | 199 | 04:27 |
| `skin-unlock` | **PASS** | 0 | 0 | `BUNDLE_STABLE` | `b015f934` | 199 | 04:39 |

A verdict is only credible when `status === "PASS"`, `failures` and
`consoleErrors` are empty, and `bundleProvenance.status` is `BUNDLE_STABLE` with
identical start and end census digests. **Exit codes are not evidence**, and a
stale PASS is indistinguishable from a current one in this directory — always
check the digest and the run time together.

## Additional gates on the same source

- `npm run typecheck:cocos` — **PASS** (exit 0).
- `npm run test:full` — **PASS** (test:cocos + test:contracts + test:authoring).
- `npm run test:perf` — **PASS**, evidence completeness only: endless sustained
  travel at 66.1 fps, average frame 15.12 ms, p95 29.9 ms, no console errors.
- `npm run audit:object-art` — **PASS** (23 runtime bindings / 56 world-art
  kinds, zero primitive-fallback violations).
- `npm run acceptance:p0b` — **PASS** (23 collectibles, 2 clusters, 5 vehicles,
  no duplicates, no console errors).

## Platform builds

`npm run build:web`, `npm run build:wx` and `npm run build:tt` — status **PASS**:

| platform | files | AppID | libVersion |
| :--- | :--- | :--- | :--- |
| `web-mobile` | 199 | not-applicable | n/a |
| `wechatgame` | 203 | `wx6ac3f5090a6b99c5` (configured) | `widelyUsed` |
| `bytedance-mini-game` | 202 | `testappId` (placeholder) | `widelyUsed` |

The Douyin build now emits a valid `libVersion`:
`cocos/build-templates/bytedance-mini-game/project.config.json` was added in
`75fc395`. Before that commit the Douyin build failed with `libVersion undefined`.

`npm run preflight:release` — status **FAIL**:

- `wechatgame`: **PASS** — real AppID configured.
- `bytedance-mini-game`: **FAIL** — `bytedance-mini-game requires a real AppID for release preflight; found testappId.`

That failure is an **owner-owned blocker, not a code defect**: the Douyin build
still carries the Creator placeholder. Supply a real AppID and re-run
`npm run preflight:release`.

## WeChat release track — separate, blocked on owner decision

`npm run build:wx` succeeds and the subpackage split is intact
(`subpackages = [world-construction, world-city]`, `boot = world-city`), but the
main package is **10,631 KB against the WeChat 4,096 KB limit**. This is a
pre-existing release-track item, not a UI regression: see
`cocos/docs/release/WECHAT_SUBPACKAGE_PLAN.md` and the owner-approved
separate-engine feasibility in commit `8d98672`. Low-risk trim candidates are
recorded in `cocos/docs/release/wechat-package-audit.json`.

## Also in this directory

- `golden-city-composition-before.json` — the one-shot baseline. **Write-once: never re-capture it over the top.** The brief's `0.34` exists only as prose.
- `golden-city-gate.json` — the Golden City gate verdict and its deficits.
- `p0b-runtime-evidence.json` — the P0-B runtime probe.
- `*.png` — the runtime screenshots each scope names in its own report.

## How to re-verify

```bash
# one scope at a time: cocos/build/web-mobile is a single serial resource
npm run acceptance:v2 -- --scope=<scope>
```

Reports land in `artifacts/qa/portrait/` (gitignored); copy the ones you want to
keep here with `cp -p` so the run times survive. The browser launch passes
`--no-proxy-server`, so the chain no longer depends on the shell environment.
