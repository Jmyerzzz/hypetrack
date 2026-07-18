const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const usd2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});
const numCompact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});
const sig6 = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6 });

/** "$1,234.56" / "$123,457" for large values. */
export function fmtUsd(
  value: number,
  { compact = false }: { compact?: boolean } = {},
): string {
  if (!Number.isFinite(value)) return "—";
  if (compact && Math.abs(value) >= 1_000_000) return usdCompact.format(value);
  return Math.abs(value) >= 100_000 ? usd0.format(value) : usd2.format(value);
}

/** Signed variant: "+$123.45" / "−$123.45". */
export function fmtUsdSigned(
  value: number,
  opts?: { compact?: boolean },
): string {
  if (!Number.isFinite(value)) return "—";
  const abs = fmtUsd(Math.abs(value), opts);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
}

export function fmtCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return numCompact.format(value);
}

/** Prices with sensible precision across magnitudes (73,421.5 … 0.0000123). */
export function fmtPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return sig6.format(value);
}

export function fmtSize(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return sig6.format(value);
}

/** value is a fraction: 0.123 → "12.3%". */
export function fmtPct(
  value: number | null | undefined,
  { signed = false, digits }: { signed?: boolean; digits?: number } = {},
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const pct = value * 100;
  const d = digits ?? (Math.abs(pct) >= 100 ? 0 : Math.abs(pct) >= 10 ? 1 : 2);
  const body = `${Math.abs(pct).toFixed(d)}%`;
  if (value > 0 && signed) return `+${body}`;
  if (value < 0) return `−${body}`;
  return body;
}

export function shortAddress(address: string): string {
  return address.length > 12
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address;
}

const dateShort = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dateWithYear = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dateDay = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function fmtTime(
  ts: number,
  { withYear }: { withYear?: boolean } = {},
): string {
  const useYear = withYear ?? Date.now() - ts > 300 * 24 * 3600 * 1000;
  return (useYear ? dateWithYear : dateShort).format(ts);
}

export function fmtDay(ts: number): string {
  return dateDay.format(ts);
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ${h % 24}h`;
  return `${d}d`;
}

export function fmtAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Renders "gross − fees + funding" with each operator following its term's
 * sign, so a maker rebate (negative fee) reads "+ $1.00" rather than the
 * double-signed "− −$1.00". Funding is signed either way by nature.
 */
export function fmtNetPnlBreakdown(
  grossPnl: number,
  fees: number,
  funding: number,
): string {
  const feeOp = fees >= 0 ? "−" : "+";
  const fundOp = funding >= 0 ? "+" : "−";
  return `${fmtUsdSigned(grossPnl)} ${feeOp} ${fmtUsd(Math.abs(fees))} ${fundOp} ${fmtUsd(Math.abs(funding))}`;
}

export const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function isValidAddress(input: string): boolean {
  return EVM_ADDRESS_RE.test(input.trim());
}

export function normalizeAddress(input: string): string {
  return input.trim().toLowerCase();
}
