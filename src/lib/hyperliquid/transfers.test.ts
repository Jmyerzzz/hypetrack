import { describe, expect, it } from "vitest";
import {
  relatedFromLedger,
  sumExternalFlows,
  toTransferView,
} from "./transfers";
import type { HlLedgerUpdate } from "./types";

const MASTER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SUB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SIBLING = "0xcccccccccccccccccccccccccccccccccccccccc";
const STRANGER = "0xdddddddddddddddddddddddddddddddddddddddd";

let seq = 0;
const update = (delta: HlLedgerUpdate["delta"]): HlLedgerUpdate => ({
  time: 1_700_000_000_000 + seq++,
  hash: `0x${seq}`,
  delta,
});

const family = new Set([MASTER, SUB, SIBLING]);

const view = (delta: HlLedgerUpdate["delta"], address = MASTER) =>
  toTransferView(update(delta), address, family);

describe("toTransferView", () => {
  it("signs bridge deposits and withdrawals as external flow", () => {
    expect(view({ type: "deposit", usdc: "500" })).toMatchObject({
      amountUsd: 500,
      internal: false,
    });
    expect(view({ type: "withdraw", usdc: "200", fee: "1" })).toMatchObject({
      amountUsd: -200,
      internal: false,
    });
  });

  it("marks a transfer to a sub-account internal in both directions", () => {
    const out = view({
      type: "subAccountTransfer",
      usdc: "1000",
      user: MASTER,
      destination: SUB,
    });
    expect(out).toMatchObject({ amountUsd: -1000, internal: true });
    expect(out.detail).toBe(`to ${SUB}`);

    const back = view({
      type: "subAccountTransfer",
      usdc: "400",
      user: SUB,
      destination: MASTER,
    });
    expect(back).toMatchObject({ amountUsd: 400, internal: true });
    expect(back.detail).toBe(`from ${SUB}`);
  });

  it("signs a sub-account transfer from the sub-account's own side too", () => {
    // The same delta appears in both ledgers, so the sign can't come from the
    // API — it has to follow whichever side is being viewed.
    const seen = toTransferView(
      update({
        type: "subAccountTransfer",
        usdc: "1000",
        user: MASTER,
        destination: SUB,
      }),
      SUB,
      family,
    );
    expect(seen).toMatchObject({ amountUsd: 1000, internal: true });
  });

  it("keeps a sub-account transfer internal when the delta names no parties", () => {
    expect(view({ type: "subAccountTransfer", usdc: "-750" })).toMatchObject({
      amountUsd: -750,
      detail: null,
      internal: true,
    });
  });

  it("treats a peer transfer as internal only when the peer is same-owner", () => {
    expect(
      view({
        type: "internalTransfer",
        usdc: "300",
        user: MASTER,
        destination: SUB,
      }),
    ).toMatchObject({ amountUsd: -300, internal: true });

    expect(
      view({
        type: "internalTransfer",
        usdc: "300",
        user: MASTER,
        destination: STRANGER,
      }),
    ).toMatchObject({ amountUsd: -300, internal: false });
  });

  it("applies the same rule to spot sends", () => {
    expect(
      view({
        type: "spotTransfer",
        token: "USDC",
        amount: "250",
        usdcValue: "250",
        user: MASTER,
        destination: SIBLING,
      }),
    ).toMatchObject({ amountUsd: -250, internal: true });

    expect(
      view({
        type: "spotTransfer",
        token: "USDC",
        amount: "250",
        usdcValue: "250",
        user: STRANGER,
        destination: MASTER,
      }),
    ).toMatchObject({ amountUsd: 250, internal: false });
  });

  it("keeps spot ⇄ perp shuffles internal", () => {
    expect(
      view({ type: "accountClassTransfer", usdc: "900", toPerp: true }),
    ).toMatchObject({ amountUsd: 900, detail: "Spot → Perp", internal: true });
  });

  it("leaves an unvalued token transfer without an amount", () => {
    const t = view({
      type: "spotTransfer",
      token: "WIF",
      amount: "12",
      user: MASTER,
      destination: STRANGER,
    });
    expect(t.amountUsd).toBeNull();
    expect(t.detail).toBe(`12 WIF to ${STRANGER}`);
  });
});

describe("sumExternalFlows", () => {
  it("counts only capital that crossed the owner's boundary", () => {
    const transfers = [
      view({ type: "deposit", usdc: "5000" }),
      view({ type: "withdraw", usdc: "1200" }),
      // Funding a sub-account and pulling part of it back: net zero either way,
      // and neither leg is capital the owner put in or took out.
      view({
        type: "subAccountTransfer",
        usdc: "3000",
        user: MASTER,
        destination: SUB,
      }),
      view({
        type: "subAccountTransfer",
        usdc: "500",
        user: SUB,
        destination: MASTER,
      }),
      view({ type: "accountClassTransfer", usdc: "2000", toPerp: true }),
      view({
        type: "internalTransfer",
        usdc: "800",
        user: MASTER,
        destination: SUB,
      }),
      view({
        type: "internalTransfer",
        usdc: "600",
        user: STRANGER,
        destination: MASTER,
      }),
    ];

    expect(sumExternalFlows(transfers)).toEqual({
      totalDeposited: 5600,
      totalWithdrawn: 1200,
    });
  });

  it("ignores transfers whose USD value is unknown", () => {
    expect(
      sumExternalFlows([
        view({
          type: "spotTransfer",
          token: "WIF",
          amount: "12",
          user: STRANGER,
          destination: MASTER,
        }),
      ]),
    ).toEqual({ totalDeposited: 0, totalWithdrawn: 0 });
  });
});

describe("relatedFromLedger", () => {
  it("reads the master off a sub-account's own ledger", () => {
    const ledger = [
      update({ type: "deposit", usdc: "100" }),
      update({
        type: "subAccountTransfer",
        usdc: "1000",
        user: MASTER,
        destination: SUB,
      }),
      update({
        type: "internalTransfer",
        usdc: "5",
        user: STRANGER,
        destination: SUB,
      }),
    ];
    expect(relatedFromLedger(ledger, SUB)).toEqual([MASTER]);
  });

  it("collects every sub-account a master has moved money to", () => {
    const ledger = [
      update({
        type: "subAccountTransfer",
        usdc: "1",
        user: MASTER,
        destination: SUB,
      }),
      update({
        type: "subAccountTransfer",
        usdc: "2",
        user: SIBLING,
        destination: MASTER,
      }),
      update({
        type: "subAccountTransfer",
        usdc: "3",
        user: MASTER,
        destination: SUB,
      }),
    ];
    expect(relatedFromLedger(ledger, MASTER).sort()).toEqual(
      [SUB, SIBLING].sort(),
    );
  });
});
