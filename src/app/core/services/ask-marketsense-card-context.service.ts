import { Injectable } from '@angular/core';
import type { MarketFlowCard } from '../../shared/components/market-flows-carousel/market-flow-card/market-flow-card.component';

/**
 * When Ask MarketSense opens from a market flow card, the active card is set here
 * before the modal is shown, so the modal banner and `card_context` on the request
 * still work if `[card]` is not applied in the same change-detection pass as visibility.
 * Cleared when non-card entry points (sticky, hero section) open, or on carousel close.
 */
@Injectable({ providedIn: 'root' })
// eslint-disable-next-line import/prefer-default-export -- Angular DI expects a named Injectable class export.
export class AskMarketsenseCardContextService {
  private activeCard: MarketFlowCard | null = null;

  /**
   * Stores the market flow card used for banner and API context on the next Ask open.
   * @param {import('../../shared/components/market-flows-carousel/market-flow-card/market-flow-card.component').MarketFlowCard|null} card Active carousel card, or `null` to clear.
   * @returns {void}
   */
  setActiveFromMarketFlowCard(card: MarketFlowCard | null): void {
    this.activeCard = card;
  }

  /**
   * @returns {import('../../shared/components/market-flows-carousel/market-flow-card/market-flow-card.component').MarketFlowCard|null} In-flight card context, or `null` when none is set.
   */
  getActiveCard(): MarketFlowCard | null {
    return this.activeCard;
  }

  /**
   * Non-empty display title, or `null` if no in-flight card context.
   * @returns {string|null} Trimmed card title for the modal banner, or `null`.
   */
  getActiveTitleForBanner(): string | null {
    const t = this.activeCard?.title;
    if (typeof t === 'string' && t.trim()) {
      return t.trim();
    }
    return null;
  }

  /**
   * Drops any in-flight card context (e.g. sticky or hero entry points).
   * @returns {void}
   */
  clear(): void {
    this.activeCard = null;
  }
}
