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
