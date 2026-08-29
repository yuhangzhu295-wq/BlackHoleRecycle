/**
 * 通用高效对象池 (ObjectPool)
 * 提供预热、自动扩容、回收与 PoolMetrics 监控指标 (created, reused, peakActive, poolSize)
 */
export class ObjectPool {
  constructor(factory, resetFn = null, initialSize = 10, maxSize = 300) {
    this.factory = factory;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
    this.pool = [];
    this.activeCount = 0;

    this.metrics = {
      created: 0,
      reused: 0,
      peakActive: 0,
      poolSize: 0
    };

    for (let i = 0; i < initialSize; i++) {
      const obj = this.factory();
      this.pool.push(obj);
      this.metrics.created++;
    }
    this.metrics.poolSize = this.pool.length;
  }

  get(...args) {
    let obj;
    if (this.pool.length > 0) {
      obj = this.pool.pop();
      this.metrics.reused++;
    } else {
      obj = this.factory(...args);
      this.metrics.created++;
    }

    this.activeCount++;
    if (this.activeCount > this.metrics.peakActive) {
      this.metrics.peakActive = this.activeCount;
    }
    this.metrics.poolSize = this.pool.length;

    if (this.resetFn) {
      this.resetFn(obj, ...args);
    }
    return obj;
  }

  release(obj) {
    if (!obj) return;
    this.activeCount = Math.max(0, this.activeCount - 1);

    if (this.pool.length < this.maxSize) {
      this.pool.push(obj);
    }
    this.metrics.poolSize = this.pool.length;
  }

  clear(destroyFn = null) {
    if (destroyFn) {
      this.pool.forEach(obj => destroyFn(obj));
    }
    this.pool = [];
    this.activeCount = 0;
    this.metrics.poolSize = 0;
  }

  getMetrics() {
    return { ...this.metrics, currentActive: this.activeCount };
  }
}
