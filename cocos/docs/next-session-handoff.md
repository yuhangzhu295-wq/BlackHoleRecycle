# BlackHoleRecycle — Next-session handoff

## V4 (current)

Date: 2026-09-21 (V4 RC wrap-up)
Push state: **not pushed.** `origin/main` is at `6b14ce6`; local `main` is ahead
of it. Run `git log --oneline origin/main..main` to see exactly what is pending.

**This file deliberately names no local SHA.** Committing this file changes
`HEAD`, so any SHA written here is stale the instant it is committed — that is
precisely how this line drifted twice, once reading "Nothing is pushed" and once
reading `d87d10f / Pushed` while `HEAD` was actually `6b14ce6`. Trust `git log -1`.

The session that wrote this added three commits: the save-progression fix
(`fix(save)`), the QA proxy fix plus evidence curation (`test(qa)`), and this
handoff correction (`docs(handoff)`).

Historical note, kept because the diagnosis was correct at the time:
`git push origin HEAD:main` was **BLOCKED_EXTERNAL_NETWORK** (`CONNECT tunnel failed,
502`; `OpenSSL SSL_read: unexpected eof`; `github.com` returns `000` while
`api.github.com` returns `200`). All commits were safe locally while that lasted.

### Gate chain state — read this before trusting any PASS

The runner declares **16** scopes, and **all sixteen now hold a PASS produced on
the current source.** The last change to `cocos/assets/**` was `09-21 19:10:47`
and the runs span `19:12`–`20:15`, so no report predates the fixes described
below.

**This file no longer duplicates the verdict table.** Read the authoritative
copies instead: `cocos/docs/final-acceptance-matrix.md` for the per-scope detail,
and `cocos/docs/evidence/final/README.md` for the curated reports with each
digest and run time. The copy that used to live here drifted badly — it still
claimed eight scopes were stale and that `skin-unlock` had no report at all, long
after both had passed.

**Do not read "16/16" as "the chain is green" in the release sense.** Two things
still stand between this and a release, and neither is a code defect: the Douyin
build carries the Creator placeholder AppID so `preflight:release` fails, and no
WeChat or Douyin developer-tool or on-device acceptance has been run.

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
launcher was alive, the slot was occupied, and the builder log sat at 3 lines /
**1710 bytes**, frozen *before* the first `onBeforeBuild` hook — a healthy log
runs `cocos-service` (7 ms), `scene` (0 ms) and `black-hole-home-builder` (2 ms)
at that point, then `Start lock asset db` ten seconds later.
A healthy build finishes in **25–60 s** and grows that log to ~400–520 lines /
80 KB. The trigger is **not** the two messages once blamed for it: `report.build`
keeps the editor console for every run. Measured across the current sixteen
reports on `09-21`, the `400`-status noise from the editor's own network calls
appears in **all sixteen** and the login-server message appears in **none**, so
neither distinguishes a stall from a healthy build. (This paragraph used to name
four and seven reports respectively — those counts came from the pre-fix report
set and no longer describe anything on disk.) The cause is unknown; the
documented rate is **11 stalls in 697 builds over three days**, and a retry has
recovered every one. So **retry rather than debug**, and clear a
confirmed stall with `taskkill /F /IM CocosCreator.exe`.

Two traps when diagnosing this, both hit: `find <dir> -newermt "-3 minutes"`
returned the same count minutes apart and reads as "still building", and
sorting mtimes by `%TH:%TM:%TS` is lexicographic, so `23:59` outranks `00:33`.
Use `find . -printf '%T@ %p\n' | sort -rn`. `buildCocosWebMobile` now bounds the
wait itself (`BHR_COCOS_BUILD_TIMEOUT_MS`, default 15 min) and kills the process
**tree** on expiry, so a stall fails loudly instead of hanging forever.

**The ambient proxy is no longer a hazard (fixed `09-21 18:5x`).** Every scope is
loopback-only, but Chromium still inherited the shell's `http_proxy`/`https_proxy`
and a proxy that does not recognise the loopback address turns
`ws://127.0.0.1:<port>` into `net::ERR_INTERNET_DISCONNECTED`. That is exactly how
`--scope=network` failed at `09-21 02:11` with `BUNDLE_STABLE`. The launch now
passes `--no-proxy-server`, so the chain no longer depends on the shell that
launched it. Verified both ways on `09-21`: with the proxies **unset** the scope
passed at `17:34`, and with `http_proxy=http://127.0.0.1:62150` deliberately left
**set** it passed again at `18:55` (`BUNDLE_STABLE` `98b25c34`). No `unset` or
`no_proxy` export is needed any more.

**The stall rate observed on `09-21` was far worse than 2%.** Three of nine builds
froze at the documented signature (builder log stuck at 3 lines / 1710 bytes,
six `CocosCreator.exe` processes resident, zero writes for 6–9 minutes): the
`save-resume` builds at `17:39`, `17:58` and `18:05`. Retrying recovered each one,
as the record predicts, but do not assume a stall is rare — budget for it, watch
the builder log's line count rather than the clock, and `taskkill /F /IM
CocosCreator.exe` when it freezes.

Reports carry `bundleProvenance {status, start, end, comparisonWindow}` and, since
`f39f689`, a clobber **fails the run** (`FAIL_BUNDLE_CLOBBERED`, exit 1). The
promotion waited for its precondition: three scopes re-run alone all reported
`BUNDLE_STABLE` with identical start/end digests. `BUNDLE_UNVERIFIED` is
deliberately non-fatal — a clobber is positive evidence the report is incoherent,
an unverified census is only the absence of evidence.

### Open items, in priority order

0. **`save-resume` FAILED because arena bots overwrote the player's save — FIXED
   `09-21 19:10`, and all sixteen scopes were re-run afterwards.** The scope
   reported `FAIL_SAVE_RESUME_MASS_MISMATCH` with the live mass at `START_MASS`
   (`240`) against a persisted `295`, and `320` on another run. `saveService` is
   an app-wide singleton, and `BlackHoleMachine.addMass` / `applyEvolutionLevel`
   called `setMachineProgression(this.currentMass, this.currentLevel)` with no
   notion of *which* machine owns the player's progression. `ArenaMatchManager.ts`
   awarded bot mass through `competitor.machine.addMass(...)`, so **every bot
   absorb rewrote the player's `machineMass`**; `NetworkArenaReplica` did the same
   for replicated opponents. Because `setMachineProgression` does
   `machineLevel = Math.max(data.machineLevel, nextLevel)`, a bot reaching LV2+
   would also have handed the player a free level. Introduced by `6f7de14`
   (`09-15 12:27`); the bot `addMass` path predates it (`3a530da`, `09-04`), so the
   `09-18` PASS was a lucky one.

   **Fix.** `BlackHoleMachine` now exposes one owner flag, `persistsProgression`,
   and every write goes through the single gate `persistProgression()`.
   `ArenaMatchManager` clears the flag on its seven bots before
   `prepareMachine`, and `NetworkArenaReplica` clears it on replicated opponents.
   `onLoad` mirrors the save through `withoutPersisting(...)` because a bot is
   created with `addComponent`, which runs `onLoad` before its owner can clear the
   flag. `save-resume` is itself the regression guard — it fails without the fix.

   Because `cocos/assets/**` changed, **all sixteen scopes were re-run
   `09-21 19:12`–`20:15` on the new source: 16/16 PASS**, each with
   `failures: []`, `consoleErrors: []` and a `BUNDLE_STABLE` provenance whose
   start and end digests match. `typecheck:cocos` is 0 errors and `test:full`
   exits 0. The chain is green on the current source — that is now a true
   statement, and the digests in `final-acceptance-matrix.md` are what to re-check
   it against.

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
   both verified PASS.** `23906d0` (`09-18 23:51`) changed the collectible id from
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

**Result.** After all three fixes, both scopes that share the helper are **PASS**
at `390x844` with `failures: []`, `consoleErrors: []` and `BUNDLE_STABLE`:
`skin-unlock` at `09-21 01:31` and `progression` at `09-21 01:46`. The targeting
change is legible in both reports: level 3 ate `cardboard_box`/`trash_bag` (T2)
instead of ping-ponging on the 80-mass battery, level 4 ate
`chair`/`small_table` (T3), level 5 ate `crate`/`shelf`/`sofa` (T4) — each stage
taking the heaviest tier its `maxTier` allowed — and the terminal T5 was the same
static `container` that had failed before. Two independent runs agreeing on the
tier choice per level *and* the terminal asset is what separates a fixed gate
from a gate that happened to pass once.
11. **Residual harness risks, not yet fixed.** The opening T1→T2 loop still uses
   a flat 60 s budget (`592a985`, `09-16`) to earn 900 mass from T1 clusters
   averaging 65 mass, which is roughly 88 s of driving at the measured 6.3 s per
   absorb; it passes today on short trips and passive suction, but it is the same
   fixed-clock shape as item 9. `collectUntil`'s per-target drives still use
   `max(1.0, suctionRadius * 0.62)` and therefore also rely on coasting past a
   target to cross the 0.6 m SUCKING gate rather than driving into it; stages 3–5
   passed this way, so it was left alone rather than changed without evidence.

   **The sweep was run (`09-21 20:4x`), and it is a bounded result.** Grepping the
   harness for the arrival radius finds exactly four uses of `0.62`, of which
   three are arrival radii and one (`:2758`) is a suction-strength curve, not a
   drive:

   | Site | Target | Arrival radius | `allowMiss` | SUCKING gate |
   | :--- | :--- | :--- | :--- | :--- |
   | `:3043` | `LV<n>` heaviest edible tier (T2→T5) | `max(1.0, r*0.62)` → 1.49–4.96 m | `false` | 0.6 m |
   | `:3372` | traffic replenishment, T5 | `max(1.5, r*0.48)` → 1.5–3.84 m | `true` | 0.6 m |
   | `:4121` | opening T1→T2 loop, T1 | `max(1.0, r*0.62)` → 1.49 m | `false` | 0.6 m |

   All three therefore stop short of the 0.6 m promotion distance and rely on the
   ATTRACTED pull closing the gap. **They are latent, not failing** — every one of
   them passed on `09-21`, and `:3372` tolerates a miss outright. So the same
   judgement the previous session made still holds: changing them now would be
   changing without evidence.

   What *would* justify it is a failure, and the cheapest way to look for one is
   `:3043`, because it is the only one that both stops short **and** samples after
   only 900 ms while driving a T4/T5 target whose `SUCTION_TIER_PROFILES` entry
   can be `{pullResistance: 3.6, suckDuration: 3.2}` — the exact shape that failed
   item 10's check until it was given a 12 s trace. If `progression` or
   `skin-unlock` ever fails `FAIL_FULL_PROGRESSION_LEVEL_4/5` with mass stalled,
   that is the cause, and the fix is item 10's: drive into the core and trace the
   tier ledger instead of sampling once.

   The other half of this item — the flat 60 s budget for the opening T1→T2 loop —
   is unchanged and unproven either way; no run has yet run out of it.
12. **Evidence is curated and the release preflight was run (`09-21 20:2x`).**
   `cocos/docs/evidence/final/` now exists — `.gitignore` has always declared it
   the home for product-level evidence, and until now nothing was there. It holds
   the sixteen reports, the Golden City one-shot baseline and gate, the P0-B
   probe, the runtime screenshots, and both platform build reports, plus a
   `README.md` index recording each scope's digest and run time.

   Measured on the current source:

   - `npm run build:all` — **PASS**: `web-mobile` 187 files, `wechatgame` 191
     files (real AppID `wx6ac3f5090a6b99c5`), `bytedance-mini-game` 190 files
     (placeholder).
   - `npm run preflight:release` — **FAIL**, and it is an **owner-owned blocker,
     not a code defect**: `wechatgame` passes with its configured AppID, then
     `bytedance-mini-game requires a real AppID for release preflight; found
     testappId.` Supply a real Douyin AppID and re-run.

   Note that `verify_cocos_minigame_builds.mjs` writes its report to
   `cocos/docs/evidence/v2/platform/`, which is **tracked**. Running it rewrites
   committed V2 evidence — the `09-21` run did exactly that, and those two files
   were restored from `HEAD` afterwards while the V4 results were copied to
   `evidence/final/` instead. Re-running the platform builds will clobber them
   again; restore or re-curate deliberately rather than committing it by accident.
13. **Two items above are already corrected in the record — do not redo them.**
   The *documentation* half of item 2 and item 7 is done:
   `final-acceptance-matrix.md` already records Golden City requirement 1 as
   **PARTIAL** (the predicate is *intersects*, not *contains*, and the "~13 m band"
   has no code predicate) and requirement 4 as **ENDPOINT MET, BASELINE
   UNVERIFIABLE** (the `0.34` exists only as prose), and it already states the
   write-once rule for `-before` evidence. What remains on both is only the
   *decision*: whether to add a real band predicate, and whether to give the
   `0.34` baseline a machine-readable home. Nothing is missing from the record
   itself.

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
