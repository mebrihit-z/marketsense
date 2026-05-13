/**
 * Net flow at horizon start vs end: ((New − Old) / Old) × 100.
 * When the start baseline is exactly 0 and the delta is non-zero, returns ±Infinity (no finite ratio).
 * Returns null only when inputs are non-finite or the ratio is NaN.
 */
export function horizonSlicePercentOfTotalStart(deltaUsd: number, totalOldUsd: number): number | null {
  if (!Number.isFinite(deltaUsd) || !Number.isFinite(totalOldUsd)) return null;
  if (totalOldUsd === 0) {
    if (deltaUsd === 0) return 0;
    return deltaUsd > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  }
  const pct = (deltaUsd / totalOldUsd) * 100;
  return Number.isNaN(pct) ? null : pct;
}

/** Whole-book endpoint %; equivalent to {@link horizonSlicePercentOfTotalStart}(new−old, old). */
export function horizonEndpointPercentChangeUsd(oldUsd: number, newUsd: number): number | null {
  return horizonSlicePercentOfTotalStart(newUsd - oldUsd, oldUsd);
}
