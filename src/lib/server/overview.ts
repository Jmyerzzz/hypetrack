import type {
  OrderView,
  OverviewPayload,
  PeriodKey,
  PnlSummaryEntry,
  PortfolioSeries,
  PositionView,
} from "../api-types";
import {
  fetchClearinghouseState,
  fetchOpenOrders,
  fetchPortfolio,
} from "../hyperliquid/client";
import type { HlOpenOrder, HlPortfolio } from "../hyperliquid/types";
import { isSpotCoin } from "../trades";

const num = (s: string | number | null | undefined): number => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};

/**
 * The tracker is scoped to the perp trading account, so the perp-only
 * portfolio series are exposed under the plain period keys.
 */
const PERP_PERIODS: Record<PeriodKey, string> = {
  day: "perpDay",
  week: "perpWeek",
  month: "perpMonth",
  allTime: "perpAllTime",
};

function toSeries(portfolio: HlPortfolio): Record<string, PortfolioSeries> {
  const raw = new Map(portfolio);
  const out: Record<string, PortfolioSeries> = {};
  for (const [period, source] of Object.entries(PERP_PERIODS)) {
    const data = raw.get(source as HlPortfolio[number][0]);
    if (!data) continue;
    out[period] = {
      accountValue: data.accountValueHistory.map(([t, v]) => ({
        t,
        v: num(v),
      })),
      pnl: data.pnlHistory.map(([t, v]) => ({ t, v: num(v) })),
      volume: num(data.vlm),
    };
  }
  return out;
}

function summarizePnl(
  series: Record<string, PortfolioSeries>,
): PnlSummaryEntry[] {
  const periods: PeriodKey[] = ["day", "week", "month", "allTime"];
  return periods.map((period) => {
    const s = series[period];
    if (!s || s.pnl.length === 0) return { period, pnl: 0, pct: null };
    const pnl = s.pnl[s.pnl.length - 1].v - s.pnl[0].v;

    let pct: number | null = null;
    if (period === "allTime") {
      // accountValue(t) = net transfers in(t) + pnl(t), so (av − pnl) peaks at
      // the most capital ever deployed — a withdrawal-robust ROI denominator.
      let peakCapital = 0;
      const n = Math.min(s.accountValue.length, s.pnl.length);
      for (let i = 0; i < n; i++) {
        peakCapital = Math.max(peakCapital, s.accountValue[i].v - s.pnl[i].v);
      }
      if (peakCapital > 1) pct = pnl / peakCapital;
    } else {
      const start = s.accountValue.find((p) => p.v > 1)?.v ?? 0;
      if (start > 1) pct = pnl / start;
    }
    return { period, pnl, pct };
  });
}

function flattenOrders(orders: HlOpenOrder[]): OrderView[] {
  const out: OrderView[] = [];
  const push = (o: HlOpenOrder): void => {
    if (!isSpotCoin(o.coin)) {
      out.push({
        oid: o.oid,
        coin: o.coin,
        isBuy: o.side === "B",
        limitPx: num(o.limitPx),
        sz: num(o.sz),
        origSz: num(o.origSz),
        orderType: o.orderType,
        tif: o.tif,
        reduceOnly: o.reduceOnly,
        isTrigger: o.isTrigger,
        triggerPx: num(o.triggerPx),
        triggerCondition: o.triggerCondition,
        isPositionTpsl: o.isPositionTpsl,
        timestamp: o.timestamp,
      });
    }
    for (const child of o.children ?? []) push(child);
  };
  for (const o of orders) push(o);
  out.sort((a, b) => b.timestamp - a.timestamp);
  return out;
}

export async function buildOverview(address: string): Promise<OverviewPayload> {
  const [clearinghouse, portfolio, openOrders] = await Promise.all([
    fetchClearinghouseState(address),
    fetchPortfolio(address),
    fetchOpenOrders(address),
  ]);

  const positions: PositionView[] = clearinghouse.assetPositions
    .map(({ position: p }) => {
      const szi = num(p.szi);
      const positionValue = num(p.positionValue);
      return {
        coin: p.coin,
        szi,
        direction: szi >= 0 ? ("long" as const) : ("short" as const),
        entryPx: num(p.entryPx),
        markPx: Math.abs(szi) > 0 ? positionValue / Math.abs(szi) : null,
        positionValue,
        unrealizedPnl: num(p.unrealizedPnl),
        roe: num(p.returnOnEquity),
        liquidationPx: p.liquidationPx == null ? null : num(p.liquidationPx),
        marginUsed: num(p.marginUsed),
        leverage: p.leverage.value,
        leverageType: p.leverage.type,
        maxLeverage: p.maxLeverage,
        // cumFunding is the amount paid by the position; negate → net received.
        fundingSinceOpen: -num(p.cumFunding.sinceOpen),
      };
    })
    .sort((a, b) => b.positionValue - a.positionValue);

  const series = toSeries(portfolio);

  return {
    address,
    fetchedAt: Date.now(),
    perpEquity: num(clearinghouse.marginSummary.accountValue),
    withdrawable: num(clearinghouse.withdrawable),
    marginUsed: num(clearinghouse.marginSummary.totalMarginUsed),
    totalNtlPos: num(clearinghouse.marginSummary.totalNtlPos),
    maintenanceMarginUsed: num(clearinghouse.crossMaintenanceMarginUsed),
    totalUnrealizedPnl: positions.reduce((a, p) => a + p.unrealizedPnl, 0),
    positions,
    openOrders: flattenOrders(openOrders),
    portfolio: series,
    pnlSummary: summarizePnl(series),
    allTimeVolume: series.allTime?.volume ?? 0,
  };
}
