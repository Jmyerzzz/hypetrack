import type {
  OrderView,
  OverviewPayload,
  PeriodKey,
  PnlSummaryEntry,
  PortfolioSeries,
  PositionView,
  SpotBalanceView,
} from "../api-types";
import { cache } from "../cache";
import {
  fetchClearinghouseState,
  fetchOpenOrders,
  fetchPortfolio,
  fetchSpotClearinghouseState,
  fetchSpotMetaAndAssetCtxs,
} from "../hyperliquid/client";
import { buildSpotMaps, displayCoin, type SpotMaps } from "../hyperliquid/spot";
import type { HlOpenOrder, HlPortfolio } from "../hyperliquid/types";

const num = (s: string | number | null | undefined): number => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};

async function getSpotMaps(): Promise<SpotMaps> {
  return cache.getOrLoad("spotMeta", 5 * 60_000, async () =>
    buildSpotMaps(await fetchSpotMetaAndAssetCtxs()),
  );
}

function toSeries(portfolio: HlPortfolio): Record<string, PortfolioSeries> {
  const out: Record<string, PortfolioSeries> = {};
  for (const [period, data] of portfolio) {
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
      // accountValue(t) = net deposits(t) + pnl(t), so (av − pnl) peaks at the
      // most capital ever deployed — a withdrawal-robust ROI denominator.
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

function flattenOrders(orders: HlOpenOrder[], maps: SpotMaps): OrderView[] {
  const out: OrderView[] = [];
  const push = (o: HlOpenOrder): void => {
    out.push({
      oid: o.oid,
      coin: displayCoin(o.coin, maps),
      rawCoin: o.coin,
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
    for (const child of o.children ?? []) push(child);
  };
  for (const o of orders) push(o);
  out.sort((a, b) => b.timestamp - a.timestamp);
  return out;
}

export async function buildOverview(address: string): Promise<OverviewPayload> {
  const [clearinghouse, spotState, portfolio, openOrders, spotMaps] =
    await Promise.all([
      fetchClearinghouseState(address),
      fetchSpotClearinghouseState(address),
      fetchPortfolio(address),
      fetchOpenOrders(address),
      getSpotMaps(),
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

  const spotBalances: SpotBalanceView[] = spotState.balances
    .map((b) => {
      const total = num(b.total);
      const token = spotMaps.tokens[b.token];
      const price = b.token === 0 ? 1 : (token?.price ?? null);
      const usdValue = price != null ? total * price : null;
      const entryNtl = num(b.entryNtl);
      return {
        token: b.token,
        coin: token?.name ?? b.coin,
        total,
        hold: num(b.hold),
        price,
        usdValue,
        entryNtl,
        unrealizedPnl:
          usdValue != null && entryNtl > 0 && b.token !== 0
            ? usdValue - entryNtl
            : null,
      };
    })
    .filter((b) => b.total > 0)
    .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));

  const series = toSeries(portfolio);
  const perpEquity = num(clearinghouse.marginSummary.accountValue);
  const spotValue = spotBalances.reduce((a, b) => a + (b.usdValue ?? 0), 0);

  return {
    address,
    fetchedAt: Date.now(),
    perpEquity,
    spotValue,
    totalEquity: perpEquity + spotValue,
    withdrawable: num(clearinghouse.withdrawable),
    marginUsed: num(clearinghouse.marginSummary.totalMarginUsed),
    totalNtlPos: num(clearinghouse.marginSummary.totalNtlPos),
    maintenanceMarginUsed: num(clearinghouse.crossMaintenanceMarginUsed),
    positions,
    spotBalances,
    openOrders: flattenOrders(openOrders, spotMaps),
    portfolio: series,
    pnlSummary: summarizePnl(series),
    allTimeVolume: series.allTime?.volume ?? 0,
    spotPairNames: spotMaps.pairDisplay,
  };
}
