/* eslint-disable */
import { Component, EventEmitter, Input, Output  } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface FilterOption {
  value: string;
  label?: string;
}

export interface GroupedFilterOption {
  category: string;
  options: FilterOption[];
}

@Component({
  selector: 'app-filter-dropdown',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './filter-dropdown.component.html',
  styleUrl: './filter-dropdown.component.scss'
})
export default class FilterDropdownComponent {
  @Input() title = 'Filter';
  @Input() options: FilterOption[] = [];
  @Input() groupedOptions: GroupedFilterOption[] = []; // For categorized options
  @Input() selected: string[] = []; // parent's array reference
  @Input() isOpen = false; // Controlled by parent
  @Output() selectedChange = new EventEmitter<string[]>();
  @Output() openChange = new EventEmitter<boolean>(); // Emit when open state should change

  map: Record<string, boolean> = {}; // Current confirmed selections
  pendingMap: Record<string, boolean> = {}; // Pending selections (not yet applied)
  private isApplyingChanges = false; // Flag to track if we're applying changes via Done button
  
  get open(): boolean {
    return this.isOpen;
  }
  
  get isGrouped(): boolean {
    return this.groupedOptions && this.groupedOptions.length > 0;
  }
  
  /**
   * Gets the flat list of filter options, either from grouped options or regular options.
   * When `groupedOptions` are provided, this flattens all group option arrays into a single array.
   *
   * @returns The flat array of filter options.
   */
  get flatOptions(): FilterOption[] {
    if (this.isGrouped) {
      return this.groupedOptions.flatMap(group => group.options);
    }
    return this.options;
  }

  /**
   * Gets the effective map to use for display (pending if dropdown is open, confirmed otherwise).
   * @returns The map to use for checkbox states.
   */
  get displayMap(): Record<string, boolean> {
    return this.isOpen ? this.pendingMap : this.map;
  }

  /**
   * Angular lifecycle hook that initializes the component.
   *
   * @returns Nothing.
   */
  ngOnInit(): void {
    this.rebuildMap();
  }

  /**
   * Angular lifecycle hook that rebuilds the map when inputs change.
   *
   * @returns Nothing.
   */
  ngOnChanges(changes: any): void { 
    // If isOpen changed from true to false externally (not via Done), discard pending changes
    if (changes.isOpen && !changes.isOpen.firstChange) {
      const wasOpen = changes.isOpen.previousValue;
      const isNowOpen = changes.isOpen.currentValue;
      
      if (wasOpen && !isNowOpen && !this.isApplyingChanges) {
        // Dropdown was closed externally, discard pending changes
        this.pendingMap = {};
      } else if (!wasOpen && isNowOpen) {
        // Dropdown was opened, initialize pending map
        this.initializePendingMap();
      }
    }
    
    this.rebuildMap(); 
  }

  /**
   * Rebuilds the internal `map` of option values to selection state
   * based on the current `flatOptions` and `selected` values.
   *
   * @returns Nothing.
   */
  rebuildMap(): void {
    this.map = {};
    const opts = this.flatOptions;
    opts.forEach(o => {
      this.map[o.value] = this.selected?.includes(o.value) || false;
    });
    // Initialize pending map with current selections when dropdown opens
    if (this.isOpen) {
      this.initializePendingMap();
    }
  }

  /**
   * Gets the flat list of filter options, either from grouped options or regular options.
   * @returns The flat array of filter options.
   */
  // (Kept for backward-compatibility with existing documentation tools)

  /**
   * Toggles the dropdown open/closed state.
   * @param ev Optional event object to stop propagation.
   * @returns Nothing.
   */
  toggle(ev?: Event): void {
    if (ev) ev.stopPropagation();
    const willBeOpen = !this.isOpen;
    if (willBeOpen) {
      // Initialize pending map when opening
      this.initializePendingMap();
    } else {
      // Reset pending map when closing without applying
      this.pendingMap = {};
    }
    this.openChange.emit(willBeOpen);
  }

  /**
   * Initializes the pending map with current confirmed selections.
   * @returns Nothing.
   */
  private initializePendingMap(): void {
    this.pendingMap = {};
    const opts = this.flatOptions;
    opts.forEach(o => {
      this.pendingMap[o.value] = this.map[o.value] || false;
    });
  }

  // helpers
  /**
   * Handles change event for checkboxes.
   * Updates pending map but doesn't emit changes yet.
   * @returns Nothing.
   */
  onChange(): void { 
    // Only update pending map, don't emit yet
    // The pending map is already bound to the checkboxes via displayMap
  }

  /**
   * Emits the currently selected filter values from the pending map.
   * @returns Nothing.
   */
  private emitPendingSelected(): void {
    const arr = Object.keys(this.pendingMap).filter(k => this.pendingMap[k]);
    this.selectedChange.emit(arr);
  }

  /**
   * Checks if all options are currently selected (using display map).
   * @returns True if all options are selected, false otherwise.
   */
  allSelected(): boolean { 
    const opts = this.flatOptions;
    const mapToCheck = this.isOpen ? this.pendingMap : this.map;
    return opts.length > 0 && opts.every(o => !!mapToCheck[o.value]); 
  }

  /**
   * Toggles the selection state of all options in the pending map.
   * @param ev The event object to stop propagation.
   * @returns Nothing.
   */
  toggleSelectAll(ev: Event): void {
    ev.stopPropagation();
    const set = !this.allSelected();
    const opts = this.flatOptions;
    opts.forEach(o => {
      this.pendingMap[o.value] = set;
    });
  }

  /**
   * Clears all selected filter options in the pending map.
   * @param ev Optional event object to stop propagation.
   * @returns Nothing.
   */
  clear(ev?: Event): void { 
    ev?.stopPropagation(); 
    const opts = this.flatOptions;
    opts.forEach(o => {
      this.pendingMap[o.value] = false;
    }); 
  }

  /**
   * Programmatically deselects specific values in the pending map.
   * Useful for cascading deselections (e.g., deselecting sub-types when parent type is deselected).
   * @param valuesToDeselect Array of values to deselect in the pending map.
   * @returns Nothing.
   */
  deselectPendingValues(valuesToDeselect: string[]): void {
    // Initialize pending map if it's empty (in case dropdown isn't open yet)
    if (Object.keys(this.pendingMap).length === 0) {
      this.initializePendingMap();
    }
    
    valuesToDeselect.forEach(value => {
      if (this.pendingMap.hasOwnProperty(value)) {
        this.pendingMap[value] = false;
      }
    });
  }

  /**
   * Programmatically selects specific values in the pending map.
   * Useful for cascading selections (e.g., selecting sub-types when parent type is selected).
   * @param valuesToSelect Array of values to select in the pending map.
   * @returns Nothing.
   */
  selectPendingValues(valuesToSelect: string[]): void {
    // Initialize pending map if it's empty (in case dropdown isn't open yet)
    if (Object.keys(this.pendingMap).length === 0) {
      this.initializePendingMap();
    }
    
    valuesToSelect.forEach(value => {
      if (this.pendingMap.hasOwnProperty(value)) {
        this.pendingMap[value] = true;
      }
    });
  }

  /**
   * Applies pending selections and closes the dropdown.
   * @param ev Optional event object to stop propagation.
   * @returns Nothing.
   */
  done(ev?: Event): void { 
    ev?.stopPropagation();
    // Set flag to indicate we're applying changes
    this.isApplyingChanges = true;
    // Apply pending selections to confirmed map
    this.map = { ...this.pendingMap };
    // Emit the changes
    this.emitPendingSelected();
    // Close the dropdown
    this.openChange.emit(false);
    // Reset flag after a brief delay to allow ngOnChanges to process
    setTimeout(() => {
      this.isApplyingChanges = false;
    }, 0);
  }

  // optional click outside handler fallback (simple)
  /**
   * Handles clicks outside the dropdown and closes it when open.
   * Useful when paired with a clickOutside directive in the template.
   *
   * @param event The originating DOM event whose propagation will be stopped.
   * @returns Nothing.
   */
  closeIfClickedOutside(event: Event): void {
    event.stopPropagation();
    if (this.isOpen) {
      this.openChange.emit(false);
    }
  }
}
