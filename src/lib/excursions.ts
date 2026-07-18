import type { HlCandle } from "./hyperliquid/types";
import type { Trade } from "./trades";

export type Excursion = {
  /** Best unrealized move as a fraction of avg entry (≥ 0). */
  mfePct: number;
  /** Worst unrealized move as a fraction of avg entry (≥ 0). */
  maePct: number;
  mfeUsd: number;
  maeUsd: number;
};

const num = (s: string): number => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};

/**
 * Maximum favorable / adverse excursion for a trade, from candles of its
 * market plus the trade's own fill prices (which sharpen sub-candle moves).
 * Null when the entry price is unknown (partial-history trades) or no price
 * data overlaps the holding window.
 */
export function computeTradeExcursion(
  trade: Trade,
  candles: HlCandle[],
): Excursion | null {
  const entry = trade.avgEntryPx;
  if (entry == null || entry <= 0 || trade.maxSize <= 0) return null;
  const start = trade.openedAt;
  const end = trade.closedAt ?? Number.MAX_SAFE_INTEGER;

  let hi = Number.NEGATIVE_INFINITY;
  let lo = Number.POSITIVE_INFINITY;
  for (const c of candles) {
    // Strict containment: a candle that merely overlaps the window would
    // smuggle in extremes from before the open / after the close. Boundary
    // price action is still captured by the fill prices below, so the
    // estimate is biased low, never fabricated high.
    if (c.t < start || c.T > end) continue;
    const h = num(c.h);
    const l = num(c.l);
    if (h > hi) hi = h;
    if (l > 0 && l < lo) lo = l;
  }
  for (const s of trade.slices) {
    if (s.px > hi) hi = s.px;
    if (s.px > 0 && s.px < lo) lo = s.px;
  }
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;

  const favorable =
    trade.direction === "long" ? (hi - entry) / entry : (entry - lo) / entry;
  const adverse =
    trade.direction === "long" ? (entry - lo) / entry : (hi - entry) / entry;
  const mfePct = Math.max(0, favorable);
  const maePct = Math.max(0, adverse);
  const peakNotional = trade.maxSize * entry;
  return {
    mfePct,
    maePct,
    mfeUsd: mfePct * peakNotional,
    maeUsd: maePct * peakNotional,
  };
}

/** Smallest candle interval that covers `spanMs` in ≤ ~4500 candles. */
export function pickCandleInterval(spanMs: number): {
  interval: string;
  ms: number;
} {
  const options: [string, number][] = [
    ["15m", 900_000],
    ["1h", 3_600_000],
    ["4h", 14_400_000],
    ["1d", 86_400_000],
  ];
  for (const [interval, ms] of options) {
    if (spanMs / ms <= 4500) return { interval, ms };
  }
  return { interval: "1d", ms: 86_400_000 };
}
