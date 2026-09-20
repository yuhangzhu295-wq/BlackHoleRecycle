# BlackHoleRecycle — Next-session handoff

## V4 (current)

Date: 2026-09-20
Local HEAD: `d87d10f`. **Nothing is pushed.**
`git push origin HEAD:main` is **BLOCKED_EXTERNAL_NETWORK** (`CONNECT tunnel failed,
502`; `OpenSSL SSL_read: unexpected eof`; `github.com` returns `000` while
`api.github.com` returns `200`). Retrying is not worth the time until the network
path is restored. All commits are safe locally; `origin/main` is far behind.

### Gate chain state — read this before trusting any PASS

The runner declares **16** scopes. Only these seven were re-run alone on the slot:

| Scope | State | Provenance |
| :--- | :--- | :--- |
| `full` | **PASS** — 375x667 + 390x844 + 430x932, `failures: []` | `BUNDLE_STABLE` `fe685340` |
| `arena-ai` | **PASS** — 180.014 s, `reason: TIME`, all four bot states | `BUNDLE_STABLE` `333e265f` |
| `arena-timer` | **PASS** — 180.0057 s, `reason: TIME`, reward paid | `BUNDLE_STABLE` |
| `golden-city` | **PASS** 31/31 — but `PLAYER_WIDTH_RATIO_MIN` is a *level* reading, see below | `413b1e9`, re-run since |
| `cell-lifecycle` | **PASS** — 375x667 + 390x844 + 430x932, 6/6 checkpoints | `BUNDLE_STABLE` |
| `regions` | **PASS** — all six regions over the 940 m route | `BUNDLE_STABLE` |
| `skins` | **PASS** — home skin switched `skin_classic` → `skin_violet_vortex` | `BUNDLE_STABLE` |

**Do not read that as "the chain is green".** The remaining eight scopes hold
reports from `09-16`–`09-18` that predate both the provenance guard and the fixes
below, so they say nothing about the current build, and **`skin-unlock` has no
report at all** — it drives the full five-level progression plus a paid purchase,
so it is the slowest of the set.

`regions` is resolved (`d87d10f`) but worth reading, because it was misdiagnosed
twice. It was a **live** failure, not a stale one, and the landmark was never
missing: the prefab nests it (`GoldenCityCell → Buildings → ResidentialHouseWest`)
while `getCurrentCellVisualDiagnostics` emits only top-level group names and only
nodes carrying a `MeshRenderer`. The check compared the landmark against that
list, so a nested landmark was structurally invisible. Procedural region cells
still spawn theirs flat, which is why only the first checkpoint failed.

`cell-lifecycle` is the only scope that runs `verifyCellLifecycle` (the other
reports carry `cellLifecycle: null`), so the reload fix below is verified by a
dedicated re-run of that scope — which passes at all three viewports with
`failures: []`, `BUNDLE_STABLE` and `consoleErrors: []`. That same run is the
first clean observation of the now-fatal clobber guard, which correctly stayed
silent.

**`golden-city` is green, but its width check is not stable.** Re-testing the
collectible premise answered it cleanly — `authoredCollectibleSlotTotal: 23`
against `collectibles: 23`, so **nothing is missing** and the "19 of 20" was
purely a live-census artifact — but the same re-run **failed** on
`player width ratio is 0.2192, needs >= 0.22 (short by 0.0008)`. Four runs of
the same build measured `0.2192`, `0.2337`, `0.2622` and `0.2979` with a camera
pose spanning `6e-4` m and a rendered player whose widest span is identical in
both screenshots (`x 154..235`; 11 of 13 sampled scanlines match exactly, and
the two that differ move 5–6 px at the disc's top edge with the ring rotation
phase).

The ratio is the merged `worldBounds` of the machine's **decorative** subtree.
In the two runs that now record `player.contributors`, the fixed body meshes are
identical (`AbyssBase 2.0350`, `HoleInner 1.0360`) while all five decorative
nodes differ — they rotate every frame, and the widest (`HoleRing`) is scaled by
the **gameplay suction radius** (`GameConfig` `2.4/3.4/4.6/6.0/8.0` → ringScale
`1.000–1.380`). The latest run recorded `machineLevel: 1` / `suctionRadius: 2.4`
and measured `0.2337`, so the level is not the whole story either — the premise
run measured `0.2192` on a level-1 machine. **A `golden-city` verdict currently
depends on the animation phase and machine state at the sample instant.**

The consequence is the part that matters: the level-independent body is
`AbyssBase` at `4.07 m`, which reads **`0.2192`** — `0.0008` below the contract
floor. The gate passes only when decoration inflates the number past it.

Two harness changes are committed: the player silhouette now merges only
**drawn** renderers, and the composition and gate record `machineLevel` and
`machineSuctionRadius` beside the ratio. **The remaining gap is a decision, not
a defect** — either pin which node *is* the silhouette, so the check stops
reading whichever decorative mesh happens to be widest, or move the band: a
~0.4–0.7% nudge, i.e. **`coreScale` in `[1.856592, 1.863226]`** (`1.86` is the
clean midpoint: LV1 `0.220404`, LV5 `0.299481`), clears the band at every level,
and the alternative is to lower the floor to the documented 18–23% band. The
window assumes the ratio scales linearly with `coreScale`, which holds for the
two runs whose `player.contributors` are recorded; re-measure both ends before
relying on it.

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

**A stalled build still holds the slot, and it looks idle.** Observed 09-21: the
build task logged `Build with Cocos Creator 3.8.3` and then wrote nothing for
over eight minutes while 6 `CocosCreator.exe` processes stayed resident — the
launcher was alive, the slot was occupied, and the builder log sat at 3 lines.
A healthy build finishes in **25–60 s** and grows that log to ~400–520 lines /
80 KB. The trigger was environmental, not a project defect: the editor logged
`Request failed with status code 400` from `apiQueryExtensionList` and
`failed to connect login server due to request timeout`, `github.com` was
unreachable, and a `git push` hung for 12 minutes — after the network recovered,
the same command built in 25 s. So **retry rather than debug**, and clear a
confirmed stall with `taskkill /F /IM CocosCreator.exe`.

Two traps when diagnosing this, both hit: `find <dir> -newermt "-3 minutes"`
returned the same count minutes apart and reads as "still building", and
sorting mtimes by `%TH:%TM:%TS` is lexicographic, so `23:59` outranks `00:33`.
Use `find . -printf '%T@ %p\n' | sort -rn`. `buildCocosWebMobile` now bounds the
wait itself (`BHR_COCOS_BUILD_TIMEOUT_MS`, default 15 min) and kills the process
**tree** on expiry, so a stall fails loudly instead of hanging forever.

Reports carry `bundleProvenance {status, start, end, comparisonWindow}` and, since
`f39f689`, a clobber **fails the run** (`FAIL_BUNDLE_CLOBBERED`, exit 1). The
promotion waited for its precondition: three scopes re-run alone all reported
`BUNDLE_STABLE` with identical start/end digests. `BUNDLE_UNVERIFIED` is
deliberately non-fatal — a clobber is positive evidence the report is incoherent,
an unverified census is only the absence of evidence.

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
3. **`FAIL_CELL_LIFECYCLE_OPENING_RELOAD` — FIXED** in `f39f689`. The authored
   slot count is not reachable from this snapshot (`getSnapshot().activeCells`
   serializes only live `cell.objects`/`cell.dynamicVehicles`), so the assertion
   now compares the cell's own UNLOAD event against its reload event: the round
   trip must restore at least what it took away and never come back empty, which
   is what `populateAuthoredContent`/`populateAuthoredTraffic` actually
   guarantee. A pickup can no longer break it; an empty reload still fails it.
4. **The ROAD divergence is now a contract assertion** — see
   `scripts/test_open_ground_instrument_divergence_contract.mjs` in
   `test:contracts`. Mutation-tested, not assumed: removing ROAD from the probe's
   occupants makes it exit 1. Unifying the two instruments fails
   `LARGE_EMPTY_GROUND_MAX` at **0.858**, which is why they must stay different.
5. **`largeEmptyGroundRatio` drifts** ≤0.010 against a 0.077 margin because
   COLLECTIBLE/VEHICLE/COMPETITOR count as occupants. Quantified residual; the
   proven fix (exclude those three → 0.1828) is deliberately deferred because it
   invalidates committed evidence for a 0.010 gain.
6. **Arena duplicate-reward coverage still open.** The "bots do not move" half of
   this gap is **closed** — the bot-movement gate added in `9fa1c1f` did exactly
   its job and caught the `BOT_TELEPORT_CLAMP_METERS` `ReferenceError` in
   `arena-ai`. No scope yet asserts the TIME path cannot pay a reward twice.
7. **Golden City requirement 1 is PARTIAL.** The band predicate is *intersects*,
   not *contains*, so three of four buildings are only partly on screen, and the
   "~13 m band" has no code predicate at all.
8. **`progression` and `skin-unlock` were both blocked by one field swap — fixed,
   `skin-unlock` verified PASS.** `23906d0` (`09-18 23:51`) changed the collectible id from
   `cluster_<DISTRICT>_<clusterId>_…` to `cluster_<clusterId>_<DISTRICT>_…`, and
   two checks in `verifyFiveLevelProgression` still filter the district as a
   **prefix** (`cluster_WAREHOUSE_`, `cluster_DOWNTOWN_`). Neither can match a
   cluster that exists, so `skin-unlock` failed
   `FAIL_FULL_PROGRESSION_NO_ELIGIBLE_WAREHOUSE` with `BUNDLE_STABLE` and no
   console errors — a live failure that was not a product defect. Measured on the
   failing report's 216 objects: the old predicate matched **0**, the new one
   matches **28**, **21** of them eligible. `isDistrictCluster` now matches the
   district as its own segment. `progression` calls the same helper, and its PASS
   is dated `09-16`–`09-18` — *before* the rename — which is why it reads green
   while being broken. Both failure messages were dumping `objects`, the whole
   nine-cell world at ~80 KB, and now report cluster/idle/tier counts instead.
   Same class as the region landmark defect: an assertion keyed to a generated
   name that later changed.
9. **The same commit also outgrew the stage budget — fixed.** With the prefix
   repaired, `skin-unlock` got past that gate and failed later at
   `FAIL_FULL_PROGRESSION_LEVEL_3`: 11140 of 15000 mass after **exactly** the 38
   absorbs that `6.3 s × 240 s` allows, so it was budget-limited, not blocked.
   The ledger closes exactly — 19 `battery` (T1, 80) + 19 `paint_bucket` (T2, 300)
   predicts 7220 against 7285 observed — so no mass was lost. Two stale
   assumptions: the flat 240 s budget (`bfd4afc`, `09-05`) predates `23906d0`'s
   re-weighting to `T1:50 T2:25 T3:15 T4:8 T5:2` (mean mass 65 / 294 / 1162 /
   6667 / 33500, so 81% of the world's mass is T4/T5 and unedible at `maxTier` 2),
   and nearest-first targeting ping-pongs on whatever respawns beside the machine
   because `COLLECTIBLE_RESPAWN_DELAY_SECONDS` is 4 s against a 6.3 s round trip.
   The stage now ends on a **stall** (120 s with no mass progress) under a 900 s
   ceiling, and targets are ordered **heaviest edible tier first, then nearest**
   with an explicit 60 s drive timeout. The ladder itself is fine — the `09-16`
   report absorbed 226 objects across five levels — so this is a harness budget
   that the world outgrew, not a product regression. Guarded by
   `PROGRESSION_STAGE_BUDGET_TRACKS_PROGRESS`, mutation-checked against three
   fixed-clock shapes.
10. **The T5 absorption check was passing on a moving target — fixed.** Past the
   budget gate, `skin-unlock` cleared all three stages, reached the city and found
   a valid T5 `cluster_alley-boxes_DOWNTOWN_0_-16_3` (`container`, tier 5, `IDLE`)
   — then failed `FAIL_FULL_PROGRESSION_T5_ABSORPTION` with `absorbedTiers[5]`
   stuck at 6. `CompressibleObject` only promotes ATTRACTED → SUCKING below
   **0.6 m**, and `SUCTION_TIER_PROFILES[5]` is `{pullResistance: 3.6,
   suckDuration: 3.2}`; the check drove to an arrival radius of
   `suctionRadius * 0.62` = **4.96 m** at LV.5 and waited **1500 ms**. It passed on
   `09-16` only because that day's nearest T5 was a moving `car` that drove into
   the core by itself — a static `container` never closes the gap. The drive now
   enters the core at 0.45 m (as the opening T1 loop already documents for this
   exact reason), with `allowMiss` because the target is ATTRACTED and creeping,
   and traces `absorbedTiers[5]` for up to 12 s instead of sampling once. Worth a
   sweep: any other check that drives to a T4/T5 target with a
   `suctionRadius * 0.62` radius has the same latent flake.

**Result.** After all three fixes, `skin-unlock` is **PASS** at `390x844` with
`failures: []`, `consoleErrors: []` and `BUNDLE_STABLE` (`09-21 01:31`). The
targeting change is legible in the report: level 3 ate `cardboard_box` x17 +
`trash_bag` x17 (T2) instead of ping-ponging on the 80-mass battery, level 4 ate
`chair`/`small_table` (T3), level 5 ate `crate`/`shelf`/`sofa` (T4) — each stage
taking the heaviest tier its `maxTier` allowed — and the terminal T5 was the same
static `container` that had failed before. `progression` still needs its own
re-run: it shares `verifyFiveLevelProgression` and its PASS is dated `09-16`.
11. **Residual harness risks, not yet fixed.** The opening T1→T2 loop still uses
   a flat 60 s budget (`592a985`, `09-16`) to earn 900 mass from T1 clusters
   averaging 65 mass, which is roughly 88 s of driving at the measured 6.3 s per
   absorb; it passes today on short trips and passive suction, but it is the same
   fixed-clock shape as item 9. `collectUntil`'s per-target drives still use
   `max(1.0, suctionRadius * 0.62)` and therefore also rely on coasting past a
   target to cross the 0.6 m SUCKING gate rather than driving into it; stages 3–5
   passed this way, so it was left alone rather than changed without evidence.

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
