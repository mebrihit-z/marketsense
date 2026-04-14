/* eslint-disable */
import { Component, Input, HostListener, ElementRef, ViewChild, AfterViewInit, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { distinctUntilChanged, filter, map, take } from 'rxjs/operators';
import AskMarketsenseModalComponent from '../ask-marketsense-modal/ask-marketsense-modal.component';
import TitleComponent from '../title/title.component';
import UserProfileService from '../../services/user-profile.service';
import {
  SavedViewsService,
  type SavedView,
  type SavedViewState,
  type SavedChartHierarchyDimensions,
} from '../../../core/services/saved-views.service';
import {
  MIN_FLOW_VALUE_OPTIONS,
  displayMinFlowEndLabel,
  displayMinFlowStartLabel,
} from '../../utils/min-flow-value-options.util';

/** One block in the saved-view hover tooltip: bold label line, value line below. */
export interface SavedViewTagTooltipField {
  label: string;
  value: string;
}

export interface ViewingOption {
  name: string;
  savedDate: string;
  tags: string[];
  /** Same length as `tags`: tooltip fields per chip (label above value). */
  tagTooltipFields?: SavedViewTagTooltipField[][];
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
    this.hydrateProfileFromPreference();
    this.loadSavedViews();
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
          this.isViewingDropdownOpen = false;
          return;
        }

        const defaultView = views.find((v) => v?.isDefault === true) ?? null;
        const defaultIndex = defaultView ? views.indexOf(defaultView) : -1;
        const defaultRowKey =
          defaultView != null && defaultIndex >= 0
            ? this.savedViewRowKey(defaultView, defaultIndex)
            : null;

        const prevActiveKey = this.activeOptionKey(this.viewingOptions.find((o) => o.isActive));
        const previousStillHere =
          prevActiveKey != null &&
          views.some((v, i) => this.savedViewRowKey(v, i) === prevActiveKey);

        // If the user already marked a preset Active and it is still present, keep it. Otherwise tag the
        // default preset — that matches what the filters bar applies on load (see applyDefaultSavedViewIfPresent).
        const activeKey = previousStillHere ? prevActiveKey : defaultRowKey;

        const mapped = views.map((item, index) => {
          const name = item?.name ?? `View ${index + 1}`;
          const savedDate = this.formatSavedDate(item?.savedAt);
          const { tags, tagTooltipFields } = this.buildSavedViewTagsAndTooltips(item);
          const key = this.savedViewRowKey(item, index);
          return {
            name,
            savedDate,
            tags,
            tagTooltipFields,
            isDefault: item?.isDefault === true,
            isActive: activeKey != null && key === activeKey,
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
   * Calendar date when the view was saved (from ISO {@link SavedView.savedAt}).
   */
  private formatSavedDate(savedAt?: string): string {
    if (!savedAt?.trim()) {
      return '—';
    }
    const saved = new Date(savedAt);
    if (Number.isNaN(saved.getTime())) {
      return '—';
    }
    return saved.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  /**
   * Saved Views dropdown chips plus hover tooltips (filters, time horizon).
   */
  private buildSavedViewTagsAndTooltips(
    view: SavedView | null | undefined
  ): { tags: string[]; tagTooltipFields: SavedViewTagTooltipField[][] } {
    const tags: string[] = [];
    const tagTooltipFields: SavedViewTagTooltipField[][] = [];

    const state: unknown = view?.state;
    let raw: unknown = state;
    if (typeof state === 'string') {
      const t = state.trim();
      if (t) {
        try {
          raw = JSON.parse(t);
        } catch {
          raw = null;
        }
      } else {
        raw = null;
      }
    }

    if (raw && typeof raw === 'object') {
      const coerced = this.coerceSavedViewStateForTags(raw as SavedViewState);
      const investorTag = this.formatSavedViewInvestorTag(coerced);
      if (investorTag) {
        tags.push(investorTag);
        tagTooltipFields.push(this.buildInvestorTooltipFields(coerced));
      }
      const productTag = this.formatSavedViewProductTag(coerced);
      if (productTag) {
        tags.push(productTag);
        tagTooltipFields.push(this.buildProductTooltipFields(coerced));
      }
    }

    const timeTag = this.formatSavedViewTimeHorizonTag(view);
    if (timeTag && view) {
      tags.push(timeTag);
      tagTooltipFields.push(this.buildTimeHorizonTooltipFields(view));
    }

    const minFlowTag = this.formatSavedViewMinFlowTag(view);
    if (minFlowTag && view) {
      tags.push(minFlowTag);
      tagTooltipFields.push(this.buildMinFlowTooltipFields(view));
    }

    const chartDims = view?.chartDimensions;
    if (chartDims && typeof chartDims === 'object') {
      if (chartDims.assetFlows) {
        tags.push(this.formatChartHierarchyChip('Asset Flows', chartDims.assetFlows));
        tagTooltipFields.push(this.buildChartDimensionsTooltipFields(chartDims.assetFlows));
      }
      if (chartDims.assetAllocation) {
        tags.push(this.formatChartHierarchyChip('Asset Allocation', chartDims.assetAllocation));
        tagTooltipFields.push(this.buildChartDimensionsTooltipFields(chartDims.assetAllocation));
      }
    }

    return { tags, tagTooltipFields };
  }

  /** Display labels aligned with flow-dimension ids in Asset Flows / Asset Allocation. */
  private readonly dimensionIdLabels: Record<string, string> = {
    'investor-region': 'Investor Region',
    'product-region': 'Product Region',
    'investor-type': 'Investor Type',
    'product-type': 'Product Type',
    'product-sub-types': 'Product Sub-Types',
    none: 'None',
  };

  private dimensionIdToLabel(id: string | undefined): string {
    if (id == null || String(id).trim() === '') return '—';
    const key = String(id).trim();
    return this.dimensionIdLabels[key] ?? key;
  }

  private formatChartHierarchyChip(
    prefix: string,
    dims: SavedChartHierarchyDimensions
  ): string {
    const a = this.dimensionIdToLabel(dims.dimension1);
    const b = this.dimensionIdToLabel(dims.dimension2);
    const c = this.dimensionIdToLabel(dims.dimension3);
    return `${prefix} - ${a} / ${b} / ${c}`;
  }

  private buildChartDimensionsTooltipFields(
    dims: SavedChartHierarchyDimensions
  ): SavedViewTagTooltipField[] {
    return [
      { label: 'Dimension 1:', value: this.dimensionIdToLabel(dims.dimension1) },
      { label: 'Dimension 2:', value: this.dimensionIdToLabel(dims.dimension2) },
      { label: 'Dimension 3:', value: this.dimensionIdToLabel(dims.dimension3) },
    ];
  }

  /**
   * Normalize saved `state` from API/localStorage: camelCase + snake_case, plural keys,
   * arrays, or comma-/semicolon-separated strings (so multi-select counts are not lost).
   */
  private coerceSavedViewStateForTags(state: SavedViewState): SavedViewState {
    const s = state as unknown as Record<string, unknown>;

    const expandToStringList = (value: unknown): string[] => {
      if (value == null) return [];
      if (Array.isArray(value)) {
        const out: string[] = [];
        for (const x of value) {
          out.push(...expandToStringList(x));
        }
        return out.map((t) => t.trim()).filter(Boolean);
      }
      const str = String(value).trim();
      if (!str) return [];
      if (str.includes(',') || str.includes(';')) {
        return str
          .split(/[,;]/)
          .map((p) => p.trim())
          .filter(Boolean);
      }
      return [str];
    };

    const isPresent = (v: unknown): boolean => {
      if (v == null) return false;
      if (typeof v === 'string') return v.trim().length > 0;
      if (Array.isArray(v)) return v.length > 0;
      return true;
    };

    const firstDefined = (...keys: string[]): unknown => {
      for (const k of keys) {
        const v = s[k];
        if (isPresent(v)) return v;
      }
      return undefined;
    };

    const toStrings = (...keys: string[]): string[] => expandToStringList(firstDefined(...keys));

    return {
      investorRegion: toStrings('investorRegion', 'investor_region', 'investorRegions', 'investor_regions'),
      investorType: toStrings('investorType', 'investor_type', 'investorTypes', 'investor_types'),
      productRegion: toStrings('productRegion', 'product_region', 'productRegions', 'product_regions'),
      productType: toStrings('productType', 'product_type', 'productTypes', 'product_types'),
      productSubType: toStrings(
        'productSubType',
        'product_sub_type',
        'productSubTypes',
        'product_sub_types'
      ),
    };
  }

  /**
   * First selected label only when it is the sole value; otherwise same label plus (+n)
   * where n is how many additional values are not listed.
   */
  private formatSavedViewSegmentLabel(label: string, totalSelected: number): string {
    if (!label) return '';
    const notShown = totalSelected - 1;
    if (notShown <= 0) return label;
    return `${label} (+${notShown})`;
  }

  private formatSavedViewInvestorTag(state: SavedViewState): string | null {
    const regions = state.investorRegion;
    const types = state.investorType;
    const region = regions?.[0];
    const type = types?.[0];
    if (!region && !type) return null;
    const rCount = regions?.length ?? 0;
    const tCount = types?.length ?? 0;
    const rSeg = region ? this.formatSavedViewSegmentLabel(region, rCount) : '';
    const tSeg = type ? this.formatSavedViewSegmentLabel(type, tCount) : '';
    if (region && type) return `Investor - ${rSeg} / ${tSeg}`;
    if (region) return `Investor - ${rSeg}`;
    return `Investor - ${tSeg}`;
  }

  private formatSavedViewProductTag(state: SavedViewState): string | null {
    const regions = state.productRegion;
    const ptypes = state.productType;
    const region = regions?.[0];
    const ptype = ptypes?.[0];
    if (!region && !ptype) return null;
    const rCount = regions?.length ?? 0;
    const tCount = ptypes?.length ?? 0;
    const rSeg = region ? this.formatSavedViewSegmentLabel(region, rCount) : '';
    const tSeg = ptype ? this.formatSavedViewSegmentLabel(ptype, tCount) : '';
    if (region && ptype) return `Product - ${rSeg} / ${tSeg}`;
    if (region) return `Product - ${rSeg}`;
    return `Product - ${tSeg}`;
  }

  /** Chip label from {@link SavedView} time-horizon fields saved by the filters bar. */
  private formatSavedViewTimeHorizonTag(view: SavedView | null | undefined): string | null {
    if (!view || typeof view !== 'object') return null;
    const labels = view.timeHorizonRangeLabels;
    if (labels && typeof labels === 'object') {
      const a = String(labels.start ?? '').trim();
      const b = String(labels.end ?? '').trim();
      if (a && b) {
        if (a === b) return `Time horizon - ${a}`;
        return `Time horizon - ${a} to ${b}`;
      }
    }
    const sel = view.selectedTimeHorizon != null ? String(view.selectedTimeHorizon).trim() : '';
    if (sel) return `Time horizon - ${sel}`;
    return null;
  }

  private buildTimeHorizonTooltipFields(view: SavedView): SavedViewTagTooltipField[] {
    const tag = this.formatSavedViewTimeHorizonTag(view);
    if (!tag) return [];
    const value = tag.replace(/^Time horizon -\s*/i, '').trim();
    return [{ label: 'Time horizon:', value: value.length > 0 ? value : tag }];
  }

  /** Chip label from {@link SavedView.minFlowRange} (indices into {@link MIN_FLOW_VALUE_OPTIONS}). */
  private formatSavedViewMinFlowTag(view: SavedView | null | undefined): string | null {
    const mfr = view?.minFlowRange;
    if (!mfr || typeof mfr !== 'object') return null;
    const opts = MIN_FLOW_VALUE_OPTIONS;
    const n = opts.length;
    if (n <= 0) return null;
    let start = Number(mfr.startIndex);
    let end = Number(mfr.endIndex);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    start = Math.max(0, Math.min(n - 1, Math.floor(start)));
    end = Math.max(0, Math.min(n - 1, Math.floor(end)));
    if (end < start) {
      const t = start;
      start = end;
      end = t;
    }
    const startRaw = opts[start]?.label ?? '';
    const startDisplay = displayMinFlowStartLabel(startRaw);
    const endDisplay = displayMinFlowEndLabel(opts, end);
    if (!startDisplay || !endDisplay) return null;
    if (startDisplay === endDisplay) {
      return `Min flow value - ${startDisplay}`;
    }
    return `Min flow value - ${startDisplay} to ${endDisplay}`;
  }

  private buildMinFlowTooltipFields(view: SavedView): SavedViewTagTooltipField[] {
    const tag = this.formatSavedViewMinFlowTag(view);
    if (!tag) return [];
    const value = tag.replace(/^Min flow value -\s*/i, '').trim();
    return [{ label: 'Min flow value:', value: value.length > 0 ? value : tag }];
  }

  private buildInvestorTooltipFields(coerced: SavedViewState): SavedViewTagTooltipField[] {
    const out: SavedViewTagTooltipField[] = [];
    const r = coerced.investorRegion;
    const t = coerced.investorType;
    if (r?.length) out.push({ label: 'Investor Region:', value: r.join(', ') });
    if (t?.length) out.push({ label: 'Investor Type:', value: t.join(', ') });
    return out;
  }

  private buildProductTooltipFields(coerced: SavedViewState): SavedViewTagTooltipField[] {
    const out: SavedViewTagTooltipField[] = [];
    const r = coerced.productRegion;
    const t = coerced.productType;
    if (r?.length) out.push({ label: 'Product Region:', value: r.join(', ') });
    if (t?.length) out.push({ label: 'Product Type:', value: t.join(', ') });
    return out;
  }

  /**
   * Original static presets used as a fallback when no local saved views exist.
   */
  private getDefaultViewingOptions(): ViewingOption[] {
    return [
      {
        name: 'High-confidence Equities',
        savedDate: 'Mar 28, 2026',
        tags: [
          'Investor - United States (+1) / Endowment',
          'Product - North America / Equities (+1)',
          'Time horizon - Today to +3 mo',
          'Min flow value - $0 to Max',
        ],
        tagTooltipFields: [
          [
            { label: 'Investor Region:', value: 'United States, Europe' },
            { label: 'Investor Type:', value: 'Endowment' },
          ],
          [
            { label: 'Product Region:', value: 'North America' },
            { label: 'Product Type:', value: 'Equities, Fixed Income' },
          ],
          [{ label: 'Time horizon:', value: 'Today to +3 mo' }],
          [{ label: 'Min flow value:', value: '$0 to Max' }],
        ],
        isActive: false,
      },
      {
        name: 'Global Alternatives View',
        savedDate: 'Mar 25, 2026',
        tags: [
          'Investor - Europe (+2) / Foundation (+1)',
          'Product - US (+1) / Alternatives',
          'Time horizon - -6 mo to Today',
        ],
        tagTooltipFields: [
          [
            { label: 'Investor Region:', value: 'Europe, Asia, Americas' },
            { label: 'Investor Type:', value: 'Foundation, Pension' },
          ],
          [
            { label: 'Product Region:', value: 'US, UK' },
            { label: 'Product Type:', value: 'Alternatives' },
          ],
          [{ label: 'Time horizon:', value: '-6 mo to Today' }],
        ],
        isActive: false,
      },
      {
        name: 'All Equities',
        savedDate: 'Mar 20, 2026',
        tags: [
          'Investor - United States / Pensions (+1)',
          'Product - Global (+1) / Equities (+2)',
          'Time horizon - Today to +12 mo',
          'Min flow value - $500M to Max',
        ],
        tagTooltipFields: [
          [
            { label: 'Investor Region:', value: 'United States' },
            { label: 'Investor Type:', value: 'Pensions, Endowment' },
          ],
          [
            { label: 'Product Region:', value: 'Global, Emerging Markets' },
            { label: 'Product Type:', value: 'Equities, Private Equity, Real Estate' },
          ],
          [{ label: 'Time horizon:', value: 'Today to +12 mo' }],
          [{ label: 'Min flow value:', value: '$500M to Max' }],
        ],
        isActive: false,
      },
    ];
  }

  /** Fields for the hover tooltip on a tag chip; null when there is nothing to show. */
  savedViewTagTooltipFields(option: ViewingOption, index: number): SavedViewTagTooltipField[] | null {
    const rows = option.tagTooltipFields?.[index];
    if (!rows?.length) return null;
    return rows;
  }

  toggleViewingDropdown(): void {
    if (this.savedViewsCount === 0) {
      this.isViewingDropdownOpen = false;
      return;
    }
    this.isViewingDropdownOpen = !this.isViewingDropdownOpen;
    if (this.isViewingDropdownOpen && this.filterButton) {
      setTimeout(() => {
        this.updateDropdownPosition();
      }, 0);
    }
  }

  /** Min width of the dropdown (must match .viewing-dropdown min-width in SCSS). */
  private readonly dropdownMinWidth = 360;
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
      this.isViewingDropdownOpen = false;
    } else if (wasActive && hadMultiple) {
      this.viewingFilter = next[0].name;
      next = next.map((o) => ({ ...o, isActive: false }));
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

