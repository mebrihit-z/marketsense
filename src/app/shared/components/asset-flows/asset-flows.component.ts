/* eslint-disable */
import { Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core'
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { SankeyComponent } from '../charts/sankey/sankey.component';
import { convertAssetFlowsToSankey, type AssetFlowRecord, type SankeyData } from '../../utils/asset-flows-to-sankey.util';
import { extractFilterOptionsFromAssetFlows, type FilterOptions } from '../../utils/asset-flows-filter-options.util';

export interface FlowDimension {
  id: string;
  label: string;
  count: number;
  active: boolean;
  total?: number;
}

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
  imports: [CommonModule, SankeyComponent],
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
  @Output() pinToggle = new EventEmitter<void>();
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
  
  // Sankey data
  sankeyData: SankeyData | undefined;
  
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

  // Currently dragged dimension
  private draggedDimension: FlowDimension | null = null;
  
  constructor(private http: HttpClient) {}
  
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
    console.log('Asset Flows component initialized');
    this.updateDimensions();
    // Set default dimensions
    this.selectedDimension1 = this.availableDimensions.find(d => d.id === 'investor-region') || null;
    this.selectedDimension2 = this.availableDimensions.find(d => d.id === 'product-type') || null;
    this.selectedDimension3 = this.availableDimensions.find(d => d.id === 'product-sub-types') || null;
    
    // Load and convert asset flows data
    this.loadAssetFlowsData();
  }
  
  private loadAssetFlowsData(): void {
    this.http.get<AssetFlowRecord[]>('assets/data/asset-flows-data.json').subscribe({
      next: (data) => {
        try {
          // Store raw data for filtering
          this.rawAssetFlowsData = data;
          
          // Filter and convert asset flows data to Sankey format
          this.updateSankeyData();
          
          // Extract filter options from the raw data (before time horizon filtering)
          this.filterOptions = extractFilterOptionsFromAssetFlows(data);
          console.log('Filter options extracted:', this.filterOptions);
          
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
   */
  private updateSankeyData(): void {
    if (!this.rawAssetFlowsData) {
      console.warn('No raw asset flows data available');
      return;
    }
    
    console.log('Updating Sankey data for time horizon:', this.timeHorizon, 'dataType:', this.dataType);
    
    // Filter data based on time horizon
    const filteredData = this.filterDataByTimeHorizon(this.rawAssetFlowsData);
    
    // Convert filtered data to Sankey format
    const newSankeyData = convertAssetFlowsToSankey(filteredData);
    
    // Always assign a new object reference to ensure change detection
    this.sankeyData = { ...newSankeyData };
    
    console.log('Sankey data updated:', {
      nodes: this.sankeyData.nodes?.length || 0,
      links: this.sankeyData.links?.length || 0,
      summary: this.sankeyData.summary
    });
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
      console.log('Time horizon range:', {
        start: this.timeHorizonStart,
        end: this.timeHorizonEnd,
        startDate,
        endDate
      });
    } else {
      // Fallback to single time horizon for backward compatibility
      endDate = this.getTargetDateFromTimeHorizon(this.timeHorizon);
      console.log('Time horizon (single):', this.timeHorizon, 'Target date:', endDate);
    }
    
    if (!endDate) {
      // If time horizon is invalid, return all data
      console.log('No target date, returning all data');
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
    console.log(`Filtered ${filtered.length} records out of ${data.length} for time horizon ${rangeInfo}`);
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
    console.log(`Converted time horizon "${timeHorizonToUse}" from base ${baseYear}-${String(baseMonth).padStart(2, '0')} to date: ${result}`);
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
    
    // Update Sankey data when time horizon, time horizon range, or data type changes
    if (changes['timeHorizon'] || changes['timeHorizonStart'] || changes['timeHorizonEnd'] || changes['dataType']) {
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
    console.log('Show product sub-types:', this.showProductSubTypes);
    
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
    console.log('Streamgraph view selected');
  }

  onDimensionReorder(event: any): void {
    console.log('Dimension reorder:', event);
    // TODO: Implement drag and drop reordering
  }

  onDimensionDragStart(event: DragEvent, dimension: FlowDimension): void {
    this.draggedDimension = dimension;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', dimension.id);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    const target = event.currentTarget as HTMLElement;
    target.classList.add('drag-over');
  }

  onDragLeave(event: DragEvent): void {
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('drag-over');
  }

  onDrop(event: DragEvent, dropZone: 'dimension1' | 'dimension2' | 'dimension3'): void {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('drag-over');

    if (this.draggedDimension) {
      // Remove dimension from the other drop zones if it's already there
      if (this.selectedDimension1?.id === this.draggedDimension.id) {
        this.selectedDimension1 = null;
      }
      if (this.selectedDimension2?.id === this.draggedDimension.id) {
        this.selectedDimension2 = null;
      }
      if (this.selectedDimension3?.id === this.draggedDimension.id) {
        this.selectedDimension3 = null;
      }

      // Set the dimension in the target drop zone
      if (dropZone === 'dimension1') {
        this.selectedDimension1 = this.draggedDimension;
      } else if (dropZone === 'dimension2') {
        this.selectedDimension2 = this.draggedDimension;
      } else {
        this.selectedDimension3 = this.draggedDimension;
      }

      this.draggedDimension = null;
      console.log('Dimension dropped:', dropZone, this.selectedDimension1, this.selectedDimension2, this.selectedDimension3);
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

  getDimensionCountLabel(dimension: FlowDimension): string | null {
    const selected = dimension.count ?? 0;
    const total = dimension.total ?? 0;

    if (selected === 0 && total === 0) {
      return null;
    }

    return total > 0 ? `${selected}/${total}` : `${selected}`;
  }
  
  /**
   * Get filter options extracted from the asset flows data
   * @returns FilterOptions object or undefined if data hasn't loaded yet
   */
  getFilterOptions(): FilterOptions | undefined {
    return this.filterOptions;
  }
}
