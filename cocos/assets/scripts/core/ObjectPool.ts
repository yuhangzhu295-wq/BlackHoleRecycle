/**
 * 高性能通用对象池 (ObjectPool.ts)
 */

export class ObjectPool<T> {
  private createFn: () => T;
  private resetFn?: (item: T) => void;
  private pool: T[] = [];
  private activeCount: number = 0;
  private maxCap: number;
  private createdCount: number = 0;
  private reusedCount: number = 0;
  private releasedCount: number = 0;

  constructor(createFn: () => T, resetFn?: (item: T) => void, initialCap: number = 20, maxCap: number = 200) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxCap = maxCap;

    for (let i = 0; i < initialCap; i++) {
      this.pool.push(this.createFn());
      this.createdCount++;
    }
  }

  public get(): T {
    let item: T;
    if (this.pool.length > 0) {
      item = this.pool.pop()!;
      this.reusedCount++;
    } else {
      item = this.createFn();
      this.createdCount++;
    }
    this.activeCount++;
    return item;
  }

  public release(item: T): void {
    this.releasedCount++;
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

  /** Immutable lifecycle counters for engine-side, read-only runtime QA. */
  public getDiagnostics(): Readonly<Record<string, number>> {
    return {
      active: this.activeCount,
      available: this.pool.length,
      created: this.createdCount,
      reused: this.reusedCount,
      released: this.releasedCount,
    };
  }

  public clear(): void {
    this.pool = [];
    this.activeCount = 0;
  }
}
