"use client";

import { useState } from "react";
import type { OutcomeMarketView } from "@/lib/api-types";
import { fmtPct, fmtUsdSigned } from "@/lib/format";
import type { ViewMode } from "@/lib/hooks";

/** Signed USD amount in status color; sign carried by text as well as color. */
export function Pnl({
  value,
  pct,
  compact = false,
  className = "",
  muted = false,
}: {
  value: number;
  pct?: number | null;
  compact?: boolean;
  className?: string;
  muted?: boolean;
}) {
  const tone =
    Math.abs(value) < 0.005 || muted
      ? "text-ink2"
      : value > 0
        ? "text-upt"
        : "text-downt";
  return (
    <span className={`num ${tone} ${className}`}>
      <span className="whitespace-nowrap">
        {fmtUsdSigned(value, { compact })}
      </span>
      {pct != null && Number.isFinite(pct) && (
        <span className="ml-1.5 text-[0.85em] whitespace-nowrap opacity-80">
          {fmtPct(pct, { signed: true })}
        </span>
      )}
    </span>
  );
}

export function DirectionBadge({ direction }: { direction: "long" | "short" }) {
  const long = direction === "long";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${
        long ? "bg-up/12 text-upt" : "bg-down/12 text-downt"
      }`}
    >
      {long ? "Long" : "Short"}
    </span>
  );
}

export function ResultBadge({
  isWin,
  status,
  liquidated,
}: {
  isWin: boolean | null;
  status: "open" | "closed";
  liquidated: boolean;
}) {
  if (status === "open") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-accent/12 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-accent2 uppercase">
        <span className="size-1.5 animate-pulse rounded-full bg-accent2" />
        Open
      </span>
    );
  }
  if (liquidated) {
    return (
      <span className="inline-flex items-center rounded-md bg-warn/12 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-warn uppercase">
        ⚠ Liq
      </span>
    );
  }
  if (isWin === null) {
    return (
      <span className="inline-flex items-center rounded-md bg-panel2 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-ink3 uppercase">
        Flat
      </span>
    );
  }
  return isWin ? (
    <span className="inline-flex items-center gap-1 rounded-md bg-up/12 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-upt uppercase">
      ✓ Win
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md bg-down/12 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-downt uppercase">
      ✕ Loss
    </span>
  );
}

const COIN_HUES = [172, 200, 262, 291, 322, 20, 45, 90, 140, 230];
function coinHue(coin: string): number {
  let h = 0;
  for (let i = 0; i < coin.length; i++) h = (h * 31 + coin.charCodeAt(i)) >>> 0;
  return COIN_HUES[h % COIN_HUES.length];
}

/**
 * Icon URL on Hyperliquid's own CDN. Works for regular coins ("BTC") and
 * builder-dex markets ("xyz:CL") by raw name; k-prefixed 1000× markets
 * (kPEPE) have no icon of their own, so they map to the base token's.
 * Missing icons return an HTML page, which fires the <img> error handler.
 */
function coinIconUrl(coin: string): string {
  const name = /^k[A-Z]/.test(coin) ? coin.slice(1) : coin;
  return `https://app.hyperliquid.xyz/coins/${name}.svg`;
}

/** Asset tag for a market; falls back to a monogram when no icon exists. */
export function CoinTag({ coin, sub }: { coin: string; sub?: string | null }) {
  const [iconFailed, setIconFailed] = useState(false);
  const [dex, name] = coin.includes(":") ? coin.split(":", 2) : [null, coin];
  const display = name || coin;
  const hue = coinHue(display);
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {iconFailed ? (
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
          style={{
            background: `light-dark(oklch(0.88 0.06 ${hue}), oklch(0.32 0.055 ${hue}))`,
            color: `light-dark(oklch(0.35 0.09 ${hue}), oklch(0.85 0.09 ${hue}))`,
          }}
        >
          {display.replace(/^k/, "").slice(0, 3).toUpperCase()}
        </span>
      ) : (
        // Plain <img>: next/image can't optimize remote SVGs without
        // dangerouslyAllowSVG, and the onError monogram fallback needs the
        // native error event anyway.
        // biome-ignore lint/performance/noImgElement: see above
        <img
          src={coinIconUrl(coin)}
          alt=""
          aria-hidden="true"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setIconFailed(true)}
          className="size-6 shrink-0 rounded-full bg-panel2 object-contain"
        />
      )}
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink">{display}</span>
        {(dex || sub) && (
          // Sub first, DEX last: "10× isolated · xyz" reads the position's own
          // detail before the venue it trades on.
          <span className="block truncate text-[11px] text-ink3">
            {[sub, dex].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * Outcome markets have no icon on Hyperliquid's CDN and their coin (`#8560`)
 * means nothing to a reader, so they get a probability glyph plus the market's
 * real question. `sub` is appended after the parent question, when there is one.
 */
export function OutcomeTag({
  market,
  sub,
}: {
  market: OutcomeMarketView;
  sub?: string | null;
}) {
  const hue = coinHue(market.coin);
  // A settled market has no name left, so its coin stands in as the identifier
  // rather than leaving the row with nothing to cross-reference.
  const detail = [market.question ?? (market.known ? null : market.coin), sub]
    .filter(Boolean)
    .join(" · ");
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
        style={{
          background: `light-dark(oklch(0.88 0.06 ${hue}), oklch(0.32 0.055 ${hue}))`,
          color: `light-dark(oklch(0.35 0.09 ${hue}), oklch(0.85 0.09 ${hue}))`,
        }}
      >
        %
      </span>
      <span className="min-w-0">
        <span
          className="block truncate font-medium text-ink"
          title={`${market.title} · ${market.coin}`}
        >
          {market.title}
        </span>
        {detail && (
          <span className="block truncate text-[11px] text-ink3" title={detail}>
            {detail}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * One-line name for a coin, for places too tight for a full tag. Outcome
 * markets read as "Spain · Yes"; everything else stays its plain coin.
 */
export function marketName(
  coin: string,
  markets: Record<string, OutcomeMarketView>,
): string {
  const market = markets[coin];
  return market ? `${market.title} · ${market.sideName}` : coin;
}

/**
 * Iconless market label for dense lists: the outcome's name over its side,
 * or the plain coin for everything else.
 */
export function MarketLabel({
  coin,
  market,
}: {
  coin: string;
  market?: OutcomeMarketView | null;
}) {
  if (!market) return <span className="font-medium text-ink">{coin}</span>;
  const detail = [
    market.sideName,
    market.question ?? (market.known ? null : market.coin),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span className="flex min-w-0 flex-col">
      <span
        className="truncate font-medium text-ink"
        title={`${market.title} · ${market.coin}`}
      >
        {market.title}
      </span>
      <span className="truncate text-[11px] text-ink3" title={detail}>
        {detail}
      </span>
    </span>
  );
}

/** Asset tag that renders outcome markets by name and everything else by coin. */
export function MarketTag({
  coin,
  market,
  sub,
}: {
  coin: string;
  market?: OutcomeMarketView | null;
  sub?: string | null;
}) {
  return market ? (
    <OutcomeTag market={market} sub={sub} />
  ) : (
    <CoinTag coin={coin} sub={sub} />
  );
}

/**
 * Which side of an outcome market is held. Takes the place of long/short,
 * which doesn't apply: every outcome position is long its side's token.
 */
export function SideBadge({ market }: { market: OutcomeMarketView }) {
  const first = market.sideIndex === 0;
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${
        first ? "bg-up/12 text-upt" : "bg-down/12 text-downt"
      }`}
    >
      {market.sideName}
    </span>
  );
}

export function Th({
  children,
  align = "right",
  className = "",
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <th
      className={`whitespace-nowrap px-3 py-2.5 text-[11px] font-medium tracking-wide text-ink3 uppercase first:pl-4 last:pr-4 max-sm:px-2 max-sm:first:pl-3 max-sm:last:pr-3 ${
        align === "left"
          ? "text-left"
          : align === "center"
            ? "text-center"
            : "text-right"
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "right",
  className = "",
  colSpan,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`whitespace-nowrap px-3 py-2.5 text-[13px] first:pl-4 last:pr-4 max-sm:px-2 max-sm:first:pl-3 max-sm:last:pr-3 ${
        align === "left"
          ? "text-left"
          : align === "center"
            ? "text-center"
            : "text-right"
      } ${className}`}
    >
      {children}
    </td>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-14 text-center">
      <p className="text-sm text-ink2">{title}</p>
      {hint && <p className="max-w-md text-[13px] text-ink3">{hint}</p>}
    </div>
  );
}

/**
 * One dropdown in a list's filter row. Shared so the positions and trades
 * rows can't drift apart; the larger touch-target sizing below `sm` is why
 * the class list is worth keeping in one place.
 */
export function FilterSelect({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name — these sit unlabelled in the row. */
  label: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="rounded-lg border border-edge bg-inset px-3 py-2 text-base text-ink2 focus:border-accent/60 focus:outline-none sm:px-2.5 sm:py-1.5 sm:text-xs"
    >
      {children}
    </select>
  );
}

/** Switches a data list between the dense table and stacked cards. */
export function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const options: { mode: ViewMode; label: string; path: React.ReactNode }[] = [
    {
      mode: "cards",
      label: "Card",
      path: (
        <>
          <rect x="3.5" y="3.5" width="17" height="7" rx="2" />
          <rect x="3.5" y="13.5" width="17" height="7" rx="2" />
        </>
      ),
    },
    {
      mode: "table",
      label: "Table",
      path: (
        <>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <path d="M3.5 9.5h17M9.5 9.5v10" />
        </>
      ),
    },
  ];
  return (
    <div className="inline-flex rounded-lg border border-edge bg-inset p-0.5">
      {options.map((opt) => (
        <button
          key={opt.mode}
          type="button"
          onClick={() => onChange(opt.mode)}
          aria-pressed={value === opt.mode}
          title={`${opt.label} view`}
          className={`rounded-md px-2 py-1.5 transition-colors ${
            value === opt.mode
              ? "bg-panel2 text-ink shadow-sm ring-1 ring-edge2"
              : "text-ink3 hover:text-ink2"
          }`}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            {opt.path}
          </svg>
          <span className="sr-only">{opt.label} view</span>
        </button>
      ))}
    </div>
  );
}

/**
 * A list's filter row: the caller's dropdowns, then how many rows survived them
 * and the view toggle. On a phone the dropdowns become an even two-column grid
 * and the count and toggle take a full-width line of their own — left to wrap
 * as flex items they leave the toggle stranded alone on a line.
 */
export function FilterRow({
  children,
  count,
  view,
  onViewChange,
}: {
  children: React.ReactNode;
  count: React.ReactNode;
  view: ViewMode;
  onViewChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="grid grid-cols-2 items-center gap-2 border-b border-edge px-4 py-3 sm:flex sm:flex-wrap">
      {children}
      <div className="col-span-2 flex items-center justify-between gap-3 sm:ml-auto">
        <span className="text-xs text-ink3">{count}</span>
        <ViewToggle value={view} onChange={onViewChange} />
      </div>
    </div>
  );
}

/**
 * Refetch control. Section headers take the bare icon; the page header passes
 * `labelled` for a text label, which still drops away on phones where that row
 * is already competing with the address for width.
 */
export function RefreshButton({
  onClick,
  refreshing,
  labelled = false,
}: {
  onClick: () => void;
  refreshing: boolean;
  labelled?: boolean;
}) {
  const label = refreshing ? "Refreshing" : "Refresh";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={refreshing}
      title={label}
      // The visible label comes and goes with the viewport, so the accessible
      // name is pinned here rather than left to the text node.
      aria-label={label}
      className={`shrink-0 transition-colors disabled:opacity-60 ${
        labelled
          ? "inline-flex items-center gap-1.5 rounded-lg border border-edge bg-panel px-2.5 py-1.5 text-xs font-medium text-ink2 hover:border-edge2 hover:text-ink max-sm:px-2.5 max-sm:py-2.5"
          : "rounded-md p-2 text-ink3 hover:bg-panel2 hover:text-ink max-sm:p-2.5"
      }`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" />
        <path d="M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {labelled && <span className="max-sm:hidden">{label}</span>}
    </button>
  );
}

/**
 * One record rendered as a card; the card-view counterpart of a table row.
 * Intentionally non-interactive — cards that expand put a real <button>
 * inside so the control is focusable and announced. `span` widens a card to
 * the full grid row, which expanded cards need for their detail tables.
 */
export function DataCard({
  children,
  active = false,
  span = false,
  className = "",
}: {
  children: React.ReactNode;
  active?: boolean;
  span?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        active ? "border-edge2 bg-panel2/60" : "border-edge bg-panel2/25"
      } ${span ? "col-span-full" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

/** Label-over-value pair inside a card; `full` spans both grid columns. */
export function CardField({
  label,
  children,
  align = "left",
  full = false,
}: {
  label: string;
  children: React.ReactNode;
  align?: "left" | "right";
  full?: boolean;
}) {
  return (
    <div
      className={`${align === "right" ? "text-right" : ""} ${full ? "col-span-2" : ""}`}
    >
      <p className="text-[10px] tracking-wide text-ink3 uppercase">{label}</p>
      <p className="mt-0.5 text-[13px] text-ink">{children}</p>
    </div>
  );
}

/**
 * Responsive card grid. Columns auto-fill to the available width rather than
 * to fixed breakpoints, so cards stay a comfortable reading width instead of
 * stretching across a wide desktop: one column on a phone, more as space
 * allows. `minWidth` tunes the density per list — sparse cards pack tighter.
 * The `min(...,100%)` guard keeps a single column from overflowing a narrow
 * viewport.
 */
export function CardList({
  children,
  minWidth = 320,
}: {
  children: React.ReactNode;
  minWidth?: number;
}) {
  return (
    <div
      className="grid items-start gap-2.5 p-3"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(min(${minWidth}px, 100%), 1fr))`,
      }}
    >
      {children}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "xs";
}) {
  return (
    <div className="inline-flex rounded-lg border border-edge bg-inset p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-md font-medium transition-colors ${
            size === "xs"
              ? "px-2 py-1 text-[11px] max-sm:px-2.5 max-sm:py-1.5"
              : "px-2.5 py-1 text-xs max-sm:px-3 max-sm:py-2"
          } ${
            value === opt.value
              ? "bg-panel2 text-ink shadow-sm ring-1 ring-edge2"
              : "text-ink3 hover:text-ink2"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function ExplorerLink({
  hash,
  children,
}: {
  hash: string;
  children?: React.ReactNode;
}) {
  if (!hash || /^0x0+$/.test(hash)) return <span className="text-ink3">—</span>;
  return (
    <a
      href={`https://app.hyperliquid.xyz/explorer/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
      className="text-ink3 transition-colors hover:text-accent2"
      title={hash}
    >
      {children ?? `${hash.slice(0, 8)}…`}
    </a>
  );
}
