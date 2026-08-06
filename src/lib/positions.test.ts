import { describe, expect, it } from "vitest";
import { distanceFromMark } from "./positions";

describe("distanceFromMark", () => {
  it("signs the move by which side of the mark the level sits on", () => {
    // A long's liquidation sits below the mark: price has to fall to reach it.
    expect(distanceFromMark(1.9425, 2.1435)).toBeCloseTo(-0.09377);
    // A short's sits above.
    expect(distanceFromMark(2.4, 2.0)).toBeCloseTo(0.2);
  });

  it("is zero when the level is already at the mark", () => {
    expect(distanceFromMark(100, 100)).toBe(0);
  });

  it("has no answer without both prices", () => {
    expect(distanceFromMark(null, 100)).toBeNull();
    expect(distanceFromMark(100, null)).toBeNull();
    expect(distanceFromMark(undefined, undefined)).toBeNull();
  });

  it("refuses a mark that can't anchor a percentage", () => {
    // An unpriced or halted market reads as 0 — a 100% "distance" would be a
    // fabrication, and dividing by it is worse.
    expect(distanceFromMark(50, 0)).toBeNull();
    expect(distanceFromMark(50, -1)).toBeNull();
    expect(distanceFromMark(Number.NaN, 100)).toBeNull();
    expect(distanceFromMark(50, Number.POSITIVE_INFINITY)).toBeNull();
  });
});
