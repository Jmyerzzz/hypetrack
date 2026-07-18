"use client";

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
  const marginRatio =
    overview.perpEquity > 0 ? overview.marginUsed / overview.perpEquity : 0;
  const topSpot = overview.spotBalances.slice(0, 4);

  return (
    <section className="card p-4">
      <h2 className="text-[11px] font-medium tracking-wide text-ink3 uppercase">
        Account breakdown
      </h2>
      <div className="mt-2 divide-y divide-edge">
        <Row label="Perp equity">{fmtUsd(overview.perpEquity)}</Row>
        <Row label="Spot value">{fmtUsd(overview.spotValue)}</Row>
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
      </div>

      {topSpot.length > 0 && (
        <div className="mt-3 border-t border-edge pt-3">
          <h3 className="text-[11px] font-medium tracking-wide text-ink3 uppercase">
            Spot balances
          </h3>
          <div className="mt-1">
            {topSpot.map((b) => (
              <div
                key={b.token}
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
            {overview.spotBalances.length > topSpot.length && (
              <p className="pt-1 text-[11px] text-ink3">
                +{overview.spotBalances.length - topSpot.length} more tokens
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
