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
/**
 * Milestone stops shown on the Value Range rail in the filters bar (compact slider).
 * Labels match design: 0, 100M, 500M, 5B, 50B, Max — positioned at matching option indices.
 */
export function getMinFlowRailLabelStops(
  options: readonly { value: number; label: string }[],
  numSteps: number
): Array<{ index: number; label: string; leftPercent: number }> {
  const last = options.length - 1;
  if (last < 0) return [];

  const milestones: Array<{ value: number; label: string }> = [
    { value: 0, label: '0' },
    { value: 0.1, label: '100M' },
    { value: 0.5, label: '500M' },
    { value: 5, label: '5B' },
    { value: 50, label: '50B' },
  ];

  const out: Array<{ index: number; label: string; leftPercent: number }> = [];
  const seen = new Set<number>();

  for (const m of milestones) {
    const idx = options.findIndex((o) => o.value === m.value);
    if (idx >= 0 && !seen.has(idx)) {
      seen.add(idx);
      out.push({
        index: idx,
        label: m.label,
        leftPercent: numSteps > 0 ? (idx / numSteps) * 100 : 0,
      });
    }
  }

  if (!seen.has(last)) {
    out.push({
      index: last,
      label: 'Max',
      leftPercent: numSteps > 0 ? 100 : 0,
    });
  }

  return out.sort((a, b) => a.index - b.index);
}

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
