"use client";

import { useMemo, useState } from "react";
import {
  marketName,
  Pnl,
  RefreshButton,
  Skeleton,
  smallCents,
} from "@/components/ui";
import type {
  ActivityPayload,
  OrderView,
  OutcomeMarketMap,
  PortfolioSeries,
} from "@/lib/api-types";
import { dateInputMs, fmtDay, fmtDuration, fmtPct, fmtUsd } from "@/lib/format";
import { type RiskMetrics, riskInWindow } from "@/lib/risk";
import type { TradeSummary, WindowSummary } from "@/lib/stats";
import { isScoped, type TimeWindow } from "@/lib/trades";
import { FillsTable } from "./fills-table";
import { FundingTable } from "./funding-table";
import { OrdersTable } from "./orders-table";
import { TradesTable } from "./trades-table";
import { TransfersTable } from "./transfers-table";

type Tab = "trades" | "fills" | "funding" | "transfers" | "orders";

/** How the strip's header names the window, e.g. "in the last 30 days". */
function windowPhrase(w: TimeWindow): string {
  if (w.preset === "day") return "in the last 24 hours";
  if (w.preset === "week") return "in the last 7 days";
  if (w.preset === "month") return "in the last 30 days";
  const from = dateInputMs(w.from);
  const to = dateInputMs(w.to);
  if (from != null && to != null)
    return `between ${fmtDay(from)} and ${fmtDay(to)}`;
  if (from != null) return `on or after ${fmtDay(from)}`;
  return to != null ? `on or before ${fmtDay(to)}` : "";
}

/**
 * Wrapper for a value made of more than one part. JSX drops the whitespace
 * between adjacent elements, so inline parts have no break opportunity and a
 * long value runs straight over the next column at phone widths. Flex supplies
 * both the wrap and the spacing the missing whitespace used to imply.
 */
function Parts({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-1">{children}</span>
  );
}

function ratio(v: number | "inf" | null): React.ReactNode {
  if (v === "inf") return <span className="num text-upt">∞</span>;
  if (v == null) return <span className="text-ink3">—</span>;
  const tone = v >= 1 ? "text-upt" : v < 0 ? "text-downt" : "text-ink";
  // The typographic minus, so a negative ratio matches the money beside it.
  return (
    <span className={`num ${tone}`}>
      {v < 0 ? "−" : ""}
      {Math.abs(v).toFixed(2)}
    </span>
  );
}

function PerformanceStrip({
  stats: s,
  markets,
  risk,
  timeWindow,
  scoped,
  partial,
}: {
  stats: TradeSummary;
  markets: OutcomeMarketMap;
  /** Equity-curve risk over the same window as `stats`. */
  risk: RiskMetrics;
  timeWindow: TimeWindow;
  /** False when the window covers every trade the account has made. */
  scoped: boolean;
  /** True when the payload's trade cap keeps these from covering the window. */
  partial: boolean;
}) {
  const items: { label: string; node: React.ReactNode; hint?: string }[] = [
    {
      label: "Win rate",
      hint: "Wins / (wins + losses) over closed trades; break-even trades are excluded.",
      node:
        s.winRate == null ? (
          <span className="text-ink3">—</span>
        ) : (
          <Parts>
            <span className="num text-ink">
              {fmtPct(s.winRate, { digits: 1 })}
            </span>
            <span className="num text-[11px] text-ink3">
              {s.wins}W · {s.losses}L
            </span>
          </Parts>
        ),
    },
    {
      label: "Profit factor",
      node: (
        <span className="num text-ink">
          {s.profitFactor == null
            ? s.wins > 0
              ? "∞"
              : "—"
            : s.profitFactor.toFixed(2)}
        </span>
      ),
    },
    {
      label: "Expectancy / trade",
      node:
        s.expectancy == null ? (
          "—"
        ) : (
          <Pnl value={s.expectancy} className="text-[13px]" />
        ),
    },
    {
      label: "Avg win",
      node:
        s.avgWin == null ? (
          "—"
        ) : (
          <Pnl value={s.avgWin} className="text-[13px]" />
        ),
    },
    {
      label: "Avg loss",
      node:
        s.avgLoss == null ? (
          "—"
        ) : (
          <Pnl value={s.avgLoss} className="text-[13px]" />
        ),
    },
    {
      label: "Largest win",
      node: s.largestWin ? (
        <Parts>
          <Pnl value={s.largestWin.netPnl} compact className="text-[13px]" />
          <span
            className="max-w-full truncate text-[11px] text-ink3"
            title={marketName(s.largestWin.coin, markets)}
          >
            {marketName(s.largestWin.coin, markets)}
          </span>
        </Parts>
      ) : (
        "—"
      ),
    },
    {
      label: "Largest loss",
      node: s.largestLoss ? (
        <Parts>
          <Pnl value={s.largestLoss.netPnl} compact className="text-[13px]" />
          <span
            className="max-w-full truncate text-[11px] text-ink3"
            title={marketName(s.largestLoss.coin, markets)}
          >
            {marketName(s.largestLoss.coin, markets)}
          </span>
        </Parts>
      ) : (
        "—"
      ),
    },
    {
      label: "Median hold",
      node: (
        <span className="num text-ink">{fmtDuration(s.medianDurationMs)}</span>
      ),
    },
    {
      label: "Long / short PnL",
      node: (
        <Parts>
          <Pnl value={s.longs.netPnl} compact className="text-[13px]" />
          <span className="text-ink3">/</span>
          <Pnl value={s.shorts.netPnl} compact className="text-[13px]" />
        </Parts>
      ),
    },
    {
      label: "Avg MFE",
      hint: "Average maximum favorable excursion — how far closed trades ran in your favor before exit (candle data, recent markets).",
      node:
        s.avgMfePct == null ? (
          <span className="text-ink3">—</span>
        ) : (
          <span className="num text-upt">
            +{fmtPct(s.avgMfePct, { digits: 2 })}
          </span>
        ),
    },
    {
      label: "Avg MAE",
      hint: "Average maximum adverse excursion — how far closed trades moved against you before exit (candle data, recent markets).",
      node:
        s.avgMaePct == null ? (
          <span className="text-ink3">—</span>
        ) : (
          <span className="num text-downt">
            −{fmtPct(s.avgMaePct, { digits: 2 })}
          </span>
        ),
    },
    // The last three read the account's equity curve over the same window
    // rather than the trades themselves — they're the risk half of the picture.
    {
      label: "Sharpe",
      hint: "Annualized (√365) from daily PnL returns over the selected window. Needs at least 8 trading days inside it.",
      node: ratio(risk.sharpe),
    },
    {
      label: "Sortino",
      hint: "Like Sharpe, but only down days count as risk. ∞ = no losing days in the window.",
      node: ratio(risk.sortino),
    },
    {
      label: "Max drawdown",
      hint: "Largest peak-to-trough drop of the combined account value inside the window, as a fraction of the running peak — the same measure Hyperliquid reports.",
      node:
        risk.maxDrawdownUsd == null ? (
          <span className="text-ink3">—</span>
        ) : (
          <Parts>
            <span className="num text-downt">
              −{smallCents(fmtUsd(risk.maxDrawdownUsd, { compact: true }))}
            </span>
            {risk.maxDrawdownPct != null && (
              <span className="num text-[11px] text-ink3">
                ({fmtPct(risk.maxDrawdownPct)})
              </span>
            )}
          </Parts>
        ),
    },
  ];
  const count = s.closedCount + s.openCount;
  return (
    <div className="border-b border-edge px-4 py-3.5">
      {/* Without this the strip reads as all-time even when the window above
        has narrowed the set these numbers describe. */}
      {scoped && (
        <p className="mb-3 text-[11px] text-ink3">
          {count.toLocaleString()} trade{count === 1 ? "" : "s"} opened{" "}
          {windowPhrase(timeWindow)}
          {/* The browser only holds the most recent slice of a long history,
            so a window reaching past it describes the loaded trades alone. */}
          {partial && (
            <span
              className="text-warn"
              title="This account has more trades than are shipped to the browser. Figures here cover the loaded trades only; a window reaching past them will undercount."
            >
              {" "}
              · loaded trades only
            </span>
          )}
        </p>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 sm:gap-x-6 lg:grid-cols-5">
        {items.map((item) => (
          // min-w-0: a grid track is min-content-sized by default, so without
          // it a wide value stretches its column instead of wrapping inside it.
          <div key={item.label} className="min-w-0" title={item.hint}>
            <p className="truncate text-[10px] font-medium tracking-wide text-ink3 uppercase">
              {item.label}
            </p>
            <p className="mt-0.5 text-[13px]">{item.node}</p>
          </div>
        ))}
      </div>
      {risk.dailySamples > 0 && risk.dailySamples < 8 && (
        <p className="mt-3 text-[11px] text-ink3">
          Sharpe and Sortino need at least 8 trading days — this window has{" "}
          {risk.dailySamples}.
        </p>
      )}
    </div>
  );
}

function CoverageNote({ activity }: { activity: ActivityPayload }) {
  const c = activity.coverage;
  const feeTokens = Object.entries(activity.stats.feesByToken);
  return (
    <p className="px-4 py-3 text-[11px] leading-relaxed text-ink3">
      {c.fillsFrom ? (
        <>
          Trade window: {fmtDay(c.fillsFrom)} →{" "}
          {c.fillsTo ? fmtDay(c.fillsTo) : "now"} ·{" "}
          {c.fillCount.toLocaleString()} fills
          {!c.fillsComplete &&
            c.fillsTo &&
            ` · extremely active account: fills after ${fmtDay(c.fillsTo)} exceed the loaded window and are not included`}
          {c.truncatedTrades > 0 &&
            ` · ${c.truncatedTrades} position${c.truncatedTrades === 1 ? " was" : "s were"} opened before this window (marked “partial history”); the API doesn’t serve older fills`}
          {activity.stats.outcomeVolume > 0 &&
            ` · outcome-market volume ${fmtUsd(activity.stats.outcomeVolume, { compact: true })}`}
          {c.fundingFrom &&
            ` · funding history from ${fmtDay(c.fundingFrom)} (${c.fundingCount.toLocaleString()} events${c.fundingComplete ? "" : ", capped"})`}
          {feeTokens.length > 0 &&
            ` · non-USDC fees: ${feeTokens
              .map(([token, amount]) => `${amount.toFixed(4)} ${token}`)
              .join(", ")}`}
        </>
      ) : (
        "No fills found for this address."
      )}
    </p>
  );
}

export function ActivityTabs({
  activity,
  summary,
  timeWindow,
  portfolio,
  pending,
  error,
  onRetry,
  openOrders,
  orderMarkets,
  onRefresh,
  refreshing,
}: {
  activity: ActivityPayload | undefined;
  /** Window-scoped trade summary; null when the window covers everything. */
  summary: WindowSummary | null;
  timeWindow: TimeWindow;
  /** Portfolio series behind the strip's risk metrics, from the overview call. */
  portfolio: Record<string, PortfolioSeries> | undefined;
  pending: boolean;
  error: Error | null;
  onRetry: () => void;
  openOrders: OrderView[] | undefined;
  /** Outcome markets for the open orders, which come from the overview call. */
  orderMarkets: OutcomeMarketMap | undefined;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [tab, setTab] = useState<Tab>("trades");

  const risk = useMemo(
    () => riskInWindow(portfolio, timeWindow),
    [portfolio, timeWindow],
  );

  const tabs: { value: Tab; label: string; count: number | null }[] = [
    {
      value: "trades",
      label: "Trade history",
      count: activity?.tradesTotal ?? null,
    },
    { value: "fills", label: "Fills", count: activity?.fillsTotal ?? null },
    {
      value: "funding",
      label: "Funding",
      count: activity?.fundingTotal ?? null,
    },
    {
      value: "transfers",
      label: "Transfers",
      count: activity?.transfersTotal ?? null,
    },
    {
      value: "orders",
      label: "Open orders",
      count: openOrders?.length ?? null,
    },
  ];

  return (
    <section className="card overflow-hidden">
      {/* The refresh control sits outside the scroller so it stays reachable
        however far the tab strip is scrolled on a phone. */}
      <div className="flex items-center border-b border-edge pr-2">
        <div className="scroll-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-2">
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`relative flex shrink-0 items-center gap-1.5 px-3 py-3 text-[13px] font-medium transition-colors ${
                tab === t.value ? "text-ink" : "text-ink3 hover:text-ink2"
              }`}
            >
              {t.label}
              {t.count != null && (
                <span className="num rounded-md bg-panel2 px-1.5 py-0.5 text-[10px] text-ink3">
                  {t.count.toLocaleString()}
                </span>
              )}
              {tab === t.value && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" />
              )}
            </button>
          ))}
        </div>
        {/* Ruled off so the pinned icon doesn't read as part of whichever tab
            happens to be scrolled up against it. */}
        <div className="flex shrink-0 items-center self-stretch border-l border-edge pl-1.5">
          <RefreshButton onClick={onRefresh} refreshing={refreshing} />
        </div>
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <p className="text-sm font-medium text-downt">
            Couldn’t load trading activity
          </p>
          <p className="max-w-md text-[13px] text-ink3">{error.message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="btn-accent rounded-lg px-4 py-2 text-sm font-semibold transition-all"
          >
            Retry
          </button>
        </div>
      ) : pending || !activity ? (
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-xs text-ink3">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-3.5 animate-spin"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" />
            </svg>
            Fetching full fill, funding, and transfer history from Hyperliquid…
          </div>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : (
        <>
          {tab === "trades" && (
            <>
              <PerformanceStrip
                stats={summary?.stats ?? activity.stats}
                markets={activity.outcomeMarkets}
                risk={risk}
                timeWindow={timeWindow}
                scoped={isScoped(timeWindow)}
                partial={summary?.partial ?? false}
              />
              <TradesTable
                trades={activity.trades}
                tradesTotal={activity.tradesTotal}
                markets={activity.outcomeMarkets}
                timeWindow={timeWindow}
              />
            </>
          )}
          {tab === "fills" && (
            <FillsTable
              fills={activity.recentFills}
              fillsTotal={activity.fillsTotal}
              markets={activity.outcomeMarkets}
            />
          )}
          {tab === "funding" && (
            <FundingTable
              funding={activity.funding}
              fundingTotal={activity.fundingTotal}
            />
          )}
          {tab === "transfers" && (
            <TransfersTable
              transfers={activity.transfers}
              transfersTotal={activity.transfersTotal}
              totalDeposited={activity.totalDeposited}
              totalWithdrawn={activity.totalWithdrawn}
            />
          )}
          {tab === "orders" && (
            <OrdersTable orders={openOrders} markets={orderMarkets ?? {}} />
          )}
          <CoverageNote activity={activity} />
        </>
      )}
    </section>
  );
}
