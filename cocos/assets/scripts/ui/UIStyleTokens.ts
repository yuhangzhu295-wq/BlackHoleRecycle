/**
 * UI style tokens (V9 §20).
 *
 * Colours live in `RenderProfile.HUD_SEMANTIC` / `UI_PALETTE` as named roles so
 * no page carries ad-hoc RGB. This module is the only place that turns a role
 * into a `Color`, which keeps `cc` out of the palette definition and gives both
 * HUD controllers one shared source for the tier-upgrade ramp.
 */
import { Color, Label, Node } from 'cc';
import {
  HUD_SEMANTIC,
  PAGE_SEMANTIC,
  PAGE_TEXT_DRIFT,
  UI_METRICS,
  UI_PALETTE,
} from '../core/RenderProfile';

const cache = new Map<string, Color>();

/** Role hex -> a shared Color instance. Cached: callers never mutate the result. */
export function colorFromToken(hex: string): Color {
  const cached = cache.get(hex);
  if (cached) return cached;
  const color = new Color();
  Color.fromHEX(color, hex);
  cache.set(hex, color);
  return color;
}

/**
 * The tier-upgrade feedback ramp. Previously written out twice, verbatim, in
 * ArenaHUDController and EndlessHUDController; the two HUDs now cannot drift.
 */
export function tierUpgradeColor(tier: number): Color {
  return tier >= 3 ? colorFromToken(HUD_SEMANTIC.upgradeTier3)
    : tier === 2 ? colorFromToken(HUD_SEMANTIC.upgradeTier2)
      : colorFromToken(HUD_SEMANTIC.neutralText);
}

/**
 * Fold the light pages' drifted label colours onto their tokens.
 *
 * The pages serialise their text colours directly, and eleven of them are
 * imperceptible variants of a token (`PAGE_TEXT_DRIFT`). Remapping here makes
 * the token file the source of the colour that is actually drawn, instead of
 * leaving the visible value buried in the scene.
 *
 * Matching is by exact colour, so a colour that is not in the table is untouched
 * and the pass is idempotent: a token value is never a key in the table.
 * Returns the number of labels changed, for the acceptance evidence.
 */
export function applyPageTextTokens(root: Node | null): number {
  if (!root?.isValid) return 0;
  let changed = 0;
  const visit = (node: Node): void => {
    if (node.activeInHierarchy) {
      const label = node.getComponent(Label);
      const color = label?.color;
      if (label && color) {
        const hex = `#${[color.r, color.g, color.b]
          .map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
        const role = PAGE_TEXT_DRIFT[hex];
        if (role) {
          const token = colorFromToken(PAGE_SEMANTIC[role]);
          label.color = new Color(token.r, token.g, token.b, color.a);
          changed += 1;
        }
      }
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  return changed;
}

export { HUD_SEMANTIC, PAGE_SEMANTIC, UI_METRICS, UI_PALETTE };
