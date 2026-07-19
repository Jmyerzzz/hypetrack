"use client";

import {
  CardField,
  CardList,
  DataCard,
  MarketTag,
  Pnl,
  SideBadge,
  Td,
  Th,
  ViewToggle,
} from "@/components/ui";
import type { OutcomeMarketMap, OutcomePositionView } from "@/lib/api-types";
import { fmtPct, fmtPrice, fmtSize, fmtUsd } from "@/lib/format";
import { useViewMode } from "@/lib/hooks";

/**
 * A price on an outcome market *is* the market's implied probability, so it is
 * shown that way; the exact contract price stays available on hover.
 */
function Odds({ px }: { px: number | null }) {
  if (px == null) return <span className="text-ink3">—</span>;
  return (
    <span className="num" title={`${fmtPrice(px)} per contract`}>
      {fmtPct(px, { digits: 1 })}
    </span>
  );
}

function OutcomeCard({
  p,
  markets,
}: {
  p: OutcomePositionView;
  markets: OutcomeMarketMap;
}) {
  const market = markets[p.coin];
  return (
    <DataCard>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <MarketTag coin={p.coin} market={market} />
          {/* Row wrapper so the badge sizes to its label; stretching it is the
              flex-column default, and min-w-0 above still truncates the name. */}
          <span className="flex">
            {market && <SideBadge market={market} />}
          </span>
        </div>
        <div className="shrink-0 text-right">
          {p.unrealizedPnl == null ? (
            <span className="text-[15px] text-ink3">—</span>
          ) : (
            <Pnl
              value={p.unrealizedPnl}
              pct={p.roe}
              className="text-[15px] font-semibold"
            />
          )}
          <p className="text-[10px] text-ink3">unrealized</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-edge pt-3">
        <CardField label="Contracts">
          <span className="num">{fmtSize(p.size)}</span>
          {p.hold > 0 && (
            <span className="num ml-1.5 text-[11px] text-ink3">
              {fmtSize(p.hold)} in orders
            </span>
          )}
        </CardField>
        <CardField label="Value" align="right">
          <span className="num">
            {p.positionValue == null ? "—" : fmtUsd(p.positionValue)}
          </span>
        </CardField>
        <CardField label="Entry odds">
          <Odds px={p.avgEntryPx} />
        </CardField>
        <CardField label="Now" align="right">
          <Odds px={p.markPx} />
        </CardField>
        <CardField label="Cost">
          <span className="num text-ink2">{fmtUsd(p.entryNotional)}</span>
        </CardField>
        <CardField label="Payout if won" align="right">
          <span className="num text-upt">{fmtUsd(p.payoutIfWon)}</span>
        </CardField>
      </div>
    </DataCard>
  );
}

export function OutcomePositions({
  positions,
  markets,
}: {
  positions: OutcomePositionView[];
  markets: OutcomeMarketMap;
}) {
  const [view, setView] = useViewMode();
  const totalValue = positions.reduce((a, p) => a + (p.positionValue ?? 0), 0);
  const totalUpnl = positions.reduce((a, p) => a + (p.unrealizedPnl ?? 0), 0);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-4 py-3">
        <h2 className="text-sm font-semibold">
          Outcome positions
          <span className="ml-2 text-xs font-normal text-ink3">
            {positions.length}
          </span>
        </h2>
        <div className="flex items-center gap-3">
          <p className="num text-xs text-ink2">
            {fmtUsd(totalValue, { compact: true })} value · uPnL{" "}
            <Pnl value={totalUpnl} className="text-xs" />
          </p>
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      {view === "cards" ? (
        <CardList minWidth={320}>
          {positions.map((p) => (
            <OutcomeCard key={p.coin} p={p} markets={markets} />
          ))}
        </CardList>
      ) : (
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="border-b border-edge">
                <Th align="left">Market</Th>
                <Th align="left">Side</Th>
                <Th>Contracts</Th>
                <Th>Entry odds</Th>
                <Th>Now</Th>
                <Th>Cost</Th>
                <Th>Value</Th>
                <Th>Payout if won</Th>
                <Th>Unrealized PnL</Th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const market = markets[p.coin];
                return (
                  <tr
                    key={p.coin}
                    className="border-b border-edge transition-colors last:border-0 hover:bg-panel2/50"
                  >
                    <Td align="left">
                      <MarketTag coin={p.coin} market={market} />
                    </Td>
                    <Td align="left">
                      {market ? (
                        <SideBadge market={market} />
                      ) : (
                        <span className="text-ink3">—</span>
                      )}
                    </Td>
                    <Td>
                      <span className="num block">{fmtSize(p.size)}</span>
                      {p.hold > 0 && (
                        <span className="num block text-[11px] text-ink3">
                          {fmtSize(p.hold)} in orders
                        </span>
                      )}
                    </Td>
                    <Td>
                      <Odds px={p.avgEntryPx} />
                    </Td>
                    <Td>
                      <Odds px={p.markPx} />
                    </Td>
                    <Td className="num text-ink2">{fmtUsd(p.entryNotional)}</Td>
                    <Td className="num">
                      {p.positionValue == null ? "—" : fmtUsd(p.positionValue)}
                    </Td>
                    <Td className="num text-upt">{fmtUsd(p.payoutIfWon)}</Td>
                    <Td>
                      {p.unrealizedPnl == null ? (
                        <span className="text-ink3">—</span>
                      ) : (
                        <Pnl
                          value={p.unrealizedPnl}
                          pct={p.roe}
                          className="text-[13px]"
                        />
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-t border-edge px-4 py-2.5 text-[11px] text-ink3">
        Each contract settles at $1 if its side wins and $0 if it loses, so the
        price doubles as the market&rsquo;s implied probability. Fully
        collateralized — no leverage, liquidation, or funding.
      </p>
    </section>
  );
}
