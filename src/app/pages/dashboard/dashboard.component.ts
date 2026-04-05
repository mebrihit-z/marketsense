/* eslint-disable */
import { Component, OnInit, AfterViewInit, ChangeDetectorRef, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FiltersBarComponent } from '../../shared/components/filters/filters-bar/filters-bar.component';
import type { FilterOptionTotals } from '../../shared/components/filters/filters-bar/filters-bar.component';
import { FeaturedMarketFlowsCarouselComponent } from '../../shared/components/market-flows-carousel/market-flows-carousel.component';
import { MarketFlowCard } from '../../shared/components/market-flows-carousel/market-flow-card/market-flow-card.component';
import { AssetFlowsComponent } from '../../shared/components/asset-flows/asset-flows.component';
import { AssetAllocationComponent } from '../../shared/components/asset-allocation/asset-allocation.component';
import HeaderComponent from '../../shared/components/header/header.component';
import WelcomeSectionComponent from '../../shared/components/welcome-section/welcome-section.component';
import AskMarketsenseSectionComponent from '../../shared/components/ask-marketsense-section/ask-marketsense-section.component';
import AskMarketsenseStickyButtonComponent from '../../shared/components/ask-marketsense-sticky-button/ask-marketsense-sticky-button.component';
import { type AssetFlowRecord } from '../../shared/utils/asset-flows-to-sankey.util';
import { AssetFlowsDataService } from '../../core/services/asset-flows-data.service';
import {
  getMinFlowLowerBound,
  getMaxFlowUpperBound,
  createDefaultMinFlowRange,
  type MinFlowRangeSelection,
} from '../../shared/utils/min-flow-value-options.util';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [HeaderComponent, CommonModule, FiltersBarComponent, FeaturedMarketFlowsCarouselComponent, AssetFlowsComponent, AssetAllocationComponent, WelcomeSectionComponent, AskMarketsenseSectionComponent, AskMarketsenseStickyButtonComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export default class DashboardComponent implements OnInit, AfterViewInit {
  @ViewChild('filtersSticky', { read: ElementRef }) private filtersStickyRef?: ElementRef<HTMLElement>;

  /** True while the filters strip is pinned (sticky) at the top of the viewport. */
  isFiltersStickyEngaged = false;

  carouselDataType: 'historical' | 'forecasted' = 'forecasted';
  carouselTimeHorizon: string = '+3 mo';
  timeHorizonRange: { start: string; end: string } | null = null;
  selectedProductSubTypes: string[] = [];
  selectedProductTypes: string[] = [];
  selectedProductRegions: string[] = [];
  selectedInvestorRegions: string[] = [];
  selectedInvestorTypes: string[] = [];
  filterOptionTotals: FilterOptionTotals = {
    productTypeTotal: 0,
    productSubTypeTotal: 0,
    investorRegionTotal: 0,
    investorTypeTotal: 0,
    productRegionTotal: 0
  };
  /** Lower / upper flow value band (billions) for Sankey and Treemap; driven by filters bar. */
  chartMinFlowLower = getMinFlowLowerBound(createDefaultMinFlowRange());
  chartMaxFlowUpper: number | null = getMaxFlowUpperBound(createDefaultMinFlowRange());
  pinnedCardIds: string[] = [];
  isAssetAllocationPinned: boolean = false;
  isAssetFlowsPinned: boolean = false;
  forceCloseFiltersDropdown = 0;
  forceCloseDimensionDropdown = 0;

  // Raw asset flows data
  rawAssetFlowsData: AssetFlowRecord[] = [];

  constructor(private cdr: ChangeDetectorRef, private assetFlowsData: AssetFlowsDataService) {}

  ngOnInit(): void {
    this.loadAssetFlowsData();
  }

  ngAfterViewInit(): void {
    queueMicrotask(() => this.updateFiltersStickyEngaged());
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  onWindowScrollOrResize(): void {
    this.updateFiltersStickyEngaged();
  }

  private updateFiltersStickyEngaged(): void {
    const el = this.filtersStickyRef?.nativeElement;
    if (!el || typeof window === 'undefined') {
      return;
    }
    const r = el.getBoundingClientRect();
    // Pinned to top: use height, not bottom>28px — collapsed strip is shorter and r.bottom can be < 28px
    // while still valid, which falsely flipped sticky off and reset minimize (see filters-bar ngOnChanges).
    const engaged = r.top <= 2 && r.height > 12;
    if (engaged !== this.isFiltersStickyEngaged) {
      this.isFiltersStickyEngaged = engaged;
      this.cdr.markForCheck();
    }
  }

  private loadAssetFlowsData(): void {
    this.assetFlowsData.getAssetFlows().subscribe({
      next: (data) => {
        this.rawAssetFlowsData = data;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading asset flows data:', error);
      }
    });
  }

  onDataTypeChange(dataType: 'historical' | 'forecasted'): void {
    this.carouselDataType = dataType;
    // Clean up pinned card IDs when data type changes (card IDs include data type)
    this.cleanupPinnedCardIds();
  }

  onTimeHorizonChange(timeHorizon: string): void {
    this.carouselTimeHorizon = timeHorizon;
    // Clean up pinned card IDs when time horizon changes (card IDs include time horizon)
    this.cleanupPinnedCardIds();
  }

  onTimeHorizonRangeChange(range: { start: string; end: string }): void {
    this.timeHorizonRange = range;
    // Also update the carousel time horizon to the end value for backward compatibility
    this.carouselTimeHorizon = range.end;
  }
  
  /**
   * Removes pinned card IDs that are no longer valid
   * (cards whose product sub-types were deselected, or data type/time horizon changed)
   */
  private cleanupPinnedCardIds(): void {
    if (this.pinnedCardIds.length > 0) {
      const validCardIds = this.getValidCardIds();
      this.pinnedCardIds = this.pinnedCardIds.filter(id => validCardIds.includes(id));
    }
  }

  onProductSubTypeChange(productSubTypes: string[]): void {
    this.selectedProductSubTypes = productSubTypes;
    // Clean up pinned card IDs for cards that no longer exist
    // This happens when product sub-types are deselected
    this.cleanupPinnedCardIds();
  }

  /**
   * Generates the card IDs that would exist based on current selected product sub-types
   * Used for cleaning up pinned card IDs when sub-types are deselected
   */
  private getValidCardIds(): string[] {
    if (!this.selectedProductSubTypes || this.selectedProductSubTypes.length === 0) {
      return [];
    }

    return this.selectedProductSubTypes.map((subType) => {
      return `${this.carouselDataType}-${this.carouselTimeHorizon.replace(/\s/g, '')}-${subType.replace(/\s/g, '-').replace(/\//g, '-')}`;
    });
  }

  onProductTypeChange(productTypes: string[]): void {
    this.selectedProductTypes = productTypes;
  }

  onProductRegionChange(productRegions: string[]): void {
    this.selectedProductRegions = productRegions;
  }

  onInvestorRegionChange(investorRegions: string[]): void {
    this.selectedInvestorRegions = investorRegions;
  }

  onInvestorTypeChange(investorTypes: string[]): void {
    this.selectedInvestorTypes = investorTypes;
  }

  onFilterOptionTotalsChange(totals: FilterOptionTotals): void {
    this.filterOptionTotals = totals;
  }

  onMinFlowValueRangeChange(range: MinFlowRangeSelection): void {
    this.chartMinFlowLower = getMinFlowLowerBound(range);
    this.chartMaxFlowUpper = getMaxFlowUpperBound(range);
  }

  onAssetAllocationPinToggle(): void {
    this.isAssetAllocationPinned = !this.isAssetAllocationPinned;
  }

  onAssetFlowsPinToggle(): void {
    this.isAssetFlowsPinned = !this.isAssetFlowsPinned;
  }

  onFilterDropdownOpened(): void {
    this.forceCloseDimensionDropdown += 1;
  }

  onDimensionDropdownOpened(): void {
    this.forceCloseFiltersDropdown += 1;
  }

  onPinCard(cardId: string): void {
    // If card is already pinned, unpin it; otherwise, pin it
    const index = this.pinnedCardIds.indexOf(cardId);
    if (index > -1) {
      // Unpin: remove from pinned list (create new array reference for change detection)
      this.pinnedCardIds = this.pinnedCardIds.filter(id => id !== cardId);
    } else {
      // Pin: add to the beginning of pinned list (create new array reference for change detection)
      this.pinnedCardIds = [cardId, ...this.pinnedCardIds];
    }
    // Force change detection to ensure the UI updates
    this.cdr.detectChanges();
  }

  get filteredMarketFlowCards(): MarketFlowCard[] {
    // If no investor regions selected, return empty array
    if (!this.selectedInvestorRegions || this.selectedInvestorRegions.length === 0) {
      return [];
    }

    // If no product sub-types selected, return empty array
    if (!this.selectedProductSubTypes || this.selectedProductSubTypes.length === 0) {
      return [];
    }

    // If no data loaded yet, return empty array
    if (!this.rawAssetFlowsData || this.rawAssetFlowsData.length === 0) {
      return [];
    }

    // Filter data by all selected filters: investor region, investor type, product region, product type
    let filteredData = this.rawAssetFlowsData;

    // Filter by investor regions
    filteredData = filteredData.filter(record =>
      this.selectedInvestorRegions.includes(record.Investor_Region)
    );

    // Filter by investor type (Plan_Type or Investor_Types)
    if (this.selectedInvestorTypes && this.selectedInvestorTypes.length > 0) {
      filteredData = filteredData.filter(record => {
        const investorType = record.Plan_Type ?? record.Investor_Types;
        return investorType && this.selectedInvestorTypes.includes(investorType);
      });
    }

    // Filter by product region
    if (this.selectedProductRegions && this.selectedProductRegions.length > 0) {
      filteredData = filteredData.filter(record =>
        record.Product_Region != null && this.selectedProductRegions.includes(record.Product_Region)
      );
    }

    // Filter by product type (apply whenever user has selected product types)
    if (this.selectedProductTypes && this.selectedProductTypes.length > 0) {
      filteredData = filteredData.filter(record =>
        this.selectedProductTypes.includes(record.Product_Type)
      );
    }

    // Filter by time horizon (date range) - use the same timeHorizonRange as sankey
    // This ensures cards and sankey use the same date filtering
    if (this.timeHorizonRange && this.timeHorizonRange.start && this.timeHorizonRange.end) {
      const startDate = this.convertTimeHorizonToDate(this.timeHorizonRange.start);
      const endDate = this.convertTimeHorizonToDate(this.timeHorizonRange.end);
      
      if (startDate && endDate) {
        filteredData = filteredData.filter(record => {
          if (!record.Asset_Flow_Date) return false;
          const recordDate = record.Asset_Flow_Date;
          return recordDate >= startDate && recordDate <= endDate;
        });
      }
    } else {
      // Fallback: use getDateRangeForTimeHorizon if timeHorizonRange is not available
      const dateRange = this.getDateRangeForTimeHorizon(this.carouselTimeHorizon, this.carouselDataType);
      if (dateRange && dateRange.start && dateRange.end && dateRange.start !== dateRange.end) {
        filteredData = filteredData.filter(record => {
          if (!record.Asset_Flow_Date) return false;
          const recordDate = record.Asset_Flow_Date;
          return recordDate >= dateRange.start && recordDate <= dateRange.end;
        });
      }
    }

    // Aggregate by product sub-type
    // VALUE CALCULATION:
    // 1. Filter records by: selected investor regions + selected product types + selected product sub-types + time horizon
    // 2. For each Product_Sub_Type, sum all Asset_Flow_Value (which are in thousands)
    // 3. Convert to billions: divide by 1,000,000
    // 4. Result: Net flow = sum of all positive values - sum of all negative values (negative values are subtracted)
    const aggregatedData = new Map<string, { total: number; count: number; positiveSum: number; negativeSum: number }>();
    
    filteredData.forEach(record => {
      if (!this.selectedProductSubTypes.includes(record.Product_Sub_Type)) {
        return; // Skip if not in selected product sub-types
      }
      
      const existing = aggregatedData.get(record.Product_Sub_Type) || { total: 0, count: 0, positiveSum: 0, negativeSum: 0 };
      // Asset_Flow_Value is in thousands, convert to billions
      // Example: 1200000 (thousands) = 1.2 billion
      const valueInBillions = record.Asset_Flow_Value / 1000000;
      
      // Handle positive and negative values explicitly
      if (valueInBillions > 0) {
        // Positive value: add to total
        existing.total += valueInBillions;
        existing.positiveSum += valueInBillions;
      } else if (valueInBillions < 0) {
        // Negative value: subtract from total (minus it)
        existing.total += valueInBillions; // Adding negative = subtracting
        existing.negativeSum += Math.abs(valueInBillions);
      }
      // If valueInBillions is 0, we don't need to do anything
      
      existing.count += 1;
      aggregatedData.set(record.Product_Sub_Type, existing);
    });

    // Calculate previous period data for percentage change
    const previousDateRange = this.getPreviousPeriodDateRange(this.carouselTimeHorizon, this.carouselDataType);
    const previousAggregatedData = new Map<string, number>();
    
    if (previousDateRange) {
      let previousData = this.rawAssetFlowsData;
      // Apply same filters as current period
      previousData = previousData.filter(record =>
        this.selectedInvestorRegions.includes(record.Investor_Region)
      );
      if (this.selectedInvestorTypes && this.selectedInvestorTypes.length > 0) {
        previousData = previousData.filter(record => {
          const investorType = record.Plan_Type ?? record.Investor_Types;
          return investorType && this.selectedInvestorTypes.includes(investorType);
        });
      }
      if (this.selectedProductRegions && this.selectedProductRegions.length > 0) {
        previousData = previousData.filter(record =>
          record.Product_Region != null && this.selectedProductRegions.includes(record.Product_Region)
        );
      }
      if (this.selectedProductTypes && this.selectedProductTypes.length > 0) {
        previousData = previousData.filter(record =>
          this.selectedProductTypes.includes(record.Product_Type)
        );
      }
      
      // Use same date filtering logic as current period
      const prevStartDate = this.convertTimeHorizonToDate(previousDateRange.start);
      const prevEndDate = this.convertTimeHorizonToDate(previousDateRange.end);
      
      if (prevStartDate && prevEndDate) {
        previousData = previousData.filter(record => {
          if (!record.Asset_Flow_Date) return false;
          const recordDate = record.Asset_Flow_Date;
          return recordDate >= prevStartDate && recordDate <= prevEndDate;
        });
      }

      previousData.forEach(record => {
        if (!this.selectedProductSubTypes.includes(record.Product_Sub_Type)) {
          return;
        }
        const valueInBillions = record.Asset_Flow_Value / 1000000;
        const existing = previousAggregatedData.get(record.Product_Sub_Type) || 0;
        // Handle negative values: subtract them (minus them)
        previousAggregatedData.set(record.Product_Sub_Type, existing + valueInBillions);
      });
    }

    // Generate cards from aggregated data
    // Include all selected product sub-types, even if they have no data (show as 0)
    // First, find the maximum absolute total across all selected sub-types for normalization
    const maxAbsTotalAcrossSubTypes = this.selectedProductSubTypes.reduce((max, subType) => {
      const data = aggregatedData.get(subType);
      if (!data) return max;
      const absTotal = Math.abs(data.total);
      return absTotal > max ? absTotal : max;
    }, 0);

    const cards = this.selectedProductSubTypes.map((subType) => {
        const data = aggregatedData.get(subType) || { total: 0, count: 0, positiveSum: 0, negativeSum: 0 };
        const totalValue = data.total; // Net flow (sum of all positive and negative values)
        const previousValue = previousAggregatedData.get(subType) || 0;
        
        let percentageChange = 0;
        const hasPreviousData = previousDateRange !== null && previousDateRange !== undefined;
        
        if (hasPreviousData && previousValue !== 0) {
          // Standard calculation: change relative to previous period
          const change = totalValue - previousValue;
          const denominator = Math.abs(previousValue);
          percentageChange = (change / denominator) * 100;
        }
        // If there is no previous data or previous is 0, leave percentageChange at 0.

        const isPositive = totalValue >= 0;
        const valueColor: 'red' | 'green' = isPositive ? 'green' : 'red';
        const percentageColor: 'red' | 'green' = percentageChange >= 0 ? 'green' : 'red';
        const chartColor: 'red' | 'green' = isPositive ? 'green' : 'red';
        const borderColor = isPositive ? '#00bc7d' : '#fb2c36';

        // Generate unique ID
        const id = `${this.carouselDataType}-${this.carouselTimeHorizon.replace(/\s/g, '')}-${subType.replace(/\s/g, '-').replace(/\//g, '-')}`;

        // Format value
        const absValue = Math.abs(totalValue);
        const formattedValue = this.formatValue(absValue);

        // Format percentage
        const formattedPercentage = this.formatPercentage(Math.abs(percentageChange));

        // Determine AI confidence based on data quality
        const aiConfidence: 'high' | 'medium' | 'low' = data.count > 10 ? 'high' : data.count > 5 ? 'medium' : 'low';

        return {
          id,
          title: subType,
          value: isPositive ? `$${formattedValue}B` : `-$${formattedValue}B`,
          valueColor,
          percentageChange: percentageChange >= 0 ? `+${formattedPercentage}%` : `-${formattedPercentage}%`,
          percentageColor,
          metricLabel: 'Net Flow',
          aiConfidence,
          description: `${subType} showing ${isPositive ? 'positive' : 'negative'} market flow trends for ${this.carouselTimeHorizon}.`,
          chartColor,
          borderColor,
          timeHorizon: this.carouselTimeHorizon,
          dataType: this.carouselDataType,
          productSubType: subType
        };
      });

    // Sort cards: pinned cards first (in order of pinning), then others by absolute value
    return cards.sort((a, b) => {
      const aPinIndex = this.pinnedCardIds.indexOf(a.id);
      const bPinIndex = this.pinnedCardIds.indexOf(b.id);
      
      // Both pinned: maintain pin order (lower index = pinned earlier = appears first)
      if (aPinIndex > -1 && bPinIndex > -1) {
        return aPinIndex - bPinIndex;
      }
      // Only a is pinned: a comes first
      if (aPinIndex > -1) return -1;
      // Only b is pinned: b comes first
      if (bPinIndex > -1) return 1;
      
      // Neither pinned: sort by absolute value (descending - highest first)
      const aValue = this.parseValue(a.value);
      const bValue = this.parseValue(b.value);
      return Math.abs(bValue) - Math.abs(aValue);
    });
  }

  /**
   * Gets date range for a time horizon
   * @param timeHorizon - The selected time horizon (e.g., "Today", "+3 mo", "-6 mo")
   * @param dataType - 'historical' or 'forecasted'
   * @returns Date range object with start and end dates in "YYYY-MM" format, or null if not applicable
   */
  private getDateRangeForTimeHorizon(timeHorizon: string, dataType: 'historical' | 'forecasted'): { start: string; end: string } | null {
    // Get all unique dates from the data to determine available range
    const allDates = new Set<string>();
    this.rawAssetFlowsData.forEach(record => {
      if (record.Asset_Flow_Date) {
        allDates.add(record.Asset_Flow_Date);
      }
    });
    
    if (allDates.size === 0) return null;
    
    const sortedDates = Array.from(allDates).sort();
    
    // For simplicity, if time horizon is "Today" or forecasted, use most recent dates
    // For historical, use earlier dates
    // Since we're aggregating, we'll include all dates that match the period
    if (timeHorizon === 'Today' || (dataType === 'forecasted' && timeHorizon.startsWith('+'))) {
      // Use the most recent date(s) - for now, use all available dates
      // In a real scenario, you'd filter to specific months
      const latestDate = sortedDates[sortedDates.length - 1];
      return { start: latestDate, end: latestDate };
    } else if (dataType === 'historical' && timeHorizon.startsWith('-')) {
      // For historical, use earlier dates
      // For simplicity, use all dates up to the most recent
      const earliestDate = sortedDates[0];
      const latestDate = sortedDates[sortedDates.length - 1];
      return { start: earliestDate, end: latestDate };
    }
    
    // Default: use all available dates
    const earliestDate = sortedDates[0];
    const latestDate = sortedDates[sortedDates.length - 1];
    return { start: earliestDate, end: latestDate };
  }

  /**
   * Gets the previous period date range for comparison
   * @param timeHorizon - The current time horizon
   * @param dataType - 'historical' or 'forecasted'
   * @returns Previous period date range or null
   */
  private getPreviousPeriodDateRange(timeHorizon: string, dataType: 'historical' | 'forecasted'): { start: string; end: string } | null {
    const currentRange = this.getDateRangeForTimeHorizon(timeHorizon, dataType);
    if (!currentRange) return null;
    
    // Parse dates
    const [startYear, startMonth] = currentRange.start.split('-').map(Number);
    const [endYear, endMonth] = currentRange.end.split('-').map(Number);
    
    // Calculate period length in months
    const periodLength = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
    
    // Calculate previous period
    const prevEndDate = new Date(startYear, startMonth - 1 - 1, 1); // One month before start
    const prevStartDate = new Date(prevEndDate.getFullYear(), prevEndDate.getMonth() - periodLength + 1, 1);
    
    const prevStart = `${prevStartDate.getFullYear()}-${String(prevStartDate.getMonth() + 1).padStart(2, '0')}`;
    const prevEnd = `${prevEndDate.getFullYear()}-${String(prevEndDate.getMonth() + 1).padStart(2, '0')}`;
    
    return { start: prevStart, end: prevEnd };
  }

  /**
   * Formats a numeric value in billions with thousand separators and appropriate decimal places
   * @param value - The value in billions
   * @returns Formatted string (e.g., "124.8" or "57,644.15")
   */
  private formatValue(value: number): string {
    if (value === 0) return '0';
    const decimals = value < 0.1 ? 2 : value < 1 ? 1 : 1;
    return value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  /**
   * Converts time horizon string to target date in YYYY-MM format
   * Returns null if time horizon is invalid
   * Uses today's date as the base for calculations
   * @param horizon - The time horizon string (e.g., "Today", "+3 mo", "-6 mo")
   */
  private convertTimeHorizonToDate(horizon: string): string | null {
    // If it's already in YYYY-MM format, return it directly
    if (/^\d{4}-\d{2}$/.test(horizon.trim())) {
      return horizon.trim();
    }
    
    // Use today's date as the base
    const today = new Date();
    const baseYear = today.getFullYear();
    const baseMonth = today.getMonth() + 1; // getMonth() returns 0-11, so add 1
    
    if (horizon === 'Today') {
      // For "Today", return the current month
      const monthStr = String(baseMonth).padStart(2, '0');
      return `${baseYear}-${monthStr}`;
    }
    
    // Parse time horizon string (e.g., "+3 mo", "+6 mo", "-3 mo", "6mo", "9mo")
    // Support both formats: with/without space and with/without + prefix
    const normalized = horizon.trim().toLowerCase();
    let match = normalized.match(/^([+-]?)(\d+)\s*mo$/i);
    
    // If no match, try without "mo" suffix (e.g., "6mo", "9mo")
    if (!match) {
      match = normalized.match(/^([+-]?)(\d+)$/);
    }
    
    if (!match) {
      console.warn('Could not parse time horizon:', horizon);
      return null;
    }
    
    const isNegative = match[1] === '-';
    const months = parseInt(match[2], 10);
    
    // Calculate target date by adding/subtracting months from today
    const targetDate = new Date(baseYear, baseMonth - 1, 1); // Create date object (month is 0-indexed)
    
    if (isNegative) {
      targetDate.setMonth(targetDate.getMonth() - months);
    } else {
      targetDate.setMonth(targetDate.getMonth() + months);
    }
    
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth() + 1; // getMonth() returns 0-11, so add 1
    const monthStr = String(targetMonth).padStart(2, '0');
    
    return `${targetYear}-${monthStr}`;
  }

  /**
   * Formats a percentage value
   * @param value - The percentage value
   * @returns Formatted string (e.g., "12.3" or "5.1")
   */
  private formatPercentage(value: number): string {
    if (value === 0) return '0.0';
    if (value < 0.1) {
      return value.toFixed(2);
    } else {
      return value.toFixed(1);
    }
  }

  /**
   * Parses a value string to a number
   * @param valueStr - String like "$124.8B" or "-$98.4B"
   * @returns Numeric value
   */
  private parseValue(valueStr: string): number {
    const cleaned = valueStr.replace(/[$,B]/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Extracts the absolute numeric value from a percentage change string
   * @param percentageChange - String like "+3.5%" or "-2.1%"
   * @returns Absolute numeric value (e.g., 3.5 for "+3.5%" or "-3.5%")
   */
  private getAbsolutePercentageValue(percentageChange: string): number {
    // Remove the % sign and + or - sign, then parse as float
    const numericValue = parseFloat(percentageChange.replace(/[+\-%]/g, ''));
    return isNaN(numericValue) ? 0 : Math.abs(numericValue);
  }

  private getProductTypeFromSubType(subType: string): string | null {
    // Map sub-types to their product types
    const subTypeToProductType: Record<string, string> = {
      'US Equity Small Cap': 'Equity',
      'US Equity Large Cap': 'Equity',
      'Global Equity': 'Equity',
      'Emerging Markets': 'Equity',
      'Mid Cap Growth': 'Equity',
      'Core Investment Grade': 'Fixed Income',
      'Municipal Bond': 'Fixed Income',
      'Global Bonds': 'Fixed Income',
      'Short Duration': 'Fixed Income',
      'High Yield Bonds': 'Fixed Income',
      'Government/Sovereign': 'Fixed Income',
      'Credit Long Duration': 'Fixed Income',
      'Hedge Funds': 'Alternatives',
      'Crypto': 'Alternatives',
      'Commodities': 'Alternatives',
      'Money Market Funds': 'Cash',
      'Treasury Bills': 'Cash',
      'Bank Deposits/CDs': 'Cash',
      'Foreign Currency/FFX': 'Cash',
      'Private Credit': 'Private Markets',
      'Venture Capital': 'Private Markets',
      'Co-Investment': 'Private Markets',
      'Private Equity': 'Private Markets',
      'Single-family homes': 'Real Estate',
      'Multi-family homes': 'Real Estate',
      'Condominiums': 'Real Estate',
      'Townhouses': 'Real Estate',
      'Overlay Strategies': 'Other / Specialized',
      'Factor Based Investing': 'Other / Specialized',
      'Diversified Growth Funds': 'Multi-Asset',
      'Target Date Funds': 'Multi-Asset'
    };

    return subTypeToProductType[subType] || null;
  }

}

