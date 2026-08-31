import { describe, expect, it } from "vitest";
import { flattenOrders, namespaceDexOrders } from "./orders";
import type { HlOpenOrder } from "./types";

const order = (over: Partial<HlOpenOrder> = {}): HlOpenOrder => ({
  coin: "kPEPE",
  side: "A",
  limitPx: "0.0025",
  sz: "1255950.0",
  origSz: "1255950.0",
  oid: 1,
  timestamp: 1_000,
  orderType: "Stop Market",
  tif: null,
  reduceOnly: true,
  isTrigger: true,
  triggerPx: "0.002718",
  triggerCondition: "Price below 0.002718",
  isPositionTpsl: false,
  children: [],
  ...over,
});

/**
 * The bracket from the reported wallet: a resting limit buy whose take-profit
 * and stop are each reported twice — once at the top level, once under the
 * parent's `children`.
 */
const tp = order({
  oid: 101,
  orderType: "Take Profit Market",
  limitPx: "0.003312",
  triggerPx: "0.0036",
  triggerCondition: "Price above 0.0036",
});
const sl = order({ oid: 102 });
const entry = order({
  oid: 100,
  side: "B",
  orderType: "Limit",
  tif: "Gtc",
  limitPx: "0.002844",
  reduceOnly: false,
  isTrigger: false,
  triggerPx: "0",
  triggerCondition: "N/A",
  children: [sl, tp],
});

describe("flattenOrders", () => {
  it("lists a bracket's legs once when they repeat as the parent's children", () => {
    const flat = flattenOrders([tp, sl, entry]);
    expect(flat.map((o) => o.oid)).toEqual([101, 102, 100]);
  });

  it("keeps a child that the exchange does not also list at the top level", () => {
    const flat = flattenOrders([entry]);
    expect(flat.map((o) => o.oid).sort()).toEqual([100, 101, 102]);
  });

  it("carries the trigger fields through so the card renders the stop price", () => {
    const [stop] = flattenOrders([sl]);
    expect(stop).toMatchObject({
      oid: 102,
      coin: "kPEPE",
      isBuy: false,
      limitPx: 0.0025,
      sz: 1_255_950,
      isTrigger: true,
      triggerPx: 0.002718,
      triggerCondition: "Price below 0.002718",
      reduceOnly: true,
    });
  });

  it("drops spot orders without dropping perp orders nested under them", () => {
    const spotParent = order({
      oid: 200,
      coin: "@107",
      children: [order({ oid: 201, coin: "BTC" })],
    });
    expect(flattenOrders([spotParent]).map((o) => o.oid)).toEqual([201]);
  });

  it("sorts newest first", () => {
    const flat = flattenOrders([
      order({ oid: 1, timestamp: 10 }),
      order({ oid: 2, timestamp: 30 }),
      order({ oid: 3, timestamp: 20 }),
    ]);
    expect(flat.map((o) => o.oid)).toEqual([2, 3, 1]);
  });

  it("de-duplicates a repeat at the top level too", () => {
    expect(flattenOrders([sl, sl]).map((o) => o.oid)).toEqual([102]);
  });
});

describe("namespaceDexOrders", () => {
  it("prefixes bare builder-book coins, children included", () => {
    const [renamed] = namespaceDexOrders(
      [order({ coin: "CL", children: [order({ oid: 2, coin: "CL" })] })],
      "xyz",
    );
    expect(renamed.coin).toBe("xyz:CL");
    expect(renamed.children[0].coin).toBe("xyz:CL");
  });

  it("keeps coins the API already namespaced", () => {
    const [renamed] = namespaceDexOrders([order({ coin: "xyz:CL" })], "xyz");
    expect(renamed.coin).toBe("xyz:CL");
  });
});
