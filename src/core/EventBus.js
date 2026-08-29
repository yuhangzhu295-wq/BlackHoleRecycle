/**
 * 高性能轻量级事件总线 (EventBus)
 * 支持跨模块解耦通信、单次监听 (once) 与命名空间事件分发
 */
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback, context = null) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push({ callback, context, once: false });
    return () => this.off(event, callback);
  }

  once(event, callback, context = null) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push({ callback, context, once: true });
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const list = this.listeners.get(event);
    this.listeners.set(event, list.filter(item => item.callback !== callback));
  }

  emit(event, ...args) {
    if (!this.listeners.has(event)) return;
    const list = this.listeners.get(event).slice();
    for (let i = 0; i < list.length; i++) {
      const { callback, context, once } = list[i];
      try {
        callback.apply(context, args);
      } catch (err) {
        console.error(`[EventBus] Error in event listener for "${event}":`, err);
      }
      if (once) {
        this.off(event, callback);
      }
    }
  }

  clear() {
    this.listeners.clear();
  }
}

export const eventBus = new EventBus();
