import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MarketFlowCardComponent, type MarketFlowCard } from './market-flow-card/market-flow-card.component';
import { ViewMoreCardComponent } from './view-more-card/view-more-card.component';

// Re-export for convenience
export type { MarketFlowCard } from './market-flow-card/market-flow-card.component';

@Component({
  selector: 'app-featured-market-flows-carousel',
  standalone: true,
  imports: [CommonModule, MarketFlowCardComponent, ViewMoreCardComponent],
  templateUrl: './featured-market-flows-carousel.component.html',
  styleUrl: './featured-market-flows-carousel.component.scss'
})
export class FeaturedMarketFlowsCarouselComponent {
  @Input() cards: MarketFlowCard[] = [];
  @Input() showViewMoreCard: boolean = true;
  
  dataType: 'historical' | 'forecasted' = 'historical';
  selectedTimeHorizon: string = '-9 mo';
  currentSlideIndex: number = 0;
  
  cardsPerSlide = 3;
  
  get timeHorizons(): string[] {
    return this.dataType === 'historical' 
      ? ['-3 mo', '-6 mo', '-9 mo', '-12 mo', '-18 mo']
      : ['+3 mo', '+6 mo', '+9 mo', '+12 mo', '+18 mo'];
  }
  
  get filteredCards(): MarketFlowCard[] {
    // Filter cards based on selected dataType and timeHorizon
    return this.cards.filter(card => 
      card.dataType === this.dataType && card.timeHorizon === this.selectedTimeHorizon
    );
  }
  
  get totalSlides(): number {
    return this.showViewMoreCard ? this.filteredCards.length + 1 : this.filteredCards.length;
  }
  
  get visibleCards(): MarketFlowCard[] {
    // Calculate the starting index to keep the selected card visible
    // If we're at card 7 out of 9, we want to show cards 7, 8, 9
    const maxStartIndex = Math.max(0, this.totalSlides - this.cardsPerSlide);
    const startIndex = Math.min(this.currentSlideIndex, maxStartIndex);
    return this.filteredCards.slice(startIndex, startIndex + this.cardsPerSlide);
  }
  
  get showViewMoreInCurrentView(): boolean {
    if (!this.showViewMoreCard) return false;
    
    // Show the view more card if we're on the last slide
    // or if the current view includes the position where view more should be
    const viewMorePosition = this.filteredCards.length; // Position after all filtered cards
    const maxStartIndex = Math.max(0, this.totalSlides - this.cardsPerSlide);
    const startIndex = Math.min(this.currentSlideIndex, maxStartIndex);
    const endIndex = startIndex + this.cardsPerSlide;
    
    return viewMorePosition >= startIndex && viewMorePosition < endIndex;
  }
  
  setDataType(type: 'historical' | 'forecasted'): void {
    this.dataType = type;
    // Update the time horizon sign when switching data type
    const currentValue = this.selectedTimeHorizon.replace(/[+-]/g, '');
    const newSign = type === 'historical' ? '-' : '+';
    this.selectedTimeHorizon = `${newSign}${currentValue}`;
    // Reset to first slide when changing data type
    this.currentSlideIndex = 0;
  }
  
  setTimeHorizon(horizon: string): void {
    this.selectedTimeHorizon = horizon;
    // Reset to first slide when changing time horizon
    this.currentSlideIndex = 0;
  }
  
  previousSlide(): void {
    if (this.currentSlideIndex > 0) {
      this.currentSlideIndex--;
    }
  }
  
  nextSlide(): void {
    const maxIndex = this.filteredCards.length - 1;
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
  
  onViewMore(): void {
    // Handle view more action
    console.log('View more clicked');
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

