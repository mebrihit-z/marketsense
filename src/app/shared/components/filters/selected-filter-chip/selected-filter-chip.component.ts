import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-selected-filter-chip',
  imports: [],
  templateUrl: './selected-filter-chip.component.html',
  styleUrl: './selected-filter-chip.component.scss'
})
export class SelectedFilterChipComponent {
  @Input() label = '';
  @Output() remove = new EventEmitter<void>();
}
