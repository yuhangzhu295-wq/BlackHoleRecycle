# UI Design Audit — PHASE 7

Scope: the 10-page UI reference set and its relationship to the runtime.
Method: read the governance files, the gate scripts, the runtime acceptance report,
and measure the reference rasters directly. Every number below is either read from a
named field or measured from a named file.

Verdict summary:

| Area | Verdict |
| :--- | :--- |
| Reference→Runtime→Diff→Fix→Screenshot→Lock loop | **BLOCKED** — see §5 |
| Reference set integrity | PASS (gated by `test_ui_v4_design_contract.mjs`) |
| Runtime conformance to reference | **NOT_GATED** — no gate compares them (§4) |
| Visual review by an independent reviewer | **NOT_AVAILABLE** (§6) |
| Projection comparability of the capture set | **FAIL** at the captured viewport (§1) |

---

## 1. The reference set and the runtime are captured under different projections

This is the constraint that governs everything else in this document.

Two cameras draw the same screen, with **different** policies:

| Layer | Policy | Source |
| :--- | :--- | :--- |
| Gameplay world | `ResolutionPolicy.FIXED_WIDTH` | `camera/PortraitGameplayCameraController.ts:45-48` |
| UI (`UICamera`) | fit-height — `orthoHeight = 640` (= `designHeight / 2`) | serialized in `Game.scene → Canvas/UICamera`; documented in `ui/HudSafeAreaInset.ts:6-10` |

So the UI layer always shows design height `1280`, and its visible design **width**
collapses on anything narrower than 9:16. Reading `frame` and `visible` from
`acceptance-report-full.json → initialLayout`:

| Frame | Frame ratio | UI-visible design width | Design width cropped | World-visible design height | Extra vs 1280 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 375×667 | 0.56222 | 719.64 | **0.36 px (0.05 %)** | 1280.64 | 0.64 |
| **390×844** | 0.46209 | 591.47 | **128.53 px (17.9 %)** | 1558.15 | 278.15 |
| 430×932 | 0.46137 | 590.56 | **129.44 px (18.0 %)** | 1560.56 | 280.56 |
| reference `05-home.png` | 0.56250 | 720.00 | 0.00 | 1280.00 | 0.00 |

`initialLayout.visible = { width: 720, height: 1558.1538461538462 }` is the report's own
statement of the second column's consequence, and `1558.1538 = 720 / 0.46208530805687204`
exactly.

**Consequence.** The reference set is a 720×1280 (9:16) raster. A pixel comparison
against a 390×844 capture would compare a 720-wide layout against a viewport showing
only 591.47 of those design px — **a 17.9 % lateral crop**. Such a diff is
geometrically invalid and its score would be meaningless.

**Only 375×667 is projection-comparable** (0.05 % mismatch, sub-pixel). And of the
runtime captures, only the Home page exists at that viewport: every other page
screenshot in `scripts/test_cocos_portrait_acceptance.mjs` is written to a hardcoded
`portrait-390x844-*.png` path. The three-viewport loop (`:3009`, `:3680`) captures
`portrait-{375x667,390x844,430x932}-home.png` and nothing else.

⇒ **9 of the 10 pages have no reference-comparable runtime capture.** The
Reference→Runtime→Diff step cannot be performed for them with the current evidence set.

---

## 2. Two lock authorities disagree

The repository contains two documents that both claim to govern the UI lock. They
disagree on page count, on the reference image for `home`, and on status.

| | `cocos/docs/design-lock.json` (V2) | `ui-v4-expanded/design-lock.md` (V4) |
| :--- | :--- | :--- |
| Pages governed | **5** (`home`, `mode_select`, `arena_hud`, `revive`, `settlement`) | **10** (`01`–`10`) |
| `home` reference | `docs/design-reference/v2-01-home.png` (941×1672) | `05-home.png` (720×1280) |
| `home` status | **`PENDING_EVIDENCE`** | covered by header status `LOCKED (layout + composition)` |
| Evidence present | `evidence: []` — **zero** | not tracked per page |
| Required evidence | 5 artifacts, incl. `overlay_or_diff_report`, `independent_subgate_results` | prose gate list |
| Read by | **nothing** (§4) | `test_ui_v4_design_contract.mjs`, `capture_v4_design_evidence.mjs` |

`design-lock.json` declares `policy.lockRule = "Only all-PASS subgates with current
evidence may set status to LOCKED."` Its own records show all 5 pages at
`PENDING_EVIDENCE` with all 6 subgates `PENDING_EVIDENCE` and no evidence. So by its
own rule, **nothing is locked in that file** — while the V4 markdown asserts a lock.

---

## 3. The V2 `home` reference is superseded and must not be used

`design-lock.json` names `docs/design-reference/v2-01-home.png` as `home.reference`.
That image is a **different product**:

| Aspect | `v2-01-home.png` | Shipping product |
| :--- | :--- | :--- |
| Title | **黑洞大作战** | **黑洞回收站** |
| Tagline | 吞噬一切 · 成为最强黑洞 | — |
| Top bar | avatar + 1256, coin 12,345, energy 30/30, green `+` buttons | coin pill + machine level pill, no `+` |
| Left rail | 排行榜 / 幸运转盘 / **首充礼包** / **邮件** / 任务 / 每日奖励 | absent |
| Bottom tab bar | 成就 / 称号 / 主页 / **好友** / 设置 | absent |
| Third nav card | **商店** (shop) | `BtnMachine` (机器) |

Three of those affordances are explicitly forbidden by the V4 lock
(`ui-v4-expanded/design-lock.md`, §05 Non-negotiables):

> Forbidden: VIP, 首充 (first recharge), 签到 (check-in), 邮件 (mail), 好友 (friends) …

`v2-01-home.png` shows **首充礼包**, **邮件**, and **好友**. It therefore cannot be the
basis of a conformance check: implementing it faithfully would violate the V4 lock.

**Disposition: the `home` entry in `cocos/docs/design-lock.json` is stale. Do not treat
it as authoritative.** Correcting it changes which artifact the design gate is supposed
to enforce, so it is an owner decision, not an engineering edit (§7).

---

## 4. No gate compares the runtime against any reference

The three gates that exist, and what each actually reads:

| Gate | Reads | Asserts | Compares to runtime? |
| :--- | :--- | :--- | :--- |
| `test_ui_v4_design_contract.mjs` | the 10 reference PNGs + `reference-manifest.json` | files exist with locked names; `01`–`04` byte-identical to V3 masters; declared canvas; per-file sha256 + byte count; the `08` space-budget band | **No** |
| `test_home_layout_contract.mjs` | `design-contracts/home.json` + `HomePageVisual.ts` | `HOME_LAYOUT` equals the contract, entry by entry | **No** |
| `design-lock.json` | — | declares the lock policy | **No** (read by nothing) |

Two independent gaps follow, and they are the reason §5 is blocked rather than failed:

1. **The layout gate is self-referential.** It asserts
   `HOME_LAYOUT === design-contracts/home.json`. It never opens the locked reference
   render or the lock document. So if `home.json` itself drifted away from the locked
   design, the suite would still pass — it validates *internal consistency*, not
   *conformance*. (`test_home_layout_contract.mjs:24` also self-reports `NON_RUNTIME`,
   as `design-lock.md` acknowledges.)
2. **The reference gate is integrity-only.** It proves the reference PNGs have not been
   tampered with. It never renders the product, so a product that drifted away from the
   references is invisible to it.

⇒ **The Reference→Runtime→Diff link is absent from automation entirely.**

The project's own gate agrees, in its own output. `npm run test:contracts` prints from
`test_ui_v4_design_contract.mjs`:

> `[NOTE] 08 space budget and the ten references still require a real 390x844 runtime capture and a visual review; this test does not claim either.`

and `test_home_layout_contract.mjs` labels its own 8 assertions
`NON_RUNTIME; runtime acceptance remains required`. Both gates are honest about not
being conformance evidence — which is exactly why §5 cannot be closed by citing them.

### 4.1 Measured drift this exposes

Because nothing gates it, the contract and the locked reference have already diverged.
`home.json` (`designSpace.origin = top-left`) versus `05-home.png`, measured directly
from the raster:

| Element | `05-home.png` (measured) | `design-lock.md` §05 | `design-contracts/home.json` | Runtime |
| :--- | :--- | :--- | :--- | :--- |
| Gold CTA `开始吞噬` centre y | **896** (70.0 %) — band 842–949 | `y ≈ 900`; table says "centre 896, 70.0 % ✓" | `BtnStart` **952** (74.4 %) | **952** |
| Secondary row centre y | ~1073 (icon row) | table says "centre 1040, 81.3 % ✓" | `BtnMode/BtnSkin/BtnMachine` **1108** (86.6 %) | **1108** |
| Secondary row order (L→R) | 模式 / 机器 / 皮肤 | 模式 / 机器 / 皮肤 | 模式 / **皮肤** / 机器 (x = 152 / **360** / 568) | 152 / **360** / 568 |
| `设置` corner | present, bottom-right | `y ≈ 1200`; table says "centre 1195, 93.4 % ✓" | **absent from the contract** | present, design y = 100 (92.2 %) |

The gold-CTA measurement independently reproduces the lock's own figure exactly
(band 842–949 vs its "840–952"; centre 896 vs its 896; 70.0 % vs its 70.0 %). So the
lock's *measurement* of the reference is sound — which makes the 56 px gap between the
reference (896) and the contract (952) a real divergence rather than a measuring error.

The runtime follows `home.json`, so the **runtime does not match the locked reference**
for the primary CTA. The CTA is 56 design px (4.4 pp) lower than the locked reference.

### 4.2 A false positive, recorded so it is not re-filed

Reading only `design-lock.md` and the screenshot suggests the runtime has the secondary
row in the wrong order (runtime 模式/皮肤/机器 vs lock 模式/机器/皮肤), which would be a
player-visible defect.

**It is not a product defect.** `design-contracts/home.json` declares
`BtnMode x=152`, `BtnSkin x=**360**`, `BtnMachine x=568`, and the runtime reports
exactly `152 / 360 / 568`. The runtime implements its contract faithfully. The
disagreement is between the *contract* and the *lock document*, not between the product
and either. The lock document is the stale side.

---

## 5. Why the loop cannot be closed

The mandated loop is Reference → Runtime Screenshot → Visual Diff → Fix → Screenshot →
Lock. Each link, in this repository:

| Link | Status | Blocking reason |
| :--- | :--- | :--- |
| Reference | **AMBIGUOUS** | two lock authorities, two `home` references (§2); the V2 one is superseded and forbidden-feature-bearing (§3) |
| Runtime screenshot | **PARTIAL** | only Home is captured at a projection-comparable viewport (§1) |
| Visual diff | **IMPOSSIBLE as specified** | 9/10 pages have no comparable capture; and no diff gate exists to run (§1, §4) |
| Fix | **BLOCKED** | the only quantified drift (§4.1) is a product-vs-contract choice needing owner sign-off (§7) |
| Screenshot | — | depends on the above |
| Lock | **FORBIDDEN by the project's own rule** | `design-lock.json → policy.lockRule` requires all-PASS subgates with current evidence; the file records `evidence: []` and `independent_subgate_results` is unobtainable (§6) |

Verdict: **PHASE 7 cannot reach `LOCKED`.** This is a genuine blocker, not a
tooling gap that can be worked around by lowering the bar.

---

## 6. `VISUAL_REVIEW = NOT_AVAILABLE`

There is no independent visual reviewer in this environment. The image inspections in
§3 and §4.1 were performed by the same agent that read and reasoned about the source
and gate code, which is **not** independent review. The `independent_subgate_results`
artifact required by `design-lock.json` is therefore **unobtainable**, and the six
subgates (`layout`, `style`, `typography`, `color`, `asset`, `elements`) remain
`PENDING_EVIDENCE` in that file's terms.

Everything reported above is measurement, not judgement: sizes, coordinates, ratios,
sha256s, and named report fields. Where judgement would be required — "does this look
like the reference" — this audit does not claim a result.

---

## 7. Open items requiring an owner decision

1. **Which document governs the UI lock?** `design-lock.json` (5 pages, all
   `PENDING_EVIDENCE`, read by nothing) or `ui-v4-expanded/design-lock.md` (10 pages,
   asserts `LOCKED`). One must be designated authoritative and the other marked
   superseded, or the conformance target is undefined.
2. **Which `home` reference is authoritative?** `v2-01-home.png` (941×1672, 黑洞大作战,
   contains 首充/邮件/好友 which the V4 lock forbids) or `05-home.png` (720×1280,
   黑洞回收站). Recommendation: retire the V2 entry, since it contradicts the shipping
   product name and the V4 Non-negotiables.
3. **Primary CTA position — product or reference?** The locked reference places it at
   centre y = 896 (70.0 %); the enforced contract and the runtime place it at 952
   (74.4 %), a 56 px difference. Resolving this moves a player-visible element, so it
   is a design decision. **Do not change `design-contracts/home.json` unilaterally** —
   that is the same class of change as moving a locked threshold.
4. **Secondary row order — contract or lock?** The contract and runtime agree on
   模式/皮肤/机器; the lock prose says 模式/机器/皮肤. Recommendation: correct the lock
   prose to match the contract, since the contract is what the layout suite enforces
   and the runtime already conforms.
5. **`设置` is in the lock and the runtime but absent from `home.json`.** Either add it
   to the contract or record that it is intentionally ungated.

---

## 8. Evidence coverage and limits

- **Read from report fields:** `initialLayout.{design,visible,frame,portrait,canvas,uiCamera}`,
  `initialLayout.{start,mode,skin,machine,settings}`, `viewports[]` — all from
  `artifacts/qa/portrait/acceptance-report-full.json` (`status: PASS`,
  `failures: []`, `consoleErrors: []`, `BUNDLE_STABLE`, 187 files,
  start == end `05aa411e`, mtime 2026-09-22 18:36).
- **Measured from rasters:** `05-home.png` (gold-CTA band and the secondary row's card
  runs) via `scripts/measure_home_reference_cta.py` and
  `scripts/measure_home_reference_nav.py` — both run from the repository root and
  reproduce the numbers quoted in §4.1;
  `v2-01-home.png` and `05-home.png` dimensions.
- **Read from source:** `HudSafeAreaInset.ts`, `PortraitGameplayCameraController.ts`,
  `HomePageController.ts`, `test_home_layout_contract.mjs`,
  `test_ui_v4_design_contract.mjs`, `design-lock.json`, `design-lock.md`,
  `design-contracts/home.json`, `test_cocos_portrait_acceptance.mjs`.
- **Not done, and not claimed:** a pixel-level diff of any runtime capture against any
  reference; any style/typography/colour judgement; review of pages `01`–`04` and
  `06`–`10` against their references (no comparable capture exists — §1); any
  independent visual review (§6).
- The UI-visible-width figures in §1 are derived from `initialLayout.frame` and the
  documented `orthoHeight = 640`, and are cross-checked against the report's own
  `initialLayout.visible.height` (`1558.1538461538462`), which matches
  `720 / 0.46208530805687204` exactly.
