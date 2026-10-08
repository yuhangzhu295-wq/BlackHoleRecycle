/**
 * Per-node primitives for fitting an authored page composition into the design
 * space the UI camera actually shows.
 *
 * ## Why a page needs its own fit step
 *
 * `HudSafeAreaInset` clamps a container's children into the safe span, but it
 * moves them as *clusters* -- that is what the gameplay HUD needs, and it is
 * wrong for a page whose elements merely share a row. On ModeSelect, `BtnBack`
 * and `Header` overlap vertically by 4 design px, so the cluster union became
 * 590 design px wide, hit the "wider than the safe span" branch, and recentred
 * the pair: `BtnBack` stayed clipped and `Header`, which had been correct, was
 * pushed off the right edge.
 *
 * A page also cannot be fixed by translation alone when the offending node is
 * simply wider than the frame -- `BtnArena` is 610 design px against a 576.3
 * design px visible width at 412x915, so the clamp can only recentre it, which
 * is a shift of exactly zero. Those nodes have to resize.
 *
 * These two helpers do one node each, so a page states its own composition
 * rule instead of inheriting the HUD's clustering. They are idempotent: every
 * call positions from the authored value passed in, never from the node's
 * current position, so repeated calls cannot accumulate drift.
 */
import { Node, Sprite, UITransform } from 'cc';
import {
  hudDesignToFrameScale,
  hudVisibleHalfWidth,
  HUD_INTERACTIVE_MARGIN_SCREEN_PX,
} from './HudSafeAreaInset';

/**
 * The lateral span a page's interactive content must stay inside, in design
 * units: the region the UI camera shows, less the locked 24 screen px margin.
 * Equals the design half-width on a 9:16 screen and shrinks on narrower ones.
 */
export function pageSafeHalfWidth(host: Node): number {
  const scale = hudDesignToFrameScale(host) || 1;
  return hudVisibleHalfWidth(host) - HUD_INTERACTIVE_MARGIN_SCREEN_PX / scale;
}

/**
 * Screen px a decorative panel keeps from the frame edge. Matches the inset the
 * layout tables already document for their top panels ("move panels 16 px inward
 * from canvas edges").
 */
export const PANEL_EDGE_INSET_SCREEN_PX = 16;

/**
 * The lateral span a page's decorative panels must stay inside.
 *
 * Deliberately smaller than `pageSafeHalfWidth`: that one carries the locked
 * 24 px rule, which binds *interactive* elements. A panel only has to stay off
 * the edge, and applying the interactive margin to it narrows it further than
 * necessary -- on a page whose authored panel already fits at 375x667 it would
 * change the reference composition for no reason.
 */
export function pagePanelHalfWidth(host: Node): number {
  const scale = hudDesignToFrameScale(host) || 1;
  return hudVisibleHalfWidth(host) - PANEL_EDGE_INSET_SCREEN_PX / scale;
}

/**
 * Translate a node so its authored rect sits inside `+/-safeHalfWidth`.
 * Returns the shift applied, in design units (0 when it already fits).
 */
export function clampNodeIntoSafeSpan(
  node: Node | null,
  authoredX: number,
  width: number,
  safeHalfWidth: number,
): number {
  if (!node?.isValid) return 0;
  const half = width / 2;
  let shift = 0;
  if (authoredX - half < -safeHalfWidth) shift = -safeHalfWidth - (authoredX - half);
  else if (authoredX + half > safeHalfWidth) shift = -(authoredX + half - safeHalfWidth);
  if (shift === 0) return 0;
  node.setPosition(authoredX + shift, node.position.y, node.position.z);
  return shift;
}

/** Authored geometry per node, so repeated calls cannot accumulate drift. */
const panelBase = new WeakMap<Node, { x: number; width: number; height: number }>();

/**
 * Design px an inner panel keeps from the outer panel's edge. Pages author their
 * card, then their rows inset inside it; narrowing both to the same span would
 * leave the rows flush with the card, so the rows take this inset instead.
 */
export const INNER_PANEL_INSET_DESIGN_PX = 12;

/** Result of fitting one panel. */
export interface PanelFit {
  /** Width applied, in design units. */
  readonly width: number;
  /** Applied / authored. 1 when the panel already fits. */
  readonly factor: number;
}

function baseOf(node: Node, transform: UITransform): { x: number; width: number; height: number } {
  let base = panelBase.get(node);
  if (!base) {
    base = { x: node.position.x, width: transform.width, height: transform.height };
    panelBase.set(node, base);
  }
  return base;
}

/**
 * Narrow a sliced panel so it fits the lateral safe span, keeping its height
 * and its centre.
 *
 * A SLICED sprite exists so its middle can stretch while its borders keep their
 * authored thickness, which makes a width-only change lossless -- and that
 * matters here because the alternative, shrinking uniformly, would also shorten
 * the panel and change the page's vertical composition. `PauseCard` (620 design
 * px) and `ReviveCard` (620) are the cases this is for: 620 against the 576.3
 * design px a 20:9 phone shows means 15.6 screen px of the card is off each
 * edge, and its rounded border is cropped.
 *
 * Only their own panel needs it: every sibling on those two pages is 500 design
 * px or narrower, so it stays inside the narrowed panel without help. A page
 * whose rows are authored wider than its panel needs those handled too, and
 * that is a per-page composition decision.
 *
 * Returns the width applied in design units, or 0 when the node is missing or
 * is not a sliced sprite (a simple sprite would be squashed by this).
 */
export function fitSlicedPanelToSafeSpan(
  node: Node | null,
  safeHalfWidth: number,
  insetDesignPx = 0,
): PanelFit {
  if (!node?.isValid) return { width: 0, factor: 1 };
  const sprite = node.getComponent(Sprite);
  if (!sprite || sprite.type !== Sprite.Type.SLICED) return { width: 0, factor: 1 };
  const transform = node.getComponent(UITransform);
  if (!transform) return { width: 0, factor: 1 };

  const base = baseOf(node, transform);
  const maxWidth = Math.max(0, (safeHalfWidth - insetDesignPx) * 2);
  const width = Math.min(base.width, maxWidth);
  transform.setContentSize(width, base.height);
  // Keep the panel's centre: only the width changed, and the anchor may not be
  // 0.5, so shift by the anchor-adjusted delta rather than assuming one.
  const anchorX = transform.anchorX ?? 0.5;
  const centre = base.x + base.width * (0.5 - anchorX);
  node.setPosition(centre - width * (0.5 - anchorX), node.position.y, node.position.z);
  return { width, factor: base.width > 0 ? width / base.width : 1 };
}

/**
 * Move a decorative satellite -- a corner badge, an accent bar -- so it keeps
 * its place on a panel that `fitSlicedPanelToSafeSpan` has narrowed. Scaling its
 * offset from the centre by the panel's factor keeps the authored inset
 * proportional; leaving it put would strand it outside the narrower panel.
 *
 * Idempotent: the authored x is remembered on first call.
 */
export function trackPanelNarrowing(node: Node | null, factor: number): void {
  if (!node?.isValid) return;
  const transform = node.getComponent(UITransform);
  if (!transform) return;
  const base = baseOf(node, transform);
  node.setPosition(base.x * factor, node.position.y, node.position.z);
}

/**
 * Shrink a node about its authored centre until it fits inside
 * `+/-safeHalfWidth`. Both axes take the same factor, so the sprite is not
 * distorted -- which is why this is a resize and not a width-only squeeze.
 * Returns the factor applied (1 when it already fits).
 *
 * Only safe for a node whose children are laid out relative to the node's own
 * centre; a node with absolutely positioned children needs those repositioned
 * by its caller as well.
 */
export function fitNodeIntoSafeSpan(
  node: Node | null,
  authoredX: number,
  width: number,
  height: number,
  safeHalfWidth: number,
): number {
  if (!node?.isValid) return 1;
  const factor = Math.min(1, safeHalfWidth / (width / 2));
  if (factor >= 1) return 1;
  const transform = node.getComponent(UITransform);
  transform?.setContentSize(width * factor, height * factor);
  node.setPosition(authoredX, node.position.y, node.position.z);
  return factor;
}
