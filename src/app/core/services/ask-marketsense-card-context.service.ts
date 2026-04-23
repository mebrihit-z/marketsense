import { Injectable } from '@angular/core';
import type { MarketFlowCard } from '../../shared/components/market-flows-carousel/market-flow-card/market-flow-card.component';

/**
 * When Ask MarketSense opens from a market flow card, the active card is set here
 * before the modal is shown, so the modal banner and `card_context` on the request
 * still work if `[card]` is not applied in the same change-detection pass as visibility.
 * Cleared when non-card entry points (sticky, hero section) open, or on carousel close.
 */
@Injectable({ providedIn: 'root' })
export class AskMarketsenseCardContextService {
  private _card: MarketFlowCard | null = null;

  setActiveFromMarketFlowCard(card: MarketFlowCard | null): void {
    this._card = card;
  }

  getActiveCard(): MarketFlowCard | null {
    return this._card;
  }

  /** Non-empty display title, or `null` if no in-flight card context. */
  getActiveTitleForBanner(): string | null {
    const t = this._card?.title;
    if (typeof t === 'string' && t.trim()) {
      return t.trim();
    }
    return null;
  }

  clear(): void {
    this._card = null;
  }
}
