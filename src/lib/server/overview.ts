import type {
  OutcomePositionView,
  OverviewPayload,
  PeriodKey,
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
import { flattenOrders, namespaceDexOrders } from "../hyperliquid/orders";
import {
  describeOutcomeCoins,
  isOutcomeCoin,
  toMarketCoin,
} from "../hyperliquid/outcome";
import { buildSpotTokenInfo, type SpotTokenInfo } from "../hyperliquid/spot";
import { matchPositionTriggers } from "../hyperliquid/triggers";
import type {
  HlAllMids,
  HlAssetPosition,
  HlClearinghouseState,
  HlOpenOrder,
  HlPortfolio,
  HlSpotBalance,
} from "../hyperliquid/types";
import { summarizePnl } from "../portfolio";
import { getAllMids, getBuilderDexNames, getOutcomeIndex } from "./markets";

const num = (s: string | number | null | undefined): number => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};

/** One perp position (main or builder DEX) to its view; builder coins arrive
 *  already namespaced (`xyz:SKHX`), which the coin tag renders on its own.
 *  `openOrders` must span every book the positions come from — builder-book
 *  orders are normalized onto the same namespaced coins, so triggers match
 *  wherever the position lives. */
function toPositionView(
  p: HlAssetPosition["position"],
  openOrders: HlOpenOrder[],
): PositionView {
  const szi = num(p.szi);
  const positionValue = num(p.positionValue);
  const markPx = Math.abs(szi) > 0 ? positionValue / Math.abs(szi) : null;
  return {
    coin: p.coin,
    szi,
    direction: szi >= 0 ? "long" : "short",
    entryPx: num(p.entryPx),
    markPx,
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
    triggers: matchPositionTriggers(openOrders, {
      coin: p.coin,
      szi,
      refPx: markPx ?? num(p.entryPx),
    }),
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

/** One HIP-3 builder book: its clearinghouse plus its own resting orders. */
type BuilderBook = {
  state: HlClearinghouseState;
  orders: HlOpenOrder[];
};

export async function buildOverview(address: string): Promise<OverviewPayload> {
  // HIP-3 builder perps live in their own clearinghouses, each with its own
  // order book that the main-DEX order query never includes. Enumerate the
  // DEXs (cached, usually a hit) then query one book each — kept as a single
  // chained promise so the whole thing runs inside the Promise.all alongside
  // every other call, rather than the enumeration round-trip blocking them
  // first. Orders are fetched only for books the account actually uses
  // (positions or collateral there): resting an order requires collateral in
  // that book, and the order query carries ~10× the rate-limit weight of the
  // state query, so sweeping every idle DEX would be pure cost. A single
  // builder's failure drops just that book — or, for the order leg alone,
  // just its triggers; enumeration failure degrades to main-DEX only. None
  // of them sinks the page.
  const builderBooksPromise = getBuilderDexNames()
    .catch(() => [])
    .then((names) =>
      Promise.all(
        names.map(async (dex): Promise<BuilderBook | null> => {
          const state = await fetchClearinghouseState(address, dex).catch(
            () => null,
          );
          if (!state) return null;
          const inUse =
            state.assetPositions.length > 0 ||
            num(state.marginSummary.accountValue) > 0;
          const orders = inUse
            ? await fetchOpenOrders(address, dex)
                .then((o) => namespaceDexOrders(o, dex))
                .catch(() => [])
            : [];
          return { state, orders };
        }),
      ),
    );

  const [
    clearinghouse,
    builderBookStates,
    portfolio,
    openOrders,
    spotState,
    spotTokens,
    mids,
    outcomeIndex,
  ] = await Promise.all([
    fetchClearinghouseState(address),
    builderBooksPromise,
    fetchPortfolio(address),
    fetchOpenOrders(address),
    fetchSpotClearinghouseState(address),
    getSpotTokenInfo(),
    getAllMids(),
    getOutcomeIndex(),
  ]);

  // Books whose query failed are dropped; unused ones just come back empty.
  const builderBooks = builderBookStates.filter(
    (b): b is BuilderBook => b != null,
  );
  const perpBooks = [clearinghouse, ...builderBooks.map((b) => b.state)];
  // Every book's orders as one account-wide list: trigger matching and the
  // orders tab both want the whole account, and builder coins are namespaced
  // on both sides so nothing collides across books.
  const allOpenOrders = [
    ...openOrders,
    ...builderBooks.flatMap((b) => b.orders),
  ];

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
    .map(({ position }) => toPositionView(position, allOpenOrders))
    .sort((a, b) => b.positionValue - a.positionValue);

  const series = toSeries(portfolio);

  // Perp equity spans every book: the main DEX plus each HIP-3 builder DEX,
  // each of which reports its own clearinghouse. Their sum matches
  // Hyperliquid's own aggregated `perpDay` account value. The collateral
  // itself is not separate — every book's margin rides in the one spot USDC
  // hold, which is why `reconcileEquity` nets against the combined equity.
  const mainPerpEquity = num(clearinghouse.marginSummary.accountValue);
  const builderPerpEquity = builderBooks.reduce(
    (a, b) => a + num(b.state.marginSummary.accountValue),
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

  const flatOrders = flattenOrders(allOpenOrders);

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
  };
}
