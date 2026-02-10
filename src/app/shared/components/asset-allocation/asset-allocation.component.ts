/* eslint-disable */
import { Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { TreemapCellModalComponent, TreemapCellData } from '../charts/treemap-cell-modal/treemap-cell-modal.component';
import { TreemapComponent } from '../charts/treemap/treemap.component';
import TitleComponent from '../title/title.component';
import { convertAssetFlowsToSankey, type AssetFlowRecord, type SankeyData } from '../../utils/asset-flows-to-sankey.util';
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

export interface FlowDimension {
  id: string;
  label: string;
  count: number;
  active: boolean;
  total?: number;
}

@Component({
  selector: 'app-asset-allocation',
  standalone: true,
  imports: [CommonModule, TreemapCellModalComponent, TreemapComponent, TitleComponent],
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

  // Dropdown state
  openDropdown: 'dimension1' | 'dimension2' | 'dimension3' | null = null;
  
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
  private dataUrl: string = 'assets/data/asset-flows-data.json';
  
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
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    console.log('Asset Allocation component initialized');
    this.updateDimensions();
    // Set default dimensions
    this.selectedDimension1 = this.availableDimensions.find(d => d.id === 'investor-region') || null;
    this.selectedDimension2 = this.availableDimensions.find(d => d.id === 'product-type') || null;
    this.selectedDimension3 = this.availableDimensions.find(d => d.id === 'product-sub-types') || null;
    
    // Load data
    this.loadData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['forceCloseDimensionDropdown'] && (changes['forceCloseDimensionDropdown'].currentValue as number) > 0) {
      this.openDropdown = null;
    }
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
      console.log('AssetAllocation: Time horizon changed', {
        timeHorizon: this.timeHorizon,
        timeHorizonStart: this.timeHorizonStart,
        timeHorizonEnd: this.timeHorizonEnd,
        changes: Object.keys(changes)
      });
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

  removeDimension(dropZone: 'dimension1' | 'dimension2' | 'dimension3'): void {
    if (dropZone === 'dimension1') {
      this.selectedDimension1 = null;
    } else if (dropZone === 'dimension2') {
      this.selectedDimension2 = null;
    } else {
      this.selectedDimension3 = null;
    }
    console.log('Dimension removed from:', dropZone);
  }

  /**
   * Get formatted text for dimension option in select dropdown (label only, no count badge)
   */
  getDimensionOptionText(dimension: FlowDimension): string {
    return dimension.label;
  }

  /**
   * Get available dimensions for a specific select dropdown
   * Excludes dimensions already selected in other dropdowns
   */
  getAvailableDimensionsForSelect(selectId: 'dimension1' | 'dimension2' | 'dimension3'): FlowDimension[] {
    const selectedIds = new Set<string>();
    
    if (selectId !== 'dimension1' && this.selectedDimension1) {
      selectedIds.add(this.selectedDimension1.id);
    }
    if (selectId !== 'dimension2' && this.selectedDimension2) {
      selectedIds.add(this.selectedDimension2.id);
    }
    if (selectId !== 'dimension3' && this.selectedDimension3) {
      selectedIds.add(this.selectedDimension3.id);
    }
    
    return this.availableDimensions.filter(dim => !selectedIds.has(dim.id));
  }

  /**
   * Toggle custom dropdown open/closed state
   */
  toggleDropdown(selectId: 'dimension1' | 'dimension2' | 'dimension3', event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (this.openDropdown === selectId) {
      this.openDropdown = null;
    } else {
      this.openDropdown = selectId;
      this.dimensionDropdownOpened.emit();
    }
  }

  /**
   * Close custom dropdown
   */
  closeDropdown(selectId: 'dimension1' | 'dimension2' | 'dimension3'): void {
    if (this.openDropdown === selectId) {
      this.openDropdown = null;
    }
  }

  /**
   * Close dropdown when clicking outside
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.custom-select-wrapper')) {
      this.openDropdown = null;
    }
  }

  /**
   * Select a dimension from custom dropdown
   */
  selectDimension(dimension: FlowDimension, selectId: 'dimension1' | 'dimension2' | 'dimension3'): void {
    // Remove this dimension from other selects if it was selected there
    if (selectId !== 'dimension1' && this.selectedDimension1?.id === dimension.id) {
      this.selectedDimension1 = null;
    }
    if (selectId !== 'dimension2' && this.selectedDimension2?.id === dimension.id) {
      this.selectedDimension2 = null;
    }
    if (selectId !== 'dimension3' && this.selectedDimension3?.id === dimension.id) {
      this.selectedDimension3 = null;
    }
    
    // Set the dimension in the target select
    if (selectId === 'dimension1') {
      this.selectedDimension1 = dimension;
    } else if (selectId === 'dimension2') {
      this.selectedDimension2 = dimension;
    } else {
      this.selectedDimension3 = dimension;
    }
    
    // Close the dropdown
    this.openDropdown = null;
    
    console.log('Dimension selected:', selectId, dimension);
  }



  onPackingCirclesClick(): void {
    console.log('Packing Circles view selected');
    this.viewMode = 'packing-circles';
  }

  onDimensionReorder(event: any): void {
    console.log('Dimension reorder:', event);
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
    console.log('Node clicked:', node);
    // TODO: Implement drill-down functionality
  }

  onPinClick(): void {
    this.isPinned = !this.isPinned;
    this.pinToggle.emit();
  }

  getDimensionCountLabel(dimension: FlowDimension): string | null {
    const selected = dimension.count ?? 0;
    const total = dimension.total ?? 0;

    if (selected === 0 && total === 0) {
      return null;
    }

    return total > 0 ? `${selected}/${total}` : `${selected}`;
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
    console.log('Ask AI clicked for cell:', this.selectedCellData);
    // You can emit an event or navigate to AI chat here
  }

  /**
   * Loads asset flows data from JSON file
   */
  private loadData(): void {
    this.http.get<AssetFlowRecord[]>(this.dataUrl).subscribe({
      next: (assetFlows: AssetFlowRecord[]) => {
        try {
          // Store raw data for time horizon filtering
          this.rawAssetFlowsData = assetFlows;
          this.updateTreemapData();
        } catch (error: unknown) {
          console.error('Error loading asset-flows-data.json:', error);
        }
      },
      error: (error: unknown) => {
        console.error('Error loading asset-flows-data.json:', error);
        console.error('Failed to load from:', this.dataUrl);
      }
    });
  }

  /**
   * Updates treemap data based on current filters and time horizon
   */
  private updateTreemapData(): void {
    if (!this.rawAssetFlowsData) {
      console.warn('AssetAllocation: No raw asset flows data available');
      return;
    }

    // Filter data based on time horizon
    const filteredData = this.filterDataByTimeHorizon(this.rawAssetFlowsData);
    
    // Convert filtered data to Sankey format (contains all regions)
    const allRegionsSankeyData = convertAssetFlowsToSankey(filteredData);
    
    // Clear existing treemap data map
    this.treemapDataMap.clear();
    
    // Separate Global from individual regions
    const hasGlobal = this.selectedInvestorRegions.includes('Global');
    const individualRegions = this.selectedInvestorRegions.filter(region => region !== 'Global');
    
    // Create Global treemap if Global is selected
    if (hasGlobal) {
      const globalSankeyData = aggregateSankeyDataByGlobal(allRegionsSankeyData);
      this.treemapDataMap.set('Global', globalSankeyData);
      console.log('Global Treemap created:', {
        nodes: globalSankeyData.nodes?.length || 0,
        links: globalSankeyData.links?.length || 0
      });
    }
    
    // Create one combined treemap for all selected non-Global regions
    if (individualRegions.length > 0) {
      const combinedSankeyData: SankeyData = filterSankeyData(
        allRegionsSankeyData,
        individualRegions, // All selected regions combined
        this.selectedProductTypes || [],
        this.selectedProductSubTypes || []
      );
      // Use a descriptive key that shows all selected regions
      const regionsKey = individualRegions.join(', ');
      this.treemapDataMap.set(regionsKey, combinedSankeyData);
      console.log('Combined Treemap created for selected regions:', {
        regions: individualRegions,
        nodes: combinedSankeyData.nodes?.length || 0,
        links: combinedSankeyData.links?.length || 0
      });
    }
    
    console.log('Treemap data updated for regions:', Array.from(this.treemapDataMap.keys()));
    
    // Update cached array for template
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
    
    // Build cached region data array to avoid method calls in template
    this.regionDataArray = keys.map(key => {
      const data = this.treemapDataMap.get(key);
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
    
    // Cache product type arrays to avoid creating new arrays in template
    this.cachedSelectedProductTypes = this.selectedProductTypes || [];
    this.cachedSelectedProductSubTypes = this.selectedProductSubTypes || [];
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

