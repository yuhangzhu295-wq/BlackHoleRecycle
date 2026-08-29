/**
 * 商业化与广告服务系统 (AdService & Monetization Engine)
 * 包含：广告位策略、远程频控 (AdFrequencyController)、幂等发奖账本 (RewardLedger)、
 * 微信与抖音原生激励视频/插屏广告实例生命周期管理
 */
import { platform } from '../adapter/platform.js';
import { eventBus } from '../core/EventBus.js';

export const AD_PLACEMENTS = {
  REGION_DOUBLE_REWARD: 'REGION_DOUBLE_REWARD',
  UPGRADE_REFRESH: 'UPGRADE_REFRESH',
  MAGNET_RECHARGE: 'MAGNET_RECHARGE',
  OFFLINE_DOUBLE: 'OFFLINE_DOUBLE',
  MILESTONE_DOUBLE: 'MILESTONE_DOUBLE',
  SESSION_INTERSTITIAL: 'SESSION_INTERSTITIAL'
};

export class RewardLedger {
  constructor() {
    this.processedTransactions = new Set();
  }

  generateTransactionId(placement) {
    return `tx_${placement}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  isTransactionProcessed(txId) {
    return this.processedTransactions.has(txId);
  }

  commitTransaction(txId, rewardDetails) {
    if (this.processedTransactions.has(txId)) {
      console.warn(`[RewardLedger] Duplicate reward transaction prevented: ${txId}`);
      return false;
    }
    this.processedTransactions.add(txId);
    console.log(`[RewardLedger] Reward committed: ${txId}`, rewardDetails);
    return true;
  }
}

export class AdFrequencyController {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      minimumSessionSeconds: 15,
      cooldownSeconds: 20,
      sessionCap: 15,
      dailyCap: 30,
      ...config
    };
    this.sessionAdsShown = 0;
    this.lastAdTime = 0;
    this.sessionStartTime = Date.now();
  }

  updateRemoteConfig(remoteConfig) {
    if (remoteConfig && typeof remoteConfig === 'object') {
      this.config = { ...this.config, ...remoteConfig };
    }
  }

  canShowAd(placement, isRewarded = true) {
    if (!this.config.enabled) return false;
    const now = Date.now();
    const sessionDuration = (now - this.sessionStartTime) / 1000;

    if (sessionDuration < this.config.minimumSessionSeconds && !isRewarded) {
      return false;
    }

    if (this.sessionAdsShown >= this.config.sessionCap) {
      return false;
    }

    if (now - this.lastAdTime < this.config.cooldownSeconds * 1000 && !isRewarded) {
      return false;
    }

    return true;
  }

  recordAdShown() {
    this.sessionAdsShown++;
    this.lastAdTime = Date.now();
  }
}

export class AdService {
  constructor() {
    this.ledger = new RewardLedger();
    this.frequency = new AdFrequencyController();
    this.rewardedAdInstance = null;
    this.interstitialAdInstance = null;
    this.adUnits = {
      wx: {
        rewarded: 'adunit-wx-mock-rewarded',
        interstitial: 'adunit-wx-mock-interstitial'
      },
      tt: {
        rewarded: 'adunit-tt-mock-rewarded',
        interstitial: 'adunit-tt-mock-interstitial'
      }
    };
    this.initPlatformAds();
  }

  initPlatformAds() {
    const env = platform.env;
    if (env === 'wx' && typeof wx !== 'undefined' && wx.createRewardedVideoAd) {
      try {
        this.rewardedAdInstance = wx.createRewardedVideoAd({
          adUnitId: this.adUnits.wx.rewarded
        });
      } catch (e) {
        console.warn('[AdService] WX Rewarded Ad init failed', e);
      }
    } else if (env === 'tt' && typeof tt !== 'undefined' && tt.createRewardedVideoAd) {
      try {
        this.rewardedAdInstance = tt.createRewardedVideoAd({
          adUnitId: this.adUnits.tt.rewarded
        });
      } catch (e) {
        console.warn('[AdService] TT Rewarded Ad init failed', e);
      }
    }
  }

  /**
   * 展示激励视频广告
   * @param {string} placement 广告位
   * @param {Function} onRewardSuccess 奖励回调
   * @param {Function} onCancel 放弃/失败回调
   */
  showRewardedAd(placement, onRewardSuccess, onCancel) {
    if (!this.frequency.canShowAd(placement, true)) {
      platform.showToast('广告频次已达上限，稍后再试');
      if (onCancel) onCancel('FREQUENCY_CAPPED');
      return;
    }

    const txId = this.ledger.generateTransactionId(placement);
    eventBus.emit('ANALYTICS_EVENT', 'rewarded_request', { placement, txId });

    if (this.rewardedAdInstance) {
      this.rewardedAdInstance.show()
        .then(() => {
          eventBus.emit('ANALYTICS_EVENT', 'rewarded_show', { placement, txId });
          this.frequency.recordAdShown();
        })
        .catch(() => {
          this.rewardedAdInstance.load()
            .then(() => this.rewardedAdInstance.show())
            .catch(err => {
              eventBus.emit('ANALYTICS_EVENT', 'rewarded_fail', { placement, error: err });
              platform.showToast('暂无可用广告，请稍后再试');
              if (onCancel) onCancel(err);
            });
        });

      const handleClose = (res) => {
        if (this.rewardedAdInstance.offClose) {
          this.rewardedAdInstance.offClose(handleClose);
        }
        if ((res && res.isEnded) || res === undefined) {
          if (this.ledger.commitTransaction(txId, { placement })) {
            eventBus.emit('ANALYTICS_EVENT', 'rewarded_complete', { placement, txId });
            platform.showToast('已获得激励奖励！', 'success');
            if (onRewardSuccess) onRewardSuccess();
          }
        } else {
          eventBus.emit('ANALYTICS_EVENT', 'rewarded_cancel', { placement, txId });
          platform.showToast('需要观看完整广告才能获得奖励');
          if (onCancel) onCancel('AD_SKIPPED');
        }
      };

      if (this.rewardedAdInstance.onClose) {
        this.rewardedAdInstance.onClose(handleClose);
      }
      return;
    }

    // Web 调试环境降级模拟
    platform.showToast('正在加载激励视频 (测试环境)...');
    setTimeout(() => {
      if (this.ledger.commitTransaction(txId, { placement })) {
        this.frequency.recordAdShown();
        eventBus.emit('ANALYTICS_EVENT', 'rewarded_complete', { placement, txId });
        platform.showToast('测试奖励已发放！', 'success');
        if (onRewardSuccess) onRewardSuccess();
      }
    }, 1000);
  }

  /**
   * 展示插屏广告
   */
  showInterstitialAd(placement = 'SESSION_INTERSTITIAL') {
    if (!this.frequency.canShowAd(placement, false)) return;

    eventBus.emit('ANALYTICS_EVENT', 'interstitial_show', { placement });
    this.frequency.recordAdShown();
    console.log(`[AdService] Interstitial shown: ${placement}`);
  }
}

export const adService = new AdService();
