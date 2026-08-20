import { describe, expect, it } from "vitest";
import { fmtSize, fmtUsd, fmtUsdSigned, splitCents } from "./format";
import { moneyFormat } from "./privacy";

const plain = moneyFormat(false);
const masked = moneyFormat(true);

describe("moneyFormat(false)", () => {
  it("hands back the real formatters untouched", () => {
    expect(plain.fmtUsd).toBe(fmtUsd);
    expect(plain.fmtUsdSigned).toBe(fmtUsdSigned);
    expect(plain.fmtSize).toBe(fmtSize);
    expect(plain.hidden).toBe(false);
  });
});

describe("moneyFormat(true)", () => {
  it("masks an amount but still reads as money", () => {
    expect(masked.fmtUsd(4506.32)).toBe("$•••");
    expect(masked.hidden).toBe(true);
  });

  it("masks every magnitude to the same width", () => {
    // A mask that tracked the digits would still rank a column of them.
    const widths = [0, 12.5, 1_000, 250_000, 8_400_000_000].map(
      (v) => masked.fmtUsd(v).length,
    );
    expect(new Set(widths).size).toBe(1);
    expect(masked.fmtUsd(12.5, { compact: true })).toBe(masked.fmtUsd(12.5));
  });

  it("keeps missing data distinct from hidden data", () => {
    expect(masked.fmtUsd(Number.NaN)).toBe("—");
    expect(masked.fmtUsdSigned(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("keeps the sign of a signed amount", () => {
    expect(masked.fmtUsdSigned(714.71)).toBe("+$•••");
    expect(masked.fmtUsdSigned(-714.71)).toBe("−$•••");
    expect(masked.fmtUsdSigned(0)).toBe("$•••");
  });

  it("keeps the net PnL breakdown's shape, rebate operator included", () => {
    expect(masked.fmtNetPnlBreakdown(714.71, 9.0, 7.48)).toBe(
      "+$••• − $••• + $•••",
    );
    // Negative fee = rebate; must never read "− −$•••", same as unmasked.
    const rebate = masked.fmtNetPnlBreakdown(100, -1, -0.25);
    expect(rebate).toBe("+$••• + $••• − $•••");
    expect(rebate).not.toContain("− −");
  });

  it("masks sizes and token balances without the dollar sign", () => {
    // Size times a public mark price is the notional, so a visible size would
    // hand back the amount the mask just took away.
    expect(masked.fmtSize(0.19952)).toBe("•••");
    expect(masked.fmtSize(2_253)).toBe("•••");
    expect(masked.fmtCompact(15_110_000)).toBe("•••");
    expect(masked.fmtSize(1)).not.toContain("$");
    expect(masked.fmtSize(Number.NaN)).toBe("—");
  });

  it("leaves no digits anywhere in a masked figure", () => {
    const outputs = [
      masked.fmtUsd(1234.56),
      masked.fmtUsd(1234.56, { compact: true }),
      masked.fmtUsdSigned(-98_765.43),
      masked.fmtNetPnlBreakdown(714.71, 9.0, 7.48),
      masked.fmtSize(0.19952),
      masked.fmtCompact(15_110_000),
    ];
    for (const out of outputs) expect(out).not.toMatch(/\d/);
  });

  it("survives the cents split that renderers run it through", () => {
    // No cents to shrink, so `smallCents` leaves the mask in one piece.
    expect(splitCents(masked.fmtUsd(4506.32))).toEqual(["$•••"]);
    expect(splitCents(masked.fmtNetPnlBreakdown(714.71, 9.0, 7.48))).toEqual([
      "+$••• − $••• + $•••",
    ]);
  });
});
