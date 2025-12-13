import { Component, OnInit } from '@angular/core';
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
export class AssetFlowsComponent implements OnInit {
  // View and filter state
  showProductSubTypes: boolean = false;
  
  // Available dimensions for drag and drop
  availableDimensions: FlowDimension[] = [
    { id: 'product-type', label: 'Product Type', count: 4, active: true },
    { id: 'investor-region', label: 'Investor Region', count: 2, active: true },
    { id: 'investors', label: 'Investors', count: 0, active: true },
    { id: 'product-region', label: 'Product Region', count: 3, active: true }
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
  }

  toggleProductSubTypes(): void {
    this.showProductSubTypes = !this.showProductSubTypes;
    console.log('Show product sub-types:', this.showProductSubTypes);
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
}
