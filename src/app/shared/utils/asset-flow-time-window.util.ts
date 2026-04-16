/**
 * Asset flow rows are quarterly; {@link AssetFlowRecord.Asset_Flow_Date} is the quarter end (ISO).
 * Filter UI uses YYYY-MM ranges. String comparison between ISO and YYYY-MM is wrong; use calendar
 * overlap between the flow quarter and the selected month window.
 */

const YM_RE = /^(\d{4})-(\d{2})$/;

function utcQuarterInclusiveBounds(flowDateIso: string): { start: number; end: number } | null {
  const d = new Date(flowDateIso);
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  const y = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const q = Math.floor((month - 1) / 3);
  const startMonth = q * 3 + 1;
  const endMonth = q * 3 + 3;
  const start = Date.UTC(y, startMonth - 1, 1);
  const end = Date.UTC(y, endMonth, 0, 23, 59, 59, 999);
  return { start, end };
}

function ymRangeInclusive(ymStart: string, ymEnd: string): { start: number; end: number } | null {
  const a = ymStart.trim().match(YM_RE);
  const b = ymEnd.trim().match(YM_RE);
  if (!a || !b) return null;
  const y1 = Number(a[1]);
  const m1 = Number(a[2]);
  const y2 = Number(b[1]);
  const m2 = Number(b[2]);
  const start = Date.UTC(y1, m1 - 1, 1);
  const end = Date.UTC(y2, m2, 0, 23, 59, 59, 999);
  return { start, end };
}

function isoDateRangeInclusive(isoStart: string, isoEnd: string): { start: number; end: number } | null {
  const ds = new Date(isoStart);
  const de = new Date(isoEnd);
  if (Number.isNaN(ds.getTime()) || Number.isNaN(de.getTime())) return null;
  const start = Date.UTC(ds.getUTCFullYear(), ds.getUTCMonth(), ds.getUTCDate());
  const end = Date.UTC(de.getUTCFullYear(), de.getUTCMonth(), de.getUTCDate(), 23, 59, 59, 999);
  return { start, end };
}

function inclusiveEndFromIso(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999);
}

function rangesOverlap(
  q: { start: number; end: number },
  w: { start: number; end: number }
): boolean {
  return q.start <= w.end && q.end >= w.start;
}

/** UTC calendar month of `Asset_Flow_Date` (quarter-end rows → Mar/Jun/Sep/Dec). */
export function assetFlowDateToYearMonthUtc(flowDateIso: string): string | null {
  const d = new Date(flowDateIso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * @param flowDateIso - Record's Asset_Flow_Date (quarter end, ISO)
 * @param windowStart - YYYY-MM or ISO; omit for cumulative-through-end behavior
 * @param windowEnd - YYYY-MM or ISO end of window
 */
export function assetFlowQuarterInTimeWindow(
  flowDateIso: string | undefined,
  windowStart: string | null | undefined,
  windowEnd: string | null | undefined
): boolean {
  if (!flowDateIso || !windowEnd) return false;
  const q = utcQuarterInclusiveBounds(flowDateIso);
  if (!q) return false;

  const s = windowStart?.trim();
  const e = windowEnd.trim();
  const sYm = Boolean(s && YM_RE.test(s));
  const eYm = YM_RE.test(e);

  if (s) {
    if (sYm && eYm) {
      let lo = s;
      let hi = e;
      if (lo > hi) {
        [lo, hi] = [hi, lo];
      }
      // One calendar month: overlap so a mid-quarter month still picks up that quarter.
      if (lo === hi) {
        const w = ymRangeInclusive(lo, hi);
        return w !== null && rangesOverlap(q, w);
      }
      // Multi-month YYYY-MM window: count each quarter at most once — include only if the
      // quarter-end month (YYYY-MM) falls in [lo, hi]. Pure overlap would double-count
      // quarters (e.g. Apr–Jul touching both Q2 end and Q3 start).
      const qYm = assetFlowDateToYearMonthUtc(flowDateIso);
      return qYm !== null && qYm >= lo && qYm <= hi;
    }
    const w = isoDateRangeInclusive(s, e);
    return w !== null && rangesOverlap(q, w);
  }

  if (eYm) {
    const qYm = assetFlowDateToYearMonthUtc(flowDateIso);
    return qYm !== null && qYm <= e.trim();
  }
  const endMs = inclusiveEndFromIso(e);
  if (endMs === null) return false;
  return q.end <= endMs;
}
