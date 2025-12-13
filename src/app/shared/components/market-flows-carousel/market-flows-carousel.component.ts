import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MarketFlowCardComponent, type MarketFlowCard } from './market-flow-card/market-flow-card.component';
import { ViewMoreCardComponent } from './view-more-card/view-more-card.component';
import { AskMarketsenseModalComponent } from './ask-marketsense-modal/ask-marketsense-modal.component';
import { ExportModalComponent } from './export-modal/export-modal.component';

// Re-export for convenience
export type { MarketFlowCard } from './market-flow-card/market-flow-card.component';

@Component({
  selector: 'app-featured-market-flows-carousel',
  standalone: true,
  imports: [CommonModule, MarketFlowCardComponent, ViewMoreCardComponent, AskMarketsenseModalComponent, ExportModalComponent],
  templateUrl: './market-flows-carousel.component.html',
  styleUrl: './market-flows-carousel.component.scss'
})
export class FeaturedMarketFlowsCarouselComponent implements OnChanges {
  @Input() cards: MarketFlowCard[] = [];
  @Input() showViewMoreCard: boolean = true;
  @Input() dataType: 'historical' | 'forecasted' = 'historical';
  @Input() selectedTimeHorizon: string = '-9 mo';
  
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

  ngOnChanges(changes: SimpleChanges): void {
    // Reset to first slide when dataType or timeHorizon changes
    if (changes['dataType'] || changes['selectedTimeHorizon']) {
      this.currentSlideIndex = 0;
    }
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
}

