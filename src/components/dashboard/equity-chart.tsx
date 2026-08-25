"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState, Pnl, SegmentedControl, smallCents } from "@/components/ui";
import type { PortfolioPoint, PortfolioSeries } from "@/lib/api-types";
import {
  BENCHMARKS,
  type BenchmarkCurve,
  type BenchmarkId,
  type BenchmarkMeta,
  type BenchmarkPeriod,
  benchmarkCurve,
  benchmarkReturn,
} from "@/lib/benchmarks";
import { fmtCompact, fmtPct, fmtTime } from "@/lib/format";
import { useBenchmarks, useBenchmarkToggles } from "@/lib/hooks";
import { useMoney } from "@/lib/privacy";
import { returnOnAvgEquity } from "@/lib/risk";
import { type TimeWindow, windowBounds, windowLabel } from "@/lib/trades";

type Metric = "equity" | "pnl";

const DAY_MS = 86_400_000;

/** Past this span a date is ambiguous without its year — axis and tooltip
 *  share the threshold so they can't disagree about showing one. */
const YEAR_NEEDED_MS = 180 * DAY_MS;

/**
 * Below this the account had no meaningful capital at the window's start, so
 * there is nothing to have bought a benchmark with and the overlay is dropped.
 */
const MIN_STAKE_USD = 1;

/**
 * One dash for every benchmark: what the pattern says is "reference, not this
 * account" — the account's own curve is the only solid, filled one — so the
 * three references wear it identically and hue alone tells them apart. The
 * hues are picked for that job (see the `--bench-*` tokens), and each line is
 * named beside its swatch in the toggles and in the tooltip.
 */
const BENCHMARK_DASH = "6 3";

const BENCHMARK_STROKE: Record<BenchmarkId, string> = {
  btc: "var(--color-bench-btc)",
  spx: "var(--color-bench-spx)",
  ndx: "var(--color-bench-ndx)",
};

type Point = { t: number; v: number; usd: number };

/** A plotted point plus whatever benchmark values line up with it. */
type Row = Point & Partial<Record<BenchmarkId, number | null>>;

function ChartTooltip({
  active,
  payload,
  metric,
  withYear,
  benchmarks,
  stake,
}: {
  active?: boolean;
  payload?: { payload: Row }[];
  metric: Metric;
  withYear: boolean;
  /** Benchmarks currently drawn, in the fixed palette order. */
  benchmarks: BenchmarkMeta[];
  stake: number | null;
}) {
  const { fmtUsd, fmtUsdSigned } = useMoney();
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const money = metric === "pnl" ? fmtUsdSigned : fmtUsd;
  return (
    <div
      className={`rounded-lg border border-edge2 bg-panel2 px-3 py-2 shadow-xl ${
        benchmarks.length > 0 ? "min-w-[190px]" : ""
      }`}
    >
      <p className="num text-sm font-semibold text-ink">
        {metric === "pnl" ? (
          <Pnl value={point.usd} />
        ) : (
          smallCents(fmtUsd(point.usd))
        )}
      </p>
      {benchmarks.map((bench) => {
        const value = point[bench.id];
        if (value == null) return null;
        // The stake is what bought the benchmark, so its return falls straight
        // out of the plotted value — no second lookup into the price series.
        const pct =
          stake == null
            ? null
            : metric === "pnl"
              ? value / stake
              : value / stake - 1;
        return (
          <p
            key={bench.id}
            className="mt-1 flex items-center gap-1.5 text-[11px] text-ink2"
          >
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full"
              style={{ background: BENCHMARK_STROKE[bench.id] }}
            />
            <span>{bench.name}</span>
            <span className="num ml-auto pl-2">{smallCents(money(value))}</span>
            {pct != null && (
              <span className="num w-14 text-right text-ink3">
                {fmtPct(pct, { signed: true })}
              </span>
            )}
          </p>
        );
      })}
      <p className="mt-0.5 text-[11px] text-ink3">
        {fmtTime(point.t, { withYear })}
      </p>
    </div>
  );
}

/**
 * One benchmark's on/off control, doubling as the chart's legend: the swatch
 * carries the exact stroke and dash the line is drawn with, so identity never
 * depends on matching two colors across the card. An active benchmark shows
 * its return over the window, which stays meaningful even when the overlay
 * itself can't be drawn.
 */
function BenchmarkChip({
  meta,
  active,
  pending,
  pct,
  onToggle,
}: {
  meta: BenchmarkMeta;
  active: boolean;
  pending: boolean;
  /** Return over the plotted window; null = no prices for it. */
  pct: number | null;
  onToggle: () => void;
}) {
  const unavailable = active && !pending && pct == null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      title={
        unavailable
          ? `${meta.name} prices are unavailable right now`
          : `${meta.name} — the same starting equity, bought and held (${meta.source})`
      }
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors max-sm:py-1.5 ${
        active
          ? "border-edge2 bg-panel2 text-ink"
          : "border-edge text-ink3 hover:text-ink2"
      }`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 18 2"
        className={`h-0.5 w-[18px] shrink-0 ${active ? "" : "opacity-60"}`}
      >
        <line
          x1="0"
          y1="1"
          x2="18"
          y2="1"
          stroke={BENCHMARK_STROKE[meta.id]}
          strokeWidth="2"
          strokeDasharray={BENCHMARK_DASH}
        />
      </svg>
      {meta.label}
      {active && (
        <span className="num text-ink2">
          {pending ? "…" : pct == null ? "n/a" : fmtPct(pct, { signed: true })}
        </span>
      )}
    </button>
  );
}

export function EquityChart({
  portfolio,
  timeWindow,
}: {
  portfolio: Record<string, PortfolioSeries>;
  timeWindow: TimeWindow;
}) {
  const { fmtUsd, hidden } = useMoney();
  const [metric, setMetric] = useState<Metric>("equity");
  const [selected, toggleBenchmark] = useBenchmarkToggles();

  // A relative preset has a portfolio bucket sampled for exactly that span; a
  // custom range is cut out of the all-time series, which is sampled coarsely
  // enough that a short custom range plots only a handful of points.
  const series = useMemo(() => {
    const relative =
      timeWindow.preset !== "custom" && timeWindow.preset !== "allTime";
    const base = portfolio[relative ? timeWindow.preset : "allTime"];
    if (!base || relative) return base;
    const b = windowBounds(timeWindow);
    if (b.from == null && b.to == null) return base;
    const cut = (points: PortfolioPoint[]) =>
      points.filter(
        (p) =>
          (b.from == null || p.t >= b.from) && (b.to == null || p.t < b.to),
      );
    return {
      ...base,
      accountValue: cut(base.accountValue),
      pnl: cut(base.pnl),
      combinedValue: cut(base.combinedValue),
      combinedPnl: cut(base.combinedPnl),
    };
  }, [portfolio, timeWindow]);

  const isPnl = metric === "pnl";

  const data: Point[] = useMemo(() => {
    if (!series) return [];
    if (!isPnl) {
      // Total account value (Hyperliquid's combined series) — perp margin
      // alone hits $0 whenever the account is flat, which reads as a wipeout.
      const raw = series.combinedValue.length
        ? series.combinedValue
        : series.accountValue;
      return raw.map((p) => ({ t: p.t, v: p.v, usd: p.v }));
    }
    // Combined PnL (perp + spot + vaults) to match the portfolio page and the
    // combined Total Equity; fall back to perp-only if combined is unavailable.
    const raw = series.combinedPnl.length ? series.combinedPnl : series.pnl;
    if (raw.length === 0) return [];
    const base = raw[0].v;
    return raw.map((p) => {
      const usd = p.v - base;
      return { t: p.t, v: usd, usd };
    });
  }, [series, isPnl]);

  // Benchmark prices follow the same buckets as the portfolio series, so each
  // window gets a sampling that suits it; a custom range rides on the all-time
  // prices, exactly as its account series does.
  const benchPeriod: BenchmarkPeriod =
    timeWindow.preset === "custom" || timeWindow.preset === "allTime"
      ? "allTime"
      : timeWindow.preset;
  const benchmarks = useBenchmarks(benchPeriod, selected.length > 0);

  const times = useMemo(() => data.map((p) => p.t), [data]);

  /**
   * What the comparison buys: the account's own equity when the window opens.
   * Read off the equity series in both metrics — the PnL curve is rebased to
   * zero and can't say how much capital was on the table.
   */
  const stake = useMemo(() => {
    if (!series) return null;
    const equity = series.combinedValue.length
      ? series.combinedValue
      : series.accountValue;
    const start = equity[0]?.v ?? 0;
    return start >= MIN_STAKE_USD ? start : null;
  }, [series]);

  // Returns are computed from the prices rather than from the drawn line, so a
  // benchmark still reports how it did over the window when the account had no
  // starting capital to mark against it.
  const active = useMemo(() => {
    const points = new Map(
      (benchmarks.data?.series ?? []).map((s) => [s.id, s.points]),
    );
    return BENCHMARKS.filter((b) => selected.includes(b.id)).map((meta) => {
      const prices = points.get(meta.id) ?? [];
      const curve: BenchmarkCurve | null =
        stake == null || prices.length === 0
          ? null
          : benchmarkCurve(prices, times, stake, isPnl ? "pnl" : "value");
      return {
        meta,
        curve,
        pct: prices.length === 0 ? null : benchmarkReturn(prices, times),
      };
    });
  }, [benchmarks.data, selected, times, stake, isPnl]);

  const drawn = useMemo(() => active.filter((b) => b.curve != null), [active]);

  const rows: Row[] = useMemo(() => {
    if (drawn.length === 0) return data;
    return data.map((point, i) => {
      const row: Row = { ...point };
      for (const { meta, curve } of drawn) row[meta.id] = curve?.values[i];
      return row;
    });
  }, [data, drawn]);

  const { min, max, last } = useMemo(() => {
    if (data.length === 0) return { min: 0, max: 0, last: data[0] };
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const p of data) {
      lo = Math.min(lo, p.v);
      hi = Math.max(hi, p.v);
    }
    return { min: lo, max: hi, last: data[data.length - 1] };
  }, [data]);

  // Where zero sits inside [max…min], for the green/red gradient split. The
  // benchmark lines ride on their own scale-free colors, so they don't enter
  // into it even when a comparison runs further into profit than the account.
  const zeroOffset = max <= 0 ? 0 : min >= 0 ? 1 : max / (max - min);

  const hasData = data.length > 1;

  // Equity mode summarises the window with trading PnL and its return on the
  // window's average equity — the same basis as the summary cards. Account
  // value alone can't answer "how did I do": it books every deposit as growth
  // and every withdrawal as a loss. Read off `series`, not `data`, so the
  // figures don't depend on which tab is open.
  const summary = useMemo(() => {
    if (!series) return null;
    const pnl = series.combinedPnl.length ? series.combinedPnl : series.pnl;
    if (pnl.length < 2) return null;
    const equity = series.combinedValue.length
      ? series.combinedValue
      : series.accountValue;
    return {
      pnl: pnl[pnl.length - 1].v - pnl[0].v,
      pct: returnOnAvgEquity(equity, pnl),
    };
  }, [series]);

  // Ticks follow the span actually plotted, not the preset that produced it:
  // a custom range can be any length.
  const spanMs = data.length > 1 ? data[data.length - 1].t - data[0].t : DAY_MS;

  const tickFormat = (t: number): string => {
    const d = new Date(t);
    if (spanMs <= 2 * DAY_MS)
      return d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    if (spanMs > YEAR_NEEDED_MS)
      return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const yTickFormat = (v: number): string =>
    `${v < 0 ? "−" : ""}$${fmtCompact(Math.abs(v))}`;

  return (
    <section className="card flex h-full flex-col p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          options={[
            { value: "equity", label: "Account value" },
            { value: "pnl", label: "PnL" },
          ]}
          value={metric}
          onChange={setMetric}
        />
        {/* Toggles and legend in one: three references the account curve can
            be read against, off until asked for. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-ink3">vs</span>
          {BENCHMARKS.map((meta) => (
            <BenchmarkChip
              key={meta.id}
              meta={meta}
              active={selected.includes(meta.id)}
              pending={benchmarks.isFetching}
              pct={active.find((b) => b.meta.id === meta.id)?.pct ?? null}
              onToggle={() => toggleBenchmark(meta.id)}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {isPnl ? (
          <Pnl
            value={last?.usd ?? 0}
            className="text-2xl font-semibold tracking-tight"
          />
        ) : (
          <span className="num text-2xl font-semibold tracking-tight">
            {smallCents(fmtUsd(last?.usd ?? 0))}
          </span>
        )}
        {!isPnl && summary && (
          <span title="Trading PnL over this window, and its return on the window's average equity. Deposits and withdrawals are excluded.">
            <Pnl value={summary.pnl} pct={summary.pct} className="text-sm" />
          </span>
        )}
        <span className="text-xs text-ink3">
          {windowLabel(timeWindow)} · {isPnl ? "total PnL" : "total equity"}
        </span>
      </div>

      {/* min-h (not h): flex-basis 0 from flex-1 would otherwise collapse
          the plot to 0px when the card isn't stretched by the lg grid row. */}
      <div className="mt-3 min-h-[260px] flex-1 sm:min-h-[300px]">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={rows}
              margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--color-accent)"
                    stopOpacity={0.22}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-accent)"
                    stopOpacity={0.02}
                  />
                </linearGradient>
                <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--color-up)"
                    stopOpacity={0.25}
                  />
                  <stop
                    offset={zeroOffset}
                    stopColor="var(--color-up)"
                    stopOpacity={0.02}
                  />
                  <stop
                    offset={zeroOffset}
                    stopColor="var(--color-down)"
                    stopOpacity={0.02}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-down)"
                    stopOpacity={0.25}
                  />
                </linearGradient>
                <linearGradient id="pnlStroke" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={zeroOffset} stopColor="var(--color-up)" />
                  <stop offset={zeroOffset} stopColor="var(--color-down)" />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="var(--color-grid)"
                strokeWidth={1}
                vertical={false}
              />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={tickFormat}
                tick={{
                  fontSize: 11,
                  fill: "var(--color-ink3)",
                  fontFamily: "var(--font-mono)",
                }}
                tickLine={false}
                axisLine={{ stroke: "var(--color-grid)" }}
                minTickGap={48}
              />
              {/* Masking the axis would print the same stand-in five times
                  over; hiding the scale outright still leaves the shape of
                  the curve, which is the part that isn't an amount. */}
              <YAxis
                orientation="right"
                domain={["auto", "auto"]}
                tickFormatter={yTickFormat}
                tick={
                  hidden
                    ? false
                    : {
                        fontSize: 11,
                        fill: "var(--color-ink3)",
                        fontFamily: "var(--font-mono)",
                      }
                }
                tickLine={false}
                axisLine={false}
                width={hidden ? 8 : 56}
              />
              {isPnl && min < 0 && max > 0 && (
                <ReferenceLine
                  y={0}
                  stroke="var(--color-edge2)"
                  strokeWidth={1}
                />
              )}
              <Tooltip
                content={
                  <ChartTooltip
                    metric={metric}
                    withYear={spanMs > YEAR_NEEDED_MS}
                    benchmarks={drawn.map((b) => b.meta)}
                    stake={stake}
                  />
                }
                cursor={{ stroke: "var(--chart-cursor)", strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="v"
                stroke={isPnl ? "url(#pnlStroke)" : "var(--color-accent)"}
                strokeWidth={2}
                fill={isPnl ? "url(#pnlFill)" : "url(#equityFill)"}
                dot={false}
                activeDot={{
                  r: 4,
                  strokeWidth: 2,
                  stroke: "var(--color-panel)",
                  fill: isPnl
                    ? (last?.v ?? 0) >= 0
                      ? "var(--color-up)"
                      : "var(--color-down)"
                    : "var(--color-accent)",
                }}
                isAnimationActive={false}
              />
              {/* Drawn after the account's area so the references sit over the
                  fill rather than under it; thinner and unfilled so the
                  account curve stays the subject. */}
              {drawn.map(({ meta }) => (
                <Line
                  key={meta.id}
                  type="monotone"
                  dataKey={meta.id}
                  stroke={BENCHMARK_STROKE[meta.id]}
                  strokeWidth={1.5}
                  strokeDasharray={BENCHMARK_DASH}
                  dot={false}
                  activeDot={{
                    r: 3,
                    strokeWidth: 0,
                    fill: BENCHMARK_STROKE[meta.id],
                  }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            title="No portfolio history yet"
            hint="This account has no recorded equity history on Hyperliquid for the selected window."
          />
        )}
      </div>

      {selected.length > 0 && hasData && (
        <p className="mt-2 text-[11px] text-ink3">
          {stake == null
            ? "Benchmark lines need equity at the window’s start to buy in with — returns only for this window."
            : "Benchmarks buy the account’s equity at the window’s start and hold it."}{" "}
          {benchmarks.isError
            ? "Prices are unavailable right now."
            : "Prices from Hyperliquid (BTC) and public index closes."}
        </p>
      )}
    </section>
  );
}
