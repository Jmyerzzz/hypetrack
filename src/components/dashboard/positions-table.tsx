"use client";

import { CoinTag, DirectionBadge, Pnl, Td, Th } from "@/components/ui";
import type { PositionView } from "@/lib/api-types";
import { fmtPrice, fmtSize, fmtUsd } from "@/lib/format";

export function PositionsTable({ positions }: { positions: PositionView[] }) {
  const totalUpnl = positions.reduce((a, p) => a + p.unrealizedPnl, 0);
  const totalNotional = positions.reduce((a, p) => a + p.positionValue, 0);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-edge px-4 py-3">
        <h2 className="text-sm font-semibold">
          Open positions
          <span className="ml-2 text-xs font-normal text-ink3">
            {positions.length}
          </span>
        </h2>
        <p className="num text-xs text-ink2">
          {fmtUsd(totalNotional, { compact: true })} notional · uPnL{" "}
          <Pnl value={totalUpnl} className="text-xs" />
        </p>
      </div>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr className="border-b border-edge">
              <Th align="left">Market</Th>
              <Th align="left">Side</Th>
              <Th>Size</Th>
              <Th>Entry</Th>
              <Th>Mark</Th>
              <Th>Liq. price</Th>
              <Th>Margin</Th>
              <Th>Funding</Th>
              <Th>Unrealized PnL</Th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr
                key={p.coin}
                className="border-b border-edge transition-colors last:border-0 hover:bg-panel2/50"
              >
                <Td align="left">
                  <CoinTag
                    coin={p.coin}
                    sub={`${p.leverage}× ${p.leverageType}`}
                  />
                </Td>
                <Td align="left">
                  <DirectionBadge direction={p.direction} />
                </Td>
                <Td>
                  <span className="num block">{fmtSize(Math.abs(p.szi))}</span>
                  <span className="num block text-[11px] text-ink3">
                    {fmtUsd(p.positionValue, { compact: true })}
                  </span>
                </Td>
                <Td className="num">{fmtPrice(p.entryPx)}</Td>
                <Td className="num">{fmtPrice(p.markPx)}</Td>
                <Td className="num text-warn">{fmtPrice(p.liquidationPx)}</Td>
                <Td className="num">{fmtUsd(p.marginUsed)}</Td>
                <Td>
                  <Pnl value={p.fundingSinceOpen} className="text-[13px]" />
                </Td>
                <Td>
                  <Pnl
                    value={p.unrealizedPnl}
                    pct={p.roe}
                    className="text-[13px]"
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
