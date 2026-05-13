/** Preset stops for global min/max flow filter (values in billions). Shared by filters bar, Sankey, and Treemap. */
export const MIN_FLOW_VALUE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'All flows' },
  { value: 0.01, label: '≥ $10M' },
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

/**
 * Default range covering every min-flow option (full slider span).
 * @returns {{ startIndex: number, endIndex: number }} Full-span selection from the first through last option index.
 */
export function createDefaultMinFlowRange(): MinFlowRangeSelection {
  const n = MIN_FLOW_VALUE_OPTIONS.length;
  return { startIndex: 0, endIndex: Math.max(0, n - 1) };
}

/** Bump when `MIN_FLOW_VALUE_OPTIONS` indices change for persisted `MinFlowRangeSelection`. */
export const MIN_FLOW_VALUE_OPTIONS_VERSION = 2;

/**
 * Legacy saved views used indices into the list before the ≥ $10M stop was inserted at index 1.
 * Indices ≥ 1 referred to dollar thresholds and must shift by +1.
 * @param {{ startIndex: number, endIndex: number }} range Persisted selection using v1 indexing.
 * @returns {{ startIndex: number, endIndex: number }} Range with indices aligned to the current option list.
 */
export function migrateMinFlowRangeIndicesV1ToV2(range: MinFlowRangeSelection): MinFlowRangeSelection {
  const bump = (i: number) => (i >= 1 ? i + 1 : i);
  return {
    startIndex: bump(range.startIndex),
    endIndex: bump(range.endIndex),
  };
}

/**
 * Lower bound (billions) at the range start index.
 * @param {{ startIndex: number, endIndex: number }} range Selected slider span.
 * @param {ReadonlyArray<{ value: number, label: string }>} [options] Threshold stops; defaults to `MIN_FLOW_VALUE_OPTIONS`.
 * @returns {number} Lower bound in billions at `range.startIndex`, or 0 if missing.
 */
export function getMinFlowLowerBound(
  range: MinFlowRangeSelection,
  options: readonly { value: number; label: string }[] = MIN_FLOW_VALUE_OPTIONS
): number {
  return options[range.startIndex]?.value ?? 0;
}

/**
 * Exclusive upper cap in billions, or null when the end handle is at the last option (unbounded / Max).
 * @param {{ startIndex: number, endIndex: number }} range Selected slider span.
 * @param {ReadonlyArray<{ value: number, label: string }>} [options] Threshold stops; defaults to `MIN_FLOW_VALUE_OPTIONS`.
 * @returns {number|null} Exclusive upper cap in billions, or null when the end handle is at the last stop.
 */
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
 * Lower-handle summary text (matches `MinFlowRangeSliderComponent` start label).
 * Strips a leading "≥" from option copy; maps "All flows" to "$0".
 * @param {string} rawLabel Option label from the min-flow options list.
 * @returns {string} Display string for the lower handle (e.g. "$0" for All flows).
 */
export function displayMinFlowStartLabel(rawLabel: string): string {
  const cleaned = (rawLabel ?? '').replace(/^\s*≥\s*/u, '').trim();
  if (cleaned.toLowerCase() === 'all flows') return '$0';
  return cleaned;
}

/**
 * Milestone stops shown on the Value Range rail in the filters bar (compact slider).
 * Labels match design: 0, 10M, 100M, 500M, 5B, 50B, Max — positioned at matching option indices.
 * @param {ReadonlyArray<{ value: number, label: string }>} options Flow threshold stops.
 * @param {number} numSteps Number of slider steps (for percent positions along the rail).
 * @returns {Array<{ index: number, label: string, leftPercent: number }>} Milestone markers sorted by option index.
 */
export function getMinFlowRailLabelStops(
  options: readonly { value: number; label: string }[],
  numSteps: number
): Array<{ index: number; label: string; leftPercent: number }> {
  const last = options.length - 1;
  if (last < 0) return [];

  const milestones: Array<{ value: number; label: string }> = [
    { value: 0, label: '0' },
    { value: 0.01, label: '10M' },
    { value: 0.1, label: '100M' },
    { value: 0.5, label: '500M' },
    { value: 5, label: '5B' },
    { value: 50, label: '50B' },
  ];

  const out: Array<{ index: number; label: string; leftPercent: number }> = [];
  const seen = new Set<number>();

  milestones.forEach((m) => {
    const idx = options.findIndex((o) => o.value === m.value);
    if (idx >= 0 && !seen.has(idx)) {
      seen.add(idx);
      out.push({
        index: idx,
        label: m.label,
        leftPercent: numSteps > 0 ? (idx / numSteps) * 100 : 0,
      });
    }
  });

  if (!seen.has(last)) {
    out.push({
      index: last,
      label: 'Max',
      leftPercent: numSteps > 0 ? 100 : 0,
    });
  }

  return out.sort((a, b) => a.index - b.index);
}

/**
 * Upper-handle summary: inclusive max in $M / $B, or "Max" when the end handle is at the last stop.
 * @param {ReadonlyArray<{ value: number, label: string }>} options Flow threshold stops.
 * @param {number} endIndex Selected end stop index.
 * @returns {string} Display string for the upper handle ("Max", $M, or $B).
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
