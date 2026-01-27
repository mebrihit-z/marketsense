/* eslint-disable */
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
  @Input() isPinned: boolean = false;
  @Output() download = new EventEmitter<string>();
  @Output() moreOptions = new EventEmitter<string>();
  @Output() askMarketSense = new EventEmitter<string>();
  @Output() pin = new EventEmitter<string>();
  @Output() cardClick = new EventEmitter<string>();

  private askMarketSenseLastHandled = 0;
  private readonly ASK_MARKETSENSE_DEBOUNCE_MS = 300;
  private downloadLastHandled = 0;
  private readonly DOWNLOAD_DEBOUNCE_MS = 300;
  private pinLastHandled = 0;
  private readonly PIN_DEBOUNCE_MS = 300;

  getConfidenceColor(confidence: 'high' | 'medium' | 'low'): string {
    // All scores are green for now
    return '#00bc7d';
  }

  onDownload(event?: Event): void {
    const now = Date.now();
    
    // Prevent double-firing from multiple event handlers (click + mousedown)
    if (now - this.downloadLastHandled < this.DOWNLOAD_DEBOUNCE_MS) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    
    this.downloadLastHandled = now;
    
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
    
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
      event.stopImmediatePropagation();
    }
    
    // Emit the event
    this.askMarketSense.emit(this.card.id);
  }

  onPin(event?: Event): void {
    const now = Date.now();
    
    // Prevent double-firing from multiple event handlers (click + mousedown)
    if (now - this.pinLastHandled < this.PIN_DEBOUNCE_MS) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    
    this.pinLastHandled = now;
    
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
    
    this.pin.emit(this.card.id);
  }

  onCardClick(): void {
    // Emit card click event
    this.cardClick.emit(this.card.id);
  }
}

