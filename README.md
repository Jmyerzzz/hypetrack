# HypeTrack

A comprehensive portfolio tracker for [Hyperliquid](https://hyperliquid.xyz) trading
accounts. Paste any wallet address — no keys, no sign-up — and get a full trading
dashboard built from Hyperliquid's public info API.

## Features

- **PnL in $ and %** — 24h / 7d / 30d / all-time, with an all-time % computed
  against peak capital deployed (robust to deposits and withdrawals).
- **Equity & PnL charts** — account value and cumulative PnL curves per
  timeframe, total or perp-only, with profit/loss split coloring around zero.
- **Reconstructed trade history** — raw fills are grouped into position
  lifecycles (open → add → reduce → close, including direction flips, which are
  split into two trades with prorated fees). Each trade shows entry/exit
  averages, max size, win/loss/flat result, duration, gross PnL, **fees paid**,
  **funding received or paid** (attributed to the trade's holding window), and
  net PnL — expandable to the individual fills with explorer links.
- **Trade analytics** — win rate, profit factor, expectancy, average win/loss,
  largest win/loss, median hold time, long vs short split, net PnL by coin.
- **Open positions** — size, entry/mark/liquidation price, leverage, margin,
  funding since open, unrealized PnL and ROE.
- **Everything else** — spot balances valued in USD, open orders, raw fills,
  hourly funding events, and deposits/withdrawals/transfers.
- **Liquidations flagged**, TWAP fills marked, builder-dex perps (e.g.
  `xyz:AAPL` stock perps) fully supported, spot pairs shown with readable names.

## Getting started

```bash
npm install
npm run dev       # http://localhost:3000
```

Other scripts:

```bash
npm run build     # production build
npm run test      # vitest unit tests (trade-grouping engine)
npm run lint      # biome check
npm run lint:fix  # biome check --write
npm run typecheck # tsc --noEmit
```

## How it works

Everything is served from two Next.js route handlers that talk to
`https://api.hyperliquid.xyz/info` (no API key required):

- `GET /api/overview/[address]` — clearinghouse state (positions, margin),
  spot balances (valued via spot metadata mid prices), portfolio equity/PnL
  history, and open orders. Cached ~30s, auto-refreshed by the client.
- `GET /api/activity/[address]` — paginates `userFillsByTime` (up to 30k
  fills), `userFunding`, and `userNonFundingLedgerUpdates`, then runs the trade
  engine ([src/lib/trades.ts](src/lib/trades.ts)) and stats aggregation
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
- Not affiliated with Hyperliquid. Nothing here is financial advice.
