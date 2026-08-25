import { NextResponse } from "next/server";
import { isBenchmarkPeriod } from "@/lib/benchmarks";
import { getBenchmarks } from "@/lib/server/benchmarks";

export const dynamic = "force-dynamic";

/**
 * Benchmark prices for one portfolio window. Global market data rather than
 * anything account-specific, so it sits on its own route: the chart asks for
 * it only once a benchmark is toggled on, and every visitor shares the cache.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ period: string }> },
) {
  const { period } = await params;
  if (!isBenchmarkPeriod(period)) {
    return NextResponse.json({ error: "Unknown period" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getBenchmarks(period));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
