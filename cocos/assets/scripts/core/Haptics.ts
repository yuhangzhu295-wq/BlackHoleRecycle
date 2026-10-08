/**
 * Haptics, gated by the player's setting.
 *
 * The save has declared `settings.vibration` since V1 and nothing ever read it,
 * so every buzz fired regardless. Routing the call sites through here is what
 * makes the flag real; the toggle itself still needs an authored settings page.
 *
 * Kept separate from `platformAdapter` so the adapter stays a pure platform
 * shim and does not grow a dependency on the save.
 */
import { platformAdapter } from '../platform/EditorPlatformAdapter';
import { saveService } from '../data/SaveService';

export function vibrate(type: 'light' | 'medium' | 'heavy'): void {
  if (saveService.data.settings.vibration === false) return;
  platformAdapter.vibrate(type);
}
