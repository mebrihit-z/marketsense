/* eslint-disable */
import { Component, OnInit, OnDestroy, OnChanges, SimpleChanges, HostListener, HostBinding, ViewChild, ElementRef, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { distinctUntilChanged, filter, map } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import  FilterDropdownComponent,{ type FilterOption, type GroupedFilterOption } from '../filter-dropdown/filter-dropdown.component';
import SaveFilterSetModalComponent from '../save-filter-set-modal/save-filter-set-modal.component';
import { extractFilterOptionsFromAssetFlows } from '../../../utils/asset-flows-filter-options.util';
import { type AssetFlowRecord } from '../../../utils/asset-flows-to-sankey.util';
import { AssetFlowsDataService } from '../../../../core/services/asset-flows-data.service';
import { SavedViewsService, type SavedView } from '../../../../core/services/saved-views.service';
import UserProfileService from '../../../services/user-profile.service';
import { MinFlowRangeSliderComponent } from '../../min-flow-range-slider/min-flow-range-slider.component';
import {
  MIN_FLOW_VALUE_OPTIONS,
  createDefaultMinFlowRange,
  type MinFlowRangeSelection,
} from '../../../utils/min-flow-value-options.util';

export interface FilterOptionTotals {
  productTypeTotal: number;
  productSubTypeTotal: number;
  investorRegionTotal: number;
  investorTypeTotal: number;
  productRegionTotal: number;
}

@Component({
  selector: 'app-filters-bar',
  standalone: true,
  imports: [CommonModule, FormsModule, FilterDropdownComponent, SaveFilterSetModalComponent, MinFlowRangeSliderComponent],
  templateUrl: './filters-bar.component.html',
  styleUrl: './filters-bar.component.scss',
  /** Declared in metadata so parent templates always resolve `[stickyEngaged]` (strictTemplates + language service). */
  inputs: ['stickyEngaged'],
})
export class FiltersBarComponent implements OnInit, OnDestroy, OnChanges {
  @Input() forceCloseDropdown = 0;
  /** When true (set by dashboard while the bar is position:sticky at the top), user can minimize the bar. */
  public stickyEngaged = false;
  /** While sticky: when true, only the compact "Show filters" strip is visible. */
  stickyBarCollapsed = false;

  /** Lets the dashboard strip stay transparent when only "Show filters" is visible (see `.dashboard-filters-sticky:has(...)`). */
  @HostBinding('class.filters-bar-host-collapsed')
  get filtersBarHostCollapsedClass(): boolean {
    return this.stickyEngaged && this.stickyBarCollapsed;
  }

  @ViewChild('sliderContainer', { static: false }) sliderContainer!: ElementRef<HTMLElement>;
  @ViewChild('timeHorizonSliderFull', { static: false }) timeHorizonSliderContainerFull!: ElementRef<HTMLElement>;
  get timeHorizonSliderContainer(): ElementRef<HTMLElement> | null {
    return this.timeHorizonSliderContainerFull ?? null;
  }
  @ViewChild('filtersRoot', { static: false }) filtersRoot!: ElementRef<HTMLElement>;
  @ViewChild('productSubTypeDropdown', { static: false }) productSubTypeDropdown!: FilterDropdownComponent;
  @ViewChild('aiConfidenceInfoBtn', { static: false }) aiConfidenceInfoBtn!: ElementRef<HTMLButtonElement>;
  @ViewChild('timeHorizonInfoBtn', { static: false }) timeHorizonInfoBtn!: ElementRef<HTMLButtonElement>;
  @ViewChild('minFlowValueInfoBtn', { static: false }) minFlowValueInfoBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('aiConfidenceTooltip', { static: false }) aiConfidenceTooltip!: ElementRef<HTMLDivElement>;
  @ViewChild('timeHorizonTooltip', { static: false }) timeHorizonTooltip!: ElementRef<HTMLDivElement>;
  @ViewChild('minFlowValueTooltip', { static: false }) minFlowValueTooltip?: ElementRef<HTMLDivElement>;
  @ViewChild('investorGroupInfoBtn', { static: false }) investorGroupInfoBtn!: ElementRef<HTMLButtonElement>;
  @ViewChild('investorGroupTooltip', { static: false }) investorGroupTooltip!: ElementRef<HTMLDivElement>;
  @ViewChild('productGroupInfoBtn', { static: false }) productGroupInfoBtn!: ElementRef<HTMLButtonElement>;
  @ViewChild('productGroupTooltip', { static: false }) productGroupTooltip!: ElementRef<HTMLDivElement>;
  
  // Track which filter dropdown has an open tooltip
  openFilterDropdownTooltip: string | null = null;
  
  // Flag to force close all filter dropdown tooltips
  closeAllFilterDropdownTooltips = false;
  
  @Output() dataTypeChange = new EventEmitter<'historical' | 'forecasted'>();
  @Output() timeHorizonChange = new EventEmitter<string>();
  @Output() timeHorizonRangeChange = new EventEmitter<{ start: string; end: string }>();
  @Output() productSubTypeChange = new EventEmitter<string[]>();
  @Output() productTypeChange = new EventEmitter<string[]>();
  @Output() productRegionChange = new EventEmitter<string[]>();
  @Output() investorRegionChange = new EventEmitter<string[]>();
  @Output() investorTypeChange = new EventEmitter<string[]>();
  @Output() filterOptionTotalsChange = new EventEmitter<FilterOptionTotals>();
  @Output() filterDropdownOpened = new EventEmitter<void>();
  @Output() minFlowValueRangeChange = new EventEmitter<MinFlowRangeSelection>();

  readonly minFlowValueOptions = MIN_FLOW_VALUE_OPTIONS;
  minFlowRange: MinFlowRangeSelection = createDefaultMinFlowRange();

  constructor(
    private assetFlowsData: AssetFlowsDataService,
    private savedViewsService: SavedViewsService,
    private userProfileService: UserProfileService
  ) {}

  emitMinFlowValueRange(): void {
    this.minFlowValueRangeChange.emit({ ...this.minFlowRange });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['forceCloseDropdown'] && changes['forceCloseDropdown'].currentValue > 0) {
      this.openDropdown = null;
    }
    const se = changes['stickyEngaged'];
    if (se && se.previousValue === true && se.currentValue === false) {
      this.stickyBarCollapsed = false;
    }
  }

  toggleStickyBarCollapse(): void {
    this.stickyBarCollapsed = !this.stickyBarCollapsed;
    if (this.stickyBarCollapsed) {
      this.openDropdown = null;
      this.openTooltip = null;
    }
  }
  
  aiConfidenceRange = { min: 50, max: 100 };
  isDragging = false;
  dragType: 'min' | 'max' | null = null;
  hasDragged = false; // Track if user actually dragged vs just clicked
  sliderTrackWidth = 142; // Width of the slider track in pixels (normal)
  
  // Time Horizon range slider state (indices into timeHorizons; default = Today → +3 mo)
  timeHorizonRange = { startIndex: 5, endIndex: 6 };
  isTimeHorizonDragging = false;
  timeHorizonDragType: 'start' | 'end' | null = null;
  timeHorizonHasDragged = false; // Track if user actually dragged vs just clicked
  /** Container element when dragging (set from handle's parent). */
  private timeHorizonDragContainer: HTMLElement | null = null;
  /** Timestamp of last mousedown on track, to avoid handling click twice for same gesture. */
  private _lastTimeHorizonTrackMousedownAt: number | null = null;
  timeHorizonSliderTrackWidth = 520; // Width of the time horizon slider track in pixels (desktop full layout)
  /** Bound document capture listener for time horizon (so we can remove in ngOnDestroy). */
  private _documentTimeHorizonCaptureListener = (e: MouseEvent | TouchEvent) => this.onDocumentTimeHorizonCapture(e);

  /** VDI: sync user preference only after OAuth `sub` is available (avoids duplicate API users). */
  private userPreferenceSyncSub?: Subscription;
  
  // Toggle state
  dataType: 'historical' | 'forecasted' = 'forecasted';
  selectedTimeHorizon: string = '+3 mo';

  /** When true, time-axis tick labels use short copy on one row (see SCSS) so they fit on narrow screens. */
  compactTimeHorizonAxis = typeof window !== 'undefined' && window.innerWidth <= 768;

  private static readonly TIME_HORIZONS_SHORT: readonly string[] = [
    '-18',
    '-12',
    '-9',
    '-6',
    '-3',
    'Now',
    '+3',
    '+6',
    '+9',
    '+12',
    '+18',
  ];
  
  /**
   * @returns {void} Initializes filter state and time horizon defaults.
   */
  ngOnInit() {
    // Keep a user preference record so saved views are user-scoped.
    const syncPreference = (explicitUserId?: string): void => {
      const currentUser = this.userProfileService.getuser();
      this.savedViewsService
        .syncUserPreference({
          userId: explicitUserId ?? this.userProfileService.getUserId() ?? currentUser?.sub,
          userName:
            this.userProfileService.getGivenName() ??
            currentUser?.name ??
            currentUser?.given_name,
          role: this.userProfileService.getRoleName(),
          lastLogin: this.getCurrentLoginTimestamp(),
        })
        .subscribe();
    };

    if (this.savedViewsService.isSavedViewsBackendEnabled()) {
      // Defer until OAuth `sub` is available so the API does not create slug/anonymous users first.
      this.userPreferenceSyncSub = this.userProfileService.user$
        .pipe(
          map((user) => this.userProfileService.getUserId() ?? user?.sub ?? null),
          map((id) => (id != null && String(id).trim() !== '' ? String(id).trim() : null)),
          filter((id): id is string => id !== null && id !== 'anonymous'),
          distinctUntilChanged()
        )
        .subscribe((userId) => syncPreference(userId));
    } else {
      syncPreference();
    }

    // Load product sub-types and investor regions from asset-flows-data.json (async)
    this.loadFilterOptionsFromAssetFlows();
    
    // Initialize all filters with all options selected by default
    // Note: productType, productSubType, and investorRegion will be initialized in loadFilterOptionsFromAssetFlows() after async load
    this.state.investorType = this.investorTypeOptions.map(opt => opt.value);
    this.state.productRegion = this.productRegionOptions.map(opt => opt.value);
    
    // Emit initial selections (productType, productSubType, and investorRegion will be emitted after async load)
    this.productRegionChange.emit(this.state.productRegion);
    this.investorTypeChange.emit(this.state.investorType);
    
    // Initialize time horizon range based on selectedTimeHorizon
    this.initializeTimeHorizonRange();

    this.emitMinFlowValueRange();

    this.refreshCompactTimeHorizonAxis();

    // Document capture listeners for full time horizon (handle drag + track click); capture so they run first
    if (typeof document !== 'undefined') {
      document.addEventListener('mousedown', this._documentTimeHorizonCaptureListener, true);
      document.addEventListener('touchstart', this._documentTimeHorizonCaptureListener, true);
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.refreshCompactTimeHorizonAxis();
  }

  private refreshCompactTimeHorizonAxis(): void {
    if (typeof window === 'undefined') return;
    const next = window.innerWidth <= 768;
    if (next !== this.compactTimeHorizonAxis) {
      this.compactTimeHorizonAxis = next;
    }
  }

  /**
   * @param index - Tick index aligned with {@link FiltersBarComponent#timeHorizons}.
   * @returns Label text for the slider axis (short on narrow viewports).
   */
  timeHorizonTickLabel(index: number): string {
    const full = this.timeHorizons[index];
    if (full == null) return '';
    if (!this.compactTimeHorizonAxis) return full;
    return FiltersBarComponent.TIME_HORIZONS_SHORT[index] ?? full;
  }

  ngOnDestroy(): void {
    this.userPreferenceSyncSub?.unsubscribe();
    if (typeof document !== 'undefined') {
      document.removeEventListener('mousedown', this._documentTimeHorizonCaptureListener, true);
      document.removeEventListener('touchstart', this._documentTimeHorizonCaptureListener, true);
    }
  }

  /**
   * Loads product types, product sub-types, investor regions, investor types, and product regions 
   * from the central asset flows data source (JSON or backend API via environment).
   * @returns {void}
   */
  private loadFilterOptionsFromAssetFlows(): void {
    this.assetFlowsData.getAssetFlows().subscribe({
      next: (data: AssetFlowRecord[]) => {
        try {
          const filterOptions = extractFilterOptionsFromAssetFlows(data);
          
          // Set product types
          this.productTypeOptions = filterOptions.productTypes.map(type => ({ value: type }));
          
          // Set product sub-types grouped by product type
          this.productSubTypeOptions = filterOptions.productSubTypes.map(group => ({
            category: group.productType,
            options: group.subTypes.map(subType => ({ value: subType }))
          }));
          
          // Set investor regions from data (no Global option)
          this.investorRegionOptions = filterOptions.investorRegions.map(region => ({ value: region }));

          // Append static investor regions that are not yet available in the data,
          // and mark them as disabled in the dropdown.
          const staticRegions: FilterOption[] = [
            { value: 'United Kingdom', label: 'United Kingdom', disabled: true },
            { value: 'Europe', label: 'Europe', disabled: true },
            { value: 'Canada', label: 'Canada', disabled: true },
            { value: 'Asia/Pacific', label: 'Asia/Pacific', disabled: true },
            {value: 'Global', label: 'Global', disabled: true },
          ];
          const existingValues = new Set(this.investorRegionOptions.map(o => o.value));
          this.investorRegionOptions = [
            ...this.investorRegionOptions,
            ...staticRegions.filter(o => !existingValues.has(o.value)),
          ];
          
          // Set investor types
          this.investorTypeOptions = filterOptions.investorTypes.map(type => ({ value: type }));
          
         // Set product regions
         this.productRegionOptions = filterOptions.productRegions.map(region => ({ value: region }));

         // Product type: all options selected by default (matches investor type / product region behavior).
         this.state.productType = [...filterOptions.productTypes];

         // Initialize productSubType selection to match the initially selected product types
         const defaultSubTypes = filterOptions.productSubTypes
           .filter(group => this.state.productType.includes(group.productType))
           .flatMap(group => group.subTypes);
         this.state.productSubType = Array.from(new Set(defaultSubTypes));
          
          // Initialize investorRegion selection with all *data-backed* regions selected by default.
          // Static "coming soon" regions are NOT selected (and will be disabled in the UI).
          this.state.investorRegion = [...filterOptions.investorRegions];
          
          // Initialize investorType selection with all options selected
          this.state.investorType = filterOptions.investorTypes;
          
          // Initialize productRegion selection with all options selected
          this.state.productRegion = filterOptions.productRegions;
          
          // Emit initial selections
          this.productTypeChange.emit(this.state.productType);
          this.productSubTypeChange.emit(this.state.productSubType);
          this.investorRegionChange.emit(this.state.investorRegion);
          this.investorTypeChange.emit(this.state.investorType);
          this.productRegionChange.emit(this.state.productRegion);
          this.emitFilterOptionTotals();

          // After filter options + initial state are ready, apply user's default saved view (if any).
          this.applyDefaultSavedViewIfPresent();
        } catch (error: unknown) {
          console.error('Error extracting filter options from asset flows data:', error);
          // Fallback to empty arrays
          this.productTypeOptions = [];
          this.productSubTypeOptions = [];
          this.investorRegionOptions = [];
          this.investorTypeOptions = [];
          this.productRegionOptions = [];
          this.emitFilterOptionTotals();

          // Still attempt to apply default saved view even if option extraction failed.
          this.applyDefaultSavedViewIfPresent();
        }
      },
      error: (error: unknown) => {
        console.error('Error loading asset flows data for filter options:', error);
        // Fallback to empty arrays
        this.productTypeOptions = [];
        this.productSubTypeOptions = [];
        this.investorRegionOptions = [];
        this.investorTypeOptions = [];
        this.productRegionOptions = [];
        this.emitFilterOptionTotals();

        // Still attempt to apply default saved view even if options failed to load.
        this.applyDefaultSavedViewIfPresent();
      }
    });
  }

  /**
   * Applies the user's default saved view, if it exists.
   * This ensures the selected filters reflect the default preset when the app opens.
   */
  private applyDefaultSavedViewIfPresent(): void {
    if (this.hasAttemptedApplyDefaultSavedView) return;
    this.hasAttemptedApplyDefaultSavedView = true;

    const currentUserId = this.userProfileService.getUserId();

    this.savedViewsService.getSavedViewsForUser(currentUserId).subscribe({
      next: (views: SavedView[]) => {
        const defaultView = views.find((v) => v?.isDefault === true) ?? null;
        if (!defaultView) return;

        // Reuse existing apply logic.
        this.onApplySavedView({ detail: defaultView } as any);
      },
      error: (e) => {
        console.error('Failed to load saved views for default apply', e);
      }
    });
  }

  /**
   * Emits the total counts for each filter option group so other components can
   * display selected/total badges (e.g., Flow Dimensions chips).
   */
  private emitFilterOptionTotals(): void {
    const productSubTypeTotal = this.getUniqueProductSubTypeValues().length;

    this.filterOptionTotalsChange.emit({
      productTypeTotal: this.productTypeOptions.length,
      productSubTypeTotal,
      investorRegionTotal: this.investorRegionOptions.length,
      investorTypeTotal: this.investorTypeOptions.length,
      productRegionTotal: this.productRegionOptions.length
    });
  }

  /**
   * @returns {void} Initializes the time horizon slider range from the current selection.
   */
  private initializeTimeHorizonRange(): void {
    const horizons = this.timeHorizons;
    const todayIdx = horizons.indexOf('Today');
    const plus3Idx = horizons.indexOf('+3 mo');
    const minus3Idx = horizons.indexOf('-3 mo');

    if (this.dataType === 'historical' && minus3Idx >= 0 && todayIdx >= 0) {
      this.timeHorizonRange = { startIndex: minus3Idx, endIndex: todayIdx };
    } else if (todayIdx >= 0 && plus3Idx >= 0) {
      // Forecasted default: Today → +3 mo
      this.timeHorizonRange = { startIndex: todayIdx, endIndex: plus3Idx };
    } else {
      const n = horizons.length - 1;
      this.timeHorizonRange = { startIndex: Math.max(0, n - 1), endIndex: n };
    }
    this.updateSelectedTimeHorizon();
  }

  // Filter options loaded from asset-flows-data.json
  investorRegionOptions: FilterOption[] = []; // Will be loaded from asset-flows-data.json (plus static disabled options)
  investorTypeOptions: FilterOption[] = []; // Will be loaded from asset-flows-data.json
  productRegionOptions: FilterOption[] = []; // Will be loaded from asset-flows-data.json
  productTypeOptions: FilterOption[] = []; // Will be loaded from asset-flows-data.json
  productSubTypeOptions: GroupedFilterOption[] = []; // Will be loaded from asset-flows-data.json
   // centralized state (Option A)
   state = {
    investorRegion: [] as string[],
    investorType: [] as string[],
    productRegion: [] as string[],
    productType: [] as string[],
    productSubType: [] as string[]
  };

  // Track which dropdown is currently open
  openDropdown: string | null = null;

  // Track if "Clear All Filters" was clicked to show "Select All Filters" button
  showSelectAll: boolean = false;

  // Track which tooltip is open
  openTooltip: 'aiConfidence' | 'timeHorizon' | 'minFlowValue' | 'investorGroup' | 'productGroup' | null = null;

  // Save filter set modal state
  isSaveFilterSetModalOpen: boolean = false;

  // Ensure the default saved view is applied only once during initialization.
  private hasAttemptedApplyDefaultSavedView: boolean = false;
  private getCurrentLoginTimestamp(): string {
    return this.userProfileService.getLastLogin() ?? new Date().toISOString();
  }

  /**
   * Returns unique product sub-type values across all groups.
   * Product sub-type labels can repeat under different product types.
   */
  private getUniqueProductSubTypeValues(): string[] {
    const allValues = this.productSubTypeOptions.flatMap(group =>
      group.options.map(opt => opt.value)
    );
    return Array.from(new Set(allValues));
  }

  /**
   * Local storage key for saved filter views.
   */
  private readonly SAVED_VIEWS_STORAGE_KEY = 'marketsense.savedViews';

  /**
   * @param {keyof typeof this.state} key - The state key to update
   * @param {string[]} values - The new values to set for the state key
   * @returns {void} Updates internal state and emits changes for specific filter groups.
   */
  onChange(key: keyof typeof this.state, values: string[]) {
    const previousValues = [...this.state[key]];
    this.state[key] = key === 'productSubType'
      ? Array.from(new Set(values))
      : values;
    
    // Hide "Select All Filters" button when any filter is manually selected
    if (values.length > 0) {
      this.showSelectAll = false;
    }
    
    // Handle product type changes - deselect related sub-types when product type is deselected
    if (key === 'productType') {
      this.handleProductTypeChange(previousValues, values);
      this.productTypeChange.emit(values);
    } else if (key === 'productSubType') {
      this.productSubTypeChange.emit(this.state.productSubType);
    } else if (key === 'productRegion') {
      this.productRegionChange.emit(values);
    } else if (key === 'investorRegion') {
      this.investorRegionChange.emit(values);
    } else if (key === 'investorType') {
      this.investorTypeChange.emit(values);
    }
  }

  /**
   * Handles product type changes by selecting/deselecting related product sub-types when a product type is selected/deselected.
   * @param previousValues - The previous product type selections
   * @param newValues - The new product type selections
   * @returns {void}
   */
  private handleProductTypeChange(previousValues: string[], newValues: string[]): void {
    if (!this.productSubTypeDropdown) {
      return;
    }

    // Find which product types were deselected
    const deselectedTypes = previousValues.filter(type => !newValues.includes(type));
    // Find which product types were selected
    const selectedTypes = newValues.filter(type => !previousValues.includes(type));
    
    const subTypesToDeselect: string[] = [];
    const subTypesToSelect: string[] = [];
    
    // Handle deselected product types
    if (deselectedTypes.length > 0) {
      deselectedTypes.forEach(deselectedType => {
        // Find the group for this product type
        const group = this.productSubTypeOptions.find(g => g.category === deselectedType);
        if (group) {
          // Add all sub-types from this group to the deselection list
          group.options.forEach(option => {
            subTypesToDeselect.push(option.value);
          });
        }
      });
    }
    
    // Handle selected product types
    if (selectedTypes.length > 0) {
      selectedTypes.forEach(selectedType => {
        // Find the group for this product type
        const group = this.productSubTypeOptions.find(g => g.category === selectedType);
        if (group) {
          // Add all sub-types from this group to the selection list
          group.options.forEach(option => {
            subTypesToSelect.push(option.value);
          });
        }
      });
    }
    
    // Update pending map and state for deselected sub-types
    if (subTypesToDeselect.length > 0) {
      this.productSubTypeDropdown.deselectPendingValues(subTypesToDeselect);
      
      // Update the state to reflect the deselection
      this.state.productSubType = this.state.productSubType.filter(
        subType => !subTypesToDeselect.includes(subType)
      );
    }
    
    // Update pending map and state for selected sub-types
    if (subTypesToSelect.length > 0) {
      this.productSubTypeDropdown.selectPendingValues(subTypesToSelect);
      
      // Add selected sub-types to state (avoid duplicates)
      subTypesToSelect.forEach(subType => {
        if (!this.state.productSubType.includes(subType)) {
          this.state.productSubType.push(subType);
        }
      });
    }
    
    // Emit the updated product sub-type selection if there were any changes
    if (subTypesToDeselect.length > 0 || subTypesToSelect.length > 0) {
      this.productSubTypeChange.emit(this.state.productSubType);
    }
  }

  /**
   * Handles dropdown open/close state changes.
   * Closes all other dropdowns when one opens.
   * @param dropdownKey - The key identifying which dropdown is changing state
   * @param isOpen - Whether the dropdown should be open
   * @returns {void}
   */
  onDropdownOpenChange(dropdownKey: string, isOpen: boolean): void {
    if (isOpen) {
      // Close the filters-bar information box (AI Confidence / Data Type / Time Horizon) when opening a dropdown
      this.openTooltip = null;
      // Close info tooltips on all filter dropdowns when opening any dropdown (so only one UI is open at a time)
      this.closeAllFilterDropdownTooltips = true;
      setTimeout(() => {
        this.closeAllFilterDropdownTooltips = false;
      }, 0);
      this.openFilterDropdownTooltip = null;
      // Close all other dropdowns when one opens
      this.openDropdown = dropdownKey;
      this.filterDropdownOpened.emit();
    } else {
      // Clear the open dropdown if this one is closing
      if (this.openDropdown === dropdownKey) {
        this.openDropdown = null;
      }
    }
  }

  /**
   * Checks if a specific dropdown is open.
   * @param dropdownKey - The key identifying the dropdown
   * @returns {boolean} True if the dropdown is open, false otherwise
   */
  isDropdownOpen(dropdownKey: string): boolean {
    return this.openDropdown === dropdownKey;
  }

  /**
   * @returns {void} Clears all filter selections and resets AI confidence range.
   */
  clearAll() {
    (Object.keys(this.state) as Array<keyof typeof this.state>).forEach((key) => {
      this.state[key] = [];
    });
    this.aiConfidenceRange = { min: 50, max: 100 };
    
    // Show "Select All Filters" button after clearing
    this.showSelectAll = true;
    
    // Emit all filter change events to notify parent components
    this.productSubTypeChange.emit([]);
    this.productTypeChange.emit([]);
    this.productRegionChange.emit([]);
    this.investorRegionChange.emit([]);
    this.investorTypeChange.emit([]);
    this.minFlowRange = createDefaultMinFlowRange();
    this.emitMinFlowValueRange();
  }

  /**
   * @returns {void} Selects all available filter options for all filter types.
   */
  selectAll() {
    // Select all investor type options
    this.state.investorType = this.investorTypeOptions.map(opt => opt.value);
    
    // Select all product region options
    this.state.productRegion = this.productRegionOptions.map(opt => opt.value);
    
    // Select all product type options
    if (this.productTypeOptions.length > 0) {
      this.state.productType = this.productTypeOptions.map(opt => opt.value);
    }
    
    // Select all product sub-type options
    if (this.productSubTypeOptions.length > 0) {
      this.state.productSubType = this.getUniqueProductSubTypeValues();
    }
    
    // Select all investor region options
    if (this.investorRegionOptions.length > 0) {
      this.state.investorRegion = this.investorRegionOptions.map(opt => opt.value);
    }
    
    // Hide "Select All Filters" button after selecting
    this.showSelectAll = false;
    
    // Emit all filter change events to notify parent components
    this.productSubTypeChange.emit(this.state.productSubType);
    this.productTypeChange.emit(this.state.productType);
    this.productRegionChange.emit(this.state.productRegion);
    this.investorRegionChange.emit(this.state.investorRegion);
    this.investorTypeChange.emit(this.state.investorType);
  }

  /**
   * @returns {void} Opens the save filter set modal.
   */
  saveFilterSet() {
    this.isSaveFilterSetModalOpen = true;
  }

  /**
   * @returns {void} Closes the save filter set modal.
   */
  onCloseSaveFilterSetModal(): void {
    this.isSaveFilterSetModalOpen = false;
  }

  /**
   * @param {{ name: string; isDefault: boolean }} payload - Saved view payload
   * @returns {void} Saves the current filter set configuration with the given name.
   */
  onSaveFilterSet(payload: { name: string; isDefault: boolean }): void {
    const filterSetName = payload.name;
    const isDefault = payload.isDefault;
    const currentUser = this.userProfileService.getuser();
    const userId = this.userProfileService.getUserId() ?? currentUser?.sub;
    // Prefer the user's given name from UserProfileService (keeps UI consistent
    // with other components like WelcomeSection).
    const userName =
      this.userProfileService.getGivenName() ??
      currentUser?.name ??
      currentUser?.given_name;
    const role = this.userProfileService.getRoleName();
    const lastLogin = this.getCurrentLoginTimestamp();

    const savedView: SavedView = {
      name: filterSetName,
      isDefault,
      // Full filter state so it can be reapplied by whatever
      // consumes these presets (e.g., a service or container component).
      state: {
        investorRegion: [...this.state.investorRegion],
        investorType: [...this.state.investorType],
        productRegion: [...this.state.productRegion],
        productType: [...this.state.productType],
        productSubType: [...this.state.productSubType],
      },
      dataType: this.dataType,
      timeHorizonRange: { ...this.timeHorizonRange },
      timeHorizonRangeLabels: {
        start: this.timeHorizons[this.timeHorizonRange.startIndex],
        end: this.timeHorizons[this.timeHorizonRange.endIndex],
      },
      selectedTimeHorizon: this.selectedTimeHorizon,
      aiConfidenceRange: { ...this.aiConfidenceRange },
      minFlowRange: { ...this.minFlowRange },
    };

    this.savedViewsService.saveView(savedView, userId, userName, { role, lastLogin }).subscribe({
      next: () => {
        // Notify other parts of the app (e.g., welcome section) that saved views changed.
        if (typeof window !== 'undefined') {
          try {
            window.dispatchEvent(new CustomEvent('marketsenseSavedViewsUpdated'));
          } catch {
            // Swallow if CustomEvent is not available (older environments)
          }
        }
      },
      error: (e) => {
        console.error('Failed to save filter set', e);
      },
    });
    // Close modal after saving
    this.isSaveFilterSetModalOpen = false;
  }

  /**
   * Applies a saved view (triggered when user selects one of the "Saved Views").
   * Expects the payload structure created in onSaveFilterSet().
   */
  @HostListener('window:marketsenseApplySavedView', ['$event'])
  onApplySavedView(event: Event): void {
    const customEvent = event as CustomEvent<any>;
    const detail = customEvent?.detail;
    if (!detail || typeof detail !== 'object') return;

    const savedState = detail.state ?? {};

    // Safely apply saved state to current filter state (only keys that exist).
    const keys: Array<keyof typeof this.state> = [
      'investorRegion',
      'investorType',
      'productRegion',
      'productType',
      'productSubType',
    ];

    keys.forEach((key) => {
      const value = savedState[key];
      if (Array.isArray(value)) {
        this.state[key] = [...value];
      }
    });

    // Re-emit filter changes so downstream components update.
    this.productTypeChange.emit(this.state.productType);
    this.productSubTypeChange.emit(this.state.productSubType);
    this.productRegionChange.emit(this.state.productRegion);
    this.investorRegionChange.emit(this.state.investorRegion);
    this.investorTypeChange.emit(this.state.investorType);

    // Apply data type first so time horizon labels map correctly.
    if (detail.dataType === 'historical' || detail.dataType === 'forecasted') {
      this.dataType = detail.dataType;
      this.dataTypeChange.emit(this.dataType);
    }

    // Apply time horizon using the saved start/end labels so both handles
    // are restored exactly as saved (e.g., "+3 mo" to "+12 mo").
    const labels = detail.timeHorizonRangeLabels;
    if (labels && typeof labels === 'object') {
      const horizons = this.timeHorizons;
      const startLabel = labels.start as string | undefined;
      const endLabel = labels.end as string | undefined;
      const startIndex = startLabel != null ? horizons.indexOf(startLabel) : -1;
      const endIndex = endLabel != null ? horizons.indexOf(endLabel) : -1;
      if (startIndex >= 0 && endIndex >= startIndex) {
        this.timeHorizonRange = { startIndex, endIndex };
        this.updateSelectedTimeHorizon();
      }
    } else if (detail.timeHorizonRange && typeof detail.timeHorizonRange === 'object') {
      // Fallback for older saved views that only have indices.
      const { startIndex, endIndex } = detail.timeHorizonRange;
      if (
        typeof startIndex === 'number' &&
        typeof endIndex === 'number' &&
        startIndex >= 0 &&
        endIndex >= startIndex
      ) {
        this.timeHorizonRange = { startIndex, endIndex };
        this.updateSelectedTimeHorizon();
      }
    } else if (typeof detail.selectedTimeHorizon === 'string') {
      // Last-resort fallback: preserve at least the end handle using the previous logic.
      this.selectedTimeHorizon = detail.selectedTimeHorizon;
      this.initializeTimeHorizonRange();
    }

    // Apply AI confidence range if present.
    if (detail.aiConfidenceRange && typeof detail.aiConfidenceRange === 'object') {
      const { min, max } = detail.aiConfidenceRange;
      if (typeof min === 'number' && typeof max === 'number' && min >= 0 && max <= 100 && min < max) {
        this.aiConfidenceRange = { min, max };
      }
    }

    const mfr = detail.minFlowRange;
    const n = this.minFlowValueOptions.length;
    const last = Math.max(0, n - 1);
    if (
      mfr &&
      typeof mfr === 'object' &&
      typeof mfr.startIndex === 'number' &&
      typeof mfr.endIndex === 'number' &&
      mfr.startIndex >= 0 &&
      mfr.endIndex >= mfr.startIndex &&
      mfr.startIndex <= last &&
      mfr.endIndex <= last
    ) {
      this.minFlowRange = { startIndex: mfr.startIndex, endIndex: mfr.endIndex };
      this.emitMinFlowValueRange();
    }
  }

  /**
   * @param {MouseEvent | TouchEvent} event - The mouse or touch event that initiated the drag
   * @param {'min' | 'max'} type - The type of drag handle being dragged
   * @returns {void} Starts dragging on the AI confidence slider for the specified handle.
   */
  startDrag(event: MouseEvent | TouchEvent, type: 'min' | 'max') {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
    this.hasDragged = false;
    this.dragType = type;
    this.handleDrag(event);
  }

  /**
   * @param {MouseEvent | TouchEvent} event - The mouse or touch event during dragging
   * @returns {void} Handles drag events for both AI confidence and time horizon sliders.
   */
  @HostListener('document:mousemove', ['$event'])
  @HostListener('document:touchmove', ['$event'])
  onDrag(event: MouseEvent | TouchEvent) {
    if (this.isDragging) {
      this.handleDrag(event);
    }
    if (this.isTimeHorizonDragging) {
      if (event.cancelable) event.preventDefault();
      this.handleTimeHorizonDrag(event);
    }
  }

  /**
   * @returns {void} Stops any active drag operation and resets drag flags.
   */
  @HostListener('document:mouseup')
  @HostListener('document:touchend')
  stopDrag() {
    this.isDragging = false;
    this.dragType = null;
    // Reset drag flag after a brief delay to allow click handler to check it
    setTimeout(() => {
      this.hasDragged = false;
    }, 100);
    if (this.isTimeHorizonDragging) {
      this.isTimeHorizonDragging = false;
      this.timeHorizonDragType = null;
      this.timeHorizonDragContainer = null;
      if (typeof document !== 'undefined' && document.body) document.body.classList.remove('time-horizon-dragging');
      // Reset drag flag after a brief delay to allow click handler to check it
      setTimeout(() => {
        this.timeHorizonHasDragged = false;
      }, 100);
    }
  }

  /**
   * Handles clicks on the document to close any open dropdown when clicking outside the filters area.
   * Also handles closing tooltips when clicking outside.
   * @param event - The click event
   * @returns {void}
   */
  /**
   * Document mousedown/touchstart (capture): when full time horizon slider is visible, start handle drag
   * or track click. Registered in ngOnInit with capture: true so it fires before child elements.
   */
  onDocumentTimeHorizonCapture(event: MouseEvent | TouchEvent): void {
    const targetEl = event.target as HTMLElement;
    if (targetEl?.closest?.('.filters-sticky-minimize-btn, .filters-bar-sticky-collapsed-btn')) {
      return;
    }
    const container = this.timeHorizonSliderContainerFull?.nativeElement;
    if (!container) return;
    const clientX = 'touches' in event ? (event as TouchEvent).touches[0]?.clientX : (event as MouseEvent).clientX;
    const clientY = 'touches' in event ? (event as TouchEvent).touches[0]?.clientY : (event as MouseEvent).clientY;
    if (clientX == null || clientY == null) return;
    const target = targetEl;
    // Start drag when mousedown/touchstart is on a handle (by target or by hit-test)
    let handleEl = target?.closest?.('.time-horizon-handle');
    if (!handleEl) {
      const startHandle = container.querySelector('.time-horizon-handle-start') as HTMLElement;
      const endHandle = container.querySelector('.time-horizon-handle-end') as HTMLElement;
      if (startHandle) {
        const r = startHandle.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) handleEl = startHandle;
      }
      if (!handleEl && endHandle) {
        const r = endHandle.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) handleEl = endHandle;
      }
    }
    if (handleEl) {
      const isStart = handleEl.classList.contains('time-horizon-handle-start');
      this.startTimeHorizonDrag(event, isStart ? 'start' : 'end');
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (target?.closest?.('.time-horizon-labels')) return;
    if (this.timeHorizonHasDragged || this.isTimeHorizonDragging) return;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || x > rect.width || y < 0 || y > rect.height) return;
    this._lastTimeHorizonTrackMousedownAt = Date.now();
    this.applyTimeHorizonTrackClick(event, container);
    event.preventDefault();
    event.stopPropagation();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    // Don't close if we're dragging sliders
    if (this.isDragging || this.isTimeHorizonDragging || document.body.classList.contains('min-flow-range-dragging')) {
      return;
    }

    const target = event.target as HTMLElement;

    // Handle dropdown closing
    if (this.filtersRoot && this.filtersRoot.nativeElement) {
      const clickedInside = this.filtersRoot.nativeElement.contains(target);
      
      if (!clickedInside && this.openDropdown !== null) {
        // Click was outside the filters area, close any open dropdown
        this.openDropdown = null;
      }
    }
    
    // Handle filters-bar tooltip closing
    if (this.openTooltip) {
      let clickedInside = false;

      // Check if click was inside the relevant tooltip or button
      if (this.openTooltip === 'aiConfidence') {
        clickedInside = this.aiConfidenceTooltip?.nativeElement?.contains(target) ||
                       this.aiConfidenceInfoBtn?.nativeElement?.contains(target);
      } else if (this.openTooltip === 'timeHorizon') {
        clickedInside = this.timeHorizonTooltip?.nativeElement?.contains(target) ||
                       this.timeHorizonInfoBtn?.nativeElement?.contains(target);
      } else if (this.openTooltip === 'investorGroup') {
        clickedInside = this.investorGroupTooltip?.nativeElement?.contains(target) ||
                       this.investorGroupInfoBtn?.nativeElement?.contains(target);
      } else if (this.openTooltip === 'productGroup') {
        clickedInside = this.productGroupTooltip?.nativeElement?.contains(target) ||
                       this.productGroupInfoBtn?.nativeElement?.contains(target);
      } else if (this.openTooltip === 'minFlowValue') {
        clickedInside =
          !!this.minFlowValueTooltip?.nativeElement?.contains(target) ||
          !!this.minFlowValueInfoBtn?.nativeElement?.contains(target);
      }

      if (!clickedInside) {
        this.openTooltip = null;
      }
    }
    
    // Close filter dropdown tooltips when clicking outside (handled by filter-dropdown component's own click handler)
  }

  /**
   * @param {'min' | 'max'} type - The type of knob (minimum or maximum)
   * @returns {number} The pixel position of the requested knob along the slider track.
   */
  getKnobPosition(type: 'min' | 'max'): number {
    const value = type === 'min' ? this.aiConfidenceRange.min : this.aiConfidenceRange.max;
    return (value / 100) * this.sliderTrackWidth;
  }

  /**
   * @returns {number} The pixel offset for the left edge of the active AI confidence range.
   */
  getActiveTrackLeft(): number {
    return (this.aiConfidenceRange.min / 100) * this.sliderTrackWidth;
  }

  /**
   * @returns {number} The pixel width of the active AI confidence range.
   */
  getActiveTrackWidth(): number {
    return ((this.aiConfidenceRange.max - this.aiConfidenceRange.min) / 100) * this.sliderTrackWidth;
  }

  /**
   * @param {MouseEvent | TouchEvent} event - The mouse or touch event during dragging
   * @returns {void} Updates AI confidence values while the user drags a handle.
   */
  private handleDrag(event: MouseEvent | TouchEvent) {
    if (!this.dragType || !this.sliderContainer) return;

    const rect = this.sliderContainer.nativeElement.getBoundingClientRect();
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const x = clientX - rect.left;
    // Calculate percentage based on track width (142px)
    const trackWidth = this.sliderTrackWidth;
    const percentage = Math.max(0, Math.min(100, (x / trackWidth) * 100));

    if (this.dragType === 'min') {
      this.aiConfidenceRange.min = Math.min(percentage, this.aiConfidenceRange.max - 1);
    } else {
      this.aiConfidenceRange.max = Math.max(percentage, this.aiConfidenceRange.min + 1);
    }
    
    this.hasDragged = true;
  }

  /**
   * @param {MouseEvent | TouchEvent} event - The mouse or touch click event on the AI confidence track
   * @returns {void} Moves the nearest AI confidence handle to the clicked position when not dragging.
   */
  onAIConfidenceTrackClick(event: MouseEvent | TouchEvent) {
    // Don't handle clicks if user was dragging
    if (this.hasDragged || this.isDragging) {
      return;
    }
    
    event.stopPropagation();
    if (!this.sliderContainer) return;

    const rect = this.sliderContainer.nativeElement.getBoundingClientRect();
    let clientX: number;
    if ('touches' in event || 'changedTouches' in event) {
      const touchEvent = event as TouchEvent;
      clientX = touchEvent.changedTouches?.[0]?.clientX || touchEvent.touches?.[0]?.clientX || 0;
    } else {
      clientX = (event as MouseEvent).clientX;
    }
    const x = clientX - rect.left;
    const trackWidth = this.sliderTrackWidth;
    const percentage = Math.max(0, Math.min(100, (x / trackWidth) * 100));
    
    // Determine which knob is closer to the click position
    const minDistance = Math.abs(percentage - this.aiConfidenceRange.min);
    const maxDistance = Math.abs(percentage - this.aiConfidenceRange.max);
    
    // Move the closer knob, or min knob if equidistant
    if (minDistance <= maxDistance) {
      // Move min knob, but ensure it doesn't go past max
      this.aiConfidenceRange.min = Math.min(percentage, this.aiConfidenceRange.max - 1);
    } else {
      // Move max knob, but ensure it doesn't go before min
      this.aiConfidenceRange.max = Math.max(percentage, this.aiConfidenceRange.min + 1);
    }
  }

  // Time Horizon methods
  /**
   * @returns {string[]} A list of time horizon labels matching the current data type.
   */
  get timeHorizons(): string[] {
    // Unified time horizon scale combining historical and forecasted periods
    return ['-18 mo', '-12 mo', '-9 mo', '-6 mo', '-3 mo', 'Today', '+3 mo', '+6 mo', '+9 mo', '+12 mo', '+18 mo'];
  }

  /**
   * @param {'historical' | 'forecasted'} type - The data type to set (historical or forecasted)
   * @returns {void} Updates the data type and resets the time horizon range accordingly.
   */
  setDataType(type: 'historical' | 'forecasted'): void {
    this.dataType = type;
    const horizons = this.timeHorizons;
    const todayIdx = horizons.indexOf('Today');
    const plus3Idx = horizons.indexOf('+3 mo');
    const minus3Idx = horizons.indexOf('-3 mo');
    if (type === 'historical' && minus3Idx >= 0 && todayIdx >= 0) {
      this.timeHorizonRange = { startIndex: minus3Idx, endIndex: todayIdx };
    } else if (type === 'forecasted' && todayIdx >= 0 && plus3Idx >= 0) {
      this.timeHorizonRange = { startIndex: todayIdx, endIndex: plus3Idx };
    }
    this.updateSelectedTimeHorizon();
    this.dataTypeChange.emit(type);
  }

  /**
   * @returns {void} Updates and emits the currently selected time horizon.
   */
  private updateSelectedTimeHorizon(): void {
    const horizons = this.timeHorizons;
    const endHorizon = horizons[this.timeHorizonRange.endIndex];
    const startHorizon = horizons[this.timeHorizonRange.startIndex];

    // Derive data type implicitly from the selected range relative to "Today"
    const todayIndex = horizons.indexOf('Today');
    if (todayIndex >= 0) {
      // If the range extends into the future (beyond Today), treat as forecasted;
      // otherwise treat as historical.
      this.dataType = this.timeHorizonRange.endIndex > todayIndex ? 'forecasted' : 'historical';
      this.dataTypeChange.emit(this.dataType);
    }

    // Emit the end value (right handle) as the selected time horizon (for backward compatibility)
    this.selectedTimeHorizon = endHorizon;
    this.timeHorizonChange.emit(endHorizon);
    // Also emit the range for components that need both start and end
    this.timeHorizonRangeChange.emit({ start: startHorizon, end: endHorizon });
  }

  /**
   * @param {MouseEvent | TouchEvent} event - The mouse or touch event that initiated the drag
   * @param {'start' | 'end'} type - The type of time horizon drag handle being dragged
   * @returns {void} Starts dragging for the specified time horizon handle.
   */
  startTimeHorizonDrag(event: MouseEvent | TouchEvent, type: 'start' | 'end') {
    event.preventDefault();
    event.stopPropagation();
    this.isTimeHorizonDragging = true;
    this.timeHorizonHasDragged = false;
    this.timeHorizonDragType = type;
    if (typeof document !== 'undefined' && document.body) document.body.classList.add('time-horizon-dragging');
    // Store container: prefer ViewChild so drag always works
    if (this.timeHorizonSliderContainerFull?.nativeElement) {
      this.timeHorizonDragContainer = this.timeHorizonSliderContainerFull.nativeElement;
    } else {
      const target = event.target as HTMLElement;
      this.timeHorizonDragContainer = target?.closest('.time-horizon-slider-container, .time-horizon-slider-container-full') ?? target?.parentElement ?? null;
    }
    this.handleTimeHorizonDrag(event);
  }

  /**
   * @param {MouseEvent | TouchEvent} event - The mouse or touch click event on the time horizon track
   * @returns {void} Moves the nearest time horizon handle to the clicked position when not dragging.
   */
  onTimeHorizonTrackClick(event: MouseEvent | TouchEvent) {
    // Don't handle if user was dragging or is dragging
    if (this.timeHorizonHasDragged || this.isTimeHorizonDragging) {
      return;
    }
    const target = event.target as HTMLElement;
    // Ignore if the event target is a handle (handle has its own mousedown for drag)
    if (target?.closest?.('.time-horizon-handle')) {
      return;
    }
    // Full layout: handler is on the wrapper; ignore clicks on labels (they have their own handler)
    if (target?.closest?.('.time-horizon-labels')) {
      return;
    }
    // Avoid handling both mousedown and click for the same gesture (click fires after mousedown)
    if (event.type === 'click' && (event as MouseEvent).detail === 1) {
      const now = Date.now();
      if (this._lastTimeHorizonTrackMousedownAt != null && now - this._lastTimeHorizonTrackMousedownAt < 300) {
        return;
      }
    }
    if (event.type === 'mousedown') {
      this._lastTimeHorizonTrackMousedownAt = Date.now();
    }
    event.preventDefault();
    event.stopPropagation();
    const container = this.timeHorizonSliderContainerFull?.nativeElement ?? (event.currentTarget as HTMLElement);
    if (!container) return;
    this.applyTimeHorizonTrackClick(event, container);
  }

  /**
   * Core logic: move time horizon range to the position of the event inside the given container.
   */
  private applyTimeHorizonTrackClick(event: MouseEvent | TouchEvent, container: HTMLElement): void {
    const rect = container.getBoundingClientRect();
    let clientX: number;
    if ('touches' in event || 'changedTouches' in event) {
      const touchEvent = event as TouchEvent;
      clientX = touchEvent.changedTouches?.[0]?.clientX ?? touchEvent.touches?.[0]?.clientX ?? 0;
    } else {
      clientX = (event as MouseEvent).clientX;
    }
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 1024;
    const x = clientX - rect.left;
    let trackWidth: number;
    let xAdjusted = x;
    if (isMobile) {
      const padding = 6;
      xAdjusted = x - padding;
      trackWidth = rect.width - padding * 2;
      xAdjusted = Math.max(0, Math.min(xAdjusted, trackWidth));
    } else {
      trackWidth = rect.width > 0 ? rect.width : this.timeHorizonSliderTrackWidth;
    }
    const percentage = Math.max(0, Math.min(100, (xAdjusted / trackWidth) * 100));
    const numSteps = this.timeHorizons.length - 1;
    const stepIndex = Math.round((percentage / 100) * numSteps);
    const clickedIndex = Math.max(0, Math.min(numSteps, stepIndex));
    const startDistance = Math.abs(clickedIndex - this.timeHorizonRange.startIndex);
    const endDistance = Math.abs(clickedIndex - this.timeHorizonRange.endIndex);

    if (startDistance <= endDistance) {
      // Move start handle, but keep at least one step between start and end
      this.timeHorizonRange.startIndex = Math.min(clickedIndex, this.timeHorizonRange.endIndex - 1);
    } else {
      // Move end handle, but keep at least one step between start and end
      this.timeHorizonRange.endIndex = Math.max(clickedIndex, this.timeHorizonRange.startIndex + 1);
    }
    this.updateSelectedTimeHorizon();
  }

  /**
   * Handles clicks on time horizon labels to directly set the range.
   * @param index - The index of the clicked label
   * @param event - The click event
   * @returns {void}
   */
  onTimeHorizonLabelClick(index: number, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    
    // Don't handle clicks if user was dragging
    if (this.timeHorizonHasDragged || this.isTimeHorizonDragging) {
      return;
    }
    
    const numSteps = this.timeHorizons.length - 1;
    const clickedIndex = Math.max(0, Math.min(numSteps, index));
    
    // Determine which handle is closer to the clicked label
    const startDistance = Math.abs(clickedIndex - this.timeHorizonRange.startIndex);
    const endDistance = Math.abs(clickedIndex - this.timeHorizonRange.endIndex);
    
    // Move the closer handle, or start handle if equidistant, but always keep a range
    if (startDistance <= endDistance) {
      // Move start handle, but ensure it stays at least one step before end
      this.timeHorizonRange.startIndex = Math.min(clickedIndex, this.timeHorizonRange.endIndex - 1);
    } else {
      // Move end handle, but ensure it stays at least one step after start
      this.timeHorizonRange.endIndex = Math.max(clickedIndex, this.timeHorizonRange.startIndex + 1);
    }
    
    this.updateSelectedTimeHorizon();
  }

  /**
   * @param {MouseEvent | TouchEvent} event - The mouse or touch event during time horizon dragging
   * @returns {void} Updates the time horizon range while the user drags a handle.
   */
  private handleTimeHorizonDrag(event: MouseEvent | TouchEvent) {
    const container = this.timeHorizonDragContainer
      ?? this.timeHorizonSliderContainer?.nativeElement
      ?? (this.timeHorizonSliderContainerFull?.nativeElement)
      ?? null;
    if (!this.timeHorizonDragType || !container) return;

    const rect = container.getBoundingClientRect();
    const clientX = 'touches' in event ? event.touches[0]?.clientX : (event as MouseEvent).clientX;
    if (clientX == null) return;
    const x = clientX - rect.left;
    // Use actual container width
    const trackWidth = rect.width > 0 ? rect.width : this.timeHorizonSliderTrackWidth;
    const percentage = Math.max(0, Math.min(100, (x / trackWidth) * 100));
    
    // Calculate which index this percentage corresponds to
    const numSteps = this.timeHorizons.length - 1;
    const stepIndex = Math.round((percentage / 100) * numSteps);
    const clampedIndex = Math.max(0, Math.min(numSteps, stepIndex));

    if (this.timeHorizonDragType === 'start') {
      // Ensure start is at least one step before end
      this.timeHorizonRange.startIndex = Math.min(clampedIndex, this.timeHorizonRange.endIndex - 1);
    } else {
      // Ensure end is at least one step after start
      this.timeHorizonRange.endIndex = Math.max(clampedIndex, this.timeHorizonRange.startIndex + 1);
    }
    
    this.timeHorizonHasDragged = true;
    this.updateSelectedTimeHorizon();
  }

  /**
   * @param {'start' | 'end'} type - The type of time horizon handle (start or end)
   * @returns {number} The pixel position of the requested time horizon handle.
   */
  getTimeHorizonHandlePosition(type: 'start' | 'end'): number {
    const index = type === 'start' ? this.timeHorizonRange.startIndex : this.timeHorizonRange.endIndex;
    const numSteps = this.timeHorizons.length - 1;
    
    // Check if on mobile/tablet (screen width <= 1024px)
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 1024;
    
    // On mobile, use actual container width (track is now 100% width minus padding, no compression)
    if (isMobile) {
      // Try to get actual container width from ViewChild if available
      let containerWidth = 400; // Default fallback
      if (this.timeHorizonSliderContainer?.nativeElement) {
        const rect = this.timeHorizonSliderContainer.nativeElement.getBoundingClientRect();
        containerWidth = rect.width || 400;
      } else if (typeof window !== 'undefined') {
        // Estimate: container is viewport width minus padding (typically 20px on each side on mobile)
        containerWidth = window.innerWidth - 40;
      }
      
      // Account for 6px padding on each side (12px total) for mobile
      const trackWidth = containerWidth - 12;
      const padding = 6;
      
      // Position within the track (between padding), then add padding offset
      return padding + (index / numSteps) * trackWidth;
    }
    
    // Desktop: use actual container width so handles match track
    const trackWidth = this.timeHorizonSliderContainer?.nativeElement
      ? Math.max(0, this.timeHorizonSliderContainer.nativeElement.getBoundingClientRect().width) || this.timeHorizonSliderTrackWidth
      : this.timeHorizonSliderTrackWidth;
    return (index / numSteps) * trackWidth;
  }

  /**
   * @returns {number} The pixel offset for the left edge of the active time horizon range.
   */
  getTimeHorizonActiveTrackLeft(): number {
    const numSteps = this.timeHorizons.length - 1;
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 1024;
    
    // On mobile, use actual container width (track is now 100% width minus padding)
    if (isMobile) {
      let containerWidth = 400;
      if (this.timeHorizonSliderContainer?.nativeElement) {
        const rect = this.timeHorizonSliderContainer.nativeElement.getBoundingClientRect();
        containerWidth = rect.width || 400;
      } else if (typeof window !== 'undefined') {
        containerWidth = window.innerWidth - 40;
      }
      const trackWidth = containerWidth - 12;
      const padding = 6;
      return padding + (this.timeHorizonRange.startIndex / numSteps) * trackWidth;
    }
    
    const trackWidth = this.timeHorizonSliderContainer?.nativeElement
      ? Math.max(0, this.timeHorizonSliderContainer.nativeElement.getBoundingClientRect().width) || this.timeHorizonSliderTrackWidth
      : this.timeHorizonSliderTrackWidth;
    return (this.timeHorizonRange.startIndex / numSteps) * trackWidth;
  }

  /**
   * @returns {number} The pixel width of the active time horizon range.
   */
  getTimeHorizonActiveTrackWidth(): number {
    const numSteps = this.timeHorizons.length - 1;
    const range = this.timeHorizonRange.endIndex - this.timeHorizonRange.startIndex;
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 1024;
    
    // On mobile, use actual container width (track is now 100% width minus padding)
    if (isMobile) {
      let containerWidth = 400;
      if (this.timeHorizonSliderContainer?.nativeElement) {
        const rect = this.timeHorizonSliderContainer.nativeElement.getBoundingClientRect();
        containerWidth = rect.width || 400;
      } else if (typeof window !== 'undefined') {
        containerWidth = window.innerWidth - 40;
      }
      const trackWidth = containerWidth - 12;
      return (range / numSteps) * trackWidth;
    }
    
    const trackWidth = this.timeHorizonSliderContainer?.nativeElement
      ? Math.max(0, this.timeHorizonSliderContainer.nativeElement.getBoundingClientRect().width) || this.timeHorizonSliderTrackWidth
      : this.timeHorizonSliderTrackWidth;
    return (range / numSteps) * trackWidth;
  }

  /**
   * Handles click on info buttons to toggle tooltips.
   * @param tooltipType - The type of tooltip to toggle
   * @param ev - The event object to stop propagation
   * @returns {void}
   */
  onInfoClick(tooltipType: 'aiConfidence' | 'timeHorizon' | 'minFlowValue' | 'investorGroup' | 'productGroup', ev: Event): void {
    ev.stopPropagation();
    if (this.openTooltip === tooltipType) {
      this.openTooltip = null;
    } else {
      // Close filter dropdown tooltips when opening a filters-bar tooltip
      if (this.openFilterDropdownTooltip !== null) {
        this.closeAllFilterDropdownTooltips = true;
        setTimeout(() => {
          this.closeAllFilterDropdownTooltips = false;
        }, 0);
        this.openFilterDropdownTooltip = null;
      }
      this.openTooltip = tooltipType;
    }
  }

  /**
   * Handles tooltip open/close events from filter dropdown components.
   * Closes other tooltips when one opens.
   * @param dropdownTitle - The title of the dropdown that triggered the event
   * @param isOpen - Whether the tooltip is open
   * @returns {void}
   */
  onFilterDropdownTooltipChange(dropdownTitle: string, isOpen: boolean): void {
    if (isOpen) {
      // Close filters-bar tooltips when a filter dropdown tooltip opens
      this.openTooltip = null;
      // Close whichever dropdown option list is open so we don't have dropdown list + info open at once
      this.openDropdown = null;
      // Track which dropdown has an open tooltip
      this.openFilterDropdownTooltip = dropdownTitle;
    } else {
      // Clear tracking when tooltip closes
      if (this.openFilterDropdownTooltip === dropdownTitle) {
        this.openFilterDropdownTooltip = null;
      }
    }
  }


  /**
   * Checks if a specific tooltip is open.
   * @param tooltipType - The type of tooltip to check
   * @returns {boolean} True if the tooltip is open
   */
  isTooltipOpen(tooltipType: 'aiConfidence' | 'timeHorizon' | 'minFlowValue' | 'investorGroup' | 'productGroup'): boolean {
    return this.openTooltip === tooltipType;
  }

  /**
   * Gets the tooltip text for a specific tooltip type.
   * @param tooltipType - The type of tooltip
   * @returns {string} The tooltip text
   */
  getTooltipText(tooltipType: 'aiConfidence' | 'dataType' | 'timeHorizon' | 'minFlowValue' | 'investorGroup' | 'productGroup'): string {
    // switch (tooltipType) {
    //   case 'aiConfidence':
    //     return 'AI Confidence indicates the reliability of the forecasted data. Higher values represent more confident predictions.';
    //   case 'dataType':
    //     return 'Choose between Historical data (past performance) or Forecasted data (predicted future trends).';
    //   case 'timeHorizon':
    //     return 'Select the time range for your analysis. Drag the handles to set a custom range.';
    //   default:
    //     return '';
    // }
    switch (tooltipType) {
      case 'aiConfidence':
        return 'Indicates the model’s confidence level based on data completeness, consistency, and signal strength.';
      case 'dataType':
        return 'Switch between observed market data and AI-driven forward-looking estimates.';
      case 'timeHorizon':
        return 'Adjust the time window to analyze short-term trends or long-term capital movements.';
      case 'minFlowValue':
        return 'Set the flow size band for charts. Drag the handles to raise the minimum, lower the maximum, or both.';
      case 'investorGroup':
        return 'Define the source of capital. Filter by region and investor type to understand allocator demand.';
      case 'productGroup':
        return 'Define where capital is allocated. Filter by region, asset class, and asset sub-class.';
      default:
        return '';
    }
  }
}
