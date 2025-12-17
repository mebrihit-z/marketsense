import { Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core'
import { CommonModule } from '@angular/common';
import { SankeyDiagramComponent } from '../charts/sankey-diagram/sankey-diagram.component';
import { RegionalSankeyDiagramComponent } from '../charts/regional-sankey-diagram/regional-sankey-diagram.component';

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
  imports: [CommonModule, SankeyDiagramComponent, RegionalSankeyDiagramComponent],
  templateUrl: './asset-flows.component.html',
  styleUrl: './asset-flows.component.scss'
})
export class AssetFlowsComponent implements OnInit, OnChanges {
  @Input() selectedProductTypes: string[] = [];
  @Input() selectedProductSubTypes: string[] = [];
  @Input() dataType: 'historical' | 'forecasted' = 'forecasted';
  @Input() timeHorizon: string = 'Today';
  @Output() pinToggle = new EventEmitter<void>();
  
  // View and filter state
  showProductSubTypes: boolean = false;
  isPinned: boolean = false;
  showRegionalSankey: boolean = false;

  // Regional sankey data
  regionalSankeyData = {
    "nodes": [
      {"name": "United Kingdom: Reallocation Pool"},
      {"name": "United States: Reallocation Pool"},
      {"name": "United Kingdom (Super Start)"},
      {"name": "United States (Super Start)"},
      {"name": "United Kingdom (Super End)"},
      {"name": "United States (Super End)"},
      {"name": "United Kingdom: Cash (Start)"},
      {"name": "United Kingdom: Equity (Start)"},
      {"name": "United States: Equity (Start)"},
      {"name": "United States: Fixed Income (Start)"},
      {"name": "United Kingdom: Equity (End)"},
      {"name": "United Kingdom: Fixed Income (End)"},
      {"name": "United States: Cash (End)"},
      {"name": "United States: Equity (End)"},
      {"name": "United States: Fixed Income (End)"},
      {"name": "United States: Multi-Asset (End)"},
      {"name": "United States: Other / Specialized (End)"},
      {"name": "United States: Private Markets (End)"},
      {"name": "United States: US Equity All Cap (Source)"},
      {"name": "United States: US Equity Large Cap (Source)"},
      {"name": "United States: US Equity Mid Cqp (Source)"},
      {"name": "United States: US Equity Small Cap (Source)"},
      {"name": "United States: US SMID Cap (Source)"},
      {"name": "United States: Convertible (Source)"},
      {"name": "United States: Credit - Intermediate Duration (Source)"},
      {"name": "United States: Government (Source)"},
      {"name": "United States: Intermediate (Source)"},
      {"name": "United States: Short Duration (Source)"},
      {"name": "United States: Stable Value (Source)"},
      {"name": "United Kingdom: Cash Enhanced (LIBOR Plus net) (Source)"},
      {"name": "United Kingdom: Cash Pure (Sub-LIBOR net) (Source)"},
      {"name": "United Kingdom: Mixed UK/Non-UK Equity (Source)"},
      {"name": "United Kingdom: UK Equity (All Cap) (Source)"},
      {"name": "United Kingdom: Uk Equity (SI) (Source)"},
      {"name": "United Kingdom: UK Equity (Small Cap) (Source)"},
      {"name": "United States: Bank Deposits / CDs (Destination)"},
      {"name": "United States: Foreign Currency / FFX (Destination)"},
      {"name": "United States: Money Market Funds (Destination)"},
      {"name": "United States: Treasury Bills (Destination)"},
      {"name": "United States: Emerging Markets (Destination)"},
      {"name": "United States: Global Equity (Destination)"},
      {"name": "United States: Core Investment Grade (Destination)"},
      {"name": "United States: Core Opportunistic (Destination)"},
      {"name": "United States: Credit - Long Duration (Destination)"},
      {"name": "United States: Global Bonds (Destination)"},
      {"name": "United States: High Yield (Destination)"},
      {"name": "United States: Insurance Core Fixed Income (Destination)"},
      {"name": "United States: Investment Grade Private Credit (Destination)"},
      {"name": "United States: Long Duration (Destination)"},
      {"name": "United States: Municipal (Destination)"},
      {"name": "United States: Diversified Growth Funds (Destination)"},
      {"name": "United States: Target Date Funds (Destination)"},
      {"name": "United States: Factor Based Investing (Destination)"},
      {"name": "United States: Overlay Strategies (Destination)"},
      {"name": "United States: Co-Investment (Destination)"},
      {"name": "United States: Private Credit (Destination)"},
      {"name": "United States: Private Equity (Destination)"},
      {"name": "United States: Venture Capital (Destination)"},
      {"name": "United Kingdom: UK Equity (Large Cap) (Destination)"},
      {"name": "United Kingdom: Retail Fixed Income (Destination)"},
      {"name": "United Kingdom: UK Fixed (Govt & Non-Govt) (Destination)"},
      {"name": "United Kingdom: UK Fixed (Govt) (Destination)"},
      {"name": "United Kingdom: UK Fixed (Index Linked Gilts) (Destination)"},
      {"name": "United Kingdom: UK Fixed (Non-Govt) (Destination)"},
      {"name": "United Kingdom: UK Fixed Buy and Maintain Credit (Destination)"},
      {"name": "Net New Capital (United Kingdom)"},
      {"name": "Net New Capital (United States)"}
    ],
    "links": [
      {"source": "United States (Super Start)", "target": "United States: Equity (Start)", "value": 118.11},
      {"source": "United States (Super Start)", "target": "United States: Fixed Income (Start)", "value": 56.510000000000005},
      {"source": "United Kingdom (Super Start)", "target": "United Kingdom: Cash (Start)", "value": 1.9500000000000002},
      {"source": "United Kingdom (Super Start)", "target": "United Kingdom: Equity (Start)", "value": 5.8500000000000005},
      {"source": "United States: Equity (Start)", "target": "United States: US Equity All Cap (Source)", "value": 26.5},
      {"source": "United States: Equity (Start)", "target": "United States: US Equity Large Cap (Source)", "value": 33.4},
      {"source": "United States: Equity (Start)", "target": "United States: US Equity Mid Cqp (Source)", "value": 24.1},
      {"source": "United States: Equity (Start)", "target": "United States: US Equity Small Cap (Source)", "value": 19.11},
      {"source": "United States: Equity (Start)", "target": "United States: US SMID Cap (Source)", "value": 15.0},
      {"source": "United States: Fixed Income (Start)", "target": "United States: Convertible (Source)", "value": 10.0},
      {"source": "United States: Fixed Income (Start)", "target": "United States: Credit - Intermediate Duration (Source)", "value": 6.25},
      {"source": "United States: Fixed Income (Start)", "target": "United States: Government (Source)", "value": 15.0},
      {"source": "United States: Fixed Income (Start)", "target": "United States: Intermediate (Source)", "value": 4.7},
      {"source": "United States: Fixed Income (Start)", "target": "United States: Short Duration (Source)", "value": 14.56},
      {"source": "United States: Fixed Income (Start)", "target": "United States: Stable Value (Source)", "value": 6.0},
      {"source": "United Kingdom: Cash (Start)", "target": "United Kingdom: Cash Enhanced (LIBOR Plus net) (Source)", "value": 1.1},
      {"source": "United Kingdom: Cash (Start)", "target": "United Kingdom: Cash Pure (Sub-LIBOR net) (Source)", "value": 0.85},
      {"source": "United Kingdom: Equity (Start)", "target": "United Kingdom: Mixed UK/Non-UK Equity (Source)", "value": 2.25},
      {"source": "United Kingdom: Equity (Start)", "target": "United Kingdom: UK Equity (All Cap) (Source)", "value": 1.4},
      {"source": "United Kingdom: Equity (Start)", "target": "United Kingdom: Uk Equity (SI) (Source)", "value": 0.5},
      {"source": "United Kingdom: Equity (Start)", "target": "United Kingdom: UK Equity (Small Cap) (Source)", "value": 1.7},
      {"source": "United States: US Equity All Cap (Source)", "target": "United States: Reallocation Pool", "value": 26.5},
      {"source": "United States: US Equity Large Cap (Source)", "target": "United States: Reallocation Pool", "value": 33.4},
      {"source": "United States: US Equity Mid Cqp (Source)", "target": "United States: Reallocation Pool", "value": 24.1},
      {"source": "United States: US Equity Small Cap (Source)", "target": "United States: Reallocation Pool", "value": 19.11},
      {"source": "United States: US SMID Cap (Source)", "target": "United States: Reallocation Pool", "value": 15.0},
      {"source": "United States: Convertible (Source)", "target": "United States: Reallocation Pool", "value": 10.0},
      {"source": "United States: Credit - Intermediate Duration (Source)", "target": "United States: Reallocation Pool", "value": 6.25},
      {"source": "United States: Government (Source)", "target": "United States: Reallocation Pool", "value": 15.0},
      {"source": "United States: Intermediate (Source)", "target": "United States: Reallocation Pool", "value": 4.7},
      {"source": "United States: Short Duration (Source)", "target": "United States: Reallocation Pool", "value": 14.56},
      {"source": "United States: Stable Value (Source)", "target": "United States: Reallocation Pool", "value": 6.0},
      {"source": "United Kingdom: Cash Enhanced (LIBOR Plus net) (Source)", "target": "United Kingdom: Reallocation Pool", "value": 1.1},
      {"source": "United Kingdom: Cash Pure (Sub-LIBOR net) (Source)", "target": "United Kingdom: Reallocation Pool", "value": 0.85},
      {"source": "United Kingdom: Mixed UK/Non-UK Equity (Source)", "target": "United Kingdom: Reallocation Pool", "value": 2.25},
      {"source": "United Kingdom: UK Equity (All Cap) (Source)", "target": "United Kingdom: Reallocation Pool", "value": 1.4},
      {"source": "United Kingdom: Uk Equity (SI) (Source)", "target": "United Kingdom: Reallocation Pool", "value": 0.5},
      {"source": "United Kingdom: UK Equity (Small Cap) (Source)", "target": "United Kingdom: Reallocation Pool", "value": 1.7},
      {"source": "United Kingdom (Super Start)", "target": "Net New Capital (United Kingdom)", "value": 9.75},
      {"source": "Net New Capital (United Kingdom)", "target": "United Kingdom: Reallocation Pool", "value": 9.75},
      {"source": "United States (Super Start)", "target": "Net New Capital (United States)", "value": 47.885999999999996},
      {"source": "Net New Capital (United States)", "target": "United States: Reallocation Pool", "value": 47.885999999999996},
      {"source": "United States: Reallocation Pool", "target": "United States: Bank Deposits / CDs (Destination)", "value": 0.78},
      {"source": "United States: Reallocation Pool", "target": "United States: Foreign Currency / FFX (Destination)", "value": 0.58},
      {"source": "United States: Reallocation Pool", "target": "United States: Money Market Funds (Destination)", "value": 1.356},
      {"source": "United States: Reallocation Pool", "target": "United States: Treasury Bills (Destination)", "value": 0.64},
      {"source": "United States: Reallocation Pool", "target": "United States: Emerging Markets (Destination)", "value": 4.48},
      {"source": "United States: Reallocation Pool", "target": "United States: Global Equity (Destination)", "value": 10.68},
      {"source": "United States: Reallocation Pool", "target": "United States: Core Investment Grade (Destination)", "value": 3.0},
      {"source": "United States: Reallocation Pool", "target": "United States: Core Opportunistic (Destination)", "value": 5.0},
      {"source": "United States: Reallocation Pool", "target": "United States: Credit - Long Duration (Destination)", "value": 4.5},
      {"source": "United States: Reallocation Pool", "target": "United States: Global Bonds (Destination)", "value": 34.73},
      {"source": "United States: Reallocation Pool", "target": "United States: High Yield (Destination)", "value": 6.7},
      {"source": "United States: Reallocation Pool", "target": "United States: Insurance Core Fixed Income (Destination)", "value": 0.3},
      {"source": "United States: Reallocation Pool", "target": "United States: Investment Grade Private Credit (Destination)", "value": 6.7},
      {"source": "United States: Reallocation Pool", "target": "United States: Long Duration (Destination)", "value": 7.0},
      {"source": "United States: Reallocation Pool", "target": "United States: Municipal (Destination)", "value": 3.9},
      {"source": "United States: Reallocation Pool", "target": "United States: Diversified Growth Funds (Destination)", "value": 1.64},
      {"source": "United States: Reallocation Pool", "target": "United States: Target Date Funds (Destination)", "value": 1.67},
      {"source": "United States: Reallocation Pool", "target": "United States: Factor Based Investing (Destination)", "value": 2.6},
      {"source": "United States: Reallocation Pool", "target": "United States: Overlay Strategies (Destination)", "value": 3.82},
      {"source": "United States: Reallocation Pool", "target": "United States: Co-Investment (Destination)", "value": 5.9},
      {"source": "United States: Reallocation Pool", "target": "United States: Private Credit (Destination)", "value": 5.2},
      {"source": "United States: Reallocation Pool", "target": "United States: Private Equity (Destination)", "value": 95.73},
      {"source": "United States: Reallocation Pool", "target": "United States: Venture Capital (Destination)", "value": 15.6},
      {"source": "United Kingdom: Reallocation Pool", "target": "United Kingdom: UK Equity (Large Cap) (Destination)", "value": 6.3},
      {"source": "United Kingdom: Reallocation Pool", "target": "United Kingdom: Retail Fixed Income (Destination)", "value": 0.25},
      {"source": "United Kingdom: Reallocation Pool", "target": "United Kingdom: UK Fixed (Govt & Non-Govt) (Destination)", "value": 3.0},
      {"source": "United Kingdom: Reallocation Pool", "target": "United Kingdom: UK Fixed (Govt) (Destination)", "value": 2.0},
      {"source": "United Kingdom: Reallocation Pool", "target": "United Kingdom: UK Fixed (Index Linked Gilts) (Destination)", "value": 4.0},
      {"source": "United Kingdom: Reallocation Pool", "target": "United Kingdom: UK Fixed (Non-Govt) (Destination)", "value": 1.0},
      {"source": "United Kingdom: Reallocation Pool", "target": "United Kingdom: UK Fixed Buy and Maintain Credit (Destination)", "value": 1.0},
      {"source": "United States: Bank Deposits / CDs (Destination)", "target": "United States: Cash (End)", "value": 0.78},
      {"source": "United States: Foreign Currency / FFX (Destination)", "target": "United States: Cash (End)", "value": 0.58},
      {"source": "United States: Money Market Funds (Destination)", "target": "United States: Cash (End)", "value": 1.356},
      {"source": "United States: Treasury Bills (Destination)", "target": "United States: Cash (End)", "value": 0.64},
      {"source": "United States: Emerging Markets (Destination)", "target": "United States: Equity (End)", "value": 4.48},
      {"source": "United States: Global Equity (Destination)", "target": "United States: Equity (End)", "value": 10.68},
      {"source": "United States: Core Investment Grade (Destination)", "target": "United States: Fixed Income (End)", "value": 3.0},
      {"source": "United States: Core Opportunistic (Destination)", "target": "United States: Fixed Income (End)", "value": 5.0},
      {"source": "United States: Credit - Long Duration (Destination)", "target": "United States: Fixed Income (End)", "value": 4.5},
      {"source": "United States: Global Bonds (Destination)", "target": "United States: Fixed Income (End)", "value": 34.73},
      {"source": "United States: High Yield (Destination)", "target": "United States: Fixed Income (End)", "value": 6.7},
      {"source": "United States: Insurance Core Fixed Income (Destination)", "target": "United States: Fixed Income (End)", "value": 0.3},
      {"source": "United States: Investment Grade Private Credit (Destination)", "target": "United States: Fixed Income (End)", "value": 6.7},
      {"source": "United States: Long Duration (Destination)", "target": "United States: Fixed Income (End)", "value": 7.0},
      {"source": "United States: Municipal (Destination)", "target": "United States: Fixed Income (End)", "value": 3.9},
      {"source": "United States: Diversified Growth Funds (Destination)", "target": "United States: Multi-Asset (End)", "value": 1.64},
      {"source": "United States: Target Date Funds (Destination)", "target": "United States: Multi-Asset (End)", "value": 1.67},
      {"source": "United States: Factor Based Investing (Destination)", "target": "United States: Other / Specialized (End)", "value": 2.6},
      {"source": "United States: Overlay Strategies (Destination)", "target": "United States: Other / Specialized (End)", "value": 3.82},
      {"source": "United States: Co-Investment (Destination)", "target": "United States: Private Markets (End)", "value": 5.9},
      {"source": "United States: Private Credit (Destination)", "target": "United States: Private Markets (End)", "value": 5.2},
      {"source": "United States: Private Equity (Destination)", "target": "United States: Private Markets (End)", "value": 95.73},
      {"source": "United States: Venture Capital (Destination)", "target": "United States: Private Markets (End)", "value": 15.6},
      {"source": "United Kingdom: UK Equity (Large Cap) (Destination)", "target": "United Kingdom: Equity (End)", "value": 6.3},
      {"source": "United Kingdom: Retail Fixed Income (Destination)", "target": "United Kingdom: Fixed Income (End)", "value": 0.25},
      {"source": "United Kingdom: UK Fixed (Govt & Non-Govt) (Destination)", "target": "United Kingdom: Fixed Income (End)", "value": 3.0},
      {"source": "United Kingdom: UK Fixed (Govt) (Destination)", "target": "United Kingdom: Fixed Income (End)", "value": 2.0},
      {"source": "United Kingdom: UK Fixed (Index Linked Gilts) (Destination)", "target": "United Kingdom: Fixed Income (End)", "value": 4.0},
      {"source": "United Kingdom: UK Fixed (Non-Govt) (Destination)", "target": "United Kingdom: Fixed Income (End)", "value": 1.0},
      {"source": "United Kingdom: UK Fixed Buy and Maintain Credit (Destination)", "target": "United Kingdom: Fixed Income (End)", "value": 1.0},
      {"source": "United States: Cash (End)", "target": "United States (Super End)", "value": 3.3560000000000003},
      {"source": "United States: Equity (End)", "target": "United States (Super End)", "value": 15.16},
      {"source": "United States: Fixed Income (End)", "target": "United States (Super End)", "value": 71.83000000000001},
      {"source": "United States: Multi-Asset (End)", "target": "United States (Super End)", "value": 3.3099999999999996},
      {"source": "United States: Other / Specialized (End)", "target": "United States (Super End)", "value": 6.42},
      {"source": "United States: Private Markets (End)", "target": "United States (Super End)", "value": 122.43},
      {"source": "United Kingdom: Equity (End)", "target": "United Kingdom (Super End)", "value": 6.3},
      {"source": "United Kingdom: Fixed Income (End)", "target": "United Kingdom (Super End)", "value": 11.25}
    ]
  };
  
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
