import { afterEach, describe, expect, it, vi } from "vitest";
import type { BenchmarksPayload } from "../api-types";

/**
 * The index waterfall. Each upstream here turns away datacenter traffic in its
 * own way — a status, a one-line refusal served with a 200 — so what matters
 * is that any one of them answering is enough, and that when none do, the
 * payload carries what each of them said.
 */

vi.mock("../hyperliquid/client", () => ({
  fetchCandles: vi.fn(async () => [{ T: 1_700_000_000_000, c: "60000" }]),
}));

type Reply = { status?: number; body: string; cookie?: string };

function stubFetch(route: (url: string) => Reply): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : String(input);
    const { status = 200, body, cookie } = route(url);
    return new Response(body, {
      status,
      headers: cookie ? { "set-cookie": cookie } : undefined,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A fresh module graph per test, so the process-wide price cache starts empty. */
async function loadBenchmarks() {
  vi.resetModules();
  (globalThis as Record<string, unknown>).__hypesleuthCache = undefined;
  return (await import("./benchmarks")).getBenchmarks;
}

const YAHOO_OK = JSON.stringify({
  chart: {
    result: [
      {
        timestamp: [1_700_000_000],
        indicators: { quote: [{ close: [4500.5] }] },
      },
    ],
  },
});
const STOOQ_OK = "Date,Open,High,Low,Close,Volume\n2026-08-21,1,1,1,6340.75,0";
const FRED_OK = "observation_date,SP500\n2026-08-21,6340.75";

const sourceOf = (payload: BenchmarksPayload, id: string) =>
  payload.series.find((s) => s.id === id);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getBenchmarks index waterfall", () => {
  it("takes Yahoo when it answers, without paying for the crumb handshake", async () => {
    const fetchMock = stubFetch(() => ({ body: YAHOO_OK }));
    const payload = await (await loadBenchmarks())("week");

    expect(sourceOf(payload, "spx")?.source).toBe("Yahoo Finance");
    expect(sourceOf(payload, "spx")?.points).toHaveLength(1);
    expect(sourceOf(payload, "spx")?.error).toBeNull();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("getcrumb"))).toBe(false);
  });

  it("retries a refused Yahoo request with a session cookie and crumb", async () => {
    const fetchMock = stubFetch((url) => {
      if (url.includes("fc.yahoo.com")) {
        return { status: 404, body: "", cookie: "A1=token; Path=/" };
      }
      if (url.includes("getcrumb")) return { body: "abc123" };
      // Anonymous is turned away the way a cloud IP actually is; the retry
      // carrying the crumb is the one that gets served.
      if (url.includes("query1"))
        return { status: 401, body: "Invalid Cookie" };
      return { body: YAHOO_OK };
    });
    const payload = await (await loadBenchmarks())("week");

    expect(sourceOf(payload, "spx")?.source).toBe("Yahoo Finance");
    const chart = fetchMock.mock.calls
      .map((c) => String(c[0]))
      .find((u) => u.includes("query2") && u.includes("/chart/"));
    expect(chart).toContain("crumb=abc123");
  });

  it("falls through to Stooq, then to FRED, when the ones before decline", async () => {
    stubFetch((url) => {
      if (url.includes("yahoo")) return { status: 429, body: "" };
      // Stooq declines in prose, with a 200 like any other body.
      if (url.includes("stooq"))
        return { body: "Exceeded the daily hits limit" };
      return { body: FRED_OK };
    });
    const payload = await (await loadBenchmarks())("week");

    expect(sourceOf(payload, "spx")?.source).toBe("FRED");
    expect(sourceOf(payload, "ndx")?.source).toBe("FRED");
    expect(sourceOf(payload, "spx")?.points).toHaveLength(1);
  });

  it("uses Stooq's second hostname when the first is over its quota", async () => {
    stubFetch((url) => {
      if (url.includes("yahoo")) return { status: 429, body: "" };
      if (url.includes("stooq.com"))
        return { body: "Exceeded the daily hits limit" };
      if (url.includes("stooq.pl")) return { body: STOOQ_OK };
      return { status: 500, body: "" };
    });
    const payload = await (await loadBenchmarks())("week");

    expect(sourceOf(payload, "spx")?.source).toBe("Stooq");
  });

  it("reports what every upstream said rather than a bare empty series", async () => {
    stubFetch((url) => {
      if (url.includes("yahoo")) return { status: 429, body: "" };
      if (url.includes("stooq"))
        return { body: "Exceeded the daily hits limit" };
      return { status: 503, body: "" };
    });
    const payload = await (await loadBenchmarks())("week");

    const spx = sourceOf(payload, "spx");
    expect(spx?.points).toEqual([]);
    expect(spx?.source).toBeNull();
    expect(spx?.error).toContain("Yahoo Finance: HTTP 429");
    expect(spx?.error).toContain("Stooq: exceeded the daily hits limit");
    expect(spx?.error).toContain("FRED: HTTP 503");
  });

  it("keeps the benchmarks that answered when one can't be loaded", async () => {
    stubFetch(() => ({ status: 500, body: "" }));
    const payload = await (await loadBenchmarks())("week");

    // BTC rides on Hyperliquid's own API, so an index outage never touches it.
    expect(sourceOf(payload, "btc")?.source).toBe("Hyperliquid");
    expect(sourceOf(payload, "btc")?.points).toHaveLength(1);
    expect(sourceOf(payload, "spx")?.points).toEqual([]);
  });
});
