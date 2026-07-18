import type {
  ActivityPayload,
  FillView,
  FundingView,
  TransferView,
} from "../api-types";
import {
  fetchAllFills,
  fetchFunding,
  fetchLedgerUpdates,
} from "../hyperliquid/client";
import type { HlFill, HlLedgerUpdate } from "../hyperliquid/types";
import { computeStats } from "../stats";
import {
  attributeFunding,
  groupTrades,
  isSpotCoin,
  type Trade,
} from "../trades";

const TRADES_PAYLOAD_CAP = 500;
const FILLS_PAYLOAD_CAP = 600;
const FUNDING_PAYLOAD_CAP = 500;
const TRANSFERS_PAYLOAD_CAP = 400;
const SLICES_PER_TRADE_CAP = 60;

const num = (s: string | null | undefined): number => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};

function toFillView(f: HlFill, userAddress: string): FillView {
  return {
    tid: f.tid,
    time: f.time,
    coin: f.coin,
    isSpot: isSpotCoin(f.coin),
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

  return {
    time: u.time,
    type: d.type,
    label: TRANSFER_LABELS[d.type] ?? d.type,
    amountUsd,
    detail,
    hash: u.hash,
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

export async function buildActivity(address: string): Promise<ActivityPayload> {
  const fillsResult = await fetchAllFills(address);
  const fills = fillsResult.records;
  const fillsFrom = fills[0]?.time ?? null;
  const fillsTo = fills[fills.length - 1]?.time ?? null;

  const fundingStart = fillsFrom ?? Date.now() - 90 * 24 * 3600 * 1000;
  const [fundingResult, ledgerResult] = await Promise.all([
    fetchFunding(address, fundingStart),
    fetchLedgerUpdates(address),
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

  const stats = computeStats(trades, fills, fundingEvents);

  const transfers = ledgerResult.records
    .map((u) => toTransferView(u, address))
    .reverse();
  const totalDeposited = transfers
    .filter((t) => t.type === "deposit")
    .reduce((a, t) => a + (t.amountUsd ?? 0), 0);
  const totalWithdrawn = transfers
    .filter((t) => t.type === "withdraw")
    .reduce((a, t) => a + Math.abs(t.amountUsd ?? 0), 0);

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

  return {
    address,
    fetchedAt: Date.now(),
    trades: trades.slice(0, TRADES_PAYLOAD_CAP).map(capSlices),
    tradesTotal: trades.length,
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
