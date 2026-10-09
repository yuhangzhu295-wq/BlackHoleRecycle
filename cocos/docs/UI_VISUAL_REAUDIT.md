# UI VISUAL RE-AUDIT (V9.5 → current)

This is the **visual** gate, kept separate from the functional one. The functional
gates (`verify:layout`, `verify:gameplay-visuals`, `acceptance:full`) prove a page
fits, is reachable and has no missing asset. None of them can say whether a page
looks like the design it was built from, which is the complaint this exists to
answer.

Method: put the adopted reference and the shipped screenshot side by side and name
the differences. Only pages with a named difference get rebuilt, so this does not
become an unbounded redraw.

Reference source: `cocos/docs/design-reference/` (mapped by
`design-reference-manifest.json`); shipped captures:
`cocos/docs/evidence/v95/pages/`.

---

## Mode Select — DIFFERENCES FOUND

Reference `v2-02-mode-select.png` vs shipped `mode-390x844.png`.

| Element | Reference | Shipped | Verdict |
| --- | --- | --- | --- |
| Field | saturated blue gradient with large flat chevrons | flat light blue with faint chevrons | **matches** |
| Title | huge white outlined display type, centred | same treatment, centred | **matches** |
| Back button | yellow rounded square, top-left | present, same treatment | **matches** |
| Session pill | dark pill with a lightning icon, a count and a `00:38` timer | **absent** | **difference** |
| Card frame | white outer frame **plus a thick 3D plinth/shelf under each card** | white frame only, cards sat flat on the field | **difference — FIXED, see below** |
| Card interior | fully illustrated scene: roads, trees, cars, buildings / planets / machines / trophy | a road strip, a grass band and a flat vortex | **difference — much sparser than the reference** |
| Card title / subtitle / sell line / badge | white outlined title, subtitle, yellow sell line, blue badge pill bottom-left | all present with the same hierarchy | **matches** |
| Black-hole art in the card | vivid purple-blue swirl with a bright rim, large and prominent | flat purple ellipse with a thin white ring | **difference — noticeably flatter** |
| Locked-card treatment | padlock over the interior | not applicable (this product has two real modes, no locked legacy cards) | correct per the canon's forbidden list |

### The plinth: my first read of it was wrong, and the truth was better

I first wrote this up as "the plinth is missing". It is not. `ShelfArena` and
`ShelfEndless` are authored in the scene, positioned under each card, active, and
referenced by `MODE_SELECT_LAYOUT` so the layout contract keeps asserting their
geometry. They were **hidden at runtime on purpose**, and the reason is in the
controller:

> `mode_card_shelf.png` … is an empty white capsule bar with no content of its own.
> In the portrait frame they read as two blank white sprite bars floating between
> the title and the mode cards, which the V6 brief forbids by name ("empty sprite
> bar", "placeholder rectangle").

So the real finding is not "a missing element" but **a placeholder that was
correctly suppressed** — and the fix is therefore to author the art, not to
re-enable a blank bar. Sampling the old sprite confirms the description: a
transparent capsule with a `(233,241,255)` middle and a soft shadow, no 9-slice
borders.

**Fixed.** `art-source/vector/generate_card_plinth.py` draws a real plinth at the
same path — a light top face over a distinctly darker front face, rounded ends and
an outline — so the scene's spriteFrame reference keeps resolving and the shelves
can be shown again. `mode_card_shelf.png.meta` now carries 16 px horizontal 9-slice
borders and `packable: false`.

Showing it again needed two corrections, both found by measuring rather than by
trusting the table:

1. **Width.** The plinth is authored 600 design px against a ~576 design px visible
   width, so it overflowed the frame by 2.8 screen px per side. The controller now
   narrows it to the fitted card width less a small inset — the reference shows a
   plinth slightly narrower than its card — **width only, because a slab's thickness
   must not scale with it**. Measured: `ShelfArena` 502.7 design px inside
   `BtnArena`'s 518.7.
2. **Position.** With the authored y it rendered *above* its card — screen y 168.8
   against the card's 222.1 — where the reference clearly has the card sitting on
   the shelf. The shelf's y is now derived from the card it belongs to
   (`card.y - cardHeight/2 - shelfHeight/2 + 10`), which cannot drift from the card
   again. Measured after: `ShelfArena` 371.4..405.6 under `BtnArena`'s 222.1..377.9,
   **zero clipped nodes** at 390x844.

Verified by looking at the rendered page, not only by the numbers: the slab now
reads as a plinth under each card with its card resting on it.

Three real differences remain, in descending order of visual impact: **the sparse
card interiors**, **the flat vortex art**, and the session pill (arguably a product
decision — this game has no timed session or energy, so it is listed, not queued).

## Settlement — DIFFERENCES FOUND

Reference `v2-05-settlement.png` (the Arena leaderboard variant) vs shipped
`settlement-390x844.png` (the Endless variant). The two variants legitimately
differ — Endless has no opponents, so no leaderboard — so only the comparable
elements are judged.

| Element | Reference | Shipped | Verdict |
| --- | --- | --- | --- |
| Crown ribbon + subtitle | purple banner, gold title, subtitle bar, gold horns and confetti | purple banner, gold title, subtitle line | **matches** (the horns and confetti are decoration this page has no art for) |
| Leaderboard table | rank medals, per-row avatar, name, count, time, trophy, highlighted local row | **absent** | correct: Endless has no opponents |
| Stat cards | **icon-led**: coin, skull, stopwatch, each above its caption and value | text-only captions and values | **difference — FIXED, see below** |
| Reward row | "获得奖励" heading plus three reward tiles | a gold coin bar **plus a real per-tier itemisation line** | **difference in form, not in honesty — see below** |
| Actions | 继续 (yellow) + 返回首页 (blue) | 再来一局 (yellow) + 返回首页 (purple) | **matches** in role; the secondary is purple per this product's language |
| Lower half | filled by the reward row | a visible void between the coin bar and the buttons | **difference — same cause as the reward row** |

### Stat card icons: fixed

The reference leads every stat card with an icon; ours were text-only, which is
most of why the page reads as sparse beside it. Three icons were authored in the
page's own language — bold shape, thick dark outline, one highlight — for this
product's three roles: a weight for mass, a package for absorbed items, a medal
star for level (`art-source/vector/generate_stat_icons.py`).

Two traps worth recording, both of which produced a page that looked unchanged:

1. **A PNG added outside the editor imports as `texture` only**, with no `f9941`
   spriteFrame sub-asset, so a Sprite cannot reference it. The fix is to write the
   meta by hand with `imported: false` at every level; the shape was copied from an
   existing working v95 sprite meta rather than invented, because hand-writing the
   sprite-frame `userData` risks a malformed import.
2. **A cloned node inherits `_active` from its template.** The panels are authored
   inactive (the controller activates the ones it wants), so the icon clones were
   born inactive and nothing ever activated a child. They are now forced active.

The panels also grow from 164x104 to 164x140 to hold icon + caption + value
stacked, which is the reference's card shape, and the caption/value offsets move to
+2/-36 to sit below the icon. None of these nodes is pinned by
`docs/design-contracts/settlement.json`.

### The reward row, and the Endless void: what was and was not done

The reference's "获得奖励" row shows three tiles (coins x1230, trophy x20, chest
x1). Endless grants **coins and nothing else**, so two of those three tiles would
be rewards this mode never pays — which the canon forbids in the same breath as
fake buttons ("real stats only"). Copying the row would make the page look closer
to the reference by lying about the reward.

The same row is also what fills the reference's lower half, so the Endless page's
void has one cause, and I checked both ways out of it rather than guessing:

* **Shrinking the card** is not available. `docs/design-contracts/settlement.json`
  pins `settlement_card` at 660x920, and the Arena variant needs that height for
  its five leaderboard rows. Endless shares the card.
* **Filling it with real data** is available but needs a signature change: the
  natural content is the absorbed-tier breakdown the session already tracks
  (`session.absorbedTiers`), and `updateStats` does not receive it today. That is
  the right fix and it is a follow-up, not a rename of the problem.

**Done instead:** the second path. The session already tracks per-tier absorption
(`absorbedTierCounts`), so `updateStats` now takes a formatted `tierBreakdown`,
`GameManager.formatTierBreakdown()` produces it, and the settlement renders it on
`ArenaRewardBreakdown` — the node the Arena variant already uses as its reward
ledger, which is exactly the role this fills in Endless. Measured on a real
30-second match: `absorbedTiers {1: 57, 2: 2}` rendered as `T1 ×59 · T2 ×3`, and
the line is now visible at all because it was previously hidden with the rest of
the arena-only furniture (the visibility pass runs before the text is known).

So the page carries real itemisation where the reference carries invented reward
tiles, and the remaining empty space below it is still there: this narrows the void
rather than closing it. Closing it properly means either more real content or a
card that varies by mode, and the contract pins one card for both.

## Home — DIFFERENCES FOUND, none of them defects

Reference `v2-01-home.png` vs shipped `home-390x844.png`. This is the page where
"difference from the reference" and "wrong" come apart most sharply, so each row
says which it is.

| Element | Reference | Shipped | Verdict |
| --- | --- | --- | --- |
| Coin counter, level chip | coin counter and an energy counter along the top | gold coin pill (left) and a machine-level chip (right) | **matches in role**; there is no energy system to show |
| Left / right icon rails | leaderboard, lucky wheel, first recharge, mail, tasks, daily reward | **absent** | **correct** — every one is on the manifest's `forbiddenElements` list |
| Bottom tab bar | 成就 / 称号 / 主页 / 好友 / 设置 | **absent** | **correct** — friends and titles are forbidden, and a tab bar for a single screen is fake navigation |
| Brand block | huge 3D gold title with a crown and a black hole in the glyph, on a purple ribbon | navy plate, gold outline, gold text, planet glyph, sparkles | **deliberate adoption** — canon §4 defines this brand block; this reference predates it |
| Primary action | large gold capsule 开始吞噬 | large gold capsule 开始吞噬 | **matches** |
| Hero | the game world with the black hole and four named competitors carrying arrow markers | the black hole on a road and city scene, no competitors | **deliberate**: Arena is a mode here, and naming opponents on Home would advertise a screen this one does not open |
| Three entries | compact **rounded-square** icon buttons | **wide white-framed cards** with an icon interior | **difference in form** — but the card form is what canon §4 adopts, so this is the same kind of adoption as the brand block |
| Tagline | 吞噬一切·成为最强黑洞! under the title | absent | **real gap**, small |
| Brand block lines | two lines: a small brand line above a large page title | one line | **candidate gap** — canon §4 describes two lines; on Home the brand and the title may legitimately be the same string, which is worth confirming rather than assuming |

So Home's honest status is: **no defect found, two candidate gaps** (the tagline and
the one-line brand block). Neither is a visual break, and both would touch the Home
layout contract, which is pinned — so they are recorded rather than changed blind.

## Other pages

- **Home** — the canon states Home has no reference render of its own; its design is
  *derived* from the mode-select language. Any Home judgement is therefore against
  the language, not against an image, and is recorded as such.
- **Settlement / EndlessReady / Pause / Revive / Machine / Skin / Gameplay HUD** —
  not yet compared in this pass. The same side-by-side method applies; the adopted
  reference per page is listed in
  `cocos/docs/design-reference/UI_ART_DIRECTION_CANONICAL.md` §3.

## What this document does NOT claim

It does not claim the UI is finished. It records that **one page has been compared
and has three named differences**, and that the rest have not been compared yet in
this pass. A page that passes the functional gates is not thereby visually
accepted.
