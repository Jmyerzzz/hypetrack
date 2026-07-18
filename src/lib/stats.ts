import type { HlFill, HlFundingEvent } from "./hyperliquid/types";
import { isSpotCoin, type Trade } from "./trades";

export type CoinPnl = {
  coin: string;
  netPnl: number;
  grossPnl: number;
  fees: number;
  funding: number;
  trades: number;
  wins: number;
  losses: number;
};

export type DirectionStats = {
  count: number;
  wins: number;
  losses: number;
  netPnl: number;
};

export type TradeStats = {
  closedCount: number;
  openCount: number;
  wins: number;
  losses: number;
  flats: number;
  /** wins / (wins + losses); flat trades excluded. */
  winRate: number | null;
  totalNetPnl: number;
  totalGrossPnl: number;
  totalTradeFees: number;
  totalTradeFunding: number;
  avgWin: number | null;
  avgLoss: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  largestWin: { coin: string; netPnl: number } | null;
  largestLoss: { coin: string; netPnl: number } | null;
  avgDurationMs: number | null;
  medianDurationMs: number | null;
  longs: DirectionStats;
  shorts: DirectionStats;
  pnlByCoin: CoinPnl[];
  /** Σ |px·sz| over perp fills in the window (both opens and closes). */
  perpVolume: number;
  /** All USDC fees in the window (perp + spot + builder fees). */
  totalUsdcFees: number;
  /** Non-USDC fee totals by token (spot fills can pay fees in the base token). */
  feesByToken: Record<string, number>;
  /** Σ of all funding events in the window; positive = received. */
  netFunding: number;
  fundingReceived: number;
  fundingPaid: number;
};

const num = (s: string | undefined | null): number => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};

export function computeStats(
  trades: Trade[],
  fills: HlFill[],
  fundingEvents: HlFundingEvent[],
): TradeStats {
  const closed = trades.filter((t) => t.status === "closed");
  const open = trades.filter((t) => t.status === "open");

  let wins = 0;
  let losses = 0;
  let flats = 0;
  let winSum = 0;
  let lossSum = 0;
  let largestWin: TradeStats["largestWin"] = null;
  let largestLoss: TradeStats["largestLoss"] = null;
  const durations: number[] = [];

  const longs: DirectionStats = { count: 0, wins: 0, losses: 0, netPnl: 0 };
  const shorts: DirectionStats = { count: 0, wins: 0, losses: 0, netPnl: 0 };
  const coinMap = new Map<string, CoinPnl>();

  for (const t of trades) {
    const coin = coinMap.get(t.coin) ?? {
      coin: t.coin,
      netPnl: 0,
      grossPnl: 0,
      fees: 0,
      funding: 0,
      trades: 0,
      wins: 0,
      losses: 0,
    };
    coin.netPnl += t.netPnl;
    coin.grossPnl += t.grossPnl;
    coin.fees += t.fees;
    coin.funding += t.funding;
    coin.trades++;
    if (t.isWin === true) coin.wins++;
    if (t.isWin === false) coin.losses++;
    coinMap.set(t.coin, coin);

    const dir = t.direction === "long" ? longs : shorts;
    dir.count++;
    dir.netPnl += t.netPnl;
    if (t.isWin === true) dir.wins++;
    if (t.isWin === false) dir.losses++;
  }

  for (const t of closed) {
    if (t.isWin === true) {
      wins++;
      winSum += t.netPnl;
      if (!largestWin || t.netPnl > largestWin.netPnl) {
        largestWin = { coin: t.coin, netPnl: t.netPnl };
      }
    } else if (t.isWin === false) {
      losses++;
      lossSum += t.netPnl;
      if (!largestLoss || t.netPnl < largestLoss.netPnl) {
        largestLoss = { coin: t.coin, netPnl: t.netPnl };
      }
    } else {
      flats++;
    }
    if (t.durationMs != null) durations.push(t.durationMs);
  }

  durations.sort((a, b) => a - b);
  const medianDurationMs = durations.length
    ? durations[Math.floor(durations.length / 2)]
    : null;
  const avgDurationMs = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : null;

  let perpVolume = 0;
  let totalUsdcFees = 0;
  const feesByToken: Record<string, number> = {};
  for (const f of fills) {
    const notional = num(f.px) * num(f.sz);
    if (!isSpotCoin(f.coin)) perpVolume += notional;
    const fee = num(f.fee);
    if (f.feeToken === "USDC") totalUsdcFees += fee;
    else if (f.feeToken)
      feesByToken[f.feeToken] = (feesByToken[f.feeToken] ?? 0) + fee;
    totalUsdcFees += num(f.builderFee);
  }

  let fundingReceived = 0;
  let fundingPaid = 0;
  for (const e of fundingEvents) {
    const usdc = num(e.delta.usdc);
    if (usdc >= 0) fundingReceived += usdc;
    else fundingPaid += usdc;
  }

  const decided = wins + losses;
  const totalNetPnl = trades.reduce((a, t) => a + t.netPnl, 0);

  return {
    closedCount: closed.length,
    openCount: open.length,
    wins,
    losses,
    flats,
    winRate: decided > 0 ? wins / decided : null,
    totalNetPnl,
    totalGrossPnl: trades.reduce((a, t) => a + t.grossPnl, 0),
    totalTradeFees: trades.reduce((a, t) => a + t.fees, 0),
    totalTradeFunding: trades.reduce((a, t) => a + t.funding, 0),
    avgWin: wins > 0 ? winSum / wins : null,
    avgLoss: losses > 0 ? lossSum / losses : null,
    profitFactor: lossSum < 0 ? winSum / -lossSum : null,
    expectancy: decided > 0 ? (winSum + lossSum) / decided : null,
    largestWin,
    largestLoss,
    avgDurationMs,
    medianDurationMs,
    longs,
    shorts,
    pnlByCoin: [...coinMap.values()].sort((a, b) => b.netPnl - a.netPnl),
    perpVolume,
    totalUsdcFees,
    feesByToken,
    netFunding: fundingReceived + fundingPaid,
    fundingReceived,
    fundingPaid,
  };
}
