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

/**
 * Ad unit IDs belong to the developer account, not to source control.  A
 * platform bootstrap may provide them after it has loaded its private release
 * configuration.  Keeping this empty by default is intentional: a build with
 * no owner-provided IDs must not request an invented ad unit.
 */
export interface AdUnitIds {
  readonly rewardedVideo?: string;
  readonly interstitial?: string;
}

export interface AdUnitConfiguration {
  readonly wechat?: AdUnitIds;
  readonly douyin?: AdUnitIds;
}

interface RewardedVideoAd {
  show(): Promise<unknown>;
  load(): Promise<unknown>;
  onClose(callback: (result?: { isEnded?: boolean }) => void): void;
}

interface InterstitialAd {
  show(): Promise<unknown>;
  onClose(callback: () => void): void;
}

interface MiniGameAdApi {
  createRewardedVideoAd?(options: { adUnitId: string }): RewardedVideoAd;
  createInterstitialAd?(options: { adUnitId: string }): InterstitialAd;
}

interface MiniGameGlobal {
  wx?: MiniGameAdApi;
  tt?: MiniGameAdApi;
}

let configuredAdUnits: AdUnitConfiguration = Object.freeze({});

const normalizeAdUnitId = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized && !/placeholder|test(app)?id|your[-_ ]?app[-_ ]?id/i.test(normalized)
    ? normalized
    : undefined;
};

/**
 * Called only by product-owned platform startup code once real account IDs
 * are available.  Empty, whitespace and known placeholder values are
 * deliberately ignored so they can never reach a platform advertising SDK.
 */
export function configureAdUnitConfiguration(configuration: Readonly<AdUnitConfiguration>): void {
  configuredAdUnits = Object.freeze({
    wechat: {
      rewardedVideo: normalizeAdUnitId(configuration.wechat?.rewardedVideo),
      interstitial: normalizeAdUnitId(configuration.wechat?.interstitial),
    },
    douyin: {
      rewardedVideo: normalizeAdUnitId(configuration.douyin?.rewardedVideo),
      interstitial: normalizeAdUnitId(configuration.douyin?.interstitial),
    },
  });
}

const miniGameGlobal = (): MiniGameGlobal => globalThis as unknown as MiniGameGlobal;

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
    const wx = miniGameGlobal().wx;
    return Boolean(wx?.createRewardedVideoAd && configuredAdUnits.wechat?.rewardedVideo);
  }
  showRewarded(placement: AdPlacement, onSuccess: () => void, onFail?: (err: string) => void): void {
    const wx = miniGameGlobal().wx;
    const adUnitId = configuredAdUnits.wechat?.rewardedVideo;
    if (wx?.createRewardedVideoAd && adUnitId) {
      // 真实微信激励视频调用
      try {
        const ad = wx.createRewardedVideoAd({ adUnitId });
        ad.show().catch(() => ad.load().then(() => ad.show()).catch((err: { errMsg?: string }) => {
          if (onFail) onFail(err.errMsg ?? 'AD_SHOW_FAILED');
        }));
        ad.onClose((res) => {
          if (res && res.isEnded) onSuccess();
          else if (onFail) onFail('AD_CANCELLED_BY_USER');
        });
      } catch (error: unknown) {
        if (onFail) onFail(error instanceof Error ? error.message : 'AD_CREATE_FAILED');
      }
    } else {
      if (onFail) onFail(adUnitId ? 'WX_NOT_SUPPORTED' : 'AD_UNIT_NOT_CONFIGURED');
    }
  }
  showInterstitial(onClose?: () => void): void {
    const wx = miniGameGlobal().wx;
    const adUnitId = configuredAdUnits.wechat?.interstitial;
    if (wx?.createInterstitialAd && adUnitId) {
      try {
        const ad = wx.createInterstitialAd({ adUnitId });
        ad.show().catch(console.warn);
        ad.onClose(() => onClose?.());
      } catch {
        onClose?.();
      }
    } else {
      onClose?.();
    }
  }
}

export class DouyinAdAdapter implements IAdAdapter {
  isAvailable(placement: AdPlacement): boolean {
    const tt = miniGameGlobal().tt;
    return Boolean(tt?.createRewardedVideoAd && configuredAdUnits.douyin?.rewardedVideo);
  }
  showRewarded(placement: AdPlacement, onSuccess: () => void, onFail?: (err: string) => void): void {
    const tt = miniGameGlobal().tt;
    const adUnitId = configuredAdUnits.douyin?.rewardedVideo;
    if (tt?.createRewardedVideoAd && adUnitId) {
      try {
        const ad = tt.createRewardedVideoAd({ adUnitId });
        ad.show().catch(() => ad.load().then(() => ad.show()).catch((err: { errMsg?: string }) => {
          if (onFail) onFail(err.errMsg ?? 'AD_SHOW_FAILED');
        }));
        ad.onClose((res) => {
          if (res && res.isEnded) onSuccess();
          else if (onFail) onFail('AD_CANCELLED_BY_USER');
        });
      } catch (error: unknown) {
        if (onFail) onFail(error instanceof Error ? error.message : 'AD_CREATE_FAILED');
      }
    } else {
      if (onFail) onFail(adUnitId ? 'TT_NOT_SUPPORTED' : 'AD_UNIT_NOT_CONFIGURED');
    }
  }
  showInterstitial(onClose?: () => void): void {
    const tt = miniGameGlobal().tt;
    const adUnitId = configuredAdUnits.douyin?.interstitial;
    if (tt?.createInterstitialAd && adUnitId) {
      try {
        const ad = tt.createInterstitialAd({ adUnitId });
        ad.show().catch(console.warn);
        ad.onClose(() => onClose?.());
      } catch {
        onClose?.();
      }
    } else {
      onClose?.();
    }
  }
}

export class AdService {
  private static instance: AdService;
  public ledger: RewardLedger = new RewardLedger();
  private adapter: IAdAdapter;

  private constructor() {
    if (miniGameGlobal().wx) {
      this.adapter = new WeChatAdAdapter();
    } else if (miniGameGlobal().tt) {
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
