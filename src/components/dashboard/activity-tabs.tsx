"use client";

import { useState } from "react";
import { Pnl, Skeleton } from "@/components/ui";
import type { ActivityPayload, OrderView } from "@/lib/api-types";
import { fmtDay, fmtDuration } from "@/lib/format";
import { FillsTable } from "./fills-table";
import { FundingTable } from "./funding-table";
import { OrdersTable } from "./orders-table";
import { TradesTable } from "./trades-table";
import { TransfersTable } from "./transfers-table";

type Tab = "trades" | "fills" | "funding" | "transfers" | "orders";

function PerformanceStrip({ activity }: { activity: ActivityPayload }) {
  const s = activity.stats;
  const items: { label: string; node: React.ReactNode }[] = [
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
            {s.largestWin.coin}
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
            {s.largestLoss.coin}
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
  ];
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-edge px-4 py-3.5 sm:grid-cols-4 lg:grid-cols-8">
      {items.map((item) => (
        <div key={item.label}>
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
          {c.fundingFrom &&
            ` · funding history from ${fmtDay(c.fundingFrom)} (${c.fundingCount.toLocaleString()} events${c.fundingComplete ? "" : ", capped"})`}
          {feeTokens.length > 0 &&
            ` · non-USDC fees: ${feeTokens
              .map(([token, amount]) => `${amount.toFixed(4)} ${token}`)
              .join(", ")}`}
        </>
      ) : (
        "No perp fills found for this address."
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
}: {
  activity: ActivityPayload | undefined;
  pending: boolean;
  error: Error | null;
  onRetry: () => void;
  openOrders: OrderView[] | undefined;
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
      <div className="scroll-thin flex items-center gap-1 overflow-x-auto border-b border-edge px-2">
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

      {error ? (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <p className="text-sm font-medium text-downt">
            Couldn’t load trading activity
          </p>
          <p className="max-w-md text-[13px] text-ink3">{error.message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg transition-colors hover:bg-accent2"
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
              />
            </>
          )}
          {tab === "fills" && (
            <FillsTable
              fills={activity.recentFills}
              fillsTotal={activity.fillsTotal}
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
          {tab === "orders" && <OrdersTable orders={openOrders} />}
          <CoverageNote activity={activity} />
        </>
      )}
    </section>
  );
}
