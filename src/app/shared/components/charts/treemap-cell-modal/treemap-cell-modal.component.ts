import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface TreemapCellData {
  name: string;
  value: number;
  percentage: number;
  regionName?: string;
  dimension1Name?: string;
  dimension2Name?: string;
}

@Component({
  selector: 'app-treemap-cell-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './treemap-cell-modal.component.html',
  styleUrl: './treemap-cell-modal.component.scss'
})
export class TreemapCellModalComponent implements OnChanges {
  @Input() isVisible: boolean = false;
  @Input() cellData: TreemapCellData | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() askAI = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible']) {
      if (this.isVisible) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    }
  }

  onClose(): void {
    document.body.style.overflow = '';
    this.close.emit();
  }

  onAskAI(): void {
    this.askAI.emit();
  }

  getFlowType(): 'inflow' | 'outflow' | 'neutral' {
    if (!this.cellData) return 'neutral';
    if (this.cellData.percentage > 0.5) return 'inflow';
    if (this.cellData.percentage < -0.5) return 'outflow';
    return 'neutral';
  }

  getFormattedValue(): string {
    if (!this.cellData) return '$0';
    return `$${this.cellData.value}B`;
  }

  getFormattedPercentage(): string {
    if (!this.cellData) return '0%';
    return `${this.cellData.percentage > 0 ? '+' : ''}${this.cellData.percentage.toFixed(1)}%`;
  }

  getDescription(): string {
    if (!this.cellData) return '';
    
    const assetType = this.cellData.name;
    const flowType = this.getFlowType();
    const value = this.getFormattedValue();
    
    // Calculate approximate shift values for more realistic description
    const currentValue = this.cellData.value;
    const shiftValue = Math.abs(this.cellData.percentage * currentValue / 100);
    const targetValue = flowType === 'outflow' 
      ? (currentValue - shiftValue).toFixed(1)
      : (currentValue + shiftValue).toFixed(1);
    
    if (flowType === 'outflow') {
      return `${assetType} allocations are expected to shift from ${value} toward $${targetValue}B, with capital likely rotating to Fixed Income and Alternatives as investors seek stability and diversification.`;
    } else if (flowType === 'inflow') {
      return `${assetType} allocations are expected to increase from ${value} toward $${targetValue}B, with capital likely flowing from other asset classes as investors seek higher returns and growth opportunities.`;
    } else {
      return `${assetType} allocations are expected to remain relatively stable around ${value}, with minimal changes expected in the near term as investors maintain current positioning.`;
    }
  }

  getTitle(): string {
    if (!this.cellData) return 'Aggregated Flow';
    const flowType = this.getFlowType();
    const flowLabel = flowType === 'outflow' ? 'Reallocation' : flowType === 'inflow' ? 'Allocation' : 'Flow';
    return `Aggregated Flow: ${this.cellData.name} ${flowLabel}`;
  }
}

