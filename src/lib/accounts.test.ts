import { describe, expect, it } from "vitest";
import {
  type AccountPart,
  mergeActivities,
  mergeOverviews,
  mergeStats,
  type RowAccount,
  rowKey,
  sumCapitalFlow,
} from "./accounts";
import type {
  ActivityPayload,
  OverviewPayload,
  PortfolioSeries,
  TransferView,
} from "./api-types";
import { mergeSeries } from "./portfolio";
import { summarizeTrades, type TradeStats } from "./stats";
import type { Trade } from "./trades";

const MAIN: RowAccount = { address: "0xaaa", name: "Main" };
const SUB: RowAccount = { address: "0xbbb", name: "Algo" };

const HOUR = 3_600_000;

function points(values: [number, number][]) {
  return values.map(([t, v]) => ({ t, v }));
}

function series(over: Partial<PortfolioSeries> = {}): PortfolioSeries {
  return {
    accountValue: [],
    pnl: [],
    volume: 0,
    combinedValue: [],
    combinedPnl: [],
    ...over,
  };
}

let seq = 0;
function trade(over: Partial<Trade> = {}): Trade {
  seq++;
  return {
    id: `T${seq}`,
    coin: "BTC",
    kind: "perp",
    direction: "long",
    status: "closed",
    truncated: false,
    liquidated: false,
    openedAt: seq * HOUR,
    closedAt: seq * HOUR + HOUR,
    durationMs: HOUR,
    maxSize: 1,
    totalOpenedSz: 1,
    totalClosedSz: 1,
    avgEntryPx: 100,
    avgExitPx: 110,
    entryNotional: 100,
    exitNotional: 110,
    grossPnl: 10,
    fees: 0,
    funding: 0,
    fundingCovered: true,
    netPnl: 10,
    netPnlPct: 0.1,
    isWin: true,
    fillCount: 2,
    slices: [],
    ...over,
  };
}

/** A {@link TradeStats} whose trade half is real and whose fill half is zero. */
function statsOf(trades: Trade[]): TradeStats {
  return {
    ...summarizeTrades(trades),
    perpVolume: 0,
    outcomeVolume: 0,
    totalUsdcFees: 0,
    feesByToken: {},
    netFunding: 0,
    fundingReceived: 0,
    fundingPaid: 0,
  };
}

function overview(over: Partial<OverviewPayload> = {}): OverviewPayload {
  return {
    address: "0x0",
    fetchedAt: 1_000,
    perpEquity: 0,
    spotValue: 0,
    totalEquity: 0,
    spotBalances: [],
    outcomePositions: [],
    outcomeValue: 0,
    outcomeMarkets: {},
    withdrawable: 0,
    marginUsed: 0,
    totalNtlPos: 0,
    maintenanceMarginUsed: 0,
    totalUnrealizedPnl: 0,
    positions: [],
    openOrders: [],
    portfolio: {},
    pnlSummary: [],
    allTimeVolume: 0,
    ...over,
  };
}

function activity(over: Partial<ActivityPayload> = {}): ActivityPayload {
  return {
    address: "0x0",
    fetchedAt: 1_000,
    trades: [],
    tradesTotal: 0,
    leverageByCoin: {},
    outcomeMarkets: {},
    stats: statsOf([]),
    recentFills: [],
    fillsTotal: 0,
    funding: [],
    fundingTotal: 0,
    transfers: [],
    transfersTotal: 0,
    totalDeposited: 0,
    totalWithdrawn: 0,
    coverage: {
      fillsFrom: null,
      fillsTo: null,
      fillsComplete: true,
      fillCount: 0,
      fundingFrom: null,
      fundingComplete: true,
      fundingCount: 0,
      ledgerComplete: true,
      truncatedTrades: 0,
    },
    ...over,
  };
}

function transfer(over: Partial<TransferView> = {}): TransferView {
  return {
    time: 1,
    type: "deposit",
    label: "Deposit",
    amountUsd: 100,
    detail: null,
    hash: "0xh",
    counterparty: null,
    ...over,
  };
}

const parts = <T>(...pairs: [RowAccount, T][]): AccountPart<T>[] =>
  pairs.map(([account, payload]) => ({ account, payload }));

describe("rowKey", () => {
  it("namespaces by account, and leaves untagged rows alone", () => {
    expect(rowKey(MAIN, "BTC")).toBe("0xaaa:BTC");
    expect(rowKey(SUB, "BTC")).toBe("0xbbb:BTC");
    expect(rowKey(undefined, "BTC")).toBe("BTC");
  });
});

describe("mergeSeries", () => {
  it("holds each account's last value and reads zero before its first", () => {
    // The sub only exists from t=2, so the total is the master alone until then.
    const merged = mergeSeries([
      series({ accountValue: points([[1, 100]]), pnl: points([[1, 10]]) }),
      series({ accountValue: points([[2, 40]]), pnl: points([[2, 4]]) }),
    ]);
    expect(merged.accountValue).toEqual(
      points([
        [1, 100],
        [2, 140],
      ]),
    );
    expect(merged.pnl).toEqual(
      points([
        [1, 10],
        [2, 14],
      ]),
    );
  });

  it("carries a series that ends early forward across later samples", () => {
    const merged = mergeSeries([
      series({
        accountValue: points([
          [1, 100],
          [2, 100],
        ]),
      }),
      series({ accountValue: points([[1, 50]]) }),
    ]);
    expect(merged.accountValue).toEqual(
      points([
        [1, 150],
        [2, 150],
      ]),
    );
  });

  it("puts accountValue and pnl on one grid, which dailyReturns walks by index", () => {
    const merged = mergeSeries([
      series({ accountValue: points([[1, 10]]), pnl: points([[3, 1]]) }),
      series({ accountValue: points([[2, 20]]), pnl: points([[4, 2]]) }),
    ]);
    expect(merged.accountValue.map((p) => p.t)).toEqual([1, 2, 3, 4]);
    expect(merged.pnl.map((p) => p.t)).toEqual([1, 2, 3, 4]);
  });

  it("adds traded volume and leaves absent combined series empty", () => {
    const merged = mergeSeries([series({ volume: 5 }), series({ volume: 7 })]);
    expect(merged.volume).toBe(12);
    expect(merged.combinedValue).toEqual([]);
  });
});

describe("mergeStats", () => {
  // The strong property: combining two accounts' summaries has to land on the
  // same figures as summarizing all their trades at once.
  it("matches a single summary over the union of the trades", () => {
    const a = [
      trade({ coin: "BTC", netPnl: 120, grossPnl: 130, fees: 10, isWin: true }),
      trade({ coin: "ETH", netPnl: -40, isWin: false, durationMs: 3 * HOUR }),
      trade({ coin: "BTC", status: "open", isWin: null, closedAt: null }),
    ];
    const b = [
      trade({ coin: "BTC", netPnl: 60, isWin: true, durationMs: 5 * HOUR }),
      trade({ coin: "SOL", netPnl: -10, isWin: false }),
      trade({ coin: "SOL", netPnl: 0, isWin: null, durationMs: 2 * HOUR }),
    ];
    const merged = mergeStats([statsOf(a), statsOf(b)], [...a, ...b]);
    const direct = summarizeTrades([...a, ...b]);

    for (const key of [
      "closedCount",
      "openCount",
      "wins",
      "losses",
      "flats",
      "winRate",
      "totalNetPnl",
      "totalGrossPnl",
      "totalTradeFees",
      "avgWin",
      "avgLoss",
      "profitFactor",
      "expectancy",
      "avgRiskReward",
      "totalR",
      "avgDurationMs",
      "medianDurationMs",
    ] as const) {
      expect(`${key}=${merged[key]}`).toBe(`${key}=${direct[key]}`);
    }
    expect(merged.largestWin).toEqual(direct.largestWin);
    expect(merged.largestLoss).toEqual(direct.largestLoss);
    expect(merged.longs).toEqual(direct.longs);
    expect(merged.pnlByCoin).toEqual(direct.pnlByCoin);
  });

  it("weights the excursion averages by each account's sample count", () => {
    const withEx = (mfe: number, count: number): TradeStats => ({
      ...statsOf([]),
      avgMfePct: mfe,
      avgMaePct: 0,
      excursionSamples: count,
    });
    const merged = mergeStats([withEx(0.1, 3), withEx(0.5, 1)], []);
    expect(merged.excursionSamples).toBe(4);
    expect(merged.avgMfePct).toBeCloseTo((0.1 * 3 + 0.5) / 4);
  });

  it("adds the fill-derived scalars and the non-USDC fee tokens", () => {
    const one: TradeStats = {
      ...statsOf([]),
      perpVolume: 100,
      totalUsdcFees: 1,
      feesByToken: { HYPE: 2 },
      netFunding: -3,
    };
    const two: TradeStats = {
      ...statsOf([]),
      perpVolume: 50,
      totalUsdcFees: 4,
      feesByToken: { HYPE: 1, PURR: 7 },
      netFunding: 1,
    };
    const merged = mergeStats([one, two], []);
    expect(merged.perpVolume).toBe(150);
    expect(merged.totalUsdcFees).toBe(5);
    expect(merged.feesByToken).toEqual({ HYPE: 3, PURR: 7 });
    expect(merged.netFunding).toBe(-2);
  });
});

describe("mergeOverviews", () => {
  it("adds the money figures and takes the stalest fetch time", () => {
    const merged = mergeOverviews(
      parts(
        [
          MAIN,
          overview({ fetchedAt: 500, totalEquity: 1000, perpEquity: 600 }),
        ],
        [SUB, overview({ fetchedAt: 900, totalEquity: 250, perpEquity: 250 })],
      ),
    );
    expect(merged.totalEquity).toBe(1250);
    expect(merged.perpEquity).toBe(850);
    expect(merged.fetchedAt).toBe(500);
    expect(merged.address).toBe(MAIN.address);
  });

  it("keeps same-coin positions apart, tagged and ordered by value", () => {
    const position = (coin: string, positionValue: number) =>
      ({ coin, positionValue }) as OverviewPayload["positions"][number];
    const merged = mergeOverviews(
      parts(
        [MAIN, overview({ positions: [position("BTC", 100)] })],
        [SUB, overview({ positions: [position("BTC", 300)] })],
      ),
    );
    expect(merged.positions).toHaveLength(2);
    expect(merged.positions[0].account).toBe(SUB);
    expect(merged.positions[1].account).toBe(MAIN);
  });

  it("adds balances of the same token and keeps an unpriced one unpriced", () => {
    const merged = mergeOverviews(
      parts(
        [
          MAIN,
          overview({
            spotBalances: [
              { coin: "USDC", total: 10, usdValue: 10 },
              { coin: "XYZ", total: 1, usdValue: null },
            ],
          }),
        ],
        [
          SUB,
          overview({
            spotBalances: [
              { coin: "USDC", total: 5, usdValue: 5 },
              { coin: "XYZ", total: 2, usdValue: null },
            ],
          }),
        ],
      ),
    );
    expect(merged.spotBalances).toEqual([
      { coin: "USDC", total: 15, usdValue: 15 },
      { coin: "XYZ", total: 3, usdValue: null },
    ]);
  });

  it("recomputes the PnL summary off the summed curves", () => {
    const both = {
      combinedValue: points([
        [0, 1000],
        [1, 1000],
      ]),
      combinedPnl: points([
        [0, 0],
        [1, 50],
      ]),
    };
    const merged = mergeOverviews(
      parts(
        [MAIN, overview({ portfolio: { day: series(both) } })],
        [SUB, overview({ portfolio: { day: series(both) } })],
      ),
    );
    const day = merged.pnlSummary.find((p) => p.period === "day");
    // $50 each on $1000 each: $100 on $2000, i.e. the same 5%, not 10%.
    expect(day?.pnl).toBe(100);
    expect(day?.pct).toBeCloseTo(0.05);
  });
});

describe("mergeActivities", () => {
  it("interleaves trades newest first and keeps the true totals", () => {
    const older = trade({ id: "old", closedAt: 1 * HOUR });
    const newer = trade({ id: "new", closedAt: 9 * HOUR });
    const merged = mergeActivities(
      parts(
        [MAIN, activity({ trades: [older], tradesTotal: 900 })],
        [SUB, activity({ trades: [newer], tradesTotal: 2 })],
      ),
    );
    expect(merged.trades.map((t) => t.id)).toEqual(["new", "old"]);
    expect(merged.trades[0].account).toBe(SUB);
    // The lists are capped, the counts beside them are not.
    expect(merged.tradesTotal).toBe(902);
  });

  it("drops a coin's leverage when the accounts disagree about it", () => {
    const merged = mergeActivities(
      parts(
        [MAIN, activity({ leverageByCoin: { BTC: 10, ETH: 5 } })],
        [SUB, activity({ leverageByCoin: { BTC: 20, ETH: 5 } })],
      ),
    );
    expect(merged.leverageByCoin).toEqual({ ETH: 5 });
  });

  it("nets out capital moved between the accounts being combined", () => {
    const merged = mergeActivities(
      parts(
        [
          MAIN,
          activity({
            transfers: [
              transfer({ amountUsd: 1000 }),
              transfer({
                type: "subAccountTransfer",
                amountUsd: -400,
                counterparty: SUB.address,
              }),
            ],
            transfersTotal: 2,
            totalDeposited: 1000,
            totalWithdrawn: 400,
          }),
        ],
        [
          SUB,
          activity({
            transfers: [
              transfer({
                type: "subAccountTransfer",
                amountUsd: 400,
                counterparty: MAIN.address,
              }),
            ],
            transfersTotal: 1,
            totalDeposited: 400,
            totalWithdrawn: 0,
          }),
        ],
      ),
    );
    expect(merged.totalDeposited).toBe(1000);
    expect(merged.totalWithdrawn).toBe(0);
    // The moves themselves stay in the list — they happened.
    expect(merged.transfers).toHaveLength(3);
  });

  it("falls back to the reported totals when a ledger was truncated", () => {
    const merged = mergeActivities(
      parts(
        [
          MAIN,
          activity({
            transfers: [
              transfer({
                type: "subAccountTransfer",
                amountUsd: -400,
                counterparty: SUB.address,
              }),
            ],
            // More ledger rows exist than were shipped, so nothing can be
            // subtracted from totals that already counted the missing ones.
            transfersTotal: 50,
            totalDeposited: 0,
            totalWithdrawn: 400,
          }),
        ],
        [SUB, activity({ totalDeposited: 400, totalWithdrawn: 0 })],
      ),
    );
    expect(merged.totalDeposited).toBe(400);
    expect(merged.totalWithdrawn).toBe(400);
  });

  it("widens the coverage window and keeps a caveat once anyone has it", () => {
    const merged = mergeActivities(
      parts(
        [
          MAIN,
          activity({
            coverage: {
              ...activity().coverage,
              fillsFrom: 100,
              fillsTo: 200,
              fillCount: 5,
              fillsComplete: false,
              truncatedTrades: 1,
            },
          }),
        ],
        [
          SUB,
          activity({
            coverage: {
              ...activity().coverage,
              fillsFrom: 50,
              fillsTo: 150,
              fillCount: 3,
            },
          }),
        ],
      ),
    );
    expect(merged.coverage.fillsFrom).toBe(50);
    expect(merged.coverage.fillsTo).toBe(200);
    expect(merged.coverage.fillCount).toBe(8);
    expect(merged.coverage.fillsComplete).toBe(false);
    expect(merged.coverage.truncatedTrades).toBe(1);
  });
});

describe("sumCapitalFlow", () => {
  it("reads the sign of the USD effect, not the ledger type", () => {
    const flow = sumCapitalFlow([
      transfer({ type: "send", amountUsd: 250 }),
      transfer({ type: "internalTransfer", amountUsd: -100 }),
      // Moves nothing in or out of the account.
      transfer({ type: "accountClassTransfer", amountUsd: 9999 }),
      // An unpriced token transfer can't be valued.
      transfer({ type: "spotTransfer", amountUsd: null }),
    ]);
    expect(flow).toEqual({ totalDeposited: 250, totalWithdrawn: 100 });
  });

  it("skips movements whose counterparty is inside the set", () => {
    const rows = [
      transfer({ amountUsd: 500 }),
      transfer({ amountUsd: -200, counterparty: "0xbbb" }),
    ];
    expect(sumCapitalFlow(rows)).toEqual({
      totalDeposited: 500,
      totalWithdrawn: 200,
    });
    expect(sumCapitalFlow(rows, new Set(["0xbbb"]))).toEqual({
      totalDeposited: 500,
      totalWithdrawn: 0,
    });
  });
});
