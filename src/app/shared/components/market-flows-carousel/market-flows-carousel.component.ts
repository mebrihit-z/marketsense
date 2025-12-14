import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MarketFlowCardComponent, type MarketFlowCard } from './market-flow-card/market-flow-card.component';
import { AskMarketsenseModalComponent } from './ask-marketsense-modal/ask-marketsense-modal.component';
import { ExportModalComponent } from './export-modal/export-modal.component';

// Re-export for convenience
export type { MarketFlowCard } from './market-flow-card/market-flow-card.component';

@Component({
  selector: 'app-featured-market-flows-carousel',
  standalone: true,
  imports: [CommonModule, MarketFlowCardComponent, AskMarketsenseModalComponent, ExportModalComponent],
  templateUrl: './market-flows-carousel.component.html',
  styleUrl: './market-flows-carousel.component.scss'
})
export class FeaturedMarketFlowsCarouselComponent implements OnChanges {
  @Input() cards: MarketFlowCard[] = [];
  @Input() pinnedCardIds: string[] = [];
  @Input() showViewMoreCard: boolean = true;
  @Input() dataType: 'historical' | 'forecasted' = 'historical';
  @Input() selectedTimeHorizon: string = '-9 mo';
  @Output() pinCard = new EventEmitter<string>();
  
  currentSlideIndex: number = 0;
  
  cardsPerSlide = 3;
  
  // Modal state
  showModal: boolean = false;
  selectedCard: MarketFlowCard | null = null;
  showExportModal: boolean = false;
  selectedCardForExport: MarketFlowCard | null = null;
  
  get headerTitle(): string {
    return this.dataType === 'historical' 
      ? 'Featured Market Flows' 
      : 'Featured Market Flows';
  }
  
  get filteredCards(): MarketFlowCard[] {
    // Cards are already filtered by the dashboard component
    // Just return all cards passed in
    return this.cards || [];
  }
  
  get totalSlides(): number {
    // Calculate number of slides (groups of cardsPerSlide)
    const totalCards = this.filteredCards.length;
    if (totalCards === 0) return 0;
    return Math.ceil(totalCards / this.cardsPerSlide);
  }
  
  get visibleCards(): MarketFlowCard[] {
    // Calculate the starting index based on current slide (each slide shows cardsPerSlide cards)
    const startIndex = this.currentSlideIndex * this.cardsPerSlide;
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

  ngOnChanges(changes: SimpleChanges): void {
    // Reset to first slide when dataType or timeHorizon change
    if (changes['dataType'] || changes['selectedTimeHorizon']) {
      this.currentSlideIndex = 0;
    }
    
    // Only reset for cards if it's the first time or if the content actually changed
    if (changes['cards']) {
      const cardsChange = changes['cards'];
      const previousCards = cardsChange.previousValue || [];
      const currentCards = cardsChange.currentValue || [];
      
      // Only reset if:
      // 1. It's the first time cards are set (no previous value)
      // 2. The length changed
      // 3. The card IDs are different (content changed)
      const shouldReset = !cardsChange.previousValue || 
                         previousCards.length !== currentCards.length ||
                         (previousCards.length > 0 && currentCards.length > 0 && 
                          previousCards[0]?.id !== currentCards[0]?.id);
      
      if (shouldReset) {
        this.currentSlideIndex = 0;
      }
    }
  }
  
  previousSlide(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (this.currentSlideIndex > 0 && this.totalSlides > 0) {
      this.currentSlideIndex--;
    }
  }
  
  nextSlide(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const maxSlideIndex = this.totalSlides - 1;
    if (this.currentSlideIndex < maxSlideIndex && this.totalSlides > 0) {
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
    // Find the card by ID
    const card = this.cards.find(c => c.id === cardId);
    if (card) {
      this.selectedCard = card;
      this.showModal = true;
    }
  }
  
  onCloseModal(): void {
    this.showModal = false;
    this.selectedCard = null;
  }
  
  onSendMessage(message: string): void {
    // Handle sending message to AI
    console.log('Message sent:', message);
    // Here you would typically send the message to an AI service
  }
  
  onDownload(cardId: string): void {
    // Find the card by ID and show export modal
    const card = this.cards.find(c => c.id === cardId);
    if (card) {
      this.selectedCardForExport = card;
      this.showExportModal = true;
    }
  }

  onCloseExportModal(): void {
    this.showExportModal = false;
    this.selectedCardForExport = null;
  }

  onExportXLS(): void {
    // Handle XLS export
    console.log('Export XLS for card:', this.selectedCardForExport?.id);
    // Here you would typically trigger the XLS export
  }

  onExportPDF(): void {
    // Handle PDF export
    console.log('Export PDF for card:', this.selectedCardForExport?.id);
    // Here you would typically trigger the PDF export
  }
  
  onMoreOptions(cardId: string): void {
    // Handle more options action
    console.log('More options clicked for card:', cardId);
  }

  onPin(cardId: string): void {
    // Emit pin event to parent component
    this.pinCard.emit(cardId);
    // Reset to first slide to show the pinned card
    this.currentSlideIndex = 0;
  }

  isCardPinned(cardId: string): boolean {
    return this.pinnedCardIds.includes(cardId);
  }
}

