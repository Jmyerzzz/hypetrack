"use client";

import { useState } from "react";
import {
  CardField,
  CardList,
  DataCard,
  EmptyState,
  ExplorerLink,
  MarketLabel,
  Pnl,
  Td,
  Th,
  ViewToggle,
} from "@/components/ui";
import type { FillView, OutcomeMarketMap } from "@/lib/api-types";
import { fmtPrice, fmtSize, fmtTime, fmtUsd } from "@/lib/format";
import { useViewMode } from "@/lib/hooks";

const PAGE = 50;

/**
 * Outcome markets add non-trade fills — settlement at $0/$1, and minting or
 * burning a full set of sides — which aren't a buy or a sell.
 */
const NON_TRADE_DIRS = new Set([
  "Settlement",
  "Split Outcome",
  "Merge Outcome",
]);

function FillAction({ f }: { f: FillView }) {
  const label = f.dir || (f.isBuy ? "Buy" : "Sell");
  const tone = NON_TRADE_DIRS.has(f.dir)
    ? "text-warn"
    : f.isBuy
      ? "text-upt"
      : "text-downt";
  return <span className={tone}>{label}</span>;
}

function FillFlags({ f }: { f: FillView }) {
  return (
    <>
      {f.twap && <span className="ml-1.5 text-[10px] text-ink3">TWAP</span>}
      {f.liquidation && (
        <span className="ml-1.5 text-[10px] font-semibold text-warn">LIQ</span>
      )}
    </>
  );
}

function feeLabel(f: FillView): React.ReactNode {
  // Outcome fills are charged in their own contract, so naming the token only
  // adds noise when nothing was charged — which is the usual case there.
  return f.feeToken === "USDC" || f.fee === 0 ? (
    fmtUsd(f.fee)
  ) : (
    <span>
      {fmtSize(f.fee)}{" "}
      <span className="text-[10px] text-ink3">{f.feeToken}</span>
    </span>
  );
}

function FillCard({ f, markets }: { f: FillView; markets: OutcomeMarketMap }) {
  return (
    <DataCard>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <MarketLabel coin={f.coin} market={markets[f.coin]} />
          <p className="text-[12px]">
            <FillAction f={f} />
            <FillFlags f={f} />
          </p>
        </div>
        <div className="shrink-0 text-right">
          {f.closedPnl !== 0 ? (
            <Pnl value={f.closedPnl} className="text-[15px] font-semibold" />
          ) : (
            <span className="num text-[15px] font-semibold text-ink">
              {fmtUsd(f.notional, { compact: true })}
            </span>
          )}
          <p className="num text-[11px] text-ink3">{fmtTime(f.time)}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-edge pt-3">
        <CardField label="Price">
          <span className="num">{fmtPrice(f.px)}</span>
        </CardField>
        <CardField label="Size" align="right">
          <span className="num">{fmtSize(f.sz)}</span>
        </CardField>
        <CardField label="Value">
          <span className="num text-ink2">
            {fmtUsd(f.notional, { compact: true })}
          </span>
        </CardField>
        <CardField label="Fee" align="right">
          <span className="num text-ink2">{feeLabel(f)}</span>
        </CardField>
        <CardField label="Tx">
          <span className="num text-[12px]">
            <ExplorerLink hash={f.hash} />
          </span>
        </CardField>
      </div>
    </DataCard>
  );
}

export function FillsTable({
  fills,
  fillsTotal,
  markets,
}: {
  fills: FillView[];
  fillsTotal: number;
  markets: OutcomeMarketMap;
}) {
  const [view, setView] = useViewMode();
  const [visible, setVisible] = useState(PAGE);
  if (fills.length === 0) {
    return <EmptyState title="No fills in the loaded window" />;
  }
  const shown = fills.slice(0, visible);

  return (
    <div>
      <div className="flex items-center justify-end border-b border-edge px-4 py-2.5">
        <ViewToggle value={view} onChange={setView} />
      </div>

      {view === "cards" ? (
        <CardList minWidth={300}>
          {shown.map((f) => (
            <FillCard key={f.tid} f={f} markets={markets} />
          ))}
        </CardList>
      ) : (
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
                    <MarketLabel coin={f.coin} market={markets[f.coin]} />
                  </Td>
                  <Td align="left">
                    <FillAction f={f} />
                    <FillFlags f={f} />
                  </Td>
                  <Td className="num">{fmtPrice(f.px)}</Td>
                  <Td className="num">{fmtSize(f.sz)}</Td>
                  <Td className="num text-ink2">
                    {fmtUsd(f.notional, { compact: true })}
                  </Td>
                  <Td className="num text-ink2">{feeLabel(f)}</Td>
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
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-edge px-4 py-3">
        <span className="text-xs text-ink3">
          Showing {shown.length} of {fills.length} delivered · {fillsTotal} in
          window
        </span>
        {visible < fills.length && (
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
