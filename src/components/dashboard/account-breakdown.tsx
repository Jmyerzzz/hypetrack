"use client";

import { Pnl } from "@/components/ui";
import type { OverviewPayload } from "@/lib/api-types";
import { fmtCompact, fmtUsd } from "@/lib/format";

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
  // Margin utilization is a perp-account measure: margin used against the perp
  // equity that actually backs it. Spot USDC lives in a separate wallet and
  // can't margin a perp position until it's transferred in, so it stays out of
  // both the ratio and the free-collateral figure — folding it in read as spare
  // buying power the perp book doesn't have. This tracks `withdrawable`: once
  // the perp account is fully committed the ratio is 100% and free collateral
  // is $0, even while spot USDC sits in the balances below.
  const marginRatio =
    overview.perpEquity > 0 ? overview.marginUsed / overview.perpEquity : 0;
  const freeCollateral = Math.max(0, overview.perpEquity - overview.marginUsed);
  // Distance to liquidation risk for cross positions: maintenance vs the
  // perp account value that backs them.
  const maintenanceRatio =
    overview.perpEquity > 0
      ? overview.maintenanceMarginUsed / overview.perpEquity
      : 0;

  return (
    <section className="card p-4">
      <h2 className="text-[11px] font-medium tracking-wide text-ink3 uppercase">
        Account breakdown
      </h2>
      <div className="mt-2 divide-y divide-edge">
        <Row label="Total equity">{fmtUsd(overview.totalEquity)}</Row>
        <Row label="Perp equity">{fmtUsd(overview.perpEquity)}</Row>
        <Row label="Spot value">{fmtUsd(overview.spotValue)}</Row>
        {/* Only shown when held, so perp-only accounts keep a tighter list. */}
        {overview.outcomeValue > 0 && (
          <Row label="Outcome markets">{fmtUsd(overview.outcomeValue)}</Row>
        )}
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
        <div
          className="py-1.5"
          title="USDC committed as position margin (isolated margin includes that position's unrealized PnL), as a share of your perp-account equity. The remainder is free collateral you can open new positions with or withdraw. Spot USDC isn't counted — it must be transferred to the perp wallet first."
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-ink2">Margin used</span>
            <span className="num text-[13px] text-ink">
              {fmtUsd(overview.marginUsed)}
              <span className="ml-1.5 text-ink3">
                ({(marginRatio * 100).toFixed(1)}% of perp equity)
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
        <Row label="Free collateral">{fmtUsd(freeCollateral)}</Row>
        <Row label="Cross maintenance margin">
          {fmtUsd(overview.maintenanceMarginUsed)}
          <span className="ml-1.5 text-ink3">
            ({(maintenanceRatio * 100).toFixed(1)}%)
          </span>
        </Row>
      </div>

      {overview.spotBalances.length > 0 && (
        <div className="mt-3 border-t border-edge pt-3">
          <h3 className="text-[11px] font-medium tracking-wide text-ink3 uppercase">
            Spot balances
          </h3>
          <div className="mt-1">
            {overview.spotBalances.map((b) => (
              <div
                key={b.coin}
                className="flex items-center justify-between gap-3 py-1"
              >
                <span className="text-[13px] text-ink2">{b.coin}</span>
                <span className="num text-[13px] text-ink">
                  {fmtCompact(b.total)}
                  <span className="ml-1.5 text-ink3">
                    {b.usdValue != null
                      ? fmtUsd(b.usdValue, { compact: true })
                      : "—"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
