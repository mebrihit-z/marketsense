import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

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
  imports: [CommonModule],
  templateUrl: './asset-flows.component.html',
  styleUrl: './asset-flows.component.scss'
})
export class AssetFlowsComponent implements OnInit {
  // View and filter state
  dataView: 'cumulative' | 'pointInTime' = 'cumulative';
  selectedTimeHorizon: string = '+9 mo';
  showProductSubTypes: boolean = false;
  
  // Available time horizons
  timeHorizons = ['-18 mo', '-12 mo', '-6 mo', '-3 mo', '+3 mo', '+6 mo', '+9 mo', '+12 mo', '+18 mo'];
  
  // Flow dimensions (draggable chips)
  flowDimensions: FlowDimension[] = [
    { id: 'investor-region', label: 'Investor Region', count: 2, active: true },
    { id: 'product-type', label: 'Product Type', count: 4, active: true },
    { id: 'investors', label: 'Investors', count: 0, active: true },
    { id: 'product-region', label: 'Product Region', count: 3, active: true }
  ];
  
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

  setDataView(view: 'cumulative' | 'pointInTime'): void {
    this.dataView = view;
    console.log('Data view changed to:', view);
  }

  setTimeHorizon(horizon: string): void {
    this.selectedTimeHorizon = horizon;
    console.log('Time horizon changed to:', horizon);
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
