/** Unified axis for filters bar / saved views (historical + forecast). */
export const UNIFIED_TIME_HORIZONS: readonly string[] = [
  '-18 mo',
  '-15 mo',
  '-12 mo',
  '-9 mo',
  '-6 mo',
  '-3 mo',
  '0',
  '+3 mo',
  '+6 mo',
  '+9 mo',
  '+12 mo',
  '+15 mo',
  '+18 mo',
];

/**
 * Slider milestones before ±15 mo ticks were added (11 points).
 * Indices-only saved views without {@link SavedView.timeHorizonAxisVersion} remap through this.
 */
export const LEGACY_UNIFIED_TIME_HORIZONS: readonly string[] = [
  '-18 mo',
  '-12 mo',
  '-9 mo',
  '-6 mo',
  '-3 mo',
  'Today',
  '+3 mo',
  '+6 mo',
  '+9 mo',
  '+12 mo',
  '+18 mo',
];

/** Short tick copy when `compactTimeHorizonAxis` is true (narrow viewports). */
export const TIME_HORIZONS_SHORT_LABELS: readonly string[] = [
  '-18',
  '-15',
  '-12',
  '-9',
  '-6',
  '-3',
  '0',
  '+3',
  '+6',
  '+9',
  '+12',
  '+15',
  '+18',
];
