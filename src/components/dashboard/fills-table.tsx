"use client";

import { useState } from "react";
import { EmptyState, ExplorerLink, Pnl, Td, Th } from "@/components/ui";
import type { FillView } from "@/lib/api-types";
import { fmtPrice, fmtSize, fmtTime, fmtUsd } from "@/lib/format";

const PAGE = 50;

export function FillsTable({
  fills,
  fillsTotal,
}: {
  fills: FillView[];
  fillsTotal: number;
}) {
  const [visible, setVisible] = useState(PAGE);
  if (fills.length === 0) {
    return <EmptyState title="No perp fills in the loaded window" />;
  }
  const shown = fills.slice(0, visible);

  return (
    <div>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="border-b border-edge">
              <Th align="left">Time</Th>
              <Th align="left">Market</Th>
              <Th align="left">Action</Th>
              <Th>Price</Th>
              <Th>Size</Th>
              <Th>Value</Th>
              <Th>Fee</Th>
              <Th>Realized PnL</Th>
              <Th>Tx</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((f) => (
              <tr
                key={f.tid}
                className="border-b border-edge transition-colors last:border-0 hover:bg-panel2/40"
              >
                <Td align="left" className="num text-ink2">
                  {fmtTime(f.time)}
                </Td>
                <Td align="left">
                  <span className="font-medium text-ink">{f.coin}</span>
                </Td>
                <Td align="left">
                  <span className={f.isBuy ? "text-upt" : "text-downt"}>
                    {f.dir || (f.isBuy ? "Buy" : "Sell")}
                  </span>
                  {f.twap && (
                    <span className="ml-1.5 text-[10px] text-ink3">TWAP</span>
                  )}
                  {f.liquidation && (
                    <span className="ml-1.5 text-[10px] font-semibold text-warn">
                      LIQ
                    </span>
                  )}
                </Td>
                <Td className="num">{fmtPrice(f.px)}</Td>
                <Td className="num">{fmtSize(f.sz)}</Td>
                <Td className="num text-ink2">
                  {fmtUsd(f.notional, { compact: true })}
                </Td>
                <Td className="num text-ink2">
                  {f.feeToken === "USDC" ? (
                    fmtUsd(f.fee)
                  ) : (
                    <span>
                      {fmtSize(f.fee)}{" "}
                      <span className="text-[10px] text-ink3">
                        {f.feeToken}
                      </span>
                    </span>
                  )}
                </Td>
                <Td>
                  {f.closedPnl !== 0 ? (
                    <Pnl value={f.closedPnl} className="text-[13px]" />
                  ) : (
                    <span className="text-ink3">—</span>
                  )}
                </Td>
                <Td className="num text-[12px]">
                  <ExplorerLink hash={f.hash} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-edge px-4 py-3">
        <span className="text-xs text-ink3">
          Showing {shown.length} of {fills.length} delivered · {fillsTotal} in
          window
        </span>
        {visible < fills.length && (
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE)}
            className="rounded-lg border border-edge bg-panel2 px-4 py-1.5 text-xs font-medium text-ink2 transition-colors hover:text-ink"
          >
            Show more
          </button>
        )}
      </div>
    </div>
  );
}
