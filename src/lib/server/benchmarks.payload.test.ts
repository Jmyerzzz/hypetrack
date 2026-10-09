import { describe, expect, it, vi } from "vitest";
import type { BenchmarksPayload } from "../api-types";
import type { HlCandle } from "../hyperliquid/types";

/**
 * The payload: three Hyperliquid markets, each loaded and cached on its own,
 * so one market's bad minute never costs the chart the other two lines — and
 * what a market said when it failed travels with the payload.
 */

vi.mock("../hyperliquid/client", () => ({ fetchCandles: vi.fn() }));

const candle = (T: number, c: string): HlCandle => ({
  t: T - 60_000,
  T,
  o: c,
  c,
  h: c,
  l: c,
});

const ONE_CANDLE = [candle(1_700_000_000_000, "100")];

/** A fresh module graph per test, so the process-wide price cache starts empty. */
async function load() {
  vi.resetModules();
  (globalThis as Record<string, unknown>).__hypesleuthCache = undefined;
  const { fetchCandles } = await import("../hyperliquid/client");
  const { getBenchmarks } = await import("./benchmarks");
  // The mocked module survives the reset; its call history must not.
  vi.mocked(fetchCandles).mockReset();
  return { getBenchmarks, fetchCandles: vi.mocked(fetchCandles) };
}

const seriesOf = (payload: BenchmarksPayload, id: string) =>
  payload.series.find((s) => s.id === id);

describe("getBenchmarks", () => {
  it("prices every benchmark from Hyperliquid candles, the indices off trade.xyz's perps", async () => {
    const { getBenchmarks, fetchCandles } = await load();
    fetchCandles.mockResolvedValue(ONE_CANDLE);
    const payload = await getBenchmarks("week");

    expect(payload.series.map((s) => s.id)).toEqual(["btc", "spx", "ndx"]);
    for (const series of payload.series) {
      expect(series.source).toBe("Hyperliquid");
      expect(series.points).toEqual([{ t: 1_700_000_000_000, c: 100 }]);
      expect(series.error).toBeNull();
    }
    const requested = fetchCandles.mock.calls.map(
      ([coin, interval]) => `${coin}@${interval}`,
    );
    expect(requested).toEqual(["BTC@1h", "xyz:SP500@1h", "xyz:XYZ100@1h"]);
  });

  it("samples each window at its own interval, reaching back past the window", async () => {
    const { getBenchmarks, fetchCandles } = await load();
    fetchCandles.mockResolvedValue(ONE_CANDLE);
    const before = Date.now();
    await getBenchmarks("allTime");

    const [, interval, startTime, endTime, opts] = fetchCandles.mock.calls[0];
    expect(interval).toBe("1d");
    expect(endTime).toBeGreaterThanOrEqual(before);
    expect(endTime - startTime).toBe(5 * 365 * 86_400_000);
    // An overlay's budget, not the page's: bounded attempts, few of them.
    expect(opts?.timeoutMs).toBeLessThan(15_000);
    expect(opts?.retries).toBeLessThan(3);
  });

  it("keeps the benchmarks that answered when one market fails, and says why", async () => {
    const { getBenchmarks, fetchCandles } = await load();
    fetchCandles.mockImplementation(async (coin) => {
      if (coin === "xyz:XYZ100") {
        throw new Error("Hyperliquid API 500: no such coin");
      }
      return ONE_CANDLE;
    });
    const payload = await getBenchmarks("day");

    expect(seriesOf(payload, "btc")?.points).toHaveLength(1);
    expect(seriesOf(payload, "spx")?.points).toHaveLength(1);
    const ndx = seriesOf(payload, "ndx");
    expect(ndx?.points).toEqual([]);
    expect(ndx?.source).toBeNull();
    expect(ndx?.error).toBe("Hyperliquid API 500: no such coin");
  });

  it("reads an empty snapshot as a failure rather than a flat nothing", async () => {
    const { getBenchmarks, fetchCandles } = await load();
    fetchCandles.mockResolvedValue([]);
    const payload = await getBenchmarks("month");

    expect(seriesOf(payload, "spx")?.points).toEqual([]);
    expect(seriesOf(payload, "spx")?.error).toBe("no candles returned");
  });

  it("reports a request that ran out of time as such, not as an abort", async () => {
    const { getBenchmarks, fetchCandles } = await load();
    const aborted = new Error("This operation was aborted");
    aborted.name = "AbortError";
    fetchCandles.mockRejectedValue(aborted);
    const payload = await getBenchmarks("week");

    expect(seriesOf(payload, "btc")?.error).toBe("timed out");
  });

  it("caches per benchmark and window, so a re-render costs no request", async () => {
    const { getBenchmarks, fetchCandles } = await load();
    fetchCandles.mockResolvedValue(ONE_CANDLE);
    await getBenchmarks("week");
    await getBenchmarks("week");
    expect(fetchCandles).toHaveBeenCalledTimes(3);

    await getBenchmarks("day");
    expect(fetchCandles).toHaveBeenCalledTimes(6);
  });
});
