# UI V4 Expanded — Design Lineage

## 1. What V4 Is

V4 is an **extension**, not a redesign.

```
V4 = V3 four locked masters (unchanged)
   + six new pages / mechanic references
```

The four V3 masters were locked on 2026-09-17 and are treated as immutable
inherited assets. V4 does not re-author, re-tint, re-crop, or re-typeset them.
It adds the six screens and mechanic references that the shipping product still
lacks, using the same visual language.

## 2. Inherited Masters (must not be re-authored)

| # | V4 filename | Lineage | V3 source file | Pixels |
| --- | --- | --- | --- | --- |
| 01 | `01-arena-gameplay.png` | V3 master 01 | `ui-v3/arena-hud-reference.png` | 538×957 |
| 02 | `02-revive.png` | V3 master 02 | `ui-v3/revive-reference.png` | 541×957 |
| 03 | `03-mode-select.png` | V3 master 03 | `ui-v3/mode-select-reference.png` | 544×955 |
| 04 | `04-settlement.png` | V3 master 04 | `ui-v3/settlement-reference.png` | 538×964 |

These four files are **byte-identical copies** of the V3 masters. The V3
originals remain in `ui-v3/` untouched. Copying (not moving) preserves the V3
lineage record while giving V4 a single flat, ordered 10-file directory.

Verification of byte identity is part of the V4 design gate:

```bash
node scripts/verify_ui_v4_reference_set.mjs
```

## 3. New Extensions

| # | V4 filename | Lineage basis | Status |
| --- | --- | --- | --- |
| 05 | `05-home.png` | V3 `design-lock.md` §1 Home + V2 fallback `v2-01-home.png` | NEW |
| 06 | `06-endless-ready.png` | Derived from V3 Mode Select card language + `ModeReadyPageController` reality | NEW |
| 07 | `07-arena-ready.png` | Same as 06, Arena variant | NEW |
| 08 | `08-endless-gameplay.png` | Extends V3 master 01 (Arena HUD) into the Endless composition | NEW |
| 09 | `09-large-target-suction.png` | Gameplay Mechanic Reference — no V3 ancestor | NEW |
| 10 | `10-tier-upgrade-feedback.png` | Gameplay Mechanic Reference — no V3 ancestor | NEW |

## 4. Inheritance Contract

Every new page must inherit the following from the V3 masters. Deviating from
any row is a design regression and must be reported, not silently accepted.

### 4.1 Colour tokens

| Token | Value | Inherited use |
| --- | --- | --- |
| `--cta-primary` | `#FFD000` → `#FFA000` gradient | Primary affirmative CTA only. One per screen. |
| `--accent-cyan` | `#00C0FF` / `#2E90FA` | Information panels, mode cards, auxiliary actions. |
| `--accent-violet` | `#8B5CF6` / `#7C3AED` | Banners, competitive headers, ranking. |
| `--alert-crimson` | `#EF4444` / `#F43F5E` | Lock warning, defeat, timer urgency. |
| `--surface-panel` | `rgba(15,23,42,0.55–0.70)` | Frosted panel behind text over 3D. |
| `--card-cream` | `#FFFDF5` | Result / modal card faces. |
| `--text-on-dark` | `#FFFFFF` | All text over frosted panels. |
| `--text-on-light` | `#1F2937` | All text on cream card faces. |

### 4.2 Type and stroke

- Sans-serif, high legibility, **large** for mobile.
- Title scale: 1.0× of V3 master title height.
- Body scale: never below 0.85× of the V3 master body height.
- Every text element over the 3D world carries a **dark outline or drop shadow**.
  No text is allowed to rely on background contrast alone.
- Outline weight is uniform across the ten pages. A heavier outline on one page
  is a lineage break.

### 4.3 Card and button language

- Corner radius ≤ 16px at 720×1280 design scale.
- Buttons are pills or rounded rectangles. No square-cornered buttons.
- Primary CTA: gold fill, dark-brown text or white text with dark outline,
  bottom-heavy placement, height ≥ 88px at 720×1280.
- Secondary CTA: outlined or muted slate. Never gold.
- Exactly one gold CTA per screen.

### 4.4 HUD language

- Status readouts are **frosted pills**, perimeter-anchored.
- Centre of screen stays clear. In gameplay, the centre 55–65 % must be
  unobstructed playable area.
- No full-width opaque shade across the top fifth (V3 master 01 behaviour, and
  `EndlessHUDController.onEnable` already disables `TopShade` for this reason).

### 4.5 Low-poly gameplay look

- Casual cartoon low-poly only. Bright, saturated, clean silhouettes.
- Thick readable outlines on world objects.
- No PBR, no realistic vehicles, no cinematic lighting, no heavy particle work.

## 5. Forbidden: A Second UI Language

The following are explicitly prohibited in any V4 page:

- A new palette that is not in §4.1.
- A new button shape, radius family, or outline weight.
- A second typeface or a second title style.
- Photo-realistic or PBR-styled panels.
- Any new HUD chrome that does not exist in V3 master 01 / 03 / 04.

If a new page appears to need a new token, the correct action is to reuse the
closest existing token and record the tension in `ui-gap-audit.md`.

## 6. Provenance and Honesty Rules

- `01`–`04` provenance: copied from `ui-v3/` masters. Verified by hash.
- `05`–`10` provenance: **deterministically rendered layout references**,
  produced by `scripts/render_ui_v4_references.mjs` from the HTML/SVG design
  sources under `cocos/docs/design-reference/ui-v4-expanded/source/`.

  These are spec-accurate composition locks, not AI concept art. They are the
  authoritative record of layout, proportion, hierarchy, colour token use and
  safe-area placement. They are **not** a substitute for final illustrated art.

  Rationale: no image-generation capability was reachable in this environment
  (see §7). Rendering the contract deterministically is honest, reproducible and
  reviewable; inventing a "generated" PNG would not be.

- A future illustrated art pass must keep these renders as the layout contract
  and may only replace the fill treatment, not the composition.

## 7. Capability Record

| Key | Value | Evidence |
| --- | --- | --- |
| `DESIGN_IMAGE_GENERATION_UNAVAILABLE` | true | `ToolSearch` by exact name for `ImageGen` and `miora_text_to_image` returned no such tool; only the `connect_cloud_service` preflight exists, with no generation tool behind it. |
| `KIMI3_EXPLICIT_TEAM_ROUTING` | AVAILABLE_AT_SPAWN | `model: "kimi-k3"` was accepted by the agent spawn and persisted in `teams/<team>/runtime.json` as `"model":"kimi-k3"`. In the subagent transcript the **first 13** model-bearing records carry `providerData.model = "kimi-k3"`; every record after that carries `"deepseek-v4.1-flash"`. |
| `KIMI3_DESIGN_REVIEW` | **NOT_SATISFIED** | The V4 design review was authored by `deepseek-v4.1-flash`, not Kimi-K3. The worker's own `MODEL` field reports `deepseek-v4.1-flash`, and the transcript shows the switch from `kimi-k3` to `deepseek-v4.1-flash` at record 15, long before the review work began. See `design-review.md` for the corrected attribution. |

Consequence — stated plainly so no later reader is misled:

- **Rasterisation** is done by the deterministic renderer
  (`scripts/render_ui_v4_references.mjs`), because no model reachable in this
  environment can emit a PNG.
- **Design authoring and design review were not performed by Kimi-K3.** The
  routing was available at spawn but did not hold for the review turn. No claim
  of Kimi-K3 authorship is made anywhere in the V4 set.
- The 6 new references are therefore **layout locks written and reviewed by the
  main development model**, and they are honestly labelled as such. If a
  Kimi-K3-routed pass is required, it must be re-run and re-attributed; the
  review content itself is model-agnostic and already recorded.
