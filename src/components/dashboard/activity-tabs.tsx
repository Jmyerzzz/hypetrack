"use client";

import { useState } from "react";
import { marketName, Pnl, RefreshButton, Skeleton } from "@/components/ui";
import type {
  ActivityPayload,
  OrderView,
  OutcomeMarketMap,
} from "@/lib/api-types";
import { fmtDay, fmtDuration, fmtPct, fmtUsd } from "@/lib/format";
import { FillsTable } from "./fills-table";
import { FundingTable } from "./funding-table";
import { OrdersTable } from "./orders-table";
import { TradesTable } from "./trades-table";
import { TransfersTable } from "./transfers-table";

type Tab = "trades" | "fills" | "funding" | "transfers" | "orders";

function PerformanceStrip({ activity }: { activity: ActivityPayload }) {
  const s = activity.stats;
  const items: { label: string; node: React.ReactNode; hint?: string }[] = [
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
        <span>
          <Pnl value={s.largestWin.netPnl} compact className="text-[13px]" />
          <span className="ml-1 text-[11px] text-ink3">
            {marketName(s.largestWin.coin, activity.outcomeMarkets)}
          </span>
        </span>
      ) : (
        "—"
      ),
    },
    {
      label: "Largest loss",
      node: s.largestLoss ? (
        <span>
          <Pnl value={s.largestLoss.netPnl} compact className="text-[13px]" />
          <span className="ml-1 text-[11px] text-ink3">
            {marketName(s.largestLoss.coin, activity.outcomeMarkets)}
          </span>
        </span>
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
        <span className="num text-[13px]">
          <Pnl value={s.longs.netPnl} compact className="text-[13px]" />
          <span className="mx-1 text-ink3">/</span>
          <Pnl value={s.shorts.netPnl} compact className="text-[13px]" />
        </span>
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
  ];
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-edge px-4 py-3.5 sm:grid-cols-4 lg:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} title={item.hint}>
          <p className="text-[10px] font-medium tracking-wide text-ink3 uppercase">
            {item.label}
          </p>
          <p className="mt-0.5 text-[13px]">{item.node}</p>
        </div>
      ))}
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
  pending,
  error,
  onRetry,
  openOrders,
  orderMarkets,
  onRefresh,
  refreshing,
}: {
  activity: ActivityPayload | undefined;
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
              <PerformanceStrip activity={activity} />
              <TradesTable
                trades={activity.trades}
                tradesTotal={activity.tradesTotal}
                markets={activity.outcomeMarkets}
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
