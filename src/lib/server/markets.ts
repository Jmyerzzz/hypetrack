import { cache } from "../cache";
import {
  fetchAllMids,
  fetchOutcomeMeta,
  fetchPerpDexs,
} from "../hyperliquid/client";
import { buildOutcomeIndex, type OutcomeIndex } from "../hyperliquid/outcome";
import type { HlAllMids } from "../hyperliquid/types";

/**
 * Market reference data shared by every account: cached process-wide because
 * it is identical for all addresses, unlike the per-user endpoints.
 */

/** Live HIP-4 markets. Settled ones fall out, so labels degrade gracefully. */
export async function getOutcomeIndex(): Promise<OutcomeIndex> {
  return cache.getOrLoad("outcomeIndex", 5 * 60_000, async () =>
    buildOutcomeIndex(await fetchOutcomeMeta()),
  );
}

/** Mids move constantly, so this caches only long enough to coalesce bursts. */
export async function getAllMids(): Promise<HlAllMids> {
  return cache.getOrLoad("allMids", 15_000, fetchAllMids);
}

/**
 * Names of the HIP-3 builder perp DEXs, each queryable as its own clearinghouse.
 * Global and slow-moving — a new DEX is deployed only occasionally — so it caches
 * process-wide like the other market references. The leading `null` main book is
 * dropped; it's already covered by the default clearinghouse query.
 */
export async function getBuilderDexNames(): Promise<string[]> {
  return cache.getOrLoad("builderDexNames", 5 * 60_000, async () =>
    (await fetchPerpDexs()).flatMap((dex) => (dex ? [dex.name] : [])),
  );
}
