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
| Card frame | white outer frame **plus a thick 3D plinth/shelf under each card** | white frame only, cards sit flat on the field | **difference — the reference's most distinctive structural element** |
| Card interior | fully illustrated scene: roads, trees, cars, buildings / planets / machines / trophy | a road strip, a grass band and a flat vortex | **difference — much sparser than the reference** |
| Card title / subtitle / sell line / badge | white outlined title, subtitle, yellow sell line, blue badge pill bottom-left | all present with the same hierarchy | **matches** |
| Black-hole art in the card | vivid purple-blue swirl with a bright rim, large and prominent | flat purple ellipse with a thin white ring | **difference — noticeably flatter** |
| Locked-card treatment | padlock over the interior | not applicable (this product has two real modes, no locked legacy cards) | correct per the canon's forbidden list |

Three real differences, in descending order of visual impact: **the missing card
plinth**, **the sparse card interiors**, and **the flat vortex art**. The session
pill is the smallest and is arguably a product decision (this game has no timed
session or energy), so it is listed rather than queued.

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
