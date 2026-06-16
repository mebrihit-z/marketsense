import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import AskMarketsenseModalComponent from '../../ask-marketsense-modal/ask-marketsense-modal.component';
import type { MarketFlowCard } from '../../market-flows-carousel/market-flow-card/market-flow-card.component';
import { AskMarketsenseCardContextService } from '../../../../core/services/ask-marketsense-card-context.service';

export interface SankeyNodeLeafItem {
  name: string;
  value: string;
}

export interface SankeyNodeModalData {
  /** Raw Sankey node name (for card id / context). */
  nodeName: string;
  displayName: string;
  totalValue: string;
  incoming: string;
  outgoing: string;
  /** Signed net flow in USD for AI context. */
  netFlowUsd: number;
  valueColor: 'red' | 'green';
  timeInfo?: string;
  sampleSize?: number;
  leafBreakdownTitle?: string;
  leafItems?: SankeyNodeLeafItem[];
  leafItemsTotalCount?: number;
  leafItemsRemaining?: number;
  timeHorizon?: string;
  timeHorizonStart?: string;
  timeHorizonEnd?: string;
}

@Component({
  selector: 'app-sankey-node-modal',
  standalone: true,
  imports: [CommonModule, AskMarketsenseModalComponent],
  templateUrl: './sankey-node-modal.component.html',
  styleUrl: './sankey-node-modal.component.scss',
})
export class SankeyNodeModalComponent implements OnChanges {
  constructor(private readonly askMarketsenseCardContext: AskMarketsenseCardContextService) {}

  @Input() isVisible = false;
  @Input() nodeData: SankeyNodeModalData | null = null;
  @Output() close = new EventEmitter<void>();

  showAskMarketSenseModal = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible']) {
      document.body.style.overflow = this.isVisible ? 'hidden' : '';
    }
  }

  onClose(): void {
    document.body.style.overflow = '';
    this.close.emit();
  }

  onAskAI(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.askMarketsenseCardContext.setActiveFromMarketFlowCard(this.getMarketFlowCard());
    this.onClose();
    this.showAskMarketSenseModal = true;
  }

  onCloseAskMarketSenseModal(): void {
    this.showAskMarketSenseModal = false;
  }

  onSendMessage(_message: string): void {
    // Handled by AskMarketsenseModalComponent
  }

  getMarketFlowCard(): MarketFlowCard | null {
    if (!this.nodeData) return null;
    const horizon =
      this.nodeData.timeHorizonStart && this.nodeData.timeHorizonEnd
        ? `${this.nodeData.timeHorizonStart} – ${this.nodeData.timeHorizonEnd}`
        : this.nodeData.timeHorizon ?? '';
    return {
      id: `sankey-${this.nodeData.nodeName}`,
      title: this.nodeData.displayName,
      value: this.nodeData.totalValue,
      netFlowUsd: this.nodeData.netFlowUsd,
      valueColor: this.nodeData.valueColor,
      percentageChange: '—',
      percentageColor: 'neutral',
      metricLabel: 'Net flow',
      aiConfidence: 'high',
      description: this.getDescription(),
      chartColor: this.nodeData.valueColor,
      borderColor: this.nodeData.valueColor === 'green' ? '#10b981' : '#ef4444',
      timeHorizon: horizon || '—',
      timeHorizonStart: this.nodeData.timeHorizonStart,
      timeHorizonEnd: this.nodeData.timeHorizonEnd,
      dataType: 'forecasted',
      nClientsTotal: this.nodeData.sampleSize,
    };
  }

  getDescription(): string {
    if (!this.nodeData) return '';
    const label = this.nodeData.displayName;
    if (this.nodeData.valueColor === 'green') {
      return `Models indicate net inflows through ${label} in the selected time window, with incoming flows exceeding outgoing reallocations.`;
    }
    return `Models indicate net outflows through ${label} in the selected time window, with outgoing flows exceeding incoming reallocations.`;
  }

  hasLeafBreakdown(): boolean {
    return (this.nodeData?.leafItems?.length ?? 0) > 0;
  }
}
