import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AskMarketsenseModalComponent } from '../../market-flows-carousel/ask-marketsense-modal/ask-marketsense-modal.component';
import type { MarketFlowCard } from '../../market-flows-carousel/market-flow-card/market-flow-card.component';

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
  imports: [CommonModule, AskMarketsenseModalComponent],
  templateUrl: './treemap-cell-modal.component.html',
  styleUrl: './treemap-cell-modal.component.scss'
})
export class TreemapCellModalComponent implements OnChanges {
  @Input() isVisible: boolean = false;
  @Input() cellData: TreemapCellData | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() askAI = new EventEmitter<void>();

  // Ask MarketSense modal state
  showAskMarketSenseModal: boolean = false;

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

  onAskAI(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.askAI.emit();
    // Close the treemap modal
    this.onClose();
    // Open the Ask MarketSense modal
    this.showAskMarketSenseModal = true;
  }

  onCloseAskMarketSenseModal(): void {
    this.showAskMarketSenseModal = false;
  }

  onSendMessage(message: string): void {
    // Handle sending message to AI
    console.log('Message sent:', message);
    // Here you would typically send the message to an AI service
  }

  // Convert TreemapCellData to MarketFlowCard format for the AI modal
  getMarketFlowCard(): MarketFlowCard | null {
    if (!this.cellData) return null;
    
    return {
      id: `treemap-${this.cellData.name}`,
      title: this.getTitle(),
      value: this.getFormattedValue(),
      valueColor: this.getFlowType() === 'inflow' ? 'green' : this.getFlowType() === 'outflow' ? 'red' : 'green',
      percentageChange: this.getFormattedPercentage(),
      percentageColor: this.getFlowType() === 'inflow' ? 'green' : this.getFlowType() === 'outflow' ? 'red' : 'green',
      metricLabel: 'Allocation',
      aiConfidence: 'high' as const,
      description: this.getDescription(),
      chartColor: this.getFlowType() === 'inflow' ? 'green' : this.getFlowType() === 'outflow' ? 'red' : 'green',
      borderColor: this.getFlowType() === 'inflow' ? '#10b981' : this.getFlowType() === 'outflow' ? '#ef4444' : '#9ca3af',
      timeHorizon: '+9 mo',
      dataType: 'forecasted' as const
    };
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

  getFlowTypeLabel(): string {
    const flowType = this.getFlowType();
    if (flowType === 'inflow') return 'Inflow';
    if (flowType === 'outflow') return 'Outflow';
    return 'Neutral';
  }

  getDescription(): string {
    if (!this.cellData) return '';
    
    const assetType = this.cellData.name;
    const flowType = this.getFlowType();
    
    if (flowType === 'inflow') {
      return `Models indicate continued movement toward ${assetType} as investors seek stability and income generation in the current rate environment.`;
    } else if (flowType === 'outflow') {
      return `Models indicate a shift away from ${assetType} as investors reallocate capital to other asset classes seeking higher returns and diversification.`;
    } else {
      return `Models indicate relatively stable positioning in ${assetType} with minimal changes expected in the current market environment.`;
    }
  }

  getTitle(): string {
    if (!this.cellData) return 'Asset Allocation';
    
    // Format title with region prefix if available
    let title = this.cellData.name;
    
    // Add region prefix if regionName is available
    if (this.cellData.regionName) {
      const regionPrefix = this.cellData.regionName === 'United States' ? 'U.S.' : 
                          this.cellData.regionName === 'United Kingdom' ? 'U.K.' :
                          this.cellData.regionName;
      title = `${regionPrefix} ${title}`;
    }
    
    return `${title} Allocation`;
  }
}

