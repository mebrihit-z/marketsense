import { Injectable } from '@angular/core';
import type { AssetFlowRecord } from '../../shared/utils/asset-flows-to-sankey.util';
import {
  addMonthsToYearMonthUtc,
  computeHistoricDataAnchor,
  getCalendarYearMonthNow,
  horizonLabelToYearMonth,
  type HistoricDataAnchor,
} from '../../shared/utils/historic-time-horizon-anchor.util';

/**
 * "As of" time for the UI: latest quarter-end among Historic model rows, not the device clock.
 * Rebuilt whenever normalized asset flows are loaded (dashboard).
 */
@Injectable({ providedIn: 'root' })
// eslint-disable-next-line import/prefer-default-export -- Angular DI expects a named Injectable class export.
export class AssetFlowHistoricAnchorService {
  private anchor: HistoricDataAnchor | null = null;

  /**
   * Recomputes the historic anchor from the latest Historic `Asset_Flow_Date` in `records`.
   * @param {readonly import('../../shared/utils/asset-flows-to-sankey.util').AssetFlowRecord[]} records Normalized asset flow rows.
   * @returns {void}
   */
  rebuild(records: readonly AssetFlowRecord[]): void {
    this.anchor = computeHistoricDataAnchor(records);
  }

  /**
   * @returns {import('../../shared/utils/historic-time-horizon-anchor.util').HistoricDataAnchor|null} Cached anchor, or `null` before the first `rebuild`.
   */
  getAnchor(): HistoricDataAnchor | null {
    return this.anchor;
  }

  /**
   * @returns {string|null} Anchor quarter-end as YYYY-MM (UTC), or `null` when no anchor is set.
   */
  getAnchorYearMonth(): string | null {
    return this.anchor?.yearMonth ?? null;
  }

  /**
   * Maps a slider / filter horizon label to YYYY-MM relative to the cached anchor.
   * @param {string} horizon Slider or filter label (e.g. "Today", "+3 mo", a literal YYYY-MM).
   * @returns {string|null} Resolved YYYY-MM, or `null` when the label is not recognized.
   */
  horizonToYearMonth(horizon: string): string | null {
    return horizonLabelToYearMonth(horizon, this.anchor?.yearMonth);
  }

  /**
   * Calendar month offset (UTC) from the anchor quarter-end month.
   * @param {number} months Number of months to add (may be negative).
   * @returns {string} Resulting YYYY-MM; uses the calendar month when no anchor is set.
   */
  monthsOffsetFromAnchor(months: number): string {
    const base = this.anchor?.yearMonth ?? getCalendarYearMonthNow();
    return addMonthsToYearMonthUtc(base, months);
  }
}
