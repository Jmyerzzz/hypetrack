"use client";

import { fmtPct, fmtUsd } from "@/lib/format";
import type { RiskMetrics } from "@/lib/risk";

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
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

export function RiskCard({ risk }: { risk: RiskMetrics }) {
  const ratio = (v: number | "inf" | null): React.ReactNode => {
    if (v === "inf") return <span className="text-upt">∞</span>;
    if (v == null) return <span className="text-ink3">—</span>;
    const tone = v >= 1 ? "text-upt" : v < 0 ? "text-downt" : "text-ink";
    return <span className={tone}>{v.toFixed(2)}</span>;
  };

  return (
    <section className="card p-4">
      <h2 className="text-[11px] font-medium tracking-wide text-ink3 uppercase">
        Risk profile
      </h2>
      <div className="mt-2 divide-y divide-edge">
        <Row
          label="Sharpe (30D)"
          hint="Annualized (√365) from daily perp PnL returns over the last 30 days. Needs ≥8 trading days of history."
        >
          {ratio(risk.sharpe)}
        </Row>
        <Row
          label="Sortino (30D)"
          hint="Like Sharpe, but only downside days count as risk. ∞ = no losing days in the window."
        >
          {ratio(risk.sortino)}
        </Row>
        <Row
          label="Max drawdown (30D)"
          hint="Largest peak-to-trough drop of the combined account value over the last 30 days, as a fraction of the peak — the same figure Hyperliquid reports."
        >
          {risk.maxDrawdownUsd == null ? (
            <span className="text-ink3">—</span>
          ) : (
            <span className="text-downt">
              −{fmtUsd(risk.maxDrawdownUsd, { compact: true })}
              {risk.maxDrawdownPct != null && (
                <span className="ml-1.5 text-ink3">
                  ({fmtPct(risk.maxDrawdownPct)})
                </span>
              )}
            </span>
          )}
        </Row>
      </div>
      {risk.dailySamples > 0 && risk.dailySamples < 8 && (
        <p className="mt-2 text-[11px] text-ink3">
          Sharpe/Sortino need at least 8 trading days — this account has{" "}
          {risk.dailySamples}.
        </p>
      )}
    </section>
  );
}
