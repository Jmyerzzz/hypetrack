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
import { fmtCompact, fmtTime, fmtUsd } from "@/lib/format";

type Range = "day" | "week" | "month" | "allTime";
type Metric = "equity" | "pnl";
type Scope = "total" | "perp";

const RANGE_LABELS: { value: Range; label: string }[] = [
  { value: "day", label: "24H" },
  { value: "week", label: "7D" },
  { value: "month", label: "30D" },
  { value: "allTime", label: "All" },
];

const PERP_KEY: Record<Range, string> = {
  day: "perpDay",
  week: "perpWeek",
  month: "perpMonth",
  allTime: "perpAllTime",
};

type Point = { t: number; v: number };

function ChartTooltip({
  active,
  payload,
  metric,
  range,
}: {
  active?: boolean;
  payload?: { payload: Point }[];
  metric: Metric;
  range: Range;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-edge2 bg-panel2 px-3 py-2 shadow-xl">
      <p className="num text-sm font-semibold text-ink">
        {metric === "pnl" ? <Pnl value={point.v} /> : fmtUsd(point.v)}
      </p>
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
  const [scope, setScope] = useState<Scope>("total");
  const [range, setRange] = useState<Range>("month");

  const series = portfolio[scope === "total" ? range : PERP_KEY[range]];

  const data: Point[] = useMemo(() => {
    if (!series) return [];
    const raw = metric === "equity" ? series.accountValue : series.pnl;
    if (raw.length === 0) return [];
    if (metric === "pnl") {
      // Rebase so the window starts at 0 — the curve reads as "PnL this window".
      const base = raw[0].v;
      return raw.map((p) => ({ t: p.t, v: p.v - base }));
    }
    return raw.map((p) => ({ t: p.t, v: p.v }));
  }, [series, metric]);

  const { min, max, last, delta } = useMemo(() => {
    if (data.length === 0) return { min: 0, max: 0, last: 0, delta: 0 };
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const p of data) {
      lo = Math.min(lo, p.v);
      hi = Math.max(hi, p.v);
    }
    return {
      min: lo,
      max: hi,
      last: data[data.length - 1].v,
      delta: data[data.length - 1].v - data[0].v,
    };
  }, [data]);

  // Where zero sits inside [max…min], for the green/red gradient split.
  const zeroOffset = max <= 0 ? 0 : min >= 0 ? 1 : max / (max - min);

  const isPnl = metric === "pnl";
  const hasData = data.length > 1;

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
          <SegmentedControl
            options={[
              { value: "total", label: "Total" },
              { value: "perp", label: "Perp" },
            ]}
            value={scope}
            onChange={setScope}
            size="xs"
          />
          <SegmentedControl
            options={RANGE_LABELS}
            value={range}
            onChange={setRange}
            size="xs"
          />
        </div>
      </div>

      <div className="mt-4 flex items-baseline gap-3">
        {isPnl ? (
          <Pnl value={last} className="text-2xl font-semibold tracking-tight" />
        ) : (
          <span className="num text-2xl font-semibold tracking-tight">
            {fmtUsd(last)}
          </span>
        )}
        {!isPnl && hasData && <Pnl value={delta} className="text-sm" />}
        <span className="text-xs text-ink3">
          {RANGE_LABELS.find((r) => r.value === range)?.label} ·{" "}
          {scope === "total" ? "perp + spot" : "perp only"}
        </span>
      </div>

      <div className="mt-3 h-[300px] flex-1">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 8, right: 0, bottom: 0, left: 8 }}
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
                tickFormatter={(v: number) =>
                  `${v < 0 ? "−" : ""}$${fmtCompact(Math.abs(v))}`
                }
                tick={{
                  fontSize: 11,
                  fill: "var(--color-ink3)",
                  fontFamily: "var(--font-mono)",
                }}
                tickLine={false}
                axisLine={false}
                width={72}
              />
              {isPnl && min < 0 && max > 0 && (
                <ReferenceLine
                  y={0}
                  stroke="var(--color-edge2)"
                  strokeWidth={1}
                />
              )}
              <Tooltip
                content={<ChartTooltip metric={metric} range={range} />}
                cursor={{ stroke: "rgba(255,255,255,0.18)", strokeWidth: 1 }}
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
                    ? last >= 0
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
