/* eslint-disable */
import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { MarketFlowCard } from '../market-flow-card/market-flow-card.component';
import { LineChartComponent } from '../../charts/line-chart/line-chart.component';
import ExportModalComponent from '../export-modal/export-modal.component';
import TitleComponent from '../../title/title.component';
import { type AssetFlowRecord } from '../../../utils/asset-flows-to-sankey.util';
import * as detailModalUtil from './market-flow-detail-modal.util';
import {
  formatFlowCurrencyUsd,
  formatFlowCurrencyUsdFull,
  parseFlowDisplayValueToDollars,
} from '../../../utils/flow-currency-format.util';
import { assetFlowQuarterInTimeWindow } from '../../../utils/asset-flow-time-window.util';

@Component({
  selector: 'app-market-flow-detail-modal',
  standalone: true,
  imports: [CommonModule, LineChartComponent, ExportModalComponent, TitleComponent],
  templateUrl: './market-flow-detail-modal.component.html',
  styleUrl: './market-flow-detail-modal.component.scss'
})
export default class MarketFlowDetailModalComponent implements OnChanges {
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

  showExportModal: boolean = false;
  /** Y-axis title; tick values use compact USD (see line chart yAxisValuesInBillions). */
  yAxisLabelText: string = 'Cumulative net flow (USD)';
  xAxisLabelText: string = 'Time Horizon';

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
  }

  onClose(): void {
    document.body.style.overflow = '';
    this.close.emit();
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
   * Returns fallback chart data with length equal to getXAxisLabels() so x-axis never shows raw indices (e.g. "4").
   * @returns {number[]} Fallback chart values
   */
  private getFallbackChartData(): number[] {
    const labelCount = this.getXAxisLabels().length;
    const template = MarketFlowDetailModalComponent.FALLBACK_CHART_DATA_TEMPLATE;
    if (labelCount <= template.length) {
      return template.slice(0, labelCount);
    }
    // Pad: repeat last value so every tick has a label
    const last = template[template.length - 1] ?? 35;
    return [...template, ...Array(labelCount - template.length).fill(last)];
  }

  /**
   * @returns {number[]} Chart data (filtered by card, regions, product types, time range) or fallback
   */
  getChartData(): number[] {
    if (!this.card || !this.rawAssetFlowsData || this.rawAssetFlowsData.length === 0) {
      return this.getFallbackChartData();
    }
    const productSubType = this.card.productSubType;
    if (!productSubType) return this.getFallbackChartData();

    const filteredData = this.applyChartDataFilters(productSubType);
    const { dateMap, sortedDates } = detailModalUtil.aggregateByDate(filteredData);
    if (sortedDates.length === 0) return this.getFallbackChartData();

    const labelAlignedData = this.buildCumulativeDataForTimeHorizonLabels(dateMap, sortedDates);
    if (labelAlignedData) return labelAlignedData;

    const rawData = detailModalUtil.buildCumulativeRawData(sortedDates, dateMap);
    const targetLength = Math.max(1, this.getXAxisLabels().length);
    return detailModalUtil.sampleOrPadToLength(rawData, targetLength);
  }

  /**
   * @param {string} productSubType - Product sub-type to filter by
   * @returns {import("../../../utils/asset-flows-to-sankey.util").AssetFlowRecord[]} Filtered asset flow records
   */
  private applyChartDataFilters(productSubType: string): AssetFlowRecord[] {
    let data = this.rawAssetFlowsData.filter(r => r.Product_Sub_Type === productSubType);
    if (this.selectedInvestorRegions?.length) {
      data = data.filter(r => this.selectedInvestorRegions!.includes(r.Investor_Region));
    }
    if (this.selectedInvestorTypes?.length) {
      data = data.filter(r => {
        const investorType = r.Plan_Type ?? r.Investor_Types;
        return investorType && this.selectedInvestorTypes!.includes(investorType);
      });
    }
    if (this.selectedProductRegions?.length) {
      data = data.filter(r => r.Product_Region != null && this.selectedProductRegions!.includes(r.Product_Region));
    }
    if (this.selectedProductTypes?.length) {
      data = data.filter(r => this.selectedProductTypes!.includes(r.Product_Type));
    }
    if (this.timeHorizonRange?.start && this.timeHorizonRange?.end) {
      const start = detailModalUtil.convertTimeHorizonToDate(this.timeHorizonRange.start);
      const end = detailModalUtil.convertTimeHorizonToDate(this.timeHorizonRange.end);
      if (start && end) {
        data = data.filter(r => assetFlowQuarterInTimeWindow(r.Asset_Flow_Date, start, end));
      }
    }
    return data;
  }

  /**
   * @param {Map<string, number>} dateMap - Date to aggregated value (billions)
   * @param {string[]} sortedDates - Sorted date strings
   * @returns {number[] | null} Cumulative data aligned to time horizon labels, or null
   */
  private buildCumulativeDataForTimeHorizonLabels(
    dateMap: Map<string, number>,
    sortedDates: string[]
  ): number[] | null {
    if (!this.timeHorizonRange?.start || !this.timeHorizonRange?.end) return null;
    const startDate = detailModalUtil.convertTimeHorizonToDate(this.timeHorizonRange.start);
    const endDate = detailModalUtil.convertTimeHorizonToDate(this.timeHorizonRange.end);
    if (!startDate || !endDate) return null;
    const startMonths = detailModalUtil.parseTimeHorizonToMonths(this.timeHorizonRange.start);
    const endMonths = detailModalUtil.parseTimeHorizonToMonths(this.timeHorizonRange.end);
    if (startMonths === null || endMonths === null) return null;

    const anchorMonths = this.getTimeHorizonAnchorMonthsList(this.timeHorizonRange.start, this.timeHorizonRange.end);
    const data: number[] = [];
    let cumulativeValue = 0;
    for (let i = 0; i < anchorMonths.length; i += 1) {
      const months = anchorMonths[i];
      const targetDate = detailModalUtil.getDateFromMonthsOffset(months);
      let dateValue = 0;
      if (sortedDates.includes(targetDate)) {
        dateValue = dateMap.get(targetDate) || 0;
      } else {
        const closest = detailModalUtil.findClosestDate(targetDate, sortedDates);
        if (closest) dateValue = dateMap.get(closest) || 0;
      }
      cumulativeValue += dateValue;
      data.push(cumulativeValue);
    }
    return data;
  }

  /**
   * Formats a numeric value in billions to a display string like "-$98.4B".
   */
  private formatBillions(value: number): string {
    if (!Number.isFinite(value) || value === 0) return '$0B';
    const isNegative = value < 0;
    const absVal = Math.abs(value);
    const formatted = absVal.toLocaleString('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    return `${isNegative ? '-' : ''}$${formatted}B`;
  }

  /**
   * Computes the projected value from filtered raw data as the total net flow in USD
   * for the selected product sub-type and filters.
   */
  private computeFilteredProjectedValue(): number | null {
    if (!this.card || !this.rawAssetFlowsData || this.rawAssetFlowsData.length === 0) {
      return null;
    }
    const productSubType = this.card.productSubType;
    if (!productSubType) return null;

    const filteredData = this.applyChartDataFilters(productSubType);
    if (!filteredData.length) return null;

    return filteredData.reduce((sum, r) => sum + r.Asset_Flow_Value, 0);
  }

  /**
   * @returns {string} Projected/forecast value based on current filters and time horizon,
   *          falling back to the card's static value when raw data is unavailable.
   */
  getProjectedValue(): string {
    const dynamic = this.computeFilteredProjectedValue();
    if (dynamic != null) {
      return formatFlowCurrencyUsd(dynamic);
    }
    if (!this.card) return formatFlowCurrencyUsd(0);
    // Fall back to the precomputed card value when we can't derive a filtered one
    return this.card.value;
  }

  /** Full USD string for tooltip on compact NET VALUE display. */
  getProjectedValueHoverTitle(): string {
    const dynamic = this.computeFilteredProjectedValue();
    if (dynamic != null) {
      return formatFlowCurrencyUsdFull(dynamic);
    }
    if (!this.card) return formatFlowCurrencyUsdFull(0);
    const d = parseFlowDisplayValueToDollars(String(this.card.value).trim());
    if (Number.isFinite(d)) {
      return formatFlowCurrencyUsdFull(d);
    }
    return this.card.value;
  }

  /**
   * Computes EXPECTED CHANGE as the percentage change between the first and last
   * points of the line chart data: (last - first) / |first| * 100.
   * Returns 0 when there is insufficient data.
   */
  getExpectedChange(): number {
    const data = this.getChartData();
    if (!data || data.length < 2) return 0;

    const first = data[0];
    const last = data[data.length - 1];
    if (!Number.isFinite(first) || first === 0) return 0;

    const change = last - first;
    const pct = (change / Math.abs(first)) * 100;
    if (!Number.isFinite(pct)) return 0;
    return pct;
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
    // Generate labels based on time horizon range
    if (this.timeHorizonRange && this.timeHorizonRange.start && this.timeHorizonRange.end) {
      return this.generateTimeHorizonLabels(this.timeHorizonRange.start, this.timeHorizonRange.end);
    }

    // Fallback to default labels
    if (!this.card) {
      return ['Today', '+3mo', '+6mo', '+9mo', '+12mo'];
    }

    const isHistorical = this.card.dataType === 'historical';
    if (isHistorical) {
      return ['-12mo', '-9mo', '-6mo', '-3mo', 'Today'];
    } else {
      return ['Today', '+3mo', '+6mo', '+9mo', '+12mo'];
    }
  }

  /**
   * Month offsets for each x-axis point when a dashboard time range is set: range endpoints plus every
   * multiple of 3 months between them (Today / ±3mo / ±6mo …), in chronological order.
   */
  private getTimeHorizonAnchorMonthsList(start: string, end: string): number[] {
    if (!this.timeHorizonRange && !start && !end) return [];
    const startMonths = detailModalUtil.parseTimeHorizonToMonths(start);
    const endMonths = detailModalUtil.parseTimeHorizonToMonths(end);

    if (startMonths === null || endMonths === null) {
      return [0, 3, 6, 9, 12];
    }

    return MarketFlowDetailModalComponent.canonicalHorizonMonthsInRange(startMonths, endMonths);
  }

  /**
   * Selected filter endpoints plus each month offset in the closed range that is a multiple of 3 from today.
   */
  private static canonicalHorizonMonthsInRange(startM: number, endM: number): number[] {
    const lo = Math.min(startM, endM);
    const hi = Math.max(startM, endM);
    const set = new Set<number>();
    set.add(startM);
    set.add(endM);
    for (let x = lo; x <= hi; x += 1) {
      if (x % 3 === 0) set.add(x);
    }
    return [...set].sort((a, b) => a - b);
  }

  /**
   * Generates time horizon labels from start to end with distinct intermediate points (no duplicates).
   * @param {string} start - Start time horizon string
   * @param {string} end - End time horizon string
   * @returns {string[]} Array of label strings (e.g. "Today", "+3mo")
   */
  private generateTimeHorizonLabels(start: string, end: string): string[] {
    return this.getTimeHorizonAnchorMonthsList(start, end).map(m => {
      if (m === 0) return 'Today';
      if (m > 0) return `+${m}mo`;
      return `${m}mo`;
    });
  }

  /**
   * @returns {number | undefined} Minimum value for chart y-axis, or undefined if no data
   */
  getYAxisMin(): number | undefined {
    const data = this.getChartData();
    if (data.length === 0) return undefined;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min;
    const pad = span > 0 ? span * 0.08 : Math.max(Math.abs(min), Math.abs(max), 1) * 0.08;
    return min - pad;
  }

  /**
   * @returns {number | undefined} Maximum value for chart y-axis, or undefined if no data
   */
  getYAxisMax(): number | undefined {
    const data = this.getChartData();
    if (data.length === 0) return undefined;
    const min = Math.min(...data);
    const max = Math.max(...data);
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

