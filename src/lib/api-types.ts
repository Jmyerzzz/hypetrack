import type { RiskMetrics } from "./risk";
import type { TradeStats } from "./stats";
import type { Trade } from "./trades";

export type PortfolioPoint = { t: number; v: number };

export type PortfolioSeries = {
  accountValue: PortfolioPoint[];
  pnl: PortfolioPoint[];
  volume: number;
};

export type PeriodKey = "day" | "week" | "month" | "allTime";

export type PnlSummaryEntry = {
  period: PeriodKey;
  pnl: number;
  /** Fraction (0.12 = +12%); null when no meaningful starting capital exists. */
  pct: number | null;
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
};

export type SpotBalanceView = {
  coin: string;
  total: number;
  usdValue: number | null;
};

/**
 * Total equity mirrors Hyperliquid's portfolio page (perp + spot value);
 * trades, PnL series, and volume stay scoped to the perp trading account.
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
  withdrawable: number;
  marginUsed: number;
  totalNtlPos: number;
  maintenanceMarginUsed: number;
  totalUnrealizedPnl: number;
  positions: PositionView[];
  openOrders: OrderView[];
  /** Perp-account portfolio series, keyed by day/week/month/allTime. */
  portfolio: Record<string, PortfolioSeries>;
  pnlSummary: PnlSummaryEntry[];
  /** Lifetime perp traded volume as reported by Hyperliquid. */
  allTimeVolume: number;
  risk: RiskMetrics;
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
};

export type FundingView = {
  time: number;
  coin: string;
  usdc: number;
  rate: number;
  szi: number;
};

export type TransferView = {
  time: number;
  type: string;
  label: string;
  /** Signed USD effect on this account when determinable. */
  amountUsd: number | null;
  detail: string | null;
  hash: string;
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
