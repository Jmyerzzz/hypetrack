import type { OrderView } from "../api-types";
import { isSpotCoin } from "../trades";
import type { HlOpenOrder } from "./types";

const num = (s: string | number | null | undefined): number => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};

/**
 * Puts orders fetched from one HIP-3 builder DEX onto namespaced coin names
 * (`xyz:CL`). Positions from a builder clearinghouse always arrive namespaced,
 * and trigger matching compares coins by equality, so the book's orders must
 * spell theirs the same way — bare names get the `dex:` prefix, names already
 * carrying one pass through, covering either way the API reports them. A
 * builder book holds only that builder's perps (spot orders ride only the
 * main-DEX query), so every coin here is the prefix's to claim. Children are
 * rewritten too, since both consumers walk them.
 */
export function namespaceDexOrders(
  orders: HlOpenOrder[],
  dex: string,
): HlOpenOrder[] {
  const rename = (o: HlOpenOrder): HlOpenOrder => ({
    ...o,
    coin: o.coin.includes(":") ? o.coin : `${dex}:${o.coin}`,
    children: (o.children ?? []).map(rename),
  });
  return orders.map(rename);
}

/**
 * The perp open-order book as one flat list, newest first.
 *
 * `frontendOpenOrders` reports a bracket's TP/SL twice: once as a top-level
 * entry of its own and again under the entry order's `children`. Walking the
 * tree therefore lists each attached trigger a second time, which is what
 * inflated the order count and repeated cards in the Open orders tab. `oid`
 * is the exchange's unique handle on an order, so keying on it collapses the
 * repeat and can never merge two genuinely distinct orders.
 *
 * Children are still walked rather than skipped: whether a bracket's legs are
 * also listed at the top level is the exchange's business, and one that isn't
 * is a real open order that belongs in the list.
 */
export function flattenOrders(orders: HlOpenOrder[]): OrderView[] {
  const out: OrderView[] = [];
  const seen = new Set<number>();
  const push = (o: HlOpenOrder): void => {
    // Spot orders are marked seen alongside the perps they are filtered out
    // of, so that a repeat of one can't slip in down another branch.
    if (!seen.has(o.oid)) {
      seen.add(o.oid);
      if (!isSpotCoin(o.coin)) {
        out.push({
          oid: o.oid,
          coin: o.coin,
          isBuy: o.side === "B",
          limitPx: num(o.limitPx),
          sz: num(o.sz),
          origSz: num(o.origSz),
          orderType: o.orderType,
          tif: o.tif,
          reduceOnly: o.reduceOnly,
          isTrigger: o.isTrigger,
          triggerPx: num(o.triggerPx),
          triggerCondition: o.triggerCondition,
          isPositionTpsl: o.isPositionTpsl,
          timestamp: o.timestamp,
        });
      }
    }
    for (const child of o.children ?? []) push(child);
  };
  for (const o of orders) push(o);
  out.sort((a, b) => b.timestamp - a.timestamp);
  return out;
}
