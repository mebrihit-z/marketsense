/* eslint-disable */
import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MarketFlowCardComponent, type MarketFlowCard } from './market-flow-card/market-flow-card.component';
import AskMarketsenseModalComponent from '../ask-marketsense-modal/ask-marketsense-modal.component';
import ExportModalComponent from './export-modal/export-modal.component';
import MarketFlowDetailModalComponent from './market-flow-detail-modal/market-flow-detail-modal.component';
import TitleComponent from '../title/title.component';
import { type AssetFlowRecord } from '../../utils/asset-flows-to-sankey.util';

// Re-export for convenience
export type { MarketFlowCard } from './market-flow-card/market-flow-card.component';

@Component({
  selector: 'app-featured-market-flows-carousel',
  standalone: true,
  imports: [CommonModule, MarketFlowCardComponent, AskMarketsenseModalComponent, ExportModalComponent, MarketFlowDetailModalComponent, TitleComponent],
  templateUrl: './market-flows-carousel.component.html',
  styleUrl: './market-flows-carousel.component.scss'
})
export class FeaturedMarketFlowsCarouselComponent implements OnInit, OnChanges {
  @Input() cards: MarketFlowCard[] = [];
  @Input() pinnedCardIds: string[] = [];
  @Input() showViewMoreCard: boolean = true;
  @Input() dataType: 'historical' | 'forecasted' = 'historical';
  @Input() selectedTimeHorizon: string = '-9 mo';
  @Input() rawAssetFlowsData: AssetFlowRecord[] = [];
  @Input() timeHorizonRange: { start: string; end: string } | null = null;
  @Input() selectedInvestorRegions: string[] = [];
  @Input() selectedProductTypes: string[] = [];
  @Output() pinCard = new EventEmitter<string>();
  
  currentSlideIndex: number = 0;
  
  cardsPerSlide = 4;
  
  ngOnInit(): void {
    this.updateCardsPerSlide();
  }
  
  @HostListener('window:resize', ['$event'])
  onWindowResize(): void {
    this.updateCardsPerSlide();
  }
  
  updateCardsPerSlide(): void {
    const width = window.innerWidth;
    if (width <= 768) {
      this.cardsPerSlide = 1; // Mobile: 1 card
    } else if (width <= 1024) {
      this.cardsPerSlide = 2; // iPad: 2 cards
    } else {
      this.cardsPerSlide = 4; // Desktop: 4 cards
    }
    // Reset to first slide when cards per slide changes
    this.currentSlideIndex = 0;
  }
  
  // Modal state
  showModal: boolean = false;
  selectedCard: MarketFlowCard | null = null;
  showExportModal: boolean = false;
  selectedCardForExport: MarketFlowCard | null = null;
  selectedCardForDetail: MarketFlowCard | null = null;
  
  // Sort dropdown state
  sortDropdownOpen: boolean = false;
  selectedSortOption: string = 'value-high';
  
  sortOptions = [
    { value: 'value-high', label: 'Value: Highest', displayLabel: 'Value: High to Low', icon: 'assets/icons/highest-value-icon.svg' },
    { value: 'value-low', label: 'Value: Lowest', displayLabel: 'Value: Low to High', icon: 'assets/icons/lowest-value-icon.svg' },
    { value: 'change-high', label: 'Change %: Highest', displayLabel: 'Change %: High to Low', icon: 'assets/icons/highest-percentage-icon.svg' },
    { value: 'change-low', label: 'Change %: Lowest', displayLabel: 'Change %: Low to High', icon: 'assets/icons/lowest-percentage-icon.svg' }
  ];
  
  get headerTitle(): string {
    return this.dataType === 'historical' 
      ? 'Market Flows' 
      : 'Market Flows';
  }
  
  get filteredCards(): MarketFlowCard[] {
    // Cards are already filtered by the dashboard component
    // Apply sorting based on selected sort option
    const cards = this.cards || [];
    return this.sortCards([...cards]);
  }
  
  sortCards(cards: MarketFlowCard[]): MarketFlowCard[] {
    // First apply the selected sort option to get a base ordering
    switch (this.selectedSortOption) {
      case 'value-high':
        cards.sort((a, b) => Math.abs(this.parseValue(b.value)) - Math.abs(this.parseValue(a.value)));
        break;
      case 'value-low':
        cards.sort((a, b) => Math.abs(this.parseValue(a.value)) - Math.abs(this.parseValue(b.value)));
        break;
      case 'change-high':
        cards.sort((a, b) => Math.abs(this.parsePercentage(b.percentageChange)) - Math.abs(this.parsePercentage(a.percentageChange)));
        break;
      case 'change-low':
        cards.sort((a, b) => Math.abs(this.parsePercentage(a.percentageChange)) - Math.abs(this.parsePercentage(b.percentageChange)));
        break;
      default:
        // Leave original order
        break;
    }

    // Then move pinned cards to the front while preserving their relative order
    if (!this.pinnedCardIds || this.pinnedCardIds.length === 0) {
      return cards;
    }

    const pinned: MarketFlowCard[] = [];
    const unpinned: MarketFlowCard[] = [];

    for (const card of cards) {
      if (this.isCardPinned(card.id)) {
        pinned.push(card);
      } else {
        unpinned.push(card);
      }
    }

    return [...pinned, ...unpinned];
  }
  
  parseValue(valueStr: string): number {
    // Parse values like "$124.8B", "-$98.4B", "$90B"
    // Remove $ and B, but keep the negative sign
    const cleaned = valueStr.replace(/[$,B]/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  
  parsePercentage(percentageStr: string): number {
    // Parse percentages like "+12.3%", "-12.3%", "+4.6%"
    // Remove + and %, but keep the negative sign
    const cleaned = percentageStr.replace(/[+%]/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  
  get totalSlides(): number {
    // Calculate number of slides (groups of cardsPerSlide)
    const totalCards = this.filteredCards.length;
    if (totalCards === 0) return 0;
    return Math.ceil(totalCards / this.cardsPerSlide);
  }
  
  get currentPage(): number {
    return this.currentSlideIndex + 1;
  }
  
  get totalPages(): number {
    return this.totalSlides;
  }
  
  get totalCardsCount(): number {
    return this.filteredCards.length;
  }
  
  get viewingRangeStart(): number {
    if (this.totalCardsCount === 0) return 0;
    return this.currentSlideIndex * this.cardsPerSlide + 1;
  }
  
  get viewingRangeEnd(): number {
    if (this.totalCardsCount === 0) return 0;
    return Math.min((this.currentSlideIndex + 1) * this.cardsPerSlide, this.totalCardsCount);
  }
  
  get visiblePageNumbers(): number[] {
    const pages: number[] = [];
    const total = this.totalPages;
    const current = this.currentPage;
    
    if (total <= 7) {
      // Show all pages if 7 or fewer
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      // Show first page
      pages.push(1);
      
      if (current <= 4) {
        // Near the start: show 1, 2, 3, 4, 5, ..., last
        for (let i = 2; i <= 5; i++) {
          pages.push(i);
        }
        pages.push(-1); // Ellipsis
        pages.push(total);
      } else if (current >= total - 3) {
        // Near the end: show 1, ..., last-4, last-3, last-2, last-1, last
        pages.push(-1); // Ellipsis
        for (let i = total - 4; i <= total; i++) {
          pages.push(i);
        }
      } else {
        // In the middle: show 1, ..., current-1, current, current+1, ..., last
        pages.push(-1); // Ellipsis
        for (let i = current - 1; i <= current + 1; i++) {
          pages.push(i);
        }
        pages.push(-1); // Ellipsis
        pages.push(total);
      }
    }
    
    return pages;
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
    
    // Reset to first slide when pinned cards change (to show newly pinned/unpinned cards)
    if (changes['pinnedCardIds']) {
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
    if (this.selectedCardForDetail) {
      this.onCloseDetailModal();
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
    if (this.selectedCardForDetail) {
      this.onCloseDetailModal();
    }
    const maxSlideIndex = this.totalSlides - 1;
    if (this.currentSlideIndex < maxSlideIndex && this.totalSlides > 0) {
      this.currentSlideIndex++;
    }
  }
  
  goToSlide(index: number): void {
    if (this.selectedCardForDetail) {
      this.onCloseDetailModal();
    }
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
    console.log('Carousel received pin event for card:', cardId);
    // Emit pin event to parent component
    // The ngOnChanges will handle resetting to first slide when pinnedCardIds changes
    this.pinCard.emit(cardId);
  }

  onCardClick(cardId: string): void {
    // Find the card by ID and show inline detail (left) + stacked cards (right)
    const card = this.cards.find(c => c.id === cardId);
    if (card) {
      this.selectedCardForDetail = card;
    }
  }

  onCloseDetailModal(): void {
    this.selectedCardForDetail = null;
  }

  /** Cards to show in the right column when a card is selected (all except the selected one). */
  get stackedCards(): MarketFlowCard[] {
    if (!this.selectedCardForDetail) return [];
    return this.filteredCards.filter(c => c.id !== this.selectedCardForDetail!.id);
  }

  isCardPinned(cardId: string): boolean {
    return this.pinnedCardIds.includes(cardId);
  }
  
  toggleSortDropdown(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.sortDropdownOpen = !this.sortDropdownOpen;
  }
  
  closeSortDropdown(): void {
    this.sortDropdownOpen = false;
  }
  
  selectSortOption(optionValue: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.selectedSortOption = optionValue;
    this.sortDropdownOpen = false;
    // Reset to first slide when sort changes
    this.currentSlideIndex = 0;
  }
  
  get selectedSortDisplayLabel(): string {
    const option = this.sortOptions.find(opt => opt.value === this.selectedSortOption);
    return option?.displayLabel || 'Value: High to Low';
  }
  
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.sortDropdownOpen) {
      const target = event.target as HTMLElement;
      const dropdownElement = target.closest('.sort-section');
      if (!dropdownElement) {
        this.closeSortDropdown();
      }
    }
  }
}

