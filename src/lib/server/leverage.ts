import { cache } from "../cache";
import { sanitizeLeverage } from "../card";
import { fetchActiveAssetData } from "../hyperliquid/client";

/** Leverage settings move rarely; a short TTL just absorbs bursts of loads. */
const TTL_MS = 60_000;

/** Requests go out in small batches to stay clear of rate-limit bursts. */
const CONCURRENCY = 8;

/**
 * The account's current leverage setting for one coin, cached and
 * failure-tolerant: null = unknown (delisted market or transient failure),
 * which callers render as "unleveraged" rather than an error. The activity
 * payload and the PnL card route share these cache entries.
 */
export async function currentLeverage(
  address: string,
  coin: string,
): Promise<number | null> {
  try {
    const data = await cache.getOrLoad(
      `activeAsset:${address}:${coin}`,
      TTL_MS,
      () => fetchActiveAssetData(address, coin),
    );
    return sanitizeLeverage(data.leverage?.value);
  } catch {
    return null;
  }
}

/** Resolves settings for many coins; unknown coins are left out of the map. */
export async function leverageMapForCoins(
  address: string,
  coins: string[],
): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  for (let i = 0; i < coins.length; i += CONCURRENCY) {
    const batch = await Promise.all(
      coins
        .slice(i, i + CONCURRENCY)
        .map(
          async (coin) => [coin, await currentLeverage(address, coin)] as const,
        ),
    );
    for (const [coin, leverage] of batch) {
      if (leverage != null) map[coin] = leverage;
    }
  }
  return map;
}
