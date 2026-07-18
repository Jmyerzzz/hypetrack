"use client";

import { useState } from "react";
import {
  CardField,
  CardList,
  DataCard,
  EmptyState,
  Pnl,
  Td,
  Th,
  ViewToggle,
} from "@/components/ui";
import type { FundingView } from "@/lib/api-types";
import { fmtSize, fmtTime } from "@/lib/format";
import { useViewMode } from "@/lib/hooks";

const PAGE = 50;

function positionLabel(f: FundingView): React.ReactNode {
  return (
    <>
      <span className={f.szi >= 0 ? "text-upt" : "text-downt"}>
        {f.szi >= 0 ? "L" : "S"}
      </span>{" "}
      {fmtSize(Math.abs(f.szi))}
    </>
  );
}

function FundingCard({ f }: { f: FundingView }) {
  return (
    <DataCard>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">{f.coin}</p>
          <p className="num text-[11px] text-ink3">{fmtTime(f.time)}</p>
        </div>
        <Pnl value={f.usdc} className="shrink-0 text-[15px] font-semibold" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-edge pt-3">
        <CardField label="Position size">
          <span className="num">{positionLabel(f)}</span>
        </CardField>
        <CardField label="Hourly rate" align="right">
          <span className="num text-ink2">{(f.rate * 100).toFixed(5)}%</span>
        </CardField>
      </div>
    </DataCard>
  );
}

export function FundingTable({
  funding,
  fundingTotal,
}: {
  funding: FundingView[];
  fundingTotal: number;
}) {
  const [view, setView] = useViewMode();
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
      <div className="flex items-center justify-end border-b border-edge px-4 py-2.5">
        <ViewToggle value={view} onChange={setView} />
      </div>

      {view === "cards" ? (
        <CardList minWidth={260}>
          {shown.map((f) => (
            <FundingCard key={`${f.time}:${f.coin}`} f={f} />
          ))}
        </CardList>
      ) : (
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
                  <Td className="num">{positionLabel(f)}</Td>
                  <Td className="num text-ink2">
                    {(f.rate * 100).toFixed(5)}%
                  </Td>
                  <Td>
                    <Pnl value={f.usdc} className="text-[13px]" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
