import { Component, Input, HostListener, ElementRef, ViewChild, AfterViewInit, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import AskMarketsenseModalComponent from '../ask-marketsense-modal/ask-marketsense-modal.component';
import TitleComponent from '../title/title.component';
import UserProfileService from '../../services/user-profile.service';

export interface ViewingOption {
  name: string;
  savedDate: string;
  tags: string[];
  isActive: boolean;
  /** Optional backing payload from localStorage (full saved view). */
  raw?: any;
}

@Component({
  selector: 'app-welcome-section',
  standalone: true,
  imports: [CommonModule, AskMarketsenseModalComponent, TitleComponent],
  templateUrl: './welcome-section.component.html',
  styleUrls: ['./welcome-section.component.scss']
})
export default class WelcomeSectionComponent implements AfterViewInit, OnInit {
  @Input() userName: string = 'Mick';
  @Input() lastLogin: string = 'Today, 9:42 AM';
  @Input() viewingFilter: string = 'High-confidence Equities';
  @Input() isViewingDropdownOpen: boolean = false;

  /** Display name: from UserProfileService.getGivenName() or fallback to userName input. */
  get displayName(): string {
    return this.userProfileService.getGivenName() ?? this.userName;
  }

  /** Last login: from UserProfileService or fallback to lastLogin input. */
  get displayLastLogin(): string {
    return this.userProfileService.getLastLogin() ?? this.lastLogin;
  }

  get savedViewsCount(): number {
    return this.viewingOptions?.length ?? 0;
  }

  @ViewChild('filterButton', { static: false }) filterButton!: ElementRef<HTMLButtonElement>;
  
  dropdownPosition = { top: 0, left: 0 };
  showAskMarketSenseModal: boolean = false;

  /** Local storage key used by filters bar to persist views. */
  private readonly SAVED_VIEWS_STORAGE_KEY = 'marketsense.savedViews';

  constructor(private readonly userProfileService: UserProfileService) {}

  viewingOptions: ViewingOption[] = [];

  ngOnInit(): void {
    this.loadSavedViews();
  }

  ngAfterViewInit(): void {
    if (this.filterButton?.nativeElement) {
      this.updateDropdownPosition();
    }
  }

  /**
   * Load saved views from localStorage (populated by filters bar "Save View").
   * Falls back to the original static presets if nothing has been saved yet.
   */
  private loadSavedViews(): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      this.viewingOptions = this.getDefaultViewingOptions();
      return;
    }

    try {
      const raw = localStorage.getItem(this.SAVED_VIEWS_STORAGE_KEY);
      if (!raw) {
        this.viewingOptions = this.getDefaultViewingOptions();
        return;
      }

      const parsed: any[] = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        this.viewingOptions = this.getDefaultViewingOptions();
        return;
      }

      this.viewingOptions = parsed.map((item, index) => {
        const name = item?.name ?? `View ${index + 1}`;
        const savedDate = this.formatSavedDate(item?.savedAt);
        const tags = this.deriveTagsFromState(item?.state);
        return {
          name,
          savedDate,
          tags,
          isActive: index === 0,
          raw: item,
        };
      });

      if (this.viewingOptions.length > 0) {
        this.viewingFilter = this.viewingOptions[0].name;
      }
    } catch (e) {
      console.error('Failed to load saved views from localStorage', e);
      this.viewingOptions = this.getDefaultViewingOptions();
    }
  }

  /**
   * Convert ISO timestamp into a simple human-readable "saved" label.
   */
  private formatSavedDate(savedAt?: string): string {
    if (!savedAt) {
      return 'recently';
    }
    const saved = new Date(savedAt);
    if (Number.isNaN(saved.getTime())) {
      return 'recently';
    }
    const now = new Date();
    const diffMs = now.getTime() - saved.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks === 1) return '1 week ago';
    return `${diffWeeks} weeks ago`;
  }

  /**
   * Derive simple tags from a saved filter state to surface in the UI.
   */
  private deriveTagsFromState(state: any): string[] {
    if (!state || typeof state !== 'object') return [];
    const tags: string[] = [];
    if (Array.isArray(state.productType) && state.productType.length > 0) {
      tags.push(...state.productType.slice(0, 2));
    }
    if (Array.isArray(state.productRegion) && state.productRegion.length > 0) {
      tags.push(state.productRegion.join(', '));
    }
    if (Array.isArray(state.investorRegion) && state.investorRegion.length > 0) {
      tags.push(state.investorRegion.join(', '));
    }
    return tags.slice(0, 3);
  }

  /**
   * Original static presets used as a fallback when no local saved views exist.
   */
  private getDefaultViewingOptions(): ViewingOption[] {
    return [
      {
        name: 'High-confidence Equities',
        savedDate: '2 days ago',
        tags: ['Equity', 'North America, Europe'],
        isActive: true,
      },
      {
        name: 'Global Alternatives View',
        savedDate: '5 days ago',
        tags: ['Alternatives, Private Equity'],
        isActive: false,
      },
      {
        name: 'All Equities',
        savedDate: '1 week ago',
        tags: ['Equity'],
        isActive: false,
      },
    ];
  }

  toggleViewingDropdown(): void {
    this.isViewingDropdownOpen = !this.isViewingDropdownOpen;
    if (this.isViewingDropdownOpen && this.filterButton) {
      setTimeout(() => {
        this.updateDropdownPosition();
      }, 0);
    }
  }

  /** Min width of the dropdown (must match .viewing-dropdown min-width in SCSS). */
  private readonly dropdownMinWidth = 318;
  private readonly viewportPadding = 32;

  updateDropdownPosition(): void {
    if (this.filterButton?.nativeElement) {
      const rect = this.filterButton.nativeElement.getBoundingClientRect();
      const maxLeft = window.innerWidth - this.dropdownMinWidth - this.viewportPadding;
      const left = Math.max(this.viewportPadding, Math.min(rect.left, maxLeft));
      this.dropdownPosition = {
        top: rect.bottom + 8,
        left
      };
    }
  }

  @HostListener('window:scroll')
  onScroll(): void {
    if (this.isViewingDropdownOpen) {
      this.updateDropdownPosition();
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    if (this.isViewingDropdownOpen) {
      this.updateDropdownPosition();
    }
  }

  /**
   * @param {ViewingOption} option - Selected viewing option
   */
  selectViewingOption(option: ViewingOption): void {
    this.viewingFilter = option.name;
    this.viewingOptions = this.viewingOptions.map(o => ({
      ...o,
      isActive: o === option
    }));
    this.isViewingDropdownOpen = false;

    // Notify the rest of the app (e.g., filters bar) to apply this saved view's filters.
    if (typeof window !== 'undefined') {
      try {
        const detail = (option as any).raw ?? null;
        window.dispatchEvent(new CustomEvent('marketsenseApplySavedView', { detail }));
      } catch {
        // Swallow if CustomEvent is not available
      }
    }
  }

  /**
   * @param {ViewingOption} option - Option to remove
   * @param {Event} event - DOM event (used to stop propagation)
   */
  deleteOption(option: ViewingOption, event: Event): void {
    event.stopPropagation();
    const index = this.viewingOptions.findIndex(opt => opt === option);
    if (index === -1) return;
    const wasActive = option.isActive;
    const hadMultiple = this.viewingOptions.length > 1;
    this.viewingOptions = this.viewingOptions.filter((_, i) => i !== index);
    if (this.viewingOptions.length === 0) {
      this.viewingFilter = 'No presets';
    } else if (wasActive && hadMultiple) {
      this.viewingFilter = this.viewingOptions[0].name;
      this.viewingOptions = this.viewingOptions.map((o, i) => ({
        ...o,
        isActive: i === 0
      }));
    }

    // Also remove this view from localStorage so it no longer appears
    // in future sessions or other parts of the app.
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(this.SAVED_VIEWS_STORAGE_KEY);
        if (raw) {
          const existing: any[] = JSON.parse(raw);
          const rawId = (option as any).raw?.id;
          const updated = Array.isArray(existing)
            ? existing.filter((item) => {
                if (rawId != null) {
                  return item?.id !== rawId;
                }
                // Fallback match by name if id is missing
                return item?.name !== option.name;
              })
            : [];
          localStorage.setItem(this.SAVED_VIEWS_STORAGE_KEY, JSON.stringify(updated));

          // Let listeners (e.g., other components) know saved views changed.
          try {
            window.dispatchEvent(new CustomEvent('marketsenseSavedViewsUpdated'));
          } catch {
            // Ignore if CustomEvent is not supported
          }
        }
      } catch (e) {
        console.error('Failed to delete saved view from localStorage', e);
      }
    }
  }

  onSaveCurrent(): void {
    if (this.viewingFilter) {
      // Placeholder: save current filter configuration (inject a service and persist this.viewingFilter)
    }
  }

  onAskMarketSense(): void {
    this.showAskMarketSenseModal = true;
  }

  onCloseModal(): void {
    this.showAskMarketSenseModal = false;
  }

  /**
   * @param {string} message - Message to send
   */
  onSendMessage(message: string): void {
    if (this.showAskMarketSenseModal && message) {
      // Placeholder: send message to AI service
    }
  }

  /**
   * @param {Event} event - Document click event
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.isViewingDropdownOpen) {
      const target = event.target as HTMLElement;
      const filterContainer = target.closest('.viewing-filter-container');
      if (!filterContainer) {
        this.isViewingDropdownOpen = false;
      }
    }
  }

  /**
   * Refresh saved views list when another part of the app (e.g., filters bar)
   * notifies that saved views have been updated.
   */
  @HostListener('window:marketsenseSavedViewsUpdated')
  onSavedViewsUpdated(): void {
    this.loadSavedViews();
  }

}

