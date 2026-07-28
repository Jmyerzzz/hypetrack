import type { PositionTriggerView } from "../api-types";
import type { HlOpenOrder } from "./types";

const num = (s: string | number | null | undefined): number => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};

/**
 * TP/SL trigger orders resting against one position: top-level trigger orders
 * on the position's coin whose fill would close it (the side opposite the
 * position). Children of a resting parent are deliberately not scanned — an
 * entry order's attached TP/SL only goes live once the parent fills, and the
 * exchange promotes it to a top-level order at that point.
 *
 * TP vs SL follows the exchange's own order-type label; a trigger without one
 * falls back to which side of `refPx` it sits on. Results are sorted by
 * distance from `refPx` (mark, or entry when mark is unknown), so the first
 * order of each kind is the next one price would reach.
 */
export function matchPositionTriggers(
  orders: HlOpenOrder[],
  position: { coin: string; szi: number; refPx: number },
): PositionTriggerView[] {
  const { coin, szi, refPx } = position;
  const long = szi > 0;
  const closingSide = long ? "A" : "B";
  const out: PositionTriggerView[] = [];
  for (const o of orders) {
    if (o.coin !== coin || !o.isTrigger || o.side !== closingSide) continue;
    const triggerPx = num(o.triggerPx);
    if (triggerPx <= 0) continue;
    const type = o.orderType.toLowerCase();
    // Unlabelled trigger: closing above the reference banks a long's profit
    // and cuts a short's loss, and closing below does the reverse.
    const above = triggerPx >= refPx;
    const kind = type.includes("take profit")
      ? "tp"
      : type.includes("stop")
        ? "sl"
        : above === long
          ? "tp"
          : "sl";
    out.push({
      oid: o.oid,
      kind,
      triggerPx,
      // A position TP/SL tracks the position's size rather than carrying one,
      // so it is normalized to 0 ("the whole position") whatever the API
      // reports in `sz` — the flag says so outright.
      sz: o.isPositionTpsl ? 0 : num(o.sz),
      isMarket: type.includes("market"),
    });
  }
  return out.sort(
    (a, b) => Math.abs(a.triggerPx - refPx) - Math.abs(b.triggerPx - refPx),
  );
}
