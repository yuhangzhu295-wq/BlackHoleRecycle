# v5 Design Lock

**Status: PENDING ADOPTION.** These rules are read off the 2026-09-28 reference package.
They become binding when the project owner confirms which reference images are
authoritative — two mode-select renderings and two arena HUD renderings exist in the
package, and they are not identical. Until then treat this as the observed language, not
a locked contract.

Derived from the four images reviewed directly: `黑洞回收站_模式选择.png`,
`黑洞回收站_无尽探索.png`, `黑洞回收站_城市竞技场.png`, `竞技结算_黑洞乱斗排行榜.png`.
See `design-manifest.json` for hashes and review status.

## 01 — Field

A saturated sky-blue gradient field with large flat geometric shapes (circles, chevrons,
soft diamonds) at low contrast. The field is **light**: HUD and cards read as darker
objects placed on it, never the reverse. Nothing in the reference uses a dark full-bleed
backdrop except the settlement's blurred gameplay veil.

## 02 — Display type

Two-line brand block: a small brand line (`黑洞回收站`) above a large page title
(`模式选择`, `无尽探索`, `竞技结算`). Both carry a heavy dark outline and a white fill;
titles additionally carry a planet glyph or sparkle marks. The brand line is never
duplicated — one brand block per page, at the top, with nothing between it and the
content below it.

## 03 — Primary action

A thick **yellow capsule**: fully rounded ends, white outline, inner highlight along the
top edge, drop shadow beneath, dark-outlined label centred, optional glyph (play chevron)
at the trailing edge. This is the only shape used for the page's main action. Secondary
actions are the same capsule in purple.

## 04 — Cards

Cards are large rounded rectangles with a white outer frame and a fully illustrated
interior — an isometric vignette of the actual game scene. A card is never a flat texture
or a gradient with a small icon in it. Each card carries, inside itself: a bold title, a
short subtitle, a two-line sell line, and its own CTA capsule.

## 05 — HUD panels

Dark translucent pills and panels with white outlined text and a thin light border. They
hug the frame edges and **never overlap each other**. A status readout is always framed:
a value never floats as bare text (the reference frames even the safety countdown in a
pill with a clock glyph).

## 06 — Opponent identity

In arena, every competitor is a **distinctly coloured black hole with a matching coloured
ring**, a name tag, and a coloured arrow marker. Colour is the identity channel. A
competitor is never reduced to an unlabelled block or a re-used vehicle model.

## 07 — Composition

The gameplay frame is a bright isometric city: high-saturation greens and blues, readable
individual props (trees, cones, benches, bins, vehicles), and a clear empty lane around
the player. The top of the frame stays open so the brand block, clock and pause control
read against the sky. **No large dark structure may occupy the top band.**

## 08 — Settlement

A cream round-corner board centred over a blurred gameplay backdrop, with a purple ribbon
overlapping its top edge, a gold-outlined title, ranked rows carrying rank badge + vehicle
icon + name + mass + elimination count, the local player's row highlighted, three framed
stat cards, a gold reward bar, and exactly two actions: `再来一局` (yellow) and
`返回首页` (purple).

## Rules that follow

1. **One brand block per page.** If a page shows a second empty header-shaped sprite, it
   is a defect, not a design choice.
2. **Every value is framed.** Bare stat text is a defect.
3. **A card must be illustrated.** A flat texture inside a card frame is a placeholder,
   not a card.
4. **The primary action is a yellow capsule.** A thin outline bar is not the primary
   action of this product.
5. **The top band of gameplay is reserved for the brand block, clock and pause.** A
   structure that occupies it is a composition defect.
6. **Competitor identity is carried by colour.** Losing the coloured ring loses the
   identity.

## Not locked here

Colour hex values, exact type sizes, corner radii and spacing are **not** recorded: they
cannot be measured reliably from a JPEG-compressed reference at this stage, and inventing
them would create a contract that the reference does not actually support. They belong in
the per-page contract once a page is adopted and a real asset is authored for it.
