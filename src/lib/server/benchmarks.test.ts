import { describe, expect, it } from "vitest";
import { parseStooqCsv, parseYahooChart } from "./benchmarks";

describe("parseYahooChart", () => {
  const body = (extra: object = {}) =>
    JSON.stringify({
      chart: {
        result: [
          {
            timestamp: [1_700_000_000, 1_700_003_600, 1_700_007_200],
            indicators: { quote: [{ close: [4500.5, null, 4520.25] }] },
            ...extra,
          },
        ],
        error: null,
      },
    });

  it("zips timestamps with closes and drops bars that haven't printed", () => {
    expect(parseYahooChart(body())).toEqual([
      { t: 1_700_000_000_000, c: 4500.5 },
      { t: 1_700_007_200_000, c: 4520.25 },
    ]);
  });

  it("throws on an error payload rather than returning an empty series", () => {
    const error = JSON.stringify({
      chart: { result: null, error: { description: "No data found" } },
    });
    expect(() => parseYahooChart(error)).toThrow("No data found");
  });

  it("throws when the shape isn't the one documented", () => {
    expect(() => parseYahooChart("{}")).toThrow();
  });
});

describe("parseStooqCsv", () => {
  const csv = [
    "Date,Open,High,Low,Close,Volume",
    "2026-08-21,6300.1,6350.0,6295.4,6340.75,0",
    "2026-08-22,6340.8,6380.2,6330.1,6375.20,0",
  ].join("\n");

  it("stamps each close at the closing bell, not at midnight", () => {
    const points = parseStooqCsv(csv);
    expect(points).toHaveLength(2);
    expect(new Date(points[0].t).toISOString()).toBe(
      "2026-08-21T20:00:00.000Z",
    );
    expect(points[0].c).toBe(6340.75);
    expect(points[1].c).toBe(6375.2);
  });

  it("handles CRLF line endings and a trailing newline", () => {
    expect(parseStooqCsv(`${csv.replace(/\n/g, "\r\n")}\r\n`)).toHaveLength(2);
  });

  it("skips rows whose date can't be read", () => {
    expect(parseStooqCsv(`${csv}\nN/D,,,,,`)).toHaveLength(2);
  });

  it("throws on a non-CSV body — an error page must not read as no data", () => {
    expect(() =>
      parseStooqCsv("<html>Exceeded the daily hits limit"),
    ).toThrow();
  });
});
