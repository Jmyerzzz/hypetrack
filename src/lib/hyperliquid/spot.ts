import type { HlSpotMetaAndAssetCtxs } from "./types";

export type SpotMaps = {
  /** Pair coin (e.g. "@107" or "PURR/USDC") → display name (e.g. "HYPE/USDC"). */
  pairDisplay: Record<string, string>;
  /** Token index → { name, pairCoin (vs USDC), price }. */
  tokens: Record<
    number,
    { name: string; pairCoin: string | null; price: number | null }
  >;
};

/** Builds display names and USD prices for spot pairs/tokens from spot metadata. */
export function buildSpotMaps(data: HlSpotMetaAndAssetCtxs): SpotMaps {
  const [meta, ctxs] = data;
  const ctxByCoin = new Map(ctxs.map((c) => [c.coin, c]));
  const tokenName = (idx: number): string =>
    meta.tokens[idx]?.name ?? `#${idx}`;

  const pairDisplay: Record<string, string> = {};
  const tokens: SpotMaps["tokens"] = {};

  for (const token of meta.tokens) {
    tokens[token.index] = {
      name: token.name,
      pairCoin: null,
      price: token.index === 0 ? 1 : null,
    };
  }

  for (const pair of meta.universe) {
    const [base, quote] = pair.tokens;
    pairDisplay[pair.name] = `${tokenName(base)}/${tokenName(quote)}`;
    if (quote === 0) {
      const ctx = ctxByCoin.get(pair.name);
      const price = ctx ? Number(ctx.midPx ?? ctx.markPx) : null;
      const entry = tokens[base];
      if (entry) {
        entry.pairCoin = pair.name;
        entry.price = price != null && Number.isFinite(price) ? price : null;
      }
    }
  }

  return { pairDisplay, tokens };
}

/** Display name for any fill/order coin: maps spot pair ids, keeps perps as-is. */
export function displayCoin(coin: string, maps?: SpotMaps | null): string {
  if (maps?.pairDisplay[coin]) return maps.pairDisplay[coin];
  return coin;
}
