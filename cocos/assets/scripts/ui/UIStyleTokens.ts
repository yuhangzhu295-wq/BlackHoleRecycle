/**
 * UI style tokens (V9 §20).
 *
 * Colours live in `RenderProfile.HUD_SEMANTIC` / `UI_PALETTE` as named roles so
 * no page carries ad-hoc RGB. This module is the only place that turns a role
 * into a `Color`, which keeps `cc` out of the palette definition and gives both
 * HUD controllers one shared source for the tier-upgrade ramp.
 */
import { Color } from 'cc';
import { HUD_SEMANTIC, UI_PALETTE } from '../core/RenderProfile';

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

export { HUD_SEMANTIC, UI_PALETTE };
