import { describe, expect, it } from "vitest";
import type { HlCandle } from "../hyperliquid/types";
import { candlePoints } from "./benchmarks";

const candle = (T: number, c: string): HlCandle => ({
  t: T - 3_600_000,
  T,
  o: c,
  c,
  h: c,
  l: c,
});

describe("candlePoints", () => {
  it("stamps each close at the candle's close, not its open", () => {
    expect(candlePoints([candle(1_700_003_600_000, "6340.75")])).toEqual([
      { t: 1_700_003_600_000, c: 6340.75 },
    ]);
  });

  it("sorts ascending and keeps one point per timestamp", () => {
    const points = candlePoints([
      candle(1_700_007_200_000, "6375.2"),
      candle(1_700_003_600_000, "6340.75"),
      // The newest bar served twice, as a snapshot sometimes does: the later
      // copy is the fresher print.
      candle(1_700_007_200_000, "6380"),
    ]);
    expect(points).toEqual([
      { t: 1_700_003_600_000, c: 6340.75 },
      { t: 1_700_007_200_000, c: 6380 },
    ]);
  });

  it("drops a close that doesn't parse rather than plotting a hole", () => {
    expect(
      candlePoints([
        candle(1_700_003_600_000, "n/a"),
        candle(1_700_007_200_000, "0"),
        candle(1_700_010_800_000, "6400"),
      ]),
    ).toEqual([{ t: 1_700_010_800_000, c: 6400 }]);
  });
});
