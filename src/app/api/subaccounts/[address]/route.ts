import { NextResponse } from "next/server";
import { isValidAddress, normalizeAddress } from "@/lib/format";
import { getSubAccounts } from "@/lib/server/accounts";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address: raw } = await params;
  if (!isValidAddress(raw)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getSubAccounts(normalizeAddress(raw)));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
