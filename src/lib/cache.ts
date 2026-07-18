type CacheEntry<T> = { value: T; expiresAt: number };

/** Brief negative-result cache so failing upstreams aren't hammered by retries. */
const FAILURE_TTL_MS = 15_000;

/**
 * Tiny in-memory TTL cache with in-flight request coalescing and short
 * failure memory, shared across route invocations (and HMR reloads in dev)
 * via globalThis.
 */
class TtlCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private failures = new Map<string, { error: unknown; expiresAt: number }>();
  private inFlight = new Map<string, Promise<unknown>>();

  async getOrLoad<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const hit = this.store.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as T;

    const failed = this.failures.get(key);
    if (failed && failed.expiresAt > Date.now()) throw failed.error;

    const pending = this.inFlight.get(key);
    if (pending) return pending as Promise<T>;

    const promise = loader()
      .then((value) => {
        this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
        this.failures.delete(key);
        return value;
      })
      .catch((error: unknown) => {
        this.failures.set(key, {
          error,
          expiresAt: Date.now() + FAILURE_TTL_MS,
        });
        throw error;
      })
      .finally(() => {
        this.inFlight.delete(key);
        if (this.store.size > 500) this.evictExpired();
      });
    this.inFlight.set(key, promise);
    return promise;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) this.store.delete(key);
    }
  }
}

const globalStore = globalThis as unknown as { __hypesleuthCache?: TtlCache };

export const cache: TtlCache = globalStore.__hypesleuthCache ?? new TtlCache();
globalStore.__hypesleuthCache = cache;
