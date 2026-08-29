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

export class AdService {
  private static instance: AdService;
  public ledger: RewardLedger = new RewardLedger();
  private hasRealAdUnitId: boolean = false;

  private constructor() {
    this.hasRealAdUnitId = false; // 初始未配置正式 AdUnitId
  }

  public static getInstance(): AdService {
    if (!AdService.instance) {
      AdService.instance = new AdService();
    }
    return AdService.instance;
  }

  public isAdAvailable(placement: AdPlacement): boolean {
    return this.hasRealAdUnitId;
  }

  public showRewardedAd(
    placement: AdPlacement,
    onSuccess: () => void,
    onFail?: (reason: string) => void
  ): void {
    if (!this.hasRealAdUnitId) {
      console.warn(`[AdService] Ad unit for ${placement} is UNAVAILABLE / NOT_CONFIGURED`);
      if (onFail) onFail('UNAVAILABLE_NOT_CONFIGURED');
      return;
    }

    const txId = this.ledger.generateTransactionId(placement);
    if (this.ledger.commitTransaction(txId)) {
      onSuccess();
    }
  }
}

export const adService = AdService.getInstance();
