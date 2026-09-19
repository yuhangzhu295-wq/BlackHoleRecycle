# V4 Expanded — Design Review

REVIEWER_MODEL: deepseek-v4.1-flash

ROUTING_NOTE: The agent was spawned as `kimi-k3` — `model: "kimi-k3"` was accepted
by the spawn and persisted in `teams/<team>/runtime.json`. The subagent
transcript carries `providerData.model = "kimi-k3"` for the first 13
model-bearing records and `"deepseek-v4.1-flash"` for every record after that.
The switch happened at record 15, long before this review turn began. This
review was therefore authored by `deepseek-v4.1-flash`, not by Kimi-K3.

**KIMI3_DESIGN_REVIEW = NOT_SATISFIED.** This is now recorded in
`design-lineage.md` §7. `design-lock.md` gate item 6 requires a Kimi-K3 design
review, so the gate as written cannot pass on this pass's evidence. No claim of
Kimi-K3 authorship is made anywhere in the V4 set.

SUBJECT: the ten PNGs in `cocos/docs/design-reference/ui-v4-expanded/`,
reviewed as layout / legibility / token specifications. These are
**deterministic 720×1280 HTML renders, not AI-generated concept art**
(`design-lineage.md` §6–7; `reference-manifest.json` `"imageGenerationModel":
"NONE"`). `01`–`04` are byte-identical copies of the V3 masters; `05`–`10` are
deterministic layout locks rendered from
`ui-v4-expanded/source/*.html`. They are reviewed in that role. The real
390×844 runtime frames under `cocos/docs/evidence/v4-design/` are reviewed
separately, because they are the only evidence that can confirm or refute the
renders.

## Verdict

V4_DESIGN: FAIL

The annotation leak (B1) is fixed on `05`/`08`/`09` but **not** on `10`. The
runtime evidence gap (B2) is closed and the real frame looks good — but the
measurement recorded alongside it is broken and reports the opposite, and the
band table in `design-lock.md` §08 is now measured on the HTML source rather
than on the shipped frame. B3 (Kimi-K3 attribution) is acknowledged and
permanently unsatisfied. The `08` distribution cadence and the missing `T4`/`T5`
tiers are new blockers surfaced by the runtime evidence.

## Findings — original review

| ID | Page(s) | Severity | Finding | Exact fix |
| --- | --- | --- | --- | --- |
| B1 | 05, 08, 09, 10 | BLOCKER | Spec annotations were painted into the reference PNGs, so a layout lock could not be told apart from its own commentary. | Strip every annotation/comment node from `ui-v4-expanded/source/*.html` and re-render. Add a render-gate assertion that no painted text node falls outside the declared UI element list. |
| B2 | 08 | BLOCKER | Gate item 4 and `gameplay-composition-contract.md` §8 require a real 390×844 runtime screenshot plus a world-space measurement. Neither existed; the 55–65 % figure was self-asserted by the render's own overlay. | Capture the real runtime frame, run the world-space probe, attach per-tier and bucket counts. Do not mark gate item 4 passed until then. |
| B3 | process | BLOCKER | This review is not a Kimi-K3 review, but gate item 6 requires one and `design-lineage.md` §7 asserted `KIMI3_EXPLICIT_TEAM_ROUTING` for design review. | Route the review to `kimi-k3`, or amend the gate and lineage §7 to name the real reviewer. Do not record this pass as satisfying gate item 6. |
| M1 | 03 | MAJOR | `design-lock.md` §03 describes the master incorrectly. | Correct the lock text (exact wording below). Also reconcile the visible `观看视频解锁` ad-unlock with `ui-gap-audit.md` `BLOCKED_EXTERNAL_CONFIG`. |
| M2 | 02 | MAJOR | `design-lock.md` §02 describes the master incorrectly, and the master inverts the CTA hierarchy. | Correct the lock text (exact wording below). If the master is authoritative, reconcile the ad glyph against "No fake ad progress". |
| M3 | 08 | MAJOR | The four contract bands did not match the pixels of the reference. Environment was over band, dynamic far under band, static under band. | Rebuild the composition so all four bands sit inside their ranges, and re-measure on the shipped frame rather than on the HTML source. |
| M4 | 08 | MAJOR | Literal hard-fail: a dense contiguous cluster (the building row) spanned nearly the full frame width, against §2 "A frame with a large dense cluster spanning more than a third of the width." | Break the band into separated blocks with real gaps. |
| M5 | 08 | MAJOR | Objects formed a ring around the black hole; the frame did not read as open, and one object sat on the rim, against "Nothing is allowed to pile up against the black hole." | Push objects outward so a clear annulus of at least one suction-ring radius stays empty around the core. |
| M6 | 08 | MAJOR | The `T4` goal was clipped by the bottom frame edge and sat inside the joystick zone, so the progression beat was not legible. | Move the large target up into the visible field, clear of the bottom 40 % joystick zone. |
| M7 | 08, 09, 10 | MAJOR | Viewpoint and object treatment broke lineage from masters `01`/`02`, which show a 3/4-perspective low-poly cartoon city with volumetric objects and thick outlines. `08`/`09`/`10` rendered a flat orthographic plan with flat rectangles, against §4.5. | Re-render with the master's camera and object treatment, or amend §4.5 to declare an orthographic gameplay camera and record the tension in `ui-gap-audit.md`. |
| M8 | 07 | MAJOR | Page-wide violet. §4.1 grants `--accent-violet` to "Banners, competitive headers, ranking", but `07` painted the whole page violet and used violet-tinted panels while `06` — "Same as 06, Arena variant" — used slate `--surface-panel`. Two sibling pages used two different surface tokens. | Keep violet to the header/banner band and restore `--surface-panel` for the cards, or add an explicit violet-surface token to §4.1. |
| M9 | 06, 07 | MAJOR | The "map preview" / "arena preview" were abstract diagrams, not the low-poly thumbnails the lock specifies ("Low-poly city thumbnail, rounded card" / "Low-poly arena thumbnail"). | Render real low-poly thumbnails, or amend the lock to accept a schematic preview. |
| M10 | 09 | MAJOR | The phase label `5 · 靠近 · 下沉` was unreadable because the black-hole glow was painted over it — the inverse of the safe-area note "phase labels must not cover the car". | Move the label clear of the glow, or raise the label layer above the glow. |
| m1 | 08 | MINOR | Pause button restyled: master `01` renders it gold, `08`/`09`/`10` render it dark navy. §5 forbids new HUD chrome that does not exist in master `01`/`03`/`04`. | Match master `01`'s pause treatment, or record the restyle as an accepted deviation. |
| m2 | 08 | MINOR | Right-edge artifact: a bright green vertical strip plus a blue block top-right that matched neither the building row nor the ground. | Remove or re-tone the strip. |
| m3 | 09 | MINOR | The `SLOW` beat was asserted by text only; the car at position 2 was the same size and orientation as position 1. | Vary the visual beat — shorten the motion trail, change spacing between successive positions, or add a speed readout. |
| m4 | 09 | MINOR | Label/state mismatch: `6 · ABSORBED` pointed at a still-visible red car remnant, while §09 defines `ABSORBED` as "Gone". | Show the car fully gone at label 6, or relabel label 6 to the phase it depicts. |
| m5 | 09 | MINOR | Three contract phases had no dedicated beat: `APPROACH`, `SHRINK` and `SINK` all shared label `5`. | Split label 5, or record the 6-beat compression as accepted in the lock. |
| m6 | 09 | MINOR | Crimson used outside its inherited role; §4.1 restricts `--alert-crimson` to "Lock warning, defeat, timer urgency", but the phase-2 label pill was crimson. | Use a neutral or cyan pill for a non-alert phase label. |
| m7 | 06 | MINOR | A gold text line competed with the single gold CTA: `解锁更大目标` was gold directly above the gold `开始探索` pill. | Render the second copy line in white or muted slate. |
| m8 | 05 | MINOR | Secondary row did not match its own spec: lock §05 says 模式 / 机器 / 皮肤 are "outlined style", the render shows three filled dark navy cards. | Outline the three items as specified, or amend the lock. |
| m9 | 05 | MINOR | The bottom annotation collided with the 设置 button and sat inside the bottom safe margin; the bottom-left tree overlapped the 模式 card. | Remove the annotation and re-check safe-area placement. |
| m10 | 05 | MINOR | Vertical rhythm differed from the locked diagram: CTA at ≈76 % vs locked y ≈ 900/1280 (70 %), secondary row at ≈89 % vs locked 80 %. | Re-render to the locked y positions, or update the diagram. |
| m11 | all | MINOR | Outline weight not uniform across the ten: master `03`'s title uses a thin blue outline, `05`/`06`/`07` use a heavy black one. §4.2 requires uniformity. | Pick one outline weight and apply it across all ten, or exempt the inherited masters explicitly in §4.2. |
| m12 | 08 | MINOR | The labelled `T5` was a vehicle, while §2 books vehicles under "Dynamic content" and books `T4`/`T5` under "Static swallowable targets". | Clarify whether `T4`/`T5` may be vehicles; if not, place and label a static large target. |
| m13 | 06, 07 | MINOR | Label pills overlapped the preview artwork: `地图预览` over the road and black hole; `竞技场预览` over a mini black hole; `1 v 7` over the pink building. | Move the captions outside the preview card, or drop them. |
| n1 | 10 | NIT | Upgrade banner is wide (≈85 % width × ≈18 % height). It is a banner, not a full-screen page, and sits above the road, so it is acceptable but at the upper bound of "short / non-blocking". | Optionally narrow it. |
| n2 | 10 | NIT | Three gold focal points on a page with no CTA: `升级！`, `解锁更大型目标` and a gold progress bar. | Reduce to one gold accent. |
| n3 | 09 | NIT | The outer pull-range ring is the largest single graphic in the frame (≈two thirds of the frame). Thin and dashed, so it does not "seriously block" the view, but visually dominant. | Optionally reduce its radius or opacity. |

## Findings — new, from the runtime evidence

| ID | Page(s) | Severity | Finding | Exact fix |
| --- | --- | --- | --- | --- |
| N1 | 08 | BLOCKER | The committed runtime measurement fails all four bands and is internally incoherent, while the lock now reports a pass measured on the HTML source. `v4-design-evidence.json` `openingBudgetBands.allInBand: false` with `openShare 0.0641`, `environmentShare 0`, `staticShare 0.5859`, `dynamicShare 0.1094`, `otherShare 0.2406`; `moved.budgetBands.allInBand: false` with `openShare 0.044`. `environmentShare: 0` cannot be right for a frame that visibly contains buildings, and 22–24 % of samples are unclassified. `design-lock.md` §08 now declares "The runtime screen-space probe is not the gate" and reports 64.5 / 19.3 / 10.4 / 5.8 from DOM-box rasterisation of the HTML. Those are two different measurements of two different objects; neither is reconciled with the other. | Fix the probe/classifier so `environment` is populated and `other` is accounted for, re-run `scripts/capture_v4_design_evidence.mjs`, and report one measurement. Then either fix the composition until it passes, or amend `gameplay-composition-contract.md` §2 to state explicitly that the band is measured on the design source — and delete gate item 4's reference to the screenshot, which currently points at a measurement that fails. |
| N2 | 08 | BLOCKER | The captured cell contains no `T4` or `T5` object at all, so the progression-legibility rule cannot be satisfied. `gameplayComposition.tierCounts` is `{"1":20,"2":1,"3":0,"4":0,"5":0}` with `highestVisibleTier: 2` in the opening capture, and `{"1":15,"2":1,"3":0,"4":0,"5":0}` in the moved capture. `gameplay-composition-contract.md` §6 requires a low-level player to **see** a `T4`/`T5` target inside the first cell and be unable to swallow it. | Place `T4`/`T5` per the generator weights (`T4 8 / T5 2`) and the 8.0 m spacing floor, then re-capture and re-check `highestVisibleTier`. |
| N3 | 08 | MAJOR | The runtime resource distribution is the exact regression the contract was written to forbid. `gameplayComposition` reports `singles: 0`, `smallGroups: 0`, `hotspots: 20` of 21 collectibles, `hotspotShare: 0.9524`, `largestProximityGroup: 21`; the moved capture is 15/16 hotspots with `largestProximityGroup: 16`. §4 requires Singles 50–60 %, Small groups 25–35 %, Hotspots 10–15 %, and explicitly forbids "a single hotspot surrounded by a dozen or more objects". | Fix the generator's distribution and re-measure. Note the grouping metric may itself be over-grouping — either way the committed evidence cannot demonstrate the required cadence, so it cannot be used to pass §4. |
| N4 | 08 | MAJOR | The reference is not the frame it claims to be, and its camera does not match the product. `design-lock.md` §08 now asserts "This reference is a **single real gameplay frame**, not a diagram of one", but the file's provenance is `DETERMINISTIC_LAYOUT_RENDER` from `08-endless-gameplay.html`. Comparing it against `cocos/docs/evidence/v4-design/v4-390x844-08-endless-gameplay.png`: the runtime frame is 3/4-perspective low-poly with volumetric buildings, a crosswalk, a truck and a red car; the reference is top-down orthographic with flat rectangles. The reference also shows region 回收广场 while the captured runtime region is 卧室杂物区. | Either amend §08 back to "deterministic layout lock, not a literal frame", or re-render the reference from a real runtime capture so the camera, region and object treatment match the product. Do not leave a document claiming a render is a screenshot. |
| N5 | 08 (runtime) | MAJOR | HUD lateral padding and row count are violated at 390×844. In the captured frame the coin pill is flush to and clipped by the left frame edge and the pause button is clipped by the right edge, against §Global System "Lateral padding ≥ 24 px for any interactive element". The HUD also occupies three rows reaching ≈24 % of the frame height, against §08 "one row, y ≤ 100". The measurement's own `hudExclusion.topRatio: 0.16` is smaller than the HUD it is meant to exclude. | Apply the safe-area root to the HUD pills and pause button at 390×844, collapse the HUD to one row, and widen `hudExclusion.topRatio` to match the real HUD. |
| N6 | 08 (runtime) | MINOR | The level card renders the mass unit as `质量 0-kg`. Confirm whether this is a stray separator or a real formatting defect. | If stray, fix the label format string. |
| N7 | 08 (runtime) | MINOR | The bottom-centre of the runtime frame carries a large dense dark mass (a black flower-shaped cluster with orange blobs) occupying a substantial part of the lower frame. §08 forbids "满地垃圾" and requires the central gameplay region to stay as complete as possible. | Confirm what this object is; if it is a resource cluster, reduce its footprint or move it out of the lower centre. |

## Resolution status

| ID | Status | Evidence |
| --- | --- | --- |
| B1 | PARTIALLY_RESOLVED | Verified by re-reading the PNGs. `05`: the `禁止：VIP · 首充 · 签到 · 邮件 · 好友 · 战令 · 抽奖 · 复杂红点` line is gone. `08`: all tier chips (`T1`…`T5`), the `资源热点` chip and the four percentage pills are gone; the `T5 ·` prefix is dropped from the lock-mark while `需要 LV.5` is kept. `09`: both bottom bars (`大型目标不是「碰到就消失」…`, `允许：轻微拖尾…`) are gone. **`10` still paints `短暂显示 ≤ 2s · 不遮挡中央玩法区 · 无全屏升级页` directly under the upgrade banner.** The rule is recorded in `design-lock.md` §08 "One page per image — and no commentary inside the image". Remove the remaining `10` pill to close this. |
| B2 | RESOLVED | `scripts/capture_v4_design_evidence.mjs` exists and is a real Playwright runner against a live `?qa=1` Web Mobile build (read: header and setup, lines 1–41). `cocos/docs/evidence/v4-design/v4-design-evidence.json` records `viewport 390x844` and **7** frames (home, modeSelect, endlessReady, arenaReady, endlessGameplay, tierUpgrade, endlessGameplayMoved). I opened the `endlessGameplay` frame. The evidence gap is closed — but the measurement recorded in it fails; see N1. |
| B3 | ACKNOWLEDGED_NOT_FIXED | `design-lineage.md` §7 now carries `KIMI3_DESIGN_REVIEW = NOT_SATISFIED` and the corrected `KIMI3_EXPLICIT_TEAM_ROUTING = AVAILABLE_AT_SPAWN`, with the record-15 switch documented. Verified. Gate item 6 remains unsatisfied by construction. |
| M1 | REVIEWED — still wrong | The incorrect sentence is `design-lock.md` §03: "Locked essentials: back button, title banner, exactly **two** live cards (Endless Exploration, Arena Brawl). No locked cards, no "coming soon", no VIP, no friend rooms." Re-read `03-mode-select.png`: it shows **four** cards. `竞技吞噬` (多人竞技, `实时对战，吞噬最强对手!`, badge `4人对战`) and `无尽吞噬` (生存挑战, `无限地图，挑战更高分数!`, badge `最高分 35680`) are live. `黑洞乱斗` (团队混战, `3V3 团队对抗，策略致胜!`) and `限时冲榜` (限时挑战, `限定时间内，冲击排行榜!`) are **locked**, each with a padlock and a `观看视频解锁` button. So the count is wrong, the names are wrong (neither live card is "Arena Brawl"), and "No locked cards" is wrong. The title bar also carries a lightning counter `19`, a `00:33` timer and three circular chrome buttons. It should read: "Locked essentials: gold back button, `模式选择` title with lightning counter and session timer, four stacked cards — `竞技吞噬` and `无尽吞噬` live, `黑洞乱斗` and `限时冲榜` locked behind `观看视频解锁`. No VIP, no friend rooms." Separately: the `观看视频解锁` ad-unlock contradicts `ui-gap-audit.md` `BLOCKED_EXTERNAL_CONFIG`. |
| M2 | REVIEWED — still wrong | The incorrect sentence is `design-lock.md` §02: "Locked essentials: dimmed battlefield veil, single focal card, dizzy cartoon black-hole avatar, countdown ring 5→0, primary REVIVE CTA, muted GIVE UP text button. No fake ad progress." Re-read `02-revive.png`: the veil is correct, but (a) there is **no card face** — it is a large `复活` / `继续` lockup in violet-pink with an orange/yellow/cyan swoosh over a teal disc; (b) the countdown is a dark pill reading `倒计时: 5`, **not a ring**; (c) `免费复活` is a **violet** pill carrying a **video/ad glyph**, so the primary revive CTA is not the gold one; (d) `我怂了，溜了` is a **filled gold pill**, not a muted text button — the gold emphasis sits on the give-up action; (e) the ad glyph contradicts "No fake ad progress". It should read: "Locked essentials: dimmed battlefield veil, a `复活` / `继续` lockup over a teal disc (no card face), a dark `倒计时: N` pill, a violet `免费复活` button with an ad glyph, a gold `我怂了，溜了` button. Note: gold emphasis is on the give-up action and the revive button carries an ad entry that `ui-gap-audit.md` currently reports as hidden." The "dizzy cartoon black-hole avatar" claim I could not confirm either way. |
| M3 | DISPUTED — resolved by changing the measurement | `design-lock.md` §08 now reports `64.5 / 19.3 / 10.4 / 5.8`, all "IN BAND", measured by rasterising the live DOM boxes of `08-endless-gameplay.html` on a 72×128 grid. Verified in the document. But the **runtime** evidence in the same bundle reports `openShare 0.0641 / 0.044` and `allInBand: false` (N1). The lock also states "The runtime screen-space probe is not the gate", which is a change of gate definition. My own read of the rebuilt `08` render: open ground plausibly ≈60 % (in band), environment ≈16 % (in band), but static looks like ≈15–18 % (at or above the 10–15 % band) and dynamic ≈1–3 % (below the 5–10 % band) — I do not reproduce 10.4 % static and 5.8 % dynamic by eye. My read of the real runtime frame: visually mostly open road, i.e. the crowding concern is **not** confirmed by pixels. |
| M4 | RESOLVED | Verified in the rebuilt `08`: the building row is now separated blocks (blue top-left, orange top-right with a clear gap between them, plus green-roofed left, purple/pink right, pink bottom-left) rather than an unbroken wall. |
| M5 | PARTIALLY_RESOLVED | The rebuilt `08` spreads objects much better, but by my count roughly 7 objects still sit within ~250 px of the hole, and one red car sits inside the dashed suction ring ~100 px from the rim. The annulus is not clear. |
| M6 | RESOLVED (render) | In the rebuilt `08` the lock-marked target (`需要 LV.5`) sits at the top of the frame, well clear of the joystick rectangle, and the `T4` label is gone. However the underlying requirement is unmet at runtime — see N2. |
| M7 | PARTIALLY_ADDRESSED | Buildings in `05`/`08`/`09`/`10` are now 2.5D boxes with a skewed roof face plus a wall face, matching the master's roof+wall read. Confirmed. A full perspective projection was **not** applied: the references remain orthographic, while the real runtime frame is 3/4 perspective. The gap is now proven by direct comparison, and it is recorded as N4. |
| M8 | RESOLVED | Verified: `07` now uses the same blue/cyan page gradient as `06`; violet survives only as the arena preview floor. |
| M9 | PARTIALLY_ADDRESSED | `06`'s preview is now slightly more map-like (blue/orange/green blocks, a grey road, trees, the black hole) but is still flat, not a low-poly city thumbnail. `07`'s preview is a violet floor with two dashed rings and five black holes — still a diagram. The `地图预览` / `竞技场预览` captions remain. |
| M10 | PARTIALLY_RESOLVED | Verified: chip 5 moved to the left edge at ≈y 1043/1280 (the stated y=1036) and is mostly readable. The black hole's outer glow still overlaps the right end of the chip, and its final character is not legible. |
| m1 | NOT_ADDRESSED | Pause is still dark navy in `08`/`09`/`10`; master `01`'s is gold. |
| m2 | RESOLVED | The rebuilt `08` has no bright green vertical strip at the right edge; the right-edge content is now a road running off-frame plus a small red car. |
| m3 | NOT_ADDRESSED | In the rebuilt `09`, the car at position 2 is still the same size and orientation as position 1; nothing in the pixels shows reduced speed. |
| m4 | NOT_ADDRESSED | Chip 6 now reads `6 · ABSORBED 已吞入` while a red car remnant is still visible at ≈(275, 845). |
| m5 | NOT_ADDRESSED | `09` still carries 6 chips for the 10-phase chain; `APPROACH` / `SHRINK` / `SINK` still share label 5. |
| m6 | NOT_ADDRESSED | Chip 2 is still crimson. |
| m7 | NOT_ADDRESSED | `解锁更大目标` is still gold in `06`. |
| m8 | NOT_ADDRESSED | `05`'s 模式 / 机器 / 皮肤 are still filled dark navy cards. |
| m9 | PARTIALLY_RESOLVED | The annotation is gone, so the safe-margin and 设置-button collisions are cleared. The bottom-left tree still overlaps the lower-left corner of the 模式 card. |
| m10 | PARTIALLY_RESOLVED | CTA now sits at ≈72 % (locked 70 %) — much closer. The secondary row is at ≈88 % vs the locked 80 %. |
| m11 | NOT_ADDRESSED | `03`'s title is still a thin blue outline while `05`/`06`/`07` use a heavy black one. |
| m12 | SUPERSEDED | The `T5` chip no longer exists in `08`, so the labelling ambiguity is gone. The substantive question is now N2: no `T4`/`T5` exists at runtime at all. |
| m13 | NOT_ADDRESSED | `地图预览`, `竞技场预览` and `1 v 7` are all still present and still overlap the preview artwork. |
| n1 | NOT_ADDRESSED | The `10` banner is unchanged in width. |
| n2 | NOT_ADDRESSED | `10` still carries `升级！`, `解锁更大型目标` and the gold progress bar. |
| n3 | NOT_ADDRESSED | `09`'s outer ring is still the largest graphic in the frame. |

## Adjudication — final status after W13 / W16 / W17

The table above is the reviewer's status at the time of their pass. A later polish
round (W13, W16, W17 in `implementation-map.md`) then addressed most of the rows the
reviewer had marked `NOT_ADDRESSED`. This section records the **final** status with
the evidence used, so the two tables are not confused. Adjudicated by the lead, not
by the reviewer; the rows above are left unedited.

| ID | Final status | Evidence |
| --- | --- | --- |
| B1 | **RESOLVED** | `grep -c "≤ 2s\|不遮挡\|禁止\|允许"` over `source/*.html` returns **0** for every page. The last remaining annotation (`10`'s pill) is gone, so no reference paints commentary into the image. |
| m1 | **FIXED** | New shared `.btn-pause` in `_shared.css:134` uses the gold CTA gradient `linear-gradient(180deg, var(--cta-1), var(--cta-2))` with `5px solid var(--ink)` and `--gold-ink` glyphs — master `01`'s gold square. Used by `08`/`09`/`10`. Confirmed visually in the rebuilt `08`. |
| m3 | **FIXED** | `09` beat 1 carries a 3-streak trail; beat 2 carries a single 20 px dash and is scaled `.90` / rotated −6°, with the beat-to-beat centre gap reduced 182 px → 152 px. "Speed drops" now reads from the pixels. |
| m4 | **FIXED** | Only 9 car elements are drawn (beats 1–9); the `ABSORBED` beat draws **no** car at all, and the `SINK` car is `scale .25` painted before the hole so the rim occludes it. |
| m5 | **FIXED** | `09` now carries **8** chips. Verified from source: `5 · APPROACH 靠近核心`, `6 · SHRINK 体积缩小`, `7 · SINK 沉入地面`, `8 · ABSORBED 已吞入` — each phase owns its own chip. |
| m6 | **FIXED** | `.chip.hot` no longer exists; chip 2 is `.chip.phase` with `border-color:#00C0FF` (cyan). No crimson phase label remains in `05`–`10`. |
| m7 | **FIXED** | `06`'s `.intro .l2` (`解锁更大目标`) is `#E3ECF7` muted white (`06-endless-ready.html:53`); `开始探索` is the page's only gold. |
| m8 | **FIXED** | `05`'s `.row .item` is now outlined — `background: rgba(11,18,32,.20)` with `border: 6px solid rgba(255,255,255,.82)` (`05-home.html:60-62`) — not a filled navy card. |
| m9 | **FIXED** | The bottom-left tree moved `(0,1036)` → `(16,1136)`. Row box `x 64..584, y 972..1088`; tree box `x 16..104, y 1136..1224`. No overlap; 56 px bottom margin. |
| m10 | **FALSE POSITIVE** | Measured directly from `05-home.png`: the gold CTA spans y 840–952 ⇒ centre **896 = 70.0 %** against the locked `y ≈ 900`; secondary row centre 81.3 % against `y ≈ 1030`; corner 设置 centre 93.4 % against `y ≈ 1200`. All match. The review's "≈72 % / ≈88 %" used a different reference point. The lock's `y ≈` sketches were replaced with a measured normative table as a result. |
| m11 | **RESOLVED BY EXEMPTION** | `03` is a byte-identical copy of the V3 master `mode-select-reference.png` (SHA-256 `d9dadb61…a4dc5d`), never re-authored. Its outline weight is therefore out of scope for the `--stroke-w: 6px` token, which governs `05`–`10` only. Re-authoring `03` would break the byte-identity gate. |
| m13 | **FIXED** | `06`'s caption became `.preview-cap` below the card (`80,552→640,587`); `07`'s became `.caprow` below the card (`80,508→640,555`). Neither overlaps preview artwork. |
| n1 | **FIXED** | `10`'s upgrade banner narrowed 600 px → 560 px (83.3 % → 77.8 %); all three copy lines still fit. |
| n2 | **FIXED — and the report was partly false** | `10` now carries exactly one gold accent, the `升级！` lockup (`10-tier-upgrade-feedback.html:69,97`); `解锁更大型目标` is `#E3ECF7`. Separately, `grep -n "progress\|bar"` over `10-tier-upgrade-feedback.html` returns **nothing** — there is no gold progress bar in the file, so the third gold focal point the review describes never existed and could not be removed. |
| n3 | **FIXED** | The outer pull ring's inset went −280 px → −120 px (radius 373 → 213 px, ≈43 % smaller) and it now separates from the inner ring by weight + alpha: outer `5px dashed rgba(0,192,255,.72)`, inner `6px dashed rgba(46,123,255,.55)`. Measured separation Euclidean 42.1 → **72.3**. |
| M1 / M2 | **REVIEWER CORRECT — lock text fixed** | Both are documentation defects, not render defects, and both were real. `design-lock.md` §02/§03 were rewritten against the actual masters: §03 now says four stacked cards (two live, two locked behind `观看视频解锁`) with the lightning counter and session timer; §02 now says a `复活`/`继续` lockup over a teal disc with **no card face**, a dark `倒计时: N` pill, a violet `免费复活` button with an ad glyph, and a gold `我怂了，溜了` button. The ad-chrome contradiction with `ui-gap-audit.md` `BLOCKED_EXTERNAL_CONFIG` is now recorded rather than silently resolved. |

## What I could not verify

- **Byte-identity of `01`–`04`.** `reference-manifest.json` asserts
  `byteIdenticalToSource: true` with SHA-256 values. I did not run
  `scripts/verify_ui_v4_reference_set.mjs`, so I have not independently confirmed
  the hashes.
- **That `05`–`10` match their `source/*.html`.** The manifest lists a SHA-256
  per render. I did not re-render or re-hash, so I cannot confirm the committed
  PNGs are the current output of the current sources.
- **Whether the DOM-box rasteriser reproduces `64.5 / 19.3 / 10.4 / 5.8`.** I did
  not run `scripts/render_ui_v4_references.mjs`. I only confirmed those numbers
  are written in `design-lock.md` §08 and in `reference-manifest.json`.
- **My own band shares for the rebuilt `08`.** They are pixel estimates from a
  720×1280 render and carry roughly ±4 points of error per band. They are not a
  substitute for the measurement N1 asks for.
- **Six of the seven runtime evidence frames.** I opened only
  `v4-390x844-08-endless-gameplay.png`. I did not inspect the home, mode-select,
  endless-ready, arena-ready, tier-upgrade or moved frames, so I cannot confirm
  they depict the states they are named for.
- **Per-target capture status.** The runner's header says it reports
  `CAPTURED` / `NOT_REACHED` per target, but the committed JSON carries no such
  field that I could find. I could not confirm that every frame was reached
  rather than substituted.
- **Whether `probePlayableOpenAreaRatio: 0.9853515625` is a real world-space
  measurement or a carried-over default.** It is byte-identical to the recorded
  `AUTHORED_GOLDEN_CITY` baseline (≈0.9854) in
  `gameplay-composition-contract.md` §3, which is suspicious but not conclusive.
- **The `02` "dizzy cartoon black-hole avatar".** There is a teal disc behind the
  `复活` / `继续` lockup that could be read as the black hole seen from above. I
  could not determine whether it is meant to be the avatar the lock describes, so
  I made no finding either way.
- **The nature of the dark cluster at the bottom-centre of the runtime `08`
  frame** (N7). I could not determine from the image alone whether it is a
  resource cluster, the player machine, or a render artifact.

### Gaps closed after the review

Recorded by the lead. The reviewer's list above is left unedited.

- **Byte-identity of `01`–`04` — CLOSED.** The reviewer looked for a script named
  `scripts/verify_ui_v4_reference_set.mjs`, which does not exist. The check already
  lives in `scripts/test_ui_v4_design_contract.mjs` as `V4_INHERITS_V3_*` (SHA-256
  of each `ui-v3` master vs its `01`–`04` copy) and now also
  `V4_MASTER_COPY_SOURCE_INTACT`. Both pass. **No new script was created** —
  adding one would have duplicated an existing gate.
- **That `05`–`10` match their sources — CLOSED.** `V4_MANIFEST_MATCHES_ARTIFACTS`
  (added after the review) re-hashes all ten files and compares against the
  manifest's recorded `sha256` **and** byte count. This was a genuine gap: nothing
  previously cross-checked the manifest against the artifacts, so a re-render that
  forgot to regenerate the manifest would have desynced them silently.
- **The DOM-box rasteriser's `64.5 / 19.3 / 10.4 / 5.8` — CLOSED.**
  `V4_REFERENCE_08_SPACE_BUDGET_IN_BAND` now asserts all four shares against their
  bands from the manifest, and the renderer was re-run: it reproduces the same four
  numbers.
- **N7, the dark mass at the bottom-centre of the runtime `08` frame — CLOSED.**
  It is the authored park props cluster at `z ≈ +7` in `GoldenCityCell.prefab`
  (`Cluster_Park` / `Cluster_CitySquare`). It is legitimate environment geometry,
  not a resource pile, so it does not violate §08's 满地垃圾 rule. It is also the
  source of the `≈1.48 m` tutorial spacing (see `design-lock.md` `GAP-08-CADENCE`),
  which is an `INTENTIONAL_TUTORIAL_EXCEPTION`.
- **Per-target capture status — CLOSED.** The runner reports
  `targets.drive.*` / `targets.<screen>` with `CAPTURED` / `NOT_REACHED` per target
  in `cocos/docs/evidence/v4-design/v4-design-evidence.json`, so substituted frames
  can no longer pass unnoticed.
- **Still open, and not claimed as closed:** the reviewer's six unopened runtime
  frames, their own ±4-point band estimates, and the `02` "dizzy cartoon black-hole
  avatar" question. Gate item 6 (Kimi-K3 authorship) remains
  `KIMI3_DESIGN_REVIEW = NOT_SATISFIED` by construction.
