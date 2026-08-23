import type { SubAccountsPayload } from "../api-types";
import { cache } from "../cache";
import { normalizeAddress } from "../format";
import { fetchSubAccounts } from "../hyperliquid/client";
import { relatedFromLedger } from "../hyperliquid/transfers";
import type { HlLedgerUpdate } from "../hyperliquid/types";

/** Sub-accounts are created/renamed rarely; no need to refetch per page load. */
const SUBACCOUNTS_TTL_MS = 5 * 60_000;

/**
 * Cached sub-account list for one master — the sub-accounts API route and the
 * activity builder share this entry, so the switcher and the transfer
 * classification below never pay for the same lookup twice.
 */
export function getSubAccounts(address: string): Promise<SubAccountsPayload> {
  return cache.getOrLoad(
    `subaccounts:${address}`,
    SUBACCOUNTS_TTL_MS,
    async (): Promise<SubAccountsPayload> => {
      const subs = (await fetchSubAccounts(address)) ?? [];
      return {
        address,
        fetchedAt: Date.now(),
        subAccounts: subs.map((s) => ({
          name: s.name,
          address: normalizeAddress(s.subAccountUser),
        })),
      };
    },
  );
}

async function subAccountAddresses(address: string): Promise<string[]> {
  try {
    return (await getSubAccounts(address)).subAccounts.map((s) => s.address);
  } catch {
    // An unreachable lookup only costs precision: transfers that would have
    // been recognized as internal fall back to counting as capital flow.
    return [];
  }
}

/**
 * Every account under the same owner as `address`, `address` included.
 *
 * Money moving between two of these never enters or leaves the owner's balance
 * sheet, so the transfers that carry it are excluded from the deposit and
 * withdrawal totals. The set is assembled from two sources: the master's own
 * sub-account list, and the ledger's `subAccountTransfer` entries, which name
 * a same-owner counterparty by construction. The ledger is what makes this
 * work from a sub-account's own dashboard — `subAccounts` returns `null` for a
 * sub-account address, so nothing else can identify its master.
 *
 * Never rejects: a failed lookup degrades to a smaller set, not an error.
 */
export async function relatedAccounts(
  address: string,
  ledger: readonly HlLedgerUpdate[],
): Promise<Set<string>> {
  const related = new Set<string>([
    address,
    ...relatedFromLedger(ledger, address),
  ]);

  const own = await subAccountAddresses(address);
  for (const sub of own) related.add(sub);

  // No sub-accounts of its own, but the ledger named a same-owner peer: this
  // address is itself a sub-account and that peer is its master, whose list
  // covers the sibling sub-accounts. A sub-account has exactly one master, so
  // anything but a single candidate means the ledger read is off — don't guess.
  if (own.length === 0) {
    const candidates = [...related].filter((a) => a !== address);
    if (candidates.length === 1) {
      for (const sibling of await subAccountAddresses(candidates[0])) {
        related.add(sibling);
      }
    }
  }

  return related;
}
