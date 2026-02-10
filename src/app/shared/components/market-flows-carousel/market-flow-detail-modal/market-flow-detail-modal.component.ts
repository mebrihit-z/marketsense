import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { MarketFlowCard } from '../market-flow-card/market-flow-card.component';
import { LineChartComponent } from '../../charts/line-chart/line-chart.component';
import ExportModalComponent from '../export-modal/export-modal.component';
import TitleComponent from '../../title/title.component';
import { type AssetFlowRecord } from '../../../utils/asset-flows-to-sankey.util';
import * as detailModalUtil from './market-flow-detail-modal.util';

@Component({
  selector: 'app-market-flow-detail-modal',
  standalone: true,
  imports: [CommonModule, LineChartComponent, ExportModalComponent, TitleComponent],
  templateUrl: './market-flow-detail-modal.component.html',
  styleUrl: './market-flow-detail-modal.component.scss'
})
export default class MarketFlowDetailModalComponent implements OnChanges {
  @Input() isVisible: boolean = false;
  @Input() card: MarketFlowCard | null = null;
  @Input() rawAssetFlowsData: AssetFlowRecord[] = [];
  @Input() timeHorizonRange: { start: string; end: string } | null = null;
  @Input() selectedInvestorRegions: string[] = [];
  @Input() selectedProductTypes: string[] = [];
  @Output() close = new EventEmitter<void>();

  showExportModal: boolean = false;
  yAxisLabelText: string = 'Billions (USD)';
  xAxisLabelText: string = 'Time Horizon';

  /** Exposed for template (static methods). */
  readonly getConfidenceColor = MarketFlowDetailModalComponent.getConfidenceColor;
  readonly getConfidenceLabel = MarketFlowDetailModalComponent.getConfidenceLabel;

  /**
   * @param {import("@angular/core").SimpleChanges} changes - Current and previous property values
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible']) {
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
      case 'high': return 'High Confidence';
      case 'medium': return 'Medium Confidence';
      case 'low': return 'Low Confidence';
      default: return 'High Confidence';
    }
  }

  /**
   * @returns {string} Hex color for the chart line
   */
  getChartColor(): string {
    if (!this.card) return '#0b41ad'; // Blue color to match the image
    // Use blue for both positive and negative to match the design
    return '#0b41ad';
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
    const hasGlobal = this.selectedInvestorRegions?.includes('Global');
    if (!hasGlobal && this.selectedInvestorRegions?.length) {
      data = data.filter(r => this.selectedInvestorRegions.includes(r.Investor_Region));
    }
    if (!hasGlobal && this.selectedProductTypes?.length) {
      data = data.filter(r => this.selectedProductTypes.includes(r.Product_Type));
    }
    if (this.timeHorizonRange?.start && this.timeHorizonRange?.end) {
      const start = detailModalUtil.convertTimeHorizonToDate(this.timeHorizonRange.start);
      const end = detailModalUtil.convertTimeHorizonToDate(this.timeHorizonRange.end);
      if (start && end) {
        data = data.filter(r => r.Asset_Flow_Date && r.Asset_Flow_Date >= start && r.Asset_Flow_Date <= end);
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

    const labels = this.generateTimeHorizonLabels(this.timeHorizonRange.start, this.timeHorizonRange.end);
    const numPoints = labels.length;
    const data: number[] = [];
    let cumulativeValue = 0;
    for (let i = 0; i < numPoints; i += 1) {
      const progress = i / (numPoints - 1);
      const months = startMonths + (endMonths - startMonths) * progress;
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
   * @returns {string} Projected value from card or '$0'
   */
  getProjectedValue(): string {
    if (!this.card) return '$0';
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
   * Generates time horizon labels from start to end with distinct intermediate points (no duplicates).
   * @param {string} start - Start time horizon string
   * @param {string} end - End time horizon string
   * @returns {string[]} Array of label strings (e.g. "Today", "+3mo")
   */
  private generateTimeHorizonLabels(start: string, end: string): string[] {
    if (!this.timeHorizonRange && !start && !end) return [];
    const startMonths = detailModalUtil.parseTimeHorizonToMonths(start);
    const endMonths = detailModalUtil.parseTimeHorizonToMonths(end);

    if (startMonths === null || endMonths === null) {
      return ['Today', '+3mo', '+6mo', '+9mo', '+12mo'];
    }

    const maxPoints = 5;
    const span = endMonths - startMonths;
    // Use distinct integer month steps: at most maxPoints, and at most (span + 1) points
    const numDistinctMonths = Math.min(maxPoints, Math.max(1, Math.abs(span) + 1));
    const step = span === 0 ? 0 : span / (numDistinctMonths - 1);
    const seenMonths = new Set<number>();
    const labels: string[] = [];

    for (let i = 0; i < numDistinctMonths; i += 1) {
      const months = span === 0 ? startMonths : Math.round(startMonths + step * i);
      if (!seenMonths.has(months)) {
        seenMonths.add(months);
        if (months === 0) {
          labels.push('Today');
        } else if (months > 0) {
          labels.push(`+${months}mo`);
        } else {
          labels.push(`${months}mo`);
        }
      }
    }

    return labels.length > 0 ? labels : ['Today', '+3mo', '+6mo', '+9mo', '+12mo'];
  }

  /**
   * @returns {number | undefined} Minimum value for chart y-axis, or undefined if no data
   */
  getYAxisMin(): number | undefined {
    const data = this.getChartData();
    if (data.length === 0) return undefined;
    const min = Math.min(...data);
    const max = Math.max(...data);
    // For all-negative data: axis bottom = most negative - padding; top = least negative + padding
    if (max <= 0) return min * 1.1; // extend downward (e.g. -98 -> -107.8)
    // For positive or mixed: allow negative, 10% padding below
    return min * 0.9;
  }

  /**
   * @returns {number | undefined} Maximum value for chart y-axis, or undefined if no data
   */
  getYAxisMax(): number | undefined {
    const data = this.getChartData();
    if (data.length === 0) return undefined;
    const min = Math.min(...data);
    const max = Math.max(...data);
    // For all-negative data: axis top = least negative + padding (e.g. -98 -> -88.2)
    if (min < 0 && max <= 0) return max * 0.9;
    // For positive or mixed: 10% padding above
    return max * 1.1;
  }

  /**
   * @returns {number} Chart width in pixels (responsive to viewport)
   */
  getChartWidth(): number {
    // Return responsive width based on container - fit without horizontal scroll
    if (typeof window !== 'undefined' && this.card) {
      const width = window.innerWidth;
      if (width <= 768) {
        return Math.min(width - 100, 400); // Mobile - ensure it fits
      } else if (width <= 1024) {
        return Math.min(width - 200, 450); // Tablet - ensure it fits
      }
      return Math.min(width - 300, 600); // Desktop - ensure it fits without scroll
    }
    return 600;
  }


  onDownload(): void {
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

