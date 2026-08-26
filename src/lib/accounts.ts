import type {
  ActivityCoverage,
  ActivityPayload,
  FillView,
  FundingView,
  OrderView,
  OutcomeMarketMap,
  OutcomePositionView,
  OverviewPayload,
  PositionView,
  SpotBalanceView,
  TransferView,
} from "./api-types";
import {
  FILLS_PAYLOAD_CAP,
  FUNDING_PAYLOAD_CAP,
  TRADES_PAYLOAD_CAP,
  TRANSFERS_PAYLOAD_CAP,
} from "./payload-caps";
import { mergePortfolios, summarizePnl } from "./portfolio";
import type { CoinPnl, DirectionStats, TradeStats } from "./stats";
import type { Trade } from "./trades";

/**
 * Combining a master account and its sub-accounts into one view.
 *
 * Hyperliquid keeps every sub-account under its own address, so "all accounts"
 * is not something the API can answer — the dashboard fetches each address's
 * own payloads and adds them up here. The merge deliberately produces the same
 * {@link OverviewPayload} and {@link ActivityPayload} shapes a single account
 * returns, so every component below reads a combined account exactly as it
 * reads one address, and the only thing rows gain is a {@link RowAccount} tag
 * saying where each came from.
 */

/**
 * Which account a merged row came from. Only the all-accounts view sets it:
 * in a single-account view every row belongs to the address in the payload, so
 * the field stays undefined and the tables show no tag.
 */
export type RowAccount = {
  /** The account's own (lowercased) address. */
  address: string;
  /** How the switcher labels it — "Main", or the sub-account's name. */
  name: string;
};

/** The switcher's value for the combined view; never a valid address. */
export const ALL_ACCOUNTS = "all";

/**
 * React key for a row that may have been merged: rows from different accounts
 * routinely share an id — the same coin, the same funding hour, even the same
 * `coin:openedAt:seq` trade id — so the account has to be part of the key.
 */
export function rowKey(
  account: RowAccount | undefined,
  id: string | number,
): string {
  return account ? `${account.address}:${id}` : String(id);
}

const sum = (values: number[]): number => values.reduce((a, v) => a + v, 0);

/** Tags every row with the account it came from, leaving the rows untouched. */
function tag<T extends object>(rows: T[], account: RowAccount): T[] {
  return rows.map((row) => ({ ...row, account }));
}

/** Newest first, then cut to the same cap a single-account payload ships. */
function recent<T>(rows: T[], time: (row: T) => number, cap: number): T[] {
  return [...rows].sort((a, b) => time(b) - time(a)).slice(0, cap);
}

// ---------------------------------------------------------------- capital flow

/**
 * Capital in and out, keyed off the sign of the USD effect rather than the
 * ledger `type`. Accounts are routinely funded by `send`/`spotTransfer` or a
 * peer `internalTransfer` and never touch the Arbitrum bridge, so matching
 * only `deposit`/`withdraw` reports $0 in for them. `accountClassTransfer` is
 * skipped: it shuffles USDC between one account's own spot and perp wallets,
 * moving nothing in or out.
 *
 * `internal` names addresses that are inside the view being summarised — the
 * other accounts of an all-accounts view. Capital moved to or from one of them
 * never left the set, so counting it would report funding a sub-account as
 * both a withdrawal and a deposit.
 */
export function sumCapitalFlow(
  transfers: TransferView[],
  internal?: ReadonlySet<string>,
): { totalDeposited: number; totalWithdrawn: number } {
  let totalDeposited = 0;
  let totalWithdrawn = 0;
  for (const t of transfers) {
    if (t.type === "accountClassTransfer" || t.amountUsd == null) continue;
    if (t.counterparty != null && internal?.has(t.counterparty)) continue;
    if (t.amountUsd > 0) totalDeposited += t.amountUsd;
    else totalWithdrawn -= t.amountUsd;
  }
  return { totalDeposited, totalWithdrawn };
}

// -------------------------------------------------------------------- overview

/** Balances of the same token add up; the rest of the row is shared. */
function mergeSpotBalances(parts: SpotBalanceView[][]): SpotBalanceView[] {
  const byCoin = new Map<string, SpotBalanceView>();
  for (const balance of parts.flat()) {
    const seen = byCoin.get(balance.coin);
    if (!seen) {
      byCoin.set(balance.coin, { ...balance });
      continue;
    }
    seen.total += balance.total;
    // An unpriced token stays unpriced; a priced one keeps its value even if
    // another account's row for it happened to be unpriced.
    seen.usdValue =
      seen.usdValue == null && balance.usdValue == null
        ? null
        : (seen.usdValue ?? 0) + (balance.usdValue ?? 0);
  }
  return [...byCoin.values()].sort(
    (a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0),
  );
}

/** Later descriptors win; they're resolved from the same global market index. */
function mergeMarkets(parts: OutcomeMarketMap[]): OutcomeMarketMap {
  return Object.assign({}, ...parts) as OutcomeMarketMap;
}

export type AccountPart<T> = { account: RowAccount; payload: T };

/**
 * Adds up several accounts' overviews. Money figures sum; positions and orders
 * are concatenated rather than netted — two accounts long the same coin hold
 * two positions, with their own entries, liquidation prices and margin, and
 * folding them together would invent a book neither account has.
 */
export function mergeOverviews(
  parts: AccountPart<OverviewPayload>[],
): OverviewPayload {
  const payloads = parts.map((p) => p.payload);
  const positions: PositionView[] = parts
    .flatMap((p) => tag(p.payload.positions, p.account))
    .sort((a, b) => b.positionValue - a.positionValue);
  const outcomePositions: OutcomePositionView[] = parts
    .flatMap((p) => tag(p.payload.outcomePositions, p.account))
    .sort((a, b) => (b.positionValue ?? 0) - (a.positionValue ?? 0));
  const openOrders: OrderView[] = parts
    .flatMap((p) => tag(p.payload.openOrders, p.account))
    .sort((a, b) => b.timestamp - a.timestamp);
  const portfolio = mergePortfolios(payloads.map((p) => p.portfolio));

  return {
    // Nothing on the page links to a single address in this mode — the header
    // names the set instead — but the master is the honest stand-in for one.
    address: parts[0].account.address,
    // The combined view is only as fresh as its stalest part.
    fetchedAt: Math.min(...payloads.map((p) => p.fetchedAt)),
    perpEquity: sum(payloads.map((p) => p.perpEquity)),
    spotValue: sum(payloads.map((p) => p.spotValue)),
    totalEquity: sum(payloads.map((p) => p.totalEquity)),
    spotBalances: mergeSpotBalances(payloads.map((p) => p.spotBalances)).slice(
      0,
      6,
    ),
    outcomePositions,
    outcomeValue: sum(payloads.map((p) => p.outcomeValue)),
    outcomeMarkets: mergeMarkets(payloads.map((p) => p.outcomeMarkets)),
    withdrawable: sum(payloads.map((p) => p.withdrawable)),
    marginUsed: sum(payloads.map((p) => p.marginUsed)),
    totalNtlPos: sum(payloads.map((p) => p.totalNtlPos)),
    maintenanceMarginUsed: sum(payloads.map((p) => p.maintenanceMarginUsed)),
    totalUnrealizedPnl: sum(payloads.map((p) => p.totalUnrealizedPnl)),
    positions,
    openOrders,
    portfolio,
    // Recomputed from the summed curves rather than added: the percentages are
    // returns on average capital, and returns of different accounts don't add.
    pnlSummary: summarizePnl(portfolio),
    allTimeVolume: sum(payloads.map((p) => p.allTimeVolume)),
  };
}

// -------------------------------------------------------------------- activity

function mergeDirections(parts: DirectionStats[]): DirectionStats {
  return {
    count: sum(parts.map((d) => d.count)),
    wins: sum(parts.map((d) => d.wins)),
    losses: sum(parts.map((d) => d.losses)),
    netPnl: sum(parts.map((d) => d.netPnl)),
  };
}

function mergeCoinPnl(parts: CoinPnl[][]): CoinPnl[] {
  const byCoin = new Map<string, CoinPnl>();
  for (const entry of parts.flat()) {
    const seen = byCoin.get(entry.coin);
    if (!seen) {
      byCoin.set(entry.coin, { ...entry });
      continue;
    }
    seen.netPnl += entry.netPnl;
    seen.grossPnl += entry.grossPnl;
    seen.fees += entry.fees;
    seen.funding += entry.funding;
    seen.trades += entry.trades;
    seen.wins += entry.wins;
    seen.losses += entry.losses;
  }
  return [...byCoin.values()].sort((a, b) => b.netPnl - a.netPnl);
}

/**
 * Combines the accounts' own stats rather than recomputing from the merged
 * trade list, so every figure covers all of each account's trades — the trade
 * list is capped, the servers' stats aren't. Almost everything is additive;
 * the averages are recovered exactly by multiplying each account's average
 * back out by its own count before adding.
 *
 * Hold times are the exception: a median can't be recovered from other
 * medians, so both duration figures are read off `trades` — exact whenever no
 * account overflowed the payload cap, and the most recent trades otherwise.
 */
export function mergeStats(parts: TradeStats[], trades: Trade[]): TradeStats {
  const wins = sum(parts.map((s) => s.wins));
  const losses = sum(parts.map((s) => s.losses));
  const decided = wins + losses;
  // Σ of each account's winning/losing PnL. The sums themselves aren't
  // shipped, but average × count reproduces them exactly.
  const winSum = sum(parts.map((s) => (s.avgWin ?? 0) * s.wins));
  const lossSum = sum(parts.map((s) => (s.avgLoss ?? 0) * s.losses));
  // One R = the average losing trade across the whole set, so an account that
  // loses bigger widens the yardstick for all of them — which is right: the
  // combined account is what took the risk. See summarizeTrades.
  const riskUnit = losses > 0 ? Math.abs(lossSum / losses) : 0;

  const excursionSamples = sum(parts.map((s) => s.excursionSamples));
  const avgExcursion = (pick: (s: TradeStats) => number | null) =>
    excursionSamples > 0
      ? sum(parts.map((s) => (pick(s) ?? 0) * s.excursionSamples)) /
        excursionSamples
      : null;

  const durations = trades
    .filter((t) => t.status === "closed" && t.durationMs != null)
    .map((t) => t.durationMs as number)
    .sort((a, b) => a - b);

  const feesByToken: Record<string, number> = {};
  for (const s of parts) {
    for (const [token, amount] of Object.entries(s.feesByToken)) {
      feesByToken[token] = (feesByToken[token] ?? 0) + amount;
    }
  }

  const largestWin = parts
    .map((s) => s.largestWin)
    .filter((w) => w != null)
    .reduce<TradeStats["largestWin"]>(
      (best, w) => (best == null || w.netPnl > best.netPnl ? w : best),
      null,
    );
  const largestLoss = parts
    .map((s) => s.largestLoss)
    .filter((l) => l != null)
    .reduce<TradeStats["largestLoss"]>(
      (worst, l) => (worst == null || l.netPnl < worst.netPnl ? l : worst),
      null,
    );

  return {
    closedCount: sum(parts.map((s) => s.closedCount)),
    openCount: sum(parts.map((s) => s.openCount)),
    wins,
    losses,
    flats: sum(parts.map((s) => s.flats)),
    winRate: decided > 0 ? wins / decided : null,
    totalNetPnl: sum(parts.map((s) => s.totalNetPnl)),
    totalGrossPnl: sum(parts.map((s) => s.totalGrossPnl)),
    totalTradeFees: sum(parts.map((s) => s.totalTradeFees)),
    totalTradeFunding: sum(parts.map((s) => s.totalTradeFunding)),
    avgWin: wins > 0 ? winSum / wins : null,
    avgLoss: losses > 0 ? lossSum / losses : null,
    profitFactor: lossSum < 0 ? winSum / -lossSum : null,
    expectancy: decided > 0 ? (winSum + lossSum) / decided : null,
    avgRiskReward: riskUnit > 0 && wins > 0 ? winSum / wins / riskUnit : null,
    totalR: riskUnit > 0 ? (winSum + lossSum) / riskUnit : null,
    largestWin,
    largestLoss,
    avgDurationMs: durations.length ? sum(durations) / durations.length : null,
    medianDurationMs: durations.length
      ? durations[Math.floor(durations.length / 2)]
      : null,
    longs: mergeDirections(parts.map((s) => s.longs)),
    shorts: mergeDirections(parts.map((s) => s.shorts)),
    pnlByCoin: mergeCoinPnl(parts.map((s) => s.pnlByCoin)),
    avgMfePct: avgExcursion((s) => s.avgMfePct),
    avgMaePct: avgExcursion((s) => s.avgMaePct),
    excursionSamples,
    perpVolume: sum(parts.map((s) => s.perpVolume)),
    outcomeVolume: sum(parts.map((s) => s.outcomeVolume)),
    totalUsdcFees: sum(parts.map((s) => s.totalUsdcFees)),
    feesByToken,
    netFunding: sum(parts.map((s) => s.netFunding)),
    fundingReceived: sum(parts.map((s) => s.fundingReceived)),
    fundingPaid: sum(parts.map((s) => s.fundingPaid)),
  };
}

/**
 * Current leverage per coin, kept only where the accounts agree. A missing key
 * already means "unknown" to the trade table, which is the honest answer when
 * two accounts trade the same market at different settings.
 */
function mergeLeverage(
  parts: Record<string, number>[],
): Record<string, number> {
  const out: Record<string, number> = {};
  const conflicted = new Set<string>();
  for (const part of parts) {
    for (const [coin, leverage] of Object.entries(part)) {
      if (coin in out && out[coin] !== leverage) conflicted.add(coin);
      else out[coin] = leverage;
    }
  }
  for (const coin of conflicted) delete out[coin];
  return out;
}

/** Same ordering rule the trade engine uses: most recent activity first. */
const lastActivity = (t: Trade): number =>
  t.closedAt ?? t.slices[t.slices.length - 1]?.time ?? t.openedAt;

function mergeCoverage(parts: ActivityCoverage[]): ActivityCoverage {
  const earliest = (pick: (c: ActivityCoverage) => number | null) => {
    const times = parts.map(pick).filter((t) => t != null);
    return times.length > 0 ? Math.min(...times) : null;
  };
  const latest = (pick: (c: ActivityCoverage) => number | null) => {
    const times = parts.map(pick).filter((t) => t != null);
    return times.length > 0 ? Math.max(...times) : null;
  };
  return {
    fillsFrom: earliest((c) => c.fillsFrom),
    fillsTo: latest((c) => c.fillsTo),
    fillsComplete: parts.every((c) => c.fillsComplete),
    fillCount: sum(parts.map((c) => c.fillCount)),
    fundingFrom: earliest((c) => c.fundingFrom),
    fundingComplete: parts.every((c) => c.fundingComplete),
    fundingCount: sum(parts.map((c) => c.fundingCount)),
    ledgerComplete: parts.every((c) => c.ledgerComplete),
    truncatedTrades: sum(parts.map((c) => c.truncatedTrades)),
  };
}

/**
 * Adds up several accounts' activity. Every list is concatenated, re-sorted
 * newest first and cut back to the payload caps, so a combined view carries
 * the same volume of rows as a single account and the totals beside them stay
 * the true, uncapped counts.
 */
export function mergeActivities(
  parts: AccountPart<ActivityPayload>[],
): ActivityPayload {
  const payloads = parts.map((p) => p.payload);
  const trades = recent(
    parts.flatMap((p) => tag(p.payload.trades, p.account)),
    lastActivity,
    TRADES_PAYLOAD_CAP,
  );
  const transfers = parts.flatMap((p) => tag(p.payload.transfers, p.account));

  // Transfers between these accounts never left the set. Netting them out
  // needs the whole ledger, though — the payload's own totals already counted
  // rows past the cap, and what wasn't shipped can't be subtracted back out —
  // so a capped or incomplete ledger keeps the servers' figures. Those still
  // net correctly (an internal move is a withdrawal on one side and a deposit
  // on the other); only the gross in and out legs come out inflated.
  const ledgerWhole = parts.every(
    (p) =>
      p.payload.coverage.ledgerComplete &&
      p.payload.transfers.length === p.payload.transfersTotal,
  );
  const internal = new Set(parts.map((p) => p.account.address));
  const flow = ledgerWhole
    ? sumCapitalFlow(transfers, internal)
    : {
        totalDeposited: sum(payloads.map((p) => p.totalDeposited)),
        totalWithdrawn: sum(payloads.map((p) => p.totalWithdrawn)),
      };

  return {
    address: parts[0].account.address,
    fetchedAt: Math.min(...payloads.map((p) => p.fetchedAt)),
    trades,
    tradesTotal: sum(payloads.map((p) => p.tradesTotal)),
    leverageByCoin: mergeLeverage(payloads.map((p) => p.leverageByCoin)),
    outcomeMarkets: mergeMarkets(payloads.map((p) => p.outcomeMarkets)),
    stats: mergeStats(
      payloads.map((p) => p.stats),
      trades,
    ),
    recentFills: recent<FillView>(
      parts.flatMap((p) => tag(p.payload.recentFills, p.account)),
      (f) => f.time,
      FILLS_PAYLOAD_CAP,
    ),
    fillsTotal: sum(payloads.map((p) => p.fillsTotal)),
    funding: recent<FundingView>(
      parts.flatMap((p) => tag(p.payload.funding, p.account)),
      (f) => f.time,
      FUNDING_PAYLOAD_CAP,
    ),
    fundingTotal: sum(payloads.map((p) => p.fundingTotal)),
    transfers: recent<TransferView>(
      transfers,
      (t) => t.time,
      TRANSFERS_PAYLOAD_CAP,
    ),
    transfersTotal: sum(payloads.map((p) => p.transfersTotal)),
    ...flow,
    coverage: mergeCoverage(payloads.map((p) => p.coverage)),
  };
}
