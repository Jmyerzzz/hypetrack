import type { BenchmarkSeriesView, BenchmarksPayload } from "../api-types";
import {
  BENCHMARKS,
  type BenchmarkId,
  type BenchmarkPeriod,
  type BenchmarkPoint,
  normalizePoints,
} from "../benchmarks";
import { cache } from "../cache";
import { fetchCandles } from "../hyperliquid/client";
import type { HlCandle } from "../hyperliquid/types";

/**
 * Benchmark price history, per portfolio period.
 *
 * Every benchmark is a Hyperliquid perp, read through the same candle endpoint
 * the rest of the app runs on: BTC from the main book, and the two equity
 * indices from trade.xyz's HIP-3 markets — `xyz:SP500`, the licensed S&P 500
 * contract, and `xyz:XYZ100`, its Nasdaq-100-style index (the coins live on
 * {@link BENCHMARKS}, so the chart can name them). One upstream, no key, no
 * bot wall: the public quote endpoints the indices used to come from turned
 * away datacenter traffic often enough that the chips read "n/a" in
 * production more often than not.
 *
 * A perp also trades around the clock, which is the window an account
 * actually trades in: the index lines move through the weekend the way the
 * account's own curve does, instead of holding a Friday close. Two things
 * follow from pricing an index off its perp. The price is the market's mark,
 * which tracks the index futures rather than the cash index, so it can sit a
 * little away from the number on the news. And the history starts at the
 * market's listing, so an all-time index line can begin mid-chart; the client
 * flags that as a partial series rather than borrowing a later price.
 *
 * Prices are market data, identical for every visitor, so they cache
 * process-wide like the other market references.
 */

const DAY_MS = 86_400_000;

type PeriodSpec = {
  /** How far back to reach; a little past the window, for the base price. */
  spanMs: number;
  /** Hyperliquid candle interval. */
  interval: string;
  ttlMs: number;
};

/**
 * Sampling per window: fine enough that a day reads as a curve rather than a
 * staircase, coarse enough that all-time stays a few thousand points — and
 * every span well inside the 5000 candles a snapshot can return. Each span
 * overshoots its window so there is always a close before the first account
 * point to base the comparison on.
 */
const PERIOD_SPECS: Record<BenchmarkPeriod, PeriodSpec> = {
  day: { spanMs: 5 * DAY_MS, interval: "5m", ttlMs: 60_000 },
  week: { spanMs: 14 * DAY_MS, interval: "1h", ttlMs: 5 * 60_000 },
  month: { spanMs: 45 * DAY_MS, interval: "4h", ttlMs: 10 * 60_000 },
  allTime: {
    // Hyperliquid opened in 2023, so five years of daily closes outruns any
    // account's history while staying a couple of thousand points.
    spanMs: 5 * 365 * DAY_MS,
    interval: "1d",
    ttlMs: 30 * 60_000,
  },
};

/**
 * Two bounded attempts per market, inside a serverless route's budget: the
 * chart is an overlay, not the page, so the client's 15s × 3 default would be
 * a long wait for a dashed line. The markets load in parallel, so the route
 * is never slower than its slowest one.
 */
const CANDLE_TIMEOUT_MS = 3_500;
const CANDLE_RETRIES = 1;

/**
 * An upstream failure in one short clause, for the payload. These reach the
 * chart, so they say what went wrong without a stack or a URL: the reader
 * wants to know whether to try again in a minute or not at all.
 */
function brief(err: unknown, limit = 80): string {
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "TimeoutError")
      return "timed out";
    // undici wraps connection-level failures in a bare "fetch failed".
    if (err.message === "fetch failed" && err.cause)
      return brief(err.cause, limit);
  }
  const flat = (err instanceof Error ? err.message : String(err))
    .replace(/\s+/g, " ")
    .trim();
  if (!flat) return "failed";
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

/**
 * Candles as closes, each stamped at the candle's close: a price sits at the
 * moment it was last true rather than at the start of the bar that produced
 * it. The API serves prices as decimal strings; one that doesn't parse is
 * dropped rather than plotted as a hole.
 */
export function candlePoints(candles: HlCandle[]): BenchmarkPoint[] {
  return normalizePoints(candles.map((c) => ({ t: c.T, c: Number(c.c) })));
}

async function fetchMarketPoints(
  market: string,
  spec: PeriodSpec,
  now: number,
): Promise<{ points: BenchmarkPoint[]; source: string }> {
  const candles: HlCandle[] = await fetchCandles(
    market,
    spec.interval,
    now - spec.spanMs,
    now,
    { timeoutMs: CANDLE_TIMEOUT_MS, retries: CANDLE_RETRIES },
  );
  const points = candlePoints(candles);
  if (points.length === 0) throw new Error("no candles returned");
  return { points, source: "Hyperliquid" };
}

/**
 * One benchmark's prices for one window, cached on its own. Caching per
 * benchmark rather than per payload keeps one market's bad minute from
 * shortening the cache life of the two that answered — and lets the cache's
 * own brief failure memory hold the retry back, instead of a fresh attempt
 * per chart render.
 */
function getBenchmarkSeries(
  id: BenchmarkId,
  market: string,
  period: BenchmarkPeriod,
  now: number,
): Promise<{ points: BenchmarkPoint[]; source: string }> {
  const spec = PERIOD_SPECS[period];
  return cache.getOrLoad(`benchmark:${id}:${period}`, spec.ttlMs, () =>
    fetchMarketPoints(market, spec, now),
  );
}

/**
 * Every benchmark for one window. A benchmark that can't be loaded comes back
 * empty rather than failing the payload: the chart drops that one line, keeps
 * the rest, and says why that one is missing.
 */
export async function getBenchmarks(
  period: BenchmarkPeriod,
): Promise<BenchmarksPayload> {
  const now = Date.now();
  const series = await Promise.all(
    BENCHMARKS.map(({ id, market }) =>
      getBenchmarkSeries(id, market, period, now)
        .then(
          ({ points, source }): BenchmarkSeriesView => ({
            id,
            points,
            source,
            error: null,
          }),
        )
        .catch(
          (err: unknown): BenchmarkSeriesView => ({
            id,
            points: [],
            source: null,
            error: brief(err, 240),
          }),
        ),
    ),
  );
  return { period, fetchedAt: now, series };
}
