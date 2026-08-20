"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  fmtCompact,
  fmtNetPnlBreakdown,
  fmtSize,
  fmtUsd,
  fmtUsdSigned,
} from "./format";

const PRIVACY_KEY = "hypesleuth:private";

/**
 * Stand-in for a hidden amount. One fixed width whatever the figure was: a
 * mask that tracked its digits would still say how big the number is, and a
 * column of them would still rank the rows. Keeps the "$" so a masked figure
 * still reads as money rather than as missing data — that's "—".
 */
const MASK = "$•••";

/**
 * Sizes and token balances mask without the "$" — they aren't dollar figures,
 * but a position's size times a public mark price is its notional, so hiding
 * the amounts while leaving the sizes wouldn't hide anything.
 */
const SIZE_MASK = "•••";

function maskUsd(value: number): string {
  return Number.isFinite(value) ? MASK : "—";
}

function maskSize(value: number): string {
  return Number.isFinite(value) ? SIZE_MASK : "—";
}

/**
 * Signs survive masking. Which way a trade went isn't the secret — the
 * percentage beside it and the color on it say so already — and a column of
 * unsigned masks would lose the one thing still worth reading down it.
 */
function maskUsdSigned(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value > 0) return `+${MASK}`;
  if (value < 0) return `−${MASK}`;
  return MASK;
}

/** Keeps the breakdown's shape — including a rebate's flipped operator. */
function maskNetPnlBreakdown(
  grossPnl: number,
  fees: number,
  funding: number,
): string {
  const feeOp = fees >= 0 ? "−" : "+";
  const fundOp = funding >= 0 ? "+" : "−";
  return `${maskUsdSigned(grossPnl)} ${feeOp} ${MASK} ${fundOp} ${MASK}`;
}

/**
 * The money formatters from `@/lib/format`, or masked counterparts with the
 * same signatures. Components read them off {@link useMoney} rather than
 * importing them, so a call site is identical either way and no component has
 * to know the toggle exists. Percentages, prices, durations and counts keep
 * their plain imports: what's hidden is how much, not how it went — and a
 * price is public market data that says nothing about this account.
 */
export type Money = {
  fmtUsd: typeof fmtUsd;
  fmtUsdSigned: typeof fmtUsdSigned;
  fmtNetPnlBreakdown: typeof fmtNetPnlBreakdown;
  fmtSize: typeof fmtSize;
  /** Token balances — the only compacted plain number that is a quantity. */
  fmtCompact: typeof fmtCompact;
  /**
   * True while amounts are hidden — for the figures that have to drop out
   * rather than mask, like a chart axis whose every tick would read alike.
   */
  hidden: boolean;
};

// Two frozen sets rather than per-render closures: identity is stable, so a
// formatter can sit in a `useMemo` dependency list without invalidating it.
const PLAIN: Money = {
  fmtUsd,
  fmtUsdSigned,
  fmtNetPnlBreakdown,
  fmtSize,
  fmtCompact,
  hidden: false,
};
const MASKED: Money = {
  fmtUsd: maskUsd,
  fmtUsdSigned: maskUsdSigned,
  fmtNetPnlBreakdown: maskNetPnlBreakdown,
  fmtSize: maskSize,
  fmtCompact: maskSize,
  hidden: true,
};

/** The formatter set for a given setting; {@link useMoney} wraps it. */
export function moneyFormat(hidden: boolean): Money {
  return hidden ? MASKED : PLAIN;
}

type PrivacyValue = { hidden: boolean; setHidden: (next: boolean) => void };

const PrivacyContext = createContext<PrivacyValue>({
  hidden: false,
  setHidden: () => {},
});

/**
 * Page-wide "hide amounts" state, remembered across sessions. One switch for
 * the whole dashboard: a per-section control would leave a screenshot
 * half-covered.
 */
export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHiddenState] = useState(false);

  // Read after mount rather than in the initializer: this renders on the
  // server too, where there is no stored preference to read, and a first
  // client render that disagreed would be a hydration mismatch. Nothing is
  // exposed in the gap — every figure on the page arrives with a client fetch
  // that resolves long after this settles.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(PRIVACY_KEY) === "1") {
        setHiddenState(true);
      }
    } catch {
      /* private mode */
    }
  }, []);

  const setHidden = useCallback((next: boolean) => {
    setHiddenState(next);
    try {
      if (next) window.localStorage.setItem(PRIVACY_KEY, "1");
      else window.localStorage.removeItem(PRIVACY_KEY);
    } catch {
      /* private mode */
    }
  }, []);

  const value = useMemo(() => ({ hidden, setHidden }), [hidden, setHidden]);
  return (
    <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
  );
}

/** The toggle's own state; everything else wants {@link useMoney}. */
export function usePrivacy(): PrivacyValue {
  return useContext(PrivacyContext);
}

/** Money formatters for the current privacy setting. */
export function useMoney(): Money {
  return moneyFormat(useContext(PrivacyContext).hidden);
}
