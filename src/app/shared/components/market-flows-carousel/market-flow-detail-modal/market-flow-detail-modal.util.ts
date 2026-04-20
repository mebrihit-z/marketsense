/* eslint-disable */
import { type AssetFlowRecord } from '../../../utils/asset-flows-to-sankey.util';
import { parseFlowDisplayValueToBillions } from '../../../utils/flow-currency-format.util';
import {
  addMonthsToYearMonthUtc,
  getCalendarYearMonthNow,
  horizonLabelToYearMonth,
} from '../../../utils/historic-time-horizon-anchor.util';
import {
  assetFlowDateToYearMonthUtc,
  parseTimeHorizonLabelToOffsetMonths,
} from '../../../utils/asset-flow-time-window.util';

/**
 * Converts time horizon string to target date in YYYY-MM format.
 * @param anchorYearMonth - Latest Historic quarter month (YYYY-MM); omit for calendar "now".
 */
export function convertTimeHorizonToDate(horizon: string, anchorYearMonth?: string | null): string | null {
  return horizonLabelToYearMonth(horizon, anchorYearMonth ?? null);
}

/**
 * @param months - Months offset from anchor month (or calendar now if anchor omitted)
 * @param anchorYearMonth - Latest Historic quarter month (YYYY-MM)
 */
export function getDateFromMonthsOffset(months: number, anchorYearMonth?: string | null): string {
  const base = anchorYearMonth ?? getCalendarYearMonthNow();
  return addMonthsToYearMonthUtc(base, months);
}

/**
 * @param {import("../../../utils/asset-flows-to-sankey.util").AssetFlowRecord[]} records - Asset flow records to aggregate
 * @returns {{ dateMap: Map<string, number>; sortedDates: string[] }} Map of date to aggregated value (USD) and sorted date keys
 */
export function aggregateByDate(records: AssetFlowRecord[]): { dateMap: Map<string, number>; sortedDates: string[] } {
  const dateMap = new Map<string, number>();
  records.forEach(record => {
    if (!record.Asset_Flow_Date) return;
    dateMap.set(
      record.Asset_Flow_Date,
      (dateMap.get(record.Asset_Flow_Date) || 0) + record.Asset_Flow_Value
    );
  });
  return { dateMap, sortedDates: Array.from(dateMap.keys()).sort() };
}

/**
 * @param {string[]} sortedDates - Sorted date strings
 * @param {Map<string, number>} dateMap - Date to value map
 * @returns {number[]} Cumulative values in date order (running total per date)
 */
export function buildCumulativeRawData(sortedDates: string[], dateMap: Map<string, number>): number[] {
  let cumulative = 0;
  return sortedDates.map(date => {
    cumulative += dateMap.get(date) || 0;
    return cumulative;
  });
}

/**
 * @param {number[]} rawData - Cumulative data points
 * @param {number} targetLength - Desired length
 * @returns {number[]} Array of length targetLength (padded or sampled from rawData)
 */
export function sampleOrPadToLength(rawData: number[], targetLength: number): number[] {
  if (rawData.length === targetLength) return rawData;
  if (rawData.length < targetLength) {
    const last = rawData[rawData.length - 1] ?? 0;
    return [...rawData, ...Array(targetLength - rawData.length).fill(last)];
  }
  const step = (rawData.length - 1) / (targetLength - 1);
  return Array.from({ length: targetLength }, (_, i) => {
    const idx = i === targetLength - 1 ? rawData.length - 1 : Math.min(Math.round(i * step), rawData.length - 1);
    return rawData[idx];
  });
}

/**
 * Sums {@link dateMap} entries whose ISO quarter-end keys map to the same UTC YYYY-MM as {@link targetYm}.
 * {@link sortedDates} must be the same keys as in the map (typically {@link Asset_Flow_Date} ISO strings).
 */
export function sumDateMapValuesForYearMonth(
  targetYm: string,
  sortedDates: string[],
  dateMap: Map<string, number>
): number {
  let sum = 0;
  for (const iso of sortedDates) {
    const qYm = assetFlowDateToYearMonthUtc(iso);
    if (qYm === targetYm) sum += dateMap.get(iso) || 0;
  }
  return sum;
}

/** Inclusive calendar distance in months from `aYm` to `bYm` (both `YYYY-MM`). */
export function monthsBetweenYearMonths(aYm: string, bYm: string): number | null {
  const ma = aYm.trim().match(/^(\d{4})-(\d{2})$/);
  const mb = bYm.trim().match(/^(\d{4})-(\d{2})$/);
  if (!ma || !mb) return null;
  const ay = Number(ma[1]);
  const am = Number(ma[2]);
  const by = Number(mb[1]);
  const bm = Number(mb[2]);
  if (![ay, am, by, bm].every(Number.isFinite)) return null;
  return (by - ay) * 12 + (bm - am);
}

/**
 * Union of slider grid months and actual quarter-end months present in data, restricted to [loYm, hiYm], sorted.
 */
export function mergeYearMonthsInWindow(
  gridYms: string[],
  sortedIsoDates: string[],
  windowLoYm: string,
  windowHiYm: string
): string[] {
  const lo = windowLoYm <= windowHiYm ? windowLoYm : windowHiYm;
  const hi = windowLoYm <= windowHiYm ? windowHiYm : windowLoYm;
  const set = new Set<string>();
  for (const ym of gridYms) {
    if (ym >= lo && ym <= hi) set.add(ym);
  }
  for (const iso of sortedIsoDates) {
    const qYm = assetFlowDateToYearMonthUtc(iso);
    if (qYm && qYm >= lo && qYm <= hi) set.add(qYm);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * @param {string} targetDate - Target calendar month (YYYY-MM), same basis as {@link horizonLabelToYearMonth}
 * @param {string[]} sortedDates - Sorted {@link Asset_Flow_Date} ISO strings
 * @returns {string | null} Closest ISO key by quarter-end calendar time, or null
 * @deprecated Prefer {@link sumDateMapValuesForYearMonth}; kept for any external callers expecting YYYY-MM targets.
 */
export function findClosestDate(targetDate: string, sortedDates: string[]): string | null {
  if (sortedDates.length === 0) return null;
  const ym = targetDate.trim().match(/^(\d{4})-(\d{2})$/);
  if (!ym) return null;
  const y = Number(ym[1]);
  const mo = Number(ym[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return null;
  const targetMs = Date.UTC(y, mo - 1, 15);
  let best: string | null = null;
  let bestDiff = Infinity;
  for (const iso of sortedDates) {
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) continue;
    const diff = Math.abs(t - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = iso;
    }
  }
  return best;
}

/**
 * @param {string} horizon - Time horizon string (e.g. "Today", "+3 mo")
 * @returns {number | null} Months offset from today, or null
 */
export function parseTimeHorizonToMonths(horizon: string): number | null {
  return parseTimeHorizonLabelToOffsetMonths(horizon);
}

/**
 * @param {string} valueStr - Value string (e.g. "$124.8B", "$1.2T")
 * @returns {number} Parsed absolute value in billions, or 100 if invalid
 */
export function parseValue(valueStr: string): number {
  const b = parseFlowDisplayValueToBillions(valueStr);
  if (!Number.isFinite(b)) return 100;
  return Math.abs(b);
}

/**
 * @param {string} percentageStr - Percentage string (e.g. "+12.3%")
 * @returns {number} Parsed numeric percentage, or 0 if invalid
 */
export function parsePercentage(percentageStr: string): number {
  const num = parseFloat(percentageStr.replace(/[+%]/g, '').trim());
  return Number.isNaN(num) ? 0 : num;
}
