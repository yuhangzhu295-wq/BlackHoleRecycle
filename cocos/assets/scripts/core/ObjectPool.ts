/**
 * 高性能通用对象池 (ObjectPool.ts)
 */

export class ObjectPool<T> {
  private createFn: () => T;
  private resetFn?: (item: T) => void;
  private pool: T[] = [];
  private activeCount: number = 0;
  private maxCap: number;

  constructor(createFn: () => T, resetFn?: (item: T) => void, initialCap: number = 20, maxCap: number = 200) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxCap = maxCap;

    for (let i = 0; i < initialCap; i++) {
      this.pool.push(this.createFn());
    }
  }

  public get(): T {
    let item: T;
    if (this.pool.length > 0) {
      item = this.pool.pop()!;
    } else {
      item = this.createFn();
    }
    this.activeCount++;
    return item;
  }

  public release(item: T): void {
    if (this.resetFn) {
      this.resetFn(item);
    }
    if (this.pool.length < this.maxCap) {
      this.pool.push(item);
    }
    this.activeCount = Math.max(0, this.activeCount - 1);
  }

  public getActiveCount(): number {
    return this.activeCount;
  }

  public getPoolSize(): number {
    return this.pool.length;
  }

  public clear(): void {
    this.pool = [];
    this.activeCount = 0;
  }
}
