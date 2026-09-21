# V4 Expanded — Design Review

REVIEWER_MODEL: deepseek-v4.1-flash

ROUTING_NOTE: The agent was spawned as `kimi-k3` — `model: "kimi-k3"` was accepted
by the spawn and persisted in `teams/<team>/runtime.json`. The subagent
transcript carries `providerData.model = "kimi-k3"` for the first 13
model-bearing records and `"deepseek-v4.1-flash"` for every record after that.
The switch happened at record 15, long before this review turn began. This
review was therefore authored by `deepseek-v4.1-flash`, not by Kimi-K3.

**KIMI3_DESIGN_REVIEW = NOT_SATISFIED.** Recorded in `design-lineage.md` §7.
`design-lock.md` gate item 6 requires a Kimi-K3 design review, so the gate as
written cannot pass on this pass's evidence.

SUBJECT: the ten PNGs in `cocos/docs/design-reference/ui-v4-expanded/`,
reviewed as layout / legibility / token specifications. These are
**deterministic 720×1280 HTML renders, not AI-generated concept art**
(`design-lineage.md` §6–7; `reference-manifest.json` `"imageGenerationModel":
"NONE"`). `01`–`04` are byte-identical copies of the V3 masters; `05`–`10` are
deterministic layout locks rendered from `ui-v4-expanded/source/*.html`. The
real 390×844 frames under `cocos/docs/evidence/v4-design/` are reviewed
separately, because they are the only evidence that can confirm or refute the
renders.

REVISION_HISTORY: rev1 adversarial pass (27 findings). rev2 added the runtime
evidence block N1–N7 and a per-ID resolution table; incorporated three
team-lead residuals, all re-verified by me in source. rev3 (this one) re-opened
`05`/`08`/`09`/`10` after the polish pass and **closes B1, M10, m1, m5, m6, n2,
n3**; re-checks the classifier against the committed payload and finds the
payload **stale**; adds N10.

## Verdict

V4_DESIGN: FAIL

Down from five blockers to two. **B1 is closed** — every annotation and note
block is now gone from all four affected references. **B2 is closed** — the
runtime evidence bundle exists, is honestly produced, and carries per-target
capture status.

What still blocks: **B3** (this is not a Kimi-K3 review, and gate item 6 requires
one) and **N1**. N1 is now a two-part problem: the committed payload **predates
the classifier fix**, so it cannot be used to judge anything; and one of the two
classifier bugs — `static` outranking `environment` — is **still unfixed**, so
re-capturing as-is will most likely reproduce `environmentShare: 0` and burn the
build slot.

## Findings — original review

| ID | Page(s) | Severity | Finding | Exact fix |
| --- | --- | --- | --- | --- |
| B1 | 05, 08, 09, 10 | BLOCKER | Spec annotations were painted into the reference PNGs, so a layout lock could not be told apart from its own commentary. | Strip every annotation/comment node from `ui-v4-expanded/source/*.html` and re-render. Add a render-gate assertion that no painted text node falls outside the declared UI element list. |
| B2 | 08 | BLOCKER | Gate item 4 and `gameplay-composition-contract.md` §8 require a real 390×844 runtime screenshot plus a world-space measurement. Neither existed; the 55–65 % figure was self-asserted by the render's own overlay. | Capture the real runtime frame, run the world-space probe, attach per-tier and bucket counts. |
| B3 | process | BLOCKER | This review is not a Kimi-K3 review, but gate item 6 requires one and `design-lineage.md` §7 asserted `KIMI3_EXPLICIT_TEAM_ROUTING` for design review. | Route the review to `kimi-k3`, or amend the gate and lineage §7 to name the real reviewer. Do not record this pass as satisfying gate item 6. |
| M1 | 03 | MAJOR | `design-lock.md` §03 describes the master incorrectly. | Correct the lock text (exact wording below). Also reconcile the visible `观看视频解锁` ad-unlock with `ui-gap-audit.md` `BLOCKED_EXTERNAL_CONFIG`. |
| M2 | 02 | MAJOR | `design-lock.md` §02 describes the master incorrectly, and the master inverts the CTA hierarchy. | Correct the lock text (exact wording below). If the master is authoritative, reconcile the ad glyph against "No fake ad progress". |
| M3 | 08 | MAJOR | The four contract bands did not match the pixels of the reference. Environment was over band, dynamic far under band, static under band. | Rebuild the composition so all four bands sit inside their ranges, and re-measure on the shipped frame rather than on the HTML source. |
| M4 | 08 | MAJOR | Literal hard-fail: a dense contiguous cluster (the building row) spanned nearly the full frame width, against §2 "A frame with a large dense cluster spanning more than a third of the width." | Break the band into separated blocks with real gaps. |
| M5 | 08 | MAJOR | Objects formed a ring around the black hole; the frame did not read as open, and one object sat on the rim, against "Nothing is allowed to pile up against the black hole." | Push objects outward so a clear annulus of at least one suction-ring radius stays empty around the core. |
| M6 | 08 | MAJOR | The `T4` goal was clipped by the bottom frame edge and sat inside the joystick zone, so the progression beat was not legible. | Move the large target up into the visible field, clear of the bottom 40 % joystick zone. |
| M7 | 08, 09, 10 | MAJOR | Viewpoint and object treatment broke lineage from masters `01`/`02`, which show a 3/4-perspective low-poly cartoon city with volumetric objects and thick outlines. `08`/`09`/`10` rendered a flat orthographic plan with flat rectangles, against §4.5. | Re-render with the master's camera and object treatment, or amend §4.5 to declare an orthographic gameplay camera and record the tension in `ui-gap-audit.md`. |
| M8 | 07 | MAJOR | Page-wide violet. §4.1 grants `--accent-violet` to "Banners, competitive headers, ranking", but `07` painted the whole page violet and used violet-tinted panels while `06` — "Same as 06, Arena variant" — used slate `--surface-panel`. | Keep violet to the header/banner band and restore `--surface-panel` for the cards, or add an explicit violet-surface token to §4.1. |
| M9 | 06, 07 | MAJOR | The "map preview" / "arena preview" were abstract diagrams, not the low-poly thumbnails the lock specifies. | Render real low-poly thumbnails, or amend the lock to accept a schematic preview. |
| M10 | 09 | MAJOR | The phase label `5 · 靠近 · 下沉` was unreadable because the black-hole glow was painted over it — the inverse of the safe-area note "phase labels must not cover the car". | Move the label clear of the glow, or raise the label layer above the glow. |
| m1 | 08, 09, 10 | MINOR | Pause button restyled: master `01` renders it gold, `08`/`09`/`10` rendered it dark navy. §5 forbids new HUD chrome that does not exist in master `01`/`03`/`04`. | Match master `01`'s pause treatment. |
| m2 | 08 | MINOR | Right-edge artifact: a bright green vertical strip plus a blue block top-right that matched neither the building row nor the ground. | Remove or re-tone the strip. |
| m3 | 09 | MINOR | The `SLOW` beat was asserted by text only; the car at position 2 was the same size and orientation as position 1. | Vary the visual beat — shorten the motion trail, change spacing between successive positions, or add a speed readout. |
| m4 | 09 | MINOR | Label/state mismatch: `6 · ABSORBED` pointed at a still-visible red car remnant, while §09 defines `ABSORBED` as "Gone". | Show the car fully gone at the final beat, or relabel it to the phase it depicts. |
| m5 | 09 | MINOR | Three contract phases had no dedicated beat: `APPROACH`, `SHRINK` and `SINK` all shared label `5`. | Split label 5, or record the compression as accepted in the lock. |
| m6 | 09 | MINOR | Crimson used outside its inherited role; §4.1 restricts `--alert-crimson` to "Lock warning, defeat, timer urgency", but the phase-2 label pill was crimson. | Use a neutral or cyan pill for a non-alert phase label. |
| m7 | 06 | MINOR | A gold text line competed with the single gold CTA: `解锁更大目标` was gold directly above the gold `开始探索` pill. | Render the second copy line in white or muted slate. |
| m8 | 05 | MINOR | Secondary row did not match its own spec: lock §05 says 模式 / 机器 / 皮肤 are "outlined style", the render shows three filled dark navy cards. | Outline the three items as specified, or amend the lock. |
| m9 | 05 | MINOR | The bottom annotation collided with the 设置 button and sat inside the bottom safe margin; the bottom-left tree overlapped the 模式 card. | Remove the annotation and re-check safe-area placement. |
| m10 | 05 | MINOR | Vertical rhythm differed from the locked diagram: CTA at ≈76 % vs locked y ≈ 900/1280 (70 %), secondary row at ≈89 % vs locked 80 %. | Re-render to the locked y positions, or update the diagram. |
| m11 | all | MINOR | Outline weight not uniform across the ten: master `03`'s title uses a thin blue outline, `05`/`06`/`07` use a heavy black one. §4.2 requires uniformity. | Pick one outline weight and apply it across all ten, or exempt the inherited masters explicitly in §4.2. |
| m12 | 08 | MINOR | The labelled `T5` was a vehicle, while §2 books vehicles under "Dynamic content" and books `T4`/`T5` under "Static swallowable targets". | Clarify whether `T4`/`T5` may be vehicles; if not, place and label a static large target. |
| m13 | 06, 07 | MINOR | Label pills overlapped the preview artwork: `地图预览` over the road and black hole; `竞技场预览` over a mini black hole; `1 v 7` over the pink building. | Move the captions outside the preview card, or drop them. |
| n1 | 10 | NIT | Upgrade banner is wide (≈78 % of frame width). Acceptable as a banner, but at the upper bound of "short / non-blocking". | Optionally narrow it. |
| n2 | 10 | NIT | Three gold focal points on a page with no CTA: `升级！`, `解锁更大目标` and a gold progress bar. | Reduce to one gold accent. |
| n3 | 09 | NIT | The outer pull-range ring is the largest single graphic in the frame (≈two thirds). | Optionally reduce its radius or opacity. |
| n4 | 09 | NIT | New in rev3: the eight phase chips now form a left-edge column spanning ≈45 % of the frame height and ≈45 % of its width, so the teaching overlay covers a large part of the play field. The safe-area note only requires that labels not cover the car, which they now satisfy. | Consider a more compact chip treatment, or accept it and record the decision — the chip chain is the page's teaching payload, so a prominent column is defensible. |

## Findings — from the runtime evidence

| ID | Page(s) | Severity | Finding | Exact fix |
| --- | --- | --- | --- | --- |
| N1 | 08 | BLOCKER | The runtime screen-space measurement cannot be judged from the committed payload, and one of its two root causes is unfixed. **(a) The payload is stale.** `scripts/capture_v4_design_evidence.mjs:192` now declares `buckets = { open, environment, static, dynamic, unclassified }` and `:189` maps `ROAD → 'open'`, but `v4-design-evidence.json:1276` and `:2332` still emit **`otherShare`** (`0.2773` and `0.361`) — a key the current code can no longer produce. The payload was captured at `2026-09-20T10:18:32Z`, before the fix, so it describes the old classifier. **(b) The `static` > `environment` ordering is unchanged.** `:177` still tests `COLLECTIBLE`/`RESOURCE_CLUSTER` (→ `static`) before `:178` tests `BUILDING`/`TREE`/`POI` (→ `environment`), which is the mechanism that starves `environment`. **(c)** Both captures still read `allInBand: false` (`:1350`, `:2406`), with `environmentShare: 0` and `openShare` `0.0172` / `0.3774`. The block is correctly demoted — `status: 'NOT_A_GATE'`, `admissibility: 'INADMISSIBLE_RUNTIME_SCREEN_SPACE'`, `isGate: false` at `:1299`/`:2355`, and the note at `:1349`/`:2405` says not to read `allInBand` as pass/fail. `design-lock.md` §08 separately reports 64.5 / 19.3 / 10.4 / 5.8 from DOM-box rasterisation of the HTML. | Fix `:177`/`:178` ordering **before** spending a build. Then re-capture so the payload matches the current classifier, and confirm `environmentShare` is non-zero and `unclassifiedShare` replaced `otherShare`. Then choose one measurement as the gate and delete the other. Re-capturing without the ordering fix will most likely reproduce `environmentShare: 0`. |
| N2 | — | WITHDRAWN | **Withdrawn.** My earlier read showed `tierCounts {"1":20,"2":1,"3":0,"4":0,"5":0}` and `highestVisibleTier: 2`, and I reported no `T4`/`T5` in the captured cell. The re-captured payload now reads `tierCounts {"1":20,"2":1,"3":0,"4":1,"5":1}` with `highestVisibleTier: 5`, and `openingTierLadder` reads `highestPresentTier: 5`. `T4` and `T5` are present. Not supported by the current evidence. | None. Do not re-raise. |
| N3 | 08 | MAJOR | The payload publishes two mutually contradictory distribution measurements under the same concept, and the top-level one reports the cadence §4 forbids. `gameplayComposition` gives `singles: 0`, `smallGroups: 0`, `hotspots: 20`, `aspirational: 2`, `unknownPlacement: 1`, `hotspotShare: 0.8696`, `largestProximityGroup: 21` — and then, nested inside the same object, `proximity {singles: 2, smallGroups: 0, hotspots: 1}`, which implies a hotspot share of ≈0.33. Both cannot be true. `measurement: "MIXED"` is recorded but nothing resolves which governs. Note also `0 + 0 + 20 = 20 ≠ 23` collectibles, so the shares do not sum to 1. §4 wants Singles 50–60 % / Small groups 25–35 % / Hotspots 10–15 % and explicitly forbids "a single hotspot surrounded by a dozen or more objects". | Pick one definition of a bucket, state it, and publish one set of numbers. Reconcile `singles` against the nested `proximity` block, classify the aspirational and unknown entries, and make the shares sum to 1. |
| N4 | 08, 09, 10 | MAJOR | The reference is not the frame it claims to be, and its camera does not match the product. `design-lock.md` §08 asserts "This reference is a **single real gameplay frame**, not a diagram of one", but the file's provenance is `DETERMINISTIC_LAYOUT_RENDER` from `08-endless-gameplay.html`. Confirmed by direct comparison against `v4-390x844-08-endless-gameplay.png`: the runtime frame is 3/4-perspective low-poly with a crosswalk, a green truck and a red car; the reference is top-down with flat rectangles. The reference shows region 回收广场 while the captured runtime region is 卧室杂物区. | Amend §08 back to "deterministic layout lock, not a literal frame", or re-render the reference from a real runtime capture so camera, region and object treatment match. Do not leave a document claiming a render is a screenshot. |
| N5 | 08 (runtime) | MINOR | Largely fixed. `applyHudSafeAreaInset(this.node)` is called at `EndlessHUDController.ts:58` with a comment recording the ≈64 design-px-per-side crop, and the pause button is now inside the frame. Residual: `hudExclusion.topRatio: 0.16` (`capture_v4_design_evidence.mjs:163`) is smaller than the real HUD, which occupies three rows to ≈24 % of frame height. So ≈8 points of HUD are still counted as scene content. | Widen `hudExclusion.topRatio` to match the measured HUD. |
| N6 | 08 (runtime) | MAJOR | **Confirmed, not fixed.** The mass readout renders a colon-like glyph: the captured frame shows `质量:0kg` where the intended string is `质量 0kg`. Root cause verified in source — `EndlessHUDController.ts:63` is `` `质量 ${Math.round(mass)}kg` `` and the comment at `:60–62` records that the space before `kg` was already removed for exactly this reason: at fontSize 18 the serialized `LabelOutline` (default width 2) bridges the ~4 px gap and the bridged space reads as a punctuation glyph. The same bridging now occurs between `质量` and the digits. This defect is **invisible to the evidence JSON** — `pillText.mass` stores the raw string — so no gate that reads `pillText` can catch this class. | Change `:63` to `` `质量${Math.round(mass)}kg` ``. Add a pixel-level or outline-bridging check so this class of defect is detectable without a human looking at the frame. |
| N7 | 08 (runtime) | MINOR | Confirmed present: the lower centre of the captured frame carries a large dense dark mass (a black flower-shaped cluster with orange blobs) spanning roughly 38 % of the frame width and 23 % of its height. §08 forbids "满地垃圾" and requires the central gameplay region to stay as complete as possible. Plausibly the cluster `largestProximityGroup: 21` is grouping. | Confirm what the object is; if it is a resource cluster, reduce its footprint or move it out of the lower centre. |
| N8 | 08 (runtime) | MAJOR | A wrong quantity is published under a field name that reads as player distance, in the block the tier gate consumes. Verified: `capture_v4_design_evidence.mjs:526` and `:535` compute `Number(Math.hypot(object.x, object.z).toFixed(2))` — distance from the **world origin** — while `:587`, `:921`, `:1021` and `:1064` correctly use `Math.hypot(object.x - player.x, object.z - player.z)`. These feed `openingTierLadder.nearestOverTier[].distance` and `.authoredAspirational[].distance`. The "aspirational T4 at 19.84" reads correct only because the machine happens to spawn at the cell origin (`32 * 0.62 = 19.84`). | Change `:526` and `:535` to subtract the player position, matching `:587`. Until then, treat those fields as origin distance, not player distance. |
| N9 | 08 (runtime) | MINOR | Spacing needs adjudication against §5. `gameplayComposition.spacing` reports `nearestNeighbourMinMeters: 1`, `nearestNeighbourMedianMeters: 1`, `nearestNeighbourP90Meters: 1.48`, `maxObjectsWithinDenseRadius: 9` at `denseRadiusMeters: 6`. §5's floors are T1 2.5 m, T2–T3 4.0 m, T4–T5 8.0 m. A median of 1.0 m means essentially every collectible has a neighbour within a metre. Caveat: min and median being *exactly* 1.0 suggests a clamp. §7's tutorial exception (≈1.48 m) would cover the p90 but not the median. | Determine whether the captured cell is the tutorial cell (then §7 applies) or a procedural cell (then §5 is violated). If it is an instrument clamp, remove it and re-measure. |
| N10 | 08 | MAJOR | New in rev3: `occupants` still includes roads, contradicting its own comment. `:171` is `entries.filter(entry => entry.category !== 'GROUND')`, so `ROAD` entries remain in `occupants`, while the comment added at `:179` states "A road is walkable, so it is OPEN movable ground, **not an occupant**." Functionally the outcome is now correct because `:189` catches `ROAD` inside `precedence()`, but the code and its comment disagree, and a sample covered by a road still takes the slow `precedence()` path at `:204–211` instead of the fast empty-covering path at `:205`. | Either exclude `ROAD` from `occupants` to match the comment, or correct the comment to say roads are occupants that `precedence()` resolves to `open`. |

## Resolution status

| ID | Status | Evidence |
| --- | --- | --- |
| B1 | **RESOLVED** | Verified by re-reading all four affected PNGs in rev3. `05`: no bottom note line. `08`: no tier chips, no `资源热点`, no percentage pills, no space-budget ruler; the lock-mark reads `需要 LV.5` with no `T5 ·` prefix. `09`: no bottom `大型目标不是…` / `允许…` bars. `10`: **the `短暂显示 ≤ 2s · 不遮挡中央玩法区 · 无全屏升级页` pill is gone** — this was the last survivor. Rule recorded in `design-lock.md` §08 "One page per image — and no commentary inside the image". Closed. |
| B2 | **RESOLVED** | `scripts/capture_v4_design_evidence.mjs` is a real Playwright runner against a live `?qa=1` Web Mobile build, with its honesty rules stated at `:11–18`. The bundle now carries per-target `status: CAPTURED` (`:4564`, `:4590`, `:4619`, `:6015`) and `REACHED` (`:5513`), plus overall `"status": "COMPLETE"` (`:6050`), and was re-captured at `2026-09-20T10:18:32Z`. The evidence gap is closed. The measurement inside it is stale — see N1. |
| B3 | ACKNOWLEDGED_NOT_FIXED | `design-lineage.md` §7 carries `KIMI3_DESIGN_REVIEW = NOT_SATISFIED` and the corrected `KIMI3_EXPLICIT_TEAM_ROUTING = AVAILABLE_AT_SPAWN`, with the record-15 switch documented. Gate item 6 remains unsatisfied by construction. |
| M1 | REVIEWED — still wrong | The incorrect sentence is `design-lock.md` §03: "Locked essentials: back button, title banner, exactly **two** live cards (Endless Exploration, Arena Brawl). No locked cards, no "coming soon", no VIP, no friend rooms." `03-mode-select.png` shows **four** cards: `竞技吞噬` (多人竞技, `实时对战，吞噬最强对手!`, badge `4人对战`) and `无尽吞噬` (生存挑战, `无限地图，挑战更高分数!`, badge `最高分 35680`) live; `黑洞乱斗` (团队混战, `3V3 团队对抗，策略致胜!`) and `限时冲榜` (限时挑战, `限定时间内，冲击排行榜!`) **locked**, each with a padlock and `观看视频解锁`. The count is wrong, the names are wrong (neither live card is "Arena Brawl"), and "No locked cards" is wrong. It should read: "Locked essentials: gold back button, `模式选择` title with lightning counter and session timer, four stacked cards — `竞技吞噬` and `无尽吞噬` live, `黑洞乱斗` and `限时冲榜` locked behind `观看视频解锁`. No VIP, no friend rooms." Separately, the `观看视频解锁` ad-unlock contradicts `ui-gap-audit.md` `BLOCKED_EXTERNAL_CONFIG`. |
| M2 | REVIEWED — still wrong | The incorrect sentence is `design-lock.md` §02: "Locked essentials: dimmed battlefield veil, single focal card, dizzy cartoon black-hole avatar, countdown ring 5→0, primary REVIVE CTA, muted GIVE UP text button. No fake ad progress." `02-revive.png`: the veil is correct, but (a) there is **no card face** — it is a large `复活` / `继续` lockup over a teal disc; (b) the countdown is a dark pill reading `倒计时: 5`, **not a ring**; (c) `免费复活` is **violet** with a **video/ad glyph**, so the primary revive CTA is not the gold one; (d) `我怂了，溜了` is a **filled gold pill**, not muted text — the gold emphasis sits on the give-up action; (e) the ad glyph contradicts "No fake ad progress". It should read: "Locked essentials: dimmed battlefield veil, a `复活` / `继续` lockup over a teal disc (no card face), a dark `倒计时: N` pill, a violet `免费复活` button with an ad glyph, a gold `我怂了，溜了` button. Note: gold emphasis is on the give-up action and the revive button carries an ad entry that `ui-gap-audit.md` currently reports as hidden." The "dizzy cartoon black-hole avatar" claim I could not confirm either way. |
| M3 | DISPUTED — resolved by changing the measurement | `design-lock.md` §08 reports `64.5 / 19.3 / 10.4 / 5.8`, all "IN BAND", from DOM-box rasterisation of the HTML. The runtime probe reports `openShare 0.0172 / 0.3774`, `environmentShare: 0`, `allInBand: false` (N1). My read of the real runtime frame: visually mostly open road, so the crowding concern is **not** confirmed by pixels — the runtime failure is a classifier defect, not a composition result. My independent read of the rebuilt `08`: open ≈60–65 % if the HUD and joystick overlays are excluded, ≈54 % if they are included; environment ≈17–19 % (in band); static ≈15 % (at the top of the 10–15 % band). The contract does not define whether UI overlays count toward the open share, which is itself part of why the two instruments disagree. |
| M4 | RESOLVED | The rebuilt `08` has separated building blocks with real gaps, not an unbroken wall. Re-confirmed in rev3. |
| M5 | PARTIALLY_RESOLVED | The rebuilt `08` spreads objects well and the annulus around the black hole is largely clear. One blue capsule still sits at the edge of the dashed ring. Much improved. |
| M6 | RESOLVED | The lock-marked target sits near the top of the frame, clear of the joystick rectangle, and no tier label is painted. The runtime tier question is answered by `highestVisibleTier: 5`. |
| M7 | PARTIALLY_ADDRESSED | Buildings in `05`/`08`/`09`/`10` are now 2.5D boxes with a roof face and a wall face, the black hole is a volumetric sphere, and trees have trunks and rounded canopies — a clear improvement over the flat rectangles. A full perspective projection was **not** applied: the references remain top-down while the real runtime frame is 3/4 perspective. Recorded as N4. |
| M8 | RESOLVED | `07` uses the same blue/cyan page gradient as `06`; violet survives only as the arena preview floor. |
| M9 | PARTIALLY_ADDRESSED | `06`'s preview is more map-like but still flat, not a low-poly city thumbnail. `07`'s preview remains a diagram. Not re-opened in rev3; the `地图预览` / `竞技场预览` captions were present at rev2. |
| M10 | **RESOLVED** | Verified in rev3: the eight phase chips now sit in a clean left-edge column and the black-hole glow no longer overlaps any of them. All eight are fully readable. |
| m1 | **RESOLVED** | Verified in rev3: the pause button is now **gold** in `08`, `09` and `10`, matching master `01`. |
| m2 | RESOLVED | The rebuilt `08` has no bright green vertical strip at the right edge. |
| m3 | PARTIALLY_RESOLVED | The car at position 2 is still upright and the same size as position 1, so SLOW is still not directly visible. However the spacing between successive positions now narrows along the path (≈145 px for 1→2, then ≈125 px for 2→3), which is the right visual cue, just subtle. |
| m4 | PARTIALLY_RESOLVED | The chain now has nine car positions and the final one is a tiny remnant at the black-hole core, so the last beat reads as "being absorbed" rather than "still parked". Chip 8 still says `ABSORBED 已吞入` while a trace is visible. |
| m5 | **RESOLVED** | Verified in rev3: the chain is now eight distinct chips — `1 · DRIVE 正常行驶`, `2 · 进入吸力范围 · 减速`, `3 · 方向偏移 · 脱离道路`, `4 · TUMBLE 旋转拉扯`, `5 · APPROACH 靠近核心`, `6 · SHRINK 体积缩小`, `7 · SINK 沉入地面`, `8 · ABSORBED 已吞入` — covering all ten contract phases with no shared beats. |
| m6 | **RESOLVED** | Verified in rev3: the phase chips are cyan/blue, not crimson. |
| m7 | NOT_ADDRESSED | `解锁更大目标` is still gold in `06`. Not re-opened in rev3. |
| m8 | NOT_ADDRESSED | `05`'s 模式 / 机器 / 皮肤 are still filled dark navy cards, not outlined. Verified in rev3. |
| m9 | PARTIALLY_RESOLVED | The annotation is gone, so the safe-margin and 设置-button collisions are cleared. The bottom-left tree still overlaps the lower-left corner of the 模式 card. Verified in rev3. |
| m10 | PARTIALLY_RESOLVED | CTA now sits at ≈72 % (locked 70 %). The secondary row is at ≈88 % vs the locked 80 %. Verified in rev3. |
| m11 | NOT_ADDRESSED | `03`'s title is still a thin blue outline while `05`/`06`/`07` use a heavy black one. |
| m12 | SUPERSEDED | The `T5` chip no longer exists in `08`, so the labelling ambiguity is gone. |
| m13 | NOT_VERIFIED_IN_REV3 | `06`/`07` were not re-opened in this revision. |
| n1 | NOT_ADDRESSED | The `10` banner is still wide (≈78 % of frame width), though it is now a cleaner panel. |
| n2 | **RESOLVED** | Verified in rev3: the gold progress bar is gone from `10`. |
| n3 | **RESOLVED** | Verified in rev3: `09`'s outer pull-range ring is now cyan/blue and thin, not crimson, and no longer reads as the frame's dominant graphic. |
| n4 | OPEN (new) | The eight-chip column in `09` spans ≈45 % of frame height. See the finding table. |
| N1 | CONFIRMED — NOT FIXED | (a) `:192` declares `unclassified` and `:189` maps `ROAD → 'open'`, but the payload still emits `otherShare` at `:1276`/`:2332` — it predates the fix. (b) `:177`/`:178` ordering unchanged. (c) `allInBand: false` at `:1350`/`:2406`; block demoted at `:1299`/`:2355` with the note at `:1349`/`:2405`. |
| N2 | WITHDRAWN | Payload now has `tierCounts {"1":20,"2":1,"3":0,"4":1,"5":1}` and `highestVisibleTier: 5`; `openingTierLadder` has `highestPresentTier: 5`. |
| N3 | CONFIRMED — NOT FIXED | Top-level `singles 0 / smallGroups 0 / hotspots 20` contradicts the nested `proximity {singles: 2, smallGroups: 0, hotspots: 1}` in the same object. `aspirational: 2` and `unknownPlacement: 1` leave the shares not summing to 1. |
| N4 | CONFIRMED — NOT FIXED | `design-lock.md` §08 asserts "a single real gameplay frame" while `reference-manifest.json` records `DETERMINISTIC_LAYOUT_RENDER`. Direct comparison confirms the camera mismatch. |
| N5 | PARTIALLY_RESOLVED | `EndlessHUDController.ts:58` applies `applyHudSafeAreaInset`; the pause button is inside the frame. Residual: `hudExclusion.topRatio: 0.16` under-counts a HUD reaching ≈24 %. |
| N6 | CONFIRMED — NOT FIXED | `EndlessHUDController.ts:63` still has the space, and the captured frame shows `质量:0kg`. The comment at `:60–62` describes the identical failure mode for the `kg` gap. |
| N7 | CONFIRMED | The large dark cluster is visible in the lower centre of the captured frame. |
| N8 | CONFIRMED — NOT FIXED | `:526`/`:535` use origin distance; `:587`/`:921`/`:1021`/`:1064` use player-relative distance. |
| N9 | NEEDS_ADJUDICATION | `spacing` reports min and median both exactly 1.0 m against §5 floors of 2.5 / 4.0 / 8.0 m. May be an instrument clamp. |
| N10 | OPEN (new) | `:171` keeps `ROAD` in `occupants` while the comment at `:179` says roads are not occupants. Outcome is correct via `:189`; code and comment disagree. |

## What I could not verify

- **Byte-identity of `01`–`04`.** `reference-manifest.json` asserts
  `byteIdenticalToSource: true` with SHA-256 values. I did not run
  `scripts/verify_ui_v4_reference_set.mjs`.
- **That `05`–`10` match their `source/*.html`.** The manifest lists a SHA-256
  per render; I did not re-render or re-hash.
- **Whether the DOM-box rasteriser reproduces `64.5 / 19.3 / 10.4 / 5.8`.** I did
  not run `scripts/render_ui_v4_references.mjs`; I confirmed only that those
  numbers are written in `design-lock.md` §08 and in the manifest.
- **`06` and `07` in rev3.** I re-opened `05`, `08`, `09` and `10` only. `06`'s
  and `07`'s statuses above carry forward from rev2.
- **`01`–`04` in rev3.** Not re-opened; they are frozen masters and should be
  byte-identical.
- **Five of the seven runtime evidence frames.** I opened only
  `v4-390x844-08-endless-gameplay.png`, in its latest revision.
- **Whether the payload was re-captured after the classifier fix.** The
  `capturedAt` is `2026-09-20T10:18:32Z` and it still emits `otherShare`, so it
  predates the fix — but I cannot tell whether a newer capture is in flight.
- **Whether `openingTierLadder.tierCounts` and `gameplayComposition.tierCounts`
  describe the same population.** They agree on tiers present, but one is
  computed over `opening.objects` and the other is labelled cell-level.
- **Whether any gate currently consumes `nearestOverTier[].distance`.** N8
  establishes the field is wrong; I did not trace what reads it.
- **Whether the captured cell is the tutorial cell** (N9), which decides whether
  §5's floors or §7's exception apply.
- **Whether `probePlayableOpenAreaRatio: 0.9853515625` is a real world-space
  measurement or a carried-over default.** It is byte-identical to the recorded
  `AUTHORED_GOLDEN_CITY` baseline (≈0.9854) in
  `gameplay-composition-contract.md` §3.
- **The `02` "dizzy cartoon black-hole avatar".** A teal disc behind the
  `复活` / `继续` lockup could be read as the black hole from above.
