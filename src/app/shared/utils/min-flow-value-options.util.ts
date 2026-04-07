/* eslint-disable */
/** Preset stops for global min/max flow filter (values in billions). Shared by filters bar, Sankey, and Treemap. */
export const MIN_FLOW_VALUE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'All flows' },
  { value: 0.05, label: '≥ $50M' },
  { value: 0.1, label: '≥ $100M' },
  { value: 0.25, label: '≥ $250M' },
  { value: 0.5, label: '≥ $500M' },
  { value: 1, label: '≥ $1B' },
  { value: 5, label: '≥ $5B' },
  { value: 10, label: '≥ $10B' },
  { value: 50, label: '≥ $50B' },
  { value: 100, label: '≥ $100B' },
  { value: 50000, label: '≥ $50,000B' },
  { value: 100000, label: 'Max' },
];

export interface MinFlowRangeSelection {
  startIndex: number;
  endIndex: number;
}

export function createDefaultMinFlowRange(): MinFlowRangeSelection {
  const n = MIN_FLOW_VALUE_OPTIONS.length;
  return { startIndex: 0, endIndex: Math.max(0, n - 1) };
}

export function getMinFlowLowerBound(
  range: MinFlowRangeSelection,
  options: readonly { value: number; label: string }[] = MIN_FLOW_VALUE_OPTIONS
): number {
  return options[range.startIndex]?.value ?? 0;
}

export function getMaxFlowUpperBound(
  range: MinFlowRangeSelection,
  options: readonly { value: number; label: string }[] = MIN_FLOW_VALUE_OPTIONS
): number | null {
  const last = options.length - 1;
  if (last < 0) return null;
  if (range.endIndex >= last) return null;
  return options[range.endIndex]?.value ?? null;
}

/**
 * Lower-handle summary text (matches {@link MinFlowRangeSliderComponent} start label).
 * Strips a leading "≥" from option copy; maps "All flows" to "$0".
 */
export function displayMinFlowStartLabel(rawLabel: string): string {
  const cleaned = (rawLabel ?? '').replace(/^\s*≥\s*/u, '').trim();
  if (cleaned.toLowerCase() === 'all flows') return '$0';
  return cleaned;
}

/**
 * Upper-handle summary: inclusive max in $M / $B, or "Max" when the end handle is at the last stop.
 */
export function displayMinFlowEndLabel(
  options: readonly { value: number; label: string }[],
  endIndex: number
): string {
  if (!options.length) return '';
  const last = options.length - 1;
  if (endIndex >= last) return 'Max';
  const valueBn = options[endIndex]?.value;
  if (valueBn == null || !Number.isFinite(valueBn)) return '';
  if (valueBn <= 0) return 'Max';
  if (valueBn < 1) {
    const m = valueBn * 1000;
    const s = Number.isInteger(m) ? String(m) : m.toFixed(0);
    return `$${s}M`;
  }
  const s = Number.isInteger(valueBn)
    ? valueBn.toLocaleString('en-US')
    : valueBn.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `$${s}B`;
}
