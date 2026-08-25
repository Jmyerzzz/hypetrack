import { describe, expect, it } from "vitest";
import { summarizeTrades } from "./stats";
import type { Trade } from "./trades";

/** A closed trade whose only interesting property is its net PnL. */
function trade(netPnl: number, over: Partial<Trade> = {}): Trade {
  return {
    id: `t${netPnl}${over.status ?? ""}`,
    coin: "ETH",
    kind: "perp",
    direction: "long",
    status: "closed",
    truncated: false,
    liquidated: false,
    openedAt: 1_700_000_000_000,
    closedAt: 1_700_000_100_000,
    durationMs: 100_000,
    maxSize: 1,
    totalOpenedSz: 1,
    totalClosedSz: 1,
    avgEntryPx: 100,
    avgExitPx: 100 + netPnl,
    entryNotional: 100,
    exitNotional: 100 + netPnl,
    grossPnl: netPnl,
    fees: 0,
    funding: 0,
    fundingCovered: true,
    netPnl,
    netPnlPct: netPnl / 100,
    // Matches the engine's own verdict rule: under a cent is flat.
    isWin: Math.abs(netPnl) < 0.01 ? null : netPnl > 0,
    fillCount: 2,
    slices: [],
    ...over,
  };
}

describe("R multiples", () => {
  it("sizes R from the average loss and reports reward against it", () => {
    // Losses of 40 and 60 → R = 50. Wins of 150 and 50 → avg win 100 = 2R.
    const s = summarizeTrades([trade(150), trade(50), trade(-40), trade(-60)]);
    expect(s.avgLoss).toBeCloseTo(-50);
    expect(s.avgRiskReward).toBeCloseTo(2);
    // +100 net over a 50 R.
    expect(s.totalR).toBeCloseTo(2);
  });

  it("keeps the wins × R:R − losses identity", () => {
    const s = summarizeTrades([
      trade(220),
      trade(80),
      trade(30),
      trade(-25),
      trade(-75),
    ]);
    const expected = s.wins * (s.avgRiskReward as number) - s.losses;
    expect(s.totalR).toBeCloseTo(expected);
  });

  it("goes negative when the losses outweigh the wins", () => {
    const s = summarizeTrades([trade(20), trade(-100), trade(-100)]);
    expect(s.avgRiskReward).toBeCloseTo(0.2);
    expect(s.totalR).toBeCloseTo(-1.8);
  });

  it("has no R unit until a trade has actually lost", () => {
    const s = summarizeTrades([trade(120), trade(80)]);
    expect(s.avgRiskReward).toBeNull();
    expect(s.totalR).toBeNull();
  });

  it("reports a loss-only account as a pure drawdown in R", () => {
    const s = summarizeTrades([trade(-30), trade(-30)]);
    // No wins, so there is no reward to compare — but the damage still counts.
    expect(s.avgRiskReward).toBeNull();
    expect(s.totalR).toBeCloseTo(-2);
  });

  it("leaves out open trades and break-even ones", () => {
    const settled = summarizeTrades([trade(100), trade(-50)]);
    const noisy = summarizeTrades([
      trade(100),
      trade(-50),
      // Under a cent: the engine calls it flat, and a flat trade is not an
      // outcome to count in R.
      trade(0.004),
      // Still running: its PnL isn't booked yet.
      trade(999, { status: "open", closedAt: null, durationMs: null }),
    ]);
    expect(noisy.totalR).toBeCloseTo(settled.totalR as number);
    expect(noisy.avgRiskReward).toBeCloseTo(settled.avgRiskReward as number);
    expect(noisy.totalR).toBeCloseTo(1);
  });
});
