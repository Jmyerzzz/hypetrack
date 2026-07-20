"use client";

import { Fragment, useMemo, useState } from "react";
import {
  CardField,
  CardList,
  DataCard,
  DirectionBadge,
  EmptyState,
  ExplorerLink,
  FilterSelect,
  MarketTag,
  Pnl,
  ResultBadge,
  SideBadge,
  Td,
  Th,
  ViewToggle,
} from "@/components/ui";
import type { OutcomeMarketMap, OutcomeMarketView } from "@/lib/api-types";
import {
  fmtDuration,
  fmtNetPnlBreakdown,
  fmtPct,
  fmtPrice,
  fmtSize,
  fmtTime,
  fmtUsd,
  fmtUsdSigned,
} from "@/lib/format";
import { useViewMode } from "@/lib/hooks";
import type { SliceAction, Trade } from "@/lib/trades";

type ResultFilter = "all" | "wins" | "losses" | "open" | "liquidated";
type DirFilter = "all" | "long" | "short";
type KindFilter = "all" | "perp" | "outcome";

const PAGE = 30;

/** Position moves that aren't trades; see {@link SliceAction}. */
const SPECIAL_SLICE_LABELS: Record<SliceAction, string> = {
  settlement: "Settled",
  split: "Minted set",
  merge: "Burned set",
};

/**
 * An outcome contract trades between $0 and $1, so its price is the market's
 * implied probability and reads better as one.
 */
const fmtTradePx = (px: number | null, kind: Trade["kind"]): string =>
  kind === "outcome" ? fmtPct(px, { digits: 1 }) : fmtPrice(px);

function TradeDetail({
  trade,
  inCard = false,
}: {
  trade: Trade;
  inCard?: boolean;
}) {
  return (
    <div
      className={
        inCard
          ? "space-y-3 pt-3"
          : // In the table the panel spans a 1080px row inside a horizontal
            // scroller, so pin it to the viewport to keep it readable.
            "sticky left-0 max-w-[calc(100vw-2.5rem)] space-y-3 bg-inset px-4 py-4"
      }
    >
      <div className="grid gap-x-8 gap-y-2 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
        <p className="flex justify-between gap-4 sm:block">
          <span className="text-ink3">Opened</span>
          <span className="num block text-ink">
            {trade.truncated
              ? "before data window"
              : fmtTime(trade.openedAt, { withYear: true })}
          </span>
        </p>
        <p className="flex justify-between gap-4 sm:block">
          <span className="text-ink3">Closed</span>
          <span className="num block text-ink">
            {trade.closedAt
              ? fmtTime(trade.closedAt, { withYear: true })
              : "still open"}
          </span>
        </p>
        <p className="flex justify-between gap-4 sm:block">
          <span className="text-ink3">Gross PnL (price only)</span>
          <Pnl value={trade.grossPnl} className="block text-[12px]" />
        </p>
        <p className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 sm:block">
          {/* Outcome markets never pay funding, so the term is dropped. */}
          <span className="text-ink3">
            {trade.kind === "outcome"
              ? "Net = gross − fees"
              : "Net = gross − fees + funding"}
          </span>
          <span className="num block text-right text-ink sm:text-left">
            {trade.kind === "outcome"
              ? `${fmtUsdSigned(trade.grossPnl)} ${trade.fees >= 0 ? "−" : "+"} ${fmtUsd(Math.abs(trade.fees))}`
              : fmtNetPnlBreakdown(trade.grossPnl, trade.fees, trade.funding)}
          </span>
        </p>
        <p
          className="flex justify-between gap-4 sm:block"
          title="Maximum favorable excursion: the best unrealized move while the trade was open (from candles + fills)"
        >
          <span className="text-ink3">MFE (best point)</span>
          <span className="num block">
            {trade.excursion ? (
              <span className="text-upt">
                +{fmtPct(trade.excursion.mfePct, { digits: 2 })} ·{" "}
                {fmtUsd(trade.excursion.mfeUsd, { compact: true })}
              </span>
            ) : (
              <span className="text-ink3">—</span>
            )}
          </span>
        </p>
        <p
          className="flex justify-between gap-4 sm:block"
          title="Maximum adverse excursion: the worst unrealized move while the trade was open (from candles + fills)"
        >
          <span className="text-ink3">MAE (worst point)</span>
          <span className="num block">
            {trade.excursion ? (
              <span className="text-downt">
                −{fmtPct(trade.excursion.maePct, { digits: 2 })} ·{" "}
                {fmtUsd(trade.excursion.maeUsd, { compact: true })}
              </span>
            ) : (
              <span className="text-ink3">—</span>
            )}
          </span>
        </p>
      </div>
      {!trade.fundingCovered && (
        <p className="text-[11px] text-warn">
          Funding shown is partial — the funding history window doesn’t cover
          this trade’s full lifetime.
        </p>
      )}
      <div className="scroll-thin overflow-x-auto rounded-lg border border-edge">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-edge bg-panel">
              <Th align="left">Fill time</Th>
              <Th align="left">Action</Th>
              <Th>Price</Th>
              <Th>Size</Th>
              <Th>Fee</Th>
              <Th>Realized PnL</Th>
              <Th>Tx</Th>
            </tr>
          </thead>
          <tbody>
            {trade.slices.map((s) => (
              <tr
                key={`${s.tid}:${s.action}`}
                className="border-b border-edge bg-panel/40 last:border-0"
              >
                <Td align="left" className="num text-ink2">
                  {fmtTime(s.time)}
                </Td>
                <Td align="left">
                  <span
                    className={`text-[11px] font-semibold tracking-wide uppercase ${
                      s.special
                        ? "text-warn"
                        : s.action === "open"
                          ? "text-accent2"
                          : "text-ink2"
                    }`}
                  >
                    {s.special
                      ? SPECIAL_SLICE_LABELS[s.special]
                      : s.action === "open"
                        ? "Open / add"
                        : "Close / reduce"}
                  </span>
                  {s.twap && (
                    <span className="ml-1.5 text-[10px] text-ink3">TWAP</span>
                  )}
                  {s.liquidation && (
                    <span className="ml-1.5 text-[10px] font-semibold text-warn">
                      LIQ
                    </span>
                  )}
                </Td>
                <Td className="num">{fmtPrice(s.px)}</Td>
                <Td className="num">{fmtSize(s.sz)}</Td>
                <Td className="num text-ink2">{fmtUsd(s.fee)}</Td>
                <Td>
                  {s.action === "close" ? (
                    <Pnl value={s.closedPnl} className="text-[13px]" />
                  ) : (
                    <span className="text-ink3">—</span>
                  )}
                </Td>
                <Td className="num text-[12px]">
                  <ExplorerLink hash={s.hash} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {trade.slicesOmitted != null && trade.slicesOmitted > 0 && (
        <p className="text-[11px] text-ink3">
          {trade.slicesOmitted} middle fills omitted for size — totals above
          include them.
        </p>
      )}
    </div>
  );
}

/** Card counterpart of a trade row: PnL leads, supporting fields below. */
function TradeCard({
  trade,
  market,
  isOpen,
  onToggle,
}: {
  trade: Trade;
  market: OutcomeMarketView | undefined;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    // Expanded cards take the whole row so the fill table has room to breathe.
    <DataCard active={isOpen} span={isOpen}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`trade-card-detail-${trade.id}`}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <span className="flex min-w-0 flex-col gap-1.5">
          <MarketTag
            coin={trade.coin}
            market={market}
            sub={trade.truncated ? "partial history" : null}
          />
          <span className="flex flex-wrap items-center gap-1.5">
            {market ? (
              <SideBadge market={market} />
            ) : (
              <DirectionBadge direction={trade.direction} />
            )}
            <ResultBadge
              isWin={trade.isWin}
              status={trade.status}
              liquidated={trade.liquidated}
            />
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <Pnl
            value={trade.netPnl}
            pct={trade.netPnlPct}
            className="text-[15px] font-semibold"
          />
          {trade.status === "open" && (
            <span className="text-[10px] text-ink3">realized so far</span>
          )}
          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-ink3">
            {isOpen ? "Hide fills" : "Show fills"}
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className={`size-3 transition-transform ${isOpen ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path
                d="m9 6 6 6-6 6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </span>
      </button>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-edge pt-3">
        <CardField
          label={trade.kind === "outcome" ? "Entry odds" : "Entry (avg)"}
        >
          <span className="num">
            {fmtTradePx(trade.avgEntryPx, trade.kind)}
          </span>
        </CardField>
        <CardField
          label={trade.kind === "outcome" ? "Exit odds" : "Exit (avg)"}
          align="right"
        >
          <span className="num">{fmtTradePx(trade.avgExitPx, trade.kind)}</span>
        </CardField>
        <CardField label="Max size">
          <span className="num">{fmtSize(trade.maxSize)}</span>
          {trade.avgEntryPx != null && (
            <span className="num ml-1.5 text-[11px] text-ink3">
              {fmtUsd(trade.maxSize * trade.avgEntryPx, { compact: true })}
            </span>
          )}
        </CardField>
        <CardField label="Held" align="right">
          <span className="num">
            {trade.status === "open" ? "open" : fmtDuration(trade.durationMs)}
          </span>
        </CardField>
        <CardField label="Fees">
          <span className="num text-ink2">{fmtUsd(trade.fees)}</span>
        </CardField>
        <CardField label="Funding" align="right">
          {trade.kind === "outcome" ? (
            <span
              className="text-ink3"
              title="Outcome markets are fully collateralized and pay no funding"
            >
              n/a
            </span>
          ) : (
            <>
              <Pnl
                value={trade.funding}
                className="text-[13px]"
                muted={trade.funding === 0}
              />
              {!trade.fundingCovered && (
                <span
                  className="ml-0.5 align-super text-[10px] text-warn"
                  title="Partial funding data"
                >
                  *
                </span>
              )}
            </>
          )}
        </CardField>
        <CardField label="Opened">
          <span className="num text-ink2">
            {trade.truncated ? "—" : fmtTime(trade.openedAt)}
          </span>
        </CardField>
        {trade.excursion && (
          <CardField label="MFE / MAE" align="right">
            <span className="num text-upt">
              +{fmtPct(trade.excursion.mfePct, { digits: 1 })}
            </span>
            <span className="mx-1 text-ink3">/</span>
            <span className="num text-downt">
              −{fmtPct(trade.excursion.maePct, { digits: 1 })}
            </span>
          </CardField>
        )}
      </div>

      {isOpen && (
        <div
          id={`trade-card-detail-${trade.id}`}
          className="mt-3 border-t border-edge"
        >
          <TradeDetail trade={trade} inCard />
        </div>
      )}
    </DataCard>
  );
}

export function TradesTable({
  trades,
  tradesTotal,
  markets,
}: {
  trades: Trade[];
  tradesTotal: number;
  markets: OutcomeMarketMap;
}) {
  const [view, setView] = useViewMode();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [coinFilter, setCoinFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [dirFilter, setDirFilter] = useState<DirFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [visible, setVisible] = useState(PAGE);

  // Outcome markets get their real name in the picker; a bare "#8560" is
  // unrecognizable, and several sides of one question would look identical.
  const coins = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of trades) {
      if (seen.has(t.coin)) continue;
      const market = markets[t.coin];
      seen.set(
        t.coin,
        market ? `${market.title} · ${market.sideName}` : t.coin,
      );
    }
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [trades, markets]);

  const hasOutcome = useMemo(
    () => trades.some((t) => t.kind === "outcome"),
    [trades],
  );

  const filtered = useMemo(
    () =>
      trades.filter((t) => {
        if (coinFilter !== "all" && t.coin !== coinFilter) return false;
        if (kindFilter !== "all" && t.kind !== kindFilter) return false;
        if (dirFilter !== "all" && t.direction !== dirFilter) return false;
        switch (resultFilter) {
          case "wins":
            return t.isWin === true;
          case "losses":
            return t.isWin === false;
          case "open":
            return t.status === "open";
          case "liquidated":
            return t.liquidated;
          default:
            return true;
        }
      }),
    [trades, coinFilter, resultFilter, dirFilter, kindFilter],
  );

  const shown = filtered.slice(0, visible);
  const toggle = (id: string) =>
    setExpanded((current) => (current === id ? null : id));

  if (trades.length === 0) {
    return (
      <EmptyState
        title="No trades in the loaded window"
        hint="Once this address trades perps or outcome markets on Hyperliquid, reconstructed positions will appear here."
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-edge px-4 py-3">
        <FilterSelect
          value={coinFilter}
          onChange={(v) => {
            setCoinFilter(v);
            setVisible(PAGE);
          }}
          label="Filter by market"
        >
          <option value="all">All markets</option>
          {coins.map(([coin, label]) => (
            <option key={coin} value={coin}>
              {label}
            </option>
          ))}
        </FilterSelect>
        {/* Only worth a control once the account actually has both kinds. */}
        {hasOutcome && (
          <FilterSelect
            value={kindFilter}
            onChange={(v) => {
              setKindFilter(v as KindFilter);
              setVisible(PAGE);
            }}
            label="Filter by market type"
          >
            <option value="all">Perps &amp; outcomes</option>
            <option value="perp">Perps only</option>
            <option value="outcome">Outcome markets</option>
          </FilterSelect>
        )}
        <FilterSelect
          value={resultFilter}
          onChange={(v) => {
            setResultFilter(v as ResultFilter);
            setVisible(PAGE);
          }}
          label="Filter by result"
        >
          <option value="all">All results</option>
          <option value="wins">Wins</option>
          <option value="losses">Losses</option>
          <option value="open">Open</option>
          <option value="liquidated">Liquidated</option>
        </FilterSelect>
        <FilterSelect
          value={dirFilter}
          onChange={(v) => {
            setDirFilter(v as DirFilter);
            setVisible(PAGE);
          }}
          label="Filter by direction"
        >
          <option value="all">Long &amp; short</option>
          <option value="long">Long</option>
          <option value="short">Short</option>
        </FilterSelect>
        <span className="ml-auto text-xs text-ink3">
          {filtered.length} of {tradesTotal} trades
        </span>
        <ViewToggle value={view} onChange={setView} />
      </div>

      {view === "cards" ? (
        <CardList minWidth={340}>
          {shown.map((t) => (
            <TradeCard
              key={t.id}
              trade={t}
              market={markets[t.coin]}
              isOpen={expanded === t.id}
              onToggle={() => toggle(t.id)}
            />
          ))}
        </CardList>
      ) : (
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse">
            <thead>
              <tr className="border-b border-edge">
                <Th align="left" className="w-8" />
                <Th align="left">Market</Th>
                <Th align="left">Side</Th>
                <Th align="left">Result</Th>
                <Th>Net PnL</Th>
                <Th>Entry</Th>
                <Th>Exit</Th>
                <Th>Max size</Th>
                <Th>Fees</Th>
                <Th>Funding</Th>
                <Th>Opened</Th>
                <Th>Held</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => {
                const isOpen = expanded === t.id;
                const market = markets[t.coin];
                return (
                  <Fragment key={t.id}>
                    <tr
                      onClick={() => toggle(t.id)}
                      className={`cursor-pointer border-b border-edge transition-colors ${
                        isOpen ? "bg-panel2/60" : "hover:bg-panel2/40"
                      }`}
                    >
                      <Td align="left">
                        {/* The real control: clicking anywhere on the row also
                          toggles, but this keeps the disclosure reachable by
                          keyboard and announced to screen readers. */}
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={`trade-detail-${t.id}`}
                          aria-label={`${isOpen ? "Hide" : "Show"} fills for ${
                            market
                              ? `${market.title} ${market.sideName}`
                              : `${t.coin} ${t.direction}`
                          } trade`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(t.id);
                          }}
                          className="flex items-center justify-center rounded p-1 text-ink3 transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            className={`size-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <path
                              d="m9 6 6 6-6 6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </Td>
                      <Td align="left">
                        <MarketTag
                          coin={t.coin}
                          market={market}
                          sub={t.truncated ? "partial history" : null}
                        />
                      </Td>
                      <Td align="left">
                        {market ? (
                          <SideBadge market={market} />
                        ) : (
                          <DirectionBadge direction={t.direction} />
                        )}
                      </Td>
                      <Td align="left">
                        <ResultBadge
                          isWin={t.isWin}
                          status={t.status}
                          liquidated={t.liquidated}
                        />
                      </Td>
                      <Td>
                        <Pnl
                          value={t.netPnl}
                          pct={t.netPnlPct}
                          className="text-[13px] font-medium"
                        />
                        {t.status === "open" && (
                          <span className="block text-[10px] text-ink3">
                            realized so far
                          </span>
                        )}
                      </Td>
                      <Td className="num">
                        {fmtTradePx(t.avgEntryPx, t.kind)}
                      </Td>
                      <Td className="num">{fmtTradePx(t.avgExitPx, t.kind)}</Td>
                      <Td>
                        <span className="num block">{fmtSize(t.maxSize)}</span>
                        {t.avgEntryPx != null && (
                          <span className="num block text-[11px] text-ink3">
                            {fmtUsd(t.maxSize * t.avgEntryPx, {
                              compact: true,
                            })}
                          </span>
                        )}
                      </Td>
                      <Td className="num text-ink2">{fmtUsd(t.fees)}</Td>
                      <Td>
                        {t.kind === "outcome" ? (
                          <span
                            className="text-ink3"
                            title="Outcome markets are fully collateralized and pay no funding"
                          >
                            n/a
                          </span>
                        ) : (
                          <>
                            <Pnl
                              value={t.funding}
                              className="text-[13px]"
                              muted={t.funding === 0}
                            />
                            {!t.fundingCovered && (
                              <span
                                className="ml-0.5 align-super text-[10px] text-warn"
                                title="Partial funding data"
                              >
                                *
                              </span>
                            )}
                          </>
                        )}
                      </Td>
                      <Td className="num text-ink2">
                        {t.truncated ? "—" : fmtTime(t.openedAt)}
                      </Td>
                      <Td className="num text-ink2">
                        {t.status === "open"
                          ? "open"
                          : fmtDuration(t.durationMs)}
                      </Td>
                    </tr>
                    {isOpen && (
                      <tr
                        id={`trade-detail-${t.id}`}
                        className="border-b border-edge"
                      >
                        <td colSpan={12} className="p-0">
                          <TradeDetail trade={t} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {visible < filtered.length && (
        <div className="border-t border-edge px-4 py-3 text-center">
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE)}
            className="rounded-lg border border-edge bg-panel2 px-4 py-1.5 text-xs font-medium text-ink2 transition-colors hover:text-ink max-sm:w-full max-sm:py-2.5"
          >
            Show {Math.min(PAGE, filtered.length - visible)} more
          </button>
        </div>
      )}
    </div>
  );
}
