/**
 * Cocos Creator 编辑器 / Web 适配器 (EditorPlatformAdapter.ts)
 */
import { IPlatformAdapter } from './IPlatformAdapter';
import { sys } from 'cc';

declare const wx: any;
declare const tt: any;

export class EditorPlatformAdapter implements IPlatformAdapter {
  public readonly platformName = 'Cocos Creator Editor / Web';

  public init(): void {
    console.log(`[Platform] Initialized on ${this.platformName}`);
  }

  public getStorage(key: string, defaultValue: string | null = null): string | null {
    try {
      const val = sys.localStorage.getItem(key);
      return val !== null ? val : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  public setStorage(key: string, value: string): boolean {
    try {
      sys.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  public vibrate(type: 'light' | 'medium' | 'heavy'): void {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(type === 'heavy' ? 40 : (type === 'medium' ? 25 : 12));
    }
  }

  public showToast(title: string, icon: 'success' | 'none' = 'none'): void {
    console.log(`[Toast ${icon}] ${title}`);
  }
}

export class WeChatPlatformAdapter implements IPlatformAdapter {
  public readonly platformName = '微信小游戏';

  public init(): void {}

  public getStorage(key: string, defaultValue: string | null = null): string | null {
    try {
      if (typeof wx !== 'undefined' && wx.getStorageSync) {
        const val = wx.getStorageSync(key);
        return val ? String(val) : defaultValue;
      }
      return sys.localStorage.getItem(key) || defaultValue;
    } catch {
      return defaultValue;
    }
  }

  public setStorage(key: string, value: string): boolean {
    try {
      if (typeof wx !== 'undefined' && wx.setStorageSync) {
        wx.setStorageSync(key, value);
        return true;
      }
      sys.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  public vibrate(type: 'light' | 'medium' | 'heavy'): void {
    if (typeof wx !== 'undefined' && wx.vibrateShort) {
      wx.vibrateShort({ style: type });
    }
  }

  public showToast(title: string, icon: 'success' | 'none' = 'none'): void {
    if (typeof wx !== 'undefined' && wx.showToast) {
      wx.showToast({ title, icon, duration: 1500 });
    }
  }
}

export class DouyinPlatformAdapter implements IPlatformAdapter {
  public readonly platformName = '抖音小游戏';

  public init(): void {}

  public getStorage(key: string, defaultValue: string | null = null): string | null {
    try {
      if (typeof tt !== 'undefined' && tt.getStorageSync) {
        const val = tt.getStorageSync(key);
        return val ? String(val) : defaultValue;
      }
      return sys.localStorage.getItem(key) || defaultValue;
    } catch {
      return defaultValue;
    }
  }

  public setStorage(key: string, value: string): boolean {
    try {
      if (typeof tt !== 'undefined' && tt.setStorageSync) {
        tt.setStorageSync(key, value);
        return true;
      }
      sys.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  public vibrate(type: 'light' | 'medium' | 'heavy'): void {
    if (typeof tt !== 'undefined' && tt.vibrateShort) {
      tt.vibrateShort({ style: type });
    }
  }

  public showToast(title: string, icon: 'success' | 'none' = 'none'): void {
    if (typeof tt !== 'undefined' && tt.showToast) {
      tt.showToast({ title, icon, duration: 1500 });
    }
  }
}

// 自动检测并导出当前平台适配器
function createCurrentPlatformAdapter(): IPlatformAdapter {
  if (typeof tt !== 'undefined') return new DouyinPlatformAdapter();
  if (typeof wx !== 'undefined') return new WeChatPlatformAdapter();
  return new EditorPlatformAdapter();
}

export const platformAdapter = createCurrentPlatformAdapter();
