/* eslint-disable */
import { Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TreemapCellModalComponent, TreemapCellData } from '../charts/treemap-cell-modal/treemap-cell-modal.component';
import { TreemapComponent } from '../charts/treemap/treemap.component';
import TitleComponent from '../title/title.component';
import { FlowDimensionsComponent, type FlowDimension } from '../flow-dimensions/flow-dimensions.component';
import { convertAssetFlowsToSankey, type AssetFlowRecord, type SankeyData, type AssetFlowDimensionField, type SankeyDimensionConfig } from '../../utils/asset-flows-to-sankey.util';
import { AssetFlowsDataService } from '../../../core/services/asset-flows-data.service';
import { 
  aggregateSankeyDataByGlobal, 
  filterSankeyData 
} from '../../utils/sankey-data.utils';

export interface TreemapNode {
  id: string;
  label: string;
  value: number;
  percentage: number;
  color: 'green' | 'red' | 'neutral';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TreemapRegion {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children: TreemapNode[];
}

@Component({
  selector: 'app-asset-allocation',
  standalone: true,
  imports: [CommonModule, TreemapCellModalComponent, TreemapComponent, TitleComponent, FlowDimensionsComponent],
  templateUrl: './asset-allocation.component.html',
  styleUrl: './asset-allocation.component.scss'
})
export class AssetAllocationComponent implements OnInit, OnChanges {
  @Input() selectedProductTypes: string[] = [];
  @Input() selectedProductRegions: string[] = [];
  @Input() selectedProductSubTypes: string[] = [];
  @Input() selectedInvestorRegions: string[] = [];
  @Input() selectedInvestorTypes: string[] = [];
  @Input() totalProductTypes: number = 0;
  @Input() totalProductSubTypes: number = 0;
  @Input() totalInvestorRegions: number = 0;
  @Input() totalInvestorTypes: number = 0;
  @Input() totalProductRegions: number = 0;
  @Input() timeHorizon: string = '+9 mo';
  @Input() timeHorizonStart?: string;
  @Input() timeHorizonEnd?: string;
  @Input() forceCloseDimensionDropdown = 0;
  @Output() pinToggle = new EventEmitter<void>();
  @Output() dimensionDropdownOpened = new EventEmitter<void>();
  
  // View state
  viewMode: 'treemap' | 'packing-circles' = 'treemap';
  isPinned: boolean = false;
  
  
  // Available dimensions for drag and drop
  availableDimensions: FlowDimension[] = [
    { id: 'investor-region', label: 'Investor Region', count: 0, active: true },
    { id: 'investor-type', label: 'Investor Type', count: 0, active: true },
    { id: 'product-region', label: 'Product Region', count: 0, active: true },
    { id: 'product-type', label: 'Product Type', count: 0, active: true },
    { id: 'product-sub-types', label: 'Product Sub-Types', count: 0, active: true },
  ];

  // Selected dimensions for drop zones
  selectedDimension1: FlowDimension | null = null;
  selectedDimension2: FlowDimension | null = null;
  selectedDimension3: FlowDimension | null = null;

  // Modal state
  showCellModal: boolean = false;
  selectedCellData: TreemapCellData | null = null;
  
  // Treemap data map (similar to asset-flows)
  private treemapDataMap = new Map<string, SankeyData>();
  regionDataArray: Array<{
    key: string;
    data: SankeyData;
    investorRegions: string[];
  }> = [];
  
  // Cached arrays to avoid creating new arrays in template
  cachedSelectedProductTypes: string[] = [];
  cachedSelectedProductSubTypes: string[] = [];
  
  // Data loading
  private rawAssetFlowsData?: AssetFlowRecord[];
  
  // Treemap regions data
  treemapRegions: TreemapRegion[] = [
    {
      id: 'us',
      name: 'United States',
      x: 0.67,
      y: 1.6,
      width: 38.89,
      height: 96.8,
      children: [
        { id: 'us-equity', label: 'Equity', value: 285, percentage: 6.8, color: 'green', x: 1.17, y: 6.6, width: 14.49, height: 95.2 },
        { id: 'us-fixed', label: 'Fixed Income', value: 215, percentage: 3.5, color: 'green', x: 15.66, y: 6.6, width: 9.28, height: 44.45 },
        { id: 'us-private', label: 'Private Equ.', value: 95, percentage: 12.5, color: 'green', x: 15.66, y: 48.95, width: 9.07, height: 49.25 },
        { id: 'us-realestate', label: 'Real Estate', value: 95, percentage: -7.2, color: 'red', x: 24.73, y: 48.95, width: 6.21, height: 30.56 },
        { id: 'us-alternatives', label: 'Alternatives', value: 55, percentage: 9.8, color: 'green', x: 24.73, y: 79.51, width: 6.21, height: 18.69 }
      ]
    },
    {
      id: 'europe',
      name: 'Europe',
      x: 39.56,
      y: 1.6,
      width: 32.63,
      height: 96.8,
      children: [
        { id: 'eu-fixed', label: 'Fixed Income', value: 235, percentage: 4.8, color: 'green', x: 40.06, y: 6.6, width: 11.75, height: 33.73 },
        { id: 'eu-equity', label: 'Equity', value: 195, percentage: 2.5, color: 'green', x: 40.06, y: 40.67, width: 16.07, height: 57.13 },
        { id: 'eu-alternatives', label: 'Alternatives', value: 105, percentage: 9.5, color: 'green', x: 55.87, y: 40.67, width: 10.19, height: 30.22 },
        { id: 'eu-infrastructure', label: 'Infrastruct.', value: 58, percentage: 7.8, color: 'green', x: 55.87, y: 71.11, width: 5.87, height: 27.09 },
        { id: 'eu-realestate', label: 'Real Estate', value: 32, percentage: -4.5, color: 'red', x: 66.06, y: 71.11, width: 5.87, height: 27.09 }
      ]
    },
    {
      id: 'asia',
      name: 'Asia Pacific',
      x: 72.19,
      y: 1.6,
      width: 27.14,
      height: 96.8,
      children: [
        { id: 'asia-equity', label: 'Equity', value: 198, percentage: -0.8, color: 'neutral', x: 72.69, y: 6.6, width: 26.14, height: 34.5 },
        { id: 'asia-fixed', label: 'Fixed Income', value: 168, percentage: 2.2, color: 'green', x: 72.69, y: 41.1, width: 13.97, height: 56.7 },
        { id: 'asia-alternatives', label: 'Alternatives', value: 85, percentage: 6.5, color: 'green', x: 86.33, y: 41.1, width: 12.5, height: 30.96 },
        { id: 'asia-realestate', label: 'Real Estate', value: 69, percentage: -3.2, color: 'red', x: 86.33, y: 72.06, width: 12.5, height: 25.74 }
      ]
    }
  ];

  constructor(
    private assetFlowsData: AssetFlowsDataService
  ) {}

  ngOnInit(): void {
    this.updateDimensions();
    // Set default dimensions
    this.selectedDimension1 = this.availableDimensions.find(d => d.id === 'investor-region') || null;
    this.selectedDimension2 = this.availableDimensions.find(d => d.id === 'product-type') || null;
    this.selectedDimension3 = this.availableDimensions.find(d => d.id === 'product-sub-types') || null;
    
    // Load data
    this.loadData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedProductTypes'] || changes['selectedProductRegions'] || changes['selectedProductSubTypes'] ||
        changes['selectedInvestorRegions'] || changes['selectedInvestorTypes'] ||
        changes['totalProductTypes'] || changes['totalProductSubTypes'] ||
        changes['totalInvestorRegions'] || changes['totalInvestorTypes'] ||
        changes['totalProductRegions']) {
      this.updateDimensions();
    }
    
    // Handle data updates when filters or time horizon change
    const filterChanged = changes['selectedInvestorRegions'] || 
                          changes['selectedProductTypes'] || 
                          changes['selectedProductSubTypes'];
    const timeHorizonChanged = changes['timeHorizon'] || 
                               changes['timeHorizonStart'] || 
                               changes['timeHorizonEnd'];
    
    if (filterChanged || timeHorizonChanged) {
      if (this.rawAssetFlowsData) {
        this.updateTreemapData();
      }
    }
    
    // Log time horizon changes for debugging
    if (timeHorizonChanged) {
    }
  }

  private updateDimensions(): void {
    const productRegionDimension = this.availableDimensions.find(d => d.id === 'product-region');
    if (productRegionDimension) {
      productRegionDimension.count = this.selectedProductRegions.length;
      productRegionDimension.total = this.totalProductRegions;
    }

    const productTypeDimension = this.availableDimensions.find(d => d.id === 'product-type');
    if (productTypeDimension) {
      productTypeDimension.count = this.selectedProductTypes.length;
      productTypeDimension.total = this.totalProductTypes;
    }

    const productSubTypeDimension = this.availableDimensions.find(d => d.id === 'product-sub-types');
    if (productSubTypeDimension) {
      productSubTypeDimension.count = this.selectedProductSubTypes.length;
      productSubTypeDimension.total = this.totalProductSubTypes;
    }

    const investorRegionDimension = this.availableDimensions.find(d => d.id === 'investor-region');
    if (investorRegionDimension) {
      investorRegionDimension.count = this.selectedInvestorRegions.length;
      investorRegionDimension.total = this.totalInvestorRegions;
    }

    const investorTypeDimension = this.availableDimensions.find(d => d.id === 'investor-type');
    if (investorTypeDimension) {
      investorTypeDimension.count = this.selectedInvestorTypes.length;
      investorTypeDimension.total = this.totalInvestorTypes;
    }
  }


  /**
   * Gets the values array for a given dimension ID.
   * @param dimensionId - The dimension ID to get values for.
   * @returns Array of selected values for the dimension.
   */
  getDimensionValues(dimensionId: string | null): string[] {
    if (!dimensionId) return [];
    
    switch (dimensionId) {
      case 'product-region':
        return this.selectedProductRegions;
      case 'product-type':
        return this.selectedProductTypes;
      case 'product-sub-types':
        return this.selectedProductSubTypes;
      case 'investor-region':
        return this.selectedInvestorRegions;
      case 'investor-type':
        return this.selectedInvestorTypes;
      default:
        return [];
    }
  }

  onFlowDimensionChange(event: { selectId: 'dimension1' | 'dimension2' | 'dimension3'; dimension: FlowDimension | null }): void {
    const { selectId, dimension } = event;
    if (selectId === 'dimension1') {
      this.selectedDimension1 = dimension;
    } else if (selectId === 'dimension2') {
      this.selectedDimension2 = dimension;
    } else {
      this.selectedDimension3 = dimension;
    }
    if (this.rawAssetFlowsData) {
      this.updateTreemapData();
    }
  }

  private mapDimensionIdToField(id: string): AssetFlowDimensionField {
    switch (id) {
      case 'investor-region':
        return 'Investor_Region';
      case 'investor-type':
        return 'Plan_Type';
      case 'product-region':
        return 'Product_Region';
      case 'product-type':
        return 'Product_Type';
      case 'product-sub-types':
        return 'Product_Sub_Type';
      default:
        return 'Product_Type';
    }
  }

  private getSankeyDimensionConfig(): SankeyDimensionConfig {
    const dim1Id = this.selectedDimension1?.id || 'investor-region';
    const dim2Id = this.selectedDimension2?.id || 'product-type';
    const dim3Id = this.selectedDimension3?.id || 'product-sub-types';
    return {
      superField: this.mapDimensionIdToField(dim1Id),
      parentField: this.mapDimensionIdToField(dim2Id),
      subField: dim3Id === 'none' ? 'none' : this.mapDimensionIdToField(dim3Id),
    };
  }

  onPackingCirclesClick(): void {
    this.viewMode = 'packing-circles';
  }

  onDimensionReorder(event: any): void {
    // TODO: Implement drag and drop reordering
  }

  formatCurrency(value: number): string {
    return `$${value}B`;
  }

  formatPercentage(value: number): string {
    return `${value > 0 ? '+' : ''}${value}%`;
  }

  getNodeColor(color: 'green' | 'red' | 'neutral'): string {
    switch (color) {
      case 'green':
        return '#86efac';
      case 'red':
        return '#fca5a5';
      case 'neutral':
        return '#e8e9eb';
      default:
        return '#e8e9eb';
    }
  }

  getNodeBorderColor(color: 'green' | 'red' | 'neutral'): string {
    switch (color) {
      case 'green':
        return '#10b981';
      case 'red':
        return '#ef4444';
      case 'neutral':
        return '#9ca3af';
      default:
        return '#9ca3af';
    }
  }

  onNodeClick(node: TreemapNode): void {
    // TODO: Implement drill-down functionality
  }

  onPinClick(): void {
    this.isPinned = !this.isPinned;
    this.pinToggle.emit();
  }

  onTreemapCellClick(cellData: TreemapCellData): void {
    this.selectedCellData = cellData;
    this.showCellModal = true;
  }

  onCloseModal(): void {
    this.showCellModal = false;
    this.selectedCellData = null;
  }

  onAskAI(): void {
    // TODO: Implement AI chat functionality
    // You can emit an event or navigate to AI chat here
  }

  /**
   * Loads asset flows data from the central data service (JSON or backend API via environment).
   */
  private loadData(): void {
    this.assetFlowsData.getAssetFlows().subscribe({
      next: (assetFlows: AssetFlowRecord[]) => {
        try {
          this.rawAssetFlowsData = assetFlows;
          this.updateTreemapData();
        } catch (error: unknown) {
          console.error('Error loading asset flows data:', error);
        }
      },
      error: (error: unknown) => {
        console.error('Error loading asset flows data:', error);
      }
    });
  }

  /**
   * Updates treemap data based on current filters, time horizon, and flow dimensions.
   * Dimension 1 = super, Dimension 2 = parent, Dimension 3 = leaf (or 'none').
   */
  private updateTreemapData(): void {
    if (!this.rawAssetFlowsData) {
      console.warn('AssetAllocation: No raw asset flows data available');
      return;
    }

    if (!this.selectedInvestorRegions || this.selectedInvestorRegions.length === 0) {
      console.warn('AssetAllocation: No investor regions selected');
      this.treemapDataMap.clear();
      this.regionDataArray = [];
      return;
    }

    let filteredData = this.filterDataByTimeHorizon(this.rawAssetFlowsData);
    if (!filteredData || filteredData.length === 0) {
      this.treemapDataMap.clear();
      this.regionDataArray = [];
      return;
    }

    const dimensionConfig = this.getSankeyDimensionConfig();
    const isSuperInvestorRegion = this.selectedDimension1?.id === 'investor-region';

    if (!isSuperInvestorRegion) {
      const hasGlobal = this.selectedInvestorRegions.includes('Global');
      if (!hasGlobal) {
        filteredData = filteredData.filter((r) =>
          this.selectedInvestorRegions.includes(r.Investor_Region)
        );
      }
      if (filteredData.length === 0) {
        this.treemapDataMap.clear();
        this.regionDataArray = [];
        return;
      }
      const singleSankeyData = convertAssetFlowsToSankey(filteredData, dimensionConfig);
      this.treemapDataMap.clear();
      this.treemapDataMap.set('Asset Flows', singleSankeyData);
      this.updateRegionDataArray();
      return;
    }

    const allRegionsSankeyData = convertAssetFlowsToSankey(filteredData, dimensionConfig);
    this.treemapDataMap.clear();

    const hasGlobal = this.selectedInvestorRegions.includes('Global');
    const individualRegions = this.selectedInvestorRegions.filter(region => region !== 'Global');

    if (hasGlobal) {
      const globalSankeyData = aggregateSankeyDataByGlobal(allRegionsSankeyData);
      this.treemapDataMap.set('Global', globalSankeyData);
    }

    if (individualRegions.length > 0) {
      const useProductTypeFilter = this.selectedDimension2?.id === 'product-type';
      const useProductSubTypeFilter = this.selectedDimension3?.id === 'product-sub-types';
      const combinedSankeyData: SankeyData = filterSankeyData(
        allRegionsSankeyData,
        individualRegions,
        useProductTypeFilter ? (this.selectedProductTypes || []) : [],
        useProductSubTypeFilter ? (this.selectedProductSubTypes || []) : []
      );
      const regionsKey = individualRegions.join(', ');
      this.treemapDataMap.set(regionsKey, combinedSankeyData);
    }
    this.updateRegionDataArray();
  }

  /**
   * Update the cached region data array (called only when treemapDataMap changes)
   */
  private updateRegionDataArray(): void {
    const keys: string[] = [];
    if (this.treemapDataMap.has('Global')) {
      keys.push('Global');
    }
    // Get all keys that are not 'Global' - these are the combined region names
    const nonGlobalKeys = Array.from(this.treemapDataMap.keys()).filter(key => key !== 'Global');
    keys.push(...nonGlobalKeys);
    
    this.regionDataArray = keys.map(key => {
      const data = this.treemapDataMap.get(key);
      if (!data) {
        return null;
      }
      const investorRegions =
        key === 'Global'
          ? ['Global']
          : key === 'Asset Flows'
            ? []
            : (this.selectedInvestorRegions || []).filter(r => r !== 'Global');
      return {
        key,
        data,
        investorRegions
      };
    }).filter(item => item !== null) as Array<{
      key: string;
      data: SankeyData;
      investorRegions: string[];
    }>;

    const isDefaultParent = !this.selectedDimension2 || this.selectedDimension2.id === 'product-type';
    const isDefaultSub = !this.selectedDimension3 || this.selectedDimension3.id === 'product-sub-types';
    this.cachedSelectedProductTypes = isDefaultParent ? (this.selectedProductTypes || []) : [];
    this.cachedSelectedProductSubTypes = isDefaultSub ? (this.selectedProductSubTypes || []) : [];
  }

  /**
   * TrackBy function for *ngFor to prevent unnecessary re-renders
   */
  trackByRegionKey(index: number, item: { key: string; data: SankeyData; investorRegions: string[] }): string {
    return item.key;
  }

  /**
   * Filters asset flows data based on the selected time horizon range
   * If start and end are provided, filters data between those dates (inclusive)
   * Otherwise, uses the single timeHorizon for backward compatibility
   */
  private filterDataByTimeHorizon(data: AssetFlowRecord[]): AssetFlowRecord[] {
    if (!data || data.length === 0) {
      return data;
    }
    
    let startDate: string | null = null;
    let endDate: string | null = null;
    
    // If range is provided, use both start and end
    if (this.timeHorizonStart && this.timeHorizonEnd) {
      startDate = this.getTargetDateFromTimeHorizon(this.timeHorizonStart);
      endDate = this.getTargetDateFromTimeHorizon(this.timeHorizonEnd);
    } else {
      // Fallback to single time horizon for backward compatibility
      endDate = this.getTargetDateFromTimeHorizon(this.timeHorizon);
    }
    
    if (!endDate) {
      // If time horizon is invalid, return all data
      return data;
    }
    
    // Filter data based on date range
    const filtered = data.filter(record => {
      const flowDate = record.Asset_Flow_Date;
      if (!flowDate) {
        return false;
      }
      
      // If we have a range, check if date is between start and end (inclusive)
      if (startDate && endDate) {
        return flowDate >= startDate && flowDate <= endDate;
      }
      // Otherwise, filter data where Asset_Flow_Date is <= endDate (cumulative)
      return flowDate <= endDate;
    });
    
    return filtered;
  }

  /**
   * Converts time horizon string to target date in YYYY-MM format
   * Returns null if time horizon is invalid
   * Uses today's date as the base for calculations
   */
  private getTargetDateFromTimeHorizon(horizon?: string): string | null {
    const timeHorizonToUse = horizon || this.timeHorizon;
    // Use today's date as the base
    const today = new Date();
    const baseYear = today.getFullYear();
    const baseMonth = today.getMonth() + 1; // getMonth() returns 0-11, so add 1
    
    if (timeHorizonToUse === 'Today') {
      // For "Today", return the current month
      const monthStr = String(baseMonth).padStart(2, '0');
      return `${baseYear}-${monthStr}`;
    }
    
    // Parse time horizon string (e.g., "+3 mo", "+6 mo", "-3 mo", "6mo", "9mo")
    // Support both formats: with/without space and with/without + prefix
    const normalized = timeHorizonToUse.trim().toLowerCase();
    let match = normalized.match(/^([+-]?)(\d+)\s*mo$/i);
    
    // If no match, try without "mo" suffix (e.g., "6mo", "9mo")
    if (!match) {
      match = normalized.match(/^([+-]?)(\d+)$/);
    }
    
    if (!match) {
      console.warn('AssetAllocation: Could not parse time horizon:', timeHorizonToUse);
      return null;
    }
    
    const isNegative = match[1] === '-';
    const months = parseInt(match[2], 10);
    
    // Calculate target date by adding/subtracting months from today
    const targetDate = new Date(baseYear, baseMonth - 1, 1); // Create date object (month is 0-indexed)
    
    if (isNegative) {
      // Historical: subtract months
      targetDate.setMonth(targetDate.getMonth() - months);
    } else {
      // Forecasted: add months (default for positive or no sign)
      targetDate.setMonth(targetDate.getMonth() + months);
    }
    
    // Format as YYYY-MM
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth() + 1; // getMonth() returns 0-11, so add 1
    const monthStr = String(targetMonth).padStart(2, '0');
    return `${targetYear}-${monthStr}`;
  }
}

