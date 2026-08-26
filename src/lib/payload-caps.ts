/**
 * How much of each list an activity payload ships. The server slices to these
 * when it builds one account's payload, and the all-accounts merge slices to
 * them again after concatenating — so a combined view is the same size as a
 * single-account one, and the "loaded rows only" caveats keep their meaning.
 */
export const TRADES_PAYLOAD_CAP = 500;
export const FILLS_PAYLOAD_CAP = 600;
export const FUNDING_PAYLOAD_CAP = 500;
export const TRANSFERS_PAYLOAD_CAP = 400;
