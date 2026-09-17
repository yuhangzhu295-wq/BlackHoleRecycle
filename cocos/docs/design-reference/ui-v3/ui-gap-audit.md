# UI V3 Gap Audit

## Scope

This audit covers only Home, Mode Select, Endless HUD, Arena HUD, Revive, and Settlement. The V3 lock is an implementation target, not a visual PASS. Existing runtime flows are real and reusable. Art, hierarchy, and serialized layout changes remain deferred because manual Game.scene, prefab, meta, UUID, __id__, and __type__ edits are forbidden.

| Page | Current code and authoring location | Reusable behavior | Gap and required change | Deferred Creator work | Product impact and estimate |
| --- | --- | --- | --- | --- | --- |
| Home | cocos/assets/scripts/ui/HomePageController.ts; HomePageVisual.ts; cocos/assets/prefabs/ui/HomePage.prefab; Game.scene HomePage | Live coin/machine data, hero skin tint, real Mode/Skin/Machine routes | V2 fallback only. Keep one start CTA opening Mode Select; improve city/park art, outlined hierarchy, and real action icons | Creator-saved sprite, layout, and art writeback | High first impression. HomePage prefab or scene root, optionally existing visual/controller files |
| Mode Select | ModeSelectPageController.ts; cocos/assets/prefabs/ui/ModeSelectPage.prefab; Game.scene ModeSelectPage | Back, Arena, Endless, saved best score | Reuse cyan/shelf/card vocabulary but keep exactly two live cards | Creator-saved two-card art, shelf, title, back icon, safe-area layout | High route clarity. ModeSelectPage prefab or scene root, controller only for existing labels |
| Endless HUD | EndlessHUDController.ts; cocos/assets/prefabs/ui/EndlessHUD.prefab; Game.scene EndlessHUD | Live level, mass, coins, region, pause, joystick, absorb feedback | No dedicated V3 screenshot; V2 fallback. Improve compact panels without obstructing central gameplay | Creator-saved stats, pause, joystick art and layout | High play readability. EndlessHUD prefab or scene root; controller only if serialized names change |
| Arena HUD | ArenaHUDController.ts; HUDView.ts; Game.scene ArenaHUD only | Authoritative time, rank, mass, kills, status, top five, arrows, nameplates, pause, joystick | Strengthen timer, elimination, dark panels, and nameplate hierarchy; do not add unbacked currency | Creator-saved ArenaHUD layout/art; no standalone prefab exists | High competitive readability. Game.scene ArenaHUD plus controller only if bindings change |
| Revive | RevivePageController.ts; HUDView.ts; Game.scene RevivePage only | Real revive/forfeit, rank/loss/countdown facts | Enrich veil, focal card, type, and actions while retaining truthful ordinary revive | Creator-saved veil, card, title, countdown, buttons; no standalone prefab exists | High defeat-flow clarity. Game.scene RevivePage plus controller only for real labels |
| Settlement | SettlementPageController.ts; cocos/assets/prefabs/ui/SettlementPage.prefab; Game.scene SettlementPage | Real Endless/Arena stats, rank, local row, rewards, restart/home | Add trophy/ribbon/medal hierarchy, warm panel, data tiles, yellow/blue exits with real facts only | Creator-saved panel, badges, rows, button art, safe-area layout | High replay clarity. SettlementPage prefab or scene root, controller only for existing bindings |

## Reuse Boundary

- RuntimePageInputRouter.ts is the single fallback touch router; no second input path.
- GameManager.ts owns Home and mode transitions plus real sessions.
- HUDView.ts remains the formal screen coordinator.
- The six serialized Canvas roots are in cocos/assets/scenes/Game.scene. HUD.prefab is a legacy empty shell and is not a composition base.

## Next Authoring Gate

1. Resolve DEFERRED_BLOCKER: CREATOR_OPEN_SCENE_HANDSHAKE with official Creator open-scene and save behavior.
2. Use V3 copied references for Mode Select, Arena HUD, Revive, and Settlement. Use the documented V2 fallback only for Home and Endless.
3. Apply visuals to the existing page roots, run 375x667, 390x844, and 430x932 real runtime acceptance, and collect one screenshot per page state.
4. Evaluate layout, typography, color, asset, and elements from runtime evidence. Static contracts alone are not visual evidence.

## Deferred Truth Constraints

- DEFERRED_BLOCKER: CREATOR_OPEN_SCENE_HANDSHAKE
- BLOCKED_EXTERNAL_CONFIG: rewarded-ad SDK, Ad Unit, and device completed callback unavailable
- No prefab or scene visual writeback is claimed by this audit.
