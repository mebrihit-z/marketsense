import { Component, ElementRef, AfterViewInit, OnDestroy, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import * as d3 from 'd3';

interface TreemapDataNode {
  name: string;
  value: number;
  percentage: number;
  children?: TreemapDataNode[];
}

// Extended hierarchy node with treemap layout properties
interface TreemapNode extends d3.HierarchyNode<TreemapDataNode> {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/* eslint-disable import/prefer-default-export */
@Component({
  selector: 'app-treemap',
  standalone: true,
  imports: [],
  templateUrl: './treemap.component.html',
  styleUrl: './treemap.component.scss'
})
export class TreemapComponent implements AfterViewInit, OnDestroy, OnChanges {
  // eslint-disable-next-line no-underscore-dangle
  private _dimension1Id: string | null = null;
  // eslint-disable-next-line no-underscore-dangle
  private _dimension1Values: string[] = [];
  // eslint-disable-next-line no-underscore-dangle
  private _dimension2Id: string | null = null;
  // eslint-disable-next-line no-underscore-dangle
  private _dimension2Values: string[] = [];
  
  // Legacy inputs for backward compatibility
  // eslint-disable-next-line no-underscore-dangle
  private _selectedProductRegions: string[] = [];
  // eslint-disable-next-line no-underscore-dangle
  private _selectedProductTypes: string[] = [];
  
  @Input() 
  set dimension1Id(value: string | null) {
    // eslint-disable-next-line no-underscore-dangle
    this._dimension1Id = value || null;
  }
  get dimension1Id(): string | null {
    // eslint-disable-next-line no-underscore-dangle
    return this._dimension1Id;
  }
  
  @Input() 
  set dimension1Values(value: string[]) {
    // eslint-disable-next-line no-underscore-dangle
    this._dimension1Values = value || [];
  }
  get dimension1Values(): string[] {
    // eslint-disable-next-line no-underscore-dangle
    return this._dimension1Values;
  }
  
  @Input() 
  set dimension2Id(value: string | null) {
    // eslint-disable-next-line no-underscore-dangle
    this._dimension2Id = value || null;
  }
  get dimension2Id(): string | null {
    // eslint-disable-next-line no-underscore-dangle
    return this._dimension2Id;
  }
  
  @Input() 
  set dimension2Values(value: string[]) {
    // eslint-disable-next-line no-underscore-dangle
    this._dimension2Values = value || [];
  }
  get dimension2Values(): string[] {
    // eslint-disable-next-line no-underscore-dangle
    return this._dimension2Values;
  }
  
  // Legacy inputs for backward compatibility
  @Input() 
  set selectedProductRegions(value: string[]) {
    // eslint-disable-next-line no-underscore-dangle
    this._selectedProductRegions = value || [];
    // If dimension1Id is not set, use legacy behavior
    if (!this._dimension1Id) {
      // eslint-disable-next-line no-underscore-dangle
      this._dimension1Id = 'product-region';
      // eslint-disable-next-line no-underscore-dangle
      this._dimension1Values = value || [];
    }
  }
  get selectedProductRegions(): string[] {
    // eslint-disable-next-line no-underscore-dangle
    return this._selectedProductRegions;
  }
  
  @Input() 
  set selectedProductTypes(value: string[]) {
    // eslint-disable-next-line no-underscore-dangle
    this._selectedProductTypes = value || [];
    // If dimension2Id is not set, use legacy behavior
    if (!this._dimension2Id) {
      // eslint-disable-next-line no-underscore-dangle
      this._dimension2Id = 'product-type';
      // eslint-disable-next-line no-underscore-dangle
      this._dimension2Values = value || [];
    }
  }
  get selectedProductTypes(): string[] {
    // eslint-disable-next-line no-underscore-dangle
    return this._selectedProductTypes;
  }
  
  @Output() cellClick = new EventEmitter<{
    name: string;
    value: number;
    percentage: number;
    regionName?: string;
    dimension1Name?: string;
    dimension2Name?: string;
  }>();
  
  private resizeObserver?: ResizeObserver;

  constructor(private el: ElementRef) {}

  /**
   * Angular lifecycle hook called after the view is initialized.
   * @returns Nothing.
   */
  ngAfterViewInit(): void {
    // Initial creation - inputs should be set by now
    this.createTreemap();
    this.setupResizeObserver();
  }

  /**
   * Angular lifecycle hook called when the component is destroyed.
   * @returns Nothing.
   */
  ngOnDestroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  /**
   * Angular lifecycle hook that responds to input changes.
   * @param changes - Object containing changed properties and their current/previous values.
   * @returns Nothing.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedProductRegions'] || changes['selectedProductTypes'] || 
        changes['dimension1Id'] || changes['dimension1Values'] || 
        changes['dimension2Id'] || changes['dimension2Values']) {
      // Recreate treemap when filters change (only if view is initialized)
      const container = this.el.nativeElement.querySelector('.treemap-container');
      if (container) {
        this.createTreemap();
      }
    }
  }

  /**
   * Sets up a ResizeObserver to recreate the treemap when the container is resized.
   * @returns Nothing.
   */
  private setupResizeObserver(): void {
    const element = this.el.nativeElement.querySelector('.treemap-container');
    if (element && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        // Clear and recreate on resize
        const svg = element.querySelector('svg');
        if (svg) {
          svg.remove();
        }
        this.createTreemap();
      });
      this.resizeObserver.observe(element);
    }
  }

  /**
   * Gets a CSS variable value from the document root.
   * @param name - The CSS variable name (e.g., '--green-light').
   * @param fallback - Optional fallback value if the variable is not found.
   * @returns The CSS variable value or the fallback.
   */
  private static getCssVariable(name: string, fallback: string = ''): string {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim() || fallback;
  }

  /**
   * Gets the color for a given percentage value (positive/negative/neutral).
   * @param percentage - The percentage value to determine color for.
   * @returns The CSS color value.
   */
  private getColorForPercentage(percentage: number): string {
    const neutralThreshold = 0.5; // Treat values between -0.5 and +0.5 as neutral
    
    if (Math.abs(percentage) <= neutralThreshold) {
      // Light gray for neutral (values close to zero)
      return TreemapComponent.getCssVariable('--bg-gray-medium', '#e5e7eb');
    } else if (percentage > 0) {
      // Green for inflow/positive
      return TreemapComponent.getCssVariable('--green-light', '#86efac');
    } else {
      // Pink for outflow/negative
      return TreemapComponent.getCssVariable('--red-light', '#fca5a5');
    }
  }

  /**
   * Gets the border color for a given percentage value.
   * @param percentage - The percentage value to determine border color for.
   * @returns The CSS color value for the border.
   */
  private getBorderColorForPercentage(percentage: number): string {
    const neutralThreshold = 0.5; // Treat values between -0.5 and +0.5 as neutral
    
    if (Math.abs(percentage) <= neutralThreshold) {
      return TreemapComponent.getCssVariable('--gray-medium', '#6b7280');
    } else if (percentage > 0) {
      return TreemapComponent.getCssVariable('--green-dark', '#10b981');
    } else {
      return TreemapComponent.getCssVariable('--red-dark', '#ef4444');
    }
  }

  /**
   * Gets the raw treemap data organized by all possible dimension combinations.
   * @returns The raw data structure with all dimension combinations.
   */
  private getRawData(): Array<{
    'product-region': string;
    'product-type': string;
    'product-sub-types': string;
    'investor-region': string;
    'investor-type': string;
    value: number;
    percentage: number;
  }> {
    // Comprehensive data structure with all dimension combinations
    return [
      // United States combinations with product sub-types - Equity
      { 'product-region': 'United States', 'product-type': 'Equity', 'product-sub-types': 'US Equity Large Cap', 'investor-region': 'United States', 'investor-type': 'Institutional', value: 120, percentage: 6.8 },
      { 'product-region': 'United States', 'product-type': 'Equity', 'product-sub-types': 'US Equity Small Cap', 'investor-region': 'United States', 'investor-type': 'Institutional', value: 85, percentage: 5.2 },
      { 'product-region': 'United States', 'product-type': 'Equity', 'product-sub-types': 'Global Equity', 'investor-region': 'United States', 'investor-type': 'Institutional', value: 50, percentage: 4.1 },
      { 'product-region': 'United States', 'product-type': 'Equity', 'product-sub-types': 'Emerging Markets', 'investor-region': 'United States', 'investor-type': 'Institutional', value: 30, percentage: 3.5 },
      // United States - Fixed Income
      { 'product-region': 'United States', 'product-type': 'Fixed Income', 'product-sub-types': 'Core Investment Grade', 'investor-region': 'United States', 'investor-type': 'Institutional', value: 100, percentage: 3.5 },
      { 'product-region': 'United States', 'product-type': 'Fixed Income', 'product-sub-types': 'Municipal Bond', 'investor-region': 'United States', 'investor-type': 'Institutional', value: 65, percentage: 2.8 },
      { 'product-region': 'United States', 'product-type': 'Fixed Income', 'product-sub-types': 'High Yield Bonds', 'investor-region': 'United States', 'investor-type': 'Institutional', value: 50, percentage: 2.2 },
      // United States - Alternatives
      { 'product-region': 'United States', 'product-type': 'Alternatives', 'product-sub-types': 'Hedge Funds', 'investor-region': 'United States', 'investor-type': 'Institutional', value: 120, percentage: 3.5 },
      { 'product-region': 'United States', 'product-type': 'Alternatives', 'product-sub-types': 'Crypto', 'investor-region': 'United States', 'investor-type': 'Institutional', value: 60, percentage: 2.1 },
      { 'product-region': 'United States', 'product-type': 'Alternatives', 'product-sub-types': 'Commodities', 'investor-region': 'United States', 'investor-type': 'Institutional', value: 35, percentage: 1.5 },
      // United States - Cash
      { 'product-region': 'United States', 'product-type': 'Cash', 'product-sub-types': 'Money Market Funds', 'investor-region': 'United States', 'investor-type': 'Institutional', value: 25, percentage: 1.2 },
      { 'product-region': 'United States', 'product-type': 'Cash', 'product-sub-types': 'Treasury Bills', 'investor-region': 'United States', 'investor-type': 'Institutional', value: 15, percentage: 0.8 },
      { 'product-region': 'United States', 'product-type': 'Cash', 'product-sub-types': 'Bank Deposits/CDs', 'investor-region': 'United States', 'investor-type': 'Institutional', value: 5, percentage: 0.3 },
      // United States - Private Markets
      { 'product-region': 'United States', 'product-type': 'Private Markets', 'product-sub-types': 'Private Equity', 'investor-region': 'United States', 'investor-type': 'Pension Funds', value: 50, percentage: 12.5 },
      { 'product-region': 'United States', 'product-type': 'Private Markets', 'product-sub-types': 'Private Credit', 'investor-region': 'United States', 'investor-type': 'Pension Funds', value: 30, percentage: 8.2 },
      { 'product-region': 'United States', 'product-type': 'Private Markets', 'product-sub-types': 'Venture Capita', 'investor-region': 'United States', 'investor-type': 'Pension Funds', value: 15, percentage: 5.5 },
      // United States - Real Estate
      { 'product-region': 'United States', 'product-type': 'Real Estate', 'product-sub-types': 'Real Estate', 'investor-region': 'United States', 'investor-type': 'Corporate', value: 95, percentage: -7.2 },
      // United States - Other/Specialized
      { 'product-region': 'United States', 'product-type': 'Other/Specialized', 'product-sub-types': 'Overlay Strategies', 'investor-region': 'United States', 'investor-type': 'Family Office', value: 60, percentage: -7.2 },
      { 'product-region': 'United States', 'product-type': 'Other/Specialized', 'product-sub-types': 'Factor Based Investing', 'investor-region': 'United States', 'investor-type': 'Family Office', value: 35, percentage: -4.5 },
      // United States - Multi-Asset
      { 'product-region': 'United States', 'product-type': 'Multi-Asset', 'product-sub-types': 'Diversified Growth Funds', 'investor-region': 'United States', 'investor-type': 'Endowments', value: 45, percentage: 4.5 },
      { 'product-region': 'United States', 'product-type': 'Multi-Asset', 'product-sub-types': 'Target Date Funds', 'investor-region': 'United States', 'investor-type': 'Endowments', value: 30, percentage: 3.2 },
      
      // Europe combinations with product sub-types - Equity
      { 'product-region': 'Europe', 'product-type': 'Equity', 'product-sub-types': 'Global Equity', 'investor-region': 'Europe', 'investor-type': 'Institutional', value: 100, percentage: 2.5 },
      { 'product-region': 'Europe', 'product-type': 'Equity', 'product-sub-types': 'Emerging Markets', 'investor-region': 'Europe', 'investor-type': 'Institutional', value: 60, percentage: 1.8 },
      { 'product-region': 'Europe', 'product-type': 'Equity', 'product-sub-types': 'US Equity Large Cap', 'investor-region': 'Europe', 'investor-type': 'Institutional', value: 35, percentage: 1.2 },
      // Europe - Fixed Income
      { 'product-region': 'Europe', 'product-type': 'Fixed Income', 'product-sub-types': 'Global Bonds', 'investor-region': 'Europe', 'investor-type': 'Institutional', value: 120, percentage: 4.8 },
      { 'product-region': 'Europe', 'product-type': 'Fixed Income', 'product-sub-types': 'Government/Sovereign', 'investor-region': 'Europe', 'investor-type': 'Institutional', value: 70, percentage: 3.2 },
      { 'product-region': 'Europe', 'product-type': 'Fixed Income', 'product-sub-types': 'Credit Long Duration', 'investor-region': 'Europe', 'investor-type': 'Institutional', value: 45, percentage: 2.1 },
      // Europe - Alternatives
      { 'product-region': 'Europe', 'product-type': 'Alternatives', 'product-sub-types': 'Commodities', 'investor-region': 'Europe', 'investor-type': 'Pension Funds', value: 60, percentage: 9.5 },
      { 'product-region': 'Europe', 'product-type': 'Alternatives', 'product-sub-types': 'Hedge Funds', 'investor-region': 'Europe', 'investor-type': 'Pension Funds', value: 35, percentage: 6.2 },
      { 'product-region': 'Europe', 'product-type': 'Alternatives', 'product-sub-types': 'Crypto', 'investor-region': 'Europe', 'investor-type': 'Pension Funds', value: 10, percentage: 2.1 },
      // Europe - Cash
      { 'product-region': 'Europe', 'product-type': 'Cash', 'product-sub-types': 'Treasury Bills', 'investor-region': 'Europe', 'investor-type': 'Corporate', value: 25, percentage: 1.8 },
      { 'product-region': 'Europe', 'product-type': 'Cash', 'product-sub-types': 'Money Market Funds', 'investor-region': 'Europe', 'investor-type': 'Corporate', value: 12, percentage: 0.9 },
      { 'product-region': 'Europe', 'product-type': 'Cash', 'product-sub-types': 'Foreign Currency/FFX', 'investor-region': 'Europe', 'investor-type': 'Corporate', value: 5, percentage: 0.4 },
      // Europe - Private Markets
      { 'product-region': 'Europe', 'product-type': 'Private Markets', 'product-sub-types': 'Private Credit', 'investor-region': 'Europe', 'investor-type': 'Sovereign Wealth', value: 50, percentage: 12.5 },
      { 'product-region': 'Europe', 'product-type': 'Private Markets', 'product-sub-types': 'Private Equity', 'investor-region': 'Europe', 'investor-type': 'Sovereign Wealth', value: 30, percentage: 8.5 },
      { 'product-region': 'Europe', 'product-type': 'Private Markets', 'product-sub-types': 'Co-Investment', 'investor-region': 'Europe', 'investor-type': 'Sovereign Wealth', value: 15, percentage: 5.2 },
      // Europe - Real Estate
      { 'product-region': 'Europe', 'product-type': 'Real Estate', 'product-sub-types': 'Real Estate', 'investor-region': 'Europe', 'investor-type': 'Family Office', value: 32, percentage: -4.5 },
      // Europe - Other/Specialized
      { 'product-region': 'Europe', 'product-type': 'Other/Specialized', 'product-sub-types': 'Factor Based Investing', 'investor-region': 'Europe', 'investor-type': 'Endowments', value: 35, percentage: 7.9 },
      { 'product-region': 'Europe', 'product-type': 'Other/Specialized', 'product-sub-types': 'Overlay Strategies', 'investor-region': 'Europe', 'investor-type': 'Endowments', value: 23, percentage: 5.2 },
      // Europe - Multi-Asset
      { 'product-region': 'Europe', 'product-type': 'Multi-Asset', 'product-sub-types': 'Target Date Funds', 'investor-region': 'Europe', 'investor-type': 'Institutional', value: 40, percentage: 3.9 },
      { 'product-region': 'Europe', 'product-type': 'Multi-Asset', 'product-sub-types': 'Diversified Growth Funds', 'investor-region': 'Europe', 'investor-type': 'Institutional', value: 28, percentage: 2.8 },
      
      // Asia Pacific combinations with product sub-types - Equity
      { 'product-region': 'Asia Pacific', 'product-type': 'Equity', 'product-sub-types': 'Emerging Markets', 'investor-region': 'Asia Pacific', 'investor-type': 'Institutional', value: 100, percentage: -0.8 },
      { 'product-region': 'Asia Pacific', 'product-type': 'Equity', 'product-sub-types': 'Global Equity', 'investor-region': 'Asia Pacific', 'investor-type': 'Institutional', value: 60, percentage: -0.5 },
      { 'product-region': 'Asia Pacific', 'product-type': 'Equity', 'product-sub-types': 'US Equity Large Cap', 'investor-region': 'Asia Pacific', 'investor-type': 'Institutional', value: 38, percentage: -0.3 },
      // Asia Pacific - Fixed Income
      { 'product-region': 'Asia Pacific', 'product-type': 'Fixed Income', 'product-sub-types': 'Government/Sovereign', 'investor-region': 'Asia Pacific', 'investor-type': 'Institutional', value: 85, percentage: 2.2 },
      { 'product-region': 'Asia Pacific', 'product-type': 'Fixed Income', 'product-sub-types': 'Global Bonds', 'investor-region': 'Asia Pacific', 'investor-type': 'Institutional', value: 55, percentage: 1.8 },
      { 'product-region': 'Asia Pacific', 'product-type': 'Fixed Income', 'product-sub-types': 'Short Duration', 'investor-region': 'Asia Pacific', 'investor-type': 'Institutional', value: 28, percentage: 1.2 },
      // Asia Pacific - Alternatives
      { 'product-region': 'Asia Pacific', 'product-type': 'Alternatives', 'product-sub-types': 'Crypto', 'investor-region': 'Asia Pacific', 'investor-type': 'Sovereign Wealth', value: 50, percentage: 6.5 },
      { 'product-region': 'Asia Pacific', 'product-type': 'Alternatives', 'product-sub-types': 'Hedge Funds', 'investor-region': 'Asia Pacific', 'investor-type': 'Sovereign Wealth', value: 25, percentage: 4.2 },
      { 'product-region': 'Asia Pacific', 'product-type': 'Alternatives', 'product-sub-types': 'Commodities', 'investor-region': 'Asia Pacific', 'investor-type': 'Sovereign Wealth', value: 10, percentage: 2.1 },
      // Asia Pacific - Cash
      { 'product-region': 'Asia Pacific', 'product-type': 'Cash', 'product-sub-types': 'Bank Deposits/CDs', 'investor-region': 'Asia Pacific', 'investor-type': 'Corporate', value: 22, percentage: 1.5 },
      { 'product-region': 'Asia Pacific', 'product-type': 'Cash', 'product-sub-types': 'Money Market Funds', 'investor-region': 'Asia Pacific', 'investor-type': 'Corporate', value: 12, percentage: 0.9 },
      { 'product-region': 'Asia Pacific', 'product-type': 'Cash', 'product-sub-types': 'Treasury Bills', 'investor-region': 'Asia Pacific', 'investor-type': 'Corporate', value: 4, percentage: 0.3 },
      // Asia Pacific - Private Markets
      { 'product-region': 'Asia Pacific', 'product-type': 'Private Markets', 'product-sub-types': 'Venture Capita', 'investor-region': 'Asia Pacific', 'investor-type': 'Pension Funds', value: 50, percentage: 12.5 },
      { 'product-region': 'Asia Pacific', 'product-type': 'Private Markets', 'product-sub-types': 'Private Equity', 'investor-region': 'Asia Pacific', 'investor-type': 'Pension Funds', value: 30, percentage: 8.5 },
      { 'product-region': 'Asia Pacific', 'product-type': 'Private Markets', 'product-sub-types': 'Private Credit', 'investor-region': 'Asia Pacific', 'investor-type': 'Pension Funds', value: 15, percentage: 5.2 },
      // Asia Pacific - Real Estate
      { 'product-region': 'Asia Pacific', 'product-type': 'Real Estate', 'product-sub-types': 'Real Estate', 'investor-region': 'Asia Pacific', 'investor-type': 'Family Office', value: 69, percentage: -3.2 },
      // Asia Pacific - Other/Specialized
      { 'product-region': 'Asia Pacific', 'product-type': 'Other/Specialized', 'product-sub-types': 'Overlay Strategies', 'investor-region': 'Asia Pacific', 'investor-type': 'Endowments', value: 55, percentage: -7.2 },
      { 'product-region': 'Asia Pacific', 'product-type': 'Other/Specialized', 'product-sub-types': 'Factor Based Investing', 'investor-region': 'Asia Pacific', 'investor-type': 'Endowments', value: 40, percentage: -5.2 },
      // Asia Pacific - Multi-Asset
      { 'product-region': 'Asia Pacific', 'product-type': 'Multi-Asset', 'product-sub-types': 'Diversified Growth Funds', 'investor-region': 'Asia Pacific', 'investor-type': 'Institutional', value: 32, percentage: 3.2 },
      { 'product-region': 'Asia Pacific', 'product-type': 'Multi-Asset', 'product-sub-types': 'Target Date Funds', 'investor-region': 'Asia Pacific', 'investor-type': 'Institutional', value: 20, percentage: 2.1 },
      
      // United Kingdom combinations with product sub-types - Equity
      { 'product-region': 'United Kingdom', 'product-type': 'Equity', 'product-sub-types': 'US Equity Small Cap', 'investor-region': 'United Kingdom', 'investor-type': 'Institutional', value: 75, percentage: 4.2 },
      { 'product-region': 'United Kingdom', 'product-type': 'Equity', 'product-sub-types': 'Global Equity', 'investor-region': 'United Kingdom', 'investor-type': 'Institutional', value: 50, percentage: 3.1 },
      { 'product-region': 'United Kingdom', 'product-type': 'Equity', 'product-sub-types': 'Mid Cap Growth', 'investor-region': 'United Kingdom', 'investor-type': 'Institutional', value: 20, percentage: 1.8 },
      // United Kingdom - Fixed Income
      { 'product-region': 'United Kingdom', 'product-type': 'Fixed Income', 'product-sub-types': 'Municipal Bond', 'investor-region': 'United Kingdom', 'investor-type': 'Institutional', value: 65, percentage: 3.1 },
      { 'product-region': 'United Kingdom', 'product-type': 'Fixed Income', 'product-sub-types': 'Core Investment Grade', 'investor-region': 'United Kingdom', 'investor-type': 'Institutional', value: 40, percentage: 2.2 },
      { 'product-region': 'United Kingdom', 'product-type': 'Fixed Income', 'product-sub-types': 'Global Bonds', 'investor-region': 'United Kingdom', 'investor-type': 'Institutional', value: 20, percentage: 1.5 },
      // United Kingdom - Alternatives
      { 'product-region': 'United Kingdom', 'product-type': 'Alternatives', 'product-sub-types': 'Hedge Funds', 'investor-region': 'United Kingdom', 'investor-type': 'Pension Funds', value: 45, percentage: 8.5 },
      { 'product-region': 'United Kingdom', 'product-type': 'Alternatives', 'product-sub-types': 'Commodities', 'investor-region': 'United Kingdom', 'investor-type': 'Pension Funds', value: 20, percentage: 5.2 },
      { 'product-region': 'United Kingdom', 'product-type': 'Alternatives', 'product-sub-types': 'Crypto', 'investor-region': 'United Kingdom', 'investor-type': 'Pension Funds', value: 10, percentage: 2.8 },
      // United Kingdom - Cash
      { 'product-region': 'United Kingdom', 'product-type': 'Cash', 'product-sub-types': 'Foreign Currency/FFX', 'investor-region': 'United Kingdom', 'investor-type': 'Corporate', value: 20, percentage: 1.1 },
      { 'product-region': 'United Kingdom', 'product-type': 'Cash', 'product-sub-types': 'Money Market Funds', 'investor-region': 'United Kingdom', 'investor-type': 'Corporate', value: 10, percentage: 0.7 },
      { 'product-region': 'United Kingdom', 'product-type': 'Cash', 'product-sub-types': 'Treasury Bills', 'investor-region': 'United Kingdom', 'investor-type': 'Corporate', value: 5, percentage: 0.4 },
      // United Kingdom - Private Markets
      { 'product-region': 'United Kingdom', 'product-type': 'Private Markets', 'product-sub-types': 'Co-Investment', 'investor-region': 'United Kingdom', 'investor-type': 'Sovereign Wealth', value: 50, percentage: 12.5 },
      { 'product-region': 'United Kingdom', 'product-type': 'Private Markets', 'product-sub-types': 'Private Equity', 'investor-region': 'United Kingdom', 'investor-type': 'Sovereign Wealth', value: 30, percentage: 8.5 },
      { 'product-region': 'United Kingdom', 'product-type': 'Private Markets', 'product-sub-types': 'Private Credit', 'investor-region': 'United Kingdom', 'investor-type': 'Sovereign Wealth', value: 15, percentage: 5.2 },
      // United Kingdom - Real Estate
      { 'product-region': 'United Kingdom', 'product-type': 'Real Estate', 'product-sub-types': 'Real Estate', 'investor-region': 'United Kingdom', 'investor-type': 'Family Office', value: 69, percentage: -3.2 },
      // United Kingdom - Other/Specialized
      { 'product-region': 'United Kingdom', 'product-type': 'Other/Specialized', 'product-sub-types': 'Factor Based Investing', 'investor-region': 'United Kingdom', 'investor-type': 'Endowments', value: 55, percentage: -7.2 },
      { 'product-region': 'United Kingdom', 'product-type': 'Other/Specialized', 'product-sub-types': 'Overlay Strategies', 'investor-region': 'United Kingdom', 'investor-type': 'Endowments', value: 40, percentage: -5.2 },
      // United Kingdom - Multi-Asset
      { 'product-region': 'United Kingdom', 'product-type': 'Multi-Asset', 'product-sub-types': 'Target Date Funds', 'investor-region': 'United Kingdom', 'investor-type': 'Institutional', value: 28, percentage: 2.8 },
      { 'product-region': 'United Kingdom', 'product-type': 'Multi-Asset', 'product-sub-types': 'Diversified Growth Funds', 'investor-region': 'United Kingdom', 'investor-type': 'Institutional', value: 20, percentage: 2.1 },
      
      // Middle East & Africa combinations with product sub-types - Equity
      { 'product-region': 'Middle East & Africa', 'product-type': 'Equity', 'product-sub-types': 'Mid Cap Growth', 'investor-region': 'Middle East & Africa', 'investor-type': 'Institutional', value: 50, percentage: 2.8 },
      { 'product-region': 'Middle East & Africa', 'product-type': 'Equity', 'product-sub-types': 'Emerging Markets', 'investor-region': 'Middle East & Africa', 'investor-type': 'Institutional', value: 30, percentage: 2.1 },
      { 'product-region': 'Middle East & Africa', 'product-type': 'Equity', 'product-sub-types': 'Global Equity', 'investor-region': 'Middle East & Africa', 'investor-type': 'Institutional', value: 18, percentage: 1.5 },
      // Middle East & Africa - Fixed Income
      { 'product-region': 'Middle East & Africa', 'product-type': 'Fixed Income', 'product-sub-types': 'High Yield Bonds', 'investor-region': 'Middle East & Africa', 'investor-type': 'Institutional', value: 45, percentage: 2.5 },
      { 'product-region': 'Middle East & Africa', 'product-type': 'Fixed Income', 'product-sub-types': 'Government/Sovereign', 'investor-region': 'Middle East & Africa', 'investor-type': 'Institutional', value: 28, percentage: 1.8 },
      { 'product-region': 'Middle East & Africa', 'product-type': 'Fixed Income', 'product-sub-types': 'Global Bonds', 'investor-region': 'Middle East & Africa', 'investor-type': 'Institutional', value: 15, percentage: 1.2 },
      // Middle East & Africa - Alternatives
      { 'product-region': 'Middle East & Africa', 'product-type': 'Alternatives', 'product-sub-types': 'Commodities', 'investor-region': 'Middle East & Africa', 'investor-type': 'Sovereign Wealth', value: 35, percentage: 7.2 },
      { 'product-region': 'Middle East & Africa', 'product-type': 'Alternatives', 'product-sub-types': 'Hedge Funds', 'investor-region': 'Middle East & Africa', 'investor-type': 'Sovereign Wealth', value: 15, percentage: 4.5 },
      { 'product-region': 'Middle East & Africa', 'product-type': 'Alternatives', 'product-sub-types': 'Crypto', 'investor-region': 'Middle East & Africa', 'investor-type': 'Sovereign Wealth', value: 5, percentage: 2.1 },
      // Middle East & Africa - Cash
      { 'product-region': 'Middle East & Africa', 'product-type': 'Cash', 'product-sub-types': 'Money Market Funds', 'investor-region': 'Middle East & Africa', 'investor-type': 'Corporate', value: 15, percentage: 0.9 },
      { 'product-region': 'Middle East & Africa', 'product-type': 'Cash', 'product-sub-types': 'Treasury Bills', 'investor-region': 'Middle East & Africa', 'investor-type': 'Corporate', value: 8, percentage: 0.6 },
      { 'product-region': 'Middle East & Africa', 'product-type': 'Cash', 'product-sub-types': 'Bank Deposits/CDs', 'investor-region': 'Middle East & Africa', 'investor-type': 'Corporate', value: 5, percentage: 0.4 },
      // Middle East & Africa - Private Markets
      { 'product-region': 'Middle East & Africa', 'product-type': 'Private Markets', 'product-sub-types': 'Private Equity', 'investor-region': 'Middle East & Africa', 'investor-type': 'Pension Funds', value: 50, percentage: 12.5 },
      { 'product-region': 'Middle East & Africa', 'product-type': 'Private Markets', 'product-sub-types': 'Private Credit', 'investor-region': 'Middle East & Africa', 'investor-type': 'Pension Funds', value: 30, percentage: 8.5 },
      { 'product-region': 'Middle East & Africa', 'product-type': 'Private Markets', 'product-sub-types': 'Venture Capita', 'investor-region': 'Middle East & Africa', 'investor-type': 'Pension Funds', value: 15, percentage: 5.2 },
      // Middle East & Africa - Real Estate
      { 'product-region': 'Middle East & Africa', 'product-type': 'Real Estate', 'product-sub-types': 'Real Estate', 'investor-region': 'Middle East & Africa', 'investor-type': 'Family Office', value: 69, percentage: -3.2 },
      // Middle East & Africa - Other/Specialized
      { 'product-region': 'Middle East & Africa', 'product-type': 'Other/Specialized', 'product-sub-types': 'Overlay Strategies', 'investor-region': 'Middle East & Africa', 'investor-type': 'Endowments', value: 55, percentage: -7.2 },
      { 'product-region': 'Middle East & Africa', 'product-type': 'Other/Specialized', 'product-sub-types': 'Factor Based Investing', 'investor-region': 'Middle East & Africa', 'investor-type': 'Endowments', value: 40, percentage: -5.2 },
      // Middle East & Africa - Multi-Asset
      { 'product-region': 'Middle East & Africa', 'product-type': 'Multi-Asset', 'product-sub-types': 'Diversified Growth Funds', 'investor-region': 'Middle East & Africa', 'investor-type': 'Institutional', value: 23, percentage: 2.1 },
      { 'product-region': 'Middle East & Africa', 'product-type': 'Multi-Asset', 'product-sub-types': 'Target Date Funds', 'investor-region': 'Middle East & Africa', 'investor-type': 'Institutional', value: 15, percentage: 1.5 }
    ];
  }

  /**
   * Filters and prepares data based on selected dimensions.
   * @returns Array of filtered data with their children organized by dimension1 -> dimension2.
   */
  private filterRegionsData(): Array<{ name: string; children: Array<{ name: string; value: number; percentage: number }> }> {
    const rawData = this.getRawData();
    const resultData: Array<{ name: string; children: Array<{ name: string; value: number; percentage: number }> }> = [];
    
    // Get dimension IDs (default to product-region and product-type for backward compatibility)
    const dim1Id = this._dimension1Id || 'product-region';
    const dim2Id = this._dimension2Id || 'product-type';
    const dim1Values = this._dimension1Values.length > 0 ? this._dimension1Values : [];
    const dim2Values = this._dimension2Values.length > 0 ? this._dimension2Values : [];
    
    // If no dimensions are selected, return empty array
    if (!dim1Id || !dim2Id) {
      return resultData;
    }
    
    // Get all unique values for dimension1 and dimension2 from raw data
    const allDim1Values = new Set<string>();
    const allDim2Values = new Set<string>();
    
    rawData.forEach((record) => {
      const dim1Value = record[dim1Id as keyof typeof record] as string;
      const dim2Value = record[dim2Id as keyof typeof record] as string;
      if (dim1Value) allDim1Values.add(dim1Value);
      if (dim2Value) allDim2Values.add(dim2Value);
    });
    
    // Determine which values to show for each dimension
    const dim1ValuesToShow = dim1Values.length > 0 
      ? dim1Values.filter(v => allDim1Values.has(v))
      : Array.from(allDim1Values);
    
    const dim2ValuesToShow = dim2Values.length > 0
      ? dim2Values.filter(v => allDim2Values.has(v))
      : Array.from(allDim2Values);
    
    // Group data by dimension1, aggregating values for dimension2
    const groupedData: { [key: string]: { [key: string]: { value: number; percentage: number } } } = {};
    
    rawData.forEach((record) => {
      const dim1Value = record[dim1Id as keyof typeof record] as string;
      const dim2Value = record[dim2Id as keyof typeof record] as string;
      
      if (!dim1ValuesToShow.includes(dim1Value) || !dim2ValuesToShow.includes(dim2Value)) {
        return;
      }
      
      if (!groupedData[dim1Value]) {
        groupedData[dim1Value] = {};
      }
      
      // Aggregate values if the same dimension1-dimension2 combination appears multiple times
      if (groupedData[dim1Value][dim2Value]) {
        groupedData[dim1Value][dim2Value].value += record.value;
        // Average percentage (or use weighted average if needed)
        groupedData[dim1Value][dim2Value].percentage = 
          (groupedData[dim1Value][dim2Value].percentage + record.percentage) / 2;
      } else {
        groupedData[dim1Value][dim2Value] = {
          value: record.value,
          percentage: record.percentage
        };
      }
    });
    
    // Build result data structure
    dim1ValuesToShow.forEach((dim1Value: string) => {
      const dim1Data = groupedData[dim1Value];
      if (!dim1Data) return;

      const children: Array<{ name: string; value: number; percentage: number }> = [];
      
      dim2ValuesToShow.forEach((dim2Value: string) => {
        const dim2Data = dim1Data[dim2Value];
        if (dim2Data) {
          children.push({
            name: dim2Value,
            value: dim2Data.value,
            percentage: dim2Data.percentage
          });
        }
      });

      // Only add dimension1 group if it has children after filtering
      if (children.length > 0) {
        resultData.push({
          name: dim1Value,
          children: children
        });
      }
    });
    
    return resultData;
  }

  /**
   * Creates the main treemap visualization.
   * @returns Nothing.
   */
  private createTreemap(): void {
    const element = this.el.nativeElement.querySelector('.treemap-container');
    if (!element) return;

    // Clear any existing SVG and tooltip
    d3.select(element).select('svg').remove();
    d3.select(element).select('.treemap-tooltip').remove();

    const regionsData = this.filterRegionsData();
    
    const containerWidth = element.clientWidth || element.offsetWidth || 1200;
    const width = Math.max(containerWidth, 800);
    const height = 500;
    const margin = { top: 30, right: 20, bottom: 60, left: 20 };
    const regionLabelHeight = 25;
    const regionPadding = 5;

    // Calculate total value and region widths
    const totalValue = regionsData.reduce((sum, region) => 
      sum + region.children.reduce((s, child) => s + child.value, 0), 0
    );

    const availableWidth = width - margin.left - margin.right;
    const availableHeight = height - margin.top - margin.bottom - regionLabelHeight;

    const svg = this.createSvg(element, width, height, margin, availableWidth, availableHeight, regionLabelHeight);
    const tooltip = this.createTooltip(element);
    this.drawRegions(svg, regionsData, totalValue, availableWidth, availableHeight, margin, regionLabelHeight, regionPadding, tooltip);
    this.createLegend(svg, height, margin);
  }

  /**
   * Creates and returns the SVG element for the treemap.
   * @param element - The container element.
   * @param width - The width of the SVG.
   * @param height - The height of the SVG.
   * @param margin - Margin configuration.
   * @param availableWidth - Available width for content.
   * @param availableHeight - Available height for content.
   * @param regionLabelHeight - Height reserved for region labels.
   * @returns The D3 selection of the SVG group element.
   */
  private createSvg(
    element: Element,
    width: number,
    height: number,
    margin: { top: number; right: number; bottom: number; left: number },
    availableWidth: number,
    availableHeight: number,
    regionLabelHeight: number
  ): d3.Selection<SVGSVGElement, unknown, null, undefined> {
    const svg = d3.select(element)
      .append('svg')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add background rectangle to the group
    g.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', availableWidth)
      .attr('height', availableHeight + regionLabelHeight)
      .attr('fill', TreemapComponent.getCssVariable('--green-light', 'rgba(134, 239, 172, 0.61)'))
      .attr('rx', 0)
      .attr('ry', 10)
      .attr('stroke', TreemapComponent.getCssVariable('--border-light', 'rgba(0, 0, 0, 0.10)'))
      .attr('stroke-width', 1)
      .style('pointer-events', 'none');

    return svg;
  }

  /**
   * Creates and returns the tooltip element.
   * @param element - The container element.
   * @returns The D3 selection of the tooltip element.
   */
  private createTooltip(element: Element): d3.Selection<HTMLDivElement, unknown, null, undefined> {
    return d3.select(element)
      .append('div')
      .attr('class', 'treemap-tooltip')
      .style('position', 'absolute')
      .style('background-color', TreemapComponent.getCssVariable('--overlay-darker', 'rgba(0, 0, 0, 0.85)'))
      .style('color', TreemapComponent.getCssVariable('--bg-white', 'white'))
      .style('padding', '8px 12px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', '1000')
      .style('box-shadow', '0 2px 8px rgba(0,0,0,0.3)');
  }

  /**
   * Draws all regions in the treemap.
   * @param svg - The SVG selection.
   * @param regionsData - Array of region data to draw.
   * @param totalValue - Total value across all regions.
   * @param availableWidth - Available width for regions.
   * @param availableHeight - Available height for regions.
   * @param margin - Margin configuration.
   * @param regionLabelHeight - Height reserved for region labels.
   * @param regionPadding - Padding between regions.
   * @param tooltip - The tooltip selection.
   * @returns Nothing.
   */
  private drawRegions(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    regionsData: Array<{ name: string; children: Array<{ name: string; value: number; percentage: number }> }>,
    totalValue: number,
    availableWidth: number,
    availableHeight: number,
    margin: { top: number; right: number; bottom: number; left: number },
    regionLabelHeight: number,
    regionPadding: number,
    tooltip: d3.Selection<HTMLDivElement, unknown, null, undefined>
  ): void {
    const g = svg.select('g');
    let currentX = 0;

    regionsData.forEach((regionData: { name: string; children: Array<{ name: string; value: number; percentage: number }> }) => {
      const regionValue = regionData.children.reduce((sum, child) => sum + child.value, 0);
      const regionWidth = (regionValue / totalValue) * availableWidth;
      const regionHeight = availableHeight;

      // Create region group
      const regionGroup = g.append('g')
        .attr('class', 'region')
        .attr('transform', `translate(${currentX}, ${regionLabelHeight})`);

      // Draw region label
      regionGroup.append('text')
        .attr('class', 'region-label')
        .attr('x', 8)
        .attr('y', -5)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'bottom')
        .style('font-size', '12px')
        .style('font-weight', '600')
        .style('fill', TreemapComponent.getCssVariable('--text-primary', '#030213'))
        .text(regionData.name);

      // Create hierarchy for this region
      const regionHierarchy = d3.hierarchy({
        name: regionData.name,
        value: 0,
        percentage: 0,
        children: regionData.children
      } as TreemapDataNode)
        .sum(d => d.value)
        .sort((a, b) => (b.value || 0) - (a.value || 0));

      // Create treemap layout for this region
      const treemapLayout = d3.treemap<TreemapDataNode>()
        .size([regionWidth - regionPadding * 2, regionHeight - regionPadding * 2])
        .paddingInner(2)
        .round(true);

      treemapLayout(regionHierarchy);

      const treemapRoot = regionHierarchy as unknown as TreemapNode;

      this.drawRegionCells(regionGroup, treemapRoot, regionPadding, tooltip, this._dimension2Id);

      currentX += regionWidth;
    });
  }

  /**
   * Draws cells for a region in the treemap.
   * @param regionGroup - The D3 selection of the region group.
   * @param treemapRoot - The treemap hierarchy root node.
   * @param regionPadding - Padding between regions.
   * @param tooltip - The tooltip selection.
   * @param dimension2Id - The ID of dimension 2 to determine if truncation is needed.
   * @returns Nothing.
   */
  private drawRegionCells(
    regionGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    treemapRoot: TreemapNode,
    regionPadding: number,
    tooltip: d3.Selection<HTMLDivElement, unknown, null, undefined>,
    dimension2Id: string | null
  ): void {
    // Draw asset class rectangles
    const cells = regionGroup.selectAll('g.cell')
      .data((treemapRoot.leaves() || []) as TreemapNode[])
      .enter()
      .append('g')
      .attr('class', 'cell')
      .attr('transform', (d: TreemapNode) => `translate(${d.x0 + regionPadding},${d.y0 + regionPadding})`);

    cells.append('rect')
      .attr('width', (d: TreemapNode) => d.x1 - d.x0)
      .attr('height', (d: TreemapNode) => d.y1 - d.y0)
      .attr('fill', (d: TreemapNode) => this.getColorForPercentage(d.data.percentage))
      .attr('stroke', TreemapComponent.getCssVariable('--bg-white', 'white'))
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .on('click', (event: MouseEvent, d: TreemapNode) => {
        // Get region name from parent hierarchy
        const regionName = treemapRoot.data.name;
        this.cellClick.emit({
          name: d.data.name,
          value: d.data.value,
          percentage: d.data.percentage,
          regionName: regionName,
          dimension1Name: this._dimension1Id || undefined,
          dimension2Name: this._dimension2Id || undefined
        });
      })
      .on('mouseover', function handleMouseOver(event: MouseEvent, d: TreemapNode) {
        d3.select(this)
          .attr('stroke-width', 2.5)
          .attr('opacity', 0.9);

        tooltip
          .style('opacity', '1')
          .html(`
            <div><strong>${d.data.name}</strong></div>
            <div style="margin-top: 4px;">Value: $${d.data.value}B</div>
            <div style="margin-top: 2px;">Change: ${d.data.percentage > 0 ? '+' : ''}${d.data.percentage.toFixed(2)}%</div>
          `);
      })
      .on('mousemove', function handleMouseMove(event: MouseEvent) {
        tooltip
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', function handleMouseOut() {
        d3.select(this)
          .attr('stroke-width', 1.5)
          .attr('opacity', 1);
        tooltip.style('opacity', '0');
      });

    // Add text labels to cells
    cells.each(function addCellLabels(d: TreemapNode) {
      const cell = d3.select(this);
      const rectWidth = d.x1 - d.x0;
      const rectHeight = d.y1 - d.y0;
      const minSize = 60;

      if (rectWidth > minSize && rectHeight > minSize) {
        // Asset name (truncated to 6 characters only for Product Sub-Types)
        const shouldTruncate = dimension2Id === 'product-sub-types';
        const displayName = shouldTruncate && d.data.name.length > 6 
          ? d.data.name.substring(0, 3) + '...' 
          : d.data.name;
        cell.append('text')
          .attr('x', 6)
          .attr('y', 16)
          .attr('class', 'cell-label-name')
          .style('font-size', '12px')
          .style('font-weight', '600')
          .style('fill', TreemapComponent.getCssVariable('--text-primary', '#030213'))
          .text(displayName);

        // Value
        cell.append('text')
          .attr('x', 6)
          .attr('y', 32)
          .attr('class', 'cell-label-value')
          .style('font-size', '10px')
          .style('font-weight', '500')
          .style('fill', TreemapComponent.getCssVariable('--text-secondary', '#717182'))
          .text(`$${d.data.value}B`);

        // Percentage
        cell.append('text')
          .attr('x', 6)
          .attr('y', 46)
          .attr('class', 'cell-label-percentage')
          .style('font-size', '10px')
          .style('font-weight', '500')
          .style('fill', TreemapComponent.getCssVariable('--text-secondary', '#717182'))
          .text(`${d.data.percentage > 0 ? '+' : ''}${d.data.percentage.toFixed(2)}%`);
      } else if (rectWidth > 40 && rectHeight > 30) {
        // Show abbreviated label for medium-sized cells (truncated to 6 characters only for Product Sub-Types)
        const shouldTruncate = dimension2Id === 'product-sub-types';
        const displayName = shouldTruncate && d.data.name.length > 6 
          ? d.data.name.substring(0, 3) + '...' 
          : d.data.name;
        cell.append('text')
          .attr('x', rectWidth / 2)
          .attr('y', rectHeight / 2)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .style('font-size', '10px')
          .style('font-weight', '600')
          .style('fill', TreemapComponent.getCssVariable('--text-primary', '#030213'))
          .text(displayName);
      }
    });
  }

  /**
   * Creates the legend for the treemap.
   * @param svg - The SVG selection.
   * @param height - The height of the SVG.
   * @param margin - Margin configuration.
   * @returns Nothing.
   */
  private createLegend(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    height: number,
    margin: { top: number; right: number; bottom: number; left: number }
  ): void {
    const legend = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${margin.left},${height - margin.bottom + 10})`);

    const legendData = [
      { label: 'Inflow', color: this.getColorForPercentage(1), border: this.getBorderColorForPercentage(1) },
      { label: 'Neutral', color: this.getColorForPercentage(0), border: this.getBorderColorForPercentage(0) },
      { label: 'Outflow', color: this.getColorForPercentage(-1), border: this.getBorderColorForPercentage(-1) }
    ];

    const legendItems = legend.selectAll('g.legend-item')
      .data(legendData)
      .enter()
      .append('g')
      .attr('class', 'legend-item')
      .attr('transform', (_d: { label: string; color: string; border: string }, i: number) => `translate(${i * 120}, 0)`);

    legendItems.append('rect')
      .attr('width', 12)
      .attr('height', 12)
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('fill', (d: { label: string; color: string; border: string }) => d.color)
      .attr('stroke-width', 1.5);

    legendItems.append('text')
      .attr('x', 22)
      .attr('y', 12)
      .style('font-size', '12px')
      .style('fill', TreemapComponent.getCssVariable('--text-primary', '#030213'))
      .text((d: { label: string; color: string; border: string }) => d.label);
  }
}
