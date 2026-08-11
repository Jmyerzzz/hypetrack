import { describe, expect, it } from "vitest";
import {
  cardRoe,
  cardTradeHref,
  findCardTrade,
  fmtLeverage,
  leverageCoins,
  leveragedPct,
  sanitizeLeverage,
} from "./card";
import type { Trade } from "./trades";

function trade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: "BTC:1700000000000:3",
    coin: "BTC",
    kind: "perp",
    direction: "long",
    status: "closed",
    truncated: false,
    liquidated: false,
    openedAt: 1_700_000_000_000,
    closedAt: 1_700_003_600_000,
    durationMs: 3_600_000,
    maxSize: 2,
    totalOpenedSz: 2,
    totalClosedSz: 2,
    avgEntryPx: 100,
    avgExitPx: 110,
    entryNotional: 200,
    exitNotional: 220,
    grossPnl: 20,
    fees: 1,
    funding: 0.5,
    fundingCovered: true,
    netPnl: 19.5,
    netPnlPct: 0.0975,
    isWin: true,
    fillCount: 2,
    slices: [],
    ...overrides,
  };
}

describe("cardTradeHref", () => {
  it("query-encodes ids so builder-DEX colons survive routing", () => {
    expect(cardTradeHref("0xabc", "xyz:AAPL:1700000000000:7")).toBe(
      "/api/card/0xabc?trade=xyz%3AAAPL%3A1700000000000%3A7",
    );
  });
});

describe("findCardTrade", () => {
  it("prefers the exact id", () => {
    const a = trade();
    const b = trade({ id: "BTC:1700000000000:4" });
    expect(findCardTrade([b, a], "BTC:1700000000000:3")).toBe(a);
  });

  it("never renders open or outcome trades, even on an exact hit", () => {
    const open = trade({ status: "open", closedAt: null });
    expect(findCardTrade([open], open.id)).toBeNull();
    const outcome = trade({ id: "#8560:1:0", coin: "#8560", kind: "outcome" });
    expect(findCardTrade([outcome], "#8560:1:0")).toBeNull();
  });

  it("survives a seq shift by matching coin + open time", () => {
    // A fill for an earlier-seen coin renumbers later trades: the shared link
    // says seq 3, the fresh reconstruction says seq 9.
    const shifted = trade({ id: "BTC:1700000000000:9" });
    expect(findCardTrade([shifted], "BTC:1700000000000:3")).toBe(shifted);
  });

  it("does not let one open time prefix-match a longer one", () => {
    const longer = trade({ id: "BTC:17000000000001:2", openedAt: 1 });
    expect(findCardTrade([longer], "BTC:1700000000000:3")).toBeNull();
  });

  it("keeps builder-DEX coins (colons in the coin) matchable on the stem", () => {
    const builder = trade({ id: "xyz:AAPL:1700000000000:9", coin: "xyz:AAPL" });
    expect(findCardTrade([builder], "xyz:AAPL:1700000000000:2")).toBe(builder);
  });

  it("rejects garbage ids instead of guessing", () => {
    expect(findCardTrade([trade()], "not-a-trade-id")).toBeNull();
    expect(findCardTrade([trade()], "")).toBeNull();
  });
});

describe("sanitizeLeverage", () => {
  it("passes positive finite numbers", () => {
    expect(sanitizeLeverage(20)).toBe(20);
    expect(sanitizeLeverage(1.5)).toBe(1.5);
  });

  it("nulls everything the API could throw at us", () => {
    expect(sanitizeLeverage(0)).toBeNull();
    expect(sanitizeLeverage(-3)).toBeNull();
    expect(sanitizeLeverage(Number.NaN)).toBeNull();
    expect(sanitizeLeverage("20")).toBeNull();
    expect(sanitizeLeverage(undefined)).toBeNull();
  });
});

describe("fmtLeverage", () => {
  it("prints whole settings bare and fractional ones to a decimal", () => {
    expect(fmtLeverage(20)).toBe("20×");
    expect(fmtLeverage(1.5)).toBe("1.5×");
  });
});

describe("leverageCoins", () => {
  it("dedupes perp coins in trade order and skips outcome markets", () => {
    const trades = [
      trade({ coin: "ETH", id: "ETH:1:0" }),
      trade({ coin: "#8560", id: "#8560:2:1", kind: "outcome" }),
      trade({ coin: "BTC", id: "BTC:3:2" }),
      trade({ coin: "ETH", id: "ETH:4:3" }),
    ];
    expect(leverageCoins(trades, 40)).toEqual(["ETH", "BTC"]);
  });

  it("stops at the cap so one account can't fan out unbounded calls", () => {
    const trades = ["A", "B", "C"].map((coin, i) =>
      trade({ coin, id: `${coin}:${i}:${i}` }),
    );
    expect(leverageCoins(trades, 2)).toEqual(["A", "B"]);
  });
});

describe("leveragedPct", () => {
  it("multiplies the net % by the setting", () => {
    expect(leveragedPct(0.05, 20)).toBeCloseTo(1.0);
  });

  it("passes the unleveraged % through when the setting is unknown", () => {
    expect(leveragedPct(0.05, undefined)).toBe(0.05);
    expect(leveragedPct(0.05, null)).toBe(0.05);
  });

  it("keeps a missing % missing", () => {
    expect(leveragedPct(null, 20)).toBeNull();
  });
});

describe("cardRoe", () => {
  it("amplifies the price return by the leverage setting", () => {
    // +10% price move at 20× = +200%, Hyperliquid's card convention.
    expect(cardRoe(trade(), 20)).toBeCloseTo(2.0);
  });

  it("signs shorts by falling prices", () => {
    const short = trade({ direction: "short", avgEntryPx: 100, avgExitPx: 90 });
    expect(cardRoe(short, 10)).toBeCloseTo(1.0);
    const shortLoss = trade({
      direction: "short",
      avgEntryPx: 100,
      avgExitPx: 110,
    });
    expect(cardRoe(shortLoss, 10)).toBeCloseTo(-1.0);
  });

  it("renders unleveraged when the setting is unavailable", () => {
    expect(cardRoe(trade(), null)).toBeCloseTo(0.1);
  });

  it("falls back to net return on peak notional for truncated entries", () => {
    const truncated = trade({
      truncated: true,
      avgEntryPx: null,
      netPnlPct: 0.05,
    });
    expect(cardRoe(truncated, 4)).toBeCloseTo(0.2);
  });

  it("has no answer when neither prices nor net % exist", () => {
    expect(
      cardRoe(trade({ avgEntryPx: null, netPnlPct: null }), 10),
    ).toBeNull();
  });
});
