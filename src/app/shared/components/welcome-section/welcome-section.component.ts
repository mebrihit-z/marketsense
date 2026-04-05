/* eslint-disable */
import { Component, Input, HostListener, ElementRef, ViewChild, AfterViewInit, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { distinctUntilChanged, filter, map, take } from 'rxjs/operators';
import AskMarketsenseModalComponent from '../ask-marketsense-modal/ask-marketsense-modal.component';
import TitleComponent from '../title/title.component';
import UserProfileService from '../../services/user-profile.service';
import { SavedViewsService, type SavedView } from '../../../core/services/saved-views.service';

export interface ViewingOption {
  name: string;
  savedDate: string;
  tags: string[];
  isActive: boolean;
  /** Marks which saved view should be treated as default. */
  isDefault?: boolean;
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
export default class WelcomeSectionComponent implements AfterViewInit, OnInit, OnDestroy {
  @Input() userName: string = '';
  @Input() lastLogin: string = '';
  /** Snapshot of the previously saved login time to show before we write today's value. */
  private previousLastLoginForDisplay?: string;

  @Input() viewingFilter: string = 'High-confidence Equities';
  @Input() isViewingDropdownOpen: boolean = false;

  /** Display name: from UserProfileService.getGivenName() or fallback to userName input. */
  get displayName(): string {
    return this.userProfileService.getGivenName() ?? this.userName;
  }

  /**
   * Raw last-login value from preference / profile (often ISO). Used for persistence, not UI.
   */
  private get rawLastLoginValue(): string {
    if (this.previousLastLoginForDisplay) {
      return this.previousLastLoginForDisplay;
    }
    const fallbackLastLogin = this.lastLogin || this.getTodayDateLabel();
    return this.userProfileService.getLastLogin() ?? fallbackLastLogin;
  }

  /** Last login line in the welcome header — human-readable, same intent as filters-bar timestamp. */
  get displayLastLogin(): string {
    return this.formatLastLoginForDisplay(this.rawLastLoginValue);
  }

  get savedViewsCount(): number {
    return this.viewingOptions?.length ?? 0;
  }

  @ViewChild('filterButton', { static: false }) filterButton!: ElementRef<HTMLButtonElement>;
  
  dropdownPosition = { top: 0, left: 0 };
  showAskMarketSenseModal: boolean = false;

  /** Set when user clicks delete; confirmed in {@link confirmDeleteSavedView}. */
  pendingDeleteOption: ViewingOption | null = null;

  constructor(
    private readonly userProfileService: UserProfileService,
    private readonly savedViewsService: SavedViewsService
  ) {}

  viewingOptions: ViewingOption[] = [];

  private resolvedUserId(): string | undefined {
    const fromService = this.userProfileService.getUserId();
    if (fromService != null && String(fromService).trim() !== '') {
      return String(fromService).trim();
    }
    const fromProfile = this.userProfileService.getuser()?.sub;
    if (fromProfile != null && String(fromProfile).trim() !== '') {
      return String(fromProfile).trim();
    }
    return undefined;
  }

  ngOnInit(): void {
    if (this.savedViewsService.isSavedViewsBackendEnabled()) {
      // VDI: defer until OAuth `sub` is available, otherwise userId is undefined and the dropdown shows 0.
      this.userReadySub = this.userProfileService.user$
        .pipe(
          map((user) => this.resolvedUserId() ?? user?.sub ?? null),
          map((id) => (id != null && String(id).trim() !== '' ? String(id).trim() : null)),
          filter((id): id is string => id !== null && id !== 'anonymous'),
          distinctUntilChanged(),
          take(1)
        )
        .subscribe(() => {
          this.hydrateProfileFromPreference();
          this.loadSavedViews();
        });
    } else {
      this.hydrateProfileFromPreference();
      this.loadSavedViews();
    }
  }

  ngAfterViewInit(): void {
    if (this.filterButton?.nativeElement) {
      this.updateDropdownPosition();
    }
  }

  private userReadySub?: Subscription;

  ngOnDestroy(): void {
    this.userReadySub?.unsubscribe();
  }

  /** Row key aligned with {@link SavedViewsService.sameSavedViewIdentity} style (id preferred). */
  private savedViewRowKey(item: SavedView, index: number): string {
    if (item?.id != null && String(item.id).trim() !== '') {
      return String(item.id);
    }
    const name = item?.name?.trim();
    if (name) return name;
    return `__idx_${index}`;
  }

  private activeOptionKey(option: ViewingOption | undefined): string | null {
    if (!option) return null;
    const raw = option.raw as SavedView | undefined;
    if (raw?.id != null && String(raw.id).trim() !== '') {
      return String(raw.id);
    }
    const name = option.name?.trim();
    return name || null;
  }

  /**
   * Stable row identity (id as string, else name). Lists re-create option objects after default/refresh,
   * so `===` on ViewingOption is unsafe — use this for Active/apply/delete instead.
   */
  private viewingOptionMatches(a: ViewingOption, b: ViewingOption): boolean {
    const rawA = a.raw as SavedView | undefined;
    const rawB = b.raw as SavedView | undefined;
    if (rawA?.id != null && rawB?.id != null && String(rawA.id) === String(rawB.id)) {
      return true;
    }
    const nameA = a.name?.trim();
    const nameB = b.name?.trim();
    return !!nameA && nameA === nameB;
  }

  /**
   * Load saved views via SavedViewsService (localStorage in dev, backend on VDI).
   * If nothing has been saved yet, the list stays empty.
   */
  private loadSavedViews(): void {
    const currentUserId = this.resolvedUserId();
    this.savedViewsService.getSavedViewsForUser(currentUserId).subscribe({
      next: (views: SavedView[]) => {
        if (!Array.isArray(views) || views.length === 0) {
          this.viewingOptions = [];
          return;
        }

        if (views.length === 0) {
          this.viewingOptions = [];
          return;
        }

        const prevActiveKey = this.activeOptionKey(this.viewingOptions.find((o) => o.isActive));
        const defaultView = views.find((v) => v?.isDefault === true) ?? null;
        const fallbackView = defaultView ?? views[0];
        const fallbackIndex = fallbackView ? views.indexOf(fallbackView) : 0;
        const fallbackKey = fallbackView ? this.savedViewRowKey(fallbackView, fallbackIndex >= 0 ? fallbackIndex : 0) : null;

        const previousStillHere =
          prevActiveKey != null && views.some((v, i) => this.savedViewRowKey(v, i) === prevActiveKey);

        // Default preset ≠ Active: keep the card that already has filters applied, unless it disappeared.
        const activeKey = previousStillHere ? prevActiveKey : fallbackKey;

        const mapped = views.map((item, index) => {
          const name = item?.name ?? `View ${index + 1}`;
          const savedDate = this.formatSavedDate(item?.savedAt);
          const tags = this.deriveTagsFromState(item?.state);
          const key = this.savedViewRowKey(item, index);
          return {
            name,
            savedDate,
            tags,
            isDefault: item?.isDefault === true,
            isActive: activeKey != null ? key === activeKey : index === 0,
            raw: item,
          };
        });

        this.viewingOptions = this.orderViewingOptionsForDropdown(mapped);

        if (this.viewingOptions.length > 0) {
          this.viewingFilter = this.viewingOptions.find((o) => o.isActive)?.name ?? this.viewingOptions[0].name;
        }

      },
      error: (e) => {
        console.error('Failed to load saved views', e);
        this.viewingOptions = this.getDefaultViewingOptions();
      },
    });
  }

  /**
   * Restore profile metadata from user preference storage when available.
   */
  private hydrateProfileFromPreference(): void {
    const currentUserId = this.resolvedUserId();
    this.savedViewsService.getUserPreference(currentUserId).subscribe({
      next: (pref) => {
        if (pref?.userName && !this.userProfileService.getGivenName()) {
          this.userProfileService.setGivenName(pref.userName);
        }
        if (pref?.role && !this.userProfileService.getRoleName()) {
          this.userProfileService.setRoleName(pref.role);
        }
        if (pref?.lastLogin) {
          this.previousLastLoginForDisplay = pref.lastLogin;
        }

        // After showing the previous value in UI, record today's login for next visit.
        this.syncProfileToUserPreference(this.getTodayIsoTimestamp());
      },
      error: (e) => {
        console.error('Failed to load user preference metadata', e);
      },
    });
  }

  /**
   * Persist profile metadata from Welcome section into user preference storage.
   * This keeps `lastLogin` in sync even when profile fields are initialized here.
   */
  private syncProfileToUserPreference(lastLoginOverride?: string): void {
    const currentUserId = this.resolvedUserId();
    const userName = this.displayName;
    const role = this.userProfileService.getRoleName();
    const lastLogin = lastLoginOverride ?? this.rawLastLoginValue;

    this.savedViewsService
      .syncUserPreference({
        userId: currentUserId,
        userName,
        role,
        lastLogin,
      })
      .subscribe();
  }

  private getTodayIsoTimestamp(): string {
    return new Date().toISOString();
  }

  private getTodayDateLabel(): string {
    return new Date().toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  /**
   * Show ISO / backend timestamps as a local date + time; leave already-friendly strings unchanged.
   */
  private formatLastLoginForDisplay(value: string): string {
    const s = value?.trim() ?? '';
    if (!s) {
      return this.getTodayDateLabel();
    }
    const parsed = Date.parse(s);
    if (Number.isNaN(parsed)) {
      return s;
    }
    const d = new Date(parsed);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  /**
   * Dropdown order: default saved view first, then the active view (if not the same), then the rest in stable order.
   */
  private orderViewingOptionsForDropdown(options: ViewingOption[]): ViewingOption[] {
    if (options.length <= 1) {
      return [...options];
    }

    const optionKey = (o: ViewingOption) => o.raw?.id ?? o.name;
    const defaultOpt = options.find((o) => o.isDefault) ?? null;
    const activeOpt = options.find((o) => o.isActive) ?? null;

    const result: ViewingOption[] = [];
    const seen = new Set<string>();

    const pushUnique = (o: ViewingOption | null) => {
      if (!o) return;
      const k = optionKey(o);
      if (seen.has(k)) return;
      seen.add(k);
      result.push(o);
    };

    pushUnique(defaultOpt);
    pushUnique(activeOpt);
    for (const o of options) {
      pushUnique(o);
    }

    return result;
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
      // Show only the primary product region as a tag
      tags.push(state.productRegion[0]);
    }
    if (Array.isArray(state.investorRegion) && state.investorRegion.length > 0) {
      // Show only the primary investor region as a tag
      tags.push(state.investorRegion[0]);
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
   * Stable id for the default checkbox + label (avoids wrapping label quirks with row clicks).
   */
  defaultCheckboxId(option: ViewingOption): string {
    const key = (option as any).raw?.id ?? option.name ?? 'view';
    return `welcome-sv-default-${String(key).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  defaultCheckboxLabelId(option: ViewingOption): string {
    return `${this.defaultCheckboxId(option)}-label`;
  }

  /**
   * @param {ViewingOption} option - Selected viewing option
   */
  selectViewingOption(option: ViewingOption): void {
    const resolved = this.viewingOptions.find((o) => this.viewingOptionMatches(o, option)) ?? option;

    this.viewingFilter = resolved.name;
    this.viewingOptions = this.orderViewingOptionsForDropdown(
      this.viewingOptions.map((o) => ({
        ...o,
        isActive: this.viewingOptionMatches(o, resolved),
      }))
    );
    this.isViewingDropdownOpen = false;

    // Notify the rest of the app (e.g., filters bar) to apply this saved view's filters.
    if (typeof window !== 'undefined') {
      try {
        const detail = resolved.raw ?? null;
        window.dispatchEvent(new CustomEvent('marketsenseApplySavedView', { detail }));
      } catch {
        // Swallow if CustomEvent is not available
      }
    }
  }

  /**
   * Toggle whether this saved view should be the default.
   * Stored via `SavedViewsService.setDefaultView()`.
   */
  toggleDefaultForOption(option: ViewingOption, event: Event): void {
    event.stopPropagation();

    const input = event.target as HTMLInputElement | null;
    const nextIsDefault = !!input?.checked;

    const raw = (option as any).raw as SavedView | undefined;
    if (!raw) return;

    const currentUserId = this.userProfileService.getUserId();
    this.savedViewsService
      .setDefaultView(raw, nextIsDefault, currentUserId, this.displayName)
      .subscribe({
      next: () => {
        // Checkbox only changes which preset is default for next visit; Active / filters stay as-is.
        this.viewingOptions = this.orderViewingOptionsForDropdown(
          this.viewingOptions.map((o) => ({
            ...o,
            isDefault: nextIsDefault
              ? this.viewingOptionMatches(o, option)
              : this.viewingOptionMatches(o, option)
                ? false
                : !!o.isDefault,
          }))
        );

        if (typeof window !== 'undefined') {
          try {
            window.dispatchEvent(new CustomEvent('marketsenseSavedViewsUpdated'));
          } catch {
            // Ignore if CustomEvent is not supported
          }
        }
      },
      error: (e) => {
        console.error('Failed to update default saved view', e);
      }
    });
  }

  /**
   * @param {ViewingOption} option - Option to remove
   * @param {Event} event - DOM event (used to stop propagation)
   */
  deleteOption(option: ViewingOption, event: Event): void {
    event.stopPropagation();
    const resolved = this.viewingOptions.find((o) => this.viewingOptionMatches(o, option)) ?? option;
    this.pendingDeleteOption = resolved;
  }

  cancelDeleteSavedView(): void {
    this.pendingDeleteOption = null;
  }

  confirmDeleteSavedView(): void {
    const option = this.pendingDeleteOption;
    if (!option) return;
    this.pendingDeleteOption = null;
    this.performDeleteSavedView(option);
  }

  private performDeleteSavedView(option: ViewingOption): void {
    const index = this.viewingOptions.findIndex((opt) => this.viewingOptionMatches(opt, option));
    if (index === -1) return;
    const wasActive = option.isActive;
    const hadMultiple = this.viewingOptions.length > 1;
    let next = this.viewingOptions.filter((_, i) => i !== index);
    if (next.length === 0) {
      this.viewingFilter = 'No presets';
      this.viewingOptions = next;
    } else if (wasActive && hadMultiple) {
      this.viewingFilter = next[0].name;
      next = next.map((o, i) => ({
        ...o,
        isActive: i === 0,
      }));
      this.viewingOptions = this.orderViewingOptionsForDropdown(next);
    } else {
      this.viewingOptions = this.orderViewingOptionsForDropdown(next);
    }

    const rawId = (option as any).raw?.id as string | undefined;
    const currentUserId = this.userProfileService.getUserId();

    this.savedViewsService
      .deleteView({ id: rawId, name: option.name }, currentUserId)
      .subscribe({
        next: () => {
          if (typeof window !== 'undefined') {
            try {
              window.dispatchEvent(new CustomEvent('marketsenseSavedViewsUpdated'));
            } catch {
              // Ignore if CustomEvent is not supported
            }
          }
        },
        error: (e) => {
          console.error('Failed to delete saved view', e);
        },
      });
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

