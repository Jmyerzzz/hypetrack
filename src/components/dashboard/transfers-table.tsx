"use client";

import { useState } from "react";
import { EmptyState, ExplorerLink, Td, Th } from "@/components/ui";
import type { TransferView } from "@/lib/api-types";
import { fmtTime, fmtUsdSigned } from "@/lib/format";

const PAGE = 50;

export function TransfersTable({
  transfers,
  transfersTotal,
  totalDeposited,
  totalWithdrawn,
}: {
  transfers: TransferView[];
  transfersTotal: number;
  totalDeposited: number;
  totalWithdrawn: number;
}) {
  const [visible, setVisible] = useState(PAGE);
  if (transfers.length === 0) {
    return <EmptyState title="No deposits, withdrawals, or transfers found" />;
  }
  const shown = transfers.slice(0, visible);

  return (
    <div>
      <div className="border-b border-edge px-4 py-3 text-xs text-ink2">
        <span className="num">
          <span className="whitespace-nowrap">
            Deposited {fmtUsdSigned(totalDeposited)}
          </span>
          {" · "}
          <span className="whitespace-nowrap">
            Withdrawn {fmtUsdSigned(-totalWithdrawn)}
          </span>
        </span>
      </div>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse">
          <thead>
            <tr className="border-b border-edge">
              <Th align="left">Time</Th>
              <Th align="left">Type</Th>
              <Th>Amount</Th>
              <Th align="left">Detail</Th>
              <Th>Tx</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => (
              <tr
                key={`${t.time}:${t.hash}:${t.type}:${t.amountUsd ?? ""}`}
                className="border-b border-edge transition-colors last:border-0 hover:bg-panel2/40"
              >
                <Td align="left" className="num text-ink2">
                  {fmtTime(t.time, { withYear: true })}
                </Td>
                <Td align="left">
                  <span className="rounded-md bg-panel2 px-1.5 py-0.5 text-[11px] font-medium text-ink2">
                    {t.label}
                  </span>
                </Td>
                <Td>
                  {t.amountUsd != null ? (
                    <span
                      className={`num ${
                        t.amountUsd > 0
                          ? "text-upt"
                          : t.amountUsd < 0
                            ? "text-downt"
                            : "text-ink2"
                      }`}
                    >
                      {fmtUsdSigned(t.amountUsd)}
                    </span>
                  ) : (
                    <span className="text-ink3">—</span>
                  )}
                </Td>
                <Td
                  align="left"
                  className="num max-w-[280px] truncate text-[12px] text-ink3"
                >
                  {t.detail ?? "—"}
                </Td>
                <Td className="num text-[12px]">
                  <ExplorerLink hash={t.hash} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-edge px-4 py-3">
        <span className="text-xs text-ink3">
          Showing {shown.length} of {transfersTotal}
        </span>
        {visible < transfers.length && (
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
