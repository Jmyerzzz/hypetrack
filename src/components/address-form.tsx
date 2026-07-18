"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isValidAddress, normalizeAddress, shortAddress } from "@/lib/format";
import { readRecentAddresses, rememberAddress } from "@/lib/hooks";

export function AddressForm({ large = false }: { large?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(readRecentAddresses());
  }, []);

  const valid = isValidAddress(value);

  const go = (address: string) => {
    const normalized = normalizeAddress(address);
    rememberAddress(normalized);
    router.push(`/a/${normalized}`);
  };

  return (
    <div
      className={large ? "w-full min-w-0 max-w-xl" : "w-full min-w-0 max-w-sm"}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (valid) go(value);
        }}
        className={`flex items-center gap-2 rounded-xl border bg-panel transition-colors focus-within:border-accent/60 ${
          touched && value && !valid ? "border-down/60" : "border-edge2"
        } ${large ? "p-2 pl-4" : "p-1.5 pl-3"}`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={`shrink-0 text-ink3 ${large ? "size-5" : "size-4"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="Wallet address (0x…)"
          spellCheck={false}
          autoComplete="off"
          className={`num w-full min-w-0 bg-transparent text-ink placeholder:font-sans placeholder:text-ink3 focus:outline-none ${
            large ? "text-base" : "text-base sm:text-sm"
          }`}
        />
        <button
          type="submit"
          disabled={!valid}
          className={`btn-accent glow-accent shrink-0 rounded-lg font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none ${
            large
              ? "px-4 py-2 text-sm max-sm:py-2.5"
              : "px-3 py-1.5 text-xs max-sm:py-2"
          }`}
        >
          Track
        </button>
      </form>
      {touched && value && !valid && (
        <p className="mt-2 text-xs text-downt">
          Enter a valid EVM address: 0x followed by 40 hex characters.
        </p>
      )}
      {large && recent.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink3">Recent:</span>
          {recent.map((address) => (
            <button
              key={address}
              type="button"
              onClick={() => go(address)}
              className="num rounded-full border border-edge bg-panel px-3 py-1.5 text-xs text-ink2 transition-colors hover:border-accent/50 hover:text-accent2 max-sm:px-3.5 max-sm:py-2"
            >
              {shortAddress(address)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
