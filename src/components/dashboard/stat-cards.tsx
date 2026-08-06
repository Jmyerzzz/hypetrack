"use client";

import { Pnl, Skeleton } from "@/components/ui";
import type { ActivityPayload, OverviewPayload } from "@/lib/api-types";
import { fmtUsd, fmtUsdSigned } from "@/lib/format";
import type { WindowSummary } from "@/lib/stats";

function Card({
  label,
  children,
  sub,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`card flex flex-col justify-between gap-2 p-4 ${className}`}
    >
      <p className="text-[11px] font-medium tracking-wide text-ink3 uppercase">
        {label}
      </p>
      <div className="text-lg leading-tight font-semibold sm:text-xl">
        {children}
      </div>
      {sub && <div className="text-xs text-ink3">{sub}</div>}
    </div>
  );
}

const FLOW_HINT =
  "External capital moved in and out of this account — bridge deposits and withdrawals plus peer transfers. Spot↔perp movements are excluded, and transfers of unpriced tokens can't be valued.";

/**
 * Point-in-time and lifetime figures only: PnL over the selected window lives
 * on the equity chart, and the trade-quality metrics live in the performance
 * strip above the trade table. What remains here is what a window can't scope.
 */
export function StatCards({
  overview,
  activity,
  summary,
}: {
  overview: OverviewPayload | undefined;
  activity: ActivityPayload | undefined;
  /** Window-scoped trade summary; null when the window covers everything. */
  summary: WindowSummary | null;
}) {
  const stats = activity?.stats;
  const netDeposits = activity
    ? activity.totalDeposited - activity.totalWithdrawn
    : null;

  // Equity spans two of the five columns: at a fifth of the width its money
  // leg wraps mid-number, and the three trailing cards fill the row exactly.
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
      <Card
        label="Total equity"
        className="col-span-2 sm:col-span-3 xl:col-span-2"
        sub={
          overview ? (
            <span className="num">
              Perp {fmtUsd(overview.perpEquity, { compact: true })} · Spot{" "}
              {fmtUsd(overview.spotValue, { compact: true })}
              {/* Listed only when held, so the three parts always add up. */}
              {overview.outcomeValue > 0 && (
                <>
                  {" "}
                  · Outcome {fmtUsd(overview.outcomeValue, { compact: true })}
                </>
              )}{" "}
              · Unrealized{" "}
              <Pnl
                value={overview.totalUnrealizedPnl}
                compact
                className="text-xs"
              />
            </span>
          ) : (
            <Skeleton className="h-4 w-48" />
          )
        }
      >
        {overview ? (
          <span className="text-[28px] tracking-tight">
            {fmtUsd(overview.totalEquity)}
          </span>
        ) : (
          <Skeleton className="h-8 w-40" />
        )}
      </Card>

      {/* Lifetime volume with the two shorter Hyperliquid buckets underneath —
          traded volume isn't reconstructible for an arbitrary window, so this
          card keeps its own fixed spans rather than following the picker. */}
      <Card
        label="Volume traded"
        sub={
          overview ? (
            <span className="num">
              7D:{" "}
              {fmtUsd(overview.portfolio.week?.volume ?? 0, { compact: true })}{" "}
              · 30D:{" "}
              {fmtUsd(overview.portfolio.month?.volume ?? 0, { compact: true })}
            </span>
          ) : (
            <Skeleton className="h-4 w-24" />
          )
        }
      >
        {overview ? (
          <span className="num">
            {fmtUsd(overview.allTimeVolume, { compact: true })}
          </span>
        ) : (
          <Skeleton className="h-7 w-24" />
        )}
      </Card>

      <Card
        label="Fees · funding"
        sub={
          stats ? (
            summary ? (
              // Only the loaded trades can be attributed to a window; say so
              // when the payload's cap means that isn't all of them.
              summary.partial ? (
                "attributed to loaded trades in window"
              ) : (
                "attributed to trades in window"
              )
            ) : (
              "over the loaded trade window"
            )
          ) : (
            <Skeleton className="h-4 w-28" />
          )
        }
      >
        {stats ? (
          <span className="flex flex-col gap-0.5 text-[13px] leading-snug sm:text-sm">
            <span className="num text-ink2">
              Fees{" "}
              <span className="text-downt">
                {fmtUsdSigned(
                  -(summary
                    ? summary.stats.totalTradeFees
                    : stats.totalUsdcFees),
                  { compact: true },
                )}
              </span>
            </span>
            <span className="num text-ink2">
              Fund{" "}
              <Pnl
                value={
                  summary ? summary.stats.totalTradeFunding : stats.netFunding
                }
                compact
                className="text-[13px] sm:text-sm"
              />
            </span>
          </span>
        ) : (
          <Skeleton className="h-7 w-24" />
        )}
      </Card>

      {/* Net leads because it's the figure that reconciles against PnL:
          total equity − net deposits is what the account actually earned.
          Spans the phone's two columns: it's the odd card out there, and half
          a row of empty grid beside it reads as a mistake. */}
      <Card
        label="Deposits · withdrawals"
        className="col-span-2 sm:col-span-1"
        sub={
          activity ? (
            <span className="num flex flex-col gap-0.5">
              <span className="whitespace-nowrap">
                In{" "}
                <span className="text-upt">
                  {fmtUsdSigned(activity.totalDeposited, { compact: true })}
                </span>
              </span>
              <span className="whitespace-nowrap">
                Out{" "}
                <span className="text-downt">
                  {fmtUsdSigned(-activity.totalWithdrawn, { compact: true })}
                </span>
              </span>
              {!activity.coverage.ledgerComplete && <span>partial ledger</span>}
            </span>
          ) : (
            <Skeleton className="h-8 w-24" />
          )
        }
      >
        {activity ? (
          <span className="num whitespace-nowrap" title={FLOW_HINT}>
            {fmtUsdSigned(netDeposits ?? 0, { compact: true })}
          </span>
        ) : (
          <Skeleton className="h-7 w-24" />
        )}
      </Card>
    </div>
  );
}
