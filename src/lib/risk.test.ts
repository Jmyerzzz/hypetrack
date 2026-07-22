import { describe, expect, it } from "vitest";
import type { PortfolioPoint } from "./api-types";
import { computeTradeExcursion, pickCandleInterval } from "./excursions";
import type { HlCandle } from "./hyperliquid/types";
import {
  accountValueMaxDrawdown,
  dailyReturns,
  returnOnAvgEquity,
  sharpeSortino,
} from "./risk";
import type { Trade } from "./trades";

const DAY = 86_400_000;

function series(values: number[], stepMs = DAY): PortfolioPoint[] {
  return values.map((v, i) => ({ t: 1_700_000_000_000 + i * stepMs, v }));
}

describe("dailyReturns", () => {
  it("computes ΔPnL over prior-day equity, one sample per day", () => {
    const av = series([1000, 1000, 1000, 1000]);
    const pnl = series([0, 10, 30, 25]);
    const r = dailyReturns(av, pnl);
    expect(r).toHaveLength(3);
    expect(r[0]).toBeCloseTo(0.01);
    expect(r[1]).toBeCloseTo(0.02);
    expect(r[2]).toBeCloseTo(-0.005);
  });

  it("keeps only the last sample of each day", () => {
    // Two samples on day 0 (0 then 8), one on day 1: return uses 8 → 20.
    const av = [
      { t: 0, v: 1000 },
      { t: DAY / 2, v: 1000 },
      { t: DAY, v: 1000 },
    ];
    const pnl = [
      { t: 0, v: 0 },
      { t: DAY / 2, v: 8 },
      { t: DAY, v: 20 },
    ];
    const r = dailyReturns(av, pnl);
    expect(r).toEqual([0.012]);
  });

  it("skips days with unusable prior equity", () => {
    const av = series([0, 0.5, 1000, 1000]);
    const pnl = series([0, 1, 2, 12]);
    expect(dailyReturns(av, pnl)).toEqual([0.01]);
  });
});

describe("sharpeSortino", () => {
  it("returns nulls below the sample floor", () => {
    expect(sharpeSortino([0.01, 0.02])).toEqual({
      sharpe: null,
      sortino: null,
    });
  });

  it("computes annualized sharpe and sortino", () => {
    const returns = [0.01, -0.005, 0.02, 0.0, 0.015, -0.01, 0.005, 0.01];
    const { sharpe, sortino } = sharpeSortino(returns);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(
      returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length,
    );
    expect(sharpe).toBeCloseTo((mean / std) * Math.sqrt(365), 6);
    expect(typeof sortino).toBe("number");
    expect(sortino as number).toBeGreaterThan(sharpe as number);
  });

  it("reports ∞ sortino when there are no losing days", () => {
    const { sortino } = sharpeSortino([
      0.01, 0.02, 0.005, 0.01, 0.03, 0.001, 0.02, 0.01,
    ]);
    expect(sortino).toBe("inf");
  });
});

describe("accountValueMaxDrawdown", () => {
  it("finds the largest peak-to-trough drop as a fraction of the running peak", () => {
    // Peak 1200 → trough 900 is the deepest relative drop (25%).
    const dd = accountValueMaxDrawdown(series([1000, 1200, 900, 1100, 1000]));
    expect(dd?.pct).toBeCloseTo(300 / 1200);
    expect(dd?.usd).toBeCloseTo(300);
  });

  it("is zero for a monotonic curve", () => {
    expect(accountValueMaxDrawdown(series([100, 200]))?.pct).toBe(0);
  });

  it("skips spurious $0 samples instead of reading them as a 100% wipeout", () => {
    // The interior 0 is a portfolio-series gap, not a real drop to zero.
    const dd = accountValueMaxDrawdown(series([1000, 0, 1100, 990]));
    expect(dd?.pct).toBeCloseTo(110 / 1100);
  });

  it("returns null when there is no positive equity", () => {
    expect(accountValueMaxDrawdown(series([0, 0]))).toBeNull();
  });
});

describe("computeTradeExcursion", () => {
  const baseTrade = (over: Partial<Trade>): Trade =>
    ({
      id: "x",
      coin: "ETH",
      direction: "long",
      status: "closed",
      truncated: false,
      liquidated: false,
      openedAt: 1000,
      closedAt: 5000,
      durationMs: 4000,
      maxSize: 2,
      totalOpenedSz: 2,
      totalClosedSz: 2,
      avgEntryPx: 100,
      avgExitPx: 105,
      entryNotional: 200,
      exitNotional: 210,
      grossPnl: 10,
      fees: 0,
      funding: 0,
      fundingCovered: true,
      netPnl: 10,
      netPnlPct: 0.05,
      isWin: true,
      fillCount: 2,
      slices: [],
      ...over,
    }) as Trade;

  const candle = (t: number, h: number, l: number): HlCandle => ({
    t,
    T: t + 999,
    o: "0",
    c: "0",
    h: String(h),
    l: String(l),
  });

  it("long: MFE from highs, MAE from lows, within the holding window", () => {
    const ex = computeTradeExcursion(baseTrade({}), [
      candle(0, 500, 1), // before open — ignored
      candle(1500, 110, 95),
      candle(3000, 120, 98),
      candle(6000, 500, 1), // after close — ignored
    ]);
    expect(ex?.mfePct).toBeCloseTo(0.2); // 120 vs 100
    expect(ex?.maePct).toBeCloseTo(0.05); // 95 vs 100
    expect(ex?.mfeUsd).toBeCloseTo(0.2 * 200);
  });

  it("short: MFE from lows, MAE from highs", () => {
    const ex = computeTradeExcursion(baseTrade({ direction: "short" }), [
      candle(2000, 108, 90),
    ]);
    expect(ex?.mfePct).toBeCloseTo(0.1); // fell to 90
    expect(ex?.maePct).toBeCloseTo(0.08); // rose to 108
  });

  it("includes fill prices as excursion extremes", () => {
    const trade = baseTrade({
      slices: [
        {
          tid: 1,
          time: 2000,
          px: 130,
          sz: 1,
          action: "close",
          fee: 0,
          closedPnl: 30,
          hash: "0x",
          crossed: true,
          liquidation: false,
          twap: false,
        },
      ],
    });
    const ex = computeTradeExcursion(trade, [candle(1500, 110, 99)]);
    expect(ex?.mfePct).toBeCloseTo(0.3); // the 130 fill beats the 110 candle high
  });

  it("excludes candles that only partially overlap the holding window", () => {
    // A coarse candle spanning the open (t=500..1499) carries a pre-open
    // spike to 500; strict containment must ignore it.
    const ex = computeTradeExcursion(baseTrade({}), [
      { t: 500, T: 1499, o: "0", c: "0", h: "500", l: "1" },
      candle(2000, 112, 96),
    ]);
    expect(ex?.mfePct).toBeCloseTo(0.12);
    expect(ex?.maePct).toBeCloseTo(0.04);
  });

  it("returns null without a known entry price", () => {
    expect(
      computeTradeExcursion(baseTrade({ avgEntryPx: null }), [
        candle(2000, 110, 90),
      ]),
    ).toBeNull();
  });
});

describe("pickCandleInterval", () => {
  it("scales the interval with the window span", () => {
    expect(pickCandleInterval(2 * DAY).interval).toBe("15m");
    expect(pickCandleInterval(60 * DAY).interval).toBe("1h");
    expect(pickCandleInterval(400 * DAY).interval).toBe("4h");
    expect(pickCandleInterval(5000 * DAY).interval).toBe("1d");
  });
});

describe("returnOnAvgEquity", () => {
  it("divides window PnL by the time-averaged equity", () => {
    // Equity holds 1000, then 3000 for equal time → avg 1750 (trapezoid:
    // segments avg 1000, 2000, 3000 → (1000+2000+3000)/3).
    const equity = series([1000, 1000, 3000, 3000]);
    const pnl = series([0, 50, 50, 350]);
    expect(returnOnAvgEquity(equity, pnl)).toBeCloseTo(350 / 2000);
  });

  it("is unaffected by a mid-window deposit", () => {
    // Same PnL, but a deposit doubles equity halfway: the denominator grows,
    // the % shrinks — it never explodes off a tiny starting base.
    const flat = returnOnAvgEquity(
      series([1000, 1000, 1000]),
      series([0, 0, 100]),
    );
    const deposited = returnOnAvgEquity(
      series([1000, 1000, 3000]),
      series([0, 0, 100]),
    );
    expect(flat).toBeCloseTo(0.1);
    expect(deposited as number).toBeLessThan(flat as number);
    expect(deposited).toBeCloseTo(100 / 1500);
  });

  it("returns null for dust accounts and single samples", () => {
    expect(returnOnAvgEquity(series([5, 5, 5]), series([0, 1, 2]))).toBeNull();
    expect(returnOnAvgEquity(series([1000]), series([0]))).toBeNull();
  });

  it("handles irregular sampling via time weighting", () => {
    // 1000 for 1 day, then 4000 for 3 days → avg = (1000·1 + wait — trapezoid
    // across the jump: segment avgs 2500 (1d), 4000 (3d) → 3625.
    const equity = [
      { t: 0, v: 1000 },
      { t: DAY, v: 4000 },
      { t: 4 * DAY, v: 4000 },
    ];
    const pnl = [
      { t: 0, v: 0 },
      { t: DAY, v: 0 },
      { t: 4 * DAY, v: 362.5 },
    ];
    expect(returnOnAvgEquity(equity, pnl)).toBeCloseTo(0.1);
  });
});

describe("dailyReturns partial-day exclusion", () => {
  it("drops the current incomplete UTC day", () => {
    const t0 = 1_700_000_000_000;
    const day0 = Math.floor(t0 / DAY) * DAY;
    const HOUR = 3_600_000;
    // Realistic sampling: last sample of each day lands late in the day.
    const av = [
      { t: day0 + 12 * HOUR, v: 1000 },
      { t: day0 + DAY + 23 * HOUR, v: 1000 },
      { t: day0 + 2 * DAY + 23 * HOUR, v: 1000 },
      { t: day0 + 3 * DAY + 1 * HOUR, v: 1000 }, // 1h into "today"
    ];
    const pnl = [
      { t: day0 + 12 * HOUR, v: 0 },
      { t: day0 + DAY + 23 * HOUR, v: 10 },
      { t: day0 + 2 * DAY + 23 * HOUR, v: 30 },
      { t: day0 + 3 * DAY + 1 * HOUR, v: 31 },
    ];
    const now = day0 + 3 * DAY + 2 * HOUR;
    const r = dailyReturns(av, pnl, now);
    // Today's partial +1 must not appear; the two complete-day returns must.
    expect(r).toEqual([0.01, 0.02]);
  });
});
