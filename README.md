# HypeSleuth

*Every trade leaves a trail.* HypeSleuth is account forensics for
[Hyperliquid](https://hyperliquid.xyz): paste any wallet address — no keys, no
sign-up — and get the full story of its perp trading account, built from
Hyperliquid's public info API. Light and dark themes included.

Scope: **total equity** mirrors Hyperliquid's portfolio page (perp + spot +
HIP-4 outcome contracts, with perp-committed USDC counted once); PnL curves and
lifetime volume come from Hyperliquid's perp portfolio series, while trades,
fills, and orders cover both perps and outcome markets.

## Features

- **PnL in $ and %** — 24h / 7d / 30d / all-time, with an all-time % computed
  against peak capital deployed (robust to deposits and withdrawals).
- **Equity & PnL charts** — perp equity and cumulative PnL curves per
  timeframe, with profit/loss split coloring around zero.
- **Benchmark overlays** — toggle **BTC**, the **S&P 500** and the **Nasdaq
  100** onto either curve. Each one buys the account's equity as of the
  window's start and holds it, so the comparison is plotted in the chart's own
  dollars on one axis rather than on a second percentage scale; the toggle
  doubles as the legend and carries the benchmark's return over the window.
  Every benchmark is dashed the same way — the dash means "reference", the
  account's own solid filled curve is the subject — and the three hues are
  picked to stay apart from each other and from the accent under simulated
  color-vision deficiency. Choices are remembered across sessions.
- **Risk profile** — Sharpe and Sortino (annualized from 30 days of daily perp
  PnL returns) and max drawdown of the all-time PnL curve.
- **MFE / MAE** — each trade's maximum favorable and adverse excursion,
  computed from candle data plus fill prices, with per-trade detail and
  averages across closed trades.
- **Reconstructed trade history** — raw fills are grouped into position
  lifecycles (open → add → reduce → close, including direction flips, which are
  split into two trades with prorated fees). Each trade shows entry/exit
  averages, max size, win/loss/flat result, duration, gross PnL, **fees paid**,
  **funding received or paid** (attributed to the trade's holding window), and
  net PnL — expandable to the individual fills with explorer links.
- **Trade analytics** — win rate, profit factor, expectancy, **average R:R and
  total R**, average win/loss, largest win/loss, median hold time, long vs
  short split, net PnL by coin. Hyperliquid records no stop for a closed trade,
  so one R is sized from the outcomes — it's the account's average losing trade
  — and total R counts closed-trade net PnL in those units.
- **Open positions** — size, entry/mark/liquidation price, leverage, margin,
  funding since open, unrealized PnL and ROE — plus an account-risk breakdown
  (margin used, maintenance margin, account leverage).
- **HIP-4 outcome markets** — prediction-market contracts appear by name
  ("Argentina · Yes" under *2026 World Cup Champion*) rather than by raw coin,
  both as open positions — contracts held, entry vs current odds, cost, value,
  payout if the side wins, unrealized PnL — and as reconstructed trades
  alongside perps. Prices render as implied probability, settlement and
  set minting/burning are labelled as the non-trade events they are, and
  funding is marked n/a because these contracts are fully collateralized.
  Generated markets get decoded names (`BTC ≥ 64,715`, `BTC 63,420 – 66,009`);
  markets that already settled drop out of Hyperliquid's metadata, so they
  degrade to their outcome id rather than to a guessed name.
- **Sub-accounts** — a master's sub-accounts each get a tab, plus an **All**
  tab that combines them. Hyperliquid keeps every sub-account under its own
  address and has no notion of a household, so All fetches each address and
  adds the payloads up in the browser: equity, margin and volume sum; the
  equity and PnL curves are summed onto one timestamp grid (an account reads
  zero before its first sample, and holds its last value between them); trade
  analytics combine the accounts' own figures rather than re-deriving them
  from the capped trade list, so win rate, R and profit factor stay exact.
  Positions, trades, fills, orders, funding and transfers are interleaved
  rather than netted — two accounts long the same coin hold two positions,
  with their own entries and liquidation prices — and every row carries a tag
  naming the account it came from, with an account filter on the positions and
  trades tables. Capital moved *between* the combined accounts is netted out of
  deposits and withdrawals when the ledgers are complete enough to identify it.
  One account failing to load fails the whole view rather than quietly
  understating a total.
- **Privacy mode** — one toggle in the header masks every dollar figure,
  position size and token balance behind `$•••`, and drops the equity chart's
  scale. Percentages, prices, durations and counts stay, so a screenshot still
  shows how the account is doing without showing what it's worth. Sizes go with
  the amounts because size times a public mark price is the notional. Remembered
  across sessions.
- **Everything else** — open orders, raw fills, hourly funding events, and
  deposits/withdrawals/transfers.
- **Liquidations flagged**, TWAP fills marked, builder-dex perps (e.g.
  `xyz:AAPL` stock perps) fully supported.

## Getting started

```bash
npm install
npm run dev       # http://localhost:3000
```

Other scripts:

```bash
npm run build     # production build
npm run test      # vitest unit tests (trade grouping, risk, outcome markets)
npm run lint      # biome check
npm run lint:fix  # biome check --write
npm run typecheck # tsc --noEmit
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs on every push
to `main` and every pull request, in three parallel jobs: **lint & format**
(`biome check` — which fails on unformatted code, since it verifies without
writing — plus `tsc`), **tests** (`vitest`), and **build** (`next build`).

## How it works

Everything is served from two Next.js route handlers that talk to
`https://api.hyperliquid.xyz/info` (no API key required):

- `GET /api/overview/[address]` — clearinghouse state (positions, margin),
  perp-account portfolio equity/PnL history, and open perp orders. Cached ~30s,
  auto-refreshed by the client.
- `GET /api/benchmarks/[period]` — benchmark closes for one chart window
  (`day` / `week` / `month` / `allTime`). BTC comes from Hyperliquid's own
  `candleSnapshot`; the two equity indices have no Hyperliquid market, so they
  come from a public quote endpoint (Yahoo Finance, with Stooq's daily CSV
  behind it). Global market data, not account data — it is cached per window
  and per benchmark, fetched only once a benchmark is switched on, and a
  benchmark whose upstream is down simply drops out of the chart.
- `GET /api/subaccounts/[address]` — the sub-accounts owned by an address,
  for the account switcher. Cached ~5min; the combined view fetches the
  overview and activity routes once per address and merges them client-side
  ([src/lib/accounts.ts](src/lib/accounts.ts)), so switching between tabs
  re-reads the same cached payloads instead of re-fetching.
- `GET /api/activity/[address]` — paginates `userFillsByTime` (up to 30k
  fills, filtered to perp fills), `userFunding`, and
  `userNonFundingLedgerUpdates`, then runs the trade engine
  ([src/lib/trades.ts](src/lib/trades.ts)) and stats aggregation
  ([src/lib/stats.ts](src/lib/stats.ts)) server-side. Cached ~3min.

### Trade reconstruction

A "trade" is one position lifecycle per market: it opens when the position
leaves zero and closes when it returns to zero. The engine resyncs from each
fill's `startPosition`, so:

- a fill that flips direction is split into a closing slice and an opening
  slice of a new trade, with fees prorated by size;
- positions opened before the available fill window become trades marked
  **partial history** (Hyperliquid's API only serves recent fills for very
  active accounts) — their realized PnL is still exact, since it comes from the
  exchange's own `closedPnl`;
- net PnL = gross (price) PnL − fees + funding, and the win/loss verdict uses
  net PnL. Funding attribution is flagged when the funding dataset doesn't
  cover a trade's full lifetime.

Coverage limits (fill window, funding window, capped pagination) are always
disclosed in the UI footer of the activity tables.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind CSS 4 ·
TanStack Query 5 · Recharts 3 · Biome 2 (lint + format) · Vitest 4 ·
Geist Sans/Mono.

## Notes

- Data comes from Hyperliquid's public API; prices and PnL are indicative.
- Benchmark comparisons are buy-and-hold from the window's start. An account
  that deposits or withdraws mid-window moves for reasons the benchmark can't;
  the trading PnL and return beside the equity figure are the deposit-neutral
  read.
- Not affiliated with Hyperliquid. Nothing here is financial advice.
