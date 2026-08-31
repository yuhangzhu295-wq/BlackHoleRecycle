/**
 * 强类型商业化广告服务与幂等账本 (AdService.ts)
 */

export enum AdPlacement {
  REGION_DOUBLE_REWARD = 'REGION_DOUBLE_REWARD',
  UPGRADE_REFRESH = 'UPGRADE_REFRESH',
  MAGNET_RECHARGE = 'MAGNET_RECHARGE',
  OFFLINE_DOUBLE = 'OFFLINE_DOUBLE',
  MILESTONE_DOUBLE = 'MILESTONE_DOUBLE',
  SESSION_INTERSTITIAL = 'SESSION_INTERSTITIAL'
}

export class RewardLedger {
  private processedTransactions: Set<string> = new Set();

  public generateTransactionId(placement: AdPlacement): string {
    return `tx_${placement}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  public isTransactionProcessed(txId: string): boolean {
    return this.processedTransactions.has(txId);
  }

  public commitTransaction(txId: string): boolean {
    if (this.processedTransactions.has(txId)) {
      console.warn(`[RewardLedger] Prevented duplicate reward for: ${txId}`);
      return false;
    }
    this.processedTransactions.add(txId);
    return true;
  }
}

export interface IAdAdapter {
  isAvailable(placement: AdPlacement): boolean;
  showRewarded(placement: AdPlacement, onSuccess: () => void, onFail?: (err: string) => void): void;
  showInterstitial(onClose?: () => void): void;
}

export class EditorAdAdapter implements IAdAdapter {
  isAvailable(placement: AdPlacement): boolean {
    return false; // 编辑器默认无真实广告源
  }
  showRewarded(placement: AdPlacement, onSuccess: () => void, onFail?: (err: string) => void): void {
    if (onFail) onFail('UNAVAILABLE_NOT_CONFIGURED');
  }
  showInterstitial(onClose?: () => void): void {
    if (onClose) onClose();
  }
}

export class WeChatAdAdapter implements IAdAdapter {
  isAvailable(placement: AdPlacement): boolean {
    return typeof (window as any).wx !== 'undefined';
  }
  showRewarded(placement: AdPlacement, onSuccess: () => void, onFail?: (err: string) => void): void {
    const wx = (window as any).wx;
    if (wx && typeof wx.createRewardedVideoAd === 'function') {
      // 真实微信激励视频调用
      try {
        const ad = wx.createRewardedVideoAd({ adUnitId: 'wx_real_unit_placeholder' });
        ad.show().catch(() => ad.load().then(() => ad.show()).catch((err: { errMsg?: string }) => {
          if (onFail) onFail(err.errMsg ?? 'AD_SHOW_FAILED');
        }));
        ad.onClose((res: any) => {
          if (res && res.isEnded) onSuccess();
          else if (onFail) onFail('AD_CANCELLED_BY_USER');
        });
      } catch (e: any) {
        if (onFail) onFail(e.message);
      }
    } else {
      if (onFail) onFail('WX_NOT_SUPPORTED');
    }
  }
  showInterstitial(onClose?: () => void): void {
    const wx = (window as any).wx;
    if (wx && typeof wx.createInterstitialAd === 'function') {
      try {
        const ad = wx.createInterstitialAd({ adUnitId: 'wx_interstitial_placeholder' });
        ad.show().catch(console.warn);
        ad.onClose(() => onClose && onClose());
      } catch (e) {
        if (onClose) onClose();
      }
    } else {
      if (onClose) onClose();
    }
  }
}

export class DouyinAdAdapter implements IAdAdapter {
  isAvailable(placement: AdPlacement): boolean {
    return typeof (window as any).tt !== 'undefined';
  }
  showRewarded(placement: AdPlacement, onSuccess: () => void, onFail?: (err: string) => void): void {
    const tt = (window as any).tt;
    if (tt && typeof tt.createRewardedVideoAd === 'function') {
      try {
        const ad = tt.createRewardedVideoAd({ adUnitId: 'tt_real_unit_placeholder' });
        ad.show().catch(() => ad.load().then(() => ad.show()).catch((err: { errMsg?: string }) => {
          if (onFail) onFail(err.errMsg ?? 'AD_SHOW_FAILED');
        }));
        ad.onClose((res: any) => {
          if (res && res.isEnded) onSuccess();
          else if (onFail) onFail('AD_CANCELLED_BY_USER');
        });
      } catch (e: any) {
        if (onFail) onFail(e.message);
      }
    } else {
      if (onFail) onFail('TT_NOT_SUPPORTED');
    }
  }
  showInterstitial(onClose?: () => void): void {
    const tt = (window as any).tt;
    if (tt && typeof tt.createInterstitialAd === 'function') {
      try {
        const ad = tt.createInterstitialAd({ adUnitId: 'tt_interstitial_placeholder' });
        ad.show().catch(console.warn);
        ad.onClose(() => onClose && onClose());
      } catch (e) {
        if (onClose) onClose();
      }
    } else {
      if (onClose) onClose();
    }
  }
}

export class AdService {
  private static instance: AdService;
  public ledger: RewardLedger = new RewardLedger();
  private adapter: IAdAdapter;

  private constructor() {
    if (typeof (window as any).wx !== 'undefined') {
      this.adapter = new WeChatAdAdapter();
    } else if (typeof (window as any).tt !== 'undefined') {
      this.adapter = new DouyinAdAdapter();
    } else {
      this.adapter = new EditorAdAdapter();
    }
  }

  public static getInstance(): AdService {
    if (!AdService.instance) {
      AdService.instance = new AdService();
    }
    return AdService.instance;
  }

  public isAdAvailable(placement: AdPlacement): boolean {
    return this.adapter.isAvailable(placement);
  }

  public showRewardedAd(
    placement: AdPlacement,
    onSuccess: () => void,
    onFail?: (reason: string) => void
  ): void {
    if (!this.adapter.isAvailable(placement)) {
      console.warn(`[AdService] Ad unit for ${placement} is UNAVAILABLE / NOT_CONFIGURED`);
      if (onFail) onFail('UNAVAILABLE_NOT_CONFIGURED');
      return;
    }

    const txId = this.ledger.generateTransactionId(placement);
    this.adapter.showRewarded(
      placement,
      () => {
        if (this.ledger.commitTransaction(txId)) {
          onSuccess();
        }
      },
      (err) => {
        if (onFail) onFail(err);
      }
    );
  }

  public showInterstitial(onClose?: () => void): void {
    this.adapter.showInterstitial(onClose);
  }
}

export const adService = AdService.getInstance();
