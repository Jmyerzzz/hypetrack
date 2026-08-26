"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AddressForm } from "@/components/address-form";
import { Logo } from "@/components/logo";
import { PrivacyToggle } from "@/components/privacy-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { RefreshButton, Skeleton } from "@/components/ui";
import {
  ALL_ACCOUNTS,
  mergeActivities,
  mergeOverviews,
  type RowAccount,
} from "@/lib/accounts";
import type { SubAccountView } from "@/lib/api-types";
import { fmtAgo, normalizeAddress, shortAddress } from "@/lib/format";
import {
  rememberAddress,
  useActivities,
  useOverviews,
  useSubAccounts,
} from "@/lib/hooks";
import { summarizeTrades, type WindowSummary } from "@/lib/stats";
import {
  ALL_TIME_WINDOW,
  isScoped,
  type TimeWindow,
  tradesInWindow,
} from "@/lib/trades";
import { AccountBreakdown } from "./account-breakdown";
import { AccountSwitcher } from "./account-switcher";
import { ActivityTabs } from "./activity-tabs";
import { EquityChart } from "./equity-chart";
import { OutcomePositions } from "./outcome-positions";
import { PnlByCoin } from "./pnl-by-coin";
import { PositionsTable } from "./positions-table";
import { StatCards } from "./stat-cards";
import { WindowPicker } from "./window-picker";

/** Stable empty list, so the account memos below don't churn before it loads. */
const NO_SUBS: SubAccountView[] = [];

/** What the switcher calls the address the page was opened on. */
const MASTER_NAME = "Main";

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
      className="shrink-0 rounded-md p-2 text-ink3 transition-colors hover:bg-panel2 hover:text-ink"
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
  return (
    <span className="num whitespace-nowrap text-xs text-ink3">
      updated {fmtAgo(ts)}
    </span>
  );
}

export function Dashboard({ address }: { address: string }) {
  // Sub-accounts are standalone addresses on Hyperliquid, so "viewing a
  // sub-account" means repointing every query at its address, and viewing them
  // all means fetching every address and adding the payloads up here (see
  // lib/accounts.ts). The selection lives in ?account= so a view survives
  // refresh and can be shared; only `all` and addresses in the master's own
  // sub-account list are honored.
  const subAccounts = useSubAccounts(address);
  const subs = subAccounts.data?.subAccounts ?? NO_SUBS;
  const searchParams = useSearchParams();
  const rawAccount = searchParams.get("account");
  const accountParam =
    rawAccount === ALL_ACCOUNTS
      ? ALL_ACCOUNTS
      : rawAccount
        ? normalizeAddress(rawAccount)
        : null;
  // Combining one account with nothing is just that account, so `all` only
  // means anything once the master turns out to own sub-accounts.
  const isAll = accountParam === ALL_ACCOUNTS && subs.length > 0;
  const selectedSub =
    (accountParam && subs.find((s) => s.address === accountParam)) || null;
  const activeAddress = selectedSub?.address ?? address;
  const selectedName = selectedSub?.name ?? MASTER_NAME;

  // The accounts feeding the page: every one of them in the combined view, a
  // single entry otherwise. Rows only carry an account tag when there is more
  // than one, so a single-account page looks exactly as it did.
  const accounts = useMemo<RowAccount[]>(
    () =>
      isAll
        ? [
            { address, name: MASTER_NAME },
            ...subs.map((s) => ({ address: s.address, name: s.name })),
          ]
        : [{ address: activeAddress, name: selectedName }],
    [isAll, address, subs, activeAddress, selectedName],
  );
  const addresses = useMemo(() => accounts.map((a) => a.address), [accounts]);

  // A deep link names a sub (or `all`) before the list has resolved; hold the
  // data queries instead of fetching the master's payloads only to discard them.
  const accountResolving = accountParam !== null && subAccounts.isPending;

  const overviews = useOverviews(addresses, !accountResolving);
  const activities = useActivities(addresses, !accountResolving);
  const queryClient = useQueryClient();
  // One window for the whole page; every trade-derived figure below reads it.
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(ALL_TIME_WINDOW);

  const overview = useMemo(() => {
    const parts = overviews.data;
    if (!parts) return undefined;
    if (parts.length === 1) return parts[0];
    return mergeOverviews(
      accounts.map((account, i) => ({ account, payload: parts[i] })),
    );
  }, [overviews.data, accounts]);

  const activity = useMemo(() => {
    const parts = activities.data;
    if (!parts) return undefined;
    if (parts.length === 1) return parts[0];
    return mergeActivities(
      accounts.map((account, i) => ({ account, payload: parts[i] })),
    );
  }, [activities.data, accounts]);

  const selectAccount = (next: string) => {
    const url = new URL(window.location.href);
    if (next === address) url.searchParams.delete("account");
    else url.searchParams.set("account", next);
    // Shallow replace: switching accounts is view state, like the time
    // window — it shouldn't grow the history stack or re-render the route.
    window.history.replaceState(null, "", url);
  };

  // Recomputed here rather than per section so the cards, the PnL split, the
  // performance strip and the table can't disagree about the same window.
  // All-time stays on the payload's own summary: it sees every trade, while the
  // payload's trade list is capped and can only stand in for a narrower window.
  const trades = activity?.trades;
  const tradesTotal = activity?.tradesTotal ?? 0;
  const summary: WindowSummary | null = useMemo(
    () =>
      trades && isScoped(timeWindow)
        ? {
            stats: summarizeTrades(tradesInWindow(trades, timeWindow)),
            // Older trades past the payload cap were never shipped, so a
            // window reaching back that far can only describe what loaded.
            partial: trades.length < tradesTotal,
          }
        : null,
    [trades, tradesTotal, timeWindow],
  );

  useEffect(() => {
    rememberAddress(address);
  }, [address]);

  const refreshAll = () => {
    for (const a of addresses) {
      queryClient.invalidateQueries({ queryKey: ["overview", a] });
      queryClient.invalidateQueries({ queryKey: ["activity", a] });
    }
  };

  const refreshing = overviews.isFetching || activities.isFetching;
  // Total equity, not perp equity: a freshly funded account (say a sub-account
  // holding USDC before its algo starts) has a balance — the banner would lie.
  const isEmptyAccount =
    overview &&
    activity &&
    overview.totalEquity < 0.01 &&
    overview.positions.length === 0 &&
    activity.fillsTotal === 0;

  // Which account an error came from — in the combined view the message alone
  // ("Upstream error") wouldn't say which of five addresses failed.
  const failedAccount =
    accounts.length > 1 && overviews.errorAt != null
      ? accounts[overviews.errorAt]
      : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-edge bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-5 py-3 sm:gap-4">
          <Logo />
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <AddressForm />
            <PrivacyToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-5 py-6">
        {/* Deliberately nowrap: the address truncates instead, which keeps the
            refresh control on the title's line at every phone width. */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            {isAll ? (
              // The combined view has no single address to copy or open on the
              // explorer, so the line names the set instead.
              <>
                <h1 className="truncate text-sm font-medium text-ink">
                  All accounts
                </h1>
                <span className="shrink-0 rounded-full border border-edge bg-panel px-2.5 py-0.5 text-[11px] font-medium text-ink2">
                  {accounts.length} combined
                </span>
              </>
            ) : (
              <>
                {/* The line always names the account whose data is on screen,
                    so copy and the explorer link follow the switcher. */}
                <h1
                  className="num truncate text-sm text-ink"
                  title={activeAddress}
                >
                  <span className="hidden sm:inline">{activeAddress}</span>
                  <span className="sm:hidden">
                    {shortAddress(activeAddress)}
                  </span>
                </h1>
                {selectedSub && (
                  <span className="hidden shrink-0 rounded-full border border-edge bg-panel px-2.5 py-0.5 text-[11px] font-medium text-ink2 sm:inline">
                    sub-account
                  </span>
                )}
                <CopyButton text={activeAddress} />
                <a
                  href={`https://app.hyperliquid.xyz/explorer/address/${activeAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  title="View on Hyperliquid explorer"
                  className="shrink-0 rounded-md p-2 text-ink3 transition-colors hover:bg-panel2 hover:text-ink"
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
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {overview && <UpdatedAgo ts={overview.fetchedAt} />}
            <RefreshButton
              onClick={refreshAll}
              refreshing={refreshing}
              labelled
            />
          </div>
        </div>

        {overviews.isError ? (
          <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
            <p className="text-sm font-medium text-downt">
              {failedAccount
                ? `Couldn’t load “${failedAccount.name}”`
                : "Couldn’t load this account"}
            </p>
            <p className="max-w-md text-[13px] text-ink3">
              {overviews.error?.message}
            </p>
            <button
              type="button"
              onClick={() => overviews.refetch()}
              className="btn-accent rounded-lg px-4 py-2 text-sm font-semibold transition-all"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {isEmptyAccount && (
              <div className="card border-warn/30 bg-warn/5 px-4 py-3 text-[13px] text-ink2">
                {isAll
                  ? "None of these addresses has any Hyperliquid perp trading history — no account balance, positions, or fills were found."
                  : "This address has no Hyperliquid perp trading history — no account balance, positions, or fills were found."}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {subs.length > 0 && (
                /* A phone stacks the switcher above the time row (order 0 vs
                   the picker's DOM position); from sm they share the row with
                   the switcher pushed to the right edge. It scrolls inside
                   itself rather than widening the page: an account with a
                   handful of sub-accounts runs past a phone's width, and
                   min-w-0 is what lets a flex item shrink below its content. */
                <div className="scroll-thin min-w-0 max-w-full overflow-x-auto sm:order-1 sm:ml-auto">
                  <AccountSwitcher
                    master={address}
                    subAccounts={subs}
                    selected={isAll ? ALL_ACCOUNTS : activeAddress}
                    onSelect={selectAccount}
                  />
                </div>
              )}
              <WindowPicker timeWindow={timeWindow} onChange={setTimeWindow} />
            </div>

            <StatCards
              overview={overview}
              activity={activity}
              summary={summary}
            />

            <div className="grid gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2">
                {overview ? (
                  <EquityChart
                    portfolio={overview.portfolio}
                    timeWindow={timeWindow}
                  />
                ) : (
                  <Skeleton className="h-[404px]" />
                )}
              </div>
              <div className="flex flex-col gap-5">
                {overview ? (
                  <AccountBreakdown overview={overview} />
                ) : (
                  <Skeleton className="h-[192px]" />
                )}
                <PnlByCoin
                  activity={activity}
                  summary={summary}
                  pending={activities.isPending}
                />
              </div>
            </div>

            {overview && overview.positions.length > 0 && (
              <PositionsTable
                positions={overview.positions}
                onRefresh={refreshAll}
                refreshing={refreshing}
              />
            )}

            {overview && overview.outcomePositions.length > 0 && (
              <OutcomePositions
                positions={overview.outcomePositions}
                markets={overview.outcomeMarkets}
              />
            )}

            <ActivityTabs
              activity={activity}
              summary={summary}
              timeWindow={timeWindow}
              portfolio={overview?.portfolio}
              pending={activities.isPending}
              error={activities.isError ? activities.error : null}
              onRetry={() => activities.refetch()}
              openOrders={overview?.openOrders}
              orderMarkets={overview?.outcomeMarkets}
              onRefresh={refreshAll}
              refreshing={refreshing}
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
