/* eslint-disable */
import {
  addMonthsToYearMonthUtc,
  getCalendarYearMonthNow,
  horizonLabelToYearMonth,
  type HistoricDataAnchor,
} from './historic-time-horizon-anchor.util';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatEnglishShortDateUtc(d: Date): string {
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function formatEnglishShortDateLocal(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Slider handle tooltips. When `anchor` is set, `0` / Today and +/- mo use the latest Historic
 * quarter-end from data; otherwise the device calendar is used.
 */
export function formatTimeHorizonSliderHandleDate(
  horizon: string,
  anchor?: HistoricDataAnchor | null
): string {
  const trimmed = horizon.trim();
  if (trimmed === 'Today' || trimmed === '0') {
    if (anchor?.iso) {
      const d = new Date(anchor.iso);
      if (!Number.isNaN(d.getTime())) return formatEnglishShortDateUtc(d);
    }
    const t = new Date();
    return formatEnglishShortDateLocal(t);
  }
  const ym = horizonLabelToYearMonth(trimmed, anchor?.yearMonth ?? null);
  if (!ym) return horizon;
  const [y, m] = ym.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return horizon;
  const last = new Date(Date.UTC(y, m, 0));
  return formatEnglishShortDateUtc(last);
}
