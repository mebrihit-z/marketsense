/* eslint-disable */
import { Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core'
import { CommonModule } from '@angular/common';
import { SankeyComponent } from '../charts/sankey/sankey.component';
import TitleComponent from '../title/title.component';
import { FlowDimensionsComponent, type FlowDimension } from '../flow-dimensions/flow-dimensions.component';
import { convertAssetFlowsToSankey, type AssetFlowRecord, type SankeyData, type AssetFlowDimensionField, type SankeyDimensionConfig } from '../../utils/asset-flows-to-sankey.util';
import { 
  aggregateSankeyDataByGlobal, 
  filterSankeyData 
} from '../../utils/sankey-data.utils';
import { AssetFlowsDataService } from '../../../core/services/asset-flows-data.service';
import { extractFilterOptionsFromAssetFlows, type FilterOptions } from '../../utils/asset-flows-filter-options.util';

export type { FlowDimension };

export interface FlowCategory {
  name: string;
  value: number;
  percentage?: number;
  type: 'inflow' | 'outflow' | 'net';
}

export interface AssetFlowData {
  inflows: FlowCategory[];
  outflows: FlowCategory[];
  netPosition: {
    value: number;
    percentage: number;
  };
  positiveFlows: {
    value: number;
    percentage: number;
  };
}

@Component({
  selector: 'app-asset-flows',
  standalone: true,
  imports: [CommonModule, SankeyComponent, TitleComponent, FlowDimensionsComponent],
  templateUrl: './asset-flows.component.html',
  styleUrl: './asset-flows.component.scss'
})
export class AssetFlowsComponent implements OnInit, OnChanges {
  @Input() selectedProductTypes: string[] = [];
  @Input() selectedProductSubTypes: string[] = [];
  @Input() selectedInvestorRegions: string[] = [];
  @Input() selectedInvestorTypes: string[] = [];
  @Input() selectedProductRegions: string[] = [];
  @Input() totalProductTypes: number = 0;
  @Input() totalProductSubTypes: number = 0;
  @Input() totalInvestorRegions: number = 0;
  @Input() totalInvestorTypes: number = 0;
  @Input() totalProductRegions: number = 0;
  @Input() dataType: 'historical' | 'forecasted' = 'forecasted';
  @Input() timeHorizon: string = 'Today';
  @Input() timeHorizonStart?: string;
  @Input() timeHorizonEnd?: string;
  @Input() forceCloseDimensionDropdown = 0;
  @Output() pinToggle = new EventEmitter<void>();
  @Output() dimensionDropdownOpened = new EventEmitter<void>();
  @Output() filterOptionsChange = new EventEmitter<FilterOptions>();
  @Output() filterOptionTotalsChange = new EventEmitter<{
    productTypeTotal: number;
    productSubTypeTotal: number;
    investorRegionTotal: number;
    investorTypeTotal: number;
    productRegionTotal: number;
  }>();
  
  // View and filter state
  showProductSubTypes: boolean = false;
  isPinned: boolean = false;
  showRegionalSankey: boolean = false;
  
  // Sankey data - map of region name to Sankey data
  sankeyDataMap: Map<string, SankeyData> = new Map();
  
  // Cached array of selected regions for template (prevents change detection loops)
  selectedRegionsArray: string[] = [];
  
  // Cached region data objects for template (prevents method calls in template)
  regionDataArray: Array<{
    key: string;
    data: SankeyData;
    investorRegions: string[];
  }> = [];
  
  // Cached arrays for Sankey inputs (prevents creating new arrays on every change detection)
  cachedSelectedProductTypes: string[] = [];
  cachedSelectedProductSubTypes: string[] = [];
  
  // Raw asset flows data (before filtering)
  private rawAssetFlowsData: AssetFlowRecord[] | undefined;
  
  // Filter options extracted from data
  filterOptions: FilterOptions | undefined;

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

  constructor(private assetFlowsData: AssetFlowsDataService) {}
  
  // Sample flow data
  flowData: AssetFlowData = {
    inflows: [
      { name: 'Equity', value: 24.8, type: 'inflow' },
      { name: 'Fixed Income', value: 15.4, type: 'inflow' },
      { name: 'Cash', value: 11.0, type: 'inflow' },
      { name: 'Alternatives', value: 7.5, type: 'inflow' }
    ],
    outflows: [
      { name: 'Fixed Income', value: 22.3, type: 'outflow' },
      { name: 'Alternatives', value: 24.1, type: 'outflow' },
      { name: 'Equity', value: 6.2, type: 'outflow' }
    ],
    netPosition: {
      value: 24.1,
      percentage: 5
    },
    positiveFlows: {
      value: 41.6,
      percentage: 12
    }
  };

  ngOnInit(): void {
    this.updateDimensions();
    // Set default dimensions
    this.selectedDimension1 = this.availableDimensions.find(d => d.id === 'investor-region') || null;
    this.selectedDimension2 = this.availableDimensions.find(d => d.id === 'product-type') || null;
    this.selectedDimension3 = this.availableDimensions.find(d => d.id === 'product-sub-types') || null;
    
    // Load and convert asset flows data
    this.loadAssetFlowsData();
  }
  
  private loadAssetFlowsData(): void {
    this.assetFlowsData.getAssetFlows().subscribe({
      next: (data) => {
        try {
          this.rawAssetFlowsData = data;
          
          this.updateSankeyData();
          
          this.filterOptions = extractFilterOptionsFromAssetFlows(data);
          // Emit filter options to parent component
          this.filterOptionsChange.emit(this.filterOptions);
          
          // Emit filter option totals
          const totals = {
            productTypeTotal: this.filterOptions.productTypes.length,
            productSubTypeTotal: this.filterOptions.productSubTypes.reduce((sum, group) => sum + group.subTypes.length, 0),
            investorRegionTotal: this.filterOptions.investorRegions.length,
            investorTypeTotal: this.filterOptions.investorTypes.length,
            productRegionTotal: this.filterOptions.productRegions.length
          };
          this.filterOptionTotalsChange.emit(totals);
          
          // Update component totals
          this.totalProductTypes = totals.productTypeTotal;
          this.totalProductSubTypes = totals.productSubTypeTotal;
          this.totalInvestorRegions = totals.investorRegionTotal;
          this.totalInvestorTypes = totals.investorTypeTotal;
          this.totalProductRegions = totals.productRegionTotal;
          
          // Update dimensions with new totals
          this.updateDimensions();
        } catch (error) {
          console.error('Error converting asset flows to Sankey data:', error);
        }
      },
      error: (error) => {
        console.error('Error loading asset flows data:', error);
      }
    });
  }
  
  /**
   * Filters asset flows data based on time horizon and converts to Sankey format
   * Creates one Global Sankey if Global is selected
   * Creates one combined Sankey for all other selected regions
   * Uses Dimension 2 and 3 to control which fields are used for parent and leaf nodes.
   */
  private updateSankeyData(): void {
    if (!this.rawAssetFlowsData) {
      console.warn('No raw asset flows data available');
      return;
    }
    
    if (!this.selectedInvestorRegions || this.selectedInvestorRegions.length === 0) {
      console.warn('No investor regions selected');
      this.sankeyDataMap.clear();
      this.selectedRegionsArray = [];
      this.regionDataArray = [];
      return;
    }
    // Filter data based on time horizon
    const filteredData = this.filterDataByTimeHorizon(this.rawAssetFlowsData);
    
    if (!filteredData || filteredData.length === 0) {
      console.warn('No data after time horizon filtering');
      this.sankeyDataMap.clear();
      this.selectedRegionsArray = [];
      this.regionDataArray = [];
      return;
    }
    
    // Convert filtered data to Sankey format (contains all regions)
    // Use Dimension 2 and 3 to control which fields are treated as
    // parent and leaf levels in the Sankey hierarchy, while keeping
    // Investor_Region as the super dimension so Global aggregation works.
    const allRegionsSankeyData = convertAssetFlowsToSankey(
      filteredData,
      this.getSankeyDimensionConfig()
    );
    
    // Clear existing Sankey data map
    this.sankeyDataMap.clear();
    
    // Separate Global from individual regions
    const hasGlobal = this.selectedInvestorRegions.includes('Global');
    const individualRegions = this.selectedInvestorRegions.filter(region => region !== 'Global');
    
    // Create Global Sankey if Global is selected
    if (hasGlobal) {
      const globalSankeyData = aggregateSankeyDataByGlobal(allRegionsSankeyData);
      this.sankeyDataMap.set('Global', globalSankeyData);
    }
    
    // Create one combined Sankey for all selected non-Global regions
    if (individualRegions.length > 0) {
      const combinedSankeyData: SankeyData = filterSankeyData(
        allRegionsSankeyData,
        individualRegions, // All selected regions combined
        [], // No product type filter
        []  // No product sub-type filter
      );
      // Use a descriptive key that shows all selected regions
      const regionsKey = individualRegions.join(', ');
      this.sankeyDataMap.set(regionsKey, combinedSankeyData);
    }
    // Update cached array for template (only when map actually changes)
    this.updateSelectedRegionsArray();
  }
  
  /**
   * Update the cached selected regions array and region data array (called only when sankeyDataMap changes)
   * This prevents change detection loops from calling methods in template
   */
  private updateSelectedRegionsArray(): void {
    const keys: string[] = [];
    if (this.sankeyDataMap.has('Global')) {
      keys.push('Global');
    }
    // Get all keys that are not 'Global' - these are the combined region names
    const nonGlobalKeys = Array.from(this.sankeyDataMap.keys()).filter(key => key !== 'Global');
    keys.push(...nonGlobalKeys);
    this.selectedRegionsArray = keys;
    
    // Build cached region data array to avoid method calls in template
    this.regionDataArray = keys.map(key => {
      const data = this.sankeyDataMap.get(key);
      if (!data) {
        return null;
      }
      return {
        key,
        data,
        investorRegions: key === 'Global' 
          ? ['Global']
          : (this.selectedInvestorRegions || []).filter(r => r !== 'Global')
      };
    }).filter(item => item !== null) as Array<{
      key: string;
      data: SankeyData;
      investorRegions: string[];
    }>;
    
    // Cache product type arrays to avoid creating new arrays in template.
    // When Dimension 2/3 are changed away from Product Type / Product Sub-Types,
    // disable product-type-based filtering inside the Sankey component to avoid
    // filtering out all nodes.
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
    
    const rangeInfo = startDate && endDate 
      ? `range: ${startDate} to ${endDate}`
      : `target: ${endDate}`;
    return filtered;
  }
  
  /**
   * Converts time horizon string to target date in YYYY-MM format
   * Returns null if time horizon is invalid
   * Uses today's date as the base for calculations
   * @param horizon - The time horizon string (e.g., "Today", "+3 mo", "-6 mo"). If not provided, uses this.timeHorizon
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
      console.warn('Could not parse time horizon:', timeHorizonToUse);
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
    const result = `${targetYear}-${monthStr}`;
    return result;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedProductTypes'] || changes['selectedProductSubTypes'] || 
        changes['selectedInvestorRegions'] || changes['selectedInvestorTypes'] ||
        changes['selectedProductRegions'] ||
        changes['totalProductTypes'] || changes['totalProductSubTypes'] ||
        changes['totalInvestorRegions'] || changes['totalInvestorTypes'] ||
        changes['totalProductRegions']) {
      this.updateDimensions();
    }
    
    // Update cached arrays when product types/subtypes change
    if (changes['selectedProductTypes'] || changes['selectedProductSubTypes']) {
      this.cachedSelectedProductTypes = this.selectedProductTypes || [];
      this.cachedSelectedProductSubTypes = this.selectedProductSubTypes || [];
      // Update regionDataArray to reflect new cached arrays
      this.regionDataArray = this.regionDataArray.map(item => ({ ...item }));
    }
    
    // Update Sankey data when time horizon, time horizon range, data type, or investor regions change
    // (Investor regions change is important for Global aggregation)
    if (changes['timeHorizon'] || changes['timeHorizonStart'] || changes['timeHorizonEnd'] || 
        changes['dataType'] || changes['selectedInvestorRegions']) {
      if (this.rawAssetFlowsData) {
        this.updateSankeyData();
      }
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

  toggleProductSubTypes(): void {
    this.showProductSubTypes = !this.showProductSubTypes;
    
    if (this.showProductSubTypes) {
      // Add "Product sub-types" to available dimensions if not already present
      const existingDimension = this.availableDimensions.find(d => d.id === 'product-sub-types');
      if (!existingDimension) {
        this.availableDimensions.push({
          id: 'product-sub-types',
          label: 'Product sub-types',
          count: this.selectedProductSubTypes.length,
          active: true
        });
      } else {
        // Update count if dimension already exists
        existingDimension.count = this.selectedProductSubTypes.length;
      }
    } else {
      // Remove "Product sub-types" from available dimensions
      const index = this.availableDimensions.findIndex(d => d.id === 'product-sub-types');
      if (index !== -1) {
        // If this dimension is selected in a drop zone, remove it
        if (this.selectedDimension1?.id === 'product-sub-types') {
          this.selectedDimension1 = null;
        }
        if (this.selectedDimension2?.id === 'product-sub-types') {
          this.selectedDimension2 = null;
        }
        if (this.selectedDimension3?.id === 'product-sub-types') {
          this.selectedDimension3 = null;
        }
        
        // Remove from available dimensions
        this.availableDimensions.splice(index, 1);
      }
    }
  }

  onStreamgraphClick(): void {
  }

  onDimensionReorder(event: any): void {
    // TODO: Implement drag and drop reordering
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

    // Recompute Sankey data when any flow dimension changes
    if (this.rawAssetFlowsData) {
      this.updateSankeyData();
    }
  }

  /**
   * Maps a FlowDimension id to the corresponding AssetFlowRecord field.
   */
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

  /**
   * Builds the SankeyDimensionConfig from the selected flow dimensions.
   * For now the super dimension stays fixed to Investor_Region so that
   * Global vs regional aggregation continues to work as before.
   * Dimension 2 controls the parent level, Dimension 3 controls the leaf level.
   */
  private getSankeyDimensionConfig(): SankeyDimensionConfig {
    const dim2Id = this.selectedDimension2?.id || 'product-type';
    const dim3Id = this.selectedDimension3?.id || 'product-sub-types';

    return {
      superField: 'Investor_Region',
      parentField: this.mapDimensionIdToField(dim2Id),
      subField: dim3Id === 'none' ? 'none' : this.mapDimensionIdToField(dim3Id),
    };
  }

  getTotalInflow(): number {
    return this.flowData.inflows.reduce((sum, item) => sum + item.value, 0);
  }

  getTotalOutflow(): number {
    return this.flowData.outflows.reduce((sum, item) => sum + item.value, 0);
  }

  formatCurrency(value: number): string {
    return `$${value.toFixed(1)}B`;
  }

  formatPercentage(value: number): string {
    return `${value > 0 ? '+' : ''}${value}%`;
  }

  onPinClick(): void {
    this.isPinned = !this.isPinned;
    this.pinToggle.emit();
  }

  /**
   * Get filter options extracted from the asset flows data
   * @returns FilterOptions object or undefined if data hasn't loaded yet
   */
  getFilterOptions(): FilterOptions | undefined {
    return this.filterOptions;
  }
}
