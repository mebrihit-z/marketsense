import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface MarketFlowCard {
  id: string;
  title: string;
  value: string;
  valueColor: 'red' | 'green';
  percentageChange: string;
  percentageColor: 'red' | 'green';
  metricLabel: string;
  aiConfidence: 'high' | 'medium' | 'low';
  description: string;
  chartColor: 'red' | 'green';
  borderColor: string;
  timeHorizon: string;
  dataType: 'historical' | 'forecasted';
  productSubType?: string;
}

@Component({
  selector: 'app-market-flow-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './market-flow-card.component.html',
  styleUrl: './market-flow-card.component.scss'
})
export class MarketFlowCardComponent {
  @Input() card!: MarketFlowCard;
  @Output() download = new EventEmitter<string>();
  @Output() moreOptions = new EventEmitter<string>();
  @Output() askMarketSense = new EventEmitter<string>();

  getConfidenceColor(confidence: 'high' | 'medium' | 'low'): string {
    switch (confidence) {
      case 'high': return '#00bc7d';
      case 'medium': return '#fe9a00';
      case 'low': return '#d4183d';
      default: return '#00bc7d';
    }
  }

  onDownload(): void {
    this.download.emit(this.card.id);
  }

  onMoreOptions(): void {
    this.moreOptions.emit(this.card.id);
  }

  onAskMarketSense(): void {
    this.askMarketSense.emit(this.card.id);
  }
}

