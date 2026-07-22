import type { PortfolioPoint, PortfolioSeries } from "./api-types";

export type RiskMetrics = {
  /** Annualized (√365) from daily perp PnL returns over ~30 days. */
  sharpe: number | null;
  /** Same basis, downside deviation only; "inf" when there were no down days. */
  sortino: number | "inf" | null;
  /** Largest peak-to-trough drop of the combined account-value curve (30D). */
  maxDrawdownUsd: number | null;
  /** That drop as a fraction of the running peak — matches Hyperliquid's figure. */
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
 * The current (incomplete) UTC day is dropped — a partial day would enter
 * the annualized mean/variance with full-day weight and deflate volatility.
 */
export function dailyReturns(
  accountValue: PortfolioPoint[],
  pnl: PortfolioPoint[],
  now: number = Date.now(),
): number[] {
  const today = Math.floor(now / DAY_MS);
  const n = Math.min(accountValue.length, pnl.length);
  const byDay = new Map<number, { pnl: number; av: number }>();
  for (let i = 0; i < n; i++) {
    const day = Math.floor(pnl[i].t / DAY_MS);
    if (day >= today) continue;
    byDay.set(day, {
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

/**
 * Time-weighted return (GIPS-style): per-sample trading returns compounded
 * over the window, so deposits and withdrawals between samples don't distort
 * the result. Each interval's return is ΔPnL over the account equity at the
 * prior sample; intervals with ~no measurable capital (< $1) are skipped.
 * Series are aligned by timestamp (Hyperliquid samples them together).
 * Returns the cumulative curve; the last point is the window's return.
 */
/**
 * Time-weighted average of an equity series over its window (trapezoid rule,
 * so irregular sampling is handled). Null when the series is empty.
 */
export function avgEquity(equity: PortfolioPoint[]): number | null {
  if (equity.length === 0) return null;
  if (equity.length === 1) return equity[0].v;
  let weighted = 0;
  let span = 0;
  for (let i = 1; i < equity.length; i++) {
    const dt = equity[i].t - equity[i - 1].t;
    if (dt <= 0) continue;
    weighted += ((equity[i].v + equity[i - 1].v) / 2) * dt;
    span += dt;
  }
  return span > 0 ? weighted / span : equity[equity.length - 1].v;
}

/** Ignore percent math on dust accounts — a % of a few dollars is noise. */
const MIN_AVG_EQUITY = 10;

/**
 * Period return: PnL over the window divided by the time-averaged total
 * equity in the window (Modified-Dietz-style "return on average capital").
 * Chosen over compounded TWR deliberately: with sampled series, compounding
 * explodes when early-window equity is near zero and breaks entirely when
 * the two series are downsampled at different timestamps. This measure is
 * stable, needs no alignment, and matches TWR when capital is steady.
 */
export function returnOnAvgEquity(
  equity: PortfolioPoint[],
  pnl: PortfolioPoint[],
): number | null {
  if (pnl.length < 2) return null;
  const base = avgEquity(equity);
  if (base == null || base < MIN_AVG_EQUITY) return null;
  return (pnl[pnl.length - 1].v - pnl[0].v) / base;
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
 * Conventional max drawdown of an account-value curve: the largest peak-to-trough
 * decline as a fraction of the running peak — the same measure Hyperliquid's
 * portfolio page reports. Non-positive samples (portfolio-series gaps, where the
 * account momentarily reads $0) are skipped so a spurious zero can't register as
 * a 100% wipeout. Returns the % alongside the dollar drop at that trough.
 */
export function accountValueMaxDrawdown(
  equity: PortfolioPoint[],
): { usd: number; pct: number } | null {
  let peak = 0;
  let maxPct = 0;
  let usdAtMaxPct = 0;
  let seen = false;
  for (const point of equity) {
    const v = point.v;
    if (v <= 0) continue;
    seen = true;
    if (v > peak) peak = v;
    const dd = peak - v;
    const pct = peak > 0 ? dd / peak : 0;
    if (pct > maxPct) {
      maxPct = pct;
      usdAtMaxPct = dd;
    }
  }
  return seen ? { usd: usdAtMaxPct, pct: maxPct } : null;
}

export function computeRiskMetrics(
  month: PortfolioSeries | undefined,
): RiskMetrics {
  const returns = month ? dailyReturns(month.accountValue, month.pnl) : [];
  const { sharpe, sortino } = sharpeSortino(returns);
  // Drawdown tracks the combined (perp + spot) account value over the 30-day
  // window, matching Hyperliquid's portfolio "Max Drawdown".
  const dd = month ? accountValueMaxDrawdown(month.combinedValue) : null;
  return {
    sharpe,
    sortino,
    maxDrawdownUsd: dd?.usd ?? null,
    maxDrawdownPct: dd?.pct ?? null,
    dailySamples: returns.length,
  };
}
