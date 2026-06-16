/* eslint-disable */
import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, OnInit, OnDestroy, HostListener, ElementRef, ChangeDetectorRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MarketFlowCardComponent, type MarketFlowCard, type MarketFlowCardLevel } from './market-flow-card/market-flow-card.component';
import AskMarketsenseModalComponent from '../ask-marketsense-modal/ask-marketsense-modal.component';
import ExportModalComponent from './export-modal/export-modal.component';
import MarketFlowDetailModalComponent from './market-flow-detail-modal/market-flow-detail-modal.component';
import { InformationAndDisclosureComponent } from '../information-and-disclosure/information-and-disclosure.component';
import TitleComponent from '../title/title.component';
import {
  pickAssetFlowDisclosureMeta,
  type AssetFlowRecord,
  type DisclosureFooterData,
} from '../../utils/asset-flows-to-sankey.util';
import { parseFlowDisplayValueToBillions } from '../../utils/flow-currency-format.util';
import { AskMarketsenseCardContextService } from '../../../core/services/ask-marketsense-card-context.service';

// Re-export for convenience
export type { MarketFlowCard, MarketFlowCardLevel } from './market-flow-card/market-flow-card.component';

/**
 * @typedef {import('../../utils/asset-flows-to-sankey.util').DisclosureFooterData} DisclosureFooterData
 */

/**
 * @typedef {import('@angular/core').ElementRef<HTMLElement>} CarouselHostElementRef
 */

/**
 * @typedef {import('@angular/core').ChangeDetectorRef} ChangeDetectorRef
 */

/**
 * @typedef {import('../../../core/services/ask-marketsense-card-context.service').AskMarketsenseCardContextService} AskMarketsenseCardContextService
 */

/**
 * @typedef {import('./market-flow-card/market-flow-card.component').MarketFlowCard} MarketFlowCard
 */

@Component({
  selector: 'app-featured-market-flows-carousel',
  standalone: true,
  imports: [CommonModule, MarketFlowCardComponent, AskMarketsenseModalComponent, ExportModalComponent, MarketFlowDetailModalComponent, TitleComponent, InformationAndDisclosureComponent],
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
  @Output() cardLevelChange = new EventEmitter<MarketFlowCardLevel>();

  /** Local UI state for the View by toggle; parent is notified via cardLevelChange. */
  selectedCardLevel: MarketFlowCardLevel = 'product-sub-type';

  /**
   * Footer metadata for Information & Disclosures modal.
   * @returns {DisclosureFooterData} Disclosure footer fields derived from raw asset flows
   */
  get informationDisclosureFooterData(): DisclosureFooterData {
    return pickAssetFlowDisclosureMeta(this.rawAssetFlowsData ?? []);
  }

  /**
   * Document capture listener: open detail on card pointer/mouse down (VDI often doesn't fire click).
   * @param {MouseEvent | PointerEvent | TouchEvent} e - Document-level pointer/mouse/touch event
   * @returns {void}
   */
  private _documentCardCaptureListener = (e: MouseEvent | PointerEvent | TouchEvent) => this.onDocumentCardCapture(e);

  currentSlideIndex: number = 0;

  /** Tracks last column count so resize can clamp slide index when crossing breakpoints. */
  private lastCardsPerSlideResolved = 4;

  /**
   * @param {CarouselHostElementRef} carouselHost - Host element for containment checks on card capture
   * @param {ChangeDetectorRef} cdr - Change detection when opening detail from document capture (VDI)
   * @param {AskMarketsenseCardContextService} askMarketsenseCardContext - Active card context for Ask MarketSense modal
   */
  constructor(
    private carouselHost: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef,
    private askMarketsenseCardContext: AskMarketsenseCardContextService
  ) {}

  /** @returns {void} */
  ngOnInit(): void {
    this.lastCardsPerSlideResolved = this.cardsPerSlide;
    if (typeof document !== 'undefined') {
      // Use bubble phase (false) so button/link handlers run first; we only open card if hit was on card body
      document.addEventListener('mousedown', this._documentCardCaptureListener, false);
      document.addEventListener('pointerdown', this._documentCardCaptureListener, false);
      document.addEventListener('touchstart', this._documentCardCaptureListener, false);
    }
  }

  /** @returns {void} */
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
   * @param {MouseEvent | PointerEvent | TouchEvent} event - Document-level pointer/mouse/touch event
   * @returns {void}
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

  /**
   * Clamps the current slide index when breakpoint changes alter cards-per-slide.
   * @returns {void}
   */
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

  /**
   * @returns {number} Current viewport width in pixels, or 1920 when window is unavailable
   */
  private viewportWidth(): number {
    return typeof window !== 'undefined' ? window.innerWidth : 1920;
  }

  /**
   * Visible market-flow cards per page: 5 (>1920) → 4 → 3 → 2 → 1 by viewport width.
   * @returns {number} Number of cards shown per carousel slide
   */
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
   * @returns {number} Maximum stacked cards beside the expanded detail panel
   */
  get stackedCardsCount(): number {
    return this.viewportWidth() <= 1024 ? 2 : 3;
  }

  // Modal state
  showModal: boolean = false;
  selectedCard: MarketFlowCard | null = null;
  showExportModal: boolean = false;
  isInformationDisclosureModalOpen = false;
  selectedCardForExport: MarketFlowCard | null = null;
  selectedCardForDetail: MarketFlowCard | null = null;

  /**
   * For embedded modal markup (VDI): overlay visible when detail shown in non-inline mode.
   * @returns {boolean} Whether the detail overlay should be visible
   */
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

  /**
   * @returns {string} Carousel section title (historical vs forecasted)
   */
  get headerTitle(): string {
    return this.dataType === 'historical'
      ? 'Market Flows'
      : 'Market Flows';
  }

  /**
   * @returns {MarketFlowCard[]} Input cards sorted and with pinned cards moved to the front
   */
  get filteredCards(): MarketFlowCard[] {
    // Cards are already filtered by the dashboard component
    // Apply sorting based on selected sort option
    const cards = this.cards || [];
    return this.sortCards([...cards]);
  }

  /**
   * @param {MarketFlowCard[]} cards - Cards to sort (mutated in place)
   * @returns {MarketFlowCard[]} Same array, sorted by selected option with pinned cards first
   */
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

    const pinned = cards.filter((card) => this.isCardPinned(card.id));
    const unpinned = cards.filter((card) => !this.isCardPinned(card.id));

    return [...pinned, ...unpinned];
  }

  /**
   * @param {string} valueStr - Display value string (e.g. currency-formatted flow)
   * @returns {number} Absolute value in billions for sorting, or 0 when unparseable
   */
  parseValue(valueStr: string): number {
    const b = parseFlowDisplayValueToBillions(valueStr);
    return Number.isFinite(b) ? b : 0;
  }

  /**
   * @param {string} percentageStr - Display percentage (e.g. "+12.3%", "+∞%")
   * @returns {number} Numeric percentage for sorting; ±Infinity when string contains ∞
   */
  parsePercentage(percentageStr: string): number {
    // Parse percentages like "+12.3%", "-12.3%", "+4.6%", "+∞%" (horizon baseline 0)
    if (percentageStr.includes('∞')) {
      const cleaned = percentageStr.replace(/[+%]/g, '').trim();
      return cleaned.startsWith('-') ? -Number.MAX_VALUE : Number.MAX_VALUE;
    }
    const cleaned = percentageStr.replace(/[+%]/g, '').trim();
    const num = parseFloat(cleaned);
    return Number.isNaN(num) ? 0 : num;
  }

  /**
   * @returns {number} Total number of carousel slides for the current filtered card set
   */
  get totalSlides(): number {
    // Calculate number of slides (groups of cardsPerSlide)
    const totalCards = this.filteredCards.length;
    if (totalCards === 0) return 0;
    return Math.ceil(totalCards / this.cardsPerSlide);
  }

  /**
   * @returns {number} One-based current page index
   */
  get currentPage(): number {
    return this.currentSlideIndex + 1;
  }

  /**
   * @returns {number} Total page count (alias of totalSlides)
   */
  get totalPages(): number {
    return this.totalSlides;
  }

  /**
   * @returns {number} Count of cards after sort and pin ordering
   */
  get totalCardsCount(): number {
    return this.filteredCards.length;
  }

  /**
   * @returns {number} One-based index of the first visible card on the current slide
   */
  get viewingRangeStart(): number {
    if (this.totalCardsCount === 0) return 0;
    return this.currentSlideIndex * this.cardsPerSlide + 1;
  }

  /**
   * @returns {number} One-based index of the last visible card on the current slide
   */
  get viewingRangeEnd(): number {
    if (this.totalCardsCount === 0) return 0;
    return Math.min((this.currentSlideIndex + 1) * this.cardsPerSlide, this.totalCardsCount);
  }

  /**
   * @returns {number[]} Page numbers to show in pagination (-1 denotes ellipsis)
   */
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

  /**
   * @returns {MarketFlowCard[]} Cards visible on the current slide
   */
  get visibleCards(): MarketFlowCard[] {
    // Calculate the starting index based on current slide (each slide shows cardsPerSlide cards)
    const startIndex = this.currentSlideIndex * this.cardsPerSlide;
    return this.filteredCards.slice(startIndex, startIndex + this.cardsPerSlide);
  }

  /**
   * @returns {boolean} Whether the "view more" placeholder should appear in the current slide window
   */
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

  /**
   * @param {import("@angular/core").SimpleChanges} changes - Current and previous input property values
   * @returns {void}
   */
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

  /**
   * @param {Event} [event] - Optional click event to stop propagation
   * @returns {void}
   */
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

  /**
   * @param {Event} [event] - Optional click event to stop propagation
   * @returns {void}
   */
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

  /**
   * @param {number} index - Zero-based slide index
   * @returns {void}
   */
  goToSlide(index: number): void {
    if (this.selectedCardForDetail) {
      this.onCloseDetailModal();
    }
    this.currentSlideIndex = index;
  }

  /** @returns {void} */
  onViewAll(): void {
    // Handle view all action
  }

  /** @returns {void} */
  onViewMore(): void {
    // Handle view more action
  }

  /**
   * @param {string} cardId - Id of the card to open in Ask MarketSense
   * @returns {void}
   */
  onAskMarketSense(cardId: string): void {
    // Find the card by ID
    const card = this.cards.find(c => c.id === cardId);
    if (card) {
      this.askMarketsenseCardContext.setActiveFromMarketFlowCard(card);
      this.selectedCard = card;
      this.showModal = true;
    }
  }

  /** @returns {void} */
  onCloseModal(): void {
    this.showModal = false;
    this.selectedCard = null;
    this.askMarketsenseCardContext.clear();
  }

  /**
   * @param {string} message - User message to send to the AI service
   * @returns {void}
   */
  onSendMessage(message: string): void { // eslint-disable-line @typescript-eslint/no-unused-vars -- stub until AI integration
    // Handle sending message to AI
    // Here you would typically send the message to an AI service
  }

  /**
   * @param {string} [cardId] - Card id; when omitted, uses the currently selected detail or Ask card
   * @returns {void}
   */
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

  /** @returns {void} */
  onCloseExportModal(): void {
    this.showExportModal = false;
    this.selectedCardForExport = null;
  }

  /**
   * @param {MouseEvent} event - Click event from the disclosure trigger
   * @returns {void}
   */
  openInformationDisclosureModal(event: MouseEvent): void {
    event.stopPropagation();
    this.isInformationDisclosureModalOpen = true;
  }

  /** @returns {void} */
  closeInformationDisclosureModal(): void {
    this.isInformationDisclosureModalOpen = false;
  }

  /** @returns {void} */
  onExportXLS(): void {
    // Handle XLS export
    // Here you would typically trigger the XLS export
  }

  /** @returns {void} */
  onExportCSV(): void {
    this.marketFlowDetailModal?.exportExpandedCardAsCsv();
  }

  /**
   * @returns {Promise<void>}
   */
  async onExportPDF(): Promise<void> {
    await this.marketFlowDetailModal?.exportExpandedCardAsPdf();
  }

  /**
   * @returns {Promise<void>}
   */
  async onExportPNG(): Promise<void> {
    await this.marketFlowDetailModal?.exportExpandedCardAsPng();
  }

  /**
   * @param {string} cardId - Id of the card whose overflow menu was activated
   * @returns {void}
   */
  onMoreOptions(cardId: string): void { // eslint-disable-line @typescript-eslint/no-unused-vars -- stub until overflow menu wired
    // Handle more options action
  }

  /**
   * @param {string} cardId - Id of the card to pin or unpin
   * @returns {void}
   */
  onPin(cardId: string): void {
    // Emit pin event to parent component
    // The ngOnChanges will handle resetting to first slide when pinnedCardIds changes
    this.pinCard.emit(cardId);
  }

  /**
   * @param {string} cardId - Id of the card to show in the inline detail panel
   * @returns {void}
   */
  onCardClick(cardId: string): void {
    // Find the card by ID and show inline detail (left) + stacked cards (right)
    const card = this.cards.find(c => c.id === cardId);
    if (card) {
      this.selectedCardForDetail = card;
    }
  }

  /** @returns {void} */
  onCloseDetailModal(): void {
    this.selectedCardForDetail = null;
  }

  /**
   * Alias for templates that reference onClose (e.g. embedded modal markup on VDI).
   * @returns {void}
   */
  onClose(): void {
    this.onCloseDetailModal();
  }

  /**
   * Alias for templates that reference card (e.g. selected card for detail view).
   * @returns {MarketFlowCard | null} Currently selected card for inline detail
   */
  get card(): MarketFlowCard | null {
    return this.selectedCardForDetail;
  }

  /**
   * For embedded modal markup (VDI): confidence color for AI score.
   * @param {'high' | 'medium' | 'low'} confidence - Confidence level (reserved for future color mapping)
   * @returns {string} Hex color for the confidence indicator
   */
  getConfidenceColor(confidence: 'high' | 'medium' | 'low'): string {
    return confidence ? '#00bc7d' : '#00bc7d';
  }

  /**
   * For embedded modal markup (VDI): confidence label for AI score.
   * @param {'high' | 'medium' | 'low'} confidence - Confidence level
   * @returns {string} Human-readable label for the confidence level
   */
  getConfidenceLabel(confidence: 'high' | 'medium' | 'low'): string {
    switch (confidence) {
      case 'high': return 'High';
      case 'medium': return 'Medium';
      case 'low': return 'Low';
      default: return 'High';
    }
  }

  /**
   * For embedded modal markup (VDI): projected value from selected card.
   * @returns {string} Formatted flow value for the selected card, or "$0" when none
   */
  getProjectedValue(): string {
    if (!this.card) return '$0';
    return this.card.value;
  }

  /**
   * For embedded modal markup (VDI): time horizon display for selected card.
   * @returns {string} Card time horizon label or default "12 Month"
   */
  getTimeHorizonDisplay(): string {
    if (!this.card) return '12 Month';
    return this.card.timeHorizon || '12 Month';
  }

  /**
   * For embedded modal markup (VDI): chart data for line chart.
   * @returns {number[]} Placeholder series aligned to x-axis label count
   */
  getChartData(): number[] {
    const labels = this.getXAxisLabels();
    const template = [10, 12, 18, 25, 35];
    if (labels.length <= template.length) return template.slice(0, labels.length);
    const last = template[template.length - 1] ?? 35;
    return [...template, ...Array(labels.length - template.length).fill(last)];
  }

  /**
   * For embedded modal markup (VDI): chart line color.
   * @returns {string} Hex color for the chart line
   */
  getChartColor(): string {
    return '#00113F';
  }

  /**
   * For embedded modal markup (VDI): chart width.
   * @returns {number} Responsive chart width in pixels
   */
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

  /**
   * For embedded modal markup (VDI): x-axis labels for chart.
   * @returns {string[]} Month-offset labels from time horizon range or card defaults
   */
  getXAxisLabels(): string[] {
    if (this.timeHorizonRange?.start && this.timeHorizonRange?.end) {
      return this._generateTimeHorizonLabels(this.timeHorizonRange.start, this.timeHorizonRange.end);
    }
    if (!this.card) return ['0', '+3mo', '+6mo', '+9mo', '+12mo'];
    const isHistorical = this.card.dataType === 'historical';
    return isHistorical ? ['-12mo', '-9mo', '-6mo', '-3mo', '0'] : ['0', '+3mo', '+6mo', '+9mo', '+12mo'];
  }

  /**
   * @param {string} start - Range start label (e.g. "-9mo", "0")
   * @param {string} end - Range end label (e.g. "0", "+12mo")
   * @returns {string[]} Evenly spaced month-offset labels between start and end
   */
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
      let label: string;
      if (mo === 0) {
        label = '0';
      } else if (mo > 0) {
        label = `+${mo}mo`;
      } else {
        label = `${mo}mo`;
      }
      labels.push(label);
    }
    return labels.length ? labels : ['0', '+3mo', '+6mo', '+9mo', '+12mo'];
  }

  /**
   * For embedded modal markup (VDI): chart y-axis min.
   * @returns {number | undefined} Scaled minimum y value, or undefined when chart data is empty
   */
  getYAxisMin(): number | undefined {
    const data = this.getChartData();
    if (data.length === 0) return undefined;
    const min = Math.min(...data);
    const max = Math.max(...data);
    return max <= 0 ? min * 1.1 : min * 0.9;
  }

  /**
   * For embedded modal markup (VDI): chart y-axis max.
   * @returns {number | undefined} Scaled maximum y value, or undefined when chart data is empty
   */
  getYAxisMax(): number | undefined {
    const data = this.getChartData();
    if (data.length === 0) return undefined;
    const min = Math.min(...data);
    const max = Math.max(...data);
    return min < 0 && max <= 0 ? max * 0.9 : max * 1.1;
  }

  /**
   * Cards to show in the right column when a card is selected (all except the selected one).
   * @returns {MarketFlowCard[]} Filtered cards excluding the expanded detail card
   */
  get stackedCards(): MarketFlowCard[] {
    const selected = this.selectedCardForDetail;
    if (!selected) return [];
    return this.filteredCards.filter(c => c.id !== selected.id);
  }

  /**
   * @param {string} cardId - Card id to check against pinnedCardIds
   * @returns {boolean} Whether the card is pinned
   */
  isCardPinned(cardId: string): boolean {
    return this.pinnedCardIds.includes(cardId);
  }

  /**
   * @param {Event} [event] - Optional click event to stop propagation
   * @returns {void}
   */
  toggleSortDropdown(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.sortDropdownOpen = !this.sortDropdownOpen;
  }

  /** @returns {void} */
  closeSortDropdown(): void {
    this.sortDropdownOpen = false;
  }

  /**
   * @param {string} optionValue - Sort option value (e.g. value-high, change-low)
   * @param {Event} [event] - Optional click event to stop propagation
   * @returns {void}
   */
  selectSortOption(optionValue: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.selectedSortOption = optionValue;
    this.sortDropdownOpen = false;
    // Reset to first slide when sort changes
    this.currentSlideIndex = 0;
  }

  /**
   * @param {MarketFlowCardLevel} level - Product sub-type or product aggregation level
   * @param {Event} [event] - Optional click event to stop propagation
   * @returns {void}
   */
  selectCardLevel(level: MarketFlowCardLevel, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (this.selectedCardLevel === level) return;
    this.selectedCardLevel = level;
    this.selectedCardForDetail = null;
    this.currentSlideIndex = 0;
    this.cardLevelChange.emit(level);
  }

  /**
   * @returns {string} Human-readable label for the active sort option
   */
  get selectedSortDisplayLabel(): string {
    const option = this.sortOptions.find(opt => opt.value === this.selectedSortOption);
    return option?.displayLabel || 'Value: High to Low';
  }

  /**
   * @param {Event} event - Document click used to close sort dropdown when clicking outside
   * @returns {void}
   */
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
