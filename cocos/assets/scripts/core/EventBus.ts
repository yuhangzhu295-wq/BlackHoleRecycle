/**
 * 强类型高性能事件总线 (EventBus.ts)
 */

type EventCallback = (...args: any[]) => void;

interface IEventListenerItem {
  callback: EventCallback;
  context: unknown;
  once: boolean;
}

export class EventBus {
  private listeners: Map<string, IEventListenerItem[]> = new Map();

  public on(event: string, callback: EventCallback, context: unknown = null): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push({ callback, context, once: false });
    return () => this.off(event, callback);
  }

  public once(event: string, callback: EventCallback, context: unknown = null): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push({ callback, context, once: true });
  }

  public off(event: string, callback: EventCallback): void {
    if (!this.listeners.has(event)) return;
    const list = this.listeners.get(event)!;
    this.listeners.set(event, list.filter(item => item.callback !== callback));
  }

  public emit(event: string, ...args: any[]): void {
    if (!this.listeners.has(event)) return;
    const list = this.listeners.get(event)!.slice();
    for (let i = 0; i < list.length; i++) {
      const { callback, context, once } = list[i];
      try {
        callback.apply(context, args);
      } catch (err) {
        console.error(`[EventBus] Error in event "${event}":`, err);
      }
      if (once) {
        this.off(event, callback);
      }
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}

export const eventBus = new EventBus();
