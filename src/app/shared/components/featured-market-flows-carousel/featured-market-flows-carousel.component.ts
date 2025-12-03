import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MarketFlowCardComponent, type MarketFlowCard } from './market-flow-card/market-flow-card.component';

// Re-export for convenience
export type { MarketFlowCard } from './market-flow-card/market-flow-card.component';

@Component({
  selector: 'app-featured-market-flows-carousel',
  standalone: true,
  imports: [CommonModule, MarketFlowCardComponent],
  templateUrl: './featured-market-flows-carousel.component.html',
  styleUrl: './featured-market-flows-carousel.component.scss'
})
export class FeaturedMarketFlowsCarouselComponent {
  @Input() cards: MarketFlowCard[] = [];
  
  dataType: 'historical' | 'forecasted' = 'historical';
  selectedTimeHorizon: string = '+9 mo';
  currentSlideIndex: number = 0;
  
  timeHorizons = ['+3 mo', '+6 mo', '+9 mo', '+12 mo', '+18 mo'];
  cardsPerSlide = 3;
  
  get totalSlides(): number {
    return this.cards.length;
  }
  
  get visibleCards(): MarketFlowCard[] {
    // Calculate the starting index to keep the selected card visible
    // If we're at card 7 out of 9, we want to show cards 7, 8, 9
    const maxStartIndex = Math.max(0, this.cards.length - this.cardsPerSlide);
    const startIndex = Math.min(this.currentSlideIndex, maxStartIndex);
    return this.cards.slice(startIndex, startIndex + this.cardsPerSlide);
  }
  
  setDataType(type: 'historical' | 'forecasted'): void {
    this.dataType = type;
  }
  
  setTimeHorizon(horizon: string): void {
    this.selectedTimeHorizon = horizon;
  }
  
  previousSlide(): void {
    if (this.currentSlideIndex > 0) {
      this.currentSlideIndex--;
    }
  }
  
  nextSlide(): void {
    const maxIndex = this.cards.length - 1;
    if (this.currentSlideIndex < maxIndex) {
      this.currentSlideIndex++;
    }
  }
  
  goToSlide(index: number): void {
    this.currentSlideIndex = index;
  }
  
  onViewAll(): void {
    // Handle view all action
    console.log('View all clicked');
  }
  
  onAskMarketSense(cardId: string): void {
    // Handle ask MarketSense action
    console.log('Ask MarketSense clicked for card:', cardId);
  }
  
  onDownload(cardId: string): void {
    // Handle download action
    console.log('Download clicked for card:', cardId);
  }
  
  onMoreOptions(cardId: string): void {
    // Handle more options action
    console.log('More options clicked for card:', cardId);
  }
}

