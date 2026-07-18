import Link from "next/link";
import { AddressForm } from "@/components/address-form";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

const DEMO_WALLETS = [
  {
    address: "0x4e23288cee4960f9f962195c22948e4bc7ae20c3",
    label: "High-frequency whale",
  },
  {
    address: "0xd47587702a91731dc1089b5db0932cf820151a91",
    label: "$50M+ trader",
  },
];

const FEATURES = [
  {
    title: "PnL, realized and unrealized",
    body: "Account equity and profit curves across 24h, 7d, 30d, and all-time — in dollars and percent.",
  },
  {
    title: "Every trade, reconstructed",
    body: "Fills are grouped into position lifecycles: entry, exit, size, duration, win or loss.",
  },
  {
    title: "Fees & funding, attributed",
    body: "Trading fees paid and funding received or paid, per trade and in aggregate.",
  },
];

export default function Home() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[-320px] h-[560px]"
        style={{
          background:
            "radial-gradient(600px 320px at 50% 100%, var(--hero-glow), transparent 70%)",
        }}
      />
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 py-5">
        <Logo />
        <div className="flex min-w-0 items-center gap-3">
          <a
            href="https://hyperliquid.xyz"
            target="_blank"
            rel="noreferrer"
            className="min-w-0 py-2 text-right text-xs text-ink3 transition-colors hover:text-ink2 max-sm:hidden"
          >
            Powered by Hyperliquid public API
          </a>
          <ThemeToggle />
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-5 pt-16 pb-20 sm:pt-24">
        <p className="mb-4 rounded-full border border-edge bg-panel px-3 py-1 text-[11px] font-medium tracking-wide text-ink2 uppercase">
          Read-only · no keys · no sign-up
        </p>
        <h1 className="max-w-3xl text-center text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Every trade leaves a{" "}
          <span className="bg-gradient-to-r from-accent2 to-mint bg-clip-text text-transparent italic">
            trail
          </span>
          .
        </h1>
        <p className="mt-4 max-w-xl text-center text-base text-pretty text-ink2">
          HypeSleuth reconstructs the full story of any Hyperliquid perp account
          from just a wallet address: PnL in dollars and percent, every entry
          and exit, fees paid, funding collected — with the receipts to prove
          it.
        </p>

        <div className="mt-9 flex w-full flex-col items-center">
          <AddressForm large />
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-ink3">Try a demo wallet:</span>
            {DEMO_WALLETS.map((w) => (
              <Link
                key={w.address}
                href={`/a/${w.address}`}
                className="rounded-full border border-edge bg-panel px-3 py-1 text-xs text-ink2 transition-colors hover:border-accent/50 hover:text-accent2 max-sm:px-3.5 max-sm:py-2"
              >
                {w.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-20 grid w-full max-w-4xl gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-5">
              <h2 className="text-sm font-semibold text-ink">{f.title}</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink2">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </main>

      <footer className="relative z-10 border-t border-edge py-5">
        <p className="mx-auto max-w-6xl px-5 text-center text-xs text-ink3">
          HypeSleuth reads public on-chain data from the Hyperliquid API. Not
          affiliated with Hyperliquid. Nothing here is financial advice.
        </p>
      </footer>
    </div>
  );
}
