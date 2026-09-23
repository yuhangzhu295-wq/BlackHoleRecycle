/**
 * 跨平台小游戏统一适配接口 (IPlatformAdapter.ts)
 */

export interface IPlatformAdapter {
  readonly platformName: string;
  init(): void;
  getStorage(key: string, defaultValue?: string | null): string | null;
  setStorage(key: string, value: string): boolean;
  vibrate(type: 'light' | 'medium' | 'heavy'): void;
  showToast(title: string, icon?: 'success' | 'none'): void;
  /**
   * Blocks the player with an explicit message and a real Retry action.
   *
   * Used when a region's art could not be downloaded: the world cannot be
   * shown, so a silent toast would leave the player staring at nothing.
   * Implementations must call `onRetry` only when the player confirms.
   */
  showRetryDialog(title: string, message: string, onRetry: () => void): void;
}
