import { Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SankeyDiagramComponent } from '../charts/sankey-diagram/sankey-diagram.component';

export interface FlowDimension {
  id: string;
  label: string;
  count: number;
  active: boolean;
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
  imports: [CommonModule, SankeyDiagramComponent],
  templateUrl: './asset-flows.component.html',
  styleUrl: './asset-flows.component.scss'
})
export class AssetFlowsComponent implements OnInit, OnChanges {
  @Input() selectedProductTypes: string[] = [];
  @Input() selectedProductSubTypes: string[] = [];
  @Output() pinToggle = new EventEmitter<void>();
  
  // View and filter state
  showProductSubTypes: boolean = false;
  isPinned: boolean = false;
  
  // Available dimensions for drag and drop
  availableDimensions: FlowDimension[] = [
    { id: 'product-type', label: 'Product Type', count: 0, active: true }
  ];

  // Selected dimensions for drop zones
  selectedDimension1: FlowDimension | null = null;
  selectedDimension2: FlowDimension | null = null;

  // Currently dragged dimension
  private draggedDimension: FlowDimension | null = null;
  
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
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedProductTypes'] || changes['selectedProductSubTypes']) {
      this.updateDimensions();
    }
  }

  private updateDimensions(): void {
    const productTypeDimension = this.availableDimensions.find(d => d.id === 'product-type');
    if (productTypeDimension) {
      productTypeDimension.count = this.selectedProductTypes.length;
    }

    const productSubTypeDimension = this.availableDimensions.find(d => d.id === 'product-sub-types');
    if (productSubTypeDimension) {
      productSubTypeDimension.count = this.selectedProductSubTypes.length;
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

  onDrop(event: DragEvent, dropZone: 'dimension1' | 'dimension2'): void {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('drag-over');

    if (this.draggedDimension) {
      // Remove dimension from the other drop zone if it's already there
      if (this.selectedDimension1?.id === this.draggedDimension.id) {
        this.selectedDimension1 = null;
      }
      if (this.selectedDimension2?.id === this.draggedDimension.id) {
        this.selectedDimension2 = null;
      }

      // Set the dimension in the target drop zone
      if (dropZone === 'dimension1') {
        this.selectedDimension1 = this.draggedDimension;
      } else {
        this.selectedDimension2 = this.draggedDimension;
      }

      this.draggedDimension = null;
      console.log('Dimension dropped:', dropZone, this.selectedDimension1, this.selectedDimension2);
    }
  }

  removeDimension(dropZone: 'dimension1' | 'dimension2'): void {
    if (dropZone === 'dimension1') {
      this.selectedDimension1 = null;
    } else {
      this.selectedDimension2 = null;
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
}
