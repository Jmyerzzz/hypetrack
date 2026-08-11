import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { cardRoe, fmtLeverage } from "../card";
import {
  fmtDay,
  fmtDuration,
  fmtPct,
  fmtPrice,
  fmtSize,
  fmtUsdSigned,
  shortAddress,
} from "../format";
import type { Trade } from "../trades";

/**
 * Draws the shareable PnL card for one fully closed perp trade — a 1200×630
 * PNG rendered per request by satori, never stored. Kept apart from the route
 * so the render path (satori's flexbox subset, the vendored fonts) stays
 * exercisable in tests without a Hyperliquid round-trip.
 */

/** The dark theme's tokens, frozen: a share card doesn't follow the viewer's theme. */
const C = {
  bg: "#080d0f",
  edge: "rgba(255, 255, 255, 0.07)",
  chip: "rgba(255, 255, 255, 0.04)",
  ink: "#e6edee",
  ink2: "#9db4b9",
  ink3: "#64797f",
  accent: "#0ea5a0",
  accent2: "#2dd4bf",
  up: "#3dd68c",
  down: "#f0666b",
  warn: "#f5a524",
};

// Read once per process: satori needs raw TTF data (the app's woff2 won't do).
let fontsPromise: Promise<{ regular: Buffer; bold: Buffer }> | null = null;
function loadFonts() {
  fontsPromise ??= Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Geist-Regular.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Geist-Bold.ttf")),
  ]).then(([regular, bold]) => ({ regular, bold }));
  return fontsPromise;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 20,
          color: C.ink3,
          textTransform: "uppercase",
          letterSpacing: 2,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 34, fontWeight: 700, color: C.ink }}>
        {value}
      </span>
    </div>
  );
}

function Pill({ color, children }: { color: string; children: string }) {
  return (
    <span
      style={{
        display: "flex",
        borderRadius: 999,
        border: `1px solid ${C.edge}`,
        backgroundColor: C.chip,
        padding: "8px 20px",
        fontSize: 24,
        fontWeight: 700,
        letterSpacing: 2,
        color,
      }}
    >
      {children}
    </span>
  );
}

export async function renderTradeCard({
  trade,
  address,
  leverage,
}: {
  trade: Trade;
  address: string;
  /** Current per-asset setting from `activeAssetData`; null renders unleveraged. */
  leverage: number | null;
}): Promise<ImageResponse> {
  const { regular, bold } = await loadFonts();

  const roe = cardRoe(trade, leverage);
  const won = roe != null ? roe >= 0 : trade.netPnl >= 0;
  const pnlColor = won ? C.up : C.down;
  const levLabel = leverage == null ? null : fmtLeverage(leverage);
  const closedAt = trade.closedAt ?? trade.openedAt;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "52px 60px",
        backgroundColor: C.bg,
        backgroundImage: `radial-gradient(circle at 18% 0%, rgba(45, 212, 191, 0.14) 0%, rgba(45, 212, 191, 0) 55%), radial-gradient(circle at 100% 100%, ${won ? "rgba(48, 164, 108, 0.12)" : "rgba(229, 72, 77, 0.10)"} 0%, rgba(0, 0, 0, 0) 45%)`,
        fontFamily: "Geist",
        color: C.ink,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg
            aria-hidden="true"
            width="46"
            height="46"
            viewBox="0 0 64 64"
            fill="none"
          >
            <circle cx="27" cy="27" r="17" stroke={C.accent} strokeWidth="5" />
            <path
              d="M40 40 L54 54"
              stroke={C.accent}
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="M17.5 32 L23.5 25 L27.5 28.5 L36 18.5"
              stroke={C.accent2}
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M30.5 18 H36.5 V24"
              stroke={C.accent2}
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>
            <span style={{ color: C.ink }}>Hype</span>
            <span style={{ color: C.accent2 }}>Sleuth</span>
          </div>
        </div>
        <span style={{ fontSize: 24, color: C.ink2 }}>
          {shortAddress(address)}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 46, fontWeight: 700 }}>{trade.coin}</span>
          <Pill color={trade.direction === "long" ? C.up : C.down}>
            {trade.direction === "long" ? "LONG" : "SHORT"}
          </Pill>
          {levLabel != null && <Pill color={C.ink}>{levLabel}</Pill>}
          {trade.liquidated && <Pill color={C.warn}>LIQUIDATED</Pill>}
          {trade.truncated && <Pill color={C.ink3}>PARTIAL HISTORY</Pill>}
        </div>
        <span
          style={{
            fontSize: 130,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -4,
            color: pnlColor,
          }}
        >
          {roe != null
            ? fmtPct(roe, { signed: true })
            : fmtUsdSigned(trade.netPnl)}
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            fontSize: 32,
          }}
        >
          {roe != null && (
            <span style={{ fontWeight: 700, color: pnlColor }}>
              {fmtUsdSigned(trade.netPnl)}
            </span>
          )}
          <span style={{ color: C.ink2 }}>
            net PnL · incl. fees &amp; funding
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          borderTop: `1px solid ${C.edge}`,
          paddingTop: 28,
        }}
      >
        <Stat label="Entry (avg)" value={fmtPrice(trade.avgEntryPx)} />
        <Stat label="Exit (avg)" value={fmtPrice(trade.avgExitPx)} />
        <Stat label="Max size" value={fmtSize(trade.maxSize)} />
        <Stat label="Held" value={fmtDuration(trade.durationMs)} />
        <Stat label="Closed" value={fmtDay(closedAt)} />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 18,
          color: C.ink3,
        }}
      >
        <span>
          {levLabel != null
            ? `ROE = price move × ${levLabel} current leverage setting`
            : "Unleveraged price return"}
        </span>
        <span>hypesleuth · account forensics for Hyperliquid</span>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist", data: bold, weight: 700, style: "normal" },
      ],
      headers: {
        // Closed trades are immutable; only the leverage setting drifts.
        "Cache-Control": "public, max-age=300, s-maxage=600",
      },
    },
  );
}
