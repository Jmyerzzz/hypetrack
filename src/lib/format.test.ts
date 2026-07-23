import { describe, expect, it } from "vitest";
import { dateInputMs, fmtNetPnlBreakdown } from "./format";

describe("fmtNetPnlBreakdown", () => {
  it("subtracts positive fees and adds received funding", () => {
    expect(fmtNetPnlBreakdown(714.71, 9.0, 7.48)).toBe(
      "+$714.71 − $9.00 + $7.48",
    );
  });

  it("adds a maker rebate instead of rendering a double sign", () => {
    // Negative fee = rebate; must never read "− −$1.00".
    const out = fmtNetPnlBreakdown(100, -1, 0);
    expect(out).toBe("+$100.00 + $1.00 + $0.00");
    expect(out).not.toContain("− −");
  });

  it("subtracts funding that was paid", () => {
    expect(fmtNetPnlBreakdown(-50, 2.5, -3.25)).toBe("−$50.00 − $2.50 − $3.25");
  });

  it("handles a rebate and paid funding together", () => {
    expect(fmtNetPnlBreakdown(0, -0.5, -0.25)).toBe("$0.00 + $0.50 − $0.25");
  });
});

describe("dateInputMs", () => {
  it("maps a date-input value to local midnight, not UTC", () => {
    expect(dateInputMs("2026-07-04")).toBe(new Date(2026, 6, 4).getTime());
  });

  it("rolls dayOffset across month and year boundaries", () => {
    expect(dateInputMs("2025-12-31", { dayOffset: 1 })).toBe(
      new Date(2026, 0, 1).getTime(),
    );
  });

  it("returns null for empty and malformed values", () => {
    expect(dateInputMs("")).toBeNull();
    expect(dateInputMs("yesterday")).toBeNull();
    expect(dateInputMs("2026-7-4")).toBeNull();
  });
});
