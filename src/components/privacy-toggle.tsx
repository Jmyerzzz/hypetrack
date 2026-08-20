"use client";

import { usePrivacy } from "@/lib/privacy";

/**
 * Hides every amount on the page — dollar figures, position sizes, token
 * balances — behind a mask, leaving percentages and market prices alone:
 * enough to show how an account is doing without showing what it's worth.
 * Sizes go with the amounts because size times a public mark price is the
 * notional. Like the theme toggle beside it, the icon is the
 * action rather than the state: an open eye means clicking reveals. Hidden is
 * the loud state — an accented button, so it can't be forgotten about.
 */
export function PrivacyToggle() {
  const { hidden, setHidden } = usePrivacy();
  const label = hidden ? "Show amounts" : "Hide amounts";
  return (
    <button
      type="button"
      onClick={() => setHidden(!hidden)}
      aria-pressed={hidden}
      title={label}
      className={`rounded-lg border p-2 transition-colors ${
        hidden
          ? "border-accent/40 bg-accent/10 text-accent2 hover:border-accent/60"
          : "border-edge bg-panel text-ink3 hover:border-edge2 hover:text-ink"
      }`}
    >
      {hidden ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            d="M10.6 6.2A9.6 9.6 0 0 1 12 6.1c6 0 9.5 6 9.5 6a17 17 0 0 1-2.9 3.5M6.4 8A17 17 0 0 0 2.5 12s3.5 6 9.5 6a9.3 9.3 0 0 0 3.9-.85"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M9.9 9.9a3 3 0 0 0 4.2 4.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M3.5 3.5 20.5 20.5" strokeLinecap="round" />
        </svg>
      )}
      <span className="sr-only">{label}</span>
    </button>
  );
}
