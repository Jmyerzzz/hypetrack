"use client";

import { EmptyState, Td, Th } from "@/components/ui";
import type { OrderView } from "@/lib/api-types";
import { fmtPrice, fmtSize, fmtTime, fmtUsd } from "@/lib/format";

export function OrdersTable({ orders }: { orders: OrderView[] | undefined }) {
  if (!orders || orders.length === 0) {
    return <EmptyState title="No open orders" />;
  }

  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse">
        <thead>
          <tr className="border-b border-edge">
            <Th align="left">Market</Th>
            <Th align="left">Side</Th>
            <Th align="left">Type</Th>
            <Th>Price</Th>
            <Th>Size</Th>
            <Th>Value</Th>
            <Th align="left">Placed</Th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr
              key={o.oid}
              className="border-b border-edge transition-colors last:border-0 hover:bg-panel2/40"
            >
              <Td align="left" className="font-medium text-ink">
                {o.coin}
              </Td>
              <Td align="left">
                <span className={o.isBuy ? "text-upt" : "text-downt"}>
                  {o.isBuy ? "Buy" : "Sell"}
                </span>
              </Td>
              <Td align="left" className="text-[12px] text-ink2">
                {o.orderType}
                {o.tif && o.tif !== "Gtc" && (
                  <span className="text-ink3"> · {o.tif}</span>
                )}
                {o.reduceOnly && (
                  <span className="ml-1.5 rounded bg-panel2 px-1 py-0.5 text-[10px] text-ink3">
                    reduce
                  </span>
                )}
                {o.isTrigger && (
                  <span className="ml-1.5 rounded bg-panel2 px-1 py-0.5 text-[10px] text-warn">
                    {o.triggerCondition}
                  </span>
                )}
              </Td>
              <Td className="num">
                {o.isTrigger && o.triggerPx > 0
                  ? fmtPrice(o.triggerPx)
                  : fmtPrice(o.limitPx)}
              </Td>
              <Td className="num">
                {fmtSize(o.sz)}
                {o.origSz > o.sz && (
                  <span className="text-[11px] text-ink3">
                    {" "}
                    / {fmtSize(o.origSz)}
                  </span>
                )}
              </Td>
              <Td className="num text-ink2">
                {o.limitPx > 0
                  ? fmtUsd(o.sz * o.limitPx, { compact: true })
                  : "—"}
              </Td>
              <Td align="left" className="num text-ink2">
                {fmtTime(o.timestamp)}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
