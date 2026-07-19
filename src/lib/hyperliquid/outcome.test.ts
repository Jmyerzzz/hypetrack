import { describe, expect, it } from "vitest";
import {
  buildOutcomeIndex,
  describeOutcomeCoin,
  isOutcomeCoin,
  parseOutcomeCoin,
  toMarketCoin,
} from "./outcome";
import type { HlOutcomeMeta } from "./types";

/** Trimmed from a live `outcomeMeta` response. */
const META: HlOutcomeMeta = {
  outcomes: [
    {
      outcome: 171,
      name: "Fallback",
      description: "",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
      quoteToken: "USDC",
    },
    {
      outcome: 212,
      name: "Spain",
      description:
        "This outcome resolves to Yes if Spain is officially declared the 2026 FIFA World Cup champion.",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
      quoteToken: "USDC",
    },
    {
      outcome: 856,
      name: "World Cup Final: Spain vs Argentina",
      description: "The market resolves to Spain if FIFA officially declares…",
      sideSpecs: [{ name: "Spain" }, { name: "Argentina" }],
      quoteToken: "USDC",
    },
    {
      outcome: 873,
      name: "Recurring",
      description:
        "class:priceBinary|underlying:BTC|expiry:20260720-0600|targetPrice:64715|period:1d",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
      quoteToken: "USDC",
    },
    {
      outcome: 877,
      name: "Recurring Fallback",
      description: "other",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
      quoteToken: "USDC",
    },
    {
      outcome: 878,
      name: "Recurring Named Outcome",
      description: "index:0",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
      quoteToken: "USDC",
    },
    {
      outcome: 879,
      name: "Recurring Named Outcome",
      description: "index:1",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
      quoteToken: "USDC",
    },
    {
      outcome: 880,
      name: "Recurring Named Outcome",
      description: "index:2",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
      quoteToken: "USDC",
    },
  ],
  questions: [
    {
      question: 32,
      name: "2026 World Cup Champion",
      description:
        "Each associated outcome corresponds to a team… metadata=category:sports|subCategory:football",
      fallbackOutcome: 171,
      namedOutcomes: [212],
      settledNamedOutcomes: [174, 175],
    },
    {
      question: 149,
      name: "Recurring",
      description:
        "class:priceBucket|underlying:BTC|expiry:20260720-0600|priceThresholds:63420,66009|period:1d",
      fallbackOutcome: 877,
      namedOutcomes: [878, 879, 880],
    },
  ],
};

const index = buildOutcomeIndex(META);
const describe_ = (coin: string) => describeOutcomeCoin(coin, index);

describe("outcome coin parsing", () => {
  it("recognizes both spellings of a side token and normalizes them", () => {
    expect(isOutcomeCoin("#8560")).toBe(true);
    expect(isOutcomeCoin("+8560")).toBe(true);
    expect(toMarketCoin("+8560")).toBe("#8560");
    expect(toMarketCoin("#8560")).toBe("#8560");
  });

  it("does not claim perp, spot, builder-dex, or question coins", () => {
    for (const coin of [
      "BTC",
      "kPEPE",
      "@107",
      "PURR/USDC",
      "xyz:AAPL",
      "o498",
    ]) {
      expect(isOutcomeCoin(coin)).toBe(false);
      expect(parseOutcomeCoin(coin)).toBeNull();
    }
  });

  it("splits the id into outcome and side", () => {
    expect(parseOutcomeCoin("#8560")).toEqual({ outcomeId: 856, sideIndex: 0 });
    expect(parseOutcomeCoin("+8561")).toEqual({ outcomeId: 856, sideIndex: 1 });
    // Single-digit ids still encode a side: #5 is outcome 0, side 5.
    expect(parseOutcomeCoin("#5")).toEqual({ outcomeId: 0, sideIndex: 5 });
  });
});

describe("outcome market labels", () => {
  it("names an outcome under its question", () => {
    expect(describe_("#2120")).toMatchObject({
      coin: "#2120",
      title: "Spain",
      question: "2026 World Cup Champion",
      sideName: "Yes",
      known: true,
    });
    expect(describe_("+2121")?.sideName).toBe("No");
  });

  it("takes side names from the market, never assuming Yes/No", () => {
    expect(describe_("#8560")).toMatchObject({
      title: "World Cup Final: Spain vs Argentina",
      sideName: "Spain",
      question: null,
    });
    expect(describe_("#8561")?.sideName).toBe("Argentina");
  });

  it("decodes generated price-binary markets and their expiry", () => {
    const view = describe_("#8730");
    expect(view?.title).toBe("BTC ≥ 64,715");
    expect(view?.expiry).toBe(Date.UTC(2026, 6, 20, 6, 0));
  });

  it("decodes price buckets from thresholds on the question", () => {
    expect(describe_("#8780")?.title).toBe("BTC < 63,420");
    expect(describe_("#8790")?.title).toBe("BTC 63,420 – 66,009");
    expect(describe_("#8800")?.title).toBe("BTC ≥ 66,009");
    // Bucket outcomes inherit the question's expiry, which they don't carry.
    expect(describe_("#8790")?.expiry).toBe(Date.UTC(2026, 6, 20, 6, 0));
  });

  it("labels the catch-all outcome rather than showing 'Fallback'", () => {
    expect(describe_("#1710")?.title).toBe("Any other outcome");
    expect(describe_("#8770")?.title).toBe("Any other outcome");
  });

  it("keeps the question for a settled outcome that lost its own metadata", () => {
    expect(describe_("#1740")).toMatchObject({
      title: "Outcome 174",
      question: "2026 World Cup Champion",
      sideName: "Side A",
      known: false,
    });
  });

  it("degrades to the raw id when nothing is known about the market", () => {
    expect(describe_("#99991")).toMatchObject({
      coin: "#99991",
      title: "Outcome 9999",
      question: null,
      sideName: "Side B",
      known: false,
    });
  });

  it("returns null for coins that are not outcome markets", () => {
    expect(describe_("BTC")).toBeNull();
  });
});
