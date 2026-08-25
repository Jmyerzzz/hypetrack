/**
 * Buy-and-hold benchmarks for the equity chart: "how would the same stack have
 * done in BTC, or in the index funds everyone else owns?".
 *
 * The comparison is deliberately plotted in the chart's own units rather than
 * on a second % axis — a benchmark is the account's starting equity for the
 * window, marked to the benchmark's price from that moment on. One scale, one
 * axis, and the two curves are read against each other directly.
 */

export type BenchmarkId = "btc" | "spx" | "ndx";

export type BenchmarkMeta = {
  id: BenchmarkId;
  /** Chip label — kept short enough to sit in the chart header on a phone. */
  label: string;
  /** Full name, for tooltips and titles. */
  name: string;
  /** Where the prices come from, disclosed in the chart's footnote. */
  source: string;
};

/**
 * Fixed order — it is the categorical color order too (see the
 * `--bench-*` tokens in globals.css), so a benchmark keeps its color no
 * matter which subset is toggled on.
 */
export const BENCHMARKS: readonly BenchmarkMeta[] = [
  {
    id: "btc",
    label: "BTC",
    name: "Bitcoin",
    source: "Hyperliquid BTC-PERP candles",
  },
  {
    id: "spx",
    label: "S&P 500",
    name: "S&P 500",
    source: "index closes",
  },
  {
    id: "ndx",
    label: "Nasdaq",
    name: "Nasdaq 100",
    source: "index closes",
  },
] as const;

export const BENCHMARK_IDS: readonly BenchmarkId[] = BENCHMARKS.map(
  (b) => b.id,
);

export function isBenchmarkId(value: string): value is BenchmarkId {
  return (BENCHMARK_IDS as readonly string[]).includes(value);
}

/** One benchmark close: `t` ms, `c` price. */
export type BenchmarkPoint = { t: number; c: number };

/**
 * Prices are fetched per portfolio period so each window gets a sampling
 * that suits it — 5-minute candles for a day, daily closes for all time —
 * exactly like Hyperliquid's own portfolio buckets.
 */
export type BenchmarkPeriod = "day" | "week" | "month" | "allTime";

export const BENCHMARK_PERIODS: readonly BenchmarkPeriod[] = [
  "day",
  "week",
  "month",
  "allTime",
];

export function isBenchmarkPeriod(value: string): value is BenchmarkPeriod {
  return (BENCHMARK_PERIODS as readonly string[]).includes(value);
}

/**
 * Clean up a raw price series: finite positive closes only, ascending by
 * time, one point per timestamp. Both upstreams occasionally serve a null
 * close (an index bar that hasn't printed yet) or repeat the newest bar.
 */
export function normalizePoints(points: BenchmarkPoint[]): BenchmarkPoint[] {
  const byTime = new Map<number, number>();
  for (const p of points) {
    if (!Number.isFinite(p.t) || !Number.isFinite(p.c) || p.c <= 0) continue;
    byTime.set(p.t, p.c);
  }
  return [...byTime].sort((a, b) => a[0] - b[0]).map(([t, c]) => ({ t, c }));
}

/**
 * Benchmark price in force at each of `times`, as a step function: the last
 * close at or before that moment. Prices carry forward across gaps, which is
 * what an equity index does over a weekend — it holds its Friday close while
 * the account keeps trading. Timestamps before the first close have no price
 * and come back null rather than borrowing a later one.
 *
 * Both arrays must be ascending; the walk is linear rather than a binary
 * search per point because the caller already has them in order.
 */
export function alignPrices(
  points: BenchmarkPoint[],
  times: number[],
): (number | null)[] {
  const out: (number | null)[] = new Array(times.length).fill(null);
  if (points.length === 0) return out;
  let i = 0;
  let current: number | null = null;
  for (let k = 0; k < times.length; k++) {
    while (i < points.length && points[i].t <= times[k]) {
      current = points[i].c;
      i++;
    }
    out[k] = current;
  }
  return out;
}

/**
 * First and last priced points of an aligned series, and where the first one
 * falls. Null when nothing in the window has a price behind it.
 */
function priceSpan(
  prices: (number | null)[],
): { base: number; last: number; firstIndex: number } | null {
  let firstIndex = -1;
  let last: number | null = null;
  for (let i = 0; i < prices.length; i++) {
    const price = prices[i];
    if (price == null) continue;
    if (firstIndex === -1) firstIndex = i;
    last = price;
  }
  if (firstIndex === -1 || last == null) return null;
  return { base: prices[firstIndex] as number, last, firstIndex };
}

/**
 * How the benchmark moved across the plotted window, as a fraction: its last
 * price over the price in force at the first plotted point. Independent of
 * the account, so it still answers "how did BTC do over this window" when the
 * overlay itself can't be drawn.
 */
export function benchmarkReturn(
  points: BenchmarkPoint[],
  times: number[],
): number | null {
  const span = priceSpan(alignPrices(points, times));
  return span == null ? null : span.last / span.base - 1;
}

export type BenchmarkCurve = {
  /** Hypothetical value of the stake, aligned 1:1 with the account's points. */
  values: (number | null)[];
  /** Growth over the covered span as a fraction (0.12 = +12%). */
  totalReturn: number;
  /**
   * True when the series starts after the window does — a benchmark whose
   * history doesn't reach back that far, so its line begins mid-chart.
   */
  partial: boolean;
};

/**
 * Mark `stake` dollars to a benchmark across the account's own timestamps.
 *
 * The base is the price in force at the first plotted point, so the curve
 * leaves that point at exactly the account's own value and every later
 * divergence is the two returns pulling apart. `mode` picks the units:
 * "value" tracks the stake itself, "pnl" tracks its profit — which starts at
 * zero, matching the chart's rebased PnL curve.
 */
export function benchmarkCurve(
  points: BenchmarkPoint[],
  times: number[],
  stake: number,
  mode: "value" | "pnl",
): BenchmarkCurve | null {
  if (times.length === 0 || !Number.isFinite(stake) || stake <= 0) return null;
  const prices = alignPrices(points, times);
  const span = priceSpan(prices);
  if (span == null) return null;
  const { base, last, firstIndex } = span;

  const values = prices.map((price) =>
    price == null
      ? null
      : mode === "pnl"
        ? stake * (price / base - 1)
        : stake * (price / base),
  );

  return {
    values,
    totalReturn: last / base - 1,
    partial: firstIndex > 0,
  };
}
