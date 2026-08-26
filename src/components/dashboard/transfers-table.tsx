"use client";

import { useState } from "react";
import {
  AccountTag,
  CardField,
  CardList,
  DataCard,
  EmptyState,
  ExplorerLink,
  smallCents,
  Td,
  Th,
  ViewToggle,
} from "@/components/ui";
import { rowKey } from "@/lib/accounts";
import type { TransferView } from "@/lib/api-types";
import { fmtTime } from "@/lib/format";
import { useViewMode } from "@/lib/hooks";
import { useMoney } from "@/lib/privacy";

const PAGE = 50;

function amountTone(amountUsd: number | null): string {
  if (amountUsd == null) return "text-ink3";
  if (amountUsd > 0) return "text-upt";
  if (amountUsd < 0) return "text-downt";
  return "text-ink2";
}

function TransferCard({ t }: { t: TransferView }) {
  const { fmtUsdSigned } = useMoney();
  return (
    <DataCard>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="rounded-md bg-panel2 px-1.5 py-0.5 text-[11px] font-medium text-ink2">
            {t.label}
          </span>
          <p className="num mt-1 text-[11px] text-ink3">
            {fmtTime(t.time, { withYear: true })}
          </p>
          {t.account && (
            <p className="mt-1">
              <AccountTag account={t.account} />
            </p>
          )}
        </div>
        <span
          className={`num shrink-0 text-[15px] font-semibold ${amountTone(t.amountUsd)}`}
        >
          {t.amountUsd != null ? smallCents(fmtUsdSigned(t.amountUsd)) : "—"}
        </span>
      </div>
      {(t.detail || t.hash) && (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-edge pt-3">
          {t.detail && (
            <CardField label="Detail" full>
              <span className="num block truncate text-[12px] text-ink3">
                {t.detail}
              </span>
            </CardField>
          )}
          <CardField label="Tx">
            <span className="num text-[12px]">
              <ExplorerLink hash={t.hash} />
            </span>
          </CardField>
        </div>
      )}
    </DataCard>
  );
}

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
  const { fmtUsdSigned } = useMoney();
  const [view, setView] = useViewMode();
  const [visible, setVisible] = useState(PAGE);
  if (transfers.length === 0) {
    return <EmptyState title="No deposits, withdrawals, or transfers found" />;
  }
  const shown = transfers.slice(0, visible);
  const key = (t: TransferView) =>
    rowKey(t.account, `${t.time}:${t.hash}:${t.type}:${t.amountUsd ?? ""}`);
  // Set only in the all-accounts view; a single account's rows carry no tag.
  const tagged = transfers.some((t) => t.account);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-4 py-3 text-xs text-ink2">
        <span className="num">
          <span className="whitespace-nowrap">
            Deposited {smallCents(fmtUsdSigned(totalDeposited))}
          </span>
          {" · "}
          <span className="whitespace-nowrap">
            Withdrawn {smallCents(fmtUsdSigned(-totalWithdrawn))}
          </span>
        </span>
        <ViewToggle value={view} onChange={setView} />
      </div>

      {view === "cards" ? (
        <CardList minWidth={280}>
          {shown.map((t) => (
            <TransferCard key={key(t)} t={t} />
          ))}
        </CardList>
      ) : (
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr className="border-b border-edge">
                {tagged && <Th align="left">Account</Th>}
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
                  key={key(t)}
                  className="border-b border-edge transition-colors last:border-0 hover:bg-panel2/40"
                >
                  {tagged && (
                    <Td align="left">
                      <AccountTag account={t.account} />
                    </Td>
                  )}
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
                      <span className={`num ${amountTone(t.amountUsd)}`}>
                        {smallCents(fmtUsdSigned(t.amountUsd))}
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
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-edge px-4 py-3">
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
