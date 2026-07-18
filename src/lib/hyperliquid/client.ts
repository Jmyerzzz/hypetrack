import type {
  HlCandle,
  HlClearinghouseState,
  HlFill,
  HlFundingEvent,
  HlLedgerUpdate,
  HlOpenOrder,
  HlPortfolio,
  HlSpotClearinghouseState,
  HlSpotMetaAndAssetCtxs,
} from "./types";

const API_URL = "https://api.hyperliquid.xyz/info";

/** Pagination caps keep a single request bounded for hyper-active accounts. */
export const MAX_FILL_PAGES = 15; // × 2000 fills
export const MAX_FUNDING_PAGES = 12; // × 500 events
export const MAX_LEDGER_PAGES = 4; // × ~2000 updates

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function hlInfo<T>(
  body: Record<string, unknown>,
  { timeoutMs = 15_000, retries = 3 } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await sleep(400 * 2 ** (attempt - 1) + Math.random() * 250);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        lastError = new Error(
          `Hyperliquid API ${res.status}: ${text.slice(0, 200)}`,
        );
        if (RETRYABLE_STATUS.has(res.status)) continue;
        throw lastError;
      }
      return (await res.json()) as T;
    } catch (err) {
      // Timeouts, network failures, and parse errors all fall through to retry.
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export type PaginatedResult<T> = {
  records: T[];
  /** False when the page cap was hit and older/newer data may exist beyond it. */
  complete: boolean;
  pagesFetched: number;
};

/**
 * Walks a time-paginated info endpoint forward from `startTime`.
 * Responses are ascending by time with a fixed page cap; the next page starts
 * at the last record's timestamp (not +1ms) to avoid dropping same-millisecond
 * records, with a dedupe key preventing duplicates across the seam.
 */
async function paginateByTime<T extends { time: number }>(
  makeBody: (startTime: number) => Record<string, unknown>,
  dedupeKey: (record: T) => string,
  pageSize: number,
  maxPages: number,
  startTime = 0,
): Promise<PaginatedResult<T>> {
  const records: T[] = [];
  const seen = new Set<string>();
  let cursor = startTime;
  let pages = 0;
  let complete = true;

  while (pages < maxPages) {
    const page = await hlInfo<T[]>(makeBody(cursor));
    pages++;
    for (const record of page) {
      const key = dedupeKey(record);
      if (!seen.has(key)) {
        seen.add(key);
        records.push(record);
      }
    }
    if (page.length < pageSize) break;
    if (pages >= maxPages) {
      complete = false;
      break;
    }
    const lastTime = page[page.length - 1].time;
    // A page whose records all share one timestamp would stall the cursor; nudge past it.
    cursor = lastTime > cursor ? lastTime : cursor + 1;
  }

  records.sort((a, b) => a.time - b.time);
  return { records, complete, pagesFetched: pages };
}

/** All reachable fills (perp + spot), ascending. */
export async function fetchAllFills(
  user: string,
): Promise<PaginatedResult<HlFill>> {
  return paginateByTime<HlFill>(
    (startTime) => ({ type: "userFillsByTime", user, startTime }),
    (f) => String(f.tid),
    2000,
    MAX_FILL_PAGES,
  );
}

export async function fetchFunding(
  user: string,
  startTime: number,
): Promise<PaginatedResult<HlFundingEvent>> {
  return paginateByTime<HlFundingEvent>(
    (cursor) => ({ type: "userFunding", user, startTime: cursor }),
    (f) => `${f.time}:${f.delta.coin}:${f.delta.usdc}`,
    500,
    MAX_FUNDING_PAGES,
    startTime,
  );
}

export async function fetchLedgerUpdates(
  user: string,
): Promise<PaginatedResult<HlLedgerUpdate>> {
  return paginateByTime<HlLedgerUpdate>(
    (startTime) => ({ type: "userNonFundingLedgerUpdates", user, startTime }),
    (u) => `${u.time}:${u.hash}:${u.delta.type}`,
    2000,
    MAX_LEDGER_PAGES,
  );
}

export async function fetchClearinghouseState(
  user: string,
): Promise<HlClearinghouseState> {
  return hlInfo<HlClearinghouseState>({ type: "clearinghouseState", user });
}

export async function fetchPortfolio(user: string): Promise<HlPortfolio> {
  return hlInfo<HlPortfolio>({ type: "portfolio", user });
}

export async function fetchSpotClearinghouseState(
  user: string,
): Promise<HlSpotClearinghouseState> {
  return hlInfo<HlSpotClearinghouseState>({
    type: "spotClearinghouseState",
    user,
  });
}

export async function fetchSpotMetaAndAssetCtxs(): Promise<HlSpotMetaAndAssetCtxs> {
  return hlInfo<HlSpotMetaAndAssetCtxs>({ type: "spotMetaAndAssetCtxs" });
}

export async function fetchCandles(
  coin: string,
  interval: string,
  startTime: number,
  endTime: number,
): Promise<HlCandle[]> {
  return hlInfo<HlCandle[]>({
    type: "candleSnapshot",
    req: { coin, interval, startTime, endTime },
  });
}

export async function fetchOpenOrders(user: string): Promise<HlOpenOrder[]> {
  return hlInfo<HlOpenOrder[]>({ type: "frontendOpenOrders", user });
}
