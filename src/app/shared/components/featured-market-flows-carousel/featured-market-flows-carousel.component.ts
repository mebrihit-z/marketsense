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
  
  get totalSlides(): number {
    return Math.ceil(this.cards.length / 3);
  }
  
  get visibleCards(): MarketFlowCard[] {
    const startIndex = this.currentSlideIndex * 3;
    return this.cards.slice(startIndex, startIndex + 3);
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
    if (this.currentSlideIndex < this.totalSlides - 1) {
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

