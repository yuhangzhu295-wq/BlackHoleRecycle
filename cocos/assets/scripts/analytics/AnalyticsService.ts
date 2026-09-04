/**
 * 强类型全生命周期数据埋点服务 (AnalyticsService.ts)
 */
import { eventBus } from '../core/EventBus';

export type AnalyticsEventType =
  | 'game_launch'
  | 'session_start'
  | 'endless_start'
  | 'arena_start'
  | 'first_move'
  | 'first_absorb'
  | 'first_upgrade'
  | 'machine_evolve'
  | 'object_absorb'
  | 'large_object_absorb'
  | 'combo_reached'
  | 'magnet_storm'
  | 'upgrade_offer'
  | 'upgrade_selected'
  | 'upgrade_refresh'
  | 'region_enter'
  | 'region_complete'
  | 'rewarded_request'
  | 'rewarded_show'
  | 'rewarded_complete'
  | 'rewarded_fail'
  | 'interstitial_show'
  | 'session_end';

export interface IAnalyticsEventPayload {
  readonly event: AnalyticsEventType;
  readonly sessionId: string;
  readonly duration: number;
  readonly timestamp: number;
  readonly [key: string]: unknown;
}

export class AnalyticsService {
  private static instance: AnalyticsService;
  private sessionId: string;
  private sessionStartTime: number;

  private constructor() {
    this.sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.sessionStartTime = Date.now();
    this.track('game_launch');
    this.track('session_start');
  }

  public static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  public track(eventName: AnalyticsEventType, params: Record<string, unknown> = {}): void {
    const duration = Math.round((Date.now() - this.sessionStartTime) / 1000);
    const payload: IAnalyticsEventPayload = {
      event: eventName,
      sessionId: this.sessionId,
      duration,
      timestamp: Date.now(),
      ...params
    };
    eventBus.emit('ANALYTICS_EVENT_FIRED', payload);
    console.log(`📊 [Analytics] ${eventName}`, params);
  }
}

export const analyticsService = AnalyticsService.getInstance();
