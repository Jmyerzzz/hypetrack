import type { Metadata } from "next";
import { AddressForm } from "@/components/address-form";
import { Dashboard } from "@/components/dashboard/dashboard";
import { Logo } from "@/components/logo";
import { isValidAddress, normalizeAddress, shortAddress } from "@/lib/format";

type Props = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  return {
    title: isValidAddress(address)
      ? shortAddress(normalizeAddress(address))
      : "Invalid address",
  };
}

export default async function AddressPage({ params }: Props) {
  const { address } = await params;
  if (!isValidAddress(address)) {
    return (
      <div className="flex min-h-dvh flex-col">
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-4">
          <Logo />
        </header>
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center gap-4 px-5 pb-24">
          <h1 className="text-xl font-semibold">
            That doesn’t look like a wallet address
          </h1>
          <p className="max-w-md text-center text-sm text-ink2">
            Addresses are 0x followed by 40 hex characters. Paste one below to
            open its portfolio.
          </p>
          <AddressForm large />
        </main>
      </div>
    );
  }
  return <Dashboard address={normalizeAddress(address)} />;
}
