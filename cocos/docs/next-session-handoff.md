# BlackHoleRecycle — Next-session handoff

## V4 (current)

Date: 2026-09-20
Local HEAD: `aff8867` plus uncommitted working-tree changes. **Nothing is pushed.**
`git push origin HEAD:main` is **BLOCKED_EXTERNAL_NETWORK** (`CONNECT tunnel failed,
502`; `OpenSSL SSL_read: unexpected eof`; `github.com` returns `000` while
`api.github.com` returns `200`). Retrying is not worth the time until the network
path is restored. All commits are safe locally; `origin/main` is far behind.

### Gate chain state — read this before trusting any PASS

| Scope | State |
| :--- | :--- |
| `golden-city` | **PASS** 31/31, `deficits: []`. Evidence committed `413b1e9`. Solid. |
| `full` | **PASS** — 375x667 + 390x844 + 430x932, `failures: []`, `BUNDLE_STABLE`. |
| `arena-ai` | **PASS** — 180.014 s, `reason: TIME`, all four bot states, `BUNDLE_STABLE`. |
| `arena-timer` | **PASS** — 180.0057 s, `reason: TIME`, reward paid, `BUNDLE_STABLE`. |

All four were re-run alone on the slot and each reported `BUNDLE_STABLE` with
identical start/end digests. The chain is green as of `718fa16`.

`arena-ai` and `arena-timer` previously read PASS and were **not**. Three lanes
built concurrently; a Cocos build **deletes `cocos/build/web-mobile` wholesale and
rewrites it**, so a verification running during another lane's build 404s for the
whole rebuild window. The signature is the same eight URLs returning **404
consistently for 45 s** and existing again 10 s later. Every `FAIL_PORTRAIT_BOOT`
in this chain had that cause and **none was a product defect**.

Separately, `arena-ai` failed for a **real** reason once it ran alone:
`BOT_TELEPORT_CLAMP_METERS is not defined`. `page.evaluate` serializes its
callback into the browser, so it cannot close over a Node-side constant; the
throw fired every frame inside the rAF loop, emptied the telemetry, and then
reported a misleading "bots do not move". Fixed in `edcc8fd`. **`tsc --checkJs`
cannot catch this class** — the name is in scope in the JS file.

### The one operational rule that matters

**`cocos/build/web-mobile` is a single serial resource.** Every
`npm run acceptance:v2 -- --scope=X` rebuilds it unconditionally
(`buildCocosWebMobile()`, no skip switch). Run **exactly one** scope at a time and
let it finish. Before launching, check the mtimes of
`cocos/build/web-mobile/index.html` and `.scratch/*.log`; if either moved in the
last 3 minutes, someone else is mid-run. A build that is progressing **deletes**
`index.html`, so its absence is progress, not failure.
`scripts/capture_v4_design_evidence.mjs` is safe to run in parallel — it never
spawns a build and binds an ephemeral port.

Reports now carry `bundleProvenance {status, start, end, comparisonWindow}` and
warn on `BUNDLE_CLOBBERED`. It is **report-only** on purpose (exit code
unchanged); make it fatal once a clean run has been observed to report
`BUNDLE_STABLE`, since no observation yet separates a true positive from a false
one.

### Open items, in priority order

1. **Golden City requirement 3 is NOT MET.** The brief said "add the 1 missing
   visible collectible". **No collectible was ever added** — the 19 → 23 movement
   is a measurement redefinition by `7744f91`. The original "19 of 20" was itself
   a live-census reading, so the premise may simply have been wrong. Decide
   whether we owe a content fix or a correction of the record. The user should be
   asked.
2. **`golden-city-composition-before.json` was overwritten** by the re-capture in
   `413b1e9`, destroying the baseline. Only `ce30274` (`0.505078125`) survives in
   git; the brief's `0.34` exists **only as prose**. Make `-before` evidence
   write-once.
3. **`FAIL_CELL_LIFECYCLE_OPENING_RELOAD`** compares live-vs-live
   (`test_cocos_portrait_acceptance.mjs:2419` ← `InfiniteWorldManager.ts:1447`,
   against `recordCellLifecycle` at `:1597`). Same category error as `7744f91`.
   Fix by comparing against the authored slot count.
4. **Assert the ROAD divergence in a contract test.**
   `estimateEmptyGround` must keep ROAD as an occupant; `computeScreenSpaceBudget`
   must not. Unifying them fails `LARGE_EMPTY_GROUND_MAX` at **0.858**. Today this
   is protected only by a comment.
5. **`largeEmptyGroundRatio` drifts** ≤0.010 against a 0.077 margin because
   COLLECTIBLE/VEHICLE/COMPETITOR count as occupants. Quantified residual; the
   proven fix (exclude those three → 0.1828) is deliberately deferred because it
   invalidates committed evidence for a 0.010 gain.
6. **Arena Final gaps** (arena-audit, TaskList #13): no scope asserts that bots
   actually move, and the TIME path has no duplicate-reward coverage.
7. **Golden City requirement 1 is PARTIAL.** The band predicate is *intersects*,
   not *contains*, so three of four buildings are only partly on screen, and the
   "~13 m band" has no code predicate at all.

---

# Historical — V2 handoff (2026-09-06)

Superseded by the V4 section above; kept for the still-open V2 blockers
(visual parity, online arena deployment, ByteDance AppID, editor Console check).

Date: 2026-09-06
Baseline before this session: `f9e6db3599b2fdbf70e7eec9da34da2d2182a163` (`feat: make arena rewards idempotent per match`)

## Completed in this session

- Tightened the gameplay camera to a 44° vertical FOV with a 20m/18.5m follow offset. The 390×844 runtime report measures the player at about 19.9% of viewport width.
- Added a native Cocos camera viewport lock for wide desktop previews. It centers a portrait viewport and keeps 3D terrain out of the side bars while preserving the full portrait frame on phone-sized views.
- Added two audited Creator-imported commercial-building landmarks to the opening foreground without blocking the central suction lane.
- Updated `current-product-audit.md` with the camera verification and current gate state.

## Evidence already observed

- `npm run typecheck:cocos`: exit 0, 0 TypeScript errors.
- `npm run test:cocos`: exit 0, 6/6 source-level regression checks passed.
- `npm run acceptance:v2 -- --scope=full`: PASS at 375×667, 390×844, and 430×932; failures 0; browser console errors 0. The run covered eight-direction touch movement, 500m cardinal travel with origin rebasing, dynamic-road turns, T1 lock → LV2 → T2 intake, and local-arena revive/settlement.
- Latest full report camera values: FOV 44°, offset `(0, 20, 18.5)`, player viewport width `0.1987137576` (~19.9%).
- Infinite-world traversal passed north/south/west/east 500m checks with cell rebases.
- `npm run build:all`: Web Mobile, WeChat Game, and ByteDance Mini Game packages built successfully. WeChat uses configured AppID `wx6ac3f5090a6b99c5`; ByteDance still uses placeholder `testappId`.
- Computer Use browser preview showed the real Home → Mode → Endless flow, a real drag moved the machine, and browser `dev.logs({levels:['error']})` returned `[]`.

## Open issues / blockers

1. Visual parity is **PARTIAL**. The five V2 pages follow the reference hierarchy, layout language, and interaction flow, but the repository’s audited low-poly art and UI are not pixel-identical to the bespoke reference illustrations and textures.
2. Online Human Arena is **not release-ready**. A local Colyseus authority and Cocos probe are working, but public TLS `wss://`, production matchmaking/account storage, and server-side account anti-replay still need deployment and owner credentials.
3. ByteDance release is blocked by placeholder AppID `testappId`. WeChat and ByteDance device/developer-tool evidence is still pending.
4. Native Cocos Creator Console red-error status was not auto-verifiable this session because the Computer Use capture of the Creator window timed out. Browser runtime console evidence is clean; the editor Console must still be checked manually.
5. The working tree contains unrelated Cocos-generated `.meta` changes, imported bulldozer prefab files, `textures/ui.meta`, and generated `cocos/docs/evidence/v2/`. These are intentionally not part of this sync commit.

## Recommended next session order

1. Open the project in Cocos Creator 3.8.3 and manually confirm the Console has no red errors or Missing Script messages.
2. Decide whether to commission/import richer bespoke V2 art or accept the current structural visual match.
3. Supply a real ByteDance AppID, deploy a public TLS WebSocket endpoint, then run WeChat/ByteDance device checks.
4. Run `npm run preflight:release` and the final acceptance suite after those owner-owned blockers are resolved.

## Gate truth

- `STATUS: IN_PROGRESS`
- `NEXT_PHASE_ALLOWED (NO)` — visual match remains partial and release/native/device blockers are unresolved.
