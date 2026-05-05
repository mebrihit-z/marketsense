/* eslint-disable */
import { horizonLabelToYearMonth, type HistoricDataAnchor } from './historic-time-horizon-anchor.util';

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
 */
export function formatTimeHorizonSliderHandleDate(
  horizon: string,
  anchor?: HistoricDataAnchor | null
): string {
  const trimmed = horizon.trim();
  const ym = horizonLabelToYearMonth(trimmed, anchor?.yearMonth ?? null);
  if (!ym) return horizon;
  return yearMonthToQuarterLabel(ym);
}
