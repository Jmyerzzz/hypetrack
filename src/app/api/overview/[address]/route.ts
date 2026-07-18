import { NextResponse } from "next/server";
import { cache } from "@/lib/cache";
import { isValidAddress, normalizeAddress } from "@/lib/format";
import { buildOverview } from "@/lib/server/overview";

export const dynamic = "force-dynamic";

const TTL_MS = 30_000;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address: raw } = await params;
  if (!isValidAddress(raw)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const address = normalizeAddress(raw);
  try {
    const payload = await cache.getOrLoad(`overview:${address}`, TTL_MS, () =>
      buildOverview(address),
    );
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
