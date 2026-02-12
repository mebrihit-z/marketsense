/* eslint-disable */
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import TitleComponent from '../../title/title.component';

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
  imports: [CommonModule, TitleComponent],
  templateUrl: './market-flow-card.component.html',
  styleUrl: './market-flow-card.component.scss'
})
export class MarketFlowCardComponent {
  @Input() card!: MarketFlowCard;
  @Input() isPinned: boolean = false;
  @Output() download = new EventEmitter<string>();
  @Output() moreOptions = new EventEmitter<string>();
  @Output() askMarketSense = new EventEmitter<string>();
  @Output() pin = new EventEmitter<string>();
  @Output() cardClick = new EventEmitter<string>();
  @Output() viewMore = new EventEmitter<string>();

  private askMarketSenseLastHandled = 0;
  private readonly ASK_MARKETSENSE_DEBOUNCE_MS = 300;
  private downloadLastHandled = 0;
  private readonly DOWNLOAD_DEBOUNCE_MS = 300;
  private pinLastHandled = 0;
  private readonly PIN_DEBOUNCE_MS = 300;

  getConfidenceColor(confidence: 'high' | 'medium' | 'low'): string {
    // All scores are green for now
    return '#2A6907';
  }

  onDownload(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
    
    const now = Date.now();
    
    // Prevent double-firing from multiple event handlers (click + mousedown + touchstart)
    if (now - this.downloadLastHandled < this.DOWNLOAD_DEBOUNCE_MS) {
      return;
    }
    
    this.downloadLastHandled = now;
    
    console.log('Download clicked for card:', this.card.id);
    
    // Emit download event
    this.download.emit(this.card.id);
  }

  onMoreOptions(): void {
    this.moreOptions.emit(this.card.id);
  }

  onAskMarketSense(event?: Event): void {
    const now = Date.now();
    
    // Prevent double-firing from multiple event handlers (click + mousedown)
    if (now - this.askMarketSenseLastHandled < this.ASK_MARKETSENSE_DEBOUNCE_MS) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    
    console.log('zere onAskMarketSense', this.card.id);
    this.askMarketSenseLastHandled = now;
    
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    // Emit the event
    this.askMarketSense.emit(this.card.id);
  }

  onPin(event: Event): void {
    // Stop event propagation to prevent card click
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    
    console.log('Pin clicked for card:', this.card.id);
    
    // Emit pin event
    this.pin.emit(this.card.id);
  }

  onViewMore(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.viewMore.emit(this.card.id);
  }

  onCardClick(event?: Event): void {
    // Don't trigger card click if clicking on action buttons or view more link
    if (event) {
      const target = event.target as HTMLElement;
      if (target.closest('button') || target.closest('.card-actions') || target.closest('.view-more-link')) {
        return;
      }
    }
    // Emit card click event
    this.cardClick.emit(this.card.id);
  }

  onCardMouseDown(event?: Event): void {
    // VDI/remote desktop often doesn't synthesize 'click' - only mousedown/mouseup.
    // Handle mousedown so the detail modal opens in those environments.
    if (event) {
      const target = event.target as HTMLElement;
      if (target.closest('button') || target.closest('.card-actions') || target.closest('.view-more-link')) {
        return;
      }
    }
    this.cardClick.emit(this.card.id);
  }

  onCardTouchStart(event: TouchEvent): void {
    // Handle touch events for VDI compatibility
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('.card-actions') || target.closest('.view-more-link')) {
      return;
    }
    // Convert touch to click for card
    this.cardClick.emit(this.card.id);
  }
}

