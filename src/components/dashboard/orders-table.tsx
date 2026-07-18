"use client";

import {
  CardField,
  CardList,
  DataCard,
  EmptyState,
  Td,
  Th,
  ViewToggle,
} from "@/components/ui";
import type { OrderView } from "@/lib/api-types";
import { fmtPrice, fmtSize, fmtTime, fmtUsd } from "@/lib/format";
import { useViewMode } from "@/lib/hooks";

function OrderKind({ o }: { o: OrderView }) {
  return (
    <>
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
    </>
  );
}

const orderPrice = (o: OrderView): number =>
  o.isTrigger && o.triggerPx > 0 ? o.triggerPx : o.limitPx;

function OrderCard({ o }: { o: OrderView }) {
  return (
    <DataCard>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">{o.coin}</p>
          <p className="text-[12px]">
            <span className={o.isBuy ? "text-upt" : "text-downt"}>
              {o.isBuy ? "Buy" : "Sell"}
            </span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="num text-[15px] font-semibold text-ink">
            {fmtPrice(orderPrice(o))}
          </span>
          <p className="num text-[11px] text-ink3">{fmtTime(o.timestamp)}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-edge pt-3">
        <CardField label="Size">
          <span className="num">{fmtSize(o.sz)}</span>
          {o.origSz > o.sz && (
            <span className="num text-[11px] text-ink3">
              {" "}
              / {fmtSize(o.origSz)}
            </span>
          )}
        </CardField>
        <CardField label="Value" align="right">
          <span className="num text-ink2">
            {o.limitPx > 0 ? fmtUsd(o.sz * o.limitPx, { compact: true }) : "—"}
          </span>
        </CardField>
        {/* Order type can carry several qualifier chips — give it a full row. */}
        <CardField label="Type" full>
          <span className="text-[12px] text-ink2">
            <OrderKind o={o} />
          </span>
        </CardField>
      </div>
    </DataCard>
  );
}

export function OrdersTable({ orders }: { orders: OrderView[] | undefined }) {
  const [view, setView] = useViewMode();
  if (!orders || orders.length === 0) {
    return <EmptyState title="No open orders" />;
  }

  return (
    <div>
      <div className="flex items-center justify-end border-b border-edge px-4 py-2.5">
        <ViewToggle value={view} onChange={setView} />
      </div>

      {view === "cards" ? (
        <CardList>
          {orders.map((o) => (
            <OrderCard key={o.oid} o={o} />
          ))}
        </CardList>
      ) : (
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
                    <OrderKind o={o} />
                  </Td>
                  <Td className="num">{fmtPrice(orderPrice(o))}</Td>
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
      )}
    </div>
  );
}
