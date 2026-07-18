import type {
  OrderView,
  OverviewPayload,
  PeriodKey,
  PnlSummaryEntry,
  PortfolioSeries,
  PositionView,
} from "../api-types";
import { cache } from "../cache";
import {
  fetchClearinghouseState,
  fetchOpenOrders,
  fetchPortfolio,
  fetchSpotClearinghouseState,
  fetchSpotMetaAndAssetCtxs,
} from "../hyperliquid/client";
import { buildSpotTokenInfo, type SpotTokenInfo } from "../hyperliquid/spot";
import type { HlOpenOrder, HlPortfolio } from "../hyperliquid/types";
import { computeRiskMetrics, returnOnAvgEquity } from "../risk";
import { isSpotCoin } from "../trades";

const num = (s: string | number | null | undefined): number => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};

/** USDC is always spot token 0 and is the perp collateral asset. */
const USDC_TOKEN_INDEX = 0;

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
    const combined = raw.get(period as HlPortfolio[number][0]);
    out[period] = {
      accountValue: data.accountValueHistory.map(([t, v]) => ({
        t,
        v: num(v),
      })),
      pnl: data.pnlHistory.map(([t, v]) => ({ t, v: num(v) })),
      volume: num(data.vlm),
      combinedValue:
        combined?.accountValueHistory.map(([t, v]) => ({ t, v: num(v) })) ?? [],
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
    // % = PnL over the window's time-averaged total equity — see risk.ts
    // for why this beats compounded TWR on sampled series.
    const pct = returnOnAvgEquity(s.combinedValue, s.pnl);
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

async function getSpotTokenInfo(): Promise<SpotTokenInfo> {
  return cache.getOrLoad("spotTokenInfo", 5 * 60_000, async () =>
    buildSpotTokenInfo(await fetchSpotMetaAndAssetCtxs()),
  );
}

export async function buildOverview(address: string): Promise<OverviewPayload> {
  const [clearinghouse, portfolio, openOrders, spotState, spotTokens] =
    await Promise.all([
      fetchClearinghouseState(address),
      fetchPortfolio(address),
      fetchOpenOrders(address),
      fetchSpotClearinghouseState(address),
      getSpotTokenInfo(),
    ]);

  const rawSpotBalances = spotState.balances.map((b) => {
    const total = num(b.total);
    const token = spotTokens[b.token];
    const price = b.token === USDC_TOKEN_INDEX ? 1 : (token?.price ?? null);
    return {
      token: b.token,
      coin: token?.name ?? b.coin,
      total,
      usdValue: price != null ? total * price : null,
    };
  });
  const rawSpotValue = rawSpotBalances.reduce(
    (a, b) => a + (b.usdValue ?? 0),
    0,
  );

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

  const perpEquity = num(clearinghouse.marginSummary.accountValue);

  // On current Hyperliquid accounts the spot USDC balance already contains
  // the USDC committed to perps (marked to perp equity), so summing perp +
  // spot double-counts. Calibrate against Hyperliquid's own combined
  // account-value series: if (perp + spot) overshoots it by ≈ perpEquity,
  // the spot value is perp-inclusive and IS the total equity.
  const combinedHist = new Map(portfolio).get("day")?.accountValueHistory ?? [];
  const hlCombined = combinedHist.length
    ? num(combinedHist[combinedHist.length - 1][1])
    : 0;
  const naiveSum = perpEquity + rawSpotValue;
  let totalEquity = naiveSum;
  let spotIncludesPerpCollateral = false;
  if (hlCombined > 0) {
    const overlap = naiveSum - hlCombined;
    if (Math.abs(overlap - perpEquity) < Math.abs(overlap)) {
      totalEquity = rawSpotValue;
      spotIncludesPerpCollateral = true;
    }
  }

  // When the spot USDC balance carries the collateral posted to perps, net it
  // out of the displayed USDC row too — otherwise the listed balances can't
  // reconcile with the reported spot value.
  const spotBalances = rawSpotBalances
    .map((b) =>
      spotIncludesPerpCollateral && b.token === USDC_TOKEN_INDEX
        ? {
            ...b,
            total: Math.max(0, b.total - perpEquity),
            usdValue: Math.max(0, (b.usdValue ?? 0) - perpEquity),
          }
        : b,
    )
    .filter((b) => b.total > 0)
    .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0))
    .map(({ token: _token, ...view }) => view);

  return {
    address,
    fetchedAt: Date.now(),
    perpEquity,
    // Spot value excluding USDC committed to perps, so perp + spot = total.
    spotValue: totalEquity - perpEquity,
    totalEquity,
    spotBalances: spotBalances.slice(0, 6),
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
    risk: computeRiskMetrics(series.month, series.allTime),
  };
}
