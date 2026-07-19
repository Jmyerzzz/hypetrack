"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AddressForm } from "@/components/address-form";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui";
import { fmtAgo, shortAddress } from "@/lib/format";
import { rememberAddress, useActivity, useOverview } from "@/lib/hooks";
import { AccountBreakdown } from "./account-breakdown";
import { ActivityTabs } from "./activity-tabs";
import { EquityChart } from "./equity-chart";
import { OutcomePositions } from "./outcome-positions";
import { PnlByCoin } from "./pnl-by-coin";
import { PositionsTable } from "./positions-table";
import { RiskCard } from "./risk-card";
import { StatCards } from "./stat-cards";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy address"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="rounded-md p-2 text-ink3 transition-colors hover:bg-panel2 hover:text-ink"
    >
      {copied ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-4 text-upt"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path
            d="m5 13 4 4 10-10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
      <span className="sr-only">Copy address</span>
    </button>
  );
}

function UpdatedAgo({ ts }: { ts: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);
  return <span className="num text-xs text-ink3">updated {fmtAgo(ts)}</span>;
}

export function Dashboard({ address }: { address: string }) {
  const overview = useOverview(address);
  const activity = useActivity(address);
  const queryClient = useQueryClient();

  useEffect(() => {
    rememberAddress(address);
  }, [address]);

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["overview", address] });
    queryClient.invalidateQueries({ queryKey: ["activity", address] });
  };

  const refreshing = overview.isFetching || activity.isFetching;
  const isEmptyAccount =
    overview.data &&
    activity.data &&
    overview.data.perpEquity < 0.01 &&
    overview.data.positions.length === 0 &&
    activity.data.fillsTotal === 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-edge bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-5 py-3 sm:gap-4">
          <Logo />
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <AddressForm />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-5 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <h1 className="num text-sm text-ink" title={address}>
              <span className="hidden sm:inline">{address}</span>
              <span className="sm:hidden">{shortAddress(address)}</span>
            </h1>
            <CopyButton text={address} />
            <a
              href={`https://app.hyperliquid.xyz/explorer/address/${address}`}
              target="_blank"
              rel="noreferrer"
              title="View on Hyperliquid explorer"
              className="rounded-md p-2 text-ink3 transition-colors hover:bg-panel2 hover:text-ink"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  d="M14 5h5v5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path d="M19 5 9.5 14.5" strokeLinecap="round" />
                <path
                  d="M19 13.5V17a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.5"
                  strokeLinecap="round"
                />
              </svg>
              <span className="sr-only">View on explorer</span>
            </a>
          </div>
          <div className="flex items-center gap-3">
            {overview.data && <UpdatedAgo ts={overview.data.fetchedAt} />}
            <button
              type="button"
              onClick={refreshAll}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-panel px-2.5 py-1.5 text-xs font-medium text-ink2 transition-colors hover:border-edge2 hover:text-ink disabled:opacity-60 max-sm:px-3 max-sm:py-2"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" />
                <path
                  d="M21 3v6h-6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </div>

        {overview.isError ? (
          <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
            <p className="text-sm font-medium text-downt">
              Couldn’t load this account
            </p>
            <p className="max-w-md text-[13px] text-ink3">
              {(overview.error as Error).message}
            </p>
            <button
              type="button"
              onClick={() => overview.refetch()}
              className="btn-accent rounded-lg px-4 py-2 text-sm font-semibold transition-all"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {isEmptyAccount && (
              <div className="card border-warn/30 bg-warn/5 px-4 py-3 text-[13px] text-ink2">
                This address has no Hyperliquid perp trading history — no
                account balance, positions, or fills were found.
              </div>
            )}

            <StatCards overview={overview.data} activity={activity.data} />

            <div className="grid gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2">
                {overview.data ? (
                  <EquityChart portfolio={overview.data.portfolio} />
                ) : (
                  <Skeleton className="h-[404px]" />
                )}
              </div>
              <div className="flex flex-col gap-5">
                {overview.data ? (
                  <AccountBreakdown overview={overview.data} />
                ) : (
                  <Skeleton className="h-[192px]" />
                )}
                {overview.data ? (
                  <RiskCard risk={overview.data.risk} />
                ) : (
                  <Skeleton className="h-[140px]" />
                )}
                <PnlByCoin
                  activity={activity.data}
                  pending={activity.isPending}
                />
              </div>
            </div>

            {overview.data && overview.data.positions.length > 0 && (
              <PositionsTable positions={overview.data.positions} />
            )}

            {overview.data && overview.data.outcomePositions.length > 0 && (
              <OutcomePositions
                positions={overview.data.outcomePositions}
                markets={overview.data.outcomeMarkets}
              />
            )}

            <ActivityTabs
              activity={activity.data}
              pending={activity.isPending}
              error={activity.isError ? (activity.error as Error) : null}
              onRetry={() => activity.refetch()}
              openOrders={overview.data?.openOrders}
              orderMarkets={overview.data?.outcomeMarkets}
            />
          </>
        )}
      </main>

      <footer className="border-t border-edge py-4">
        <p className="mx-auto max-w-7xl px-5 text-center text-xs text-ink3">
          Data from the Hyperliquid public API · prices and PnL are indicative ·
          not financial advice
        </p>
      </footer>
    </div>
  );
}
