import type { RowAccount } from "./accounts";
import type {
  BenchmarkId,
  BenchmarkPeriod,
  BenchmarkPoint,
} from "./benchmarks";
import type { OutcomeMarketView } from "./hyperliquid/outcome";
import type { TradeStats } from "./stats";
import type { Trade } from "./trades";

export type { OutcomeMarketView };

/**
 * Resolved HIP-4 market descriptors for every outcome coin in a payload, keyed
 * by the canonical `#8560` coin so tables can label a raw coin string.
 */
export type OutcomeMarketMap = Record<string, OutcomeMarketView>;

export type PortfolioPoint = { t: number; v: number };

export type PortfolioSeries = {
  /** Perp margin-account equity (drops to ~0 whenever the account is flat). */
  accountValue: PortfolioPoint[];
  /** Cumulative perp PnL. */
  pnl: PortfolioPoint[];
  volume: number;
  /**
   * Hyperliquid's combined account value (perp + spot + vaults) — the number
   * the portfolio page charts. Used for the equity curve so idle USDC doesn't
   * read as the account "going to zero".
   */
  combinedValue: PortfolioPoint[];
  /**
   * Cumulative combined PnL (perp + spot + vaults) — matches the portfolio
   * page's PnL, and is what the summary cards and the PnL chart report.
   */
  combinedPnl: PortfolioPoint[];
};

export type PeriodKey = "day" | "week" | "month" | "allTime";

export type PnlSummaryEntry = {
  period: PeriodKey;
  pnl: number;
  /** Fraction (0.12 = +12%); null when no meaningful starting capital exists. */
  pct: number | null;
};

/** A TP/SL trigger order resting against an open position. */
export type PositionTriggerView = {
  oid: number;
  kind: "tp" | "sl";
  triggerPx: number;
  /** Order size in contracts; 0 = closes the whole position (position TP/SL). */
  sz: number;
  /** Executes as a market order once triggered; false places a limit instead. */
  isMarket: boolean;
};

export type PositionView = {
  coin: string;
  szi: number;
  direction: "long" | "short";
  entryPx: number;
  markPx: number | null;
  positionValue: number;
  unrealizedPnl: number;
  /** Return on equity as a fraction. */
  roe: number;
  liquidationPx: number | null;
  marginUsed: number;
  leverage: number;
  leverageType: string;
  maxLeverage: number;
  /** Net funding received since open (positive = received). */
  fundingSinceOpen: number;
  /**
   * TP/SL trigger orders that would close this position, nearest trigger
   * first. Matched against the position's own book — main DEX or HIP-3
   * builder DEX.
   */
  triggers: PositionTriggerView[];
  account?: RowAccount;
};

/**
 * An open HIP-4 outcome position. These are token balances, not margined
 * positions: always long, never liquidatable, and worth $1 each if the side
 * wins and $0 if it loses.
 */
export type OutcomePositionView = {
  /** Canonical `#8560` coin; look up `outcomeMarkets[coin]` for its labels. */
  coin: string;
  size: number;
  /** Portion of `size` reserved by resting orders. */
  hold: number;
  /** Cost basis of the whole position. */
  entryNotional: number;
  avgEntryPx: number;
  /** Last mid; null when the market has no book (settled or halted). */
  markPx: number | null;
  /** size × markPx, or null when unpriced. */
  positionValue: number | null;
  unrealizedPnl: number | null;
  /** Unrealized return on cost basis, as a fraction. */
  roe: number | null;
  /** What the position pays if this side wins ($1 per token). */
  payoutIfWon: number;
  account?: RowAccount;
};

export type OrderView = {
  oid: number;
  coin: string;
  isBuy: boolean;
  limitPx: number;
  sz: number;
  origSz: number;
  orderType: string;
  tif: string | null;
  reduceOnly: boolean;
  isTrigger: boolean;
  triggerPx: number;
  triggerCondition: string;
  isPositionTpsl: boolean;
  timestamp: number;
  account?: RowAccount;
};

export type SpotBalanceView = {
  coin: string;
  total: number;
  usdValue: number | null;
};

/**
 * Total equity mirrors Hyperliquid's portfolio page (perp + spot + outcome
 * value). PnL figures follow the same combined basis; trades and traded volume
 * stay scoped to the perp trading account.
 */
export type OverviewPayload = {
  address: string;
  fetchedAt: number;
  perpEquity: number;
  /** Spot value excluding USDC committed to perps (perp + spot = total). */
  spotValue: number;
  /** Matches Hyperliquid's "Total Equity" (perp + spot, no double count). */
  totalEquity: number;
  spotBalances: SpotBalanceView[];
  outcomePositions: OutcomePositionView[];
  /** Mark-to-market value of all open outcome positions. */
  outcomeValue: number;
  outcomeMarkets: OutcomeMarketMap;
  /** Account-level withdrawable: free perp collateral + unencumbered spot USDC. */
  withdrawable: number;
  marginUsed: number;
  totalNtlPos: number;
  maintenanceMarginUsed: number;
  totalUnrealizedPnl: number;
  positions: PositionView[];
  openOrders: OrderView[];
  /** Portfolio series (perp + combined), keyed by day/week/month/allTime. */
  portfolio: Record<string, PortfolioSeries>;
  pnlSummary: PnlSummaryEntry[];
  /** Lifetime perp traded volume as reported by Hyperliquid. */
  allTimeVolume: number;
};

/**
 * One benchmark's closing prices over a window. `points` empty (and `source`
 * null) means no quote upstream answered — the chart dims that toggle rather
 * than plotting a line it can't draw, and shows `error`, which names what each
 * upstream said, so an unavailable benchmark is diagnosable from the page.
 */
export type BenchmarkSeriesView = {
  id: BenchmarkId;
  points: BenchmarkPoint[];
  /** Which upstream the prices came from; null when none answered. */
  source: string | null;
  /** Why the prices are missing; null when they aren't. */
  error: string | null;
};

/** Market prices for the benchmark overlays — global, not account-specific. */
export type BenchmarksPayload = {
  period: BenchmarkPeriod;
  fetchedAt: number;
  series: BenchmarkSeriesView[];
};

export type SubAccountView = {
  /** User-chosen sub-account name as set on Hyperliquid. */
  name: string;
  /** The sub-account's own address — a full standalone account. */
  address: string;
};

/**
 * Sub-accounts owned by `address`. Empty for addresses without any, and for
 * sub-account addresses themselves (the API can't walk back up to the master).
 */
export type SubAccountsPayload = {
  address: string;
  fetchedAt: number;
  subAccounts: SubAccountView[];
};

export type FillView = {
  tid: number;
  time: number;
  coin: string;
  isBuy: boolean;
  dir: string;
  px: number;
  sz: number;
  notional: number;
  fee: number;
  feeToken: string;
  closedPnl: number;
  hash: string;
  crossed: boolean;
  twap: boolean;
  liquidation: boolean;
  account?: RowAccount;
};

export type FundingView = {
  time: number;
  coin: string;
  usdc: number;
  rate: number;
  szi: number;
  account?: RowAccount;
};

export type TransferView = {
  time: number;
  type: string;
  label: string;
  /** Signed USD effect on this account when determinable. */
  amountUsd: number | null;
  detail: string | null;
  hash: string;
  /**
   * The other address on a peer-to-peer movement (send, internal or
   * sub-account transfer), lowercased; null for bridge deposits/withdrawals
   * and anything else with no counterparty. The all-accounts merge reads it to
   * tell capital entering the set apart from capital shuffled inside it.
   */
  counterparty: string | null;
  account?: RowAccount;
};

export type ActivityCoverage = {
  fillsFrom: number | null;
  fillsTo: number | null;
  fillsComplete: boolean;
  fillCount: number;
  fundingFrom: number | null;
  fundingComplete: boolean;
  fundingCount: number;
  ledgerComplete: boolean;
  /** Trades whose opening fills predate the available fill window. */
  truncatedTrades: number;
};

export type ActivityPayload = {
  address: string;
  fetchedAt: number;
  trades: Trade[];
  tradesTotal: number;
  /**
   * Current leverage setting per perp coin in `trades` (from
   * `activeAssetData` — fills never recorded the historical one). Missing
   * key = unknown: delisted market, fetch failure, or past the coin cap.
   */
  leverageByCoin: Record<string, number>;
  outcomeMarkets: OutcomeMarketMap;
  stats: TradeStats;
  recentFills: FillView[];
  fillsTotal: number;
  funding: FundingView[];
  fundingTotal: number;
  transfers: TransferView[];
  transfersTotal: number;
  totalDeposited: number;
  totalWithdrawn: number;
  coverage: ActivityCoverage;
};
