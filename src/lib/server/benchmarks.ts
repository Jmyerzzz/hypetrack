import type { BenchmarkSeriesView, BenchmarksPayload } from "../api-types";
import {
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
 * BTC comes from Hyperliquid's own candles — the same API the rest of the app
 * runs on, so the crypto benchmark needs no third party and covers the 24/7
 * window an account actually trades in.
 *
 * The equity indices have no Hyperliquid market, so they come from a public
 * quote endpoint with a second one behind it: Yahoo's chart API first (it
 * serves intraday bars, which the 24H and 7D windows need), Stooq's daily CSV
 * as the fallback. Either one failing costs that benchmark alone — the route
 * still serves the others, and the chip for a missing one goes dim rather than
 * taking the chart down.
 *
 * Prices are market data, identical for every visitor, so they cache
 * process-wide like the other market references.
 */

const DAY_MS = 86_400_000;

type PeriodSpec = {
  /** How far back to reach; a little past the window, for the base price. */
  spanMs: number;
  /** Hyperliquid candle interval for BTC. */
  candleInterval: string;
  /** Yahoo `range`/`interval` pair. */
  yahoo: { range: string; interval: string };
  ttlMs: number;
};

/**
 * Sampling per window: fine enough that a day reads as a curve rather than a
 * staircase, coarse enough that all-time stays a few thousand points. Each
 * span overshoots its window so there is always a close before the first
 * account point to base the comparison on.
 */
const PERIOD_SPECS: Record<BenchmarkPeriod, PeriodSpec> = {
  day: {
    spanMs: 5 * DAY_MS,
    candleInterval: "5m",
    yahoo: { range: "5d", interval: "5m" },
    ttlMs: 60_000,
  },
  week: {
    spanMs: 14 * DAY_MS,
    candleInterval: "1h",
    yahoo: { range: "1mo", interval: "1h" },
    ttlMs: 5 * 60_000,
  },
  month: {
    spanMs: 45 * DAY_MS,
    candleInterval: "4h",
    yahoo: { range: "3mo", interval: "1h" },
    ttlMs: 10 * 60_000,
  },
  allTime: {
    // Hyperliquid opened in 2023, so five years of daily closes outruns any
    // account's history while staying a couple of thousand points.
    spanMs: 5 * 365 * DAY_MS,
    candleInterval: "1d",
    yahoo: { range: "5y", interval: "1d" },
    ttlMs: 30 * 60_000,
  },
};

/** Ticker per benchmark on each upstream. BTC never uses them. */
const INDEX_SYMBOLS: Record<"spx" | "ndx", { yahoo: string; stooq: string }> = {
  spx: { yahoo: "^GSPC", stooq: "^spx" },
  ndx: { yahoo: "^NDX", stooq: "^ndx" },
};

const UPSTREAM_TIMEOUT_MS = 12_000;

/**
 * A default-looking user agent: both quote endpoints answer 403 to a bare
 * fetch, and neither offers a keyed API to identify ourselves with instead.
 */
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchUpstream(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "*/*" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

type YahooChart = {
  chart?: {
    result?: {
      timestamp?: number[];
      indicators?: { quote?: { close?: (number | null)[] }[] };
    }[];
    error?: { description?: string } | null;
  };
};

/**
 * Yahoo's chart payload: parallel arrays of second-resolution timestamps and
 * closes, with a null close for any bar that hasn't printed yet (the current
 * one, and holidays inside the range).
 */
export function parseYahooChart(body: string): BenchmarkPoint[] {
  const json = JSON.parse(body) as YahooChart;
  const result = json.chart?.result?.[0];
  const times = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!times || !closes) {
    throw new Error(json.chart?.error?.description ?? "Unexpected chart shape");
  }
  const points: BenchmarkPoint[] = [];
  for (let i = 0; i < times.length; i++) {
    const close = closes[i];
    if (close == null) continue;
    points.push({ t: times[i] * 1000, c: close });
  }
  return normalizePoints(points);
}

/** 16:00 New York, the closing bell, in UTC hours — 20:00 EDT / 21:00 EST. */
const CLOSE_HOUR_UTC = 20;

/**
 * Stooq's daily CSV: `Date,Open,High,Low,Close,Volume`, one row per session.
 * A bare date would stamp Friday's close at Friday midnight — a day early on
 * an intraday axis — so each close is stamped at the closing bell instead.
 */
export function parseStooqCsv(body: string): BenchmarkPoint[] {
  const lines = body.trim().split(/\r?\n/);
  const header = lines[0]?.toLowerCase() ?? "";
  if (!header.startsWith("date,")) throw new Error("Unexpected CSV shape");
  const closeIndex = header.split(",").indexOf("close");
  if (closeIndex === -1) throw new Error("CSV has no close column");
  const points: BenchmarkPoint[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const day = Date.parse(`${cells[0]}T00:00:00Z`);
    if (!Number.isFinite(day)) continue;
    points.push({
      t: day + CLOSE_HOUR_UTC * 3_600_000,
      c: Number(cells[closeIndex]),
    });
  }
  return normalizePoints(points);
}

/** `YYYYMMDD`, the only date format Stooq's range parameters take. */
function stooqDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
}

async function fetchIndexPoints(
  id: "spx" | "ndx",
  spec: PeriodSpec,
  now: number,
): Promise<{ points: BenchmarkPoint[]; source: string }> {
  const symbols = INDEX_SYMBOLS[id];
  try {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbols.yahoo)}` +
      `?range=${spec.yahoo.range}&interval=${spec.yahoo.interval}`;
    const points = parseYahooChart(await fetchUpstream(url));
    if (points.length === 0) throw new Error("No closes returned");
    return { points, source: "Yahoo Finance" };
  } catch {
    // Daily closes only, so a 24H window gets a flat line rather than a shape
    // — still the right number, and better than dropping the benchmark.
    const url =
      `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbols.stooq)}&i=d` +
      `&d1=${stooqDay(now - spec.spanMs)}&d2=${stooqDay(now)}`;
    const points = parseStooqCsv(await fetchUpstream(url));
    if (points.length === 0) throw new Error("No closes returned");
    return { points, source: "Stooq" };
  }
}

async function fetchBtcPoints(
  spec: PeriodSpec,
  now: number,
): Promise<{ points: BenchmarkPoint[]; source: string }> {
  const candles: HlCandle[] = await fetchCandles(
    "BTC",
    spec.candleInterval,
    now - spec.spanMs,
    now,
  );
  // Stamped at the candle's close, so a price sits at the moment it was last
  // true rather than at the start of the bar that produced it.
  const points = normalizePoints(
    candles.map((c) => ({ t: c.T, c: Number(c.c) })),
  );
  if (points.length === 0) throw new Error("No candles returned");
  return { points, source: "Hyperliquid" };
}

/**
 * One benchmark's prices for one window, cached on its own. Caching per
 * benchmark rather than per payload keeps a dead quote endpoint from
 * shortening the cache life of the two that answered — and lets the cache's
 * own brief failure memory hold the retry back, instead of a fresh attempt
 * per chart render.
 */
function getBenchmarkSeries(
  id: BenchmarkId,
  period: BenchmarkPeriod,
  now: number,
): Promise<{ points: BenchmarkPoint[]; source: string }> {
  const spec = PERIOD_SPECS[period];
  return cache.getOrLoad(`benchmark:${id}:${period}`, spec.ttlMs, () =>
    id === "btc" ? fetchBtcPoints(spec, now) : fetchIndexPoints(id, spec, now),
  );
}

/**
 * Every benchmark for one window. A benchmark that can't be loaded comes back
 * empty rather than failing the payload: the chart drops that one line and
 * keeps the rest.
 */
export async function getBenchmarks(
  period: BenchmarkPeriod,
): Promise<BenchmarksPayload> {
  const now = Date.now();
  const series = await Promise.all(
    (["btc", "spx", "ndx"] as const).map((id) =>
      getBenchmarkSeries(id, period, now)
        .then(({ points, source }) => ({ id, points, source }))
        .catch((): BenchmarkSeriesView => ({ id, points: [], source: null })),
    ),
  );
  return { period, fetchedAt: now, series };
}
