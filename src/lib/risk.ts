import type { PortfolioPoint, PortfolioSeries } from "./api-types";

export type RiskMetrics = {
  /** Annualized (√365) from daily perp PnL returns over ~30 days. */
  sharpe: number | null;
  /** Same basis, downside deviation only; "inf" when there were no down days. */
  sortino: number | "inf" | null;
  /** Largest peak-to-trough drop of the cumulative perp PnL curve, all-time. */
  maxDrawdownUsd: number | null;
  /** That drop relative to account equity at the peak. */
  maxDrawdownPct: number | null;
  dailySamples: number;
};

const DAY_MS = 86_400_000;
const MIN_DAILY_SAMPLES = 8;

/**
 * Daily returns from sampled cumulative-PnL and account-value series:
 * bucket samples by UTC day (last sample wins), then
 * r_d = ΔPnL_d / accountValue at the previous day's close. Using PnL deltas
 * rather than equity deltas keeps deposits/withdrawals out of the returns.
 */
export function dailyReturns(
  accountValue: PortfolioPoint[],
  pnl: PortfolioPoint[],
): number[] {
  const n = Math.min(accountValue.length, pnl.length);
  const byDay = new Map<number, { pnl: number; av: number }>();
  for (let i = 0; i < n; i++) {
    byDay.set(Math.floor(pnl[i].t / DAY_MS), {
      pnl: pnl[i].v,
      av: accountValue[i].v,
    });
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const returns: number[] = [];
  for (let i = 1; i < days.length; i++) {
    const prev = byDay.get(days[i - 1]);
    const curr = byDay.get(days[i]);
    if (!prev || !curr || prev.av <= 1) continue;
    returns.push((curr.pnl - prev.pnl) / prev.av);
  }
  return returns;
}

export function sharpeSortino(returns: number[]): {
  sharpe: number | null;
  sortino: number | "inf" | null;
} {
  if (returns.length < MIN_DAILY_SAMPLES)
    return { sharpe: null, sortino: null };
  const mean = returns.reduce((a, r) => a + r, 0) / returns.length;
  const variance =
    returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  const annualize = Math.sqrt(365);

  const downside = Math.sqrt(
    returns.reduce((a, r) => a + Math.min(r, 0) ** 2, 0) / returns.length,
  );

  return {
    sharpe: std > 0 ? (mean / std) * annualize : null,
    sortino:
      downside > 0 ? (mean / downside) * annualize : mean > 0 ? "inf" : null,
  };
}

/**
 * Max drawdown measured on the cumulative PnL curve (transfer-immune),
 * with the % expressed against account equity at the time of the peak.
 */
export function pnlMaxDrawdown(
  accountValue: PortfolioPoint[],
  pnl: PortfolioPoint[],
): { usd: number; pct: number | null } | null {
  const n = Math.min(accountValue.length, pnl.length);
  if (n === 0) return null;
  let peakPnl = Number.NEGATIVE_INFINITY;
  let avAtPeak = 0;
  let maxDd = 0;
  let pctAtMax: number | null = null;
  for (let i = 0; i < n; i++) {
    if (pnl[i].v > peakPnl) {
      peakPnl = pnl[i].v;
      avAtPeak = accountValue[i].v;
    }
    const dd = peakPnl - pnl[i].v;
    if (dd > maxDd) {
      maxDd = dd;
      pctAtMax = avAtPeak > 1 ? dd / avAtPeak : null;
    }
  }
  return { usd: maxDd, pct: pctAtMax };
}

export function computeRiskMetrics(
  month: PortfolioSeries | undefined,
  allTime: PortfolioSeries | undefined,
): RiskMetrics {
  const returns = month ? dailyReturns(month.accountValue, month.pnl) : [];
  const { sharpe, sortino } = sharpeSortino(returns);
  const dd = allTime ? pnlMaxDrawdown(allTime.accountValue, allTime.pnl) : null;
  return {
    sharpe,
    sortino,
    maxDrawdownUsd: dd?.usd ?? null,
    maxDrawdownPct: dd?.pct ?? null,
    dailySamples: returns.length,
  };
}
