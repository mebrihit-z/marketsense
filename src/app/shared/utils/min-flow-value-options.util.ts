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
