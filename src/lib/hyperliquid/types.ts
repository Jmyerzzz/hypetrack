/**
 * Types for the Hyperliquid public info API (https://api.hyperliquid.xyz/info).
 * Numeric values arrive as strings; they are parsed at the processing layer.
 */

export type HlFill = {
  coin: string;
  px: string;
  sz: string;
  side: "B" | "A";
  time: number;
  startPosition: string;
  dir: string;
  closedPnl: string;
  hash: string;
  oid: number;
  crossed: boolean;
  fee: string;
  tid: number;
  feeToken: string;
  builderFee?: string;
  twapId?: number | null;
  liquidation?: {
    liquidatedUser?: string;
    markPx?: string;
    method?: string;
  };
};

export type HlFundingEvent = {
  time: number;
  hash: string;
  delta: {
    type: "funding";
    coin: string;
    /** Signed USDC amount from the user's perspective; positive = received. */
    usdc: string;
    szi: string;
    fundingRate: string;
    nSamples: number | null;
  };
};

/** Deposits, withdrawals, transfers, etc. `delta` shape varies by `type`. */
export type HlLedgerUpdate = {
  time: number;
  hash: string;
  delta: {
    type: string;
    usdc?: string;
    amount?: string;
    token?: string;
    usdcValue?: string;
    user?: string;
    destination?: string;
    fee?: string;
    nativeTokenFee?: string;
    toPerp?: boolean;
  };
};

export type HlLeverage = { type: "cross" | "isolated"; value: number };

export type HlAssetPosition = {
  type: string;
  position: {
    coin: string;
    szi: string;
    leverage: HlLeverage;
    entryPx: string;
    positionValue: string;
    unrealizedPnl: string;
    returnOnEquity: string;
    liquidationPx: string | null;
    marginUsed: string;
    maxLeverage: number;
    cumFunding: { allTime: string; sinceOpen: string; sinceChange: string };
  };
};

export type HlMarginSummary = {
  accountValue: string;
  totalNtlPos: string;
  totalRawUsd: string;
  totalMarginUsed: string;
};

export type HlClearinghouseState = {
  marginSummary: HlMarginSummary;
  crossMarginSummary: HlMarginSummary;
  crossMaintenanceMarginUsed: string;
  withdrawable: string;
  assetPositions: HlAssetPosition[];
  time: number;
};

export type HlSpotBalance = {
  coin: string;
  token: number;
  total: string;
  hold: string;
  entryNtl: string;
};

export type HlSpotClearinghouseState = {
  balances: HlSpotBalance[];
};

export type HlSpotMeta = {
  universe: {
    /** Pair name, e.g. "PURR/USDC" or "@1". */
    name: string;
    /** [baseTokenIndex, quoteTokenIndex] */
    tokens: [number, number];
    index: number;
  }[];
  tokens: {
    name: string;
    index: number;
    szDecimals: number;
  }[];
};

export type HlSpotAssetCtx = {
  coin: string;
  markPx: string;
  midPx: string | null;
};

export type HlSpotMetaAndAssetCtxs = [HlSpotMeta, HlSpotAssetCtx[]];

export type HlPortfolioPeriodData = {
  accountValueHistory: [number, string][];
  pnlHistory: [number, string][];
  vlm: string;
};

export type HlPortfolioPeriod =
  | "day"
  | "week"
  | "month"
  | "allTime"
  | "perpDay"
  | "perpWeek"
  | "perpMonth"
  | "perpAllTime";

export type HlPortfolio = [HlPortfolioPeriod, HlPortfolioPeriodData][];

export type HlOpenOrder = {
  coin: string;
  side: "B" | "A";
  limitPx: string;
  sz: string;
  origSz: string;
  oid: number;
  timestamp: number;
  orderType: string;
  tif: string | null;
  reduceOnly: boolean;
  isTrigger: boolean;
  triggerPx: string;
  triggerCondition: string;
  isPositionTpsl: boolean;
  children: HlOpenOrder[];
};
