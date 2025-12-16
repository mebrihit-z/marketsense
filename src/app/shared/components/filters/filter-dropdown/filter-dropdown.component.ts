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
export class FilterDropdownComponent {
  @Input() title = 'Filter';
  @Input() options: FilterOption[] = [];
  @Input() groupedOptions: GroupedFilterOption[] = []; // For categorized options
  @Input() selected: string[] = []; // parent's array reference
  @Output() selectedChange = new EventEmitter<string[]>();

  open = false;
  map: Record<string, boolean> = {};
  
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
  ngOnChanges(): void { 
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
    this.open = !this.open;
  }

  // helpers
  /**
   * Handles change event and emits selected values.
   * @returns Nothing.
   */
  onChange(): void { 
    this.emitSelected(); 
  }

  /**
   * Emits the currently selected filter values.
   * @returns Nothing.
   */
  emitSelected(): void {
    const arr = Object.keys(this.map).filter(k => this.map[k]);
    this.selectedChange.emit(arr);
  }

  /**
   * Checks if all options are currently selected.
   * @returns True if all options are selected, false otherwise.
   */
  allSelected(): boolean { 
    const opts = this.flatOptions;
    return opts.length > 0 && opts.every(o => !!this.map[o.value]); 
  }

  /**
   * Toggles the selection state of all options.
   * @param ev The event object to stop propagation.
   * @returns Nothing.
   */
  toggleSelectAll(ev: Event): void {
    ev.stopPropagation();
    const set = !this.allSelected();
    const opts = this.flatOptions;
    opts.forEach(o => {
      this.map[o.value] = set;
    });
    this.emitSelected();
  }

  /**
   * Clears all selected filter options.
   * @param ev Optional event object to stop propagation.
   * @returns Nothing.
   */
  clear(ev?: Event): void { 
    ev?.stopPropagation(); 
    const opts = this.flatOptions;
    opts.forEach(o => {
      this.map[o.value] = false;
    }); 
    this.emitSelected(); 
  }

  /**
   * Closes the dropdown and stops event propagation.
   * @param ev Optional event object to stop propagation.
   * @returns Nothing.
   */
  done(ev?: Event): void { 
    ev?.stopPropagation(); 
    this.open = false; 
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
    if (this.open) {
      this.open = false;
    }
  }
}
