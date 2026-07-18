import Link from "next/link";

/**
 * The HypeSleuth mark: a magnifying glass inspecting an uptrend —
 * account forensics in one glyph. Colors ride the theme tokens.
 */
export function Logo({ large = false }: { large?: boolean }) {
  return (
    <Link href="/" className="group inline-flex shrink-0 items-center gap-2.5">
      <svg
        aria-hidden="true"
        viewBox="0 0 64 64"
        fill="none"
        className={large ? "size-12" : "size-8"}
      >
        <circle cx="27" cy="27" r="17" stroke="var(--accent)" strokeWidth="5" />
        <path
          d="M40 40 L54 54"
          stroke="var(--accent)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d="M17.5 32 L23.5 25 L27.5 28.5 L36 18.5"
          stroke="var(--accent2)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M30.5 18 H36.5 V24"
          stroke="var(--accent2)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className={`font-semibold tracking-tight text-ink ${large ? "text-3xl" : "text-[17px] max-sm:hidden"}`}
      >
        Hype<span className="text-accent2 italic">Sleuth</span>
      </span>
    </Link>
  );
}
