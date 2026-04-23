/* eslint-disable */
import type { AssetFlowRecord } from './asset-flows-to-sankey.util';

export function getCalendarYearMonthNow(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
}

export function isoToYearMonthUtc(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface HistoricDataAnchor {
  /** Latest Historic row's quarter-end {@link AssetFlowRecord.Asset_Flow_Date} (ISO). */
  iso: string;
  /** UTC calendar month of that quarter end (YYYY-MM). */
  yearMonth: string;
}

/**
 * Parse {@link AssetFlowRecord.Asset_Flow_Date} to UTC milliseconds. Handles ISO-8601 and
 * typical JS-parseable forms; avoids string comparison (e.g. `9/30/2025` sorts after
 * `2025-12-31T...` with {@link String.localeCompare} and would wrongly win).
 */
function parseAssetFlowDateToUtcMs(value: string): number | null {
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/**
 * Latest `asset_flow_date` among rows with `model_type` Historic (case-insensitive), by
 * actual calendar time (not string order).
 */
export function computeHistoricDataAnchor(records: readonly AssetFlowRecord[]): HistoricDataAnchor | null {
  let bestMs: number | null = null;
  for (const r of records) {
    if ((r.Model_Type ?? '').trim().toLowerCase() !== 'historic') continue;
    const raw = r.Asset_Flow_Date;
    if (!raw) continue;
    const ms = parseAssetFlowDateToUtcMs(raw);
    if (ms === null) continue;
    if (bestMs === null || ms > bestMs) bestMs = ms;
  }
  if (bestMs === null) return null;
  const canonicalIso = new Date(bestMs).toISOString();
  const ym = isoToYearMonthUtc(canonicalIso);
  if (!ym) return null;
  return { iso: canonicalIso, yearMonth: ym };
}

export function addMonthsToYearMonthUtc(ym: string, deltaMonths: number): string {
  const [y, m] = ym.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return ym;
  const d = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Maps a slider / filters horizon label to YYYY-MM using the historic anchor as "today"
 * (`0` / Today and +/- N mo). When `anchorYearMonth` is null, uses the calendar current month.
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
