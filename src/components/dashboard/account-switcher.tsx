"use client";

import { SegmentedControl } from "@/components/ui";
import { ALL_ACCOUNTS } from "@/lib/accounts";
import type { SubAccountView } from "@/lib/api-types";

/**
 * Master/sub-account selector, shown only when the viewed address owns
 * sub-accounts. Hyperliquid keeps each sub-account's balances, fills, and
 * portfolio history under its own address — the master's queries never
 * include them — so picking one simply repoints every query on the page at
 * the selected address; nothing is merged or filtered.
 *
 * "All" is the exception, and it leads because it's the whole: it fetches
 * every account and adds them up client-side (see lib/accounts.ts), since the
 * API has no notion of a household.
 */
export function AccountSwitcher({
  master,
  subAccounts,
  selected,
  onSelect,
}: {
  master: string;
  subAccounts: SubAccountView[];
  /** Address of the account currently shown, or `ALL_ACCOUNTS`. */
  selected: string;
  onSelect: (address: string) => void;
}) {
  return (
    <SegmentedControl
      options={[
        { value: ALL_ACCOUNTS, label: "All" },
        { value: master, label: "Main" },
        ...subAccounts.map((s) => ({ value: s.address, label: s.name })),
      ]}
      value={selected}
      onChange={onSelect}
    />
  );
}
