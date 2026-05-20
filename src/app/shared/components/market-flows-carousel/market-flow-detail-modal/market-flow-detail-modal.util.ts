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
 * @param {string} horizon - Time horizon label (e.g. "Today", "+3 mo").
 * @param {string | null | undefined} [anchorYearMonth] - Latest Historic quarter month (YYYY-MM); omit for calendar "now".
 * @returns {string | null} Target calendar month (YYYY-MM), or `null` if the label cannot be resolved.
 */
export function convertTimeHorizonToDate(horizon: string, anchorYearMonth?: string | null): string | null {
  return horizonLabelToYearMonth(horizon, anchorYearMonth ?? null);
}

/**
 * Returns a calendar month offset from the anchor (or calendar now).
 * @param {number} months - Months offset from anchor month (or calendar now if anchor omitted).
 * @param {string | null | undefined} [anchorYearMonth] - Latest Historic quarter month (YYYY-MM).
 * @returns {string} Resulting YYYY-MM calendar month.
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
 * Sums `Fcst_Flow_Upper` / `Fcst_Flow_Lower` per {@link AssetFlowRecord#Asset_Flow_Date} (same keys as value aggregation).
 * Rows without both bounds are skipped.
 * @param {import("../../../utils/asset-flows-to-sankey.util").AssetFlowRecord[]} records - Asset flow records with forecast bounds.
 * @returns {{ upperMap: Map<string, number>; lowerMap: Map<string, number> }} Per-date upper and lower bound totals (USD).
 */
export function aggregateFcstBoundsByDate(records: AssetFlowRecord[]): {
  upperMap: Map<string, number>;
  lowerMap: Map<string, number>;
} {
  const upperMap = new Map<string, number>();
  const lowerMap = new Map<string, number>();
  records.forEach(record => {
    if (!record.Asset_Flow_Date) return;
    const u = record.Fcst_Flow_Upper;
    const l = record.Fcst_Flow_Lower;
    if (u === undefined || l === undefined) return;
    if (!Number.isFinite(u) || !Number.isFinite(l)) return;
    const d = record.Asset_Flow_Date;
    upperMap.set(d, (upperMap.get(d) || 0) + u);
    lowerMap.set(d, (lowerMap.get(d) || 0) + l);
  });
  return { upperMap, lowerMap };
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
 * {@link sortedDates} must be the same keys as in the map (typically {@link AssetFlowRecord#Asset_Flow_Date} ISO strings).
 * @param {string} targetYm - Target calendar month (YYYY-MM).
 * @param {string[]} sortedDates - Sorted quarter-end ISO date keys present in the map.
 * @param {Map<string, number>} dateMap - Per-ISO-date aggregated values (USD).
 * @returns {number} Sum of values whose quarter-end month equals `targetYm`.
 */
export function sumDateMapValuesForYearMonth(
  targetYm: string,
  sortedDates: string[],
  dateMap: Map<string, number>
): number {
  return sortedDates.reduce((sum, iso) => {
    const qYm = assetFlowDateToYearMonthUtc(iso);
    return qYm === targetYm ? sum + (dateMap.get(iso) || 0) : sum;
  }, 0);
}

/**
 * Inclusive calendar distance in months from `aYm` to `bYm` (both `YYYY-MM`).
 * @param {string} aYm - Start calendar month (YYYY-MM).
 * @param {string} bYm - End calendar month (YYYY-MM).
 * @returns {number | null} Month count from `aYm` to `bYm`, or `null` if either value is invalid.
 */
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
 * Quarter-end calendar date for tooltips (e.g. {@code "2016-06"} → "June 30, 2016"), UTC.
 * @param {string} ym - Calendar month (YYYY-MM).
 * @returns {string} Long US locale date for that month's last day (UTC), or trimmed input if invalid.
 */
export function formatYearMonthAsQuarterEndLongDate(ym: string): string {
  const m = ym.trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return ym.trim();
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (![y, mo].every(Number.isFinite) || mo < 1 || mo > 12) return ym.trim();
  const endUtc = new Date(Date.UTC(y, mo, 0));
  if (Number.isNaN(endUtc.getTime())) return ym.trim();
  return endUtc.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Calendar quarter label aligned with the Time Horizon slider (e.g. {@code "2025-06"} → "Q2, 2025").
 * @param {string} ym - Calendar month (YYYY-MM).
 * @returns {string} Quarter label (e.g. "Q2, 2025"), or trimmed input if invalid.
 */
export function formatYearMonthAsQuarterLabel(ym: string): string {
  const m = ym.trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return ym.trim();
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (![y, mo].every(Number.isFinite) || mo < 1 || mo > 12) return ym.trim();
  const quarter = Math.floor((mo - 1) / 3) + 1;
  return `Q${quarter}, ${y}`;
}

const QUARTER_END_MONTH = new Set([3, 6, 9, 12]);

/**
 * Parses a YYYY-MM string into numeric year and month parts.
 * @param {string} ym - Calendar month (YYYY-MM).
 * @returns {{ y: number; m: number } | null} Parsed parts, or `null` if invalid.
 */
function parseYearMonthParts(ym: string): { y: number; m: number } | null {
  const t = ym.trim();
  const ma = t.match(/^(\d{4})-(\d{2})$/);
  if (!ma) return null;
  const y = Number(ma[1]);
  const mo = Number(ma[2]);
  if (![y, mo].every(Number.isFinite) || mo < 1 || mo > 12) return null;
  return { y, m: mo };
}

/**
 * Formats numeric year and month as YYYY-MM.
 * @param {number} y - Four-digit calendar year.
 * @param {number} m - Calendar month (1–12).
 * @returns {string} Zero-padded YYYY-MM string.
 */
function formatYearMonthParts(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Smallest Mar/Jun/Sep/Dec YYYY-MM that is still ≥ `loYm` (padded lexicographic order).
 * @param {string} loYm - Lower bound calendar month (YYYY-MM).
 * @returns {string | null} First quarter-end month on or after `loYm`, or `null` if invalid.
 */
function firstQuarterEndOnOrAfter(loYm: string): string | null {
  const p = parseYearMonthParts(loYm);
  if (!p) return null;
  let { y, m } = p;
  for (let i = 0; i < 24 && !QUARTER_END_MONTH.has(m); i += 1) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return QUARTER_END_MONTH.has(m) ? formatYearMonthParts(y, m) : null;
}

/**
 * Largest Mar/Jun/Sep/Dec YYYY-MM that is still ≤ `hiYm`.
 * @param {string} hiYm - Upper bound calendar month (YYYY-MM).
 * @returns {string | null} Last quarter-end month on or before `hiYm`, or `null` if invalid.
 */
function lastQuarterEndOnOrBefore(hiYm: string): string | null {
  const p = parseYearMonthParts(hiYm);
  if (!p) return null;
  let { y, m } = p;
  for (let i = 0; i < 24 && !QUARTER_END_MONTH.has(m); i += 1) {
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return QUARTER_END_MONTH.has(m) ? formatYearMonthParts(y, m) : null;
}

/**
 * Every flow quarter-end calendar month (Mar/Jun/Sep/Dec) whose YYYY-MM lies in the closed window
 * {@code [loYm, hiYm]}, in chronological order. Quarters with no rows sum to 0 for that point.
 * Aligns with {@link import("../../../utils/asset-flow-time-window.util").assetFlowQuarterInTimeWindow} for multi-month YYYY-MM ranges.
 * @param {string} loYm - Window start calendar month (YYYY-MM).
 * @param {string} hiYm - Window end calendar month (YYYY-MM).
 * @returns {string[]} Quarter-end months in [loYm, hiYm], sorted chronologically.
 */
export function everyQuarterEndYearMonthBetweenInclusive(loYm: string, hiYm: string): string[] {
  const lo = loYm <= hiYm ? loYm.trim() : hiYm.trim();
  const hi = loYm <= hiYm ? hiYm.trim() : loYm.trim();
  const first = firstQuarterEndOnOrAfter(lo);
  const last = lastQuarterEndOnOrBefore(hi);
  if (!first || !last || first > last) return [];
  const out: string[] = [];
  let cur = first;
  for (let guard = 0; guard < 500 && cur <= last; guard += 1) {
    out.push(cur);
    cur = addMonthsToYearMonthUtc(cur, 3);
  }
  return out;
}

/**
 * Union of slider grid months and actual quarter-end months present in data, restricted to [loYm, hiYm], sorted.
 * @param {string[]} gridYms - Slider grid calendar months (YYYY-MM).
 * @param {string[]} sortedIsoDates - Sorted {@link AssetFlowRecord#Asset_Flow_Date} ISO strings from data.
 * @param {string} windowLoYm - Window start calendar month (YYYY-MM).
 * @param {string} windowHiYm - Window end calendar month (YYYY-MM).
 * @returns {string[]} Merged, sorted YYYY-MM months within the window.
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
  gridYms.forEach(ym => {
    if (ym >= lo && ym <= hi) set.add(ym);
  });
  sortedIsoDates.forEach(iso => {
    const qYm = assetFlowDateToYearMonthUtc(iso);
    if (qYm && qYm >= lo && qYm <= hi) set.add(qYm);
  });
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * @param {string} targetDate - Target calendar month (YYYY-MM), same basis as {@link import("../../../utils/historic-time-horizon-anchor.util").horizonLabelToYearMonth}
 * @param {string[]} sortedDates - Sorted {@link AssetFlowRecord#Asset_Flow_Date} ISO strings
 * @returns {string | null} Closest ISO key by quarter-end calendar time, or null
 * @deprecated Prefer sumDateMapValuesForYearMonth; kept for any external callers expecting YYYY-MM targets.
 */
export function findClosestDate(targetDate: string, sortedDates: string[]): string | null {
  if (sortedDates.length === 0) return null;
  const ym = targetDate.trim().match(/^(\d{4})-(\d{2})$/);
  if (!ym) return null;
  const y = Number(ym[1]);
  const mo = Number(ym[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return null;
  const targetMs = Date.UTC(y, mo - 1, 15);
  return sortedDates.reduce<{ best: string | null; bestDiff: number }>(
    (acc, iso) => {
      const t = new Date(iso).getTime();
      if (Number.isNaN(t)) return acc;
      const diff = Math.abs(t - targetMs);
      if (diff < acc.bestDiff) {
        return { best: iso, bestDiff: diff };
      }
      return acc;
    },
    { best: null, bestDiff: Infinity }
  ).best;
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
