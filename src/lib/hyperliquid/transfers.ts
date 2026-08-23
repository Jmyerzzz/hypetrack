import type { TransferView } from "../api-types";
import type { HlLedgerUpdate } from "./types";

const num = (s: string | null | undefined): number => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};

const TRANSFER_LABELS: Record<string, string> = {
  deposit: "Deposit",
  withdraw: "Withdraw",
  accountClassTransfer: "Perp ⇄ Spot",
  internalTransfer: "Internal transfer",
  spotTransfer: "Spot transfer",
  send: "Send",
  cStakingTransfer: "Staking",
  spotGenesis: "Genesis airdrop",
  vaultDeposit: "Vault deposit",
  vaultWithdraw: "Vault withdraw",
  vaultDistribution: "Vault distribution",
  subAccountTransfer: "Sub-account transfer",
};

/**
 * Ledger types that can only ever shuffle money the owner already had:
 * `accountClassTransfer` moves USDC between one account's own spot and perp
 * wallets, and `subAccountTransfer` runs between a master and one of its own
 * sub-accounts — Hyperliquid rejects it for any other destination. Neither is
 * external capital, whichever way it points.
 */
const ALWAYS_INTERNAL = new Set(["accountClassTransfer", "subAccountTransfer"]);

/** Peer types where the counterparty decides whether the move is internal. */
const PEER_TYPES = new Set(["internalTransfer", "spotTransfer", "send"]);

/** The other side of a two-party delta, lowercased; null when unnamed. */
function counterparty(
  delta: HlLedgerUpdate["delta"],
  address: string,
): string | null {
  const from = delta.user?.toLowerCase() ?? null;
  const to = delta.destination?.toLowerCase() ?? null;
  if (to && to !== address) return to;
  if (from && from !== address) return from;
  return null;
}

/** +1 when the delta credits `address`, -1 when it debits, null if unnamed. */
function direction(
  delta: HlLedgerUpdate["delta"],
  address: string,
): 1 | -1 | null {
  if (delta.destination?.toLowerCase() === address) return 1;
  if (delta.user?.toLowerCase() === address) return -1;
  return null;
}

const peerDetail = (
  delta: HlLedgerUpdate["delta"],
  incoming: boolean,
): string =>
  incoming ? `from ${delta.user ?? "?"}` : `to ${delta.destination ?? "?"}`;

/**
 * Addresses the ledger itself proves share an owner with `address`. Every
 * `subAccountTransfer` runs between a master and one of its own sub-accounts,
 * so the counterparty is same-owner by construction — no lookup needed. This
 * is also the only route from a sub-account back up to its master: the
 * `subAccounts` endpoint answers `null` for sub-account addresses.
 */
export function relatedFromLedger(
  ledger: readonly HlLedgerUpdate[],
  address: string,
): string[] {
  const found = new Set<string>();
  for (const update of ledger) {
    if (update.delta.type !== "subAccountTransfer") continue;
    const peer = counterparty(update.delta, address);
    if (peer) found.add(peer);
  }
  return [...found];
}

/**
 * One ledger entry as the transfers table shows it: a signed USD effect on
 * this account where that is determinable, plus whether the money stayed
 * inside the owner's own accounts.
 *
 * `related` holds every address under the same owner as `address` (the master
 * and its sub-accounts). A peer transfer to one of them funds a sub-account
 * rather than paying someone, so it is flagged internal and kept out of the
 * capital-flow totals — the same treatment `subAccountTransfer` gets, since
 * the Hyperliquid UI and a plain `usdSend` to the same address are the same
 * move as far as the owner's balance sheet is concerned.
 */
export function toTransferView(
  update: HlLedgerUpdate,
  address: string,
  related: ReadonlySet<string> = new Set(),
): TransferView {
  const d = update.delta;
  let amountUsd: number | null = null;
  let detail: string | null = null;
  let internal = ALWAYS_INTERNAL.has(d.type);

  if (PEER_TYPES.has(d.type)) {
    const peer = counterparty(d, address);
    internal = peer != null && related.has(peer);
  }

  switch (d.type) {
    case "deposit":
      amountUsd = num(d.usdc);
      break;
    case "withdraw":
      amountUsd = -num(d.usdc);
      break;
    case "accountClassTransfer":
      amountUsd = num(d.usdc);
      detail = d.toPerp ? "Spot → Perp" : "Perp → Spot";
      break;
    case "subAccountTransfer": {
      // Both parties see the same delta, so the amount can't be signed for
      // either one — direction comes from which side this account is on. A
      // delta naming neither keeps whatever sign the API reported; the entry
      // is internal regardless, so a wrong guess can't reach the totals.
      const dir = direction(d, address);
      amountUsd = dir == null ? num(d.usdc) : dir * Math.abs(num(d.usdc));
      detail = dir == null ? null : peerDetail(d, dir > 0);
      break;
    }
    case "internalTransfer": {
      const incoming = d.destination?.toLowerCase() === address;
      amountUsd = incoming ? num(d.usdc) : -num(d.usdc);
      detail = peerDetail(d, incoming);
      break;
    }
    case "spotTransfer":
    case "send": {
      const incoming = d.destination?.toLowerCase() === address;
      const value = num(d.usdcValue) || num(d.usdc);
      amountUsd = value > 0 ? (incoming ? value : -value) : null;
      detail =
        `${d.amount ?? ""} ${d.token ?? ""} ${peerDetail(d, incoming)}`.trim();
      break;
    }
    default: {
      if (d.usdc != null) amountUsd = num(d.usdc);
      else if (d.usdcValue != null) amountUsd = num(d.usdcValue);
      if (d.amount != null && d.token != null)
        detail = `${d.amount} ${d.token}`;
      break;
    }
  }

  return {
    time: update.time,
    type: d.type,
    label: TRANSFER_LABELS[d.type] ?? d.type,
    amountUsd,
    detail,
    internal,
    hash: update.hash,
  };
}

/**
 * Capital in and out, keyed off the sign of the USD effect rather than the
 * ledger `type`. Accounts are routinely funded by `send`/`spotTransfer` or a
 * peer `internalTransfer` and never touch the Arbitrum bridge, so matching
 * only `deposit`/`withdraw` reports $0 in for them.
 *
 * Internal moves are skipped: money crossing between the owner's own accounts
 * — spot ⇄ perp, or master ⇄ sub-account — was never deposited or withdrawn,
 * it only changed pockets.
 */
export function sumExternalFlows(transfers: readonly TransferView[]): {
  totalDeposited: number;
  totalWithdrawn: number;
} {
  let totalDeposited = 0;
  let totalWithdrawn = 0;
  for (const t of transfers) {
    if (t.internal || t.amountUsd == null) continue;
    if (t.amountUsd > 0) totalDeposited += t.amountUsd;
    else totalWithdrawn -= t.amountUsd;
  }
  return { totalDeposited, totalWithdrawn };
}
