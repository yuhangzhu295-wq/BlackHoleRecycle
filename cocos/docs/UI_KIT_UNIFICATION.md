# UI KIT UNIFICATION

**Round:** V9.5 PHASE E. The brief lists eleven components and asks to find the
existing equivalent before creating anything new. This records what each one
actually is, so the next person does not build a twelfth prefab for something that
already exists.

**Headline: none of the eleven needs to be created.** Each is either a Kit prefab,
an authored scene node drawing from the V9.5 family, or a platform adapter method.

---

## 1. The single visual source

Two families exist and, since this round, the pages and the Kit draw from the same
one:

| Family | Contents | Used by |
|---|---|---|
| `game_art/ui/v95/*` (26 assets) | field, plate, capsules, pill, card frame, boards, ribbon, panels, reward bar, badges, glyphs, composed cards, the Blender stage renders | **every page, and the Kit** |
| `game_art/ui/textures/*` (9 assets) | the pre-V9.5 9-slice frames | nothing on a page; still the declared fallback set in `UIAssetLibrary` |

`textures/home/*` is the old page art. It is **retained per page until that page is
rebuilt**, and no page uses it for anything rebuilt this round.

## 2. Component by component

| Brief's name | Existing implementation | Notes |
|---|---|---|
| **PrimaryButton** | `capsule_yellow` sprite + `cc.Button` + a `Label` child | authored per page, e.g. Home `BtnStart`, Pause `BtnResume`, Settlement `BtnRestart` |
| **SecondaryButton** | `capsule_purple` sprite, same construction | e.g. `BtnHome`, `BtnGiveUp`, `BtnSettle` |
| **StatPill** | `pill_dark` sprite, or the `UICurrencyPill` / `UILevelPill` prefabs | the Endless HUD's three pills are authored scene nodes; the prefabs are the reusable form |
| **ModeCard** | `UIModeCard` prefab exists; the shipped page uses `mode_card_arena_framed` / `mode_card_endless_framed` | the shipped cards carry baked text; see §4 |
| **LeaderboardRow** | `UILeaderboardRow` prefab exists; the settlement uses `panel_white` on `ArenaRankRow_1..5` | |
| **ResultPanel** | `board_settlement` / `board_endless` sprites | the settlement board *is* the result panel; Pause and Revive reuse it as their dialog |
| **RewardBar** | `reward_bar` sprite on `ArenaRewardPanel` | used by Arena, and by Endless since this round |
| **ProgressBar** | `UIProgressBar` prefab, **consumed** by Machine Info | the only Kit unit any page uses |
| **IconButton** | `cc.Button` + an icon sprite; `mode_back` for the back button, `home_coin` for the coin icon | no separate prefab, and none is warranted: two instances with different art |
| **Toast** | `platformAdapter.showToast(title, icon)` | a platform method, not a component — it delegates to the host's own toast |
| **Dialog** | `platformAdapter.showRetryDialog(title, message, onRetry)` for the region-art failure; the boards + ribbons for in-game dialogs | same reason: one is a host dialog, the others are page compositions |

## 3. What exists but is not used

Six Kit prefabs — `UIModeCard`, `UIBrandHeader`, `UICurrencyPill`, `UILevelPill`, `UIHudStat`, `UILeaderboardRow` — are declared, contract-locked and verified
resident at runtime by `verify:ui-kit`, but no page instantiates them. Their art now
matches the pages, so consuming them is a re-skin rather than a source change; the
outstanding question is whether a page should be built from them or keep its
authored nodes. See `UI_ART_DIRECTION_CANONICAL.md` §7.

## 4. Two known gaps in the unification

**The ModeSelect cards bake their text.** They carry the mode name, subtitle, sell
line and CTA as artwork, so they cannot be edited or localised. Replacing them needs
eight new `Label` nodes (four per card) and a controller to bind them, and the art
cannot be stripped of its text before those exist or the cards would lose their mode
names. The same is true of `Header` and `home_logo`, which are wordmark art; Home's
brand has already been moved to a plate plus a real `Label` and is the pattern to
follow.

**`cocos/assets/prefabs/ui/*.prefab` are dead.** `HomePage`, `ModeSelectPage`,
`PausePage`, `SettlementPage`, `EndlessHUD` and `HUD` exist as prefabs, but the
scene's page nodes are plain nodes with `_prefab: null`, so none of them is
instantiated. Editing one changes nothing on screen. They are left in place rather
than deleted, because deleting an asset is not this round's decision, but no further
work should be aimed at them.

## 5. Rules this round followed

- Nothing was created that already existed.
- No second `UIPageRouter`, `ArtRegistry`, `MaterialLibrary` or UI framework.
- Every business control is a real `cc.Button` / `cc.Label`, never a picture.
- Old art is retired page by page as that page is rebuilt, never deleted wholesale.
- Page and Kit share one asset family.
