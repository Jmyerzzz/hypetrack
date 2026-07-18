import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: {
    default: "HypeTrack — Hyperliquid Portfolio Tracker",
    template: "%s · HypeTrack",
  },
  description:
    "Comprehensive portfolio analytics for any Hyperliquid account: PnL, trade history with entries and exits, fees, and funding — from just a wallet address.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
