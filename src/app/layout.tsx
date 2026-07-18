import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: {
    default: "HypeSleuth — Hyperliquid Account Forensics",
    template: "%s · HypeSleuth",
  },
  description:
    "Every trade leaves a trail. HypeSleuth reconstructs the full story of any Hyperliquid perp account: PnL, entries and exits, fees, and funding — from just a wallet address.",
};

/** Applies the stored theme before first paint to avoid a flash. */
const themeInit = `try{var t=localStorage.getItem("hypesleuth:theme");if(!t)t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh antialiased">
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme bootstrap, no user input */}
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
