import { fmtPrice } from "../format";
import type { HlOutcomeMeta, HlOutcomeQuestion, HlOutcomeSpec } from "./types";

/**
 * HIP-4 outcome markets — Hyperliquid's prediction markets.
 *
 * A market is a pair of fully collateralized side tokens that settle to $1
 * (winner) or $0 (loser), so a position is always a long token balance: there
 * is no leverage, liquidation, or funding, and "shorting Yes" means buying No.
 * A side token is identified by `10 × outcomeId + sideIndex`, which the API
 * spells two ways for the same thing:
 *
 *   `#8560`  fills, open orders, candles, `allMids`
 *   `+8560`  `spotClearinghouseState` balances, and as a fill's `feeToken`
 *
 * Several outcomes can hang off one *question* ("2026 World Cup Champion" →
 * Argentina / Spain / any other team), each still trading as its own binary.
 *
 * `outcomeMeta` lists only *live* markets — a market disappears from it once it
 * settles, which is the common case for trade history. Every label below
 * degrades to something honest ("Outcome 174", "Side 1") rather than guessing;
 * in particular side names are never assumed to be Yes/No, because they aren't
 * always (outcome 856 ships "Spain"/"Argentina").
 */

const OUTCOME_COIN_RE = /^[#+](\d+)$/;

/**
 * Generated markets carry a machine-readable description
 * (`class:priceBinary|underlying:BTC|expiry:20260720-0600|targetPrice:64715`);
 * hand-written ones carry prose. Values never contain spaces, which is what
 * keeps prose that happens to start with "Note:" from parsing as a field.
 */
const KV_DESCRIPTION_RE = /^[a-zA-Z]+:[^|\s]*(\|[a-zA-Z]+:[^|\s]*)*$/;

/** `20260720-0600` → epoch ms (UTC). */
const EXPIRY_RE = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/;

export type OutcomeCoinRef = { outcomeId: number; sideIndex: number };

/** A resolved outcome-market side, ready to render. */
export type OutcomeMarketView = {
  /** Canonical `#8560` form, used as the lookup key in API payloads. */
  coin: string;
  outcomeId: number;
  sideIndex: number;
  /** What this market is about ("Argentina", "BTC ≥ 64,715", "Outcome 174"). */
  title: string;
  /** Parent question, when the outcome is one of several under one heading. */
  question: string | null;
  /** Side label from `sideSpecs`; "Side A"/"Side B" when metadata is gone. */
  sideName: string;
  /** Settlement time (ms) for generated markets that publish one. */
  expiry: number | null;
  /** False once the market settles and drops out of `outcomeMeta`. */
  known: boolean;
};

export function isOutcomeCoin(coin: string): boolean {
  return OUTCOME_COIN_RE.test(coin);
}

export function parseOutcomeCoin(coin: string): OutcomeCoinRef | null {
  const match = OUTCOME_COIN_RE.exec(coin);
  if (!match) return null;
  const id = Number(match[1]);
  if (!Number.isSafeInteger(id)) return null;
  return { outcomeId: Math.floor(id / 10), sideIndex: id % 10 };
}

/** Balance/fee form (`+8560`) → the market form (`#8560`) used as a map key. */
export function toMarketCoin(coin: string): string {
  return coin.startsWith("+") ? `#${coin.slice(1)}` : coin;
}

function parseKvDescription(description: string): Map<string, string> | null {
  if (!KV_DESCRIPTION_RE.test(description)) return null;
  const fields = new Map<string, string>();
  for (const part of description.split("|")) {
    const at = part.indexOf(":");
    fields.set(part.slice(0, at), part.slice(at + 1));
  }
  return fields;
}

function parseExpiry(raw: string | undefined): number | null {
  const match = raw ? EXPIRY_RE.exec(raw) : null;
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  const ts = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  return Number.isFinite(ts) ? ts : null;
}

/** "Will BTC close above X?" → `BTC ≥ 64,715`. */
function priceBinaryTitle(fields: Map<string, string>): string | null {
  const underlying = fields.get("underlying");
  const target = Number(fields.get("targetPrice"));
  if (!underlying || !Number.isFinite(target)) return null;
  return `${underlying} ≥ ${fmtPrice(target)}`;
}

/**
 * Bucket markets split a price range at N thresholds into N+1 outcomes, and
 * the outcome only carries its `index:` — the thresholds live on the question.
 */
function priceBucketTitle(
  questionFields: Map<string, string>,
  index: number,
): string | null {
  const underlying = questionFields.get("underlying");
  const thresholds = (questionFields.get("priceThresholds") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isFinite(n));
  if (!underlying || thresholds.length === 0) return null;
  if (index <= 0) return `${underlying} < ${fmtPrice(thresholds[0])}`;
  if (index >= thresholds.length) {
    return `${underlying} ≥ ${fmtPrice(thresholds[thresholds.length - 1])}`;
  }
  return `${underlying} ${fmtPrice(thresholds[index - 1])} – ${fmtPrice(thresholds[index])}`;
}

type ResolvedOutcome = {
  title: string;
  question: string | null;
  sideNames: string[];
  expiry: number | null;
  known: boolean;
};

export type OutcomeIndex = Map<number, ResolvedOutcome>;

function resolveTitle(
  spec: HlOutcomeSpec,
  question: HlOutcomeQuestion | undefined,
  questionFields: Map<string, string> | null,
): string {
  // "Any other team wins" reads better than the API's bare "Fallback".
  if (question && question.fallbackOutcome === spec.outcome) {
    return "Any other outcome";
  }
  const fields = parseKvDescription(spec.description);
  if (fields) {
    if (fields.get("class") === "priceBinary") {
      const title = priceBinaryTitle(fields);
      if (title) return title;
    }
    const index = Number(fields.get("index"));
    if (questionFields && Number.isInteger(index)) {
      const title = priceBucketTitle(questionFields, index);
      if (title) return title;
    }
  }
  return spec.name || `Outcome ${spec.outcome}`;
}

export function buildOutcomeIndex(meta: HlOutcomeMeta): OutcomeIndex {
  const questionByOutcome = new Map<number, HlOutcomeQuestion>();
  const questionFields = new Map<number, Map<string, string> | null>();
  for (const question of meta.questions ?? []) {
    questionFields.set(
      question.question,
      parseKvDescription(question.description ?? ""),
    );
    const members = [
      question.fallbackOutcome,
      ...(question.namedOutcomes ?? []),
      ...(question.settledNamedOutcomes ?? []),
    ];
    for (const outcome of members) {
      if (typeof outcome === "number") questionByOutcome.set(outcome, question);
    }
  }

  const index: OutcomeIndex = new Map();

  // Settled outcomes are gone from `outcomes` but still listed on their
  // question, so their heading survives even though their own name doesn't.
  for (const [outcome, question] of questionByOutcome) {
    index.set(outcome, {
      title: `Outcome ${outcome}`,
      question: question.name || null,
      sideNames: [],
      expiry: null,
      known: false,
    });
  }

  for (const spec of meta.outcomes ?? []) {
    const question = questionByOutcome.get(spec.outcome);
    const qFields = question
      ? (questionFields.get(question.question) ?? null)
      : null;
    const fields = parseKvDescription(spec.description ?? "");
    index.set(spec.outcome, {
      title: resolveTitle(spec, question, qFields),
      question: question?.name || null,
      sideNames: (spec.sideSpecs ?? []).map((side) => side.name),
      expiry:
        parseExpiry(fields?.get("expiry")) ??
        parseExpiry(qFields?.get("expiry")),
      known: true,
    });
  }

  return index;
}

export function describeOutcomeCoin(
  coin: string,
  index: OutcomeIndex,
): OutcomeMarketView | null {
  const ref = parseOutcomeCoin(coin);
  if (!ref) return null;
  const resolved = index.get(ref.outcomeId);
  return {
    coin: toMarketCoin(coin),
    outcomeId: ref.outcomeId,
    sideIndex: ref.sideIndex,
    title: resolved?.title ?? `Outcome ${ref.outcomeId}`,
    question: resolved?.question ?? null,
    // Never guessed as Yes/No: a settled market's sides could have been
    // anything, so an unnamed side reads as the placeholder it is.
    sideName:
      resolved?.sideNames[ref.sideIndex] ??
      `Side ${String.fromCharCode(65 + ref.sideIndex)}`,
    expiry: resolved?.expiry ?? null,
    known: resolved?.known ?? false,
  };
}

/** Resolved views for every outcome coin in `coins`, keyed by `#NNNN`. */
export function describeOutcomeCoins(
  coins: Iterable<string>,
  index: OutcomeIndex,
): Record<string, OutcomeMarketView> {
  const out: Record<string, OutcomeMarketView> = {};
  for (const coin of coins) {
    const key = toMarketCoin(coin);
    if (out[key]) continue;
    const view = describeOutcomeCoin(coin, index);
    if (view) out[key] = view;
  }
  return out;
}
