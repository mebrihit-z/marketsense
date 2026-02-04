import { type AssetFlowRecord } from '../../../utils/asset-flows-to-sankey.util';

/**
 * Converts time horizon string to target date in YYYY-MM format.
 * @param {string} horizon - Time horizon string (e.g. "Today", "+3 mo", "-6")
 * @returns {string | null} Date in YYYY-MM format or null
 */
export function convertTimeHorizonToDate(horizon: string): string | null {
  if (/^\d{4}-\d{2}$/.test(horizon.trim())) return horizon.trim();
  const today = new Date();
  const baseYear = today.getFullYear();
  const baseMonth = today.getMonth() + 1;
  if (horizon === 'Today') {
    return `${baseYear}-${String(baseMonth).padStart(2, '0')}`;
  }
  const normalized = horizon.trim().toLowerCase();
  let match = normalized.match(/^([+-]?)(\d+)\s*mo$/i);
  if (!match) match = normalized.match(/^([+-]?)(\d+)$/);
  if (!match) return null;
  const isNegative = match[1] === '-';
  const months = parseInt(match[2], 10);
  const targetDate = new Date(baseYear, baseMonth - 1, 1);
  targetDate.setMonth(targetDate.getMonth() + (isNegative ? -months : months));
  const y = targetDate.getFullYear();
  const m = targetDate.getMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * @param {number} months - Months offset from current month
 * @returns {string} Date in YYYY-MM format
 */
export function getDateFromMonthsOffset(months: number): string {
  const today = new Date();
  const target = new Date(today.getFullYear(), today.getMonth() + months, 1);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * @param {import("../../../utils/asset-flows-to-sankey.util").AssetFlowRecord[]} records - Asset flow records to aggregate
 * @returns {{ dateMap: Map<string, number>; sortedDates: string[] }} Map of date to aggregated value (billions) and sorted date keys
 */
export function aggregateByDate(records: AssetFlowRecord[]): { dateMap: Map<string, number>; sortedDates: string[] } {
  const dateMap = new Map<string, number>();
  records.forEach(record => {
    if (!record.Asset_Flow_Date) return;
    const valueInBillions = record.Asset_Flow_Value / 1000000;
    dateMap.set(record.Asset_Flow_Date, (dateMap.get(record.Asset_Flow_Date) || 0) + valueInBillions);
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
 * @param {string} targetDate - Target date (YYYY-MM)
 * @param {string[]} sortedDates - Sorted date strings
 * @returns {string | null} Closest date or null
 */
export function findClosestDate(targetDate: string, sortedDates: string[]): string | null {
  if (sortedDates.length === 0) return null;
  const target = new Date(targetDate + '-01');
  const initial = { closest: sortedDates[0], minDiff: Math.abs(target.getTime() - new Date(sortedDates[0] + '-01').getTime()) };
  const result = sortedDates.reduce((best, date) => {
    const diff = Math.abs(target.getTime() - new Date(date + '-01').getTime());
    return diff < best.minDiff ? { closest: date, minDiff: diff } : best;
  }, initial);
  return result.closest;
}

/**
 * @param {string} horizon - Time horizon string (e.g. "Today", "+3 mo")
 * @returns {number | null} Months offset from today, or null
 */
export function parseTimeHorizonToMonths(horizon: string): number | null {
  if (horizon === 'Today') return 0;
  const normalized = horizon.trim().toLowerCase();
  let match = normalized.match(/^([+-]?)(\d+)\s*mo$/i);
  if (!match) match = normalized.match(/^([+-]?)(\d+)$/);
  if (!match) return null;
  const isNegative = match[1] === '-';
  const months = parseInt(match[2], 10);
  return isNegative ? -months : months;
}

/**
 * @param {string} valueStr - Value string (e.g. "$124.8B")
 * @returns {number} Parsed absolute numeric value, or 100 if invalid
 */
export function parseValue(valueStr: string): number {
  const num = parseFloat(valueStr.replace(/[$,B]/g, '').trim());
  return Number.isNaN(num) ? 100 : Math.abs(num);
}

/**
 * @param {string} percentageStr - Percentage string (e.g. "+12.3%")
 * @returns {number} Parsed numeric percentage, or 0 if invalid
 */
export function parsePercentage(percentageStr: string): number {
  const num = parseFloat(percentageStr.replace(/[+%]/g, '').trim());
  return Number.isNaN(num) ? 0 : num;
}
