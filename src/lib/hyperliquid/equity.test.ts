import { describe, expect, it } from "vitest";
import { type EquityInputs, reconcileEquity } from "./equity";

const base: EquityInputs = {
  mainPerpEquity: 0,
  builderPerpEquity: 0,
  rawSpotValue: 0,
  outcomeValue: 0,
  usdcTotal: 0,
  usdcHold: 0,
};

describe("reconcileEquity", () => {
  it("nets the held USDC, not the perp equity, when perps sit on an unrealized loss", () => {
    // Posted $2500 of spot USDC as margin; the perp account is now marked at
    // $2000, i.e. a $500 unrealized loss that lives only in the perp account.
    const r = reconcileEquity({
      ...base,
      mainPerpEquity: 2000,
      usdcTotal: 3000,
      usdcHold: 2500,
      rawSpotValue: 3000,
    });
    // Spot value is the free USDC ($500), NOT usdcTotal - perpEquity ($1000).
    // The $500 loss must stay in the perp bucket, not inflate spot.
    expect(r.spotValue).toBe(500);
    expect(r.perpCollateralInSpot).toBe(2500);
    expect(r.totalEquity).toBe(2500); // 2000 perp + 500 free spot
    expect(r.freeSpotUsdc).toBe(500);
  });

  it("still nets only the held USDC when perps sit on an unrealized gain", () => {
    // Perp marked at $3000 against $2500 posted → $500 unrealized gain.
    const r = reconcileEquity({
      ...base,
      mainPerpEquity: 3000,
      usdcTotal: 3000,
      usdcHold: 2500,
      rawSpotValue: 3000,
    });
    // Not usdcTotal - perpEquity (= 0); the gain belongs to perp equity.
    expect(r.spotValue).toBe(500);
    expect(r.totalEquity).toBe(3500); // 3000 perp + 500 free spot
    expect(r.freeSpotUsdc).toBe(500);
  });

  it("reconciles the reported live account (spot ≈ $600, not ≈ $1,091)", () => {
    const r = reconcileEquity({
      ...base,
      mainPerpEquity: 2263.0266,
      usdcTotal: 3354.4229,
      usdcHold: 2753.6177,
      rawSpotValue: 3354.4229, // USDC only; MAX priced at $0
    });
    expect(r.spotValue).toBeCloseTo(600.8052, 2);
    expect(r.freeSpotUsdc).toBeCloseTo(600.8052, 2); // = tokenToAvailableAfterMaintenance
    expect(r.totalEquity).toBeCloseTo(2863.8317, 2);
    // Regression guard: the old formula reported ~$1,091 here.
    expect(r.spotValue).toBeLessThan(700);
  });

  it("adds non-USDC spot tokens to spot value without touching the USDC netting", () => {
    const r = reconcileEquity({
      ...base,
      mainPerpEquity: 2000,
      usdcTotal: 3000,
      usdcHold: 2500,
      rawSpotValue: 3150, // 3000 USDC + $150 of some token
    });
    expect(r.spotValue).toBe(650); // 500 free USDC + 150 token
    expect(r.freeSpotUsdc).toBe(500); // token doesn't affect withdrawable USDC
    expect(r.totalEquity).toBe(2650);
  });

  it("includes outcome holdings in the total but not in spot value", () => {
    const r = reconcileEquity({
      ...base,
      mainPerpEquity: 2000,
      usdcTotal: 3000,
      usdcHold: 2500,
      rawSpotValue: 3000,
      outcomeValue: 120,
    });
    expect(r.spotValue).toBe(500);
    expect(r.totalEquity).toBe(2620); // 2000 + 500 + 120
  });

  it("folds builder-DEX perp equity into perp and total", () => {
    const r = reconcileEquity({
      ...base,
      mainPerpEquity: 2000,
      builderPerpEquity: 300,
      usdcTotal: 3000,
      usdcHold: 2500,
      rawSpotValue: 3000,
    });
    expect(r.perpEquity).toBe(2300);
    // Only main-DEX collateral rides in spot USDC, so netting is unchanged.
    expect(r.perpCollateralInSpot).toBe(2500);
    expect(r.spotValue).toBe(500);
    expect(r.totalEquity).toBe(2800); // 2300 perp + 500 free spot
  });

  it("does not net a spot-order hold when there are no perps", () => {
    // $400 of USDC locked by a resting spot buy order, no perp positions.
    const r = reconcileEquity({
      ...base,
      mainPerpEquity: 0,
      usdcTotal: 1000,
      usdcHold: 400,
      rawSpotValue: 1000,
    });
    // Locked USDC is still equity — spot value and total keep the full $1000...
    expect(r.perpCollateralInSpot).toBe(0);
    expect(r.spotValue).toBe(1000);
    expect(r.totalEquity).toBe(1000);
    // ...but it is not withdrawable.
    expect(r.freeSpotUsdc).toBe(600);
  });

  it("is a no-op for a legacy wallet whose perp collateral is not held in spot", () => {
    const r = reconcileEquity({
      ...base,
      mainPerpEquity: 2000,
      usdcTotal: 1000,
      usdcHold: 0,
      rawSpotValue: 1000,
    });
    expect(r.perpCollateralInSpot).toBe(0);
    expect(r.spotValue).toBe(1000);
    expect(r.totalEquity).toBe(3000); // perp + full spot, kept separate
    expect(r.freeSpotUsdc).toBe(1000);
  });
});
