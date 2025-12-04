import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface AssetFlowCard {
  id: string;
  assetName: string;
  assetType: string; // e.g., 'Equity', 'Fixed Income', 'Commodities', etc.
  flowValue: string; // e.g., '$2.5B', '-$1.2B'
  flowDirection: 'inflow' | 'outflow';
  percentageChange: string; // e.g., '+5.2%', '-3.1%'
  volume: string; // e.g., '245K transactions'
  trend: 'up' | 'down' | 'stable';
  timeframe: string; // e.g., '24h', '7d', '30d'
  description: string;
  aiInsight: string;
  confidenceLevel: 'high' | 'medium' | 'low';
  borderColor: string;
}

@Component({
  selector: 'app-asset-flow-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './asset-flow-card.component.html',
  styleUrl: './asset-flow-card.component.scss'
})
export class AssetFlowCardComponent {
  @Input() card!: AssetFlowCard;
  @Output() viewDetails = new EventEmitter<string>();
  @Output() download = new EventEmitter<string>();
  @Output() moreOptions = new EventEmitter<string>();

  getTrendColor(trend: 'up' | 'down' | 'stable'): string {
    switch (trend) {
      case 'up': return '#00bc7d';
      case 'down': return '#fb2c36';
      case 'stable': return '#717182';
      default: return '#717182';
    }
  }

  getConfidenceColor(confidence: 'high' | 'medium' | 'low'): string {
    switch (confidence) {
      case 'high': return '#00bc7d';
      case 'medium': return '#fe9a00';
      case 'low': return '#d4183d';
      default: return '#00bc7d';
    }
  }

  onViewDetails(): void {
    this.viewDetails.emit(this.card.id);
  }

  onDownload(): void {
    this.download.emit(this.card.id);
  }

  onMoreOptions(): void {
    this.moreOptions.emit(this.card.id);
  }
}
