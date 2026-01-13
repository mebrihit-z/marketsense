/* eslint-disable */
import { Component, OnInit, HostListener, ViewChild, ElementRef, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import  FilterDropdownComponent,{ type FilterOption, type GroupedFilterOption } from '../filter-dropdown/filter-dropdown.component';
import { extractFilterOptionsFromExcel } from '../../../utils/excel-filter-options.util';
import { extractFilterOptionsFromAssetFlows } from '../../../utils/asset-flows-filter-options.util';
import { type AssetFlowRecord } from '../../../utils/asset-flows-to-sankey.util';

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
  imports: [CommonModule, FormsModule, FilterDropdownComponent],
  templateUrl: './filters-bar.component.html',
  styleUrl: './filters-bar.component.scss'
})
export class FiltersBarComponent implements OnInit {
  @ViewChild('sliderContainer', { static: false }) sliderContainer!: ElementRef<HTMLElement>;
  @ViewChild('timeHorizonSliderContainer', { static: false }) timeHorizonSliderContainer!: ElementRef<HTMLElement>;
  @ViewChild('filtersRoot', { static: false }) filtersRoot!: ElementRef<HTMLElement>;
  @ViewChild('productSubTypeDropdown', { static: false }) productSubTypeDropdown!: FilterDropdownComponent;
  @ViewChild('aiConfidenceInfoBtn', { static: false }) aiConfidenceInfoBtn!: ElementRef<HTMLButtonElement>;
  @ViewChild('dataTypeInfoBtn', { static: false }) dataTypeInfoBtn!: ElementRef<HTMLButtonElement>;
  @ViewChild('timeHorizonInfoBtn', { static: false }) timeHorizonInfoBtn!: ElementRef<HTMLButtonElement>;
  @ViewChild('aiConfidenceTooltip', { static: false }) aiConfidenceTooltip!: ElementRef<HTMLDivElement>;
  @ViewChild('dataTypeTooltip', { static: false }) dataTypeTooltip!: ElementRef<HTMLDivElement>;
  @ViewChild('timeHorizonTooltip', { static: false }) timeHorizonTooltip!: ElementRef<HTMLDivElement>;
  
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

  constructor(private http: HttpClient) {}
  
  aiConfidenceRange = { min: 50, max: 100 };
  isDragging = false;
  dragType: 'min' | 'max' | null = null;
  hasDragged = false; // Track if user actually dragged vs just clicked
  sliderTrackWidth = 142; // Width of the slider track in pixels
  
  // Time Horizon range slider state
  timeHorizonRange = { startIndex: 0, endIndex: 1 }; // Default: Today to +3mo for forecasted
  isTimeHorizonDragging = false;
  timeHorizonDragType: 'start' | 'end' | null = null;
  timeHorizonHasDragged = false; // Track if user actually dragged vs just clicked
  timeHorizonSliderTrackWidth = 400; // Width of the time horizon slider track in pixels
  
  // Toggle state
  dataType: 'historical' | 'forecasted' = 'forecasted';
  selectedTimeHorizon: string = 'Today';

  /**
   * @returns {void} Initializes filter state and time horizon defaults.
   */
  ngOnInit() {
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
  }

  /**
   * Loads product types, product sub-types, investor regions, investor types, and product regions 
   * dynamically from asset-flows-data.json
   * @returns {void}
   */
  private loadFilterOptionsFromAssetFlows(): void {
    this.http.get<AssetFlowRecord[]>('assets/data/asset-flows-data.json').subscribe({
      next: (data) => {
        try {
          // Extract filter options from asset flows data
          const filterOptions = extractFilterOptionsFromAssetFlows(data);
          
          // Set product types
          this.productTypeOptions = filterOptions.productTypes.map(type => ({ value: type }));
          
          // Set product sub-types grouped by product type
          this.productSubTypeOptions = filterOptions.productSubTypes.map(group => ({
            category: group.productType,
            options: group.subTypes.map(subType => ({ value: subType }))
          }));
          
          // Set investor regions
          this.investorRegionOptions = filterOptions.investorRegions.map(region => ({ value: region }));
          
          // Set investor types
          this.investorTypeOptions = filterOptions.investorTypes.map(type => ({ value: type }));
          
          // Set product regions
          this.productRegionOptions = filterOptions.productRegions.map(region => ({ value: region }));
          
          // Initialize productType selection with all options selected
          this.state.productType = filterOptions.productTypes;
          
          // Initialize productSubType selection with all options selected
          const allSubTypes = filterOptions.productSubTypes.flatMap(group => group.subTypes);
          this.state.productSubType = allSubTypes;
          
          // Initialize investorRegion selection with all options selected
          this.state.investorRegion = filterOptions.investorRegions;
          
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
        } catch (error) {
          console.error('Error extracting filter options from asset flows data:', error);
          // Fallback to empty arrays
          this.productTypeOptions = [];
          this.productSubTypeOptions = [];
          this.investorRegionOptions = [];
          this.investorTypeOptions = [];
          this.productRegionOptions = [];
          this.emitFilterOptionTotals();
        }
      },
      error: (error) => {
        console.error('Error loading asset flows data for filter options:', error);
        // Fallback to empty arrays
        this.productTypeOptions = [];
        this.productSubTypeOptions = [];
        this.investorRegionOptions = [];
        this.investorTypeOptions = [];
        this.productRegionOptions = [];
        this.emitFilterOptionTotals();
      }
    });
  }

  /**
   * Loads product types, product sub-types, and investor regions dynamically from marketsense_input_data.xlsx
   * @returns {void}
   * @deprecated Use loadFilterOptionsFromAssetFlows() instead
   */
  private loadFilterOptionsFromExcel(): void {
    this.http.get('assets/data/marketsense_input_data.xlsx', { responseType: 'arraybuffer' }).subscribe({
      next: (arrayBuffer) => {
        try {
          // Extract filter options from Excel file
          const filterOptions = extractFilterOptionsFromExcel(arrayBuffer, {
            superparentCol: 'SuperParent',
            parentCol: 'Parent',
            subassetCol: 'SubAsset'
          });
          
          // Set product types
          this.productTypeOptions = filterOptions.productTypes.map(type => ({ value: type }));
          
          // Set product sub-types grouped by product type
          this.productSubTypeOptions = filterOptions.productSubTypes.map(group => ({
            category: group.productType,
            options: group.subTypes.map(subType => ({ value: subType }))
          }));
          
          // Set investor regions
          this.investorRegionOptions = filterOptions.investorRegions.map(region => ({ value: region }));
          
          // Initialize productType selection with all options selected
          this.state.productType = filterOptions.productTypes;
          
          // Initialize productSubType selection with all options selected
          const allSubTypes = filterOptions.productSubTypes.flatMap(group => group.subTypes);
          this.state.productSubType = allSubTypes;
          
          // Initialize investorRegion selection with all options selected
          this.state.investorRegion = filterOptions.investorRegions;
          
          // Emit initial selections
          this.productTypeChange.emit(this.state.productType);
          this.productSubTypeChange.emit(this.state.productSubType);
          this.investorRegionChange.emit(this.state.investorRegion);
          this.emitFilterOptionTotals();
        } catch (error) {
          console.error('Error extracting filter options from Excel file:', error);
          // Fallback to empty arrays
          this.productTypeOptions = [];
          this.productSubTypeOptions = [];
          this.investorRegionOptions = [];
          this.emitFilterOptionTotals();
        }
      },
      error: (error) => {
        console.error('Error loading Excel file for filter options:', error);
        // Fallback to empty arrays
        this.productTypeOptions = [];
        this.productSubTypeOptions = [];
        this.investorRegionOptions = [];
        this.emitFilterOptionTotals();
      }
    });
  }

  /**
   * Emits the total counts for each filter option group so other components can
   * display selected/total badges (e.g., Flow Dimensions chips).
   */
  private emitFilterOptionTotals(): void {
    const productSubTypeTotal = this.productSubTypeOptions.reduce((sum, group) => {
      return sum + (group.options?.length || 0);
    }, 0);

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
    const selectedIndex = horizons.indexOf(this.selectedTimeHorizon);
    if (selectedIndex >= 0) {
      // Set range from start (Today/First option) to selected index
      this.timeHorizonRange = { startIndex: 0, endIndex: selectedIndex || 1 };
    } else {
      // Default: Today to first option (+3mo for forecasted)
      this.timeHorizonRange = { startIndex: 0, endIndex: 1 };
    }
    // Always emit the initial range
    this.updateSelectedTimeHorizon();
  }

  // Filter options loaded from asset-flows-data.json
  investorRegionOptions: FilterOption[] = []; // Will be loaded from asset-flows-data.json
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
  openTooltip: 'aiConfidence' | 'dataType' | 'timeHorizon' | null = null;

  /**
   * @param {keyof typeof this.state} key - The state key to update
   * @param {string[]} values - The new values to set for the state key
   * @returns {void} Updates internal state and emits changes for specific filter groups.
   */
  onChange(key: keyof typeof this.state, values: string[]) {
    const previousValues = [...this.state[key]];
    this.state[key] = values;
    
    // Hide "Select All Filters" button when any filter is manually selected
    if (values.length > 0) {
      this.showSelectAll = false;
    }
    
    // Handle product type changes - deselect related sub-types when product type is deselected
    if (key === 'productType') {
      this.handleProductTypeChange(previousValues, values);
      this.productTypeChange.emit(values);
    } else if (key === 'productSubType') {
      this.productSubTypeChange.emit(values);
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
      // Close all other dropdowns when one opens
      this.openDropdown = dropdownKey;
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
      const allSubTypes = this.productSubTypeOptions.flatMap(group => group.options.map(opt => opt.value));
      this.state.productSubType = allSubTypes;
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
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    // Don't close if we're dragging sliders
    if (this.isDragging || this.isTimeHorizonDragging) {
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
      } else if (this.openTooltip === 'dataType') {
        clickedInside = this.dataTypeTooltip?.nativeElement?.contains(target) ||
                       this.dataTypeInfoBtn?.nativeElement?.contains(target);
      } else if (this.openTooltip === 'timeHorizon') {
        clickedInside = this.timeHorizonTooltip?.nativeElement?.contains(target) ||
                       this.timeHorizonInfoBtn?.nativeElement?.contains(target);
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
    // Track starts at left: 0 within the container, so we use track width directly
    const percentage = Math.max(0, Math.min(100, (x / this.sliderTrackWidth) * 100));

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
    const percentage = Math.max(0, Math.min(100, (x / this.sliderTrackWidth) * 100));
    
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
    return this.dataType === 'historical' 
      ? ['-18 mo', '-12 mo', '-9 mo', '-6 mo', '-3 mo', 'Today']
      : ['Today', '+3 mo', '+6 mo', '+9 mo', '+12 mo', '+18 mo'];
  }

  /**
   * @param {'historical' | 'forecasted'} type - The data type to set (historical or forecasted)
   * @returns {void} Updates the data type and resets the time horizon range accordingly.
   */
  setDataType(type: 'historical' | 'forecasted'): void {
    this.dataType = type;
    // Reset time horizon range based on data type
    if (type === 'historical') {
      // For historical: Today (index 5) to -3 mo (index 4)
      this.timeHorizonRange = { startIndex: 4, endIndex: 5 };
    } else {
      // For forecasted: Today (index 0) to +3 mo (index 1)
      this.timeHorizonRange = { startIndex: 0, endIndex: 1 };
    }
    this.updateSelectedTimeHorizon();
    this.dataTypeChange.emit(type);
  }

  /**
   * @returns {void} Updates and emits the currently selected time horizon.
   */
  private updateSelectedTimeHorizon(): void {
    // Emit the end value (right handle) as the selected time horizon (for backward compatibility)
    const endHorizon = this.timeHorizons[this.timeHorizonRange.endIndex];
    const startHorizon = this.timeHorizons[this.timeHorizonRange.startIndex];
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
    this.handleTimeHorizonDrag(event);
  }

  /**
   * @param {MouseEvent | TouchEvent} event - The mouse or touch click event on the time horizon track
   * @returns {void} Moves the nearest time horizon handle to the clicked position when not dragging.
   */
  onTimeHorizonTrackClick(event: MouseEvent | TouchEvent) {
    // Don't handle clicks if user was dragging
    if (this.timeHorizonHasDragged || this.isTimeHorizonDragging) {
      return;
    }
    
    event.stopPropagation();
    if (!this.timeHorizonSliderContainer) return;

    const rect = this.timeHorizonSliderContainer.nativeElement.getBoundingClientRect();
    let clientX: number;
    if ('touches' in event || 'changedTouches' in event) {
      const touchEvent = event as TouchEvent;
      clientX = touchEvent.changedTouches?.[0]?.clientX || touchEvent.touches?.[0]?.clientX || 0;
    } else {
      clientX = (event as MouseEvent).clientX;
    }
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / this.timeHorizonSliderTrackWidth) * 100));
    
    // Calculate which index this percentage corresponds to
    const numSteps = this.timeHorizons.length - 1;
    const stepIndex = Math.round((percentage / 100) * numSteps);
    const clickedIndex = Math.max(0, Math.min(numSteps, stepIndex));
    
    // Determine which handle is closer to the click position
    const startDistance = Math.abs(clickedIndex - this.timeHorizonRange.startIndex);
    const endDistance = Math.abs(clickedIndex - this.timeHorizonRange.endIndex);
    
    // Move the closer handle, or start handle if equidistant
    if (startDistance <= endDistance) {
      // Move start handle, but ensure it doesn't go past end
      this.timeHorizonRange.startIndex = Math.min(clickedIndex, this.timeHorizonRange.endIndex);
    } else {
      // Move end handle, but ensure it doesn't go before start
      this.timeHorizonRange.endIndex = Math.max(clickedIndex, this.timeHorizonRange.startIndex);
    }
    
    this.updateSelectedTimeHorizon();
  }

  /**
   * @param {MouseEvent | TouchEvent} event - The mouse or touch event during time horizon dragging
   * @returns {void} Updates the time horizon range while the user drags a handle.
   */
  private handleTimeHorizonDrag(event: MouseEvent | TouchEvent) {
    if (!this.timeHorizonDragType || !this.timeHorizonSliderContainer) return;

    const rect = this.timeHorizonSliderContainer.nativeElement.getBoundingClientRect();
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / this.timeHorizonSliderTrackWidth) * 100));
    
    // Calculate which index this percentage corresponds to
    const numSteps = this.timeHorizons.length - 1;
    const stepIndex = Math.round((percentage / 100) * numSteps);
    const clampedIndex = Math.max(0, Math.min(numSteps, stepIndex));

    if (this.timeHorizonDragType === 'start') {
      // Ensure start is not greater than end
      this.timeHorizonRange.startIndex = Math.min(clampedIndex, this.timeHorizonRange.endIndex);
    } else {
      // Ensure end is not less than start
      this.timeHorizonRange.endIndex = Math.max(clampedIndex, this.timeHorizonRange.startIndex);
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
    return (index / numSteps) * this.timeHorizonSliderTrackWidth;
  }

  /**
   * @returns {number} The pixel offset for the left edge of the active time horizon range.
   */
  getTimeHorizonActiveTrackLeft(): number {
    const numSteps = this.timeHorizons.length - 1;
    return (this.timeHorizonRange.startIndex / numSteps) * this.timeHorizonSliderTrackWidth;
  }

  /**
   * @returns {number} The pixel width of the active time horizon range.
   */
  getTimeHorizonActiveTrackWidth(): number {
    const numSteps = this.timeHorizons.length - 1;
    const range = this.timeHorizonRange.endIndex - this.timeHorizonRange.startIndex;
    return (range / numSteps) * this.timeHorizonSliderTrackWidth;
  }

  /**
   * Handles click on info buttons to toggle tooltips.
   * @param tooltipType - The type of tooltip to toggle
   * @param ev - The event object to stop propagation
   * @returns {void}
   */
  onInfoClick(tooltipType: 'aiConfidence' | 'dataType' | 'timeHorizon', ev: Event): void {
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
  isTooltipOpen(tooltipType: 'aiConfidence' | 'dataType' | 'timeHorizon'): boolean {
    return this.openTooltip === tooltipType;
  }

  /**
   * Gets the tooltip text for a specific tooltip type.
   * @param tooltipType - The type of tooltip
   * @returns {string} The tooltip text
   */
  getTooltipText(tooltipType: 'aiConfidence' | 'dataType' | 'timeHorizon'): string {
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
      default:
        return '';
    }
  }
}
