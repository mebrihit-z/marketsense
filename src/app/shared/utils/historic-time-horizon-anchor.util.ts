import type { AssetFlowRecord } from './asset-flows-to-sankey.util';

/**
 * Current calendar year and month in local timezone (YYYY-MM).
 * @returns {string} Four-digit year, hyphen, two-digit month.
 */
export function getCalendarYearMonthNow(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Converts a parseable date string to UTC calendar year-month (YYYY-MM).
 * @param {string} iso Parseable date string (e.g. ISO-8601).
 * @returns {string|null} YYYY-MM in UTC, or `null` if parsing fails.
 */
export function isoToYearMonthUtc(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface HistoricDataAnchor {
  /** Latest Historic row's quarter-end `Asset_Flow_Date` (ISO). */
  iso: string;
  /** UTC calendar month of that quarter end (YYYY-MM). */
  yearMonth: string;
}

/**
 * Parses an asset flow date string to UTC epoch milliseconds. Handles ISO-8601 and
 * typical JS-parseable forms; avoids string comparison (e.g. `9/30/2025` sorts after
 * `2025-12-31T...` with {@link String.localeCompare} and would wrongly win).
 * @param {string} value Raw `Asset_Flow_Date` value.
 * @returns {number|null} Milliseconds since Unix epoch, or `null` if invalid.
 */
function parseAssetFlowDateToUtcMs(value: string): number | null {
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/**
 * Latest `asset_flow_date` among rows with `model_type` Historic (case-insensitive), by
 * actual calendar time (not string order).
 * @param {readonly import('./asset-flows-to-sankey.util').AssetFlowRecord[]} records Flow records to scan.
 * @returns {HistoricDataAnchor|null} Anchor ISO and year-month, or `null` if none qualify.
 */
export function computeHistoricDataAnchor(records: readonly AssetFlowRecord[]): HistoricDataAnchor | null {
  const bestMs = records.reduce<number | null>((acc, r) => {
    if ((r.Model_Type ?? '').trim().toLowerCase() !== 'historic') return acc;
    const raw = r.Asset_Flow_Date;
    if (!raw) return acc;
    const ms = parseAssetFlowDateToUtcMs(raw);
    if (ms === null) return acc;
    if (acc === null || ms > acc) return ms;
    return acc;
  }, null);
  if (bestMs === null) return null;
  const canonicalIso = new Date(bestMs).toISOString();
  const ym = isoToYearMonthUtc(canonicalIso);
  if (!ym) return null;
  return { iso: canonicalIso, yearMonth: ym };
}

/**
 * Adds calendar months to a UTC YYYY-MM string.
 * @param {string} ym Source year-month (YYYY-MM).
 * @param {number} deltaMonths Number of months to add (may be negative).
 * @returns {string} Resulting YYYY-MM, or `ym` unchanged when parts are not finite numbers.
 */
export function addMonthsToYearMonthUtc(ym: string, deltaMonths: number): string {
  const [y, m] = ym.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return ym;
  const d = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Maps a slider / filters horizon label to YYYY-MM using the historic anchor as "today"
 * (`0` / Today and +/- N mo). When `anchorYearMonth` is null, uses the calendar current month.
 * @param {string} horizon Slider or filter label (e.g. "Today", "+3 mo", a literal YYYY-MM).
 * @param {string|null|undefined} anchorYearMonth Anchor month (YYYY-MM); when omitted, uses calendar month.
 * @returns {string|null} Resolved YYYY-MM, or `null` when the label is not recognized.
 */
export function horizonLabelToYearMonth(
  horizon: string,
  anchorYearMonth: string | null | undefined
): string | null {
  const trimmed = horizon.trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;
  const baseYm = anchorYearMonth ?? getCalendarYearMonthNow();
  if (trimmed === 'Today' || trimmed === '0') {
    return baseYm;
  }
  const normalized = trimmed.toLowerCase();
  let match = normalized.match(/^([+-]?)(\d+)\s*mo$/i);
  if (!match) match = normalized.match(/^([+-]?)(\d+)$/);
  if (!match) return null;
  const sign = match[1] === '-';
  const n = parseInt(match[2], 10);
  return addMonthsToYearMonthUtc(baseYm, sign ? -n : n);
}
