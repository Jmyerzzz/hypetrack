import { NextResponse } from "next/server";
import { cache } from "@/lib/cache";
import { findCardTrade, sanitizeLeverage } from "@/lib/card";
import { isValidAddress, normalizeAddress } from "@/lib/format";
import { fetchActiveAssetData } from "@/lib/hyperliquid/client";
import { getActivity } from "@/lib/server/activity";
import { renderTradeCard } from "@/lib/server/card-image";

export const dynamic = "force-dynamic";

/**
 * Shareable PnL card for one fully closed perp trade, drawn on request from
 * the same on-the-fly reconstruction the dashboard uses — no image storage,
 * no database. The leverage badge is the account's *current* setting for the
 * coin (Hyperliquid's own card convention), fetched live via
 * `activeAssetData` because historical fills never recorded one.
 */

/** Leverage settings move rarely; a short TTL just absorbs bursts of shares. */
const LEVERAGE_TTL_MS = 60_000;

async function currentLeverage(
  address: string,
  coin: string,
): Promise<number | null> {
  try {
    const data = await cache.getOrLoad(
      `activeAsset:${address}:${coin}`,
      LEVERAGE_TTL_MS,
      () => fetchActiveAssetData(address, coin),
    );
    return sanitizeLeverage(data.leverage?.value);
  } catch {
    // Delisted market or transient failure: the card renders unleveraged
    // rather than not at all.
    return null;
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address: raw } = await params;
  if (!isValidAddress(raw)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const address = normalizeAddress(raw);
  const tradeId = new URL(req.url).searchParams.get("trade");
  if (!tradeId) {
    return NextResponse.json(
      { error: "Missing ?trade=<id> parameter" },
      { status: 400 },
    );
  }

  let activity: Awaited<ReturnType<typeof getActivity>>;
  try {
    activity = await getActivity(address);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const trade = findCardTrade(activity.trades, tradeId);
  if (!trade) {
    return NextResponse.json(
      { error: "No fully closed perp trade with that id in the loaded window" },
      { status: 404 },
    );
  }

  const leverage = await currentLeverage(address, trade.coin);
  return renderTradeCard({ trade, address, leverage });
}
