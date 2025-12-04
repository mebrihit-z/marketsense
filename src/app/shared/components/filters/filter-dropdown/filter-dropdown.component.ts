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
  
  get flatOptions(): FilterOption[] {
    if (this.isGrouped) {
      return this.groupedOptions.flatMap(group => group.options);
    }
    return this.options;
  }

  ngOnInit() {
    this.rebuildMap();
  }

  ngOnChanges() { this.rebuildMap(); }

  rebuildMap() {
    this.map = {};
    const opts = this.flatOptions;
    for (const o of opts) this.map[o.value] = this.selected?.includes(o.value) || false;
  }

  toggle(ev?: Event) {
    if (ev) ev.stopPropagation();
    this.open = !this.open;
  }

  // helpers
  onChange() { this.emitSelected(); }
  emitSelected() {
    const arr = Object.keys(this.map).filter(k => this.map[k]);
    this.selectedChange.emit(arr);
  }

  allSelected() { 
    const opts = this.flatOptions;
    return opts.length > 0 && opts.every(o => !!this.map[o.value]); 
  }

  toggleSelectAll(ev: Event) {
    ev.stopPropagation();
    const set = !this.allSelected();
    const opts = this.flatOptions;
    opts.forEach(o => this.map[o.value] = set);
    this.emitSelected();
  }

  clear(ev?: Event) { 
    ev?.stopPropagation(); 
    const opts = this.flatOptions;
    opts.forEach(o => this.map[o.value] = false); 
    this.emitSelected(); 
  }

  done(ev?: Event) { ev?.stopPropagation(); this.open = false; }

  // optional click outside handler fallback (simple)
  closeIfClickedOutside(_: Event) {
    // left intentionally empty; if you want clickOutside behavior use a directive or HostListener in parent
  }
}
