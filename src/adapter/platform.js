/**
 * 统一跨平台适配层 (Unified MiniGame Platform Adapter)
 * 自动探测并兼容环境: 微信 (wx) / 抖音 (tt) / 现代浏览器 Web Canvas
 */

class PlatformAdapter {
  constructor() {
    this.env = 'web'; // 'wx' | 'tt' | 'web'
    this.sdk = null;
    this.screenWidth = window ? window.innerWidth : 375;
    this.screenHeight = window ? window.innerHeight : 667;
    this.pixelRatio = window ? window.devicePixelRatio || 1 : 2;
    this.isTouchDevice = false;
    this.recorder = null;
    this.recordedVideoPath = null;
    this.initEnvironment();
  }

  initEnvironment() {
    if (typeof tt !== 'undefined' && tt.getSystemInfoSync) {
      this.env = 'tt';
      this.sdk = tt;
    } else if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
      this.env = 'wx';
      this.sdk = wx;
    } else {
      this.env = 'web';
      this.sdk = null;
    }

    this.updateSystemInfo();
  }

  updateSystemInfo() {
    if (this.sdk && this.sdk.getSystemInfoSync) {
      try {
        const sys = this.sdk.getSystemInfoSync();
        this.screenWidth = sys.windowWidth || sys.screenWidth || 375;
        this.screenHeight = sys.windowHeight || sys.screenHeight || 667;
        this.pixelRatio = sys.pixelRatio || 2;
        this.isTouchDevice = true;
      } catch (e) {
        console.warn('getSystemInfoSync failed, fallback to defaults', e);
      }
    } else if (typeof window !== 'undefined') {
      this.screenWidth = window.innerWidth;
      this.screenHeight = window.innerHeight;
      this.pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
      this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }
  }

  getPlatformName() {
    switch (this.env) {
      case 'wx': return '微信小游戏';
      case 'tt': return '抖音小游戏';
      case 'web': return 'Web H5 调试模式';
      default: return '未知平台';
    }
  }

  /**
   * 获取安全区域边距 (全面屏/刘海屏适配)
   */
  getSafeArea() {
    if (this.sdk && this.sdk.getSystemInfoSync) {
      try {
        const sys = this.sdk.getSystemInfoSync();
        if (sys.safeArea) {
          return {
            top: sys.safeArea.top || 0,
            bottom: this.screenHeight - (sys.safeArea.bottom || this.screenHeight),
            left: sys.safeArea.left || 0,
            right: this.screenWidth - (sys.safeArea.right || this.screenWidth),
            height: sys.safeArea.height || this.screenHeight,
            width: sys.safeArea.width || this.screenWidth
          };
        }
      } catch (e) {}
    }
    return { top: 20, bottom: 20, left: 0, right: 0, height: this.screenHeight - 40, width: this.screenWidth };
  }

  /**
   * 触感/震动反馈
   * @param {'light'|'medium'|'heavy'} type 
   */
  vibrate(type = 'light') {
    if (this.sdk) {
      if (type === 'heavy' && this.sdk.vibrateLong) {
        this.sdk.vibrateLong({
          fail: () => {}
        });
      } else if (this.sdk.vibrateShort) {
        this.sdk.vibrateShort({
          style: type,
          fail: () => {}
        });
      }
    } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
      const duration = type === 'heavy' ? 40 : (type === 'medium' ? 25 : 12);
      navigator.vibrate(duration);
    }
  }

  /**
   * 数据持久化存储 (Storage)
   */
  setStorage(key, value) {
    const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (this.sdk && this.sdk.setStorageSync) {
      try {
        this.sdk.setStorageSync(key, strValue);
        return true;
      } catch (e) {
        console.error('Storage set failed:', e);
        return false;
      }
    } else if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(key, strValue);
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  getStorage(key, defaultValue = null) {
    let val = null;
    if (this.sdk && this.sdk.getStorageSync) {
      try {
        val = this.sdk.getStorageSync(key);
      } catch (e) {
        val = null;
      }
    } else if (typeof localStorage !== 'undefined') {
      val = localStorage.getItem(key);
    }

    if (val === null || val === undefined || val === '') {
      return defaultValue;
    }
    try {
      return JSON.parse(val);
    } catch (e) {
      return val;
    }
  }

  /**
   * 弹窗提示
   */
  showToast(title, icon = 'none') {
    if (this.sdk && this.sdk.showToast) {
      this.sdk.showToast({ title, icon, duration: 1500 });
    } else {
      console.log(`[Toast ${icon}] ${title}`);
    }
  }

  /**
   * 抖音专属：录屏管理器 (Game Recorder)
   */
  startScreenRecording(callbacks = {}) {
    if (this.env === 'tt' && tt.getGameRecorderManager) {
      try {
        if (!this.recorder) {
          this.recorder = tt.getGameRecorderManager();
          this.recorder.onStart(() => {
            if (callbacks.onStart) callbacks.onStart();
          });
          this.recorder.onStop((res) => {
            this.recordedVideoPath = res.videoPath;
            if (callbacks.onStop) callbacks.onStop(res);
          });
          this.recorder.onError((err) => {
            if (callbacks.onError) callbacks.onError(err);
          });
        }
        this.recorder.start({ duration: 60 });
        return true;
      } catch (e) {
        console.warn('Start recorder failed:', e);
      }
    }
    return false;
  }

  stopScreenRecording() {
    if (this.recorder) {
      try {
        this.recorder.stop();
      } catch (e) {}
    }
  }

  /**
   * 分享功能 (微信 & 抖音)
   */
  shareAppMessage(options = {}) {
    const title = options.title || '我在《雷霆星战: 守护银河》怒斩高分，快来挑战我！';
    if (this.env === 'wx' && wx.shareAppMessage) {
      wx.shareAppMessage({
        title,
        query: options.query || 'from=share',
        imageUrl: options.imageUrl || ''
      });
    } else if (this.env === 'tt' && tt.shareAppMessage) {
      tt.shareAppMessage({
        title,
        channel: 'video',
        extra: {
          videoPath: this.recordedVideoPath || ''
        },
        success: () => {
          this.showToast('分享成功！', 'success');
          if (options.onSuccess) options.onSuccess();
        }
      });
    } else {
      this.showToast('已复制分享链接！');
    }
  }

  /**
   * 激励视频广告模拟与接入封装
   */
  showRewardedVideoAd(adUnitId, onSuccess, onFail) {
    if (this.sdk && this.sdk.createRewardedVideoAd) {
      try {
        const ad = this.sdk.createRewardedVideoAd({ adUnitId });
        ad.load()
          .then(() => ad.show())
          .catch(err => {
            console.warn('Ad load fail', err);
            if (onFail) onFail(err);
          });
        ad.onClose((res) => {
          if ((res && res.isEnded) || res === undefined) {
            if (onSuccess) onSuccess();
          } else {
            if (onFail) onFail('AD_NOT_FINISHED');
          }
        });
        return;
      } catch (e) {
        console.warn('Create ad error', e);
      }
    }

    // Web / 模拟降级模式: 提示模拟广告看完
    this.showToast('正在播放激励广告 (模拟中)...');
    setTimeout(() => {
      this.showToast('获得广告奖励！', 'success');
      if (onSuccess) onSuccess();
    }, 1200);
  }
}

export const platform = new PlatformAdapter();
