"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState, Pnl, SegmentedControl } from "@/components/ui";
import type { PortfolioSeries } from "@/lib/api-types";
import { fmtCompact, fmtPct, fmtTime, fmtUsd } from "@/lib/format";
import { avgEquity } from "@/lib/risk";

type Range = "day" | "week" | "month" | "allTime";
type Metric = "equity" | "pnl";
type PnlUnit = "usd" | "pct";

const RANGE_LABELS: { value: Range; label: string }[] = [
  { value: "day", label: "24H" },
  { value: "week", label: "7D" },
  { value: "month", label: "30D" },
  { value: "allTime", label: "All" },
];

type Point = { t: number; v: number; usd: number };

function ChartTooltip({
  active,
  payload,
  metric,
  range,
  unit,
}: {
  active?: boolean;
  payload?: { payload: Point }[];
  metric: Metric;
  range: Range;
  unit: PnlUnit;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const isPct = metric === "pnl" && unit === "pct";
  return (
    <div className="rounded-lg border border-edge2 bg-panel2 px-3 py-2 shadow-xl">
      <p className="num text-sm font-semibold text-ink">
        {metric === "pnl" ? (
          isPct ? (
            <span className={point.v >= 0 ? "text-upt" : "text-downt"}>
              {fmtPct(point.v, { signed: true })}
            </span>
          ) : (
            <Pnl value={point.usd} />
          )
        ) : (
          fmtUsd(point.usd)
        )}
      </p>
      {isPct && (
        <p className="num mt-0.5 text-[11px] text-ink2">
          {fmtUsd(point.usd)} PnL
        </p>
      )}
      <p className="mt-0.5 text-[11px] text-ink3">
        {fmtTime(point.t, { withYear: range === "allTime" })}
      </p>
    </div>
  );
}

export function EquityChart({
  portfolio,
}: {
  portfolio: Record<string, PortfolioSeries>;
}) {
  const [metric, setMetric] = useState<Metric>("equity");
  const [range, setRange] = useState<Range>("month");
  const [pnlUnit, setPnlUnit] = useState<PnlUnit>("usd");

  const series = portfolio[range];
  const isPnl = metric === "pnl";

  // % basis: the window's time-averaged total equity — the same method as
  // the stat-card % chips, so the curve's endpoint matches the chip.
  const pctBase = useMemo(() => {
    const avg = series ? avgEquity(series.combinedValue) : null;
    return avg != null && avg >= 10 ? avg : null;
  }, [series]);
  const unit: PnlUnit = pnlUnit === "pct" && pctBase == null ? "usd" : pnlUnit;
  const isPct = isPnl && unit === "pct";

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
    const raw = series.pnl;
    if (raw.length === 0) return [];
    const base = raw[0].v;
    return raw.map((p) => {
      const usd = p.v - base;
      return {
        t: p.t,
        v: isPct && pctBase != null ? usd / pctBase : usd,
        usd,
      };
    });
  }, [series, isPnl, isPct, pctBase]);

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

  // Where zero sits inside [max…min], for the green/red gradient split.
  const zeroOffset = max <= 0 ? 0 : min >= 0 ? 1 : max / (max - min);

  const hasData = data.length > 1;
  const delta = hasData ? data[data.length - 1].usd - data[0].usd : 0;

  const tickFormat = (t: number): string => {
    const d = new Date(t);
    if (range === "day")
      return d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    if (range === "allTime")
      return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const yTickFormat = (v: number): string =>
    isPct
      ? fmtPct(v, { signed: v < 0 })
      : `${v < 0 ? "−" : ""}$${fmtCompact(Math.abs(v))}`;

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
        <div className="flex items-center gap-2">
          {isPnl && (
            <SegmentedControl
              options={[
                { value: "usd", label: "$" },
                { value: "pct", label: "%" },
              ]}
              value={unit}
              onChange={setPnlUnit}
              size="xs"
            />
          )}
          <SegmentedControl
            options={RANGE_LABELS}
            value={range}
            onChange={setRange}
            size="xs"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {isPnl ? (
          isPct ? (
            <span
              className={`num text-2xl font-semibold tracking-tight ${
                (last?.v ?? 0) >= 0 ? "text-upt" : "text-downt"
              }`}
            >
              {fmtPct(last?.v ?? 0, { signed: true })}
            </span>
          ) : (
            <Pnl
              value={last?.usd ?? 0}
              className="text-2xl font-semibold tracking-tight"
            />
          )
        ) : (
          <span className="num text-2xl font-semibold tracking-tight">
            {fmtUsd(last?.usd ?? 0)}
          </span>
        )}
        {isPct && <Pnl value={last?.usd ?? 0} className="text-sm" />}
        {!isPnl && hasData && <Pnl value={delta} className="text-sm" />}
        <span
          className="text-xs text-ink3"
          title={
            isPct
              ? "Perp PnL as a percentage of the account's time-averaged total equity over this window — stable under deposits and withdrawals."
              : undefined
          }
        >
          {RANGE_LABELS.find((r) => r.value === range)?.label} ·{" "}
          {isPnl
            ? isPct
              ? "perp PnL · % of avg equity"
              : "perp PnL"
            : "total equity"}
        </span>
      </div>

      {/* min-h (not h): flex-basis 0 from flex-1 would otherwise collapse
          the plot to 0px when the card isn't stretched by the lg grid row. */}
      <div className="mt-3 min-h-[260px] flex-1 sm:min-h-[300px]">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
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
              <YAxis
                orientation="right"
                domain={["auto", "auto"]}
                tickFormatter={yTickFormat}
                tick={{
                  fontSize: 11,
                  fill: "var(--color-ink3)",
                  fontFamily: "var(--font-mono)",
                }}
                tickLine={false}
                axisLine={false}
                width={56}
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
                  <ChartTooltip metric={metric} range={range} unit={unit} />
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
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            title="No portfolio history yet"
            hint="This account has no recorded equity history on Hyperliquid for the selected window."
          />
        )}
      </div>
    </section>
  );
}
