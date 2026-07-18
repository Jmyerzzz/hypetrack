"use client";

import { Pnl, Skeleton } from "@/components/ui";
import type { ActivityPayload, OverviewPayload } from "@/lib/api-types";
import { fmtPct, fmtUsd, fmtUsdSigned } from "@/lib/format";

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
      <div className="text-xl leading-tight font-semibold">{children}</div>
      {sub && <div className="text-xs text-ink3">{sub}</div>}
    </div>
  );
}

function PctChip({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const tone =
    pct > 0
      ? "bg-up/12 text-upt"
      : pct < 0
        ? "bg-down/12 text-downt"
        : "bg-panel2 text-ink2";
  return (
    <span
      className={`num ml-2 rounded-md px-1.5 py-0.5 align-middle text-xs font-semibold ${tone}`}
    >
      {fmtPct(pct, { signed: true })}
    </span>
  );
}

export function StatCards({
  overview,
  activity,
}: {
  overview: OverviewPayload | undefined;
  activity: ActivityPayload | undefined;
}) {
  const allTime = overview?.pnlSummary.find((p) => p.period === "allTime");
  const month = overview?.pnlSummary.find((p) => p.period === "month");
  const day = overview?.pnlSummary.find((p) => p.period === "day");
  const stats = activity?.stats;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-7">
      <Card
        label="Account value"
        className="col-span-2 sm:col-span-3 xl:col-span-2"
        sub={
          overview ? (
            <span className="num">
              Perp {fmtUsd(overview.perpEquity, { compact: true })} · Spot{" "}
              {fmtUsd(overview.spotValue, { compact: true })} · Withdrawable{" "}
              {fmtUsd(overview.withdrawable, { compact: true })}
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

      <Card
        label="All-time PnL"
        sub={
          overview ? (
            "vs peak capital deployed"
          ) : (
            <Skeleton className="h-4 w-24" />
          )
        }
      >
        {allTime ? (
          <span>
            <Pnl value={allTime.pnl} compact />
            <PctChip pct={allTime.pct} />
          </span>
        ) : (
          <Skeleton className="h-7 w-28" />
        )}
      </Card>

      <Card
        label="30D PnL"
        sub={
          day ? (
            <span className="num">
              24H: <Pnl value={day.pnl} compact className="text-xs" />
            </span>
          ) : (
            <Skeleton className="h-4 w-20" />
          )
        }
      >
        {month ? (
          <span>
            <Pnl value={month.pnl} compact />
            <PctChip pct={month.pct} />
          </span>
        ) : (
          <Skeleton className="h-7 w-28" />
        )}
      </Card>

      <Card
        label="Win rate"
        sub={
          stats ? (
            <span className="num">
              {stats.wins}W · {stats.losses}L
              {stats.flats > 0 ? ` · ${stats.flats} flat` : ""}
            </span>
          ) : (
            <Skeleton className="h-4 w-20" />
          )
        }
      >
        {stats ? (
          stats.winRate != null ? (
            <span className="flex items-center gap-2">
              <span className="num">
                {fmtPct(stats.winRate, { digits: 1 })}
              </span>
              <span className="flex h-1.5 w-16 overflow-hidden rounded-full bg-panel2">
                <span
                  className="bg-up"
                  style={{ width: `${stats.winRate * 100}%` }}
                />
                <span className="ml-[2px] flex-1 bg-down/70" />
              </span>
            </span>
          ) : (
            <span className="text-ink3">—</span>
          )
        ) : (
          <Skeleton className="h-7 w-24" />
        )}
      </Card>

      <Card
        label="Volume traded"
        sub={
          overview ? (
            <span className="num">
              30D:{" "}
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
            "over the loaded trade window"
          ) : (
            <Skeleton className="h-4 w-28" />
          )
        }
      >
        {stats ? (
          <span className="flex flex-col gap-0.5 text-sm leading-snug">
            <span className="num text-ink2">
              Fees{" "}
              <span className="text-downt">
                {fmtUsdSigned(-stats.totalUsdcFees)}
              </span>
            </span>
            <span className="num text-ink2">
              Fund <Pnl value={stats.netFunding} className="text-sm" />
            </span>
          </span>
        ) : (
          <Skeleton className="h-7 w-24" />
        )}
      </Card>
    </div>
  );
}
