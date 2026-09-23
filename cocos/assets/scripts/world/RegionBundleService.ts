import { assetManager, type AssetManager } from 'cc';

/**
 * Lifecycle of one region-scoped asset bundle.
 *
 * A bundle only becomes `LOADED` after Creator's asset manager has actually
 * resolved it; `FAILED` is terminal until `reset()` is called, so a caller can
 * never mistake a stuck download for a resident bundle.
 */
export type RegionBundleState = 'IDLE' | 'LOADING' | 'LOADED' | 'FAILED';

export interface RegionBundleStatus {
  readonly name: string;
  readonly state: RegionBundleState;
  /** Attempts spent on the current attempt budget. */
  readonly attempts: number;
  /** Cells currently blocked because this bundle is not resident yet. */
  readonly waitingCount: number;
  readonly error: string | null;
}

export interface RegionBundleFailure {
  readonly bundleName: string;
  /** Player-facing message: a plain sentence, no stack trace. */
  readonly message: string;
  readonly attempts: number;
  readonly waitingCount: number;
}

export interface RegionBundleServiceOptions {
  /** Total attempts per bundle, including the first one. */
  readonly maxAttempts?: number;
  /** Base delay between attempts, in milliseconds; grows linearly per attempt. */
  readonly retryDelayMs?: number;
}

interface RegionBundleRecord {
  state: RegionBundleState;
  attempts: number;
  error: string | null;
  bundle: AssetManager.Bundle | null;
  inFlight: Promise<void> | null;
  readonly waiting: Set<string>;
}

function describeError(error: unknown, bundleName: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return `bundle ${bundleName} could not be loaded`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Loads region-scoped Asset Bundles on demand and owns their load state.
 *
 * Deliberately narrow: this service only answers "is the art for this area
 * resident, and if not, please make it so". It does not decide which region is
 * needed (WorldStreamer), does not create cells (WorldCellFactory) and does not
 * own world layout. The opening world's bundle is pulled in by the engine before
 * the launch scene (see build-templates/<platform>/application.js) because no
 * project script can run earlier; every later region goes through here.
 */
export class RegionBundleService {
  private readonly records = new Map<string, RegionBundleRecord>();
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private lastFailure: RegionBundleFailure | null = null;

  public constructor(options: RegionBundleServiceOptions = {}) {
    this.maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 3));
    this.retryDelayMs = Math.max(0, options.retryDelayMs ?? 250);
  }

  /**
   * Resolves once the bundle is resident. Concurrent callers share one download
   * instead of starting competing requests, and a bundle that already exhausted
   * its attempt budget rejects without starting a new one — a caller polling per
   * frame must not turn a broken download into a request storm.
   */
  public ensureLoaded(bundleName: string, waitingKey?: string): Promise<void> {
    const record = this.recordOf(bundleName);
    if (waitingKey) record.waiting.add(waitingKey);
    if (record.state === 'LOADED') {
      if (waitingKey) record.waiting.delete(waitingKey);
      return Promise.resolve();
    }
    if (record.state === 'FAILED') {
      return Promise.reject(new Error(record.error || `bundle ${bundleName} previously failed to load`));
    }
    if (record.inFlight) return record.inFlight;
    record.inFlight = this.loadWithRetry(bundleName, record, waitingKey)
      .finally(() => { record.inFlight = null; });
    return record.inFlight;
  }

  /**
   * Starts a download without blocking the caller. Failures are recorded in
   * `getLastFailure()` rather than thrown, so a warm-up never becomes an
   * unhandled rejection.
   */
  public preload(bundleName: string, waitingKey?: string): void {
    void this.ensureLoaded(bundleName, waitingKey).catch(() => undefined);
  }

  public isLoaded(bundleName: string): boolean {
    return this.records.get(bundleName)?.state === 'LOADED';
  }

  /** True while a download is in flight, so a caller can show a loading state. */
  public isLoading(bundleName: string): boolean {
    const record = this.records.get(bundleName);
    return record?.state === 'LOADING' || Boolean(record?.inFlight);
  }

  /**
   * The resident bundle, or `null` while it is not in memory. A caller must
   * still await `ensureLoaded()` first; this accessor exists only so that code
   * which needs a specific asset can address it inside an already-loaded bundle
   * instead of standing up a second loader of its own.
   */
  public getBundle(bundleName: string): AssetManager.Bundle | null {
    const record = this.records.get(bundleName);
    return record && record.state === 'LOADED' ? record.bundle : null;
  }

  public getStatus(bundleName: string): RegionBundleStatus {
    const record = this.records.get(bundleName);
    if (!record) {
      return { name: bundleName, state: 'IDLE', attempts: 0, waitingCount: 0, error: null };
    }
    return {
      name: bundleName,
      state: record.state,
      attempts: record.attempts,
      waitingCount: record.waiting.size,
      error: record.error,
    };
  }

  /** Every bundle this service has been asked about, for diagnostics and gates. */
  public getStatuses(): readonly RegionBundleStatus[] {
    // forEach rather than an iterator spread: the mini-game bundle is ES5 and
    // `[...map.keys()]` downlevels into an unsafe helper call.
    const statuses: RegionBundleStatus[] = [];
    this.records.forEach((_record, name) => { statuses.push(this.getStatus(name)); });
    return statuses;
  }

  /**
   * The most recent failure, kept after the rejection so a UI layer can render a
   * message plus a Retry action without owning its own error bookkeeping.
   */
  public getLastFailure(): RegionBundleFailure | null {
    return this.lastFailure;
  }

  public clearLastFailure(): void {
    this.lastFailure = null;
  }

  /** Drops a FAILED state and releases the waiting keys of that bundle. */
  public reset(bundleName: string): void {
    const record = this.records.get(bundleName);
    // A download that is still running owns the state; only a terminal failure
    // (or an untouched bundle) may be reset.
    if (!record || record.inFlight) return;
    record.state = 'IDLE';
    record.attempts = 0;
    record.error = null;
    record.waiting.clear();
    if (this.lastFailure?.bundleName === bundleName) this.lastFailure = null;
  }

  /** A cell stopped waiting for this bundle (it was unloaded before the load finished). */
  public release(bundleName: string, waitingKey: string): void {
    this.records.get(bundleName)?.waiting.delete(waitingKey);
  }

  private recordOf(bundleName: string): RegionBundleRecord {
    let record = this.records.get(bundleName);
    if (!record) {
      record = { state: 'IDLE', attempts: 0, error: null, bundle: null, inFlight: null, waiting: new Set<string>() };
      this.records.set(bundleName, record);
    }
    return record;
  }

  private async loadWithRetry(
    bundleName: string,
    record: RegionBundleRecord,
    waitingKey?: string,
  ): Promise<void> {
    record.state = 'LOADING';
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      record.attempts = attempt;
      try {
        record.bundle = await RegionBundleService.loadBundle(bundleName);
        record.state = 'LOADED';
        record.error = null;
        record.waiting.clear();
        if (this.lastFailure?.bundleName === bundleName) this.lastFailure = null;
        return;
      } catch (error) {
        record.error = describeError(error, bundleName);
        if (attempt < this.maxAttempts && this.retryDelayMs > 0) {
          await delay(this.retryDelayMs * attempt);
        }
      }
    }
    record.state = 'FAILED';
    if (waitingKey) record.waiting.add(waitingKey);
    const failure: RegionBundleFailure = {
      bundleName,
      message: `区域资源加载失败：${bundleName}（已尝试 ${record.attempts} 次）`,
      attempts: record.attempts,
      waitingCount: record.waiting.size,
    };
    this.lastFailure = failure;
    throw new Error(failure.message);
  }

  private static loadBundle(bundleName: string): Promise<AssetManager.Bundle> {
    return new Promise<AssetManager.Bundle>((resolve, reject) => {
      assetManager.loadBundle(bundleName, (error, bundle) => {
        if (error || !bundle) {
          reject(error ?? new Error(`bundle ${bundleName} resolved to nothing`));
          return;
        }
        resolve(bundle);
      });
    });
  }
}
