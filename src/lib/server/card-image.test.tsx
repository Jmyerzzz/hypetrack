import { describe, expect, it } from "vitest";
import type { Trade } from "../trades";
import { renderTradeCard } from "./card-image";

/**
 * These run the real satori → resvg pipeline: they prove the layout obeys
 * satori's flexbox subset and that the vendored TTFs load, which no amount of
 * typechecking can. A structural regression here would otherwise only show up
 * as a 500 the first time someone shares a trade.
 */

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
    avgEntryPx: 63_214.5,
    avgExitPx: 68_910.2,
    entryNotional: 126_429,
    exitNotional: 137_820.4,
    grossPnl: 11_391.4,
    fees: 88.5,
    funding: -12.3,
    fundingCovered: true,
    netPnl: 11_290.6,
    netPnlPct: 0.0893,
    isWin: true,
    fillCount: 2,
    slices: [],
    ...overrides,
  };
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

async function expectPng(res: Response): Promise<void> {
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/png");
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect([...bytes.slice(0, 4)]).toEqual(PNG_MAGIC);
  // A real 1200×630 card compresses to tens of KB; a blank failure doesn't.
  expect(bytes.length).toBeGreaterThan(5_000);
}

describe("renderTradeCard", () => {
  it("renders a winning long with its leverage badge", async () => {
    await expectPng(
      await renderTradeCard({
        trade: trade(),
        address: "0x5078c2fbea2b2ad61bc840bc023e35fce56bedb6",
        leverage: 20,
      }),
    );
  });

  it("renders a liquidated short with no leverage setting available", async () => {
    await expectPng(
      await renderTradeCard({
        trade: trade({
          direction: "short",
          liquidated: true,
          truncated: true,
          avgEntryPx: null,
          netPnl: -4_310.2,
          netPnlPct: -0.62,
          isWin: false,
        }),
        address: "0x5078c2fbea2b2ad61bc840bc023e35fce56bedb6",
        leverage: null,
      }),
    );
  });
});
