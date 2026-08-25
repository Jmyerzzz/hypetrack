import type { BenchmarkSeriesView, BenchmarksPayload } from "../api-types";
import {
  type BenchmarkId,
  type BenchmarkPeriod,
  type BenchmarkPoint,
  normalizePoints,
} from "../benchmarks";
import { cache } from "../cache";
import { fetchCandles } from "../hyperliquid/client";
import type { HlCandle } from "../hyperliquid/types";

/**
 * Benchmark price history, per portfolio period.
 *
 * BTC comes from Hyperliquid's own candles — the same API the rest of the app
 * runs on, so the crypto benchmark needs no third party and covers the 24/7
 * window an account actually trades in.
 *
 * The equity indices have no Hyperliquid market, so they come from public quote
 * endpoints — and the obvious ones turn away datacenter traffic often enough
 * that any single one leaves the chips reading "n/a" in production. So the
 * indices run a waterfall of three independent providers:
 *
 *   1. Yahoo Finance — the only one here with intraday bars, which the 24H and
 *      7D windows want. It answers 401/429 to an anonymous request from a cloud
 *      IP, so a refusal is retried once carrying a session cookie and crumb.
 *   2. Stooq — daily closes, over two hostnames with separate daily quotas.
 *   3. FRED — daily closes from the St. Louis Fed: no key, no bot wall, and the
 *      one upstream here with no reason to care where a request comes from.
 *
 * A daily-only source gives the 24H window a flat line rather than a shape —
 * still the right number, and better than dropping the benchmark. Whichever
 * provider answered is named in the payload, and when none do, so is every
 * reason they gave: an unexplained "n/a" is what sent us looking the first time.
 *
 * Prices are market data, identical for every visitor, so they cache
 * process-wide like the other market references.
 */

const DAY_MS = 86_400_000;

type PeriodSpec = {
  /** How far back to reach; a little past the window, for the base price. */
  spanMs: number;
  /** Hyperliquid candle interval for BTC. */
  candleInterval: string;
  /** Yahoo `range`/`interval` pair. */
  yahoo: { range: string; interval: string };
  ttlMs: number;
};

/**
 * Sampling per window: fine enough that a day reads as a curve rather than a
 * staircase, coarse enough that all-time stays a few thousand points. Each
 * span overshoots its window so there is always a close before the first
 * account point to base the comparison on.
 */
const PERIOD_SPECS: Record<BenchmarkPeriod, PeriodSpec> = {
  day: {
    spanMs: 5 * DAY_MS,
    candleInterval: "5m",
    yahoo: { range: "5d", interval: "5m" },
    ttlMs: 60_000,
  },
  week: {
    spanMs: 14 * DAY_MS,
    candleInterval: "1h",
    yahoo: { range: "1mo", interval: "1h" },
    ttlMs: 5 * 60_000,
  },
  month: {
    spanMs: 45 * DAY_MS,
    candleInterval: "4h",
    yahoo: { range: "3mo", interval: "1h" },
    ttlMs: 10 * 60_000,
  },
  allTime: {
    // Hyperliquid opened in 2023, so five years of daily closes outruns any
    // account's history while staying a couple of thousand points.
    spanMs: 5 * 365 * DAY_MS,
    candleInterval: "1d",
    yahoo: { range: "5y", interval: "1d" },
    ttlMs: 30 * 60_000,
  },
};

/** Ticker per benchmark on each upstream. BTC never uses them. */
const INDEX_SYMBOLS: Record<
  IndexId,
  { yahoo: string; stooq: string; fred: string }
> = {
  spx: { yahoo: "^GSPC", stooq: "^spx", fred: "SP500" },
  ndx: { yahoo: "^NDX", stooq: "^ndx", fred: "NASDAQ100" },
};

type IndexId = Exclude<BenchmarkId, "btc">;

/**
 * Time limits. The overall budget is what every request is measured against,
 * so a stalled upstream can never run the route past a serverless timeout —
 * a whole-route timeout would take the working benchmarks down with it. The
 * per-provider slice keeps the first upstream in the waterfall from spending
 * the budget the ones behind it need.
 */
const UPSTREAM_TIMEOUT_MS = 2_500;
/** Two attempts plus their backoff, still inside the overall budget. */
const BTC_TIMEOUT_MS = 3_500;
const PROVIDER_BUDGET_MS = 3_000;
const OVERALL_BUDGET_MS = 8_000;

/**
 * A default-looking user agent: the quote endpoints answer 403 to a bare
 * fetch, and none offers a keyed API to identify ourselves with instead.
 */
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Milliseconds left to spend, capped at one request's share. */
function budgetFor(deadline: number): number {
  return Math.min(UPSTREAM_TIMEOUT_MS, deadline - Date.now());
}

async function requestUpstream(
  url: string,
  deadline: number,
  cookie?: string,
): Promise<Response> {
  const budget = budgetFor(deadline);
  if (budget <= 0) throw new Error("out of time");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budget);
  try {
    return await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/csv,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchUpstream(
  url: string,
  deadline: number,
  cookie?: string,
): Promise<string> {
  const res = await requestUpstream(url, deadline, cookie);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

/**
 * An upstream failure in one short clause, for the payload. These reach the
 * chart, so they say what went wrong without a stack or a URL: the reader
 * wants to know whether to try again in a minute or not at all.
 */
function brief(err: unknown, limit = 80): string {
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "TimeoutError")
      return "timed out";
    // undici wraps connection-level failures in a bare "fetch failed".
    if (err.message === "fetch failed" && err.cause)
      return brief(err.cause, limit);
  }
  const flat = (err instanceof Error ? err.message : String(err))
    .replace(/\s+/g, " ")
    .trim();
  if (!flat) return "failed";
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

type YahooChart = {
  chart?: {
    result?: {
      timestamp?: number[];
      indicators?: { quote?: { close?: (number | null)[] }[] };
    }[];
    error?: { description?: string } | null;
  };
};

/**
 * Yahoo's chart payload: parallel arrays of second-resolution timestamps and
 * closes, with a null close for any bar that hasn't printed yet (the current
 * one, and holidays inside the range).
 */
export function parseYahooChart(body: string): BenchmarkPoint[] {
  const json = JSON.parse(body) as YahooChart;
  const result = json.chart?.result?.[0];
  const times = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!times || !closes) {
    throw new Error(json.chart?.error?.description ?? "Unexpected chart shape");
  }
  const points: BenchmarkPoint[] = [];
  for (let i = 0; i < times.length; i++) {
    const close = closes[i];
    if (close == null) continue;
    points.push({ t: times[i] * 1000, c: close });
  }
  return normalizePoints(points);
}

/** 16:00 New York, the closing bell, in UTC hours — 20:00 EDT / 21:00 EST. */
const CLOSE_HOUR_UTC = 20;

/**
 * A daily close, stamped at the closing bell. A bare date would put Friday's
 * close at Friday midnight — a day early on an intraday axis.
 */
function dailyClose(date: string, close: string): BenchmarkPoint | null {
  const day = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(day)) return null;
  return { t: day + CLOSE_HOUR_UTC * 3_600_000, c: Number(close) };
}

/** Stooq's one-line refusals, which it serves with a 200 like any other body. */
const STOOQ_REFUSAL = /exceeded the daily hits limit|no data/i;

/**
 * Stooq's daily CSV: `Date,Open,High,Low,Close,Volume`, one row per session.
 */
export function parseStooqCsv(body: string): BenchmarkPoint[] {
  const lines = body.trim().split(/\r?\n/);
  const header = lines[0]?.toLowerCase() ?? "";
  if (!header.startsWith("date,")) {
    // Stooq declines in prose rather than with a status — an IP over its daily
    // quota, or a symbol it has nothing for. Quote it back: those two want
    // very different responses from whoever reads the chip.
    const refusal = STOOQ_REFUSAL.exec(body);
    throw new Error(
      refusal ? refusal[0].toLowerCase() : "Unexpected CSV shape",
    );
  }
  const closeIndex = header.split(",").indexOf("close");
  if (closeIndex === -1) throw new Error("CSV has no close column");
  const points: BenchmarkPoint[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const point = dailyClose(cells[0], cells[closeIndex]);
    if (point) points.push(point);
  }
  return normalizePoints(points);
}

/**
 * FRED's CSV: an `observation_date,<SERIES_ID>` header (older exports say
 * `DATE`) and one row per weekday, with `.` standing in for a day the index
 * didn't print.
 */
export function parseFredCsv(body: string): BenchmarkPoint[] {
  const lines = body.trim().split(/\r?\n/);
  const header = lines[0]?.toLowerCase() ?? "";
  if (!/^(observation_date|date),/.test(header)) {
    throw new Error("Unexpected CSV shape");
  }
  const points: BenchmarkPoint[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    if (cells[1] === ".") continue;
    const point = dailyClose(cells[0], cells[1]);
    if (point) points.push(point);
  }
  return normalizePoints(points);
}

/** `YYYYMMDD`, the only date format Stooq's range parameters take. */
function stooqDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
}

/** `YYYY-MM-DD`, FRED's range format. */
function fredDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Yahoo's anonymous-request credentials: a session cookie and the crumb minted
 * against it. Two extra round trips, so they are only fetched once a bare
 * request has actually been turned away, and then cached for every benchmark
 * and window that follows.
 */
type YahooCredentials = { cookie: string; crumb: string };

const YAHOO_CRUMB_URL = "https://query2.finance.yahoo.com/v1/test/getcrumb";
const YAHOO_CREDENTIALS_TTL_MS = 30 * 60_000;

/** The `name=value` head of every Set-Cookie on a response, as a Cookie line. */
function readCookies(headers: Headers): string {
  const raw =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : // Splitting on commas that begin a new `name=` avoids cutting the
        // comma inside an Expires date.
        (headers.get("set-cookie") ?? "").split(/,(?=\s*[A-Za-z0-9_-]+=)/);
  return raw
    .map((line) => line.split(";")[0].trim())
    .filter((pair) => /^[A-Za-z0-9_-]+=.+/.test(pair))
    .join("; ");
}

async function loadYahooCredentials(
  deadline: number,
): Promise<YahooCredentials> {
  // fc.yahoo.com answers 404 and sets the session cookies anyway, which is why
  // it is the usual handshake host: no HTML to download for a cookie.
  const res = await requestUpstream("https://fc.yahoo.com/", deadline);
  const cookie = readCookies(res.headers);
  if (!cookie) throw new Error("no session cookie");
  const crumb = (await fetchUpstream(YAHOO_CRUMB_URL, deadline, cookie)).trim();
  // A refusal comes back as an HTML page rather than as a status.
  if (!crumb || crumb.length > 40 || /[<\s]/.test(crumb)) {
    throw new Error("no crumb");
  }
  return { cookie, crumb };
}

function yahooCredentials(deadline: number): Promise<YahooCredentials> {
  return cache.getOrLoad(
    "benchmark:yahooCredentials",
    YAHOO_CREDENTIALS_TTL_MS,
    () => loadYahooCredentials(deadline),
  );
}

async function fetchYahooPoints(
  id: IndexId,
  spec: PeriodSpec,
  _now: number,
  deadline: number,
): Promise<BenchmarkPoint[]> {
  const symbol = encodeURIComponent(INDEX_SYMBOLS[id].yahoo);
  const query = `range=${spec.yahoo.range}&interval=${spec.yahoo.interval}`;
  const failures: string[] = [];
  // Anonymous first: on an IP Yahoo is happy with, one request is the whole
  // job. Only a refusal is worth the handshake's extra round trips, and the
  // second host is worth trying because the two sit behind different edges.
  const attempts = [
    { host: "query1.finance.yahoo.com", authenticated: false },
    { host: "query2.finance.yahoo.com", authenticated: true },
  ];
  for (const { host, authenticated } of attempts) {
    try {
      const credentials = authenticated
        ? await yahooCredentials(deadline)
        : null;
      const url =
        `https://${host}/v8/finance/chart/${symbol}?${query}` +
        (credentials ? `&crumb=${encodeURIComponent(credentials.crumb)}` : "");
      return parseYahooChart(
        await fetchUpstream(url, deadline, credentials?.cookie),
      );
    } catch (err) {
      failures.push(brief(err));
    }
  }
  throw new Error([...new Set(failures)].join(", "));
}

async function fetchStooqPoints(
  id: IndexId,
  spec: PeriodSpec,
  now: number,
  deadline: number,
): Promise<BenchmarkPoint[]> {
  const symbol = encodeURIComponent(INDEX_SYMBOLS[id].stooq);
  const range = `&d1=${stooqDay(now - spec.spanMs)}&d2=${stooqDay(now)}`;
  const failures: string[] = [];
  // The two hostnames are separate deployments with separate daily quotas, so
  // the second is a real second chance rather than the same answer twice.
  for (const host of ["stooq.com", "stooq.pl"]) {
    try {
      const url = `https://${host}/q/d/l/?s=${symbol}&i=d${range}`;
      return parseStooqCsv(await fetchUpstream(url, deadline));
    } catch (err) {
      failures.push(brief(err));
    }
  }
  throw new Error([...new Set(failures)].join(", "));
}

async function fetchFredPoints(
  id: IndexId,
  spec: PeriodSpec,
  now: number,
  deadline: number,
): Promise<BenchmarkPoint[]> {
  const url =
    `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${INDEX_SYMBOLS[id].fred}` +
    `&cosd=${fredDay(now - spec.spanMs)}&coed=${fredDay(now)}`;
  return parseFredCsv(await fetchUpstream(url, deadline));
}

type IndexProvider = {
  /** Named in the payload, so the footnote can credit whoever answered. */
  name: string;
  fetch: (
    id: IndexId,
    spec: PeriodSpec,
    now: number,
    deadline: number,
  ) => Promise<BenchmarkPoint[]>;
};

const INDEX_PROVIDERS: readonly IndexProvider[] = [
  { name: "Yahoo Finance", fetch: fetchYahooPoints },
  { name: "Stooq", fetch: fetchStooqPoints },
  { name: "FRED", fetch: fetchFredPoints },
];

async function fetchIndexPoints(
  id: IndexId,
  spec: PeriodSpec,
  now: number,
  deadline: number,
): Promise<{ points: BenchmarkPoint[]; source: string }> {
  const failures: string[] = [];
  for (const provider of INDEX_PROVIDERS) {
    if (Date.now() >= deadline) {
      failures.push(`${provider.name}: out of time`);
      break;
    }
    try {
      const points = await provider.fetch(
        id,
        spec,
        now,
        Math.min(deadline, Date.now() + PROVIDER_BUDGET_MS),
      );
      if (points.length === 0) throw new Error("no closes returned");
      return { points, source: provider.name };
    } catch (err) {
      failures.push(`${provider.name}: ${brief(err)}`);
    }
  }
  throw new Error(failures.join("; "));
}

async function fetchBtcPoints(
  spec: PeriodSpec,
  now: number,
): Promise<{ points: BenchmarkPoint[]; source: string }> {
  const candles: HlCandle[] = await fetchCandles(
    "BTC",
    spec.candleInterval,
    now - spec.spanMs,
    now,
    // The chart is an overlay, not the page: two bounded attempts fit inside
    // the route's own budget, where the client's 15s x 3 default does not.
    { timeoutMs: BTC_TIMEOUT_MS, retries: 1 },
  );
  // Stamped at the candle's close, so a price sits at the moment it was last
  // true rather than at the start of the bar that produced it.
  const points = normalizePoints(
    candles.map((c) => ({ t: c.T, c: Number(c.c) })),
  );
  if (points.length === 0) throw new Error("no candles returned");
  return { points, source: "Hyperliquid" };
}

/**
 * One benchmark's prices for one window, cached on its own. Caching per
 * benchmark rather than per payload keeps a dead quote endpoint from
 * shortening the cache life of the two that answered — and lets the cache's
 * own brief failure memory hold the retry back, instead of a fresh attempt
 * per chart render.
 */
function getBenchmarkSeries(
  id: BenchmarkId,
  period: BenchmarkPeriod,
  now: number,
  deadline: number,
): Promise<{ points: BenchmarkPoint[]; source: string }> {
  const spec = PERIOD_SPECS[period];
  return cache.getOrLoad(`benchmark:${id}:${period}`, spec.ttlMs, () =>
    id === "btc"
      ? fetchBtcPoints(spec, now)
      : fetchIndexPoints(id, spec, now, deadline),
  );
}

/**
 * Every benchmark for one window. A benchmark that can't be loaded comes back
 * empty rather than failing the payload: the chart drops that one line, keeps
 * the rest, and says why that one is missing.
 */
export async function getBenchmarks(
  period: BenchmarkPeriod,
): Promise<BenchmarksPayload> {
  const now = Date.now();
  const deadline = now + OVERALL_BUDGET_MS;
  const series = await Promise.all(
    (["btc", "spx", "ndx"] as const).map((id) =>
      getBenchmarkSeries(id, period, now, deadline)
        .then(
          ({ points, source }): BenchmarkSeriesView => ({
            id,
            points,
            source,
            error: null,
          }),
        )
        .catch(
          (err: unknown): BenchmarkSeriesView => ({
            id,
            points: [],
            source: null,
            error: brief(err, 240),
          }),
        ),
    ),
  );
  return { period, fetchedAt: now, series };
}
