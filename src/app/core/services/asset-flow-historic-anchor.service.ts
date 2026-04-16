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
export class AssetFlowHistoricAnchorService {
  private anchor: HistoricDataAnchor | null = null;

  rebuild(records: readonly AssetFlowRecord[]): void {
    this.anchor = computeHistoricDataAnchor(records);
  }

  getAnchor(): HistoricDataAnchor | null {
    return this.anchor;
  }

  getAnchorYearMonth(): string | null {
    return this.anchor?.yearMonth ?? null;
  }

  horizonToYearMonth(horizon: string): string | null {
    return horizonLabelToYearMonth(horizon, this.anchor?.yearMonth);
  }

  /** Calendar month offset (UTC) from the anchor quarter-end month. */
  monthsOffsetFromAnchor(months: number): string {
    const base = this.anchor?.yearMonth ?? getCalendarYearMonthNow();
    return addMonthsToYearMonthUtc(base, months);
  }
}
