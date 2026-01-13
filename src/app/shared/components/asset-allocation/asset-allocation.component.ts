/* eslint-disable */
import { Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TreemapCellModalComponent, TreemapCellData } from '../charts/treemap-cell-modal/treemap-cell-modal.component';
import { TreemapComponent } from '../charts/treemap/treemap.component';

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
  imports: [CommonModule, TreemapCellModalComponent, TreemapComponent],
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
  @Output() pinToggle = new EventEmitter<void>();
  
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

  // Currently dragged dimension
  private draggedDimension: FlowDimension | null = null;
  
  // Modal state
  showCellModal: boolean = false;
  selectedCellData: TreemapCellData | null = null;
  
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

  ngOnInit(): void {
    console.log('Asset Allocation component initialized');
    this.updateDimensions();
    // Set default dimensions
    this.selectedDimension1 = this.availableDimensions.find(d => d.id === 'investor-region') || null;
    this.selectedDimension2 = this.availableDimensions.find(d => d.id === 'product-type') || null;
    this.selectedDimension3 = this.availableDimensions.find(d => d.id === 'product-sub-types') || null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedProductTypes'] || changes['selectedProductRegions'] || changes['selectedProductSubTypes'] ||
        changes['selectedInvestorRegions'] || changes['selectedInvestorTypes'] ||
        changes['totalProductTypes'] || changes['totalProductSubTypes'] ||
        changes['totalInvestorRegions'] || changes['totalInvestorTypes'] ||
        changes['totalProductRegions']) {
      this.updateDimensions();
    }
    
    // Log time horizon changes for debugging
    if (changes['timeHorizon'] || changes['timeHorizonStart'] || changes['timeHorizonEnd']) {
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
}

