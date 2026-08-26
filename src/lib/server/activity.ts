import { sumCapitalFlow } from "../accounts";
import type {
  ActivityPayload,
  FillView,
  FundingView,
  TransferView,
} from "../api-types";
import { cache } from "../cache";
import { leverageCoins } from "../card";
import { computeTradeExcursion, pickCandleInterval } from "../excursions";
import {
  fetchAllFills,
  fetchCandles,
  fetchFunding,
  fetchLedgerUpdates,
} from "../hyperliquid/client";
import { describeOutcomeCoins, isOutcomeCoin } from "../hyperliquid/outcome";
import type { HlCandle, HlFill, HlLedgerUpdate } from "../hyperliquid/types";
import {
  FILLS_PAYLOAD_CAP,
  FUNDING_PAYLOAD_CAP,
  TRADES_PAYLOAD_CAP,
  TRANSFERS_PAYLOAD_CAP,
} from "../payload-caps";
import { computeStats } from "../stats";
import {
  attributeFunding,
  groupTrades,
  isSpotCoin,
  type Trade,
} from "../trades";
import { leverageMapForCoins } from "./leverage";
import { getOutcomeIndex } from "./markets";

/**
 * `activeAssetData` is one request per coin, so the current-leverage lookup
 * is capped to the most recently traded markets (each info call carries rate
 * -limit weight, and hyper-diversified accounts would otherwise fan out into
 * hundreds). Trades past the cap show unleveraged numbers.
 */
const LEVERAGE_COIN_CAP = 40;
const SLICES_PER_TRADE_CAP = 60;
/** Candle fetches for MFE/MAE are capped to the most recently traded markets. */
const EXCURSION_COIN_CAP = 8;
/** Candle requests go out in small batches to avoid rate-limit bursts. */
const CANDLE_CONCURRENCY = 4;

const num = (s: string | null | undefined): number => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};

function toFillView(f: HlFill, userAddress: string): FillView {
  return {
    tid: f.tid,
    time: f.time,
    coin: f.coin,
    isBuy: f.side === "B",
    dir: f.dir,
    px: num(f.px),
    sz: num(f.sz),
    notional: num(f.px) * num(f.sz),
    fee: num(f.fee) + num(f.builderFee),
    feeToken: f.feeToken,
    closedPnl: num(f.closedPnl),
    hash: f.hash,
    crossed: f.crossed,
    twap: f.twapId != null,
    liquidation:
      f.liquidation != null &&
      (!f.liquidation.liquidatedUser ||
        f.liquidation.liquidatedUser.toLowerCase() === userAddress),
  };
}

const TRANSFER_LABELS: Record<string, string> = {
  deposit: "Deposit",
  withdraw: "Withdraw",
  accountClassTransfer: "Perp ⇄ Spot",
  internalTransfer: "Internal transfer",
  spotTransfer: "Spot transfer",
  send: "Send",
  cStakingTransfer: "Staking",
  spotGenesis: "Genesis airdrop",
  vaultDeposit: "Vault deposit",
  vaultWithdraw: "Vault withdraw",
  vaultDistribution: "Vault distribution",
  subAccountTransfer: "Sub-account transfer",
};

function toTransferView(u: HlLedgerUpdate, userAddress: string): TransferView {
  const d = u.delta;
  let amountUsd: number | null = null;
  let detail: string | null = null;

  switch (d.type) {
    case "deposit":
      amountUsd = num(d.usdc);
      break;
    case "withdraw":
      amountUsd = -num(d.usdc);
      break;
    case "accountClassTransfer":
      amountUsd = num(d.usdc);
      detail = d.toPerp ? "Spot → Perp" : "Perp → Spot";
      break;
    case "internalTransfer": {
      const incoming = d.destination?.toLowerCase() === userAddress;
      amountUsd = incoming ? num(d.usdc) : -num(d.usdc);
      detail = incoming
        ? `from ${d.user ?? "?"}`
        : `to ${d.destination ?? "?"}`;
      break;
    }
    case "spotTransfer":
    case "send": {
      const incoming = d.destination?.toLowerCase() === userAddress;
      const value = num(d.usdcValue) || num(d.usdc);
      amountUsd = value > 0 ? (incoming ? value : -value) : null;
      detail =
        `${d.amount ?? ""} ${d.token ?? ""} ${incoming ? `from ${d.user ?? "?"}` : `to ${d.destination ?? "?"}`}`.trim();
      break;
    }
    default: {
      if (d.usdc != null) amountUsd = num(d.usdc);
      else if (d.usdcValue != null) amountUsd = num(d.usdcValue);
      if (d.amount != null && d.token != null)
        detail = `${d.amount} ${d.token}`;
      break;
    }
  }

  // Whichever side of a peer-to-peer movement isn't this account. Bridge
  // deposits and withdrawals name no one and stay null.
  const from = d.user?.toLowerCase() ?? null;
  const to = d.destination?.toLowerCase() ?? null;
  const counterparty =
    (to != null && to !== userAddress ? to : null) ??
    (from != null && from !== userAddress ? from : null);

  return {
    time: u.time,
    type: d.type,
    label: TRANSFER_LABELS[d.type] ?? d.type,
    amountUsd,
    detail,
    hash: u.hash,
    counterparty,
  };
}

function capSlices(trade: Trade): Trade {
  if (trade.slices.length <= SLICES_PER_TRADE_CAP) return trade;
  const head = trade.slices.slice(0, 10);
  const tail = trade.slices.slice(-(SLICES_PER_TRADE_CAP - 10));
  return {
    ...trade,
    slices: [...head, ...tail],
    slicesOmitted: trade.slices.length - SLICES_PER_TRADE_CAP,
  };
}

const ACTIVITY_TTL_MS = 3 * 60_000;

/**
 * Cached activity for one address — the activity API route and the PnL card
 * route share this entry, so rendering a card right after the dashboard
 * loaded costs no extra Hyperliquid calls.
 */
export function getActivity(address: string): Promise<ActivityPayload> {
  return cache.getOrLoad(`activity:${address}`, ACTIVITY_TTL_MS, () =>
    buildActivity(address),
  );
}

export async function buildActivity(address: string): Promise<ActivityPayload> {
  const fillsResult = await fetchAllFills(address);
  // Perp trading account only: spot-wallet fills are excluded everywhere.
  const fills = fillsResult.records.filter((f) => !isSpotCoin(f.coin));
  const fillsFrom = fills[0]?.time ?? null;
  const fillsTo = fills[fills.length - 1]?.time ?? null;

  const fundingStart = fillsFrom ?? Date.now() - 90 * 24 * 3600 * 1000;
  const [fundingResult, ledgerResult, outcomeIndex] = await Promise.all([
    fetchFunding(address, fundingStart),
    fetchLedgerUpdates(address),
    getOutcomeIndex(),
  ]);

  const trades = groupTrades(fills, address);
  const fundingEvents = fundingResult.records;
  attributeFunding(trades, {
    coverageStart: fundingStart,
    coverageEnd: fundingResult.complete
      ? Number.POSITIVE_INFINITY
      : (fundingEvents[fundingEvents.length - 1]?.time ?? fundingStart),
    events: fundingEvents,
  });

  // Current leverage settings for the payload's perp coins; kicked off here so
  // the per-coin calls overlap the candle fetches below. Never rejects — each
  // coin degrades to "unknown" on failure.
  const leveragePromise = leverageMapForCoins(
    address,
    leverageCoins(trades.slice(0, TRADES_PAYLOAD_CAP), LEVERAGE_COIN_CAP),
  );

  // MFE/MAE: one candle series per market (shared across its trades),
  // most recently traded markets first.
  if (fillsFrom != null) {
    const now = Date.now();
    const { interval, ms } = pickCandleInterval(now - fillsFrom);
    const coins = [...new Set(trades.map((t) => t.coin))].slice(
      0,
      EXCURSION_COIN_CAP,
    );
    const candlePairs: [string, HlCandle[]][] = [];
    for (let i = 0; i < coins.length; i += CANDLE_CONCURRENCY) {
      const batch = await Promise.all(
        coins
          .slice(i, i + CANDLE_CONCURRENCY)
          .map(async (coin): Promise<[string, HlCandle[]]> => {
            try {
              return [
                coin,
                await fetchCandles(coin, interval, fillsFrom - ms, now),
              ];
            } catch {
              return [coin, []];
            }
          }),
      );
      candlePairs.push(...batch);
    }
    const candlesByCoin = new Map(candlePairs);
    for (const trade of trades) {
      const candles = candlesByCoin.get(trade.coin);
      trade.excursion =
        candles && candles.length > 0
          ? computeTradeExcursion(trade, candles)
          : null;
    }
  }

  const stats = computeStats(trades, fills, fundingEvents);

  const transfers = ledgerResult.records
    .map((u) => toTransferView(u, address))
    .reverse();
  // Every counterparty is external to a single account, so nothing is netted
  // out here; the all-accounts merge passes its own set. See sumCapitalFlow.
  const { totalDeposited, totalWithdrawn } = sumCapitalFlow(transfers);

  const recentFills = fills
    .slice(-FILLS_PAYLOAD_CAP)
    .map((f) => toFillView(f, address))
    .reverse();

  const funding: FundingView[] = fundingEvents
    .slice(-FUNDING_PAYLOAD_CAP)
    .map((e) => ({
      time: e.time,
      coin: e.delta.coin,
      usdc: num(e.delta.usdc),
      rate: num(e.delta.fundingRate),
      szi: num(e.delta.szi),
    }))
    .reverse();

  const payloadTrades = trades.slice(0, TRADES_PAYLOAD_CAP).map(capSlices);

  return {
    address,
    fetchedAt: Date.now(),
    trades: payloadTrades,
    tradesTotal: trades.length,
    leverageByCoin: await leveragePromise,
    // Only the markets actually referenced by this payload, so an account with
    // one outcome trade doesn't ship the whole HIP-4 universe.
    outcomeMarkets: describeOutcomeCoins(
      [
        ...payloadTrades.map((t) => t.coin),
        ...recentFills.map((f) => f.coin),
        ...stats.pnlByCoin.map((c) => c.coin),
      ].filter(isOutcomeCoin),
      outcomeIndex,
    ),
    stats,
    recentFills,
    fillsTotal: fills.length,
    funding,
    fundingTotal: fundingEvents.length,
    transfers: transfers.slice(0, TRANSFERS_PAYLOAD_CAP),
    transfersTotal: transfers.length,
    totalDeposited,
    totalWithdrawn,
    coverage: {
      fillsFrom,
      fillsTo,
      fillsComplete: fillsResult.complete,
      fillCount: fills.length,
      fundingFrom: fundingEvents[0]?.time ?? null,
      fundingComplete: fundingResult.complete,
      fundingCount: fundingEvents.length,
      ledgerComplete: ledgerResult.complete,
      truncatedTrades: trades.filter((t) => t.truncated).length,
    },
  };
}
