import { describe, expect, it } from "vitest";
import { dateInputMs, fmtNetPnlBreakdown, splitCents } from "./format";

describe("splitCents", () => {
  it("splits the cents off a dollar amount", () => {
    expect(splitCents("$4,506.32")).toEqual(["$4,506", ".32", ""]);
  });

  it("keeps a signed amount's sign with the dollars", () => {
    expect(splitCents("−$1,234.50")).toEqual(["−$1,234", ".50", ""]);
  });

  it("leaves a compacted amount alone — those digits aren't cents", () => {
    expect(splitCents("$2.66B")).toEqual(["$2.66B"]);
    expect(splitCents("In +$20.72M · Out −$12.17M")).toEqual([
      "In +$20.72M · Out −$12.17M",
    ]);
  });

  it("splits every amount in a breakdown line", () => {
    expect(splitCents(fmtNetPnlBreakdown(714.71, 9.0, 7.48))).toEqual([
      "+$714",
      ".71",
      " − $9",
      ".00",
      " + $7",
      ".48",
      "",
    ]);
  });

  it("leaves text without dollar cents in one piece", () => {
    // A price, a percentage and a whole-dollar figure all read at one size.
    expect(splitCents("73,421.5")).toEqual(["73,421.5"]);
    expect(splitCents("12.34%")).toEqual(["12.34%"]);
    expect(splitCents("$123,457")).toEqual(["$123,457"]);
  });
});

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
