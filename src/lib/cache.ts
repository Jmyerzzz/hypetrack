type CacheEntry<T> = { value: T; expiresAt: number };

/**
 * Tiny in-memory TTL cache with in-flight request coalescing, shared across
 * route invocations (and HMR reloads in dev) via globalThis.
 */
class TtlCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private inFlight = new Map<string, Promise<unknown>>();

  async getOrLoad<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const hit = this.store.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as T;

    const pending = this.inFlight.get(key);
    if (pending) return pending as Promise<T>;

    const promise = loader()
      .then((value) => {
        this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
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

const globalStore = globalThis as unknown as { __hypetrackCache?: TtlCache };

export const cache: TtlCache = globalStore.__hypetrackCache ?? new TtlCache();
globalStore.__hypetrackCache = cache;
