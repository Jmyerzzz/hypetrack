import { NextResponse } from "next/server";
import type { SubAccountsPayload } from "@/lib/api-types";
import { cache } from "@/lib/cache";
import { isValidAddress, normalizeAddress } from "@/lib/format";
import { fetchSubAccounts } from "@/lib/hyperliquid/client";

export const dynamic = "force-dynamic";

/** Sub-accounts are created/renamed rarely; no need to refetch per page load. */
const TTL_MS = 5 * 60_000;

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
    const payload = await cache.getOrLoad(
      `subaccounts:${address}`,
      TTL_MS,
      async (): Promise<SubAccountsPayload> => {
        const subs = (await fetchSubAccounts(address)) ?? [];
        return {
          address,
          fetchedAt: Date.now(),
          subAccounts: subs.map((s) => ({
            name: s.name,
            address: normalizeAddress(s.subAccountUser),
          })),
        };
      },
    );
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
