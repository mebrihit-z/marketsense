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
import {
  SavedViewsService,
  type SavedView,
  type SavedChartHierarchyDimensions,
} from '../../../../core/services/saved-views.service';
import UserProfileService from '../../../services/user-profile.service';
import { MinFlowRangeSliderComponent } from '../../min-flow-range-slider/min-flow-range-slider.component';
import {
  TimeHorizonSliderComponent,
  type TimeHorizonRangeIndices,
} from '../../time-horizon-slider/time-horizon-slider.component';
import {
  LEGACY_UNIFIED_TIME_HORIZONS,
  UNIFIED_TIME_HORIZONS,
} from '../../../constants/time-horizons.constants';
import {
  MIN_FLOW_VALUE_OPTIONS,
  MIN_FLOW_VALUE_OPTIONS_VERSION,
  migrateMinFlowRangeIndicesV1ToV2,
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
  imports: [
    CommonModule,
    FormsModule,
    FilterDropdownComponent,
    SaveFilterSetModalComponent,
    MinFlowRangeSliderComponent,
    TimeHorizonSliderComponent,
  ],
  templateUrl: './filters-bar.component.html',
  styleUrl: './filters-bar.component.scss',
  /** Declared in metadata so parent templates always resolve bindings (strictTemplates + language service). */
  inputs: ['stickyEngaged', 'assetFlowsChartDimensions', 'assetAllocationChartDimensions'],
})
export class FiltersBarComponent implements OnInit, OnDestroy, OnChanges {
  @Input() forceCloseDropdown = 0;
  /** Latest hierarchy ids from Asset Flows (dashboard); used when saving with "include dimensions". */
  @Input() assetFlowsChartDimensions: SavedChartHierarchyDimensions | null = null;
  /** Latest hierarchy ids from Asset Allocation (dashboard). */
  @Input() assetAllocationChartDimensions: SavedChartHierarchyDimensions | null = null;
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
  @ViewChild('filtersRoot', { static: false }) filtersRoot!: ElementRef<HTMLElement>;
  @ViewChild('productSubTypeDropdown', { static: false }) productSubTypeDropdown!: FilterDropdownComponent;
  @ViewChild('aiConfidenceInfoBtn', { static: false }) aiConfidenceInfoBtn!: ElementRef<HTMLButtonElement>;
  @ViewChild('minFlowValueInfoBtn', { static: false }) minFlowValueInfoBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('aiConfidenceTooltip', { static: false }) aiConfidenceTooltip!: ElementRef<HTMLDivElement>;
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

  onTimeHorizonRangeFromSlider(r: TimeHorizonRangeIndices): void {
    this.timeHorizonRange = { ...r };
  }

  onTimeHorizonEndFromSlider(end: string): void {
    this.selectedTimeHorizon = end;
    this.timeHorizonChange.emit(end);
  }

  onTimeHorizonInferredDataType(t: 'historical' | 'forecasted'): void {
    this.dataType = t;
    this.dataTypeChange.emit(t);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['forceCloseDropdown'] && changes['forceCloseDropdown'].currentValue > 0) {
      this.openDropdown = null;
    }
    const se = changes['stickyEngaged'];
    if (se && se.previousValue === false && se.currentValue === true) {
      // On entering sticky mode, default to compact CTA.
      this.collapseStickyBar();
    }
  }

  toggleStickyBarCollapse(): void {
    this.stickyBarCollapsed = !this.stickyBarCollapsed;
    if (this.stickyBarCollapsed) this.collapseStickyBar();
  }
  
  aiConfidenceRange = { min: 50, max: 100 };
  isDragging = false;
  dragType: 'min' | 'max' | null = null;
  hasDragged = false; // Track if user actually dragged vs just clicked
  sliderTrackWidth = 142; // Width of the slider track in pixels (normal)
  
  /** Indices into {@link UNIFIED_TIME_HORIZONS} (default = 0 → +3 mo). */
  timeHorizonRange: TimeHorizonRangeIndices = { startIndex: 6, endIndex: 7 };

  /** VDI: sync user preference only after OAuth `sub` is available (avoids duplicate API users). */
  private userPreferenceSyncSub?: Subscription;
  
  // Toggle state
  dataType: 'historical' | 'forecasted' = 'forecasted';
  selectedTimeHorizon: string = '+3 mo';

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
  }

  ngOnDestroy(): void {
    this.userPreferenceSyncSub?.unsubscribe();
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

          this.refreshFilteredProductSubTypeOptions();
          
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
          this.refreshFilteredProductSubTypeOptions();
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
        this.refreshFilteredProductSubTypeOptions();
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
    const horizons = UNIFIED_TIME_HORIZONS;
    const anchorIdx = horizons.indexOf('0');
    const plus3Idx = horizons.indexOf('+3 mo');
    const minus3Idx = horizons.indexOf('-3 mo');

    if (this.dataType === 'historical' && minus3Idx >= 0 && anchorIdx >= 0) {
      this.timeHorizonRange = { startIndex: minus3Idx, endIndex: anchorIdx };
    } else if (anchorIdx >= 0 && plus3Idx >= 0) {
      // Forecasted default: 0 → +3 mo
      this.timeHorizonRange = { startIndex: anchorIdx, endIndex: plus3Idx };
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
  /**
   * Sub-type groups shown in the Product Sub-Type dropdown (subset of {@link productSubTypeOptions}).
   * Must keep a stable array reference across change detection when data is unchanged; a getter that
   * returned a new array each tick caused FilterDropdown to rebuild pendingMap every cycle and broke
   * group "Deselect all" / header toggles while the panel was open.
   */
  filteredProductSubTypeOptions: GroupedFilterOption[] = [];
  private filteredProductSubTypeDeps = '';
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
   * Recomputes {@link filteredProductSubTypeOptions} only when selected product types or the loaded
   * sub-type option groups change, preserving reference stability otherwise.
   */
  private refreshFilteredProductSubTypeOptions(): void {
    const typeKey = [...(this.state.productType ?? [])].sort().join('\0');
    const optsKey = this.productSubTypeOptions.map((g) => g.category).join('\0');
    const dep = `${optsKey}|${typeKey}`;
    if (dep === this.filteredProductSubTypeDeps) {
      return;
    }
    this.filteredProductSubTypeDeps = dep;
    const selectedTypes = this.state.productType;
    if (!selectedTypes?.length) {
      this.filteredProductSubTypeOptions = [];
      return;
    }
    const typeSet = new Set(selectedTypes);
    this.filteredProductSubTypeOptions = this.productSubTypeOptions.filter((g) =>
      typeSet.has(g.category)
    );
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
      this.refreshFilteredProductSubTypeOptions();
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
    this.refreshFilteredProductSubTypeOptions();
    
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

    this.refreshFilteredProductSubTypeOptions();
    
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
  onSaveFilterSet(payload: {
    name: string;
    isDefault: boolean;
    includeChartDimensions: boolean;
  }): void {
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
        start: UNIFIED_TIME_HORIZONS[this.timeHorizonRange.startIndex],
        end: UNIFIED_TIME_HORIZONS[this.timeHorizonRange.endIndex],
      },
      timeHorizonAxisVersion: 2,
      selectedTimeHorizon: this.selectedTimeHorizon,
      aiConfidenceRange: { ...this.aiConfidenceRange },
      minFlowRange: { ...this.minFlowRange },
      minFlowValueOptionsVersion: MIN_FLOW_VALUE_OPTIONS_VERSION,
    };

    if (payload.includeChartDimensions) {
      const chartDimensions: NonNullable<SavedView['chartDimensions']> = {};
      if (this.assetFlowsChartDimensions) {
        chartDimensions.assetFlows = { ...this.assetFlowsChartDimensions };
      }
      if (this.assetAllocationChartDimensions) {
        chartDimensions.assetAllocation = { ...this.assetAllocationChartDimensions };
      }
      if (chartDimensions.assetFlows || chartDimensions.assetAllocation) {
        savedView.chartDimensions = chartDimensions;
      }
    }

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
   * Overwrites an existing saved view using the current selections on the filters bar.
   * Triggered from Welcome section edit modal.
   */
  @HostListener('window:marketsenseEditSavedViewSelections', ['$event'])
  onEditSavedViewSelections(event: Event): void {
    const customEvent = event as CustomEvent<{ target?: SavedView; name?: string }>;
    const detail = customEvent?.detail;
    const target = detail?.target;
    if (!target) return;

    const currentUser = this.userProfileService.getuser();
    const userId = this.userProfileService.getUserId() ?? currentUser?.sub;
    const userName =
      this.userProfileService.getGivenName() ??
      currentUser?.name ??
      currentUser?.given_name;
    const role = this.userProfileService.getRoleName();
    const lastLogin = this.getCurrentLoginTimestamp();
    const nextName =
      detail?.name != null && String(detail.name).trim().length > 0
        ? String(detail.name).trim()
        : target.name;

    const updated: SavedView = {
      ...target,
      name: nextName,
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
        start: UNIFIED_TIME_HORIZONS[this.timeHorizonRange.startIndex],
        end: UNIFIED_TIME_HORIZONS[this.timeHorizonRange.endIndex],
      },
      timeHorizonAxisVersion: 2,
      selectedTimeHorizon: this.selectedTimeHorizon,
      aiConfidenceRange: { ...this.aiConfidenceRange },
      minFlowRange: { ...this.minFlowRange },
      minFlowValueOptionsVersion: MIN_FLOW_VALUE_OPTIONS_VERSION,
    };

    const chartDimensions: NonNullable<SavedView['chartDimensions']> = {};
    if (this.assetFlowsChartDimensions) {
      chartDimensions.assetFlows = { ...this.assetFlowsChartDimensions };
    }
    if (this.assetAllocationChartDimensions) {
      chartDimensions.assetAllocation = { ...this.assetAllocationChartDimensions };
    }
    if (chartDimensions.assetFlows || chartDimensions.assetAllocation) {
      updated.chartDimensions = chartDimensions;
    } else if (target.chartDimensions) {
      updated.chartDimensions = target.chartDimensions;
    }

    this.savedViewsService.saveView(updated, userId, userName, { role, lastLogin }).subscribe({
      next: () => {
        if (typeof window !== 'undefined') {
          try {
            window.dispatchEvent(new CustomEvent('marketsenseSavedViewsUpdated'));
          } catch {
            // ignore
          }
        }
      },
      error: (e) => {
        console.error('Failed to update saved view selections', e);
      },
    });
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

    this.refreshFilteredProductSubTypeOptions();

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
      const horizons = UNIFIED_TIME_HORIZONS;
      const startLabel = labels.start as string | undefined;
      const endLabel = labels.end as string | undefined;
      const mapSaved = (l: string) => (l.trim() === 'Today' ? '0' : l.trim());
      const startIndex = startLabel != null ? horizons.indexOf(mapSaved(startLabel)) : -1;
      const endIndex = endLabel != null ? horizons.indexOf(mapSaved(endLabel)) : -1;
      if (startIndex >= 0 && endIndex >= startIndex) {
        this.timeHorizonRange = { startIndex, endIndex };
        this.updateSelectedTimeHorizon();
      }
    } else if (detail.timeHorizonRange && typeof detail.timeHorizonRange === 'object') {
      // Fallback for older saved views that only have indices.
      let { startIndex, endIndex } = detail.timeHorizonRange;
      const horizons = UNIFIED_TIME_HORIZONS;
      const axisVersion = (detail as { timeHorizonAxisVersion?: number }).timeHorizonAxisVersion;
      if (axisVersion !== 2) {
        const legacy = LEGACY_UNIFIED_TIME_HORIZONS;
        if (
          typeof startIndex === 'number' &&
          typeof endIndex === 'number' &&
          startIndex >= 0 &&
          endIndex >= startIndex &&
          endIndex < legacy.length
        ) {
          const mapSaved = (l: string) => (l.trim() === 'Today' ? '0' : l.trim());
          const startLabel = mapSaved(legacy[startIndex]);
          const endLabel = mapSaved(legacy[endIndex]);
          const ns = horizons.indexOf(startLabel);
          const ne = horizons.indexOf(endLabel);
          if (ns >= 0 && ne >= ns) {
            startIndex = ns;
            endIndex = ne;
          }
        }
      }
      if (
        typeof startIndex === 'number' &&
        typeof endIndex === 'number' &&
        startIndex >= 0 &&
        endIndex >= startIndex &&
        endIndex < horizons.length
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

    let mfr = detail.minFlowRange as { startIndex: number; endIndex: number } | undefined;
    const mfVer = (detail as { minFlowValueOptionsVersion?: number }).minFlowValueOptionsVersion;
    if (
      mfr &&
      typeof mfr === 'object' &&
      typeof mfr.startIndex === 'number' &&
      typeof mfr.endIndex === 'number' &&
      (mfVer == null || mfVer < MIN_FLOW_VALUE_OPTIONS_VERSION)
    ) {
      mfr = migrateMinFlowRangeIndicesV1ToV2(mfr);
    }
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

    const chartDims = detail.chartDimensions;
    if (
      chartDims &&
      typeof chartDims === 'object' &&
      (chartDims.assetFlows || chartDims.assetAllocation)
    ) {
      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(
            new CustomEvent('marketsenseApplyChartDimensions', { detail: chartDims })
          );
        } catch {
          // ignore
        }
      }
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
   * @returns {void} Handles drag events for the AI confidence slider.
   */
  @HostListener('document:mousemove', ['$event'])
  @HostListener('document:touchmove', ['$event'])
  onDrag(event: MouseEvent | TouchEvent) {
    if (this.isDragging) {
      this.handleDrag(event);
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
  }

  /**
   * Document click: close dropdowns / filters-bar tooltips when clicking outside.
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    // Don't close if we're dragging sliders
    if (
      this.isDragging ||
      document.body.classList.contains('time-horizon-dragging') ||
      document.body.classList.contains('min-flow-range-dragging')
    ) {
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
        clickedInside = !!target.closest?.(
          '.time-horizon-filter-card .info-btn, .time-horizon-filter-card .info-tooltip'
        );
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

  /**
   * @param {'historical' | 'forecasted'} type - The data type to set (historical or forecasted)
   * @returns {void} Updates the data type and resets the time horizon range accordingly.
   */
  setDataType(type: 'historical' | 'forecasted'): void {
    this.dataType = type;
    const horizons = UNIFIED_TIME_HORIZONS;
    const anchorIdx = horizons.indexOf('0');
    const plus3Idx = horizons.indexOf('+3 mo');
    const minus3Idx = horizons.indexOf('-3 mo');
    if (type === 'historical' && minus3Idx >= 0 && anchorIdx >= 0) {
      this.timeHorizonRange = { startIndex: minus3Idx, endIndex: anchorIdx };
    } else if (type === 'forecasted' && anchorIdx >= 0 && plus3Idx >= 0) {
      this.timeHorizonRange = { startIndex: anchorIdx, endIndex: plus3Idx };
    }
    this.updateSelectedTimeHorizon();
    this.dataTypeChange.emit(type);
  }

  /**
   * @returns {void} Updates and emits the currently selected time horizon.
   */
  private updateSelectedTimeHorizon(): void {
    const horizons = UNIFIED_TIME_HORIZONS;
    const endHorizon = horizons[this.timeHorizonRange.endIndex];
    const startHorizon = horizons[this.timeHorizonRange.startIndex];

    // Derive data type implicitly from the selected range relative to anchor "0"
    const anchorIndex = horizons.indexOf('0');
    if (anchorIndex >= 0) {
      // If the range extends beyond the anchor, treat as forecasted; otherwise historical.
      this.dataType = this.timeHorizonRange.endIndex > anchorIndex ? 'forecasted' : 'historical';
      this.dataTypeChange.emit(this.dataType);
    }

    // Emit the end value (right handle) as the selected time horizon (for backward compatibility)
    this.selectedTimeHorizon = endHorizon;
    this.timeHorizonChange.emit(endHorizon);
    // Also emit the range for components that need both start and end
    this.timeHorizonRangeChange.emit({ start: startHorizon, end: endHorizon });
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

  /** Whether pinned selected-filter chips should be shown. */
  hasPinnedSelectedFilters(): boolean {
    return (
      (this.state.investorRegion?.length ?? 0) > 0 ||
      (this.state.investorType?.length ?? 0) > 0 ||
      (this.state.productRegion?.length ?? 0) > 0 ||
      (this.state.productType?.length ?? 0) > 0
    );
  }

  /** Opens a filter dropdown from its pinned chip. */
  openFromPinned(key: 'investorRegion' | 'investorType' | 'productRegion' | 'productType'): void {
    this.openTooltip = null;
    this.openFilterDropdownTooltip = null;
    this.openDropdown = key;
    this.filterDropdownOpened.emit();
  }

  /** Compact human-readable summary for a pinned chip. */
  getPinnedSummary(key: 'investorRegion' | 'investorType' | 'productRegion' | 'productType'): string {
    const selected = this.state[key] ?? [];
    const options = this.getPinnedOptions(key);
    const total = options.length;

    if (selected.length === 0) return 'None';
    if (total > 0 && selected.length >= total) return 'All';

    const labels = selected
      .map((value) => this.getOptionLabel(options, value))
      .filter((label) => label.trim().length > 0);

    if (labels.length === 0) return `${selected.length} selected`;

    // Keep chip previews compact to avoid footer overflow into action buttons.
    const maxShown = 1;
    const shown = labels.slice(0, maxShown);
    const remaining = labels.length - shown.length;
    return remaining > 0 ? `${shown.join(', ')} +${remaining}` : shown.join(', ');
  }

  /** Full hover text for pinned chips (shows complete selected list). */
  getPinnedHoverText(key: 'investorRegion' | 'investorType' | 'productRegion' | 'productType'): string {
    const selected = this.state[key] ?? [];
    const options = this.getPinnedOptions(key);
    const total = options.length;

    if (selected.length === 0) return 'None selected';
    if (total > 0 && selected.length >= total) return 'All selected';

    const labels = selected
      .map((value) => this.getOptionLabel(options, value))
      .filter((label) => label.trim().length > 0);

    return labels.length > 0 ? labels.join(', ') : `${selected.length} selected`;
  }

  /** Full selected values for the custom hover list (column layout). */
  getPinnedHoverValues(key: 'investorRegion' | 'investorType' | 'productRegion' | 'productType'): string[] {
    const selected = this.state[key] ?? [];
    const options = this.getPinnedOptions(key);
    const total = options.length;

    if (selected.length === 0) return ['None selected'];
    if (total > 0 && selected.length >= total) {
      const allLabels = options
        .map((option) => this.getOptionLabel(options, option.value))
        .filter((label) => label.trim().length > 0);
      return allLabels.length > 0 ? allLabels : ['All selected'];
    }

    const labels = selected
      .map((value) => this.getOptionLabel(options, value))
      .filter((label) => label.trim().length > 0);

    return labels.length > 0 ? labels : [`${selected.length} selected`];
  }

  private getPinnedOptions(key: 'investorRegion' | 'investorType' | 'productRegion' | 'productType'): FilterOption[] {
    switch (key) {
      case 'investorRegion':
        return this.investorRegionOptions ?? [];
      case 'investorType':
        return this.investorTypeOptions ?? [];
      case 'productRegion':
        return this.productRegionOptions ?? [];
      case 'productType':
        return this.productTypeOptions ?? [];
      default:
        return [];
    }
  }

  private getOptionLabel(options: FilterOption[], value: string): string {
    const match = options.find((option) => option.value === value);
    return match?.label ?? match?.value ?? value;
  }

  private collapseStickyBar(): void {
    this.stickyBarCollapsed = true;
    this.openDropdown = null;
    this.openTooltip = null;
  }
}
