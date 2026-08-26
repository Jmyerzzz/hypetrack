import type {
  PeriodKey,
  PnlSummaryEntry,
  PortfolioPoint,
  PortfolioSeries,
} from "./api-types";
import { returnOnAvgEquity } from "./risk";

/**
 * Pure math over Hyperliquid's portfolio series: the PnL summary the cards
 * read, and the addition that turns several accounts' series into one. Shared
 * by the server builder and the all-accounts merge so the two can't disagree
 * about what a period's figures mean.
 */

const PERIODS: PeriodKey[] = ["day", "week", "month", "allTime"];

export function summarizePnl(
  series: Record<string, PortfolioSeries>,
): PnlSummaryEntry[] {
  return PERIODS.map((period) => {
    const s = series[period];
    // Combined (perp + spot + vaults) PnL, to match Hyperliquid's portfolio
    // page and the combined Total Equity shown alongside these figures. Falls
    // back to perp-only if the combined series is unavailable.
    const cum = s?.combinedPnl.length ? s.combinedPnl : s?.pnl;
    if (!s || !cum || cum.length === 0) return { period, pnl: 0, pct: null };
    const pnl = cum[cum.length - 1].v - cum[0].v;
    // % = PnL over the window's time-averaged total equity — see risk.ts
    // for why this beats compounded TWR on sampled series.
    const pct = returnOnAvgEquity(s.combinedValue, cum);
    return { period, pnl, pct };
  });
}

/** Sorted, de-duplicated timestamps across every supplied series. */
function sampleGrid(series: PortfolioPoint[][]): number[] {
  const times = new Set<number>();
  for (const points of series) for (const p of points) times.add(p.t);
  return [...times].sort((a, b) => a - b);
}

/**
 * Adds several accounts' samples of the same curve onto one timestamp grid.
 * Each account holds its last known value between its own samples and reads
 * zero before the first — an account that didn't exist yet held no equity and
 * had accrued no PnL, which is exactly what a merged curve should show. The
 * cursor walk assumes each input is in time order, as Hyperliquid returns it.
 */
function sumOnGrid(
  series: PortfolioPoint[][],
  grid: number[],
): PortfolioPoint[] {
  const at = series.map(() => 0);
  const held = series.map(() => 0);
  return grid.map((t) => {
    let v = 0;
    for (let i = 0; i < series.length; i++) {
      const points = series[i];
      while (at[i] < points.length && points[at[i]].t <= t) {
        held[i] = points[at[i]].v;
        at[i]++;
      }
      v += held[i];
    }
    return { t, v };
  });
}

/**
 * One period's series summed across accounts. The perp pair and the combined
 * pair each get their own grid — they come from different Hyperliquid buckets
 * and are sampled independently — but within a pair both curves land on the
 * same timestamps, which `dailyReturns` relies on when it walks them by index.
 */
export function mergeSeries(parts: PortfolioSeries[]): PortfolioSeries {
  const perpGrid = sampleGrid(parts.flatMap((p) => [p.accountValue, p.pnl]));
  const combinedGrid = sampleGrid(
    parts.flatMap((p) => [p.combinedValue, p.combinedPnl]),
  );
  return {
    accountValue: sumOnGrid(
      parts.map((p) => p.accountValue),
      perpGrid,
    ),
    pnl: sumOnGrid(
      parts.map((p) => p.pnl),
      perpGrid,
    ),
    volume: parts.reduce((a, p) => a + p.volume, 0),
    combinedValue: sumOnGrid(
      parts.map((p) => p.combinedValue),
      combinedGrid,
    ),
    combinedPnl: sumOnGrid(
      parts.map((p) => p.combinedPnl),
      combinedGrid,
    ),
  };
}

/** Every period either side holds, each summed across the accounts that have it. */
export function mergePortfolios(
  parts: Record<string, PortfolioSeries>[],
): Record<string, PortfolioSeries> {
  const out: Record<string, PortfolioSeries> = {};
  for (const period of new Set(parts.flatMap((p) => Object.keys(p)))) {
    const series = parts
      .map((p) => p[period])
      .filter((s): s is PortfolioSeries => s != null);
    if (series.length > 0) out[period] = mergeSeries(series);
  }
  return out;
}
