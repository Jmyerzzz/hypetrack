"use client";

import { fmtPct, fmtUsdSigned } from "@/lib/format";

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

/** Monogram tag for a market; builder-dex perps ("dex:COIN") show a dex chip. */
export function CoinTag({ coin, sub }: { coin: string; sub?: string | null }) {
  const [dex, name] = coin.includes(":") ? coin.split(":", 2) : [null, coin];
  const display = name || coin;
  const hue = coinHue(display);
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
        style={{
          background: `oklch(0.32 0.055 ${hue})`,
          color: `oklch(0.85 0.09 ${hue})`,
        }}
      >
        {display.replace(/^k/, "").slice(0, 3).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink">{display}</span>
        {(dex || sub) && (
          <span className="block truncate text-[11px] text-ink3">
            {[dex, sub].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>
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
      className={`whitespace-nowrap px-3 py-2.5 text-[11px] font-medium tracking-wide text-ink3 uppercase first:pl-4 last:pr-4 ${
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
      className={`whitespace-nowrap px-3 py-2.5 text-[13px] first:pl-4 last:pr-4 ${
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
            size === "xs" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-xs"
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
