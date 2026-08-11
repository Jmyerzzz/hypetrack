import type { Trade } from "./trades";

/**
 * Shareable PnL cards for fully closed perp trades, rendered on the fly by
 * `/api/card/[address]` from the same reconstructed-trade data the dashboard
 * shows — nothing is stored. The helpers here are the route's pure core.
 */

/** Card image URL for one trade; the id rides a query param because builder-DEX coins put `:` inside ids. */
export function cardTradeHref(address: string, tradeId: string): string {
  return `/api/card/${address}?trade=${encodeURIComponent(tradeId)}`;
}

/** True for trades the card route renders: perp lifecycles that fully closed. */
export function isCardTrade(trade: Trade): boolean {
  return trade.kind === "perp" && trade.status === "closed";
}

/**
 * Trade ids are `coin:openedAt:seq` with seq numbered across the whole
 * reconstruction, so a fill landing between the dashboard render and the card
 * render can shift seq for every trade after it. Exact id first; then match
 * everything up to the seq — coin plus open time identifies a lifecycle on
 * its own short of a same-millisecond double flip, where any stem match tells
 * the same position story.
 */
export function findCardTrade(trades: Trade[], id: string): Trade | null {
  const exact = trades.find((t) => t.id === id);
  // An exact hit that isn't card-eligible must not fall through to a sibling.
  if (exact) return isCardTrade(exact) ? exact : null;
  const cut = id.lastIndexOf(":");
  if (cut <= 0) return null;
  const stem = id.slice(0, cut + 1);
  return trades.find((t) => t.id.startsWith(stem) && isCardTrade(t)) ?? null;
}

/** Leverage from `activeAssetData`, defended: a positive finite number or null. */
export function sanitizeLeverage(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

/**
 * The card's headline %: price return × leverage, Hyperliquid's share-card
 * convention (fees and funding stay out of it — the $ line carries those).
 * `leverage` is the account's *current* setting for the coin — the same
 * number Hyperliquid stamps on its cards — since fills don't record the
 * setting a closed trade actually ran at; null (setting unavailable, e.g. a
 * delisted market) renders unleveraged. Falls back to net return on peak
 * notional when a truncated history hides the true entry average.
 */
export function cardRoe(trade: Trade, leverage: number | null): number | null {
  const lev = leverage ?? 1;
  const dir = trade.direction === "long" ? 1 : -1;
  const ret =
    trade.avgEntryPx != null && trade.avgExitPx != null && trade.avgEntryPx > 0
      ? (dir * (trade.avgExitPx - trade.avgEntryPx)) / trade.avgEntryPx
      : trade.netPnlPct;
  return ret == null || !Number.isFinite(ret) ? null : ret * lev;
}
