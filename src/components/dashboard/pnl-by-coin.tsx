"use client";

import { Skeleton } from "@/components/ui";
import type { ActivityPayload } from "@/lib/api-types";
import { fmtUsdSigned } from "@/lib/format";

export function PnlByCoin({
  activity,
  pending,
}: {
  activity: ActivityPayload | undefined;
  pending: boolean;
}) {
  if (pending || !activity) {
    return (
      <section className="card flex-1 p-4">
        <h2 className="text-[11px] font-medium tracking-wide text-ink3 uppercase">
          Net PnL by coin
        </h2>
        <div className="mt-3 space-y-2.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-5" />
          ))}
        </div>
      </section>
    );
  }

  const byCoin = activity.stats.pnlByCoin;
  const sorted = [...byCoin].sort(
    (a, b) => Math.abs(b.netPnl) - Math.abs(a.netPnl),
  );
  const top = sorted.slice(0, 7);
  const rest = sorted.slice(7);
  const rows = [...top].sort((a, b) => b.netPnl - a.netPnl);
  const otherSum = rest.reduce((a, c) => a + c.netPnl, 0);
  if (rest.length > 0) {
    rows.push({
      coin: `Other (${rest.length})`,
      netPnl: otherSum,
      grossPnl: 0,
      fees: 0,
      funding: 0,
      trades: rest.reduce((a, c) => a + c.trades, 0),
      wins: 0,
      losses: 0,
    });
  }
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.netPnl)), 1e-9);

  return (
    <section className="card flex-1 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] font-medium tracking-wide text-ink3 uppercase">
          Net PnL by coin
        </h2>
        <span className="text-[11px] text-ink3">trade window</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 text-[13px] text-ink3">
          No perp trades in the loaded window.
        </p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {rows.map((r) => {
            const positive = r.netPnl >= 0;
            const width = Math.max(2, (Math.abs(r.netPnl) / maxAbs) * 100);
            return (
              <div
                key={r.coin}
                className="grid grid-cols-[72px_1fr_86px] items-center gap-2"
                title={`${r.coin}: ${r.trades} trade${r.trades === 1 ? "" : "s"}`}
              >
                <span className="truncate text-[12px] text-ink2">{r.coin}</span>
                <span className="relative block h-2">
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-1/2 w-px bg-edge2"
                  />
                  <span
                    className={`absolute inset-y-0 ${
                      positive
                        ? "left-1/2 rounded-r-[4px] bg-up"
                        : "right-1/2 rounded-l-[4px] bg-down"
                    }`}
                    style={{ width: `${width / 2}%` }}
                  />
                </span>
                <span
                  className={`num text-right text-[12px] ${
                    positive ? "text-upt" : "text-downt"
                  }`}
                >
                  {fmtUsdSigned(r.netPnl, { compact: true })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
