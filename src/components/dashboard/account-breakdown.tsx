"use client";

import { Pnl, smallCents } from "@/components/ui";
import type { OverviewPayload } from "@/lib/api-types";
import { useMoney } from "@/lib/privacy";

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-1.5"
      title={hint}
    >
      <span className="text-[13px] text-ink2">{label}</span>
      <span className="num text-[13px] text-ink">{children}</span>
    </div>
  );
}

export function AccountBreakdown({ overview }: { overview: OverviewPayload }) {
  const { fmtUsd, fmtCompact } = useMoney();
  const leverage =
    overview.perpEquity > 0 ? overview.totalNtlPos / overview.perpEquity : null;
  // The unified account posts spot USDC as perp collateral directly (it is the
  // account's available balance — no transfer step), so margin utilization is
  // measured against the whole tradeable balance: perp equity plus spot value.
  // Outcome-market holdings aren't collateral, so they're excluded. Free
  // collateral is whatever of that balance isn't already posted as margin —
  // i.e. the spot USDC still available to open new positions.
  const tradeableEquity = overview.perpEquity + overview.spotValue;
  const marginRatio =
    tradeableEquity > 0 ? overview.marginUsed / tradeableEquity : 0;
  const freeCollateral = Math.max(0, tradeableEquity - overview.marginUsed);
  // Distance to liquidation risk for cross positions: maintenance vs the
  // tradeable balance that backs them.
  const maintenanceRatio =
    tradeableEquity > 0 ? overview.maintenanceMarginUsed / tradeableEquity : 0;

  return (
    <section className="card p-4">
      <h2 className="text-[11px] font-medium tracking-wide text-ink3 uppercase">
        Account breakdown
      </h2>
      <div className="mt-2 divide-y divide-edge">
        <Row label="Total equity">
          {smallCents(fmtUsd(overview.totalEquity))}
        </Row>
        <Row label="Perp equity">{smallCents(fmtUsd(overview.perpEquity))}</Row>
        <Row label="Spot value">{smallCents(fmtUsd(overview.spotValue))}</Row>
        {/* Only shown when held, so perp-only accounts keep a tighter list. */}
        {overview.outcomeValue > 0 && (
          <Row label="Outcome markets">
            {smallCents(fmtUsd(overview.outcomeValue))}
          </Row>
        )}
        <Row label="Unrealized PnL">
          <Pnl value={overview.totalUnrealizedPnl} className="text-[13px]" />
        </Row>
        <Row
          label="Withdrawable"
          hint="Funds you can withdraw now: the perp wallet's free collateral plus unencumbered spot USDC. Excludes USDC posted as position margin."
        >
          {smallCents(fmtUsd(overview.withdrawable))}
        </Row>
        <Row label="Open notional">
          {smallCents(fmtUsd(overview.totalNtlPos))}
        </Row>
        <Row label="Account leverage">
          {leverage != null && leverage > 0.001
            ? `${leverage.toFixed(2)}×`
            : "—"}
        </Row>
        <div
          className="py-1.5"
          title="USDC committed as position margin (isolated margin includes that position's unrealized PnL), as a share of your total tradeable balance — perp equity plus spot USDC, which the unified account can post as collateral directly. The remainder is free collateral you can open new positions with or withdraw."
        >
          {/* The share is a whole clause, so it wraps under the dollar figure
            rather than forcing the label to break in two on a phone. */}
          <div className="flex items-baseline justify-between gap-3">
            <span className="shrink-0 text-[13px] whitespace-nowrap text-ink2">
              Margin used
            </span>
            <span className="num flex flex-wrap justify-end gap-x-1.5 text-right text-[13px] text-ink">
              <span>{smallCents(fmtUsd(overview.marginUsed))}</span>
              <span className="text-ink3">
                ({(marginRatio * 100).toFixed(1)}% of account equity)
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
        <Row label="Free collateral">{smallCents(fmtUsd(freeCollateral))}</Row>
        <Row label="Cross maintenance margin">
          {smallCents(fmtUsd(overview.maintenanceMarginUsed))}
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
                      ? smallCents(fmtUsd(b.usdValue, { compact: true }))
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
