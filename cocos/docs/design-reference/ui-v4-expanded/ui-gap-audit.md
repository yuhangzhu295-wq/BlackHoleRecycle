# UI V4 Expanded — Gap Audit

Scope: the six **new** V4 references (05–10) plus the gameplay space rules of 08.
Pages 01–04 are inherited masters and are out of scope for change.

Legend — Status: `OK` (already matches the lock) · `GAP` (real code change
required) · `DEFERRED` (blocked on Creator writeback) · `N/A`.

---

## 05 Home

| Field | Value |
| --- | --- |
| Current code | `cocos/assets/scripts/ui/HomePageController.ts`, `HomePageVisual.ts` |
| Scene root | `Game.scene → Canvas/HomePage` (+ `SafeAreaRoot`) |
| Existing behaviour | Live coin + machine data, real 模式 / 机器 / 皮肤 routes, hero skin tint, real 开始吞噬 → Mode Select |
| Gap vs lock | Title/hero/CTA hierarchy is V2-era. Bottom secondary row and the corner 设置 entry are not explicitly laid out to the V4 table. Hero art is primitive-era. |
| Code change required | Layout constants only (no new asset import, no prefab/meta/UUID edit) |
| Deferred | Illustrated hero art, real icon sprites — needs Creator sprite writeback |
| Status | **GAP (layout + copy), DEFERRED (art)** |
| Product impact | High — first impression |

## 06 Endless Ready

| Field | Value |
| --- | --- |
| Current code | `cocos/assets/scripts/ui/ModeReadyPageController.ts` (`ModeReadyKind.ENDLESS`) |
| Scene root | `Game.scene → Canvas/EndlessReadyPage` |
| Existing behaviour | Back, real best score, real `LV.X` machine, real 开始探索 → session start |
| Gap vs lock | (a) `MapPreview` still reuses the **mode-card** artwork — there is no real map preview. (b) `IntroText` is `吞噬 → 成长 → 解锁更大物体 / 持续探索无限城市，冲击更高 Mass 纪录`; the lock requires the two lines `不断吞噬 不断成长` / `解锁更大目标`. (c) `MODE_READY_LAYOUT` has no reserved rect for a rule/copy block. |
| Code change required | Copy alignment + a real vector map-preview graphic drawn with `Graphics` (no new asset import) |
| Deferred | Illustrated map thumbnail — needs Creator sprite writeback |
| Status | **GAP (copy + preview visual), DEFERRED (final art)** |
| Product impact | High — route clarity |

## 07 Arena Ready

| Field | Value |
| --- | --- |
| Current code | `cocos/assets/scripts/ui/ModeReadyPageController.ts` (`ModeReadyKind.ARENA`) |
| Scene root | `Game.scene → Canvas/ArenaReadyPage` |
| Existing behaviour | Back, real machine level, real 开始乱斗 → matchmaking |
| Gap vs lock | `StatCaption` is `对局规则` with `StatValue = 8 人 · 3:00 限时`, and `IntroText` is two prose lines. The lock requires the explicit five-line rule list: 8 人 / 3:00 / 吞噬成长 / 淘汰弱小玩家 / 躲避更大玩家. No rule list node exists. |
| Code change required | Render the five-line rule list; keep it inside the existing `IntroText` rect |
| Deferred | Illustrated arena preview |
| Status | **GAP (rule list), DEFERRED (art)** |
| Product impact | High — competitive expectation setting |

## 08 Endless Gameplay

| Field | Value |
| --- | --- |
| Current code | `EndlessHUDController.ts` + `HUDView.ts` + `Game.scene → Canvas/EndlessHUD` |
| Existing behaviour | Coin, `LV.X` + mass, region, pause, joystick, absorb feedback. `TopShade` is already disabled at runtime so the upper fifth stays visible. |
| Gap vs lock | HUD already matches the allowed set exactly. The real gap is **space**, not HUD: the lock needs a verified 55–65 % open-ground share and a singles/small-group/hotspot cadence, measured in world space and confirmed on a real 390×844 screenshot. |
| Code change required | Distribution-cadence verification; add a runtime composition diagnostic that reports the three buckets |
| Deferred | Nothing |
| Status | **GAP (verification + diagnostic), HUD OK** |
| Product impact | Highest — this is the reference that locks the play field |

## 09 Large Target Suction

| Field | Value |
| --- | --- |
| Current code | `SuctionMotion.ts`, `CompressibleObject.ts`, `DynamicVehicle.ts` |
| Existing behaviour | Real `IDLE → ATTRACTED → SUCKING → ABSORBED` chain. Per-tier `pullResistance` (T5 = 3.6), `suckDuration` (T5 = 3.2 s), `escapeRadiusFactor` (T5 = 1.15). `setSuctionSpin` gives a real vehicle visible spin. ATTRACTED targets escape back to IDLE outside the escape radius, so a car cannot be swallowed by grazing. |
| Gap vs lock | The motion exists; the **legibility** does not. There is no visible outer pull-range boundary, no direction line, and no explicit `SLOW / DEFLECT / DEPART` visual beat. A player cannot currently tell "being pulled" from "just passing by". |
| Code change required | Add a light, cheap legibility layer only: outer range indicator + direction line + phase-tinted brightness. Must not build `SuctionV2`. |
| Deferred | Any particle work |
| Status | **GAP (legibility layer)** |
| Product impact | High — this is the mechanic the whole growth fantasy rests on |

## 10 Tier Lock / Upgrade Feedback

| Field | Value |
| --- | --- |
| Current code | `CompressibleObject.showLockAlert()` |
| Existing behaviour | `需要 LV.X` label, floating above the body, 1.4 s show, 3.5 s cooldown, crimson `#FF5C5C`. The old red traffic-cone "hat" was removed and must stay removed. Locked targets creep toward a standoff ring and never enter the swallow chain. |
| Gap vs lock | State A (lock) matches. **State B (upgrade) does not exist at all** — there is no `升级！/ LV.X XXX黑洞 / 解锁更大型目标` feedback. |
| Code change required | New short upgrade banner, ≤ 2 s, non-blocking, no full-screen page |
| Deferred | Nothing |
| Status | **GAP (State B missing)** |
| Product impact | High — the growth loop needs a reward beat |

---

## Reuse Boundary (binding)

Reuse, do not duplicate:

`Game.scene` · existing Controllers · `HUDView.ts` · existing Sprites ·
existing `Button` nodes · `ObjectArtRegistry.ts` · `WorldArtLibrary.ts` ·
`DynamicVehicle.ts` · `CompressibleObject.ts` · `SuctionMotion.ts` ·
`RoundedPanelGraphic.ts` · `RuntimePageInputRouter.ts`

Forbidden new siblings: `UIRouterV2`, `HUDV2`, `VehicleV2`, `SuctionV2`,
`WorldV2`.

## Deferred Truth Constraints

- `DEFERRED_BLOCKER: CREATOR_OPEN_SCENE_HANDSHAKE` — no prefab / scene / meta /
  UUID writeback is claimed by this audit.
- `BLOCKED_EXTERNAL_CONFIG` — rewarded-ad SDK, Ad Unit and device callback
  remain unavailable; the Revive ad entry stays hidden.
  **Conflict, stated explicitly (do not silently resolve it):** the inherited
  masters *do* show ad chrome — master `02-revive.png` renders a violet
  `免费复活` button carrying an ad/video glyph, and master `03-mode-select.png`
  renders two locked cards (`黑洞乱斗`, `限时冲榜`) each with a padlock and a
  `观看视频解锁` button. So the audit entry and the masters disagree. The masters
  are the visual authority for the locked design, and the *capability* remains
  blocked; no ad SDK, Ad Unit or device callback is claimed, and the runtime
  entry stays hidden until it is genuinely configured. See `design-lock.md`
  §02/§03, where the same conflict is recorded.
- `DESIGN_IMAGE_GENERATION_UNAVAILABLE` — references 05–10 are deterministic
  layout renders, not illustrated art. See `design-lineage.md` §6–7.
