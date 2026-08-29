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
}
