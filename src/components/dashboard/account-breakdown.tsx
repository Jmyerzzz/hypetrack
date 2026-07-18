"use client";

import { Pnl } from "@/components/ui";
import type { OverviewPayload } from "@/lib/api-types";
import { fmtUsd } from "@/lib/format";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[13px] text-ink2">{label}</span>
      <span className="num text-[13px] text-ink">{children}</span>
    </div>
  );
}

export function AccountBreakdown({ overview }: { overview: OverviewPayload }) {
  const leverage =
    overview.perpEquity > 0 ? overview.totalNtlPos / overview.perpEquity : null;
  const marginRatio =
    overview.perpEquity > 0 ? overview.marginUsed / overview.perpEquity : 0;
  // Distance to liquidation risk: maintenance margin vs account value.
  const maintenanceRatio =
    overview.perpEquity > 0
      ? overview.maintenanceMarginUsed / overview.perpEquity
      : 0;

  return (
    <section className="card p-4">
      <h2 className="text-[11px] font-medium tracking-wide text-ink3 uppercase">
        Perp account breakdown
      </h2>
      <div className="mt-2 divide-y divide-edge">
        <Row label="Account value">{fmtUsd(overview.perpEquity)}</Row>
        <Row label="Unrealized PnL">
          <Pnl value={overview.totalUnrealizedPnl} className="text-[13px]" />
        </Row>
        <Row label="Withdrawable">{fmtUsd(overview.withdrawable)}</Row>
        <Row label="Open notional">{fmtUsd(overview.totalNtlPos)}</Row>
        <Row label="Account leverage">
          {leverage != null && leverage > 0.001
            ? `${leverage.toFixed(2)}×`
            : "—"}
        </Row>
        <div className="py-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-ink2">Margin used</span>
            <span className="num text-[13px] text-ink">
              {fmtUsd(overview.marginUsed)}
              <span className="ml-1.5 text-ink3">
                ({(marginRatio * 100).toFixed(1)}%)
              </span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-accent/15">
            <div
              className={`h-full rounded-full ${
                marginRatio > 0.75 ? "bg-warn" : "bg-accent"
              }`}
              style={{ width: `${Math.min(100, marginRatio * 100)}%` }}
            />
          </div>
        </div>
        <Row label="Cross maintenance margin">
          {fmtUsd(overview.maintenanceMarginUsed)}
          <span className="ml-1.5 text-ink3">
            ({(maintenanceRatio * 100).toFixed(1)}%)
          </span>
        </Row>
      </div>
    </section>
  );
}
