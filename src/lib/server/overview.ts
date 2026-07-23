import type {
  OrderView,
  OutcomePositionView,
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
import { reconcileEquity } from "../hyperliquid/equity";
import {
  describeOutcomeCoins,
  isOutcomeCoin,
  toMarketCoin,
} from "../hyperliquid/outcome";
import { buildSpotTokenInfo, type SpotTokenInfo } from "../hyperliquid/spot";
import type {
  HlAllMids,
  HlAssetPosition,
  HlClearinghouseState,
  HlOpenOrder,
  HlPortfolio,
  HlSpotBalance,
} from "../hyperliquid/types";
import { computeRiskMetrics, returnOnAvgEquity } from "../risk";
import { isSpotCoin } from "../trades";
import { getAllMids, getBuilderDexNames, getOutcomeIndex } from "./markets";

const num = (s: string | number | null | undefined): number => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};

/** One perp position (main or builder DEX) to its view; builder coins arrive
 *  already namespaced (`xyz:SKHX`), which the coin tag renders on its own. */
function toPositionView(p: HlAssetPosition["position"]): PositionView {
  const szi = num(p.szi);
  const positionValue = num(p.positionValue);
  return {
    coin: p.coin,
    szi,
    direction: szi >= 0 ? "long" : "short",
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
}

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
      combinedPnl:
        combined?.pnlHistory.map(([t, v]) => ({ t, v: num(v) })) ?? [],
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
    // Combined (perp + spot + vaults) PnL, to match Hyperliquid's portfolio
    // page and the combined Total Equity shown alongside these figures. Falls
    // back to perp-only if the combined series is unavailable.
    const cum = s?.combinedPnl.length ? s.combinedPnl : s?.pnl;
    if (!s || !cum || cum.length === 0) return { period, pnl: 0, pct: null };
    const pnl = cum[cum.length - 1].v - cum[0].v;
    // % = PnL over the window's time-averaged total equity — see risk.ts
    // for why this beats compounded TWR on sampled series.
    const pct = returnOnAvgEquity(s.combinedValue, cum);
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

/**
 * Open outcome-market positions, priced off the live book. Balances are plain
 * token holdings — always long, and worth $1 each if the side wins.
 */
function toOutcomePositions(
  balances: HlSpotBalance[],
  mids: HlAllMids,
): OutcomePositionView[] {
  const positions: OutcomePositionView[] = [];
  for (const balance of balances) {
    const size = num(balance.total);
    if (size <= 0) continue;
    const coin = toMarketCoin(balance.coin);
    const mid = Number(mids[coin]);
    const markPx = Number.isFinite(mid) ? mid : null;
    const entryNotional = num(balance.entryNtl);
    const positionValue = markPx == null ? null : size * markPx;
    const unrealizedPnl =
      positionValue == null ? null : positionValue - entryNotional;
    positions.push({
      coin,
      size,
      hold: num(balance.hold),
      entryNotional,
      avgEntryPx: entryNotional / size,
      markPx,
      positionValue,
      unrealizedPnl,
      roe:
        unrealizedPnl != null && entryNotional > 0
          ? unrealizedPnl / entryNotional
          : null,
      // Each winning side token redeems for exactly $1 at settlement.
      payoutIfWon: size,
    });
  }
  return positions.sort(
    (a, b) => (b.positionValue ?? 0) - (a.positionValue ?? 0),
  );
}

export async function buildOverview(address: string): Promise<OverviewPayload> {
  // HIP-3 builder perps live in their own clearinghouses. Enumerate the DEXs
  // (cached, usually a hit) then query one book each — kept as a single chained
  // promise so the whole thing runs inside the Promise.all alongside every
  // other call, rather than the enumeration round-trip blocking them first.
  // A single builder's failure drops just that book; enumeration failure
  // degrades to main-DEX only. Neither sinks the page.
  const builderStatesPromise = getBuilderDexNames()
    .catch(() => [])
    .then((names) =>
      Promise.all(
        names.map((dex) =>
          fetchClearinghouseState(address, dex).catch(() => null),
        ),
      ),
    );

  const [
    clearinghouse,
    builderStates,
    portfolio,
    openOrders,
    spotState,
    spotTokens,
    mids,
    outcomeIndex,
  ] = await Promise.all([
    fetchClearinghouseState(address),
    builderStatesPromise,
    fetchPortfolio(address),
    fetchOpenOrders(address),
    fetchSpotClearinghouseState(address),
    getSpotTokenInfo(),
    getAllMids(),
    getOutcomeIndex(),
  ]);

  // Only the builder books this account actually uses; the rest come back empty.
  const builderBooks = builderStates.filter(
    (s): s is HlClearinghouseState => s != null,
  );
  const perpBooks = [clearinghouse, ...builderBooks];

  // HIP-4 outcome sides ride along in the spot balance list as `+8560`, but
  // they are a separate asset class: priced off their own book, not the spot
  // token universe, and surfaced in their own section.
  const outcomePositions = toOutcomePositions(
    spotState.balances.filter((b) => isOutcomeCoin(b.coin)),
    mids,
  );
  const outcomeValue = outcomePositions.reduce(
    (a, p) => a + (p.positionValue ?? 0),
    0,
  );

  const rawSpotBalances = spotState.balances
    .filter((b) => !isOutcomeCoin(b.coin))
    .map((b) => {
      const total = num(b.total);
      const token = b.token == null ? undefined : spotTokens[b.token];
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

  const positions: PositionView[] = perpBooks
    .flatMap((book) => book.assetPositions)
    .map(({ position }) => toPositionView(position))
    .sort((a, b) => b.positionValue - a.positionValue);

  const series = toSeries(portfolio);

  // Perp equity spans every book: the main DEX plus each HIP-3 builder DEX,
  // which hold their collateral separately. Their sum matches Hyperliquid's own
  // aggregated `perpDay` account value.
  const mainPerpEquity = num(clearinghouse.marginSummary.accountValue);
  const builderPerpEquity = builderBooks.reduce(
    (a, b) => a + num(b.marginSummary.accountValue),
    0,
  );
  const perpEquity = mainPerpEquity + builderPerpEquity;

  // Hyperliquid's unified-collateral model draws perp margin straight from the
  // spot USDC balance: the collateral is reported as `hold` on the spot USDC
  // row *and* marked to market as the perp `accountValue`. Counting both
  // double-counts it, so `reconcileEquity` nets the held USDC out of the spot
  // side — subtracting the held amount (what actually sits in spot), not the
  // perp equity (which is that collateral plus unrealized PnL that lives only
  // in the perp account). See equity.ts for the full derivation.
  const usdcBalance = spotState.balances.find(
    (b) => b.token === USDC_TOKEN_INDEX,
  );
  const usdcTotal = num(usdcBalance?.total);
  const usdcHold = num(usdcBalance?.hold);

  const { totalEquity, spotValue, freeSpotUsdc, perpCollateralInSpot } =
    reconcileEquity({
      mainPerpEquity,
      builderPerpEquity,
      rawSpotValue,
      // Outcome holdings count toward the value Hyperliquid charts, so they
      // belong in the total — omitting them understates it by the outcome book.
      outcomeValue,
      usdcTotal,
      usdcHold,
    });

  // Net the perp collateral out of the displayed USDC row too, so the listed
  // balances reconcile with the reported spot value.
  const spotBalances = rawSpotBalances
    .map((b) =>
      b.token === USDC_TOKEN_INDEX
        ? {
            ...b,
            total: Math.max(0, b.total - perpCollateralInSpot),
            usdValue: Math.max(0, (b.usdValue ?? 0) - perpCollateralInSpot),
          }
        : b,
    )
    .filter((b) => b.total > 0)
    .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0))
    .map(({ token: _token, ...view }) => view);

  const flatOrders = flattenOrders(openOrders);

  return {
    address,
    fetchedAt: Date.now(),
    perpEquity,
    // Spot value excluding USDC committed to perps, so the three parts sum to
    // total: perp + spot + outcome.
    spotValue,
    totalEquity,
    spotBalances: spotBalances.slice(0, 6),
    outcomePositions,
    outcomeValue,
    outcomeMarkets: describeOutcomeCoins(
      [
        ...outcomePositions.map((p) => p.coin),
        ...flatOrders.map((o) => o.coin),
      ],
      outcomeIndex,
    ),
    // Account-level: the perp wallet's own withdrawable (a main-DEX figure —
    // builder collateral must be moved back there first) plus the free spot
    // USDC, which can be withdrawn directly. The raw perp field alone reads $0
    // for a fully-committed perp account even while spot USDC sits withdrawable.
    withdrawable: num(clearinghouse.withdrawable) + freeSpotUsdc,
    // Margin and notional span every book, to stay consistent with the merged
    // positions list and its unrealized PnL.
    marginUsed: perpBooks.reduce(
      (a, b) => a + num(b.marginSummary.totalMarginUsed),
      0,
    ),
    totalNtlPos: perpBooks.reduce(
      (a, b) => a + num(b.marginSummary.totalNtlPos),
      0,
    ),
    maintenanceMarginUsed: perpBooks.reduce(
      (a, b) => a + num(b.crossMaintenanceMarginUsed),
      0,
    ),
    totalUnrealizedPnl: positions.reduce((a, p) => a + p.unrealizedPnl, 0),
    positions,
    openOrders: flatOrders,
    portfolio: series,
    pnlSummary: summarizePnl(series),
    allTimeVolume: series.allTime?.volume ?? 0,
    risk: computeRiskMetrics(series.month),
  };
}
