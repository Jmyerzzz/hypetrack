import type { HlFill, HlFundingEvent } from "./hyperliquid/types";

/** Below this absolute size a perp position is considered flat (sizes have ≤6 dp). */
const POSITION_EPS = 1e-9;

export type TradeSlice = {
  /** Hyperliquid trade id of the source fill (flip fills share it across both slices). */
  tid: number;
  time: number;
  px: number;
  /** Absolute size of this slice (a flip fill is split into close + open slices). */
  sz: number;
  action: "open" | "close";
  /** USDC fee attributed to this slice (negative = maker rebate). */
  fee: number;
  /** Realized PnL booked by Hyperliquid on this slice (close slices only, before fees). */
  closedPnl: number;
  hash: string;
  crossed: boolean;
  liquidation: boolean;
  twap: boolean;
};

export type Trade = {
  id: string;
  coin: string;
  direction: "long" | "short";
  status: "open" | "closed";
  /** True when the position was opened before the available fill window. */
  truncated: boolean;
  liquidated: boolean;
  openedAt: number;
  closedAt: number | null;
  durationMs: number | null;
  /** Peak absolute position size over the trade's life. */
  maxSize: number;
  totalOpenedSz: number;
  totalClosedSz: number;
  avgEntryPx: number | null;
  avgExitPx: number | null;
  entryNotional: number;
  exitNotional: number;
  /** Sum of Hyperliquid's closedPnl over close slices (before fees/funding). */
  grossPnl: number;
  /** Total USDC fees across all slices, including builder fees. */
  fees: number;
  /** Net funding attributed to the trade's holding window; positive = received. */
  funding: number;
  /** False when funding data doesn't cover the trade's full window. */
  fundingCovered: boolean;
  /** grossPnl − fees + funding. For open trades: realized-so-far. */
  netPnl: number;
  /** netPnl / entryNotional of the seen opening slices. */
  netPnlPct: number | null;
  /** Only set for closed trades; |netPnl| < $0.01 counts as flat (null). */
  isWin: boolean | null;
  fillCount: number;
  slices: TradeSlice[];
  /** Set when the payload omitted middle slices of a very large trade. */
  slicesOmitted?: number;
};

export function isSpotCoin(coin: string): boolean {
  return coin.startsWith("@") || coin.includes("/");
}

const num = (s: string | undefined | null): number => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};

type MutableTrade = Trade & { seq: number };

function newTrade(
  coin: string,
  direction: "long" | "short",
  openedAt: number,
  seq: number,
  truncated: boolean,
  initialSize: number,
): MutableTrade {
  return {
    id: `${coin}:${openedAt}:${seq}`,
    coin,
    direction,
    status: "open",
    truncated,
    liquidated: false,
    openedAt,
    closedAt: null,
    durationMs: null,
    maxSize: initialSize,
    totalOpenedSz: 0,
    totalClosedSz: 0,
    avgEntryPx: null,
    avgExitPx: null,
    entryNotional: 0,
    exitNotional: 0,
    grossPnl: 0,
    fees: 0,
    funding: 0,
    fundingCovered: true,
    netPnl: 0,
    netPnlPct: null,
    isWin: null,
    fillCount: 0,
    slices: [],
    seq,
  };
}

/**
 * % return on peak position notional (maxSize × avg entry). Using the seen
 * entry notional instead would explode for trades whose opening fills predate
 * the data window.
 */
function pctOfPeakNotional(t: Trade): number | null {
  if (t.avgEntryPx == null || t.maxSize <= POSITION_EPS) return null;
  return t.netPnl / (t.maxSize * t.avgEntryPx);
}

function finalizeAverages(t: MutableTrade): void {
  t.avgEntryPx =
    t.totalOpenedSz > POSITION_EPS ? t.entryNotional / t.totalOpenedSz : null;
  t.avgExitPx =
    t.totalClosedSz > POSITION_EPS ? t.exitNotional / t.totalClosedSz : null;
  t.netPnl = t.grossPnl - t.fees + t.funding;
  t.netPnlPct = pctOfPeakNotional(t);
  if (t.status === "closed") {
    t.isWin = Math.abs(t.netPnl) < 0.01 ? null : t.netPnl > 0;
  }
}

/**
 * Groups perp fills (ascending by time) into position-lifecycle trades:
 * a trade opens when the position leaves zero and closes when it returns to
 * zero. A fill that flips the direction is split into a closing slice and an
 * opening slice of a new trade, with the fee prorated by size.
 *
 * `userAddress` (lowercase) distinguishes being liquidated from being the
 * liquidator counterparty.
 */
export function groupTrades(fills: HlFill[], userAddress?: string): Trade[] {
  const byCoin = new Map<string, HlFill[]>();
  for (const fill of fills) {
    if (isSpotCoin(fill.coin)) continue;
    const list = byCoin.get(fill.coin);
    if (list) list.push(fill);
    else byCoin.set(fill.coin, [fill]);
  }

  const trades: MutableTrade[] = [];
  let seq = 0;

  for (const [coin, coinFills] of byCoin) {
    coinFills.sort((a, b) => a.time - b.time || a.tid - b.tid);
    let cur: MutableTrade | null = null;

    const applySlice = (
      trade: MutableTrade,
      fill: HlFill,
      action: "open" | "close",
      sz: number,
      fee: number,
      closedPnl: number,
      isLiquidation: boolean,
    ): void => {
      const px = num(fill.px);
      trade.slices.push({
        tid: fill.tid,
        time: fill.time,
        px,
        sz,
        action,
        fee,
        closedPnl,
        hash: fill.hash,
        crossed: fill.crossed,
        liquidation: isLiquidation,
        twap: fill.twapId != null,
      });
      trade.fillCount++;
      trade.fees += fee;
      if (action === "open") {
        trade.totalOpenedSz += sz;
        trade.entryNotional += px * sz;
      } else {
        trade.totalClosedSz += sz;
        trade.exitNotional += px * sz;
        trade.grossPnl += closedPnl;
        if (isLiquidation) trade.liquidated = true;
      }
    };

    const closeOut = (trade: MutableTrade, time: number): void => {
      trade.status = "closed";
      trade.closedAt = time;
      trade.durationMs = time - trade.openedAt;
      finalizeAverages(trade);
      cur = null;
    };

    for (const fill of coinFills) {
      const sz = num(fill.sz);
      if (sz <= 0) continue;
      const p0 = num(fill.startPosition);
      const signedSz = fill.side === "B" ? sz : -sz;
      const p1 = p0 + signedSz;
      const totalFee =
        num(fill.fee) * (fill.feeToken === "USDC" ? 1 : 0) +
        num(fill.builderFee);
      const closedPnl = num(fill.closedPnl);
      const isLiq =
        fill.liquidation != null &&
        (!fill.liquidation.liquidatedUser ||
          !userAddress ||
          fill.liquidation.liquidatedUser.toLowerCase() === userAddress);

      // The window can start mid-trade: synthesize a truncated open trade.
      if (!cur && Math.abs(p0) > POSITION_EPS) {
        cur = newTrade(
          coin,
          p0 > 0 ? "long" : "short",
          fill.time,
          seq++,
          true,
          Math.abs(p0),
        );
        trades.push(cur);
      }

      const flips =
        Math.abs(p0) > POSITION_EPS &&
        Math.abs(p1) > POSITION_EPS &&
        p0 * p1 < 0;

      if (flips && cur) {
        // Split: close |p0| of the old trade, open |p1| of a new one.
        const closeSz = Math.abs(p0);
        const openSz = Math.abs(p1);
        const closeFee = totalFee * (closeSz / sz);
        applySlice(cur, fill, "close", closeSz, closeFee, closedPnl, isLiq);
        closeOut(cur, fill.time);
        cur = newTrade(
          coin,
          p1 > 0 ? "long" : "short",
          fill.time,
          seq++,
          false,
          Math.abs(p1),
        );
        trades.push(cur);
        applySlice(cur, fill, "open", openSz, totalFee - closeFee, 0, false);
        continue;
      }

      const opening = Math.abs(p1) > Math.abs(p0) + POSITION_EPS;
      if (opening) {
        if (!cur) {
          cur = newTrade(
            coin,
            p1 > 0 ? "long" : "short",
            fill.time,
            seq++,
            false,
            0,
          );
          trades.push(cur);
        }
        applySlice(cur, fill, "open", sz, totalFee, 0, false);
      } else {
        if (!cur) continue; // reduce with no known position; nothing to attribute
        applySlice(cur, fill, "close", sz, totalFee, closedPnl, isLiq);
      }

      if (cur) {
        cur.maxSize = Math.max(cur.maxSize, Math.abs(p1));
        if (Math.abs(p1) < POSITION_EPS) closeOut(cur, fill.time);
      }
    }

    if (cur !== null) finalizeAverages(cur);
  }

  // Most recent activity first: open trades by last slice, closed by close time.
  const lastActivity = (t: Trade): number =>
    t.closedAt ?? t.slices[t.slices.length - 1]?.time ?? t.openedAt;
  trades.sort((a, b) => lastActivity(b) - lastActivity(a));
  return trades.map(({ seq: _seq, ...t }) => t);
}

export type FundingAttribution = {
  /** Earliest timestamp covered by the funding dataset (fetch start). */
  coverageStart: number;
  /** Latest covered timestamp; +Infinity when the fetch reached the present. */
  coverageEnd: number;
  events: HlFundingEvent[];
};

/**
 * Attributes funding events to trades of the same coin whose holding window
 * contains the event. Mutates `funding`, `fundingCovered`, and re-derives
 * net PnL fields.
 */
export function attributeFunding(
  trades: Trade[],
  attribution: FundingAttribution,
): void {
  const byCoin = new Map<string, HlFundingEvent[]>();
  for (const event of attribution.events) {
    const list = byCoin.get(event.delta.coin);
    if (list) list.push(event);
    else byCoin.set(event.delta.coin, [event]);
  }
  for (const events of byCoin.values()) events.sort((a, b) => a.time - b.time);

  for (const trade of trades) {
    const events = byCoin.get(trade.coin);
    trade.funding = 0;
    const tradeEnd = trade.closedAt ?? Number.POSITIVE_INFINITY;
    trade.fundingCovered =
      !trade.truncated &&
      trade.openedAt >= attribution.coverageStart &&
      tradeEnd <= attribution.coverageEnd;
    if (events) {
      const end = trade.closedAt ?? Number.POSITIVE_INFINITY;
      for (const event of events) {
        if (event.time < trade.openedAt) continue;
        if (event.time > end) break;
        trade.funding += num(event.delta.usdc);
      }
    }
    trade.netPnl = trade.grossPnl - trade.fees + trade.funding;
    trade.netPnlPct = pctOfPeakNotional(trade);
    if (trade.status === "closed") {
      trade.isWin = Math.abs(trade.netPnl) < 0.01 ? null : trade.netPnl > 0;
    }
  }
}
