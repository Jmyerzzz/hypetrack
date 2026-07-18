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

export type SpotBalanceView = {
  token: number;
  coin: string;
  total: number;
  hold: number;
  price: number | null;
  usdValue: number | null;
  entryNtl: number;
  unrealizedPnl: number | null;
};

export type OrderView = {
  oid: number;
  coin: string;
  rawCoin: string;
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

export type OverviewPayload = {
  address: string;
  fetchedAt: number;
  perpEquity: number;
  spotValue: number;
  totalEquity: number;
  withdrawable: number;
  marginUsed: number;
  totalNtlPos: number;
  maintenanceMarginUsed: number;
  positions: PositionView[];
  spotBalances: SpotBalanceView[];
  openOrders: OrderView[];
  portfolio: Record<string, PortfolioSeries>;
  pnlSummary: PnlSummaryEntry[];
  /** Lifetime traded volume as reported by Hyperliquid. */
  allTimeVolume: number;
  /** Pair-id → display name map for spot coins (e.g. "@107" → "HYPE/USDC"). */
  spotPairNames: Record<string, string>;
};

export type FillView = {
  tid: number;
  time: number;
  coin: string;
  isSpot: boolean;
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
