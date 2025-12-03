import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SelectedFilterChipComponent } from '../selected-filter-chip/selected-filter-chip.component';

export interface ChipItem {
  key: string;    // filter key e.g. 'investorRegion'
  label: string;  // display text e.g. 'Investor Region: United States'
  value: string;  // underlying value e.g. 'United States'
}
@Component({
  selector: 'app-selected-filters-list',
  standalone: true,
  imports: [CommonModule, SelectedFilterChipComponent],
  templateUrl: './selected-filters-list.component.html',
  styleUrl: './selected-filters-list.component.scss'
})
export class SelectedFiltersListComponent {
  @Input() chips: ChipItem[] = [];
  @Output() remove = new EventEmitter<ChipItem>();

  onRemove(c: ChipItem) { this.remove.emit(c); }
  trackByFn(_: number, item: ChipItem) { return `${item.key}:${item.value}`; }
}
