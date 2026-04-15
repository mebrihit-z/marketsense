/* eslint-disable */
import { Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges, ViewChild, ElementRef } from '@angular/core'
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SankeyComponent } from '../charts/sankey/sankey.component';
import TitleComponent from '../title/title.component';
import { FlowDimensionsComponent, type FlowDimension } from '../flow-dimensions/flow-dimensions.component';
import { convertAssetFlowsToSankey, type AssetFlowRecord, type SankeyData, type AssetFlowDimensionField, type SankeyDimensionConfig } from '../../utils/asset-flows-to-sankey.util';
import { 
  filterSankeyData 
} from '../../utils/sankey-data.utils';
import { AssetFlowsDataService } from '../../../core/services/asset-flows-data.service';
import type { SavedChartHierarchyDimensions } from '../../../core/services/saved-views.service';
import { extractFilterOptionsFromAssetFlows, type FilterOptions } from '../../utils/asset-flows-filter-options.util';
import { assetFlowQuarterInTimeWindow } from '../../utils/asset-flow-time-window.util';
import { ChartsExportModalComponent } from '../charts-export-modal/charts-export-modal.component';
import { jsPDF } from 'jspdf';
import {
  captureChartAreaToPng,
  downloadDataUrlAsPng,
  saveChartAsMultiPagePdf,
} from '../../utils/chart-dom-export.util';

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
  imports: [
    CommonModule,
    FormsModule,
    SankeyComponent,
    TitleComponent,
    FlowDimensionsComponent,
    ChartsExportModalComponent,
  ],
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
  /** Flow value filter lower bound (billions), from filters bar. */
  @Input() minFlowValue = 0;
  /** Upper cap (billions) or null when unbounded; from filters bar. */
  @Input() maxFlowValue: number | null = null;
  @Input() forceCloseDimensionDropdown = 0;
  @Output() pinToggle = new EventEmitter<void>();
  @Output() dimensionDropdownOpened = new EventEmitter<void>();
  @Output() chartDimensionsSnapshot = new EventEmitter<SavedChartHierarchyDimensions>();
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
  
  // Super dimension values per Sankey key (Dimension 1 values used to build each entry; passed to Sankey for correct filtering)
  private sankeySuperValuesMap = new Map<string, string[]>();
  
  // Cached arrays for Sankey inputs (prevents creating new arrays on every change detection)
  cachedSelectedProductTypes: string[] = [];
  cachedSelectedProductSubTypes: string[] = [];
  
  // Raw asset flows data (before filtering)
  private rawAssetFlowsData: AssetFlowRecord[] | undefined;
  
  // Filter options extracted from data
  filterOptions: FilterOptions | undefined;
  showExportModal: boolean = false;

  @ViewChild('chartExportRoot', { read: ElementRef }) chartExportRoot?: ElementRef<HTMLElement>;

  // Available dimensions for Dimension 1, 2, and 3 dropdowns (includes Product Region for Dimension 1)
  availableDimensions: FlowDimension[] = [
    { id: 'investor-region', label: 'Investor Region', count: 0, active: true },
    { id: 'product-region', label: 'Product Region', count: 0, active: true },
    { id: 'investor-type', label: 'Investor Type', count: 0, active: true },
    { id: 'product-type', label: 'Product Type', count: 0, active: true },
    { id: 'product-sub-types', label: 'Product Sub-Types', count: 0, active: true },
  ];

  // Selected dimensions for drop zones
  selectedDimension1: FlowDimension | null = null;
  selectedDimension2: FlowDimension | null = null;
  selectedDimension3: FlowDimension | null = null;

  /** Default Dimension 3 — must match synthetic "None" in {@link FlowDimensionsComponent}. */
  private readonly defaultDimension3None: FlowDimension = {
    id: 'none',
    label: 'None',
    count: 0,
    active: true,
  };

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
    this.selectedDimension3 = { ...this.defaultDimension3None };
    queueMicrotask(() => this.emitChartDimensionsSnapshot());

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
          this.emitChartDimensionsSnapshot();
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
   * Builds Sankey data map (aggregated when no super values, or per selected values).
   * Creates one combined Sankey for all other selected regions
   * Uses Dimension 2 and 3 to control which fields are used for parent and leaf nodes.
   */
  private updateSankeyData(): void {
    if (!this.rawAssetFlowsData) {
      console.warn('No raw asset flows data available');
      return;
    }

    // When the Investor Region filter has no selections, do not build any Sankey data.
    if (this.selectedInvestorRegions && this.selectedInvestorRegions.length === 0) {
      this.sankeyDataMap.clear();
      this.sankeySuperValuesMap.clear();
      this.selectedRegionsArray = [];
      this.regionDataArray = [];
      return;
    }
    
    const { values: superValues } = this.getSuperDimensionValues();
    const dim1Id = this.selectedDimension1?.id || 'investor-region';
    let individualValues = superValues;

    // Filter data by time horizon, then by filter bar (investor region, type, product region/type/sub-type)
    let filteredData = this.filterDataByTimeHorizon(this.rawAssetFlowsData);
    filteredData = this.filterDataByFilterBar(filteredData);

    if (!filteredData || filteredData.length === 0) {
      console.warn('No data after filtering');
      this.sankeyDataMap.clear();
      this.sankeySuperValuesMap.clear();
      this.selectedRegionsArray = [];
      this.regionDataArray = [];
      return;
    }

    // Convert to Sankey using Dimension 1 as super, Dimension 2 as parent, Dimension 3 as leaf
    const dimensionConfig = this.getSankeyDimensionConfig();
    const allRegionsSankeyData = convertAssetFlowsToSankey(
      filteredData,
      dimensionConfig
    );

    // When Dimension 1 has no selected values in the filter bar, use super values that actually exist in the data
    // so the Sankey is still created with the chosen dimension as super nodes.
    const superparents = allRegionsSankeyData?.summary?.superparents ?? [];
    const valuesInData = superparents
      .map((sp: { superparent?: string }) => sp.superparent)
      .filter((s): s is string => typeof s === 'string' && s.length > 0);
    if (valuesInData.length > 0 && individualValues.length === 0) {
      individualValues = valuesInData;
    }

    // Clear existing Sankey data map and super values map
    this.sankeyDataMap.clear();
    this.sankeySuperValuesMap.clear();

    // Require at least one super-dimension value; if none selected, don't render a global aggregate
    if (individualValues.length > 0) {
      const combinedSankeyData: SankeyData = filterSankeyData(
        allRegionsSankeyData,
        individualValues, // Filter by super dimension values (e.g. regions, product types)
        [], // No product type filter (parent level)
        []  // No product sub-type filter (leaf level)
      );
      const displayKey = individualValues.join(', ');
      this.sankeyDataMap.set(displayKey, combinedSankeyData);
      this.sankeySuperValuesMap.set(displayKey, individualValues);
    }
    // Update cached array for template (only when map actually changes)
    this.updateSelectedRegionsArray();
  }
  
  /**
   * Update the cached selected regions array and region data array (called only when sankeyDataMap changes)
   * This prevents change detection loops from calling methods in template
   */
  private updateSelectedRegionsArray(): void {
    const keys: string[] = Array.from(this.sankeyDataMap.keys());
    this.selectedRegionsArray = keys;
    
    // Build cached region data array. Pass super dimension values (not just investor regions) so the Sankey
    // filters correctly for any Dimension 1 (investor region, product type, etc.).
    this.regionDataArray = keys.map(key => {
      const data = this.sankeyDataMap.get(key);
      if (!data) {
        return null;
      }
      const superValues = this.sankeySuperValuesMap.get(key) ?? [];
      return {
        key,
        data,
        investorRegions: superValues
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
    
    const filtered = data.filter(record =>
      assetFlowQuarterInTimeWindow(record.Asset_Flow_Date, startDate, endDate)
    );
    return filtered;
  }

  /**
   * Applies filter bar selections (investor region, investor type, product region, product type, product sub-type)
   * to the given data. Used so the Sankey only reflects currently selected filters; Dimension 1 then controls grouping.
   */
  private filterDataByFilterBar(data: AssetFlowRecord[]): AssetFlowRecord[] {
    if (!data || data.length === 0) return data;
    let result = data;

    if (this.selectedInvestorRegions?.length) {
      result = result.filter(r => this.selectedInvestorRegions!.includes(r.Investor_Region));
    }
    if (this.selectedInvestorTypes?.length) {
      result = result.filter(r => {
        const t = r.Plan_Type ?? r.Investor_Types;
        return t && this.selectedInvestorTypes!.includes(t);
      });
    }
    if (this.selectedProductRegions?.length) {
      result = result.filter(r => r.Product_Region != null && this.selectedProductRegions!.includes(r.Product_Region));
    }
    if (this.selectedProductTypes?.length) {
      result = result.filter(r => this.selectedProductTypes!.includes(r.Product_Type));
    }
    if (this.selectedProductSubTypes?.length) {
      result = result.filter(r => this.selectedProductSubTypes!.includes(r.Product_Sub_Type));
    }
    return result;
  }

  /**
   * Converts time horizon string to target date in YYYY-MM format
   * Returns null if time horizon is invalid
   * Uses today's date as the base for calculations
   * @param horizon - The time horizon string (e.g., "Today", "+3 mo", "-6 mo"). If not provided, uses this.timeHorizon
   */
  private getTargetDateFromTimeHorizon(horizon?: string): string | null {
    const timeHorizonToUse = horizon || this.timeHorizon;
    if (/^\d{4}-\d{2}$/.test(timeHorizonToUse.trim())) {
      return timeHorizonToUse.trim();
    }
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
    
    // Update Sankey data when time horizon, data type, or any filter that affects the super dimension changes
    if (changes['timeHorizon'] || changes['timeHorizonStart'] || changes['timeHorizonEnd'] || 
        changes['dataType'] || changes['selectedInvestorRegions'] ||
        changes['selectedProductTypes'] || changes['selectedInvestorTypes'] ||
        changes['selectedProductRegions'] || changes['selectedProductSubTypes']) {
        if (this.rawAssetFlowsData) {
        this.updateSankeyData();
      }
    }
    this.emitChartDimensionsSnapshot();
  }

  /**
   * Restores hierarchy from a saved view (ids must match {@link FlowDimension#id}, dimension3 may be `none`).
   */
  applySavedHierarchyDimensions(saved: SavedChartHierarchyDimensions | undefined): void {
    if (!saved) return;
    this.selectedDimension1 = this.resolveSavedDimension(saved.dimension1, 'dimension1');
    this.selectedDimension2 = this.resolveSavedDimension(saved.dimension2, 'dimension2');
    this.selectedDimension3 = this.resolveSavedDimension(saved.dimension3, 'dimension3');
    if (this.rawAssetFlowsData) {
      this.updateSankeyData();
    }
    this.emitChartDimensionsSnapshot();
  }

  private resolveSavedDimension(
    id: string | undefined,
    slot: 'dimension1' | 'dimension2' | 'dimension3'
  ): FlowDimension | null {
    const normalized = typeof id === 'string' && id.length > 0 ? id : '';
    if (slot === 'dimension3' && normalized === 'none') {
      return { ...this.defaultDimension3None };
    }
    const found = this.availableDimensions.find((d) => d.id === normalized);
    if (found) {
      return { ...found };
    }
    if (slot === 'dimension1') {
      return this.availableDimensions.find((d) => d.id === 'investor-region') ?? null;
    }
    if (slot === 'dimension2') {
      return this.availableDimensions.find((d) => d.id === 'product-type') ?? null;
    }
    return (
      this.availableDimensions.find((d) => d.id === 'product-sub-types') ?? {
        ...this.defaultDimension3None,
      }
    );
  }

  private emitChartDimensionsSnapshot(): void {
    this.chartDimensionsSnapshot.emit({
      dimension1: this.selectedDimension1?.id || 'investor-region',
      dimension2: this.selectedDimension2?.id || 'product-type',
      dimension3: this.selectedDimension3?.id || 'product-sub-types',
    });
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
    this.emitChartDimensionsSnapshot();
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
    this.emitChartDimensionsSnapshot();
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
   * Dimension 1 controls the super level (Super Start/End nodes).
   * Dimension 2 controls the parent level, Dimension 3 controls the leaf level.
   */
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

  /**
   * Returns the selected values for splitting/filtering Sankey data based on dimension 1.
   * When dim1 is Investor_Region, uses selectedInvestorRegions.
   * Otherwise uses the matching filter for that dimension.
   */
  private getSuperDimensionValues(): { values: string[] } {
    const dim1Id = this.selectedDimension1?.id || 'investor-region';
    switch (dim1Id) {
      case 'investor-region':
        return { values: this.selectedInvestorRegions || [] };
      case 'product-type':
        return { values: this.selectedProductTypes || [] };
      case 'investor-type':
        return { values: this.selectedInvestorTypes || [] };
      case 'product-region':
        return { values: this.selectedProductRegions || [] };
      case 'product-sub-types':
        return { values: this.selectedProductSubTypes || [] };
      default:
        return { values: this.selectedInvestorRegions || [] };
    }
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

  onOpenExportModal(): void {
    this.showExportModal = true;
  }

  onCloseExportModal(): void {
    this.showExportModal = false;
  }

  async onExportPNG(): Promise<void> {
    await this.waitForChartExportPaint();
    const root = this.chartExportRoot?.nativeElement;
    if (root && this.regionDataArray.length > 0) {
      try {
        const dataUrl = await captureChartAreaToPng(root);
        if (dataUrl) {
          downloadDataUrlAsPng(dataUrl, `${this.getExportBaseName()}-sankey.png`);
          return;
        }
      } catch (e) {
        console.warn('Sankey chart PNG capture failed; falling back to data table', e);
      }
    }
    const rows = this.buildExportRows();
    if (rows.length === 0) {
      return;
    }
    const canvas = this.buildTableCanvas('Asset Flows - Sankey Export', rows, 35);
    this.downloadCanvasAsPng(canvas, `${this.getExportBaseName()}-sankey.png`);
  }

  async onExportPDF(): Promise<void> {
    await this.waitForChartExportPaint();
    const root = this.chartExportRoot?.nativeElement;
    if (root && this.regionDataArray.length > 0) {
      try {
        const dataUrl = await captureChartAreaToPng(root);
        if (dataUrl) {
          await saveChartAsMultiPagePdf({
            imageDataUrl: dataUrl,
            filename: `${this.getExportBaseName()}-sankey.pdf`,
            fitSinglePage: true,
          });
          return;
        }
      } catch (e) {
        console.warn('Sankey chart PDF capture failed; falling back to data table', e);
      }
    }
    const rows = this.buildExportRows();
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;

    const maxRows = 35;
    const printableRows = rows.slice(0, maxRows);
    const cols = ['Region', 'Source', 'Target', 'Flow ($B)'];
    const colX = [margin, margin + 150, margin + 360, pageWidth - margin - 120];

    pdf.setFontSize(11);
    cols.forEach((col, idx) => pdf.text(col, colX[idx], y));
    y += 12;
    pdf.line(margin, y, pageWidth - margin, y);
    y += 14;
    pdf.setFontSize(9);

    printableRows.forEach((row) => {
      if (y > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(String(row.Region ?? ''), colX[0], y);
      pdf.text(String(row.Source ?? ''), colX[1], y);
      pdf.text(String(row.Target ?? ''), colX[2], y);
      pdf.text(String(row['Flow ($B)'] ?? ''), colX[3], y);
      y += 12;
    });

    if (rows.length > maxRows) {
      y += 8;
      pdf.setFontSize(9);
      pdf.text(`Showing ${maxRows} of ${rows.length} rows. Use XLS for full dataset.`, margin, y);
    }

    pdf.save(`${this.getExportBaseName()}-sankey.pdf`);
  }

  private buildTableCanvas(
    heading: string,
    rows: Array<{ Region: string; Source: string; Target: string; 'Flow ($B)': number }>,
    maxRows: number
  ): HTMLCanvasElement {
    const printableRows = rows.slice(0, maxRows);
    const width = 1400;
    const rowHeight = 28;
    const height = 170 + (printableRows.length * rowHeight) + (rows.length > maxRows ? 40 : 0);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return canvas;
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#00113f';
    ctx.font = 'bold 28px Arial';
    ctx.fillText(heading, 40, 48);
    ctx.font = '16px Arial';
    const horizon = this.timeHorizonStart && this.timeHorizonEnd ? `${this.timeHorizonStart} to ${this.timeHorizonEnd}` : this.timeHorizon;
    ctx.fillText(`Time Horizon: ${horizon}`, 40, 78);

    const colX = [40, 290, 720, 1200];
    const headers = ['Region', 'Source', 'Target', 'Flow ($B)'];
    ctx.font = 'bold 16px Arial';
    headers.forEach((h, idx) => ctx.fillText(h, colX[idx], 115));
    ctx.strokeStyle = '#d1d5db';
    ctx.beginPath();
    ctx.moveTo(40, 126);
    ctx.lineTo(width - 40, 126);
    ctx.stroke();

    ctx.font = '14px Arial';
    printableRows.forEach((row, idx) => {
      const y = 152 + (idx * rowHeight);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(String(row.Region ?? ''), colX[0], y);
      ctx.fillText(String(row.Source ?? ''), colX[1], y);
      ctx.fillText(String(row.Target ?? ''), colX[2], y);
      ctx.fillText(String(row['Flow ($B)'] ?? ''), colX[3], y);
    });

    if (rows.length > maxRows) {
      ctx.fillStyle = '#475569';
      ctx.font = '13px Arial';
      ctx.fillText(`Showing ${maxRows} of ${rows.length} rows.`, 40, height - 18);
    }
    return canvas;
  }

  private downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string): void {
    if (canvas.toBlob) {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 'image/png');
      return;
    }
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private buildExportRows(): Array<{ Region: string; Source: string; Target: string; 'Flow ($B)': number }> {
    const rows: Array<{ Region: string; Source: string; Target: string; 'Flow ($B)': number }> = [];
    this.regionDataArray.forEach((regionData) => {
      const region = regionData.key;
      const links = regionData.data?.links ?? [];
      links.forEach((link) => {
        rows.push({
          Region: region,
          Source: link.source,
          Target: link.target,
          'Flow ($B)': Number(link.value ?? 0),
        });
      });
    });
    return rows;
  }

  private getExportBaseName(): string {
    const horizon = (this.timeHorizonStart && this.timeHorizonEnd)
      ? `${this.timeHorizonStart}-to-${this.timeHorizonEnd}`
      : this.timeHorizon;
    return `asset-flows-${horizon}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  private getExportTimeLine(): string {
    return this.timeHorizonStart && this.timeHorizonEnd
      ? `${this.timeHorizonStart} to ${this.timeHorizonEnd}`
      : this.timeHorizon;
  }

  /** Let the export modal close and the chart repaint before reading the DOM. */
  private async waitForChartExportPaint(): Promise<void> {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    await new Promise((r) => setTimeout(r, 100));
  }

  /**
   * Get filter options extracted from the asset flows data
   * @returns FilterOptions object or undefined if data hasn't loaded yet
   */
  getFilterOptions(): FilterOptions | undefined {
    return this.filterOptions;
  }
}
