/* eslint-disable */
import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, OnInit, OnDestroy, HostListener, ElementRef, ChangeDetectorRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MarketFlowCardComponent, type MarketFlowCard } from './market-flow-card/market-flow-card.component';
import AskMarketsenseModalComponent from '../ask-marketsense-modal/ask-marketsense-modal.component';
import ExportModalComponent from './export-modal/export-modal.component';
import MarketFlowDetailModalComponent from './market-flow-detail-modal/market-flow-detail-modal.component';
import TitleComponent from '../title/title.component';
import { type AssetFlowRecord } from '../../utils/asset-flows-to-sankey.util';
import { parseFlowDisplayValueToBillions } from '../../utils/flow-currency-format.util';
import { AskMarketsenseCardContextService } from '../../../core/services/ask-marketsense-card-context.service';

// Re-export for convenience
export type { MarketFlowCard } from './market-flow-card/market-flow-card.component';

@Component({
  selector: 'app-featured-market-flows-carousel',
  standalone: true,
  imports: [CommonModule, MarketFlowCardComponent, AskMarketsenseModalComponent, ExportModalComponent, MarketFlowDetailModalComponent, TitleComponent],
  templateUrl: './market-flows-carousel.component.html',
  styleUrl: './market-flows-carousel.component.scss'
})
export class FeaturedMarketFlowsCarouselComponent implements OnInit, OnDestroy, OnChanges {
  @ViewChild(MarketFlowDetailModalComponent) private marketFlowDetailModal?: MarketFlowDetailModalComponent;

  @Input() cards: MarketFlowCard[] = [];
  @Input() pinnedCardIds: string[] = [];
  @Input() showViewMoreCard: boolean = true;
  @Input() dataType: 'historical' | 'forecasted' = 'historical';
  @Input() selectedTimeHorizon: string = '-9 mo';
  @Input() rawAssetFlowsData: AssetFlowRecord[] = [];
  @Input() timeHorizonRange: { start: string; end: string } | null = null;
  @Input() selectedInvestorRegions: string[] = [];
  @Input() selectedInvestorTypes: string[] = [];
  @Input() selectedProductRegions: string[] = [];
  @Input() selectedProductTypes: string[] = [];
  @Output() pinCard = new EventEmitter<string>();

  /** Document capture listener: open detail on card pointer/mouse down (VDI often doesn't fire click). */
  private _documentCardCaptureListener = (e: MouseEvent | PointerEvent | TouchEvent) => this.onDocumentCardCapture(e);

  currentSlideIndex: number = 0;

  /** Tracks last column count so resize can clamp slide index when crossing breakpoints. */
  private lastCardsPerSlideResolved = 4;

  constructor(
    private carouselHost: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef,
    private askMarketsenseCardContext: AskMarketsenseCardContextService
  ) {}

  ngOnInit(): void {
    this.lastCardsPerSlideResolved = this.cardsPerSlide;
    if (typeof document !== 'undefined') {
      // Use bubble phase (false) so button/link handlers run first; we only open card if hit was on card body
      document.addEventListener('mousedown', this._documentCardCaptureListener, false);
      document.addEventListener('pointerdown', this._documentCardCaptureListener, false);
      document.addEventListener('touchstart', this._documentCardCaptureListener, false);
    }
  }

  ngOnDestroy(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('mousedown', this._documentCardCaptureListener, false);
      document.removeEventListener('pointerdown', this._documentCardCaptureListener, false);
      document.removeEventListener('touchstart', this._documentCardCaptureListener, false);
    }
  }

  /**
   * Capture-phase handler: when user activates a market-flow card (e.g. mousedown/pointerdown),
   * open the detail. Used so the detail opens on VDI where click may not fire.
   * Must not open when user hit a button/link so those controls still work on VDI.
   */
  onDocumentCardCapture(event: MouseEvent | PointerEvent | TouchEvent): void {
    const targetEl = event.target as HTMLElement | null;
    // Never open card if the event target is a control (VDI may only fire one event; we must not swallow it)
    if (targetEl?.closest?.('[data-market-flow-action]')) {
      return;
    }
    const clientX = 'touches' in event ? event.touches[0]?.clientX : (event as MouseEvent).clientX;
    const clientY = 'touches' in event ? event.touches[0]?.clientY : (event as MouseEvent).clientY;
    if (clientX == null || clientY == null) return;
    const elAtPoint = typeof document !== 'undefined'
      ? document.elementFromPoint(clientX, clientY)
      : targetEl;
    const hit = elAtPoint as HTMLElement | null;
    // Also skip if hit-test says we're on a control (VDI elementFromPoint can be wrong the other way)
    if (hit?.closest?.('[data-market-flow-action]')) return;
    const cardEl = hit?.closest('app-market-flow-card') ?? targetEl?.closest?.('app-market-flow-card');
    if (!cardEl || !this.carouselHost.nativeElement.contains(cardEl)) return;
    const cardId = cardEl.getAttribute('data-card-id');
    if (!cardId) return;
    const card = this.cards.find(c => c.id === cardId);
    if (card) {
      this.selectedCardForDetail = card;
      event.preventDefault();
      event.stopPropagation();
      this.cdr.detectChanges();
    }
  }
  
  @HostListener('window:resize')
  onWindowResize(): void {
    const next = this.cardsPerSlide;
    if (next === this.lastCardsPerSlideResolved) {
      return;
    }
    this.lastCardsPerSlideResolved = next;
    const slideCount = Math.max(1, Math.ceil(this.filteredCards.length / next));
    const maxIdx = Math.max(0, slideCount - 1);
    this.currentSlideIndex = Math.min(this.currentSlideIndex, maxIdx);
  }

  private viewportWidth(): number {
    return typeof window !== 'undefined' ? window.innerWidth : 1920;
  }

  /** Visible market-flow cards per page: 5 (>1920) → 4 → 3 → 2 → 1 by viewport width. */
  get cardsPerSlide(): number {
    const w = this.viewportWidth();
    if (w <= 768) {
      return 1;
    }
    if (w <= 1024) {
      return 2;
    }
    if (w <= 1280) {
      return 3;
    }
    if (w > 1920) {
      return 5;
    }
    return 4;
  }

  /**
   * Stacked rail beside expanded detail: 2 on tablet; 3 on desktop (including >1920).
   * Ultra-wide uses 5 cards in the grid but only 3 in the rail, same as 1281–1920.
   */
  get stackedCardsCount(): number {
    return this.viewportWidth() <= 1024 ? 2 : 3;
  }

  // Modal state
  showModal: boolean = false;
  selectedCard: MarketFlowCard | null = null;
  showExportModal: boolean = false;
  selectedCardForExport: MarketFlowCard | null = null;
  selectedCardForDetail: MarketFlowCard | null = null;

  /** For embedded modal markup (VDI): overlay visible when detail shown in non-inline mode. */
  get isVisible(): boolean {
    return !!this.selectedCardForDetail;
  }

  /** For embedded modal markup (VDI): carousel always uses inline detail panel. */
  inline: boolean = true;
  
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
    const b = parseFlowDisplayValueToBillions(valueStr);
    return Number.isFinite(b) ? b : 0;
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
  }
  
  onViewMore(): void {
    // Handle view more action
  }
  
  onAskMarketSense(cardId: string): void {
    // Find the card by ID
    const card = this.cards.find(c => c.id === cardId);
    if (card) {
      this.askMarketsenseCardContext.setActiveFromMarketFlowCard(card);
      this.selectedCard = card;
      this.showModal = true;
    }
  }
  
  onCloseModal(): void {
    this.showModal = false;
    this.selectedCard = null;
    this.askMarketsenseCardContext.clear();
  }
  
  onSendMessage(message: string): void {
    // Handle sending message to AI
    // Here you would typically send the message to an AI service
  }
  
  onDownload(cardId?: string): void {
    // When called from embedded modal (VDI), cardId may be omitted - use selected card
    const id = cardId ?? this.selectedCardForDetail?.id ?? this.selectedCard?.id;
    if (!id) return;
    const card = this.cards.find(c => c.id === id);
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
    // Here you would typically trigger the XLS export
  }

  onExportCSV(): void {
    this.marketFlowDetailModal?.exportExpandedCardAsCsv();
  }

  async onExportPDF(): Promise<void> {
    await this.marketFlowDetailModal?.exportExpandedCardAsPdf();
  }

  async onExportPNG(): Promise<void> {
    await this.marketFlowDetailModal?.exportExpandedCardAsPng();
  }
  
  onMoreOptions(cardId: string): void {
    // Handle more options action
  }

  onPin(cardId: string): void {
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

  /** Alias for templates that reference onClose (e.g. embedded modal markup on VDI). */
  onClose(): void {
    this.onCloseDetailModal();
  }

  /** Alias for templates that reference card (e.g. selected card for detail view). */
  get card(): MarketFlowCard | null {
    return this.selectedCardForDetail;
  }

  /** For embedded modal markup (VDI): confidence color for AI score. */
  getConfidenceColor(confidence: 'high' | 'medium' | 'low'): string {
    return confidence ? '#00bc7d' : '#00bc7d';
  }

  /** For embedded modal markup (VDI): confidence label for AI score. */
  getConfidenceLabel(confidence: 'high' | 'medium' | 'low'): string {
    switch (confidence) {
      case 'high': return 'High';
      case 'medium': return 'Medium';
      case 'low': return 'Low';
      default: return 'High';
    }
  }

  /** For embedded modal markup (VDI): projected value from selected card. */
  getProjectedValue(): string {
    if (!this.card) return '$0';
    return this.card.value;
  }

  /** For embedded modal markup (VDI): time horizon display for selected card. */
  getTimeHorizonDisplay(): string {
    if (!this.card) return '12 Month';
    return this.card.timeHorizon || '12 Month';
  }

  /** For embedded modal markup (VDI): chart data for line chart. */
  getChartData(): number[] {
    const labels = this.getXAxisLabels();
    const template = [10, 12, 18, 25, 35];
    if (labels.length <= template.length) return template.slice(0, labels.length);
    const last = template[template.length - 1] ?? 35;
    return [...template, ...Array(labels.length - template.length).fill(last)];
  }

  /** For embedded modal markup (VDI): chart line color. */
  getChartColor(): string {
    return '#00113F';
  }

  /** For embedded modal markup (VDI): chart width. */
  getChartWidth(): number {
    if (typeof window !== 'undefined' && this.card) {
      const width = window.innerWidth;
      if (width <= 480) return Math.max(280, width - 32);
      if (width <= 768) return Math.max(300, width - 48);
      if (width <= 1024) return Math.max(600, width - 64);
      return Math.min(width - 220, 800);
    }
    return 800;
  }

  /** For embedded modal markup (VDI): x-axis labels for chart. */
  getXAxisLabels(): string[] {
    if (this.timeHorizonRange?.start && this.timeHorizonRange?.end) {
      return this._generateTimeHorizonLabels(this.timeHorizonRange.start, this.timeHorizonRange.end);
    }
    if (!this.card) return ['0', '+3mo', '+6mo', '+9mo', '+12mo'];
    const isHistorical = this.card.dataType === 'historical';
    return isHistorical ? ['-12mo', '-9mo', '-6mo', '-3mo', '0'] : ['0', '+3mo', '+6mo', '+9mo', '+12mo'];
  }

  private _generateTimeHorizonLabels(start: string, end: string): string[] {
    const parseMo = (s: string): number | null => {
      const t = s.trim();
      if (t === '0') return 0;
      const m = t.match(/([+-]?\d+)\s*mo/i);
      return m ? parseInt(m[1], 10) : null;
    };
    const startMo = parseMo(start);
    const endMo = parseMo(end);
    if (startMo === null || endMo === null) return ['0', '+3mo', '+6mo', '+9mo', '+12mo'];
    const span = endMo - startMo;
    const n = Math.min(5, Math.max(1, Math.abs(span) + 1));
    const step = span === 0 ? 0 : span / (n - 1);
    const labels: string[] = [];
    for (let i = 0; i < n; i++) {
      const mo = span === 0 ? startMo : Math.round(startMo + step * i);
      labels.push(mo === 0 ? '0' : mo > 0 ? `+${mo}mo` : `${mo}mo`);
    }
    return labels.length ? labels : ['0', '+3mo', '+6mo', '+9mo', '+12mo'];
  }

  /** For embedded modal markup (VDI): chart y-axis min. */
  getYAxisMin(): number | undefined {
    const data = this.getChartData();
    if (data.length === 0) return undefined;
    const min = Math.min(...data);
    const max = Math.max(...data);
    return max <= 0 ? min * 1.1 : min * 0.9;
  }

  /** For embedded modal markup (VDI): chart y-axis max. */
  getYAxisMax(): number | undefined {
    const data = this.getChartData();
    if (data.length === 0) return undefined;
    const min = Math.min(...data);
    const max = Math.max(...data);
    return min < 0 && max <= 0 ? max * 0.9 : max * 1.1;
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

