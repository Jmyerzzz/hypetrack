"use client";

import { useMemo, useState } from "react";
import {
  CardField,
  CardList,
  CoinTag,
  DataCard,
  DirectionBadge,
  EmptyState,
  FilterRow,
  FilterSelect,
  Pnl,
  RefreshButton,
  smallCents,
  Td,
  Th,
} from "@/components/ui";
import type { PositionTriggerView, PositionView } from "@/lib/api-types";
import { fmtPct, fmtPrice } from "@/lib/format";
import { useViewMode } from "@/lib/hooks";
import { distanceFromMark } from "@/lib/positions";
import { useMoney } from "@/lib/privacy";

type PnlFilter = "all" | "profit" | "loss";
type DirFilter = "all" | "long" | "short";
type MarginFilter = "all" | "cross" | "isolated";

type SortKey =
  | "roe-desc"
  | "roe-asc"
  | "pnl-desc"
  | "pnl-asc"
  | "value-desc"
  | "margin-desc"
  | "coin-asc";

/**
 * Sort methods offered in the filter row. Each carries its own comparator so
 * the same ordering drives both the table and the card view, and so a new
 * method is one entry rather than another branch. The trailing arrow (or A–Z)
 * marks these as sorts beside the unadorned filter dropdowns; "% PnL" is roe
 * and "PnL" the unrealized dollar figure — the two halves of the PnL column.
 */
const SORT_OPTIONS: {
  value: SortKey;
  label: string;
  cmp: (a: PositionView, b: PositionView) => number;
}[] = [
  { value: "roe-desc", label: "% PnL ↓", cmp: (a, b) => b.roe - a.roe },
  { value: "roe-asc", label: "% PnL ↑", cmp: (a, b) => a.roe - b.roe },
  {
    value: "pnl-desc",
    label: "PnL ↓",
    cmp: (a, b) => b.unrealizedPnl - a.unrealizedPnl,
  },
  {
    value: "pnl-asc",
    label: "PnL ↑",
    cmp: (a, b) => a.unrealizedPnl - b.unrealizedPnl,
  },
  {
    value: "value-desc",
    label: "Value ↓",
    cmp: (a, b) => b.positionValue - a.positionValue,
  },
  {
    value: "margin-desc",
    label: "Margin ↓",
    cmp: (a, b) => b.marginUsed - a.marginUsed,
  },
  {
    value: "coin-asc",
    label: "Market A–Z",
    cmp: (a, b) => a.coin.localeCompare(b.coin),
  },
];

/**
 * Past this the level isn't a risk to read against, it's parked out of reach —
 * a cross-margin short's liquidation sits thousands of percent away, and the
 * full figure is noise where a "far enough not to matter" would do.
 */
const DISTANCE_CAP = 9.99;

/**
 * How far the mark has to travel to reach a level, on its own line beneath the
 * price and its coverage share. "from mark" is what makes it readable: up to
 * four percentages sit in the TP/SL cell — two coverage shares and two
 * distances — and only the wording says which is which. Renders nothing when
 * the move isn't computable — an unpriced market has no honest distance to
 * show.
 */
function Distance({
  target,
  mark,
  label,
}: {
  target: number | null;
  mark: number | null;
  /** Names the level in the tooltip, e.g. "Liquidation". */
  label: string;
}) {
  const move = distanceFromMark(target, mark);
  if (move == null) return null;
  const far = Math.abs(move) > DISTANCE_CAP;
  const side = move < 0 ? "below" : "above";
  return (
    <span
      className="num block text-[11px] text-ink3"
      title={
        far
          ? `${label} is more than 999% ${side} the mark price — effectively out of reach`
          : `${label} is ${fmtPct(Math.abs(move), { digits: 2 })} ${side} the mark price`
      }
    >
      {far
        ? `${move < 0 ? "<−" : ">+"}999%`
        : fmtPct(move, { signed: true, digits: 1 })}{" "}
      from mark
    </span>
  );
}

/**
 * A position's TP or SL levels, compressed to the next trigger price would
 * reach: a partial order carries how much of the position it closes, the move
 * that reaches it sits underneath, a ladder folds into a `+N`, and the title
 * spells out every rung. An em dash keeps the slot (and its meaning — no exit
 * set) when nothing rests on that side.
 */
function TriggerSummary({
  triggers,
  kind,
  szi,
  markPx,
}: {
  triggers: PositionTriggerView[];
  kind: "tp" | "sl";
  szi: number;
  markPx: number | null;
}) {
  const { fmtSize } = useMoney();
  const own = triggers.filter((t) => t.kind === kind);
  if (own.length === 0) return <span className="text-ink3">—</span>;
  const [next, ...rest] = own;
  const size = Math.abs(szi);
  const coverage = next.sz > 0 && next.sz < size ? next.sz / size : null;
  const title = own
    .map(
      (t) =>
        `${kind === "tp" ? "Take profit" : "Stop loss"} ${
          t.isMarket ? "market" : "limit"
        } @ ${fmtPrice(t.triggerPx)} · ${
          t.sz === 0 || t.sz >= size ? "full position" : fmtSize(t.sz)
        }`,
    )
    .join("\n");
  return (
    // Inline-block, so the table can still sit TP and SL either side of a "/"
    // while each stacks its own distance line, and so a right-aligned card
    // field carries its alignment into both lines. Top-aligned because an
    // inline-block baselines on its *last* line: the "/" would otherwise sit
    // against the distance rather than the price it separates.
    <span
      className={`inline-block align-top ${
        kind === "tp" ? "text-upt" : "text-downt"
      }`}
      title={title}
    >
      {/* Flex so the price and its coverage share can wrap: JSX drops the
        whitespace between them, and without a break opportunity they run past
        a narrow column. */}
      <span className="inline-flex flex-wrap items-baseline gap-x-1">
        <span className="num">{fmtPrice(next.triggerPx)}</span>
        {(coverage != null || rest.length > 0) && (
          <span className="num text-[11px] opacity-75">
            {coverage != null && fmtPct(coverage, { digits: 0 })}
            {coverage != null && rest.length > 0 && " "}
            {rest.length > 0 && `+${rest.length}`}
          </span>
        )}
      </span>
      <Distance
        target={next.triggerPx}
        mark={markPx}
        label={kind === "tp" ? "Take profit" : "Stop loss"}
      />
    </span>
  );
}

function PositionCard({ p }: { p: PositionView }) {
  const { fmtUsd, fmtSize } = useMoney();
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
            {smallCents(fmtUsd(p.positionValue, { compact: true }))}
          </span>
        </CardField>
        <CardField label="Margin" align="right">
          <span className="num">{smallCents(fmtUsd(p.marginUsed))}</span>
        </CardField>
        <CardField label="Entry">
          <span className="num">{fmtPrice(p.entryPx)}</span>
        </CardField>
        <CardField label="Mark" align="right">
          <span className="num">{fmtPrice(p.markPx)}</span>
        </CardField>
        <CardField label="Liq. price">
          <span className="num block text-warn">
            {fmtPrice(p.liquidationPx)}
          </span>
          <Distance
            target={p.liquidationPx}
            mark={p.markPx}
            label="Liquidation"
          />
        </CardField>
        <CardField label="Funding" align="right">
          <Pnl value={p.fundingSinceOpen} className="text-[13px]" />
        </CardField>
        <CardField label="Take profit">
          <TriggerSummary
            triggers={p.triggers}
            kind="tp"
            szi={p.szi}
            markPx={p.markPx}
          />
        </CardField>
        <CardField label="Stop loss" align="right">
          <TriggerSummary
            triggers={p.triggers}
            kind="sl"
            szi={p.szi}
            markPx={p.markPx}
          />
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
  const { fmtUsd, fmtSize } = useMoney();
  const [view, setView] = useViewMode();
  const [coinFilter, setCoinFilter] = useState("all");
  const [marginFilter, setMarginFilter] = useState<MarginFilter>("all");
  const [pnlFilter, setPnlFilter] = useState<PnlFilter>("all");
  const [dirFilter, setDirFilter] = useState<DirFilter>("all");
  const [sort, setSort] = useState<SortKey>("roe-desc");

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

  // Filters narrow the book; the sort orders what survives. Kept as its own
  // pass so changing the sort doesn't re-run the filter predicate, and so the
  // table and card views below both render the one ordered list. Spread first —
  // Array.sort mutates, and `filtered` is a memoized array we must not disturb.
  const sorted = useMemo(() => {
    const cmp = SORT_OPTIONS.find((o) => o.value === sort)?.cmp;
    return cmp ? [...filtered].sort(cmp) : filtered;
  }, [filtered, sort]);

  return (
    <section className="card overflow-hidden">
      {/* Title and totals share a line on desktop and stack on a phone, where
          side by side they used to wrap and strand the refresh mid-row. The
          padding lives on the children rather than this row so the refresh cell
          can span its full height, which is also how the trade section's tab
          bar is built — `pl-1.5` here against `pr-2` there makes the two cells
          the same size. */}
      <div className="flex items-stretch border-b border-edge pr-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1 py-3 pr-2 pl-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <h2 className="text-sm font-semibold">
            Open positions
            <span className="ml-2 text-xs font-normal text-ink3">
              {positions.length}
            </span>
          </h2>
          <p className="num text-xs text-ink2">
            {smallCents(fmtUsd(totalNotional, { compact: true }))} notional ·
            uPnL <Pnl value={totalUpnl} className="text-xs" />
          </p>
        </div>
        <div className="flex shrink-0 items-center self-stretch border-l border-edge pl-1.5">
          <RefreshButton onClick={onRefresh} refreshing={refreshing} />
        </div>
      </div>

      <FilterRow
        view={view}
        onViewChange={setView}
        count={`${filtered.length} of ${positions.length} position${
          positions.length === 1 ? "" : "s"
        }`}
      >
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
        <FilterSelect
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
          label="Sort positions"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </FilterSelect>
      </FilterRow>

      {filtered.length === 0 ? (
        <EmptyState
          title="No positions match these filters"
          hint="Widen a filter to see the rest of the open book."
        />
      ) : view === "cards" ? (
        <CardList minWidth={320}>
          {sorted.map((p) => (
            <PositionCard key={p.coin} p={p} />
          ))}
        </CardList>
      ) : (
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse">
            <thead>
              <tr className="border-b border-edge">
                <Th align="left">Market</Th>
                <Th align="left">Side</Th>
                <Th>Size</Th>
                <Th>Entry</Th>
                <Th>Mark</Th>
                <Th>Liq. price</Th>
                <Th>TP / SL</Th>
                <Th>Margin</Th>
                <Th>Funding</Th>
                <Th>Unrealized PnL</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
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
                      {smallCents(fmtUsd(p.positionValue, { compact: true }))}
                    </span>
                  </Td>
                  <Td className="num">{fmtPrice(p.entryPx)}</Td>
                  <Td className="num">{fmtPrice(p.markPx)}</Td>
                  <Td className="num text-warn">
                    <span className="block">{fmtPrice(p.liquidationPx)}</span>
                    <Distance
                      target={p.liquidationPx}
                      mark={p.markPx}
                      label="Liquidation"
                    />
                  </Td>
                  <Td>
                    <TriggerSummary
                      triggers={p.triggers}
                      kind="tp"
                      szi={p.szi}
                      markPx={p.markPx}
                    />
                    <span className="text-ink3"> / </span>
                    <TriggerSummary
                      triggers={p.triggers}
                      kind="sl"
                      szi={p.szi}
                      markPx={p.markPx}
                    />
                  </Td>
                  <Td className="num">{smallCents(fmtUsd(p.marginUsed))}</Td>
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
