"use client";

import { SegmentedControl } from "@/components/ui";
import type { SubAccountView } from "@/lib/api-types";

/**
 * Master/sub-account selector, shown only when the viewed address owns
 * sub-accounts. Hyperliquid keeps each sub-account's balances, fills, and
 * portfolio history under its own address — the master's queries never
 * include them — so switching simply repoints every query on the page at the
 * selected address; nothing is merged or filtered.
 */
export function AccountSwitcher({
  master,
  subAccounts,
  selected,
  onSelect,
}: {
  master: string;
  subAccounts: SubAccountView[];
  /** Address of the account currently shown (the master or one sub). */
  selected: string;
  onSelect: (address: string) => void;
}) {
  return (
    <SegmentedControl
      options={[
        { value: master, label: "Main" },
        ...subAccounts.map((s) => ({ value: s.address, label: s.name })),
      ]}
      value={selected}
      onChange={onSelect}
    />
  );
}
