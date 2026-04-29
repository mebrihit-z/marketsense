/* eslint-disable */
/**
 * Net flow at horizon start vs end: ((New − Old) / |Old|) × 100 (denominator uses absolute value so
 * the % magnitude is vs baseline size regardless of sign). When |Old| is tiny, the ratio is
 * numerically unstable; below {@link HORIZON_ENDPOINT_PCT_MIN_ABS_OLD_USD} we return null so the
 * UI can show "—" instead of absurd magnitudes.
 */
export const HORIZON_ENDPOINT_PCT_MIN_ABS_OLD_USD = 500_000;

/**
 * Share of aggregate % change from this slice's dollar delta vs **absolute** total start-period net
 * (same denominator for every slice). Then Σ slicePct matches whole-book % when deltas partition
 * the total change.
 */
export function horizonSlicePercentOfTotalStart(deltaUsd: number, totalOldUsd: number): number | null {
  if (!Number.isFinite(deltaUsd) || !Number.isFinite(totalOldUsd)) return null;
  const denom = Math.abs(totalOldUsd);
  if (denom < HORIZON_ENDPOINT_PCT_MIN_ABS_OLD_USD) return null;
  const pct = (deltaUsd / denom) * 100;
  return Number.isFinite(pct) ? pct : null;
}

/** Whole-book endpoint %; equivalent to {@link horizonSlicePercentOfTotalStart}(new−old, old). */
export function horizonEndpointPercentChangeUsd(oldUsd: number, newUsd: number): number | null {
  return horizonSlicePercentOfTotalStart(newUsd - oldUsd, oldUsd);
}
