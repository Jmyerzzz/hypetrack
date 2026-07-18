import type { HlSpotMetaAndAssetCtxs } from "./types";

/** Token index → display name and USD price (via the token's USDC pair mid). */
export type SpotTokenInfo = Record<
  number,
  { name: string; price: number | null }
>;

export function buildSpotTokenInfo(
  data: HlSpotMetaAndAssetCtxs,
): SpotTokenInfo {
  const [meta, ctxs] = data;
  const ctxByCoin = new Map(ctxs.map((c) => [c.coin, c]));
  const info: SpotTokenInfo = {};
  for (const token of meta.tokens) {
    info[token.index] = {
      name: token.name,
      price: token.index === 0 ? 1 : null,
    };
  }
  for (const pair of meta.universe) {
    const [base, quote] = pair.tokens;
    if (quote !== 0) continue;
    const ctx = ctxByCoin.get(pair.name);
    const price = ctx ? Number(ctx.midPx ?? ctx.markPx) : null;
    const entry = info[base];
    if (entry && price != null && Number.isFinite(price)) {
      entry.price = price;
    }
  }
  return info;
}
