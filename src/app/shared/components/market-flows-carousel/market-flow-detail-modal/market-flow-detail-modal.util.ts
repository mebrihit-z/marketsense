/* eslint-disable */
import { type AssetFlowRecord } from '../../../utils/asset-flows-to-sankey.util';
import { parseFlowDisplayValueToBillions } from '../../../utils/flow-currency-format.util';
import {
  addMonthsToYearMonthUtc,
  getCalendarYearMonthNow,
  horizonLabelToYearMonth,
} from '../../../utils/historic-time-horizon-anchor.util';

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
  if (horizon === 'Today' || horizon === '0') return 0;
  const normalized = horizon.trim().toLowerCase();
  let match = normalized.match(/^([+-]?)(\d+)\s*mo$/i);
  if (!match) match = normalized.match(/^([+-]?)(\d+)$/);
  if (!match) return null;
  const isNegative = match[1] === '-';
  const months = parseInt(match[2], 10);
  return isNegative ? -months : months;
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
