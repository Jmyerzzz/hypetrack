"use client";

import { Fragment, useMemo, useState } from "react";
import {
  CoinTag,
  DirectionBadge,
  EmptyState,
  ExplorerLink,
  Pnl,
  ResultBadge,
  Td,
  Th,
} from "@/components/ui";
import {
  fmtDuration,
  fmtPrice,
  fmtSize,
  fmtTime,
  fmtUsd,
  fmtUsdSigned,
} from "@/lib/format";
import type { Trade } from "@/lib/trades";

type ResultFilter = "all" | "wins" | "losses" | "open" | "liquidated";
type DirFilter = "all" | "long" | "short";

const PAGE = 30;

function TradeDetail({ trade }: { trade: Trade }) {
  return (
    <div className="sticky left-0 max-w-[calc(100vw-2.5rem)] space-y-3 bg-inset px-4 py-4">
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
          <span className="text-ink3">Net = gross − fees + funding</span>
          <span className="num block text-right text-ink sm:text-left">
            {fmtUsdSigned(trade.grossPnl)} − {fmtUsd(trade.fees)}{" "}
            {trade.funding >= 0 ? "+" : "−"} {fmtUsd(Math.abs(trade.funding))}
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
                      s.action === "open" ? "text-accent2" : "text-ink2"
                    }`}
                  >
                    {s.action === "open" ? "Open / add" : "Close / reduce"}
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

export function TradesTable({
  trades,
  tradesTotal,
}: {
  trades: Trade[];
  tradesTotal: number;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [coinFilter, setCoinFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [dirFilter, setDirFilter] = useState<DirFilter>("all");
  const [visible, setVisible] = useState(PAGE);

  const coins = useMemo(
    () =>
      [...new Set(trades.map((t) => t.coin))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [trades],
  );

  const filtered = useMemo(
    () =>
      trades.filter((t) => {
        if (coinFilter !== "all" && t.coin !== coinFilter) return false;
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
    [trades, coinFilter, resultFilter, dirFilter],
  );

  const shown = filtered.slice(0, visible);
  const selectClass =
    "rounded-lg border border-edge bg-inset px-3 py-2 text-base text-ink2 focus:border-accent/60 focus:outline-none sm:px-2.5 sm:py-1.5 sm:text-xs";

  if (trades.length === 0) {
    return (
      <EmptyState
        title="No perp trades in the loaded window"
        hint="Once this address trades perps on Hyperliquid, reconstructed positions will appear here."
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-edge px-4 py-3">
        <select
          value={coinFilter}
          onChange={(e) => {
            setCoinFilter(e.target.value);
            setVisible(PAGE);
          }}
          className={selectClass}
          aria-label="Filter by market"
        >
          <option value="all">All markets</option>
          {coins.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={resultFilter}
          onChange={(e) => {
            setResultFilter(e.target.value as ResultFilter);
            setVisible(PAGE);
          }}
          className={selectClass}
          aria-label="Filter by result"
        >
          <option value="all">All results</option>
          <option value="wins">Wins</option>
          <option value="losses">Losses</option>
          <option value="open">Open</option>
          <option value="liquidated">Liquidated</option>
        </select>
        <select
          value={dirFilter}
          onChange={(e) => {
            setDirFilter(e.target.value as DirFilter);
            setVisible(PAGE);
          }}
          className={selectClass}
          aria-label="Filter by direction"
        >
          <option value="all">Long &amp; short</option>
          <option value="long">Long</option>
          <option value="short">Short</option>
        </select>
        <span className="ml-auto text-xs text-ink3">
          {filtered.length} of {tradesTotal} trades
        </span>
      </div>

      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse">
          <thead>
            <tr className="border-b border-edge">
              <Th align="left" className="w-8" />
              <Th align="left">Market</Th>
              <Th align="left">Side</Th>
              <Th align="left">Result</Th>
              <Th>Net PnL</Th>
              <Th>Entry (avg)</Th>
              <Th>Exit (avg)</Th>
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
              return (
                <Fragment key={t.id}>
                  <tr
                    onClick={() => setExpanded(isOpen ? null : t.id)}
                    className={`cursor-pointer border-b border-edge transition-colors ${
                      isOpen ? "bg-panel2/60" : "hover:bg-panel2/40"
                    }`}
                  >
                    <Td align="left">
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className={`size-3.5 text-ink3 transition-transform ${isOpen ? "rotate-90" : ""}`}
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
                    </Td>
                    <Td align="left">
                      <CoinTag
                        coin={t.coin}
                        sub={t.truncated ? "partial history" : null}
                      />
                    </Td>
                    <Td align="left">
                      <DirectionBadge direction={t.direction} />
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
                    <Td className="num">{fmtPrice(t.avgEntryPx)}</Td>
                    <Td className="num">{fmtPrice(t.avgExitPx)}</Td>
                    <Td>
                      <span className="num block">{fmtSize(t.maxSize)}</span>
                      {t.avgEntryPx != null && (
                        <span className="num block text-[11px] text-ink3">
                          {fmtUsd(t.maxSize * t.avgEntryPx, { compact: true })}
                        </span>
                      )}
                    </Td>
                    <Td className="num text-ink2">{fmtUsd(t.fees)}</Td>
                    <Td>
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
                    </Td>
                    <Td className="num text-ink2">
                      {t.truncated ? "—" : fmtTime(t.openedAt)}
                    </Td>
                    <Td className="num text-ink2">
                      {t.status === "open" ? "open" : fmtDuration(t.durationMs)}
                    </Td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-edge">
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
