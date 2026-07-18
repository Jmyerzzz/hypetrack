import { describe, expect, it } from "vitest";
import type { HlFill, HlFundingEvent } from "./hyperliquid/types";
import { computeStats } from "./stats";
import { attributeFunding, groupTrades } from "./trades";

let tid = 1;
function fill(
  overrides: Partial<HlFill> &
    Pick<HlFill, "coin" | "px" | "sz" | "side" | "time" | "startPosition">,
): HlFill {
  return {
    dir: "",
    closedPnl: "0.0",
    hash: "0xabc",
    oid: tid,
    crossed: true,
    fee: "0.0",
    tid: tid++,
    feeToken: "USDC",
    ...overrides,
  };
}

function funding(time: number, coin: string, usdc: string): HlFundingEvent {
  return {
    time,
    hash: "0x0",
    delta: {
      type: "funding",
      coin,
      usdc,
      szi: "1",
      fundingRate: "0.0001",
      nSamples: 1,
    },
  };
}

describe("groupTrades", () => {
  it("groups a simple open/close into one winning long trade", () => {
    const trades = groupTrades([
      fill({
        coin: "ETH",
        px: "2000",
        sz: "1",
        side: "B",
        time: 1000,
        startPosition: "0.0",
        fee: "1.0",
      }),
      fill({
        coin: "ETH",
        px: "2100",
        sz: "1",
        side: "A",
        time: 2000,
        startPosition: "1.0",
        fee: "1.05",
        closedPnl: "100.0",
      }),
    ]);
    expect(trades).toHaveLength(1);
    const t = trades[0];
    expect(t.direction).toBe("long");
    expect(t.status).toBe("closed");
    expect(t.avgEntryPx).toBeCloseTo(2000);
    expect(t.avgExitPx).toBeCloseTo(2100);
    expect(t.grossPnl).toBeCloseTo(100);
    expect(t.fees).toBeCloseTo(2.05);
    expect(t.netPnl).toBeCloseTo(97.95);
    expect(t.isWin).toBe(true);
    expect(t.durationMs).toBe(1000);
    expect(t.maxSize).toBeCloseTo(1);
    expect(t.truncated).toBe(false);
  });

  it("handles scale-ins and partial closes with weighted averages", () => {
    const trades = groupTrades([
      fill({
        coin: "ETH",
        px: "2000",
        sz: "1",
        side: "B",
        time: 1,
        startPosition: "0.0",
      }),
      fill({
        coin: "ETH",
        px: "2200",
        sz: "1",
        side: "B",
        time: 2,
        startPosition: "1.0",
      }),
      fill({
        coin: "ETH",
        px: "2300",
        sz: "0.5",
        side: "A",
        time: 3,
        startPosition: "2.0",
        closedPnl: "100.0",
      }),
      fill({
        coin: "ETH",
        px: "2000",
        sz: "1.5",
        side: "A",
        time: 4,
        startPosition: "1.5",
        closedPnl: "-150.0",
      }),
    ]);
    expect(trades).toHaveLength(1);
    const t = trades[0];
    expect(t.avgEntryPx).toBeCloseTo(2100);
    expect(t.maxSize).toBeCloseTo(2);
    expect(t.totalOpenedSz).toBeCloseTo(2);
    expect(t.totalClosedSz).toBeCloseTo(2);
    expect(t.grossPnl).toBeCloseTo(-50);
    expect(t.isWin).toBe(false);
    expect(t.fillCount).toBe(4);
  });

  it("splits a direction flip into two trades with prorated fees", () => {
    const trades = groupTrades([
      fill({
        coin: "SOL",
        px: "100",
        sz: "1",
        side: "B",
        time: 1,
        startPosition: "0.0",
      }),
      fill({
        coin: "SOL",
        px: "110",
        sz: "3",
        side: "A",
        time: 2,
        startPosition: "1.0",
        fee: "0.3",
        closedPnl: "10.0",
      }),
      fill({
        coin: "SOL",
        px: "100",
        sz: "2",
        side: "B",
        time: 3,
        startPosition: "-2.0",
        closedPnl: "20.0",
      }),
    ]);
    expect(trades).toHaveLength(2);
    const short = trades[0]; // most recent activity first
    const long = trades[1];
    expect(long.direction).toBe("long");
    expect(long.grossPnl).toBeCloseTo(10);
    expect(long.fees).toBeCloseTo(0.1);
    expect(long.status).toBe("closed");
    expect(short.direction).toBe("short");
    expect(short.avgEntryPx).toBeCloseTo(110);
    expect(short.fees).toBeCloseTo(0.2);
    expect(short.grossPnl).toBeCloseTo(20);
    expect(short.maxSize).toBeCloseTo(2);
  });

  it("marks trades whose open predates the window as truncated", () => {
    const trades = groupTrades([
      fill({
        coin: "BTC",
        px: "70000",
        sz: "5",
        side: "A",
        time: 10,
        startPosition: "5.0",
        closedPnl: "500.0",
      }),
    ]);
    expect(trades).toHaveLength(1);
    const t = trades[0];
    expect(t.truncated).toBe(true);
    expect(t.direction).toBe("long");
    expect(t.status).toBe("closed");
    expect(t.avgEntryPx).toBeNull();
    expect(t.grossPnl).toBeCloseTo(500);
  });

  it("keeps unclosed positions as open trades", () => {
    const trades = groupTrades([
      fill({
        coin: "ETH",
        px: "2000",
        sz: "2",
        side: "B",
        time: 1,
        startPosition: "0.0",
      }),
      fill({
        coin: "ETH",
        px: "2500",
        sz: "1",
        side: "A",
        time: 2,
        startPosition: "2.0",
        closedPnl: "500.0",
      }),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0].status).toBe("open");
    expect(trades[0].isWin).toBeNull();
    expect(trades[0].grossPnl).toBeCloseTo(500);
    expect(trades[0].closedAt).toBeNull();
  });

  it("flags liquidations of the user but not liquidator-side fills", () => {
    const me = "0x1111111111111111111111111111111111111111";
    const trades = groupTrades(
      [
        fill({
          coin: "DOGE",
          px: "0.1",
          sz: "100",
          side: "B",
          time: 1,
          startPosition: "0.0",
        }),
        fill({
          coin: "DOGE",
          px: "0.08",
          sz: "100",
          side: "A",
          time: 2,
          startPosition: "100.0",
          closedPnl: "-2.0",
          liquidation: { liquidatedUser: me, markPx: "0.08", method: "market" },
        }),
        fill({
          coin: "PEPE",
          px: "0.00001",
          sz: "1000",
          side: "B",
          time: 3,
          startPosition: "0.0",
        }),
        fill({
          coin: "PEPE",
          px: "0.00002",
          sz: "1000",
          side: "A",
          time: 4,
          startPosition: "1000.0",
          closedPnl: "0.01",
          liquidation: {
            liquidatedUser: "0x2222222222222222222222222222222222222222",
          },
        }),
      ],
      me,
    );
    const doge = trades.find((t) => t.coin === "DOGE");
    const pepe = trades.find((t) => t.coin === "PEPE");
    expect(doge?.liquidated).toBe(true);
    expect(pepe?.liquidated).toBe(false);
  });

  it("ignores spot fills", () => {
    const trades = groupTrades([
      fill({
        coin: "@107",
        px: "40",
        sz: "10",
        side: "B",
        time: 1,
        startPosition: "0.0",
      }),
      fill({
        coin: "PURR/USDC",
        px: "0.2",
        sz: "50",
        side: "B",
        time: 2,
        startPosition: "0.0",
      }),
    ]);
    expect(trades).toHaveLength(0);
  });

  it("treats near-zero residual sizes as closed (float noise)", () => {
    const trades = groupTrades([
      fill({
        coin: "ETH",
        px: "2000",
        sz: "0.3",
        side: "B",
        time: 1,
        startPosition: "0.0",
      }),
      fill({
        coin: "ETH",
        px: "2000",
        sz: "0.1",
        side: "A",
        time: 2,
        startPosition: "0.3",
      }),
      fill({
        coin: "ETH",
        px: "2000",
        sz: "0.2",
        side: "A",
        time: 3,
        startPosition: "0.2",
      }),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0].status).toBe("closed");
  });
});

describe("attributeFunding", () => {
  it("sums funding inside the holding window and flags coverage", () => {
    const trades = groupTrades([
      fill({
        coin: "ETH",
        px: "2000",
        sz: "1",
        side: "B",
        time: 1000,
        startPosition: "0.0",
      }),
      fill({
        coin: "ETH",
        px: "2100",
        sz: "1",
        side: "A",
        time: 5000,
        startPosition: "1.0",
        closedPnl: "100.0",
      }),
      fill({
        coin: "BTC",
        px: "70000",
        sz: "1",
        side: "B",
        time: 6000,
        startPosition: "0.0",
      }),
    ]);
    attributeFunding(trades, {
      coverageStart: 0,
      coverageEnd: Number.POSITIVE_INFINITY,
      events: [
        funding(500, "ETH", "9.0"), // before open — excluded
        funding(2000, "ETH", "-1.5"),
        funding(4000, "ETH", "2.5"),
        funding(6000, "ETH", "50.0"), // after close — excluded
        funding(7000, "BTC", "3.0"), // open BTC trade
      ],
    });
    const eth = trades.find((t) => t.coin === "ETH");
    const btc = trades.find((t) => t.coin === "BTC");
    expect(eth?.funding).toBeCloseTo(1.0);
    expect(eth?.netPnl).toBeCloseTo(101.0);
    expect(eth?.fundingCovered).toBe(true);
    expect(btc?.funding).toBeCloseTo(3.0);
  });

  it("marks coverage false when data starts after the open or ends early", () => {
    const trades = groupTrades([
      fill({
        coin: "ETH",
        px: "2000",
        sz: "1",
        side: "B",
        time: 1000,
        startPosition: "0.0",
      }),
      fill({
        coin: "ETH",
        px: "2100",
        sz: "1",
        side: "A",
        time: 9000,
        startPosition: "1.0",
      }),
    ]);
    attributeFunding(trades, {
      coverageStart: 2000,
      coverageEnd: Number.POSITIVE_INFINITY,
      events: [],
    });
    expect(trades[0].fundingCovered).toBe(false);
    attributeFunding(trades, {
      coverageStart: 0,
      coverageEnd: 8000,
      events: [],
    });
    expect(trades[0].fundingCovered).toBe(false);
    attributeFunding(trades, {
      coverageStart: 0,
      coverageEnd: 10_000,
      events: [],
    });
    expect(trades[0].fundingCovered).toBe(true);
  });
});

describe("computeStats", () => {
  it("computes win rate, profit factor, and per-coin breakdown", () => {
    const fills = [
      fill({
        coin: "ETH",
        px: "2000",
        sz: "1",
        side: "B",
        time: 1,
        startPosition: "0.0",
        fee: "1.0",
      }),
      fill({
        coin: "ETH",
        px: "2100",
        sz: "1",
        side: "A",
        time: 2,
        startPosition: "1.0",
        closedPnl: "100.0",
        fee: "1.0",
      }),
      fill({
        coin: "SOL",
        px: "100",
        sz: "10",
        side: "A",
        time: 3,
        startPosition: "0.0",
        fee: "0.5",
      }),
      fill({
        coin: "SOL",
        px: "105",
        sz: "10",
        side: "B",
        time: 4,
        startPosition: "-10.0",
        closedPnl: "-50.0",
        fee: "0.5",
      }),
    ];
    const trades = groupTrades(fills);
    const stats = computeStats(trades, fills, [
      funding(1, "ETH", "5"),
      funding(2, "BTC", "-2"),
    ]);
    expect(stats.closedCount).toBe(2);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(1);
    expect(stats.winRate).toBeCloseTo(0.5);
    expect(stats.totalNetPnl).toBeCloseTo(100 - 2 - 50 - 1);
    expect(stats.profitFactor).toBeCloseTo(98 / 51);
    expect(stats.perpVolume).toBeCloseTo(2000 + 2100 + 1000 + 1050);
    expect(stats.totalUsdcFees).toBeCloseTo(3);
    expect(stats.netFunding).toBeCloseTo(3);
    expect(stats.fundingPaid).toBeCloseTo(-2);
    expect(stats.pnlByCoin[0].coin).toBe("ETH");
    expect(stats.longs.count).toBe(1);
    expect(stats.shorts.count).toBe(1);
  });
});
