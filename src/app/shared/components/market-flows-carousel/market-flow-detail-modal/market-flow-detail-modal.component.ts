/* eslint-disable */
import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { MarketFlowCard } from '../market-flow-card/market-flow-card.component';
import { LineChartComponent } from '../../charts/line-chart/line-chart.component';
import ExportModalComponent from '../export-modal/export-modal.component';
import { type AssetFlowRecord } from '../../../utils/asset-flows-to-sankey.util';

@Component({
  selector: 'app-market-flow-detail-modal',
  standalone: true,
  imports: [CommonModule, LineChartComponent, ExportModalComponent],
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

  getConfidenceColor(confidence: 'high' | 'medium' | 'low'): string {
    // All scores are green for now
    return '#00bc7d';
  }

  getConfidenceLabel(confidence: 'high' | 'medium' | 'low'): string {
    switch (confidence) {
      case 'high': return 'High Confidence';
      case 'medium': return 'Medium Confidence';
      case 'low': return 'Low Confidence';
      default: return 'High Confidence';
    }
  }

  getChartColor(): string {
    if (!this.card) return '#0b41ad'; // Blue color to match the image
    // Use blue for both positive and negative to match the design
    return '#0b41ad';
  }

  getChartData(): number[] {
    if (!this.card || !this.rawAssetFlowsData || this.rawAssetFlowsData.length === 0) {
      // Fallback to mock data if no real data available
      return [10, 12, 15, 14, 18, 22, 25, 28, 32, 30, 35, 38, 40];
    }

    // Filter data by product sub-type
    const productSubType = this.card.productSubType;
    if (!productSubType) {
      return [10, 12, 15, 14, 18, 22, 25, 28, 32, 30, 35, 38, 40];
    }

    // Filter by product sub-type
    let filteredData = this.rawAssetFlowsData.filter(record => 
      record.Product_Sub_Type === productSubType
    );

    // Filter by investor regions (if Global is selected, include all regions)
    const hasGlobal = this.selectedInvestorRegions && this.selectedInvestorRegions.includes('Global');
    if (!hasGlobal && this.selectedInvestorRegions && this.selectedInvestorRegions.length > 0) {
      filteredData = filteredData.filter(record => 
        this.selectedInvestorRegions.includes(record.Investor_Region)
      );
    }

    // Filter by product types (if Global is selected, include all product types)
    if (!hasGlobal && this.selectedProductTypes && this.selectedProductTypes.length > 0) {
      filteredData = filteredData.filter(record => 
        this.selectedProductTypes.includes(record.Product_Type)
      );
    }

    // Filter by time horizon range
    if (this.timeHorizonRange && this.timeHorizonRange.start && this.timeHorizonRange.end) {
      const startDate = this.convertTimeHorizonToDate(this.timeHorizonRange.start);
      const endDate = this.convertTimeHorizonToDate(this.timeHorizonRange.end);
      
      if (startDate && endDate) {
        filteredData = filteredData.filter(record => {
          if (!record.Asset_Flow_Date) return false;
          return record.Asset_Flow_Date >= startDate && record.Asset_Flow_Date <= endDate;
        });
      }
    }

    // Group data by date and aggregate values (sum positive and negative flows for net flow)
    const dateMap = new Map<string, number>();
    filteredData.forEach(record => {
      if (!record.Asset_Flow_Date) return;
      const date = record.Asset_Flow_Date;
      // Asset_Flow_Value is in thousands, convert to billions
      // Negative values are outflows, positive values are inflows
      const valueInBillions = record.Asset_Flow_Value / 1000000;
      const existing = dateMap.get(date) || 0;
      dateMap.set(date, existing + valueInBillions);
    });

    // Sort dates and create data points
    const sortedDates = Array.from(dateMap.keys()).sort();
    if (sortedDates.length === 0) {
      return [10, 12, 15, 14, 18, 22, 25, 28, 32, 30, 35, 38, 40];
    }

    // Generate data points aligned with time horizon labels
    if (this.timeHorizonRange && this.timeHorizonRange.start && this.timeHorizonRange.end) {
      const labels = this.generateTimeHorizonLabels(this.timeHorizonRange.start, this.timeHorizonRange.end);
      const numPoints = labels.length;
      const data: number[] = [];

      // Get start and end dates
      const startDate = this.convertTimeHorizonToDate(this.timeHorizonRange.start);
      const endDate = this.convertTimeHorizonToDate(this.timeHorizonRange.end);

      if (startDate && endDate) {
        // Generate dates for each label
        const startMonths = this.parseTimeHorizonToMonths(this.timeHorizonRange.start);
        const endMonths = this.parseTimeHorizonToMonths(this.timeHorizonRange.end);

        if (startMonths !== null && endMonths !== null) {
          // Calculate cumulative values (running total)
          let cumulativeValue = 0;
          
          for (let i = 0; i < numPoints; i++) {
            const progress = i / (numPoints - 1);
            const months = startMonths + (endMonths - startMonths) * progress;
            const targetDate = this.getDateFromMonthsOffset(months);

            // Find the closest date in our data
            let dateValue = 0;
            if (sortedDates.includes(targetDate)) {
              dateValue = dateMap.get(targetDate) || 0;
            } else {
              // Find closest date
              const closestDate = this.findClosestDate(targetDate, sortedDates);
              if (closestDate) {
                dateValue = dateMap.get(closestDate) || 0;
              }
            }
            
            // Add to cumulative total
            cumulativeValue += dateValue;
            data.push(cumulativeValue);
          }
          return data;
        }
      }
    }

    // Fallback: use cumulative values from actual data points
    let cumulativeValue = 0;
    const data = sortedDates.map(date => {
      const dateValue = dateMap.get(date) || 0;
      cumulativeValue += dateValue;
      return cumulativeValue;
    });
    
    // If we have fewer than 5 data points, pad with zeros or use what we have
    if (data.length < 5) {
      return data;
    } else if (data.length > 5) {
      // Sample to get 5 points
      const step = Math.floor(data.length / 5);
      const sampled: number[] = [];
      for (let i = 0; i < 5; i++) {
        const index = Math.min(i * step, data.length - 1);
        sampled.push(data[index]);
      }
      return sampled;
    }
    
    return data;
  }

  /**
   * Converts time horizon string to target date in YYYY-MM format
   */
  private convertTimeHorizonToDate(horizon: string): string | null {
    // If it's already in YYYY-MM format, return it directly
    if (/^\d{4}-\d{2}$/.test(horizon.trim())) {
      return horizon.trim();
    }
    
    const today = new Date();
    const baseYear = today.getFullYear();
    const baseMonth = today.getMonth() + 1;
    
    if (horizon === 'Today') {
      const monthStr = String(baseMonth).padStart(2, '0');
      return `${baseYear}-${monthStr}`;
    }
    
    const normalized = horizon.trim().toLowerCase();
    let match = normalized.match(/^([+-]?)(\d+)\s*mo$/i);
    
    if (!match) {
      match = normalized.match(/^([+-]?)(\d+)$/);
    }
    
    if (!match) {
      return null;
    }
    
    const isNegative = match[1] === '-';
    const months = parseInt(match[2], 10);
    
    const targetDate = new Date(baseYear, baseMonth - 1, 1);
    
    if (isNegative) {
      targetDate.setMonth(targetDate.getMonth() - months);
    } else {
      targetDate.setMonth(targetDate.getMonth() + months);
    }
    
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth() + 1;
    const monthStr = String(targetMonth).padStart(2, '0');
    
    return `${targetYear}-${monthStr}`;
  }

  /**
   * Gets date string (YYYY-MM) from months offset from today
   */
  private getDateFromMonthsOffset(months: number): string {
    const today = new Date();
    const targetDate = new Date(today.getFullYear(), today.getMonth() + months, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth() + 1;
    const monthStr = String(month).padStart(2, '0');
    return `${year}-${monthStr}`;
  }

  /**
   * Finds the closest date in sorted dates array
   */
  private findClosestDate(targetDate: string, sortedDates: string[]): string | null {
    if (sortedDates.length === 0) return null;
    
    // Convert dates to comparable format and find closest
    const target = new Date(targetDate + '-01');
    let closest = sortedDates[0];
    let minDiff = Math.abs(target.getTime() - new Date(sortedDates[0] + '-01').getTime());

    for (const date of sortedDates) {
      const dateObj = new Date(date + '-01');
      const diff = Math.abs(target.getTime() - dateObj.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closest = date;
      }
    }

    return closest;
  }

  private parseValue(valueStr: string): number {
    // Parse values like "$124.8B", "-$98.4B", "$90B"
    const cleaned = valueStr.replace(/[$,B]/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 100 : Math.abs(num);
  }

  private parsePercentage(percentageStr: string): number {
    // Parse percentages like "+12.3%", "-12.3%", "+4.6%"
    const cleaned = percentageStr.replace(/[+%]/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  getProjectedValue(): string {
    if (!this.card) return '$0';
    return this.card.value;
  }

  getTimeHorizonDisplay(): string {
    if (!this.card) return '12 Month';
    return this.card.timeHorizon || '12 Month';
  }

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
   * Generates time horizon labels from start to end with intermediate points
   */
  private generateTimeHorizonLabels(start: string, end: string): string[] {
    const startMonths = this.parseTimeHorizonToMonths(start);
    const endMonths = this.parseTimeHorizonToMonths(end);

    if (startMonths === null || endMonths === null) {
      return ['Today', '+3mo', '+6mo', '+9mo', '+12mo'];
    }

    const labels: string[] = [];
    const numPoints = 5; // Number of points to show on x-axis

    // Generate labels from start to end
    for (let i = 0; i < numPoints; i++) {
      const progress = i / (numPoints - 1);
      const months = Math.round(startMonths + (endMonths - startMonths) * progress);
      
      if (months === 0) {
        labels.push('Today');
      } else if (months > 0) {
        labels.push(`+${months}mo`);
      } else {
        labels.push(`${months}mo`);
      }
    }

    return labels;
  }

  /**
   * Parses time horizon string to number of months from today
   * Returns null if parsing fails
   */
  private parseTimeHorizonToMonths(horizon: string): number | null {
    if (horizon === 'Today') {
      return 0;
    }

    const normalized = horizon.trim().toLowerCase();
    let match = normalized.match(/^([+-]?)(\d+)\s*mo$/i);

    if (!match) {
      match = normalized.match(/^([+-]?)(\d+)$/);
    }

    if (!match) {
      return null;
    }

    const isNegative = match[1] === '-';
    const months = parseInt(match[2], 10);

    return isNegative ? -months : months;
  }

  getYAxisMin(): number | undefined {
    const data = this.getChartData();
    if (data.length === 0) return undefined;
    const min = Math.min(...data);
    // Allow negative values - don't force minimum to 0
    return min * 0.9; // 10% padding below
  }

  getYAxisMax(): number | undefined {
    const data = this.getChartData();
    if (data.length === 0) return undefined;
    const max = Math.max(...data);
    return max * 1.1; // 10% padding above
  }

  getChartWidth(): number {
    // Return responsive width based on container - fit without horizontal scroll
    if (typeof window !== 'undefined') {
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
    // TODO: Implement XLS export functionality
    console.log('Exporting to XLS for card:', this.card?.id);
  }

  onExportPDF(): void {
    // TODO: Implement PDF export functionality
    console.log('Exporting to PDF for card:', this.card?.id);
  }
}

