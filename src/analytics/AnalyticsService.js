/**
 * 全链路数据埋点与指标分析系统 (AnalyticsService)
 * 包含：24项关键 Gameplay 与商业化生命周期事件上报、本地指标聚合与指标看板数据统计
 */
import { platform } from '../adapter/platform.js';
import { eventBus } from '../core/EventBus.js';

export class AnalyticsService {
  constructor() {
    this.sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.sessionStartTime = Date.now();
    this.eventLog = [];
    this.metrics = {
      totalAbsorbs: 0,
      totalMass: 0,
      totalEvolves: 0,
      maxCombo: 0,
      rewardedAttempts: 0,
      rewardedCompletions: 0,
      firstAbsorbTime: null,
      firstEvolveTime: null
    };

    this.bindEvents();
    this.track('game_launch', { timestamp: Date.now() });
    this.track('session_start', { sessionId: this.sessionId });
  }

  bindEvents() {
    eventBus.on('ANALYTICS_EVENT', (eventName, data) => {
      this.track(eventName, data);
    });
  }

  track(eventName, params = {}) {
    const duration = Math.round((Date.now() - this.sessionStartTime) / 1000);
    const eventPayload = {
      event: eventName,
      platform: platform.getPlatformName(),
      sessionId: this.sessionId,
      duration,
      timestamp: Date.now(),
      ...params
    };

    this.eventLog.push(eventPayload);
    if (this.eventLog.length > 500) {
      this.eventLog.shift(); // 限制内存中缓存的事件条数
    }

    // 更新聚合指标
    if (eventName === 'first_absorb' && !this.metrics.firstAbsorbTime) {
      this.metrics.firstAbsorbTime = duration;
    }
    if (eventName === 'machine_evolve') {
      this.metrics.totalEvolves++;
      if (!this.metrics.firstEvolveTime) this.metrics.firstEvolveTime = duration;
    }
    if (eventName === 'object_absorb') {
      this.metrics.totalAbsorbs++;
      if (params.mass) this.metrics.totalMass += params.mass;
    }
    if (eventName === 'combo_reached' && params.combo > this.metrics.maxCombo) {
      this.metrics.maxCombo = params.combo;
    }
    if (eventName === 'rewarded_request') {
      this.metrics.rewardedAttempts++;
    }
    if (eventName === 'rewarded_complete') {
      this.metrics.rewardedCompletions++;
    }

    console.log(`📊 [Analytics] ${eventName}`, params);
  }

  getDashboardMetrics() {
    const duration = Math.round((Date.now() - this.sessionStartTime) / 1000);
    const completionRate = this.metrics.rewardedAttempts > 0 
      ? Math.round((this.metrics.rewardedCompletions / this.metrics.rewardedAttempts) * 100) 
      : 100;

    return {
      sessionId: this.sessionId,
      sessionDuration: duration,
      firstAbsorbTime: this.metrics.firstAbsorbTime || 'N/A',
      firstEvolveTime: this.metrics.firstEvolveTime || 'N/A',
      totalAbsorbs: this.metrics.totalAbsorbs,
      totalMass: this.metrics.totalMass,
      totalEvolves: this.metrics.totalEvolves,
      maxCombo: this.metrics.maxCombo,
      rewardedAttempts: this.metrics.rewardedAttempts,
      rewardedCompletions: this.metrics.rewardedCompletions,
      rewardedCompletionRate: `${completionRate}%`
    };
  }
}

export const analytics = new AnalyticsService();
