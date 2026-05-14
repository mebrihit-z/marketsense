import { horizonLabelToYearMonth, type HistoricDataAnchor } from './historic-time-horizon-anchor.util';

/**
 * Converts a year-month string (`yyyy-mm`) to a calendar quarter label (`Qn, yyyy`).
 * @param {string} ym Year and month in `yyyy-mm` format
 * @returns {string} Quarter label, or `ym` unchanged when parsing fails
 */
function yearMonthToQuarterLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return ym;
  const quarter = Math.floor((m - 1) / 3) + 1;
  return `Q${quarter}, ${y}`;
}

/**
 * Slider handle tooltips and chart labels aligned with Time Horizon milestones.
 * When `anchor` is set, `0` / Today and +/- mo use the latest Historic quarter-end month from data;
 * otherwise the device calendar month is used. Display is calendar quarter (`Qn, yyyy`).
 * @param {string} horizon Time horizon label from the slider (trimmed internally)
 * @param {HistoricDataAnchor | null | undefined} anchor Optional historic data anchor for quarter alignment
 * @returns {string} Formatted quarter label, or the original `horizon` when it cannot be mapped
 */
export default function formatTimeHorizonSliderHandleDate(
  horizon: string,
  anchor?: HistoricDataAnchor | null
): string {
  const trimmed = horizon.trim();
  const ym = horizonLabelToYearMonth(trimmed, anchor?.yearMonth ?? null);
  if (!ym) return horizon;
  return yearMonthToQuarterLabel(ym);
}
