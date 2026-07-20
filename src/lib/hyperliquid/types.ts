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

/**
 * One entry from `perpDexs`: a HIP-3 builder-deployed perp DEX. The endpoint
 * returns the main book as a leading `null`, then one object per builder DEX.
 */
export type HlPerpDex = {
  name: string;
  fullName: string;
  deployer: string;
} | null;

export type HlSpotBalance = {
  coin: string;
  /** Absent on HIP-4 outcome balances (`+8560`), which are not spot tokens. */
  token?: number;
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

export type HlCandle = {
  /** Open time (ms). */
  t: number;
  /** Close time (ms). */
  T: number;
  o: string;
  c: string;
  h: string;
  l: string;
};

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

/** Coin → mid price, covering perps, spot pairs, and outcome sides (`#8560`). */
export type HlAllMids = Record<string, string>;

/** One side of a HIP-4 outcome market; index 0/1 matches the coin's last digit. */
export type HlOutcomeSideSpec = { name: string };

export type HlOutcomeSpec = {
  outcome: number;
  name: string;
  /** Prose for curated markets, `key:value|…` for generated ones. */
  description: string;
  sideSpecs: HlOutcomeSideSpec[];
  quoteToken?: string;
};

/** Groups outcomes that answer one question ("2026 World Cup Champion"). */
export type HlOutcomeQuestion = {
  question: number;
  name: string;
  description: string;
  /** Resolves Yes when none of the named outcomes do. */
  fallbackOutcome: number;
  namedOutcomes: number[];
  /** Already settled, so absent from `outcomes` but still attributable here. */
  settledNamedOutcomes?: number[];
};

/** Live markets only — settled ones drop out of both lists. */
export type HlOutcomeMeta = {
  outcomes: HlOutcomeSpec[];
  questions: HlOutcomeQuestion[];
};

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
