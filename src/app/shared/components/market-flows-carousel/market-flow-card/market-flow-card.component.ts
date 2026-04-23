/* eslint-disable */
import { Component, Input, Output, EventEmitter, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';
import TitleComponent from '../../title/title.component';
import { AssetFlowHistoricAnchorService } from '../../../../core/services/asset-flow-historic-anchor.service';
import { buildMarketFlowPercentageHoverLabel } from '../../../utils/market-flow-percentage-hover-label.util';
import {
  formatFlowCurrencyUsdFull,
  parseFlowDisplayValueToDollars,
} from '../../../utils/flow-currency-format.util';

export interface MarketFlowCard {
  id: string;
  title: string;
  value: string;
  /** Exact net flow in USD used for {@link value} aggregation (tooltip; avoids parse/round-trip drift). */
  netFlowUsd?: number;
  valueColor: 'red' | 'green';
  percentageChange: string;
  /** `neutral` when % change is not meaningful (e.g. horizon start net below noise floor). */
  percentageColor: 'red' | 'green' | 'neutral';
  metricLabel: string;
  /** Optional sentiment label (e.g. "Bullish", "Bearish"). If omitted, derived from percentageColor. */
  sentiment?: string;
  aiConfidence: 'high' | 'medium' | 'low';
  description: string;
  chartColor: 'red' | 'green';
  borderColor: string;
  timeHorizon: string;
  /** Slider range start; % uses net flow at this point as the baseline. */
  timeHorizonStart?: string;
  /** Slider range end; % uses net flow at this point vs. start. */
  timeHorizonEnd?: string;
  dataType: 'historical' | 'forecasted';
  productSubType?: string;
  /** Sum of `N_Clients` over all rows aggregated into this card (filters + time window). */
  nClientsTotal?: number;
}

@Component({
  selector: 'app-market-flow-card',
  standalone: true,
  imports: [CommonModule, TitleComponent],
  templateUrl: './market-flow-card.component.html',
  styleUrl: './market-flow-card.component.scss'
})
export class MarketFlowCardComponent {
  constructor(private readonly historicAnchor: AssetFlowHistoricAnchorService) {}

  @Input() card!: MarketFlowCard;
  @Input() isPinned: boolean = false;
  /** Expose card id on host for VDI: carousel can open detail from document capture listener. */
  @HostBinding('attr.data-card-id') get cardIdAttr(): string {
    return this.card?.id ?? '';
  }
  @Output() moreOptions = new EventEmitter<string>();
  @Output() askMarketSense = new EventEmitter<string>();
  @Output() pin = new EventEmitter<string>();
  @Output() cardClick = new EventEmitter<string>();
  @Output() viewMore = new EventEmitter<string>();

  private askMarketSenseLastHandled = 0;
  private readonly ASK_MARKETSENSE_DEBOUNCE_MS = 300;
  private pinLastHandled = 0;
  private readonly PIN_DEBOUNCE_MS = 300;
  /** Debounce card open so mousedown + click don't double-open (VDI may only send one). */
  private cardClickLastEmitted = 0;
  private readonly CARD_CLICK_DEBOUNCE_MS = 400;

  getConfidenceColor(confidence: 'high' | 'medium' | 'low'): string {
    // All scores are green for now
    return '#2A6907';
  }

  /** Short hint for the % pill: “between” dates, same month-end style as time-horizon handle tooltips. */
  get percentageHoverLabel(): string {
    if (!this.card) return '';
    return buildMarketFlowPercentageHoverLabel(this.card, null, this.historicAnchor.getAnchor());
  }

  /** Full USD amount for native tooltip on compact {@link MarketFlowCard.value}. */
  get valueHoverFullLabel(): string {
    if (!this.card?.value) return '';
    const prefix = 'Net flow: ';
    const exact = this.card.netFlowUsd;
    if (exact != null && Number.isFinite(exact)) {
      return prefix + formatFlowCurrencyUsdFull(exact);
    }
    const d = parseFlowDisplayValueToDollars(String(this.card.value).trim());
    if (Number.isFinite(d)) {
      return prefix + formatFlowCurrencyUsdFull(d);
    }
    return prefix + this.card.value;
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
        event.stopImmediatePropagation();
      }
      return;
    }
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
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
    // Debounce: VDI may fire both pointerdown and click
    const now = Date.now();
    if (now - this.pinLastHandled < this.PIN_DEBOUNCE_MS) return;
    this.pinLastHandled = now;
    this.pin.emit(this.card.id);
  }

  private viewMoreLastHandled = 0;
  private readonly VIEW_MORE_DEBOUNCE_MS = 400;

  onViewMore(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const now = Date.now();
    if (now - this.viewMoreLastHandled < this.VIEW_MORE_DEBOUNCE_MS) return;
    this.viewMoreLastHandled = now;
    this.viewMore.emit(this.card.id);
  }

  /** Shared: emit card click once per gesture (VDI may send only mousedown or only click). */
  private emitCardClickIfAllowed(event?: Event, skipTargetCheck = false): void {
    if (!skipTargetCheck && event) {
      const target = event.target as HTMLElement;
      if (target.closest('button') || target.closest('.card-actions') || target.closest('.view-more-link')) {
        return;
      }
    }
    const now = Date.now();
    if (now - this.cardClickLastEmitted < this.CARD_CLICK_DEBOUNCE_MS) return;
    this.cardClickLastEmitted = now;
    this.cardClick.emit(this.card.id);
  }

  onCardClick(event?: Event): void {
    this.emitCardClickIfAllowed(event);
  }

  onCardMouseDown(event?: Event): void {
    // VDI/remote desktop often doesn't synthesize 'click' - only mousedown/mouseup.
    this.emitCardClickIfAllowed(event);
  }

  onCardPointerDown(event?: Event): void {
    // Some VDIs use pointer events instead of mouse/touch.
    this.emitCardClickIfAllowed(event);
  }

  onCardTouchStart(event: TouchEvent): void {
    this.emitCardClickIfAllowed(event as unknown as Event);
  }

  onCardKeyDown(event: KeyboardEvent): void {
    // Keyboard open for VDI and accessibility: Enter or Space opens detail.
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.emitCardClickIfAllowed(undefined, true);
  }
}

