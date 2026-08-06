/**
 * How far the price has to move from the mark to reach `target`, as a signed
 * fraction of the mark: negative when the level sits below the current price,
 * positive when it sits above. A short's liquidation is therefore a positive
 * distance and a long's a negative one — the sign is the direction of the move
 * the position is exposed to, not a judgement about it.
 *
 * Null when either price is missing or the mark can't anchor a percentage,
 * which is the honest answer for an unpriced market rather than a bare 0%.
 */
export function distanceFromMark(
  target: number | null | undefined,
  mark: number | null | undefined,
): number | null {
  if (target == null || mark == null) return null;
  if (!Number.isFinite(target) || !Number.isFinite(mark)) return null;
  if (mark <= 0) return null;
  return (target - mark) / mark;
}
