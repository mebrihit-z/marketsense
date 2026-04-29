/* eslint-disable */
import {
  Component,
  OnInit,
  AfterViewInit,
  ChangeDetectorRef,
  ViewChild,
  ElementRef,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FiltersBarComponent } from '../../shared/components/filters/filters-bar/filters-bar.component';
import type { FilterOptionTotals } from '../../shared/components/filters/filters-bar/filters-bar.component';
import { FeaturedMarketFlowsCarouselComponent } from '../../shared/components/market-flows-carousel/market-flows-carousel.component';
import { MarketFlowCard } from '../../shared/components/market-flows-carousel/market-flow-card/market-flow-card.component';
import { AssetFlowsComponent } from '../../shared/components/asset-flows/asset-flows.component';
import { AssetAllocationComponent } from '../../shared/components/asset-allocation/asset-allocation.component';
import HeaderComponent from '../../shared/components/header/header.component';
import { DisclaimerBannerComponent } from '../../shared/components/disclaimer-banner/disclaimer-banner.component';
import DisclosureModalComponent from '../../shared/components/disclosure-modal/disclosure-modal.component';
import WelcomeSectionComponent from '../../shared/components/welcome-section/welcome-section.component';
import AskMarketsenseSectionComponent from '../../shared/components/ask-marketsense-section/ask-marketsense-section.component';
import AskMarketsenseStickyButtonComponent from '../../shared/components/ask-marketsense-sticky-button/ask-marketsense-sticky-button.component';
import {
  type AssetFlowRecord,
  filterAssetFlowsByDataTypeResolvingSpan,
} from '../../shared/utils/asset-flows-to-sankey.util';
import {
  assetFlowDateToYearMonthUtc,
  assetFlowQuarterInTimeWindow,
} from '../../shared/utils/asset-flow-time-window.util';
import { AssetFlowsDataService } from '../../core/services/asset-flows-data.service';
import { AssetFlowHistoricAnchorService } from '../../core/services/asset-flow-historic-anchor.service';
import {
  getMinFlowLowerBound,
  getMaxFlowUpperBound,
  createDefaultMinFlowRange,
  type MinFlowRangeSelection,
} from '../../shared/utils/min-flow-value-options.util';
import {
  formatFlowCurrencyUsd,
  parseFlowDisplayValueToDollars,
} from '../../shared/utils/flow-currency-format.util';
import { horizonEndpointPercentChangeUsd } from '../../shared/utils/horizon-endpoint-percent-change.util';
import type {
  SavedChartHierarchyDimensions,
  SavedViewChartDimensions,
} from '../../core/services/saved-views.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [HeaderComponent, DisclaimerBannerComponent, DisclosureModalComponent, CommonModule, FiltersBarComponent, FeaturedMarketFlowsCarouselComponent, AssetFlowsComponent, AssetAllocationComponent, WelcomeSectionComponent, AskMarketsenseSectionComponent, AskMarketsenseStickyButtonComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export default class DashboardComponent implements OnInit, AfterViewInit {
  showDisclaimerBanner = true;
  isDisclaimerBannerAtBottom = false;
  isDisclosureModalOpen = false;

  @ViewChild('filtersSticky', { read: ElementRef }) private filtersStickyRef?: ElementRef<HTMLElement>;
  @ViewChild(AssetFlowsComponent) private assetFlowsComp?: AssetFlowsComponent;
  @ViewChild(AssetAllocationComponent) private assetAllocComp?: AssetAllocationComponent;

  /** True while the filters strip is pinned (sticky) at the top of the viewport. */
  isFiltersStickyEngaged = false;
  private stickyStartScrollY = 0;
  private readonly stickyReleaseToTopPx = 6;

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

  /** Passed to Save View when “include dimensions” is checked. */
  assetFlowsChartDimensions: SavedChartHierarchyDimensions | null = null;
  assetAllocationChartDimensions: SavedChartHierarchyDimensions | null = null;

  // Raw asset flows data
  rawAssetFlowsData: AssetFlowRecord[] = [];

  constructor(
    private cdr: ChangeDetectorRef,
    private assetFlowsData: AssetFlowsDataService,
    private historicAnchor: AssetFlowHistoricAnchorService
  ) {}

  ngOnInit(): void {
    this.loadAssetFlowsData();
  }

  openDisclosureModal(): void {
    this.isDisclosureModalOpen = true;
  }

  closeDisclosureModal(): void {
    this.isDisclosureModalOpen = false;
  }

  onDisclosureAcknowledged(): void {
    this.isDisclosureModalOpen = false;
    this.isDisclaimerBannerAtBottom = true;
    this.showDisclaimerBanner = true;
  }

  dismissDisclaimerBanner(): void {
    this.showDisclaimerBanner = false;
  }

  ngAfterViewInit(): void {
    queueMicrotask(() => {
      this.computeStickyStartScrollY();
      this.updateFiltersStickyEngaged();
    });
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.updateFiltersStickyEngaged();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.computeStickyStartScrollY();
    this.updateFiltersStickyEngaged();
  }

  private updateFiltersStickyEngaged(): void {
    const el = this.filtersStickyRef?.nativeElement;
    if (!el || typeof window === 'undefined') {
      return;
    }
    const currentScrollY = window.scrollY || 0;
    // Use a document-space threshold + hysteresis to avoid sticky flapping and scroll bounce.
    const engageAt = this.stickyStartScrollY;
    // Keep sticky mode latched while scrolling down the page; release only near top.
    const engaged = this.isFiltersStickyEngaged
      ? currentScrollY > this.stickyReleaseToTopPx
      : currentScrollY >= engageAt;
    if (engaged !== this.isFiltersStickyEngaged) {
      this.isFiltersStickyEngaged = engaged;
      this.cdr.markForCheck();
    }
  }

  private computeStickyStartScrollY(): void {
    const el = this.filtersStickyRef?.nativeElement;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const absoluteTop = rect.top + (window.scrollY || 0);
    this.stickyStartScrollY = Math.max(0, Math.round(absoluteTop));
  }

  private loadAssetFlowsData(): void {
    this.assetFlowsData.getAssetFlows().subscribe({
      next: (data) => {
        this.rawAssetFlowsData = data;
        this.historicAnchor.rebuild(data);
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
    const visible = new Set(this.filteredMarketFlowCards.map(c => c.id));
    this.pinnedCardIds = this.pinnedCardIds.filter(id => visible.has(id));
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

  onAssetFlowsChartDimensionsSnapshot(s: SavedChartHierarchyDimensions): void {
    this.assetFlowsChartDimensions = { ...s };
  }

  onAssetAllocationChartDimensionsSnapshot(s: SavedChartHierarchyDimensions): void {
    this.assetAllocationChartDimensions = { ...s };
  }

  /**
   * Fired after the filters bar applies a saved view that includes
   * {@link SavedView#chartDimensions}; defer so filter inputs have reached the chart components.
   */
  @HostListener('window:marketsenseApplyChartDimensions', ['$event'])
  onApplyChartDimensions(ev: Event): void {
    const custom = ev as CustomEvent<SavedViewChartDimensions>;
    const detail = custom?.detail;
    if (!detail || typeof detail !== 'object') return;
    setTimeout(() => {
      if (detail.assetFlows) {
        this.assetFlowsComp?.applySavedHierarchyDimensions(detail.assetFlows);
      }
      if (detail.assetAllocation) {
        this.assetAllocComp?.applySavedHierarchyDimensions(detail.assetAllocation);
      }
      this.cdr.markForCheck();
    }, 0);
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

  /**
   * Raw rows matching the filters bar (dimensions + current time window), for carousel detail charts.
   * Value-range applies to aggregated card net, not per-row (see {@link filteredMarketFlowCards}).
   */
  get filterBarScopedAssetFlowsData(): AssetFlowRecord[] {
    if (!this.selectedInvestorRegions?.length || !this.selectedProductSubTypes?.length) {
      return [];
    }
    if (!this.rawAssetFlowsData?.length) {
      return [];
    }
    let data = this.applyFilterBarDimensions(this.rawAssetFlowsData);
    data = filterAssetFlowsByDataTypeResolvingSpan(
      data,
      this.carouselDataType,
      this.timeHorizonRange?.start,
      this.timeHorizonRange?.end,
      this.historicAnchor.getAnchorYearMonth()
    );
    data = this.applyCurrentTimeWindowToRecords(data);
    return data;
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

    let filteredData = this.applyFilterBarDimensions(this.rawAssetFlowsData);
    filteredData = filterAssetFlowsByDataTypeResolvingSpan(
      filteredData,
      this.carouselDataType,
      this.timeHorizonRange?.start,
      this.timeHorizonRange?.end,
      this.historicAnchor.getAnchorYearMonth()
    );
    filteredData = this.applyCurrentTimeWindowToRecords(filteredData);

    // Aggregate by product sub-type (rows match filters bar + time window). Value-range filter applies
    // to each card's aggregated net (|netFlowUsd|), not per raw row — matches Sankey edge totals.
    // VALUE CALCULATION:
    // 1. Filter records by: dimensions, time horizon (see applyFilterBarDimensions / applyCurrentTimeWindowToRecords)
    // 2. For each Product_Sub_Type, sum Asset_Flow_Value (USD, same unit as stored)
    // 3. Totals stay in USD; compact K/M/B/T is formatting-only
    // 4. Result: Net flow = sum of all positive values - sum of all negative values (negative values are subtracted)
    const aggregatedData = new Map<
      string,
      { total: number; count: number; positiveSum: number; negativeSum: number; nClientsTotal: number }
    >();

    filteredData.forEach(record => {
      const existing = aggregatedData.get(record.Product_Sub_Type) || {
        total: 0,
        count: 0,
        positiveSum: 0,
        negativeSum: 0,
        nClientsTotal: 0,
      };
      const valueUsd = record.Asset_Flow_Value;
      const rowClients = record.N_Clients ?? 0;
      existing.nClientsTotal += rowClients;

      // Handle positive and negative values explicitly
      if (valueUsd > 0) {
        // Positive value: add to total
        existing.total += valueUsd;
        existing.positiveSum += valueUsd;
      } else if (valueUsd < 0) {
        // Negative value: subtract from total (minus it)
        existing.total += valueUsd; // Adding negative = subtracting
        existing.negativeSum += Math.abs(valueUsd);
      }
      // If valueUsd is 0, we don't need to do anything
      
      existing.count += 1;
      aggregatedData.set(record.Product_Sub_Type, existing);
    });

    // % change = ((New − Old) / Old) × 100 — Old = net flow at horizon start, New = net flow at horizon end
    const horizonWin = this.getCurrentAggregationWindowYearMonths();
    const netFlowAtHorizonStart = new Map<string, number>();
    const netFlowAtHorizonEnd = new Map<string, number>();
    if (horizonWin) {
      let endpointBase = this.applyFilterBarDimensions(this.rawAssetFlowsData);
      endpointBase = filterAssetFlowsByDataTypeResolvingSpan(
        endpointBase,
        this.carouselDataType,
        this.timeHorizonRange?.start,
        this.timeHorizonRange?.end,
        this.historicAnchor.getAnchorYearMonth()
      );
      const { start: startYm, end: endYm } = horizonWin;
      const sumBySubType = (rows: AssetFlowRecord[], into: Map<string, number>): void => {
        for (const record of rows) {
          const v = record.Asset_Flow_Value;
          into.set(record.Product_Sub_Type, (into.get(record.Product_Sub_Type) ?? 0) + v);
        }
      };
      sumBySubType(
        endpointBase.filter(r => assetFlowQuarterInTimeWindow(r.Asset_Flow_Date, startYm, startYm)),
        netFlowAtHorizonStart
      );
      sumBySubType(
        endpointBase.filter(r => assetFlowQuarterInTimeWindow(r.Asset_Flow_Date, endYm, endYm)),
        netFlowAtHorizonEnd
      );
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
        const data = aggregatedData.get(subType) || {
          total: 0,
          count: 0,
          positiveSum: 0,
          negativeSum: 0,
          nClientsTotal: 0,
        };
        const totalValue = data.total; // Net flow (sum of all positive and negative values)
        const oldValue = netFlowAtHorizonStart.get(subType) ?? 0;
        const newValue = netFlowAtHorizonEnd.get(subType) ?? 0;

        const endpointPct =
          horizonWin != null ? horizonEndpointPercentChangeUsd(oldValue, newValue) : null;
        let percentageChangeStr: string;
        let percentageColor: 'red' | 'green' | 'neutral';
        if (endpointPct == null) {
          percentageChangeStr = '—';
          percentageColor = 'neutral';
        } else {
          const formattedPercentage = this.formatPercentage(Math.abs(endpointPct));
          percentageChangeStr =
            endpointPct >= 0 ? `+${formattedPercentage}%` : `-${formattedPercentage}%`;
          percentageColor = endpointPct >= 0 ? 'green' : 'red';
        }

        const isPositive = totalValue >= 0;
        const valueColor: 'red' | 'green' = isPositive ? 'green' : 'red';
        const chartColor: 'red' | 'green' = isPositive ? 'green' : 'red';
        const borderColor = isPositive ? '#00bc7d' : '#fb2c36';

        // Generate unique ID
        const id = `${this.carouselDataType}-${this.carouselTimeHorizon.replace(/\s/g, '')}-${subType.replace(/\s/g, '-').replace(/\//g, '-')}`;

        // Format value (compact $T/$B/$M/$K via shared util, same as Sankey/Treemap)
        const formattedCardValue = formatFlowCurrencyUsd(totalValue);

        // Determine AI confidence based on data quality
        const aiConfidence: 'high' | 'medium' | 'low' = data.count > 10 ? 'high' : data.count > 5 ? 'medium' : 'low';

        return {
          id,
          title: subType,
          value: formattedCardValue,
          netFlowUsd: totalValue,
          valueColor,
          percentageChange: percentageChangeStr,
          percentageColor,
          metricLabel: 'Net Flow',
          aiConfidence,
          description: `${subType} showing ${isPositive ? 'positive' : 'negative'} market flow trends for ${this.carouselTimeHorizon}.`,
          chartColor,
          borderColor,
          timeHorizon: this.carouselTimeHorizon,
          timeHorizonStart: this.timeHorizonRange?.start,
          timeHorizonEnd: this.timeHorizonRange?.end,
          dataType: this.carouselDataType,
          productSubType: subType,
          nClientsTotal: data.nClientsTotal,
        };
      });

    const cardsInValueRange = cards.filter(c =>
      this.absoluteUsdPassesChartValueRange(Math.abs(c.netFlowUsd ?? 0))
    );

    // Sort cards: pinned cards first (in order of pinning), then others by absolute value
    return cardsInValueRange.sort((a, b) => {
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

  /** Same dimension rules as {@link AssetFlowsComponent.filterDataByFilterBar} plus selected product sub-types. */
  private applyFilterBarDimensions(records: AssetFlowRecord[]): AssetFlowRecord[] {
    if (!records?.length) return records;
    let result = records;
    result = result.filter(r => this.selectedInvestorRegions.includes(r.Investor_Region));
    if (this.selectedInvestorTypes?.length) {
      result = result.filter(r => {
        const t = r.Plan_Type ?? r.Investor_Types;
        return t != null && this.selectedInvestorTypes.includes(t);
      });
    }
    if (this.selectedProductRegions?.length) {
      result = result.filter(
        r => r.Product_Region != null && this.selectedProductRegions.includes(r.Product_Region)
      );
    }
    if (this.selectedProductTypes?.length) {
      result = result.filter(r => this.selectedProductTypes.includes(r.Product_Type));
    }
    if (this.selectedProductSubTypes?.length) {
      result = result.filter(r => this.selectedProductSubTypes.includes(r.Product_Sub_Type));
    }
    return result;
  }

  private applyCurrentTimeWindowToRecords(records: AssetFlowRecord[]): AssetFlowRecord[] {
    if (!records?.length) return records;
    const win = this.getCurrentAggregationWindowYearMonths();
    if (win) {
      return records.filter(record =>
        assetFlowQuarterInTimeWindow(record.Asset_Flow_Date, win.start, win.end)
      );
    }
    return records;
  }

  /**
   * YYYY-MM window for card totals and % change (slider when set; else min/max flow dates as YYYY-MM).
   */
  private getCurrentAggregationWindowYearMonths(): { start: string; end: string } | null {
    if (this.timeHorizonRange?.start && this.timeHorizonRange?.end) {
      const s = this.historicAnchor.horizonToYearMonth(this.timeHorizonRange.start.trim());
      const e = this.historicAnchor.horizonToYearMonth(this.timeHorizonRange.end.trim());
      if (!s || !e) return null;
      return s <= e ? { start: s, end: e } : { start: e, end: s };
    }
    const dateRange = this.getDateRangeForTimeHorizon(this.carouselTimeHorizon, this.carouselDataType);
    if (!dateRange?.start || !dateRange?.end) return null;
    const sYm = this.flowDateOrLabelToYearMonth(dateRange.start);
    const eYm = this.flowDateOrLabelToYearMonth(dateRange.end);
    if (!sYm || !eYm) return null;
    if (sYm === eYm) return null;
    return sYm <= eYm ? { start: sYm, end: eYm } : { start: eYm, end: sYm };
  }

  private flowDateOrLabelToYearMonth(value: string): string | null {
    const t = value.trim();
    if (/^\d{4}-\d{2}$/.test(t)) return t;
    return assetFlowDateToYearMonthUtc(t);
  }

  /**
   * Filters bar value range (min/max in **billions USD**) applied to an absolute USD amount.
   * Used for market-flow cards by aggregated |net|; Sankey/Treemap use link-level filtering separately.
   */
  private absoluteUsdPassesChartValueRange(absDollars: number): boolean {
    const minVal = this.chartMinFlowLower ?? 0;
    const maxVal = this.chartMaxFlowUpper;
    const hasMin = minVal > 0;
    const hasMax = maxVal != null && Number.isFinite(maxVal as number);
    if (!hasMin && !hasMax) return true;
    const minDollars = hasMin ? minVal * 1_000_000_000 : 0;
    const maxDollars = hasMax ? (maxVal as number) * 1_000_000_000 : Infinity;
    if (hasMin && absDollars < minDollars) return false;
    if (hasMax && absDollars > maxDollars) return false;
    return true;
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
    if (timeHorizon === '0' || timeHorizon === 'Today' || (dataType === 'forecasted' && timeHorizon.startsWith('+'))) {
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
   * Parses a card value string to USD (signed), including compact $T/$B/$M/$K.
   */
  private parseValue(valueStr: string): number {
    const d = parseFlowDisplayValueToDollars(valueStr);
    return Number.isFinite(d) ? d : 0;
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

