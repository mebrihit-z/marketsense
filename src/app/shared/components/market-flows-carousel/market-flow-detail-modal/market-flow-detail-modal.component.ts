/* eslint-disable */
import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { MarketFlowCard } from '../market-flow-card/market-flow-card.component';
import { LineChartComponent } from '../../charts/line-chart/line-chart.component';
import ExportModalComponent from '../export-modal/export-modal.component';
import {
  type AssetFlowRecord,
  filterAssetFlowsByDataTypeResolvingSpan,
} from '../../../utils/asset-flows-to-sankey.util';
import * as detailModalUtil from './market-flow-detail-modal.util';
import {
  formatFlowCurrencyUsd,
  formatFlowCurrencyUsdFull,
  parseFlowDisplayValueToDollars,
} from '../../../utils/flow-currency-format.util';
import { assetFlowQuarterInTimeWindow } from '../../../utils/asset-flow-time-window.util';
import {
  horizonEndpointPercentChangeUsd,
  horizonSlicePercentOfTotalStart,
} from '../../../utils/horizon-endpoint-percent-change.util';
import { AssetFlowHistoricAnchorService } from '../../../../core/services/asset-flow-historic-anchor.service';
import { formatTimeHorizonSliderHandleDate } from '../../../utils/time-horizon-slider-tooltip-date.util';

/** One row in the investor-type / product-region breakdown table. */
export interface FlowBreakdownRow {
  label: string;
  valueUsd: number;
  /** `null` when start-point net is below noise floor or horizon window is missing. */
  pctChange: number | null;
}

export type FlowBreakdownTab = 'investor' | 'product';

@Component({
  selector: 'app-market-flow-detail-modal',
  standalone: true,
  imports: [CommonModule, LineChartComponent, ExportModalComponent],
  templateUrl: './market-flow-detail-modal.component.html',
  styleUrl: './market-flow-detail-modal.component.scss'
})
export default class MarketFlowDetailModalComponent implements OnChanges {
  constructor(private readonly historicAnchor: AssetFlowHistoricAnchorService) {}

  @Input() isVisible: boolean = false;
  /** When true, render only the content (no overlay) for inline use in carousel. */
  @Input() inline: boolean = false;
  @Input() card: MarketFlowCard | null = null;
  @Input() rawAssetFlowsData: AssetFlowRecord[] = [];
  @Input() timeHorizonRange: { start: string; end: string } | null = null;
  @Input() selectedInvestorRegions: string[] = [];
  @Input() selectedInvestorTypes: string[] = [];
  @Input() selectedProductRegions: string[] = [];
  @Input() selectedProductTypes: string[] = [];
  @Output() close = new EventEmitter<void>();
  /** Inline layout: parent should open a root-level export dialog (correct z-index vs sticky filters). */
  @Output() openExport = new EventEmitter<void>();
  /** Emits the current card id for Ask MarketSense (same contract as flow cards). */
  @Output() askMarketSense = new EventEmitter<string>();

  showExportModal: boolean = false;
  xAxisLabelText: string = 'Time Horizon (Month)';

  /** Y-axis title: quarterly net per point when a range is set, else running cumulative without a range. */
  get chartYAxisLabel(): string {
    if (this.timeHorizonRange?.start && this.timeHorizonRange?.end) {
      return 'Quarterly Net Flow (USD)';
    }
    return 'Cumulative Net Flow (USD)';
  }

  /** Active tab for investor types vs product regions breakdown. */
  detailBreakdownTab: FlowBreakdownTab = 'investor';

  private breakdownFingerprint = '';
  private cachedInvestorBreakdown: FlowBreakdownRow[] = [];
  private cachedProductBreakdown: FlowBreakdownRow[] = [];

  private lineChartMemoFp = '';
  private lineChartMemo: {
    data: number[];
    labels: string[];
    pointTooltipDateLabels?: string[];
    forecastStartIndex?: number;
    predictionIntervalUpper?: (number | null)[];
    predictionIntervalLower?: (number | null)[];
  } = {
    data: [],
    labels: [],
  };

  /** Forecast segment stroke in the trajectory chart (historic uses {@link getChartColor}). */
  readonly forecastLineColor = '#0C42FE';

  private headlineHorizonPctFp = '';
  private headlineHorizonPctMemo: number | null = null;

  /** Exposed for template (static methods). */
  readonly getConfidenceColor = MarketFlowDetailModalComponent.getConfidenceColor;
  readonly getConfidenceLabel = MarketFlowDetailModalComponent.getConfidenceLabel;

  /**
   * @param {import("@angular/core").SimpleChanges} changes - Current and previous property values
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && !this.inline) {
      if (this.isVisible) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    }
    if (
      changes['card'] ||
      changes['rawAssetFlowsData'] ||
      changes['timeHorizonRange'] ||
      changes['selectedInvestorRegions'] ||
      changes['selectedInvestorTypes'] ||
      changes['selectedProductRegions'] ||
      changes['selectedProductTypes']
    ) {
      this.breakdownFingerprint = '';
      this.lineChartMemoFp = '';
      this.headlineHorizonPctFp = '';
    }
  }

  onClose(): void {
    document.body.style.overflow = '';
    this.close.emit();
  }

  /** Sentiment label for the header (matches flow card logic). */
  getCardSentimentLabel(): string {
    if (!this.card) return '';
    if (this.card.sentiment && !this.headlineHorizonPctActive()) return this.card.sentiment;
    const c = this.getHeadlinePercentageColor();
    if (c === 'red') return 'Bearish';
    if (c === 'green') return 'Bullish';
    return this.card.valueColor === 'red' ? 'Bearish' : 'Bullish';
  }

  /**
   * When a slider window is set and raw rows exist, headline % follows the horizon (same formula as
   * dashboard cards); otherwise the static {@link MarketFlowCard} fields.
   */
  getHeadlinePercentageChange(): string {
    if (!this.card) return '';
    if (this.headlineHorizonPctActive()) {
      const pct = this.getHeadlineHorizonEndpointPct();
      if (pct == null) return '—';
      const formatted = MarketFlowDetailModalComponent.formatHeadlinePctAbs(Math.abs(pct));
      return pct >= 0 ? `+${formatted}%` : `-${formatted}%`;
    }
    return this.card.percentageChange;
  }

  getHeadlinePercentageColor(): 'red' | 'green' | 'neutral' {
    if (!this.card) return 'neutral';
    if (this.headlineHorizonPctActive()) {
      const pct = this.getHeadlineHorizonEndpointPct();
      if (pct == null) return 'neutral';
      return pct >= 0 ? 'green' : 'red';
    }
    return this.card.percentageColor;
  }

  private headlineHorizonPctActive(): boolean {
    return (
      this.getDetailHorizonYearMonthWindow() != null &&
      !!this.card?.productSubType &&
      (this.rawAssetFlowsData?.length ?? 0) > 0
    );
  }

  private getHeadlineHorizonPctFingerprint(): string {
    return JSON.stringify({
      id: this.card?.id,
      productSubType: this.card?.productSubType,
      dataType: this.card?.dataType,
      timeHorizonRange: this.timeHorizonRange,
      rawLen: this.rawAssetFlowsData?.length ?? 0,
      anchor: this.historicAnchor.getAnchorYearMonth(),
      selectedInvestorRegions: this.selectedInvestorRegions,
      selectedInvestorTypes: this.selectedInvestorTypes,
      selectedProductRegions: this.selectedProductRegions,
      selectedProductTypes: this.selectedProductTypes,
    });
  }

  private getHeadlineHorizonEndpointPct(): number | null {
    const fp = this.getHeadlineHorizonPctFingerprint();
    if (fp !== this.headlineHorizonPctFp) {
      this.headlineHorizonPctFp = fp;
      this.headlineHorizonPctMemo = this.computeHeadlineHorizonEndpointPct();
    }
    return this.headlineHorizonPctMemo;
  }

  /**
   * Per-sub-type net at horizon start vs end on {@link applyChartDataFilters} rows — aligns with
   * {@link horizonEndpointPercentChangeUsd} on dashboard market-flow cards.
   */
  private computeHeadlineHorizonEndpointPct(): number | null {
    const win = this.getDetailHorizonYearMonthWindow();
    const sub = this.card?.productSubType;
    if (!win || !sub) return null;
    const filtered = this.applyChartDataFilters(sub);
    if (!filtered.length) return null;
    const oldUsd = filtered
      .filter(r => assetFlowQuarterInTimeWindow(r.Asset_Flow_Date, win.start, win.start))
      .reduce((s, x) => s + x.Asset_Flow_Value, 0);
    const newUsd = filtered
      .filter(r => assetFlowQuarterInTimeWindow(r.Asset_Flow_Date, win.end, win.end))
      .reduce((s, x) => s + x.Asset_Flow_Value, 0);
    return horizonEndpointPercentChangeUsd(oldUsd, newUsd);
  }

  /** Same rounding as dashboard `formatPercentage` for carousel pills. */
  private static formatHeadlinePctAbs(value: number): string {
    if (value === 0) return '0.0';
    if (value < 0.1) return value.toFixed(2);
    return value.toFixed(1);
  }

  /**
   * @param {'high' | 'medium' | 'low'} confidence - Confidence level (reserved for future color mapping)
   * @returns {string} Hex color for the confidence indicator
   */
  static getConfidenceColor(confidence: 'high' | 'medium' | 'low'): string {
    // All scores are green for now; use confidence when implementing color mapping
    return confidence ? '#00bc7d' : '#00bc7d';
  }

  /**
   * @param {'high' | 'medium' | 'low'} confidence - Confidence level
   * @returns {string} Human-readable label for the confidence level
   */
  static getConfidenceLabel(confidence: 'high' | 'medium' | 'low'): string {
    switch (confidence) {
      case 'high': return 'High';
      case 'medium': return 'Medium';
      case 'low': return 'High ';
      default: return 'High';
    }
  }

  /**
   * @returns {string} Hex color for the chart line
   */
  getChartColor(): string {
    if (!this.card) return '#00113F'; // $primary-colors-midnight-blue
    return '#00113F';
  }

  /** Template for fallback mock data; length is adjusted to match x-axis labels. */
  private static readonly FALLBACK_CHART_DATA_TEMPLATE = [10, 12, 18, 25, 35];

  /**
   * Returns fallback chart data with length equal to {@link labelCount} so x-axis never shows raw indices (e.g. "4").
   */
  private getFallbackChartDataForLength(labelCount: number): number[] {
    const template = MarketFlowDetailModalComponent.FALLBACK_CHART_DATA_TEMPLATE;
    if (labelCount <= template.length) {
      return template.slice(0, labelCount);
    }
    const last = template[template.length - 1] ?? 35;
    return [...template, ...Array(labelCount - template.length).fill(last)];
  }

  private getLineChartFingerprint(): string {
    return JSON.stringify({
      id: this.card?.id,
      productSubType: this.card?.productSubType,
      dataType: this.card?.dataType,
      timeHorizonRange: this.timeHorizonRange,
      rawLen: this.rawAssetFlowsData?.length ?? 0,
      selectedInvestorRegions: this.selectedInvestorRegions,
      selectedInvestorTypes: this.selectedInvestorTypes,
      selectedProductRegions: this.selectedProductRegions,
      selectedProductTypes: this.selectedProductTypes,
      anchorYm: this.historicAnchor.getAnchorYearMonth(),
    });
  }

  /**
   * Memoized chart series + x-axis labels aligned with each chart point (single change-detection pass).
   */
  getLineChartBundle(): {
    data: number[];
    labels: string[];
    pointTooltipDateLabels?: string[];
    forecastStartIndex?: number;
    predictionIntervalUpper?: (number | null)[];
    predictionIntervalLower?: (number | null)[];
  } {
    const fp = this.getLineChartFingerprint();
    if (fp !== this.lineChartMemoFp) {
      this.lineChartMemoFp = fp;
      this.lineChartMemo = this.computeLineChartBundle();
    }
    return this.lineChartMemo;
  }

  private inferForecastStartIndexFromLabels(labels: string[]): number | undefined {
    const idx = labels.findIndex(l => /^\+\d/.test(String(l).trim()));
    return idx >= 0 ? idx : undefined;
  }

  private computeLineChartBundle(): {
    data: number[];
    labels: string[];
    pointTooltipDateLabels?: string[];
    forecastStartIndex?: number;
    predictionIntervalUpper?: (number | null)[];
    predictionIntervalLower?: (number | null)[];
  } {
    const defaultLabels = this.getDefaultXAxisLabelsNoRange();
    if (!this.card || !this.rawAssetFlowsData?.length) {
      return {
        data: this.getFallbackChartDataForLength(defaultLabels.length),
        labels: defaultLabels,
        forecastStartIndex: this.inferForecastStartIndexFromLabels(defaultLabels),
      };
    }
    const productSubType = this.card.productSubType;
    if (!productSubType) {
      return {
        data: this.getFallbackChartDataForLength(defaultLabels.length),
        labels: defaultLabels,
        forecastStartIndex: this.inferForecastStartIndexFromLabels(defaultLabels),
      };
    }
    const filteredData = this.applyChartDataFilters(productSubType);
    const { dateMap, sortedDates } = detailModalUtil.aggregateByDate(filteredData);
    const { upperMap, lowerMap } = detailModalUtil.aggregateFcstBoundsByDate(filteredData);
    if (sortedDates.length === 0) {
      return {
        data: this.getFallbackChartDataForLength(defaultLabels.length),
        labels: defaultLabels,
        forecastStartIndex: this.inferForecastStartIndexFromLabels(defaultLabels),
      };
    }
    const rangeQuarterSeries = this.buildPerQuarterSeriesForTimeHorizonLabels(
      dateMap,
      sortedDates,
      upperMap,
      lowerMap
    );
    if (rangeQuarterSeries) {
      return {
        data: rangeQuarterSeries.series,
        labels: rangeQuarterSeries.xAxisLabels,
        pointTooltipDateLabels: rangeQuarterSeries.tooltipDateLabels,
        forecastStartIndex: rangeQuarterSeries.forecastStartIndex,
        predictionIntervalUpper: rangeQuarterSeries.predictionIntervalUpper,
        predictionIntervalLower: rangeQuarterSeries.predictionIntervalLower,
      };
    }
    const rawData = detailModalUtil.buildCumulativeRawData(sortedDates, dateMap);
    const targetLength = Math.max(1, defaultLabels.length);
    return {
      data: detailModalUtil.sampleOrPadToLength(rawData, targetLength),
      labels: defaultLabels,
      forecastStartIndex: this.inferForecastStartIndexFromLabels(defaultLabels),
    };
  }

  private getDefaultXAxisLabelsNoRange(): string[] {
    if (!this.card) {
      return [this.getZeroTimeHorizonDateLabel(), '+3', '+6', '+9', '+12'];
    }
    if (this.card.dataType === 'historical') {
      return ['-12', '-9', '-6', '-3', this.getZeroTimeHorizonDateLabel()];
    }
    return [this.getZeroTimeHorizonDateLabel(), '+3', '+6', '+9', '+12'];
  }

  /**
   * @returns {number[]} Chart data (filtered by card, regions, product types, time range) or fallback
   */
  getChartData(): number[] {
    const { data } = this.getLineChartBundle();
    return data;
  }

  private getBreakdownFingerprint(): string {
    return JSON.stringify({
      id: this.card?.id,
      dataType: this.card?.dataType,
      productSubType: this.card?.productSubType,
      timeHorizonRange: this.timeHorizonRange,
      selectedInvestorRegions: this.selectedInvestorRegions,
      selectedInvestorTypes: this.selectedInvestorTypes,
      selectedProductRegions: this.selectedProductRegions,
      selectedProductTypes: this.selectedProductTypes,
    });
  }

  private ensureBreakdownCache(): void {
    const fp = this.getBreakdownFingerprint();
    if (this.breakdownFingerprint === fp) return;
    this.breakdownFingerprint = fp;
    this.cachedInvestorBreakdown = this.buildBreakdownRows('investor');
    this.cachedProductBreakdown = this.buildBreakdownRows('product');
  }

  private dimensionKeyFromRow(r: AssetFlowRecord, kind: FlowBreakdownTab): string {
    if (kind === 'investor') {
      return (r.Plan_Type || r.Investor_Types || '').trim() || 'Other';
    }
    return (r.Product_Region || '').trim() || 'Other';
  }

  /**
   * Row labels: distinct values for this product sub-type in the current chart slice (this dimension's
   * dashboard filter bypassed so we see the full set for the sub-type). When the user has selected
   * investor types or product regions, only labels that both appear in that set and in this sub-type's
   * data are listed — never every global filter value that is irrelevant to this card.
   */
  private getOrderedBreakdownLabels(productSubType: string, kind: FlowBreakdownTab): string[] {
    const base = this.applyChartDataFiltersWithBypasses(productSubType, {
      bypassInvestorTypes: kind === 'investor',
      bypassProductRegions: kind === 'product',
    });
    const set = new Set<string>();
    for (const r of base) {
      set.add(this.dimensionKeyFromRow(r, kind));
    }
    const fromSubType = [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    if (kind === 'investor' && this.selectedInvestorTypes?.length) {
      const selected = new Set(this.selectedInvestorTypes);
      return fromSubType.filter(l => selected.has(l));
    }
    if (kind === 'product' && this.selectedProductRegions?.length) {
      const selected = new Set(this.selectedProductRegions);
      return fromSubType.filter(l => selected.has(l));
    }
    return fromSubType;
  }

  private buildBreakdownRows(kind: FlowBreakdownTab): FlowBreakdownRow[] {
    if (!this.card?.productSubType) return [];
    const productSubType = this.card.productSubType;
    const filtered = this.applyChartDataFilters(productSubType);
    const groups = new Map<string, AssetFlowRecord[]>();
    for (const r of filtered) {
      const key = this.dimensionKeyFromRow(r, kind);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    const labels = this.getOrderedBreakdownLabels(productSubType, kind);
    const horizonWin = this.getDetailHorizonYearMonthWindow();
    let totalOldAll = 0;
    if (horizonWin) {
      totalOldAll = filtered
        .filter(r => assetFlowQuarterInTimeWindow(r.Asset_Flow_Date, horizonWin.start, horizonWin.start))
        .reduce((s, x) => s + x.Asset_Flow_Value, 0);
    }
    const rows: FlowBreakdownRow[] = [];
    for (const label of labels) {
      const recs = groups.get(label) ?? [];
      const valueUsd = recs.reduce((sum, x) => sum + x.Asset_Flow_Value, 0);
      let pctChange: number | null = null;
      if (recs.length === 0) {
        pctChange = 0;
      } else if (horizonWin) {
        const oldUsd = recs
          .filter(r => assetFlowQuarterInTimeWindow(r.Asset_Flow_Date, horizonWin.start, horizonWin.start))
          .reduce((s, x) => s + x.Asset_Flow_Value, 0);
        const newUsd = recs
          .filter(r => assetFlowQuarterInTimeWindow(r.Asset_Flow_Date, horizonWin.end, horizonWin.end))
          .reduce((s, x) => s + x.Asset_Flow_Value, 0);
        pctChange = horizonSlicePercentOfTotalStart(newUsd - oldUsd, totalOldAll);
      } else {
        pctChange = 0;
      }
      rows.push({ label, valueUsd, pctChange });
    }
    return rows;
  }

  setBreakdownTab(tab: FlowBreakdownTab): void {
    this.detailBreakdownTab = tab;
  }

  getInvestorBreakdown(): FlowBreakdownRow[] {
    this.ensureBreakdownCache();
    return this.cachedInvestorBreakdown;
  }

  getProductRegionBreakdown(): FlowBreakdownRow[] {
    this.ensureBreakdownCache();
    return this.cachedProductBreakdown;
  }

  getActiveBreakdownRows(): FlowBreakdownRow[] {
    return this.detailBreakdownTab === 'investor'
      ? this.getInvestorBreakdown()
      : this.getProductRegionBreakdown();
  }

  formatBreakdownValueUsd(valueUsd: number): string {
    return formatFlowCurrencyUsd(valueUsd);
  }

  /**
   * Renders like "+12.5 %" / "-22.3 %" to match dashboard breakdown styling.
   */
  formatBreakdownPct(pct: number | null): string {
    if (pct == null || !Number.isFinite(pct)) return '—';
    const rounded = Math.round(pct * 10) / 10;
    const body = Math.abs(rounded).toLocaleString('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    if (rounded > 0) return `+${body} %`;
    if (rounded < 0) return `-${body} %`;
    return `${body} %`;
  }

  /**
   * @param {string} productSubType - Product sub-type to filter by
   * @returns {import("../../../utils/asset-flows-to-sankey.util").AssetFlowRecord[]} Filtered asset flow records
   */
  private applyChartDataFilters(productSubType: string): AssetFlowRecord[] {
    return this.applyChartDataFiltersWithBypasses(productSubType, {});
  }

  /**
   * Same as {@link applyChartDataFilters} but can omit investor-type or product-region filter so we can
   * list every distinct label while other dimensions stay applied.
   */
  private applyChartDataFiltersWithBypasses(
    productSubType: string,
    bypasses: { bypassInvestorTypes?: boolean; bypassProductRegions?: boolean }
  ): AssetFlowRecord[] {
    let data = this.rawAssetFlowsData.filter(r => r.Product_Sub_Type === productSubType);
    if (this.selectedInvestorRegions?.length) {
      data = data.filter(r => this.selectedInvestorRegions!.includes(r.Investor_Region));
    }
    if (!bypasses.bypassInvestorTypes && this.selectedInvestorTypes?.length) {
      data = data.filter(r => {
        const investorType = r.Plan_Type ?? r.Investor_Types;
        return investorType && this.selectedInvestorTypes!.includes(investorType);
      });
    }
    if (!bypasses.bypassProductRegions && this.selectedProductRegions?.length) {
      data = data.filter(r => r.Product_Region != null && this.selectedProductRegions!.includes(r.Product_Region));
    }
    if (this.selectedProductTypes?.length) {
      data = data.filter(r => this.selectedProductTypes!.includes(r.Product_Type));
    }
    const dataType = this.card?.dataType ?? 'forecasted';
    data = filterAssetFlowsByDataTypeResolvingSpan(
      data,
      dataType,
      this.timeHorizonRange?.start,
      this.timeHorizonRange?.end,
      this.historicAnchor.getAnchorYearMonth()
    );
    if (this.timeHorizonRange?.start && this.timeHorizonRange?.end) {
      const start = this.historicAnchor.horizonToYearMonth(this.timeHorizonRange.start);
      const end = this.historicAnchor.horizonToYearMonth(this.timeHorizonRange.end);
      if (start && end) {
        data = data.filter(r => assetFlowQuarterInTimeWindow(r.Asset_Flow_Date, start, end));
      }
    }
    return data;
  }

  /** Ordered YYYY-MM endpoints for the open time range (matches {@link applyChartDataFilters} window). */
  private getDetailHorizonYearMonthWindow(): { start: string; end: string } | null {
    if (!this.timeHorizonRange?.start || !this.timeHorizonRange?.end) return null;
    const s = this.historicAnchor.horizonToYearMonth(this.timeHorizonRange.start.trim());
    const e = this.historicAnchor.horizonToYearMonth(this.timeHorizonRange.end.trim());
    if (!s || !e) return null;
    return s <= e ? { start: s, end: e } : { start: e, end: s };
  }

  /**
   * @param {Map<string, number>} dateMap - Date to aggregated value (USD)
   * @param {string[]} sortedDates - Sorted date strings
   * @returns Per-quarter net flow, x-axis labels, and quarter date strings for point tooltips, or null
   */
  private buildPerQuarterSeriesForTimeHorizonLabels(
    dateMap: Map<string, number>,
    sortedDates: string[],
    upperMap: Map<string, number>,
    lowerMap: Map<string, number>
  ): {
    series: number[];
    xAxisLabels: string[];
    tooltipDateLabels: string[];
    forecastStartIndex: number;
    predictionIntervalUpper: (number | null)[];
    predictionIntervalLower: (number | null)[];
  } | null {
    if (!this.timeHorizonRange?.start || !this.timeHorizonRange?.end) return null;
    const startDate = this.historicAnchor.horizonToYearMonth(this.timeHorizonRange.start);
    const endDate = this.historicAnchor.horizonToYearMonth(this.timeHorizonRange.end);
    if (!startDate || !endDate) return null;
    const startMonths = detailModalUtil.parseTimeHorizonToMonths(this.timeHorizonRange.start);
    const endMonths = detailModalUtil.parseTimeHorizonToMonths(this.timeHorizonRange.end);
    if (startMonths === null || endMonths === null) return null;

    const lo = startDate <= endDate ? startDate : endDate;
    const hi = startDate <= endDate ? endDate : startDate;

    const orderedYms = detailModalUtil.everyQuarterEndYearMonthBetweenInclusive(lo, hi);
    if (orderedYms.length === 0) return null;

    const series = orderedYms.map(ym =>
      detailModalUtil.sumDateMapValuesForYearMonth(ym, sortedDates, dateMap)
    );
    const upperSeries = orderedYms.map(ym =>
      detailModalUtil.sumDateMapValuesForYearMonth(ym, sortedDates, upperMap)
    );
    const lowerSeries = orderedYms.map(ym =>
      detailModalUtil.sumDateMapValuesForYearMonth(ym, sortedDates, lowerMap)
    );
    const xAxisLabels = orderedYms.map(ym => this.formatYearMonthAsHorizonAxisTick(ym));
    const tooltipDateLabels = orderedYms.map(ym => detailModalUtil.formatYearMonthAsQuarterEndLongDate(ym));
    const anchorYm = this.historicAnchor.getAnchorYearMonth();
    let forecastStartIndex = orderedYms.length;
    if (anchorYm) {
      for (let i = 0; i < orderedYms.length; i++) {
        const delta = detailModalUtil.monthsBetweenYearMonths(anchorYm, orderedYms[i]);
        if (delta != null && delta > 0) {
          forecastStartIndex = i;
          break;
        }
      }
    }
    const hasFcstBounds = upperMap.size > 0;
    const predictionIntervalUpper: (number | null)[] = upperSeries.map((u, i) =>
      i < forecastStartIndex || !hasFcstBounds ? null : u
    );
    const predictionIntervalLower: (number | null)[] = lowerSeries.map((l, i) =>
      i < forecastStartIndex || !hasFcstBounds ? null : l
    );
    return { series, xAxisLabels, tooltipDateLabels, forecastStartIndex, predictionIntervalUpper, predictionIntervalLower };
  }

  private formatYearMonthAsHorizonAxisTick(ym: string): string {
    const anchorYm = this.historicAnchor.getAnchorYearMonth();
    if (!anchorYm) return ym;
    const delta = detailModalUtil.monthsBetweenYearMonths(anchorYm, ym);
    if (delta === null) return ym;
    if (delta === 0) return this.getZeroTimeHorizonDateLabel();
    if (delta > 0) return `+${delta}`;
    return `${delta}`;
  }

  /**
   * Computes the projected value from filtered raw data as the total net flow in USD
   * for the selected product sub-type and filters.
   */
  private computeFilteredProjectedValue(): number | null {
    const totals = this.computeInflowOutflowNetFromRaw();
    if (totals) return totals.netUsd;
    return null;
  }

  /**
   * Splits filtered rows into gross inflow (sum of positive flows) and gross outflow (sum of negatives).
   * @returns Totals in USD, or null when raw data cannot produce a breakdown for this card.
   */
  private computeInflowOutflowNetFromRaw(): { netUsd: number; inflowUsd: number; outflowUsd: number } | null {
    if (!this.card || !this.rawAssetFlowsData?.length || !this.card.productSubType) return null;
    const filtered = this.applyChartDataFilters(this.card.productSubType);
    if (!filtered.length) return null;
    let inflowUsd = 0;
    let outflowUsd = 0;
    for (const r of filtered) {
      const v = r.Asset_Flow_Value;
      if (!Number.isFinite(v)) continue;
      if (v > 0) inflowUsd += v;
      else outflowUsd += v;
    }
    return { netUsd: inflowUsd + outflowUsd, inflowUsd, outflowUsd };
  }

  /**
   * Net / inflow / outflow in USD: from filtered raw rows when available, else derived from the card net only.
   */
  getFlowUsdTotals(): { netUsd: number; inflowUsd: number; outflowUsd: number } {
    const fromRaw = this.computeInflowOutflowNetFromRaw();
    if (fromRaw) return fromRaw;
    if (!this.card) return { netUsd: 0, inflowUsd: 0, outflowUsd: 0 };
    const d = parseFlowDisplayValueToDollars(String(this.card.value).trim());
    const netUsd = Number.isFinite(d) ? d : 0;
    return {
      netUsd,
      inflowUsd: Math.max(0, netUsd),
      outflowUsd: Math.min(0, netUsd),
    };
  }

  getNetFlowDisplay(): string {
    return formatFlowCurrencyUsd(this.getFlowUsdTotals().netUsd);
  }

  /** Inflow with a leading "+" (e.g. "+$184.8B"). */
  getInflowDisplay(): string {
    const v = this.getFlowUsdTotals().inflowUsd;
    return `+${formatFlowCurrencyUsd(v)}`;
  }

  getOutflowDisplay(): string {
    return formatFlowCurrencyUsd(this.getFlowUsdTotals().outflowUsd);
  }

  /** Sample size for footer (sum of N_Clients on the card; matches flow card). */
  getDataSampleSizeDisplay(): string {
    const n = this.card?.nClientsTotal;
    if (n != null && n > 0 && Number.isFinite(n)) {
      return n.toLocaleString('en-US');
    }
    return '—';
  }

  /** Full USD string for tooltip on compact net flow display. */
  getProjectedValueHoverTitle(): string {
    const dynamic = this.computeFilteredProjectedValue();
    if (dynamic != null) {
      return formatFlowCurrencyUsdFull(dynamic);
    }
    const fromCard = this.card?.netFlowUsd;
    if (fromCard != null && Number.isFinite(fromCard)) {
      return formatFlowCurrencyUsdFull(fromCard);
    }
    if (!this.card) return formatFlowCurrencyUsdFull(0);
    const d = parseFlowDisplayValueToDollars(String(this.card.value).trim());
    if (Number.isFinite(d)) {
      return formatFlowCurrencyUsdFull(d);
    }
    return this.card.value;
  }

  /**
   * @returns {string} Time horizon display string
   */
  getTimeHorizonDisplay(): string {
    if (!this.card) return '12 Month';
    return this.card.timeHorizon || '12 Month';
  }

  /**
   * @returns {string[]} X-axis label strings for the chart
   */
  getXAxisLabels(): string[] {
    return this.getLineChartBundle().labels;
  }

  /** Date label for the "0" (today/anchor) point, aligned with Time Horizon date formatting. */
  private getZeroTimeHorizonDateLabel(): string {
    return formatTimeHorizonSliderHandleDate('0', this.historicAnchor.getAnchor());
  }

  /**
   * @returns {number | undefined} Minimum value for chart y-axis, or undefined if no data
   */
  getYAxisMin(): number | undefined {
    const bundle = this.getLineChartBundle();
    const data = bundle.data;
    if (data.length === 0) return undefined;
    let min = Math.min(...data);
    let max = Math.max(...data);
    const up = bundle.predictionIntervalUpper;
    const lo = bundle.predictionIntervalLower;
    if (up?.length && lo?.length) {
      for (let i = 0; i < up.length; i++) {
        const u = up[i];
        const l = lo[i];
        if (u != null && l != null) {
          min = Math.min(min, u, l);
          max = Math.max(max, u, l);
        }
      }
    }
    const span = max - min;
    const pad = span > 0 ? span * 0.08 : Math.max(Math.abs(min), Math.abs(max), 1) * 0.08;
    return min - pad;
  }

  /**
   * @returns {number | undefined} Maximum value for chart y-axis, or undefined if no data
   */
  getYAxisMax(): number | undefined {
    const bundle = this.getLineChartBundle();
    const data = bundle.data;
    if (data.length === 0) return undefined;
    let min = Math.min(...data);
    let max = Math.max(...data);
    const up = bundle.predictionIntervalUpper;
    const lo = bundle.predictionIntervalLower;
    if (up?.length && lo?.length) {
      for (let i = 0; i < up.length; i++) {
        const u = up[i];
        const l = lo[i];
        if (u != null && l != null) {
          min = Math.min(min, u, l);
          max = Math.max(max, u, l);
        }
      }
    }
    const span = max - min;
    const pad = span > 0 ? span * 0.08 : Math.max(Math.abs(min), Math.abs(max), 1) * 0.08;
    return max + pad;
  }

  /**
   * @returns {number} Chart width in pixels (responsive to viewport)
   */
  getChartWidth(): number {
    // Return responsive width based on viewport - fit without horizontal scroll
    if (typeof window !== 'undefined' && this.card) {
      const width = window.innerWidth;
      // Inline carousel: narrower chart so breakdown tabs / table have more horizontal room
      if (this.inline) {
        if (width <= 480) {
          return Math.max(260, width - 40);
        }
        if (width <= 768) {
          return Math.max(280, width - 56);
        }
        if (width <= 1024) {
          return Math.max(440, Math.min(width - 120, 560));
        }
        return Math.min(width - 300, 640);
      }
      if (width <= 480) {
        return Math.max(280, width - 32); // Small mobile: full width minus padding
      }
      if (width <= 768) {
        return Math.max(300, width - 48); // Mobile: ensure it fits
      }
      if (width <= 1024) {
        return Math.max(600, width - 64); // iPad/tablet: use most of viewport width
      }
      return Math.min(width - 220, 800); // Desktop: larger chart
    }
    return 800;
  }


  onAskMarketSenseClick(): void {
    if (this.card?.id) {
      this.askMarketSense.emit(this.card.id);
    }
  }

  onDownload(): void {
    if (this.inline) {
      this.openExport.emit();
      return;
    }
    this.showExportModal = true;
  }

  onCloseExportModal(): void {
    this.showExportModal = false;
  }

  onExportXLS(): void {
    if (this.card) {
      // TODO: Implement XLS export using this.card.id
    }
  }

  onExportPDF(): void {
    if (this.card) {
      // TODO: Implement PDF export using this.card.id
    }
  }
}

