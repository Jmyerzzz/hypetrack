"use client";

import { useState } from "react";
import { EmptyState, Pnl, Td, Th } from "@/components/ui";
import type { FundingView } from "@/lib/api-types";
import { fmtSize, fmtTime } from "@/lib/format";

const PAGE = 50;

export function FundingTable({
  funding,
  fundingTotal,
}: {
  funding: FundingView[];
  fundingTotal: number;
}) {
  const [visible, setVisible] = useState(PAGE);
  if (funding.length === 0) {
    return (
      <EmptyState
        title="No funding events in the loaded window"
        hint="Funding accrues hourly while a perp position is open."
      />
    );
  }
  const shown = funding.slice(0, visible);

  return (
    <div>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-edge">
              <Th align="left">Time</Th>
              <Th align="left">Market</Th>
              <Th>Position size</Th>
              <Th>Hourly rate</Th>
              <Th>Amount</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((f) => (
              <tr
                key={`${f.time}:${f.coin}`}
                className="border-b border-edge transition-colors last:border-0 hover:bg-panel2/40"
              >
                <Td align="left" className="num text-ink2">
                  {fmtTime(f.time)}
                </Td>
                <Td align="left" className="font-medium text-ink">
                  {f.coin}
                </Td>
                <Td className="num">
                  <span className={f.szi >= 0 ? "text-upt" : "text-downt"}>
                    {f.szi >= 0 ? "L" : "S"}
                  </span>{" "}
                  {fmtSize(Math.abs(f.szi))}
                </Td>
                <Td className="num text-ink2">{(f.rate * 100).toFixed(5)}%</Td>
                <Td>
                  <Pnl value={f.usdc} className="text-[13px]" />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-edge px-4 py-3">
        <span className="text-xs text-ink3">
          Showing {shown.length} of {funding.length} delivered · {fundingTotal}{" "}
          in window · positive = received
        </span>
        {visible < funding.length && (
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE)}
            className="rounded-lg border border-edge bg-panel2 px-4 py-1.5 text-xs font-medium text-ink2 transition-colors hover:text-ink max-sm:px-5 max-sm:py-2.5"
          >
            Show more
          </button>
        )}
      </div>
    </div>
  );
}
