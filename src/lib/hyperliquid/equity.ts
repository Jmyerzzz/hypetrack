/** All figures in USD, already parsed from the raw string API fields. */
export interface EquityInputs {
  /** Main-DEX perp account value (`marginSummary.accountValue`). */
  mainPerpEquity: number;
  /** Summed account value across every HIP-3 builder-DEX perp book. */
  builderPerpEquity: number;
  /** Marked value of all spot balances, USDC included at $1. */
  rawSpotValue: number;
  /** Marked value of HIP-4 outcome-market holdings. */
  outcomeValue: number;
  /** Spot USDC balance `total`. */
  usdcTotal: number;
  /** Spot USDC balance `hold` — perp margin drawn from spot rides in here. */
  usdcHold: number;
}

export interface EquityBreakdown {
  perpEquity: number;
  /** Held spot USDC that backs perps — double-counted, so netted out. */
  perpCollateralInSpot: number;
  totalEquity: number;
  spotValue: number;
  freeSpotUsdc: number;
}

/**
 * Reconcile perp + spot into a single account equity that matches
 * Hyperliquid's own combined account value.
 *
 * Hyperliquid's unified-collateral model draws perp margin straight from the
 * spot USDC balance: that USDC is reported as `hold` on the spot USDC row while
 * the same collateral is marked to market as the perp `accountValue`. Summing
 * perp equity and full spot USDC would count it twice, so the held USDC is
 * netted out of the spot side.
 *
 * We subtract the *held* USDC, not the perp equity. The held amount is the
 * collateral actually parked in the spot balance; the perp equity is that same
 * collateral **plus the open positions' unrealized PnL**. That PnL lives only
 * in the perp account, so netting perp equity instead would leave the PnL
 * stranded in the spot side — the bug that inflated `spotValue`/`totalEquity`
 * by exactly the unrealized PnL. `usdcTotal - usdcHold` equals Hyperliquid's
 * reported `tokenToAvailableAfterMaintenance` for USDC.
 *
 * Only main-DEX margin rides in spot USDC (builder-DEX collateral sits in its
 * own clearinghouse), and legacy/separate wallets carry no such hold, so the
 * `mainPerpEquity > 0` guard makes this a no-op for them — and stops a pure
 * spot-order hold (no perps) from being mistaken for posted collateral.
 *
 * `freeSpotUsdc` (withdrawable) nets the *whole* USDC hold, not just the perp
 * collateral: spot-order locks aren't withdrawable either. They differ only
 * when a spot order rests without perps — locked USDC is still equity (kept in
 * `totalEquity`) yet not withdrawable (excluded from `freeSpotUsdc`).
 */
export function reconcileEquity(input: EquityInputs): EquityBreakdown {
  const perpEquity = input.mainPerpEquity + input.builderPerpEquity;
  const perpCollateralInSpot =
    input.mainPerpEquity > 0 ? Math.min(input.usdcHold, input.usdcTotal) : 0;
  const spotValue = input.rawSpotValue - perpCollateralInSpot;
  const totalEquity = perpEquity + spotValue + input.outcomeValue;
  const freeSpotUsdc = Math.max(0, input.usdcTotal - input.usdcHold);
  return {
    perpEquity,
    perpCollateralInSpot,
    totalEquity,
    spotValue,
    freeSpotUsdc,
  };
}
