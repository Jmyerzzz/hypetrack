import { describe, expect, it } from "vitest";
import {
  alignPrices,
  type BenchmarkPoint,
  benchmarkCurve,
  benchmarkReturn,
  isBenchmarkId,
  isBenchmarkPeriod,
  normalizePoints,
} from "./benchmarks";

const HOUR = 3_600_000;
const T0 = 1_700_000_000_000;

function prices(values: number[], stepMs = HOUR, from = T0): BenchmarkPoint[] {
  return values.map((c, i) => ({ t: from + i * stepMs, c }));
}

describe("normalizePoints", () => {
  it("drops non-positive and non-finite closes", () => {
    const points = normalizePoints([
      { t: T0, c: 100 },
      { t: T0 + 1, c: 0 },
      { t: T0 + 2, c: Number.NaN },
      { t: Number.NaN, c: 5 },
      { t: T0 + 3, c: 101 },
    ]);
    expect(points).toEqual([
      { t: T0, c: 100 },
      { t: T0 + 3, c: 101 },
    ]);
  });

  it("sorts ascending and keeps the last close per timestamp", () => {
    const points = normalizePoints([
      { t: T0 + HOUR, c: 110 },
      { t: T0, c: 100 },
      { t: T0 + HOUR, c: 111 },
    ]);
    expect(points).toEqual([
      { t: T0, c: 100 },
      { t: T0 + HOUR, c: 111 },
    ]);
  });
});

describe("alignPrices", () => {
  it("carries the last close forward across gaps", () => {
    // A close at T0 and one two hours later: the hour in between holds the
    // older price, the way an index holds its Friday close over a weekend.
    const points = [
      { t: T0, c: 100 },
      { t: T0 + 2 * HOUR, c: 120 },
    ];
    expect(
      alignPrices(points, [T0, T0 + HOUR, T0 + 2 * HOUR, T0 + 3 * HOUR]),
    ).toEqual([100, 100, 120, 120]);
  });

  it("has no price before the first close rather than borrowing a later one", () => {
    expect(alignPrices(prices([100, 110]), [T0 - HOUR, T0, T0 + HOUR])).toEqual(
      [null, 100, 110],
    );
  });

  it("takes the newest close at or before each time", () => {
    const points = prices([100, 110, 120], HOUR / 4);
    // Two quarter-hour closes have passed by the half hour.
    expect(alignPrices(points, [T0 + HOUR / 2])).toEqual([120]);
  });

  it("returns all nulls without prices", () => {
    expect(alignPrices([], [T0, T0 + HOUR])).toEqual([null, null]);
  });
});

describe("benchmarkReturn", () => {
  it("measures last over first across the plotted window", () => {
    const times = [T0, T0 + HOUR, T0 + 2 * HOUR];
    expect(benchmarkReturn(prices([100, 105, 125]), times)).toBeCloseTo(0.25);
  });

  it("bases on the first *plotted* point, not the first price fetched", () => {
    // Prices reach back an hour before the window; the window opens at 110.
    const points = prices([100, 110, 121]);
    expect(benchmarkReturn(points, [T0 + HOUR, T0 + 2 * HOUR])).toBeCloseTo(
      0.1,
    );
  });

  it("is null when no price covers the window", () => {
    expect(benchmarkReturn(prices([100]), [T0 - HOUR])).toBeNull();
    expect(benchmarkReturn([], [T0])).toBeNull();
  });
});

describe("benchmarkCurve", () => {
  const times = [T0, T0 + HOUR, T0 + 2 * HOUR];

  it("starts value mode at the stake and tracks the benchmark's growth", () => {
    const curve = benchmarkCurve(prices([100, 110, 90]), times, 1000, "value");
    expect(curve?.values).toEqual([1000, 1100, 900]);
    expect(curve?.totalReturn).toBeCloseTo(-0.1);
    expect(curve?.partial).toBe(false);
  });

  it("starts pnl mode at zero, matching the chart's rebased PnL curve", () => {
    const curve = benchmarkCurve(prices([100, 110, 90]), times, 1000, "pnl");
    expect(curve?.values[0]).toBe(0);
    expect(curve?.values[1]).toBeCloseTo(100);
    expect(curve?.values[2]).toBeCloseTo(-100);
  });

  it("leaves points before the first close empty and flags them", () => {
    const curve = benchmarkCurve(
      prices([100, 200], HOUR, T0 + HOUR),
      times,
      1000,
      "value",
    );
    expect(curve?.values).toEqual([null, 1000, 2000]);
    expect(curve?.partial).toBe(true);
  });

  it("is null without a stake to buy in with, or without prices", () => {
    expect(benchmarkCurve(prices([100, 110]), times, 0, "value")).toBeNull();
    expect(
      benchmarkCurve(prices([100]), [T0 - HOUR], 1000, "value"),
    ).toBeNull();
    expect(benchmarkCurve([], times, 1000, "value")).toBeNull();
  });

  it("agrees with benchmarkReturn over the same window", () => {
    const points = prices([100, 130, 125]);
    const curve = benchmarkCurve(points, times, 500, "value");
    expect(curve?.totalReturn).toBeCloseTo(
      benchmarkReturn(points, times) as number,
    );
  });
});

describe("id and period guards", () => {
  it("accepts only known benchmarks and periods", () => {
    expect(isBenchmarkId("btc")).toBe(true);
    expect(isBenchmarkId("eth")).toBe(false);
    expect(isBenchmarkPeriod("allTime")).toBe(true);
    expect(isBenchmarkPeriod("year")).toBe(false);
  });
});
