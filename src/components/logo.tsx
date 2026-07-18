import Link from "next/link";

export function Logo({ large = false }: { large?: boolean }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5">
      <svg
        aria-hidden="true"
        viewBox="0 0 64 64"
        className={large ? "size-12" : "size-7"}
      >
        <rect width="64" height="64" rx="14" fill="#0c1215" />
        <rect
          width="63"
          height="63"
          x="0.5"
          y="0.5"
          rx="13.5"
          fill="none"
          stroke="rgba(151,252,228,0.25)"
        />
        <path
          d="M12 40 L24 28 L33 35 L52 16"
          fill="none"
          stroke="#2dd4bf"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M40 16 H52 V28"
          fill="none"
          stroke="#2dd4bf"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="20" cy="48" r="3.5" fill="#97fce4" />
        <circle cx="32" cy="48" r="3.5" fill="#4bbfa9" />
        <circle cx="44" cy="48" r="3.5" fill="#1e7d70" />
      </svg>
      <span
        className={`font-semibold tracking-tight text-ink ${large ? "text-3xl" : "text-[17px]"}`}
      >
        Hype<span className="text-accent2">Track</span>
      </span>
    </Link>
  );
}
