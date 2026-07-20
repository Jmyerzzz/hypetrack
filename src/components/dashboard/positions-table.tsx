"use client";

import { useMemo, useState } from "react";
import {
  CardField,
  CardList,
  CoinTag,
  DataCard,
  DirectionBadge,
  EmptyState,
  FilterSelect,
  Pnl,
  RefreshButton,
  Td,
  Th,
  ViewToggle,
} from "@/components/ui";
import type { PositionView } from "@/lib/api-types";
import { fmtPrice, fmtSize, fmtUsd } from "@/lib/format";
import { useViewMode } from "@/lib/hooks";

type PnlFilter = "all" | "profit" | "loss";
type DirFilter = "all" | "long" | "short";
type MarginFilter = "all" | "cross" | "isolated";

function PositionCard({ p }: { p: PositionView }) {
  return (
    <DataCard>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <CoinTag coin={p.coin} sub={`${p.leverage}× ${p.leverageType}`} />
          {/* Row wrapper so the badge sizes to its label; stretching it is the
              flex-column default, and min-w-0 above still truncates the name. */}
          <span className="flex">
            <DirectionBadge direction={p.direction} />
          </span>
        </div>
        <div className="shrink-0 text-right">
          <Pnl
            value={p.unrealizedPnl}
            pct={p.roe}
            className="text-[15px] font-semibold"
          />
          <p className="text-[10px] text-ink3">unrealized</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-edge pt-3">
        <CardField label="Size">
          <span className="num">{fmtSize(Math.abs(p.szi))}</span>
          <span className="num ml-1.5 text-[11px] text-ink3">
            {fmtUsd(p.positionValue, { compact: true })}
          </span>
        </CardField>
        <CardField label="Margin" align="right">
          <span className="num">{fmtUsd(p.marginUsed)}</span>
        </CardField>
        <CardField label="Entry">
          <span className="num">{fmtPrice(p.entryPx)}</span>
        </CardField>
        <CardField label="Mark" align="right">
          <span className="num">{fmtPrice(p.markPx)}</span>
        </CardField>
        <CardField label="Liq. price">
          <span className="num text-warn">{fmtPrice(p.liquidationPx)}</span>
        </CardField>
        <CardField label="Funding" align="right">
          <Pnl value={p.fundingSinceOpen} className="text-[13px]" />
        </CardField>
      </div>
    </DataCard>
  );
}

export function PositionsTable({
  positions,
  onRefresh,
  refreshing,
}: {
  positions: PositionView[];
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [view, setView] = useViewMode();
  const [coinFilter, setCoinFilter] = useState("all");
  const [marginFilter, setMarginFilter] = useState<MarginFilter>("all");
  const [pnlFilter, setPnlFilter] = useState<PnlFilter>("all");
  const [dirFilter, setDirFilter] = useState<DirFilter>("all");

  // Account-level totals, deliberately unfiltered: they summarise the whole
  // book, the way the trade section's performance strip sits above its row.
  const totalUpnl = positions.reduce((a, p) => a + p.unrealizedPnl, 0);
  const totalNotional = positions.reduce((a, p) => a + p.positionValue, 0);

  const coins = useMemo(
    () => [...new Set(positions.map((p) => p.coin))].sort(),
    [positions],
  );

  // Only worth a control once the account actually holds both kinds.
  const hasBothMargins = useMemo(
    () => new Set(positions.map((p) => p.leverageType)).size > 1,
    [positions],
  );

  const filtered = useMemo(
    () =>
      positions.filter((p) => {
        if (coinFilter !== "all" && p.coin !== coinFilter) return false;
        if (marginFilter !== "all" && p.leverageType !== marginFilter)
          return false;
        if (dirFilter !== "all" && p.direction !== dirFilter) return false;
        if (pnlFilter === "profit") return p.unrealizedPnl > 0;
        if (pnlFilter === "loss") return p.unrealizedPnl < 0;
        return true;
      }),
    [positions, coinFilter, marginFilter, dirFilter, pnlFilter],
  );

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-4 py-3">
        <h2 className="text-sm font-semibold">
          Open positions
          <span className="ml-2 text-xs font-normal text-ink3">
            {positions.length}
          </span>
        </h2>
        <div className="flex items-center gap-2 sm:gap-3">
          <p className="num text-xs text-ink2">
            {fmtUsd(totalNotional, { compact: true })} notional · uPnL{" "}
            <Pnl value={totalUpnl} className="text-xs" />
          </p>
          {/* Last in the row, so the rule closes off a corner cell holding the
              refresh alone — the trade section's tab bar reads the same way,
              with the view control left outside it. `pl-4` matches the header's
              own `px-4`, which is what sits on the icon's other side; the trade
              section pairs a narrower `pl-1.5` with its `pr-2` for the same
              reason. `-my-3` cancels the header's padding so the rule runs the
              full row height as it does there, but only from `sm`: this header
              wraps onto two lines below that, where a bled rule would run up
              into the title's line. */}
          <div className="flex shrink-0 items-center self-stretch border-l border-edge pl-4 sm:-my-3">
            <RefreshButton onClick={onRefresh} refreshing={refreshing} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-edge px-4 py-3">
        <FilterSelect
          value={coinFilter}
          onChange={setCoinFilter}
          label="Filter by market"
        >
          <option value="all">All markets</option>
          {coins.map((coin) => (
            <option key={coin} value={coin}>
              {coin}
            </option>
          ))}
        </FilterSelect>
        {hasBothMargins && (
          <FilterSelect
            value={marginFilter}
            onChange={(v) => setMarginFilter(v as MarginFilter)}
            label="Filter by margin mode"
          >
            <option value="all">Cross &amp; isolated</option>
            <option value="cross">Cross only</option>
            <option value="isolated">Isolated only</option>
          </FilterSelect>
        )}
        <FilterSelect
          value={pnlFilter}
          onChange={(v) => setPnlFilter(v as PnlFilter)}
          label="Filter by unrealized PnL"
        >
          <option value="all">All P&amp;L</option>
          <option value="profit">In profit</option>
          <option value="loss">At a loss</option>
        </FilterSelect>
        <FilterSelect
          value={dirFilter}
          onChange={(v) => setDirFilter(v as DirFilter)}
          label="Filter by direction"
        >
          <option value="all">Long &amp; short</option>
          <option value="long">Long</option>
          <option value="short">Short</option>
        </FilterSelect>
        <span className="ml-auto text-xs text-ink3">
          {filtered.length} of {positions.length} position
          {positions.length === 1 ? "" : "s"}
        </span>
        <ViewToggle value={view} onChange={setView} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No positions match these filters"
          hint="Widen a filter to see the rest of the open book."
        />
      ) : view === "cards" ? (
        <CardList minWidth={320}>
          {filtered.map((p) => (
            <PositionCard key={p.coin} p={p} />
          ))}
        </CardList>
      ) : (
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
              {filtered.map((p) => (
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
                    <span className="num block">
                      {fmtSize(Math.abs(p.szi))}
                    </span>
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
      )}
    </section>
  );
}
