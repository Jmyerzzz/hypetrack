import { describe, expect, it } from "vitest";
import { namespaceDexOrders } from "./orders";
import { matchPositionTriggers } from "./triggers";
import type { HlOpenOrder } from "./types";

const order = (over: Partial<HlOpenOrder> = {}): HlOpenOrder => ({
  coin: "BTC",
  side: "A",
  limitPx: "0",
  sz: "0.0",
  origSz: "0.0",
  oid: 1,
  timestamp: 0,
  orderType: "Take Profit Market",
  tif: null,
  reduceOnly: true,
  isTrigger: true,
  triggerPx: "70000",
  triggerCondition: "Price above 70,000",
  // A standalone trigger by default; position TP/SL is opted into per test.
  isPositionTpsl: false,
  children: [],
  ...over,
});

/** 0.5 BTC long marked at 63,000. */
const longBtc = { coin: "BTC", szi: 0.5, refPx: 63_000 };

describe("matchPositionTriggers", () => {
  it("matches a position TP/SL pair and classifies by the order-type label", () => {
    const triggers = matchPositionTriggers(
      [
        order({
          oid: 1,
          orderType: "Take Profit Market",
          triggerPx: "70000",
          isPositionTpsl: true,
        }),
        order({
          oid: 2,
          orderType: "Stop Market",
          triggerPx: "60000",
          triggerCondition: "Price below 60,000",
          isPositionTpsl: true,
        }),
      ],
      longBtc,
    );
    // Nearest to the 63,000 mark leads, so the stop precedes the take-profit.
    expect(triggers).toEqual([
      // Position TP/SL carries sz 0 — the whole position, whatever its size.
      { oid: 2, kind: "sl", triggerPx: 60_000, sz: 0, isMarket: true },
      { oid: 1, kind: "tp", triggerPx: 70_000, sz: 0, isMarket: true },
    ]);
  });

  it("flags limit-execution triggers and keeps a partial order's size", () => {
    const [tp] = matchPositionTriggers(
      [
        order({
          orderType: "Take Profit Limit",
          triggerPx: "70000",
          limitPx: "69900",
          sz: "0.25",
        }),
      ],
      longBtc,
    );
    expect(tp.isMarket).toBe(false);
    expect(tp.sz).toBe(0.25);
  });

  it("reports a position TP/SL as whole-position even when it carries a size", () => {
    const [tp] = matchPositionTriggers(
      [order({ isPositionTpsl: true, sz: "0.5" })],
      longBtc,
    );
    expect(tp.sz).toBe(0);
  });

  it("ignores other coins, non-trigger orders, and same-side triggers", () => {
    const triggers = matchPositionTriggers(
      [
        order({ coin: "ETH" }),
        // Resting reduce-only limit exit: an open order, not a TP/SL trigger.
        order({ orderType: "Limit", isTrigger: false, triggerPx: "0" }),
        // Breakout add-on: a buy-side stop on a long grows it, not closes it.
        order({ orderType: "Stop Market", side: "B", triggerPx: "66000" }),
      ],
      longBtc,
    );
    expect(triggers).toEqual([]);
  });

  it("does not scan children attached to a resting entry order", () => {
    const parent = order({
      orderType: "Limit",
      isTrigger: false,
      side: "B",
      triggerPx: "0",
      children: [order({ oid: 9 })],
    });
    expect(matchPositionTriggers([parent], longBtc)).toEqual([]);
  });

  it("sorts each ladder nearest-to-trigger first", () => {
    const triggers = matchPositionTriggers(
      [
        order({ oid: 1, triggerPx: "70000", sz: "0.25" }),
        order({ oid: 2, triggerPx: "66000", sz: "0.25" }),
        order({ oid: 3, orderType: "Stop Market", triggerPx: "55000" }),
        order({ oid: 4, orderType: "Stop Market", triggerPx: "61000" }),
      ],
      longBtc,
    );
    expect(triggers.map((t) => t.oid)).toEqual([4, 2, 1, 3]);
    expect(triggers.filter((t) => t.kind === "tp").map((t) => t.oid)).toEqual([
      2, 1,
    ]);
    expect(triggers.filter((t) => t.kind === "sl").map((t) => t.oid)).toEqual([
      4, 3,
    ]);
  });

  it("matches buy-side triggers against a short", () => {
    const triggers = matchPositionTriggers(
      [
        order({
          oid: 1,
          side: "B",
          orderType: "Take Profit Market",
          triggerPx: "55000",
        }),
        order({
          oid: 2,
          side: "B",
          orderType: "Stop Market",
          triggerPx: "68000",
        }),
        // Sell-side trigger would grow the short, not close it.
        order({ oid: 3, side: "A", orderType: "Stop Market" }),
      ],
      { coin: "BTC", szi: -0.5, refPx: 63_000 },
    );
    expect(triggers.map((t) => [t.oid, t.kind])).toEqual([
      [2, "sl"],
      [1, "tp"],
    ]);
  });

  it("falls back to price side when the order type names neither TP nor stop", () => {
    const triggers = matchPositionTriggers(
      [
        order({ oid: 1, orderType: "Trigger", triggerPx: "70000" }),
        order({ oid: 2, orderType: "Trigger", triggerPx: "60000" }),
      ],
      longBtc,
    );
    expect(triggers.map((t) => [t.oid, t.kind])).toEqual([
      [2, "sl"],
      [1, "tp"],
    ]);
  });

  it("drops triggers without a usable trigger price", () => {
    expect(matchPositionTriggers([order({ triggerPx: "0" })], longBtc)).toEqual(
      [],
    );
  });

  it("matches a builder-DEX stop once its book's orders are namespaced", () => {
    // The reported miss: an xyz:CL short whose position SL rested in the xyz
    // book read "—", because only the main-DEX book was ever searched. Builder
    // books flow in through namespaceDexOrders, after which the coins align.
    const [stop] = matchPositionTriggers(
      namespaceDexOrders(
        [
          order({
            coin: "CL",
            side: "B",
            orderType: "Stop Market",
            triggerPx: "86.0",
            triggerCondition: "Price above 86.0",
            isPositionTpsl: true,
          }),
        ],
        "xyz",
      ),
      { coin: "xyz:CL", szi: -67.463, refPx: 85.117 },
    );
    expect(stop).toEqual({
      oid: 1,
      kind: "sl",
      triggerPx: 86,
      sz: 0,
      isMarket: true,
    });
  });
});
